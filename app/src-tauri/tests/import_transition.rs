//! First-import transition — a mailbox that already has five years of mail
//! must not become five years of Screener decisions.
//!
//! The rules under test (see `docs/superpowers/plans/2026-11-05-import-transition.md`):
//!
//!   * the account's **first** sync pass writes historical senders straight to
//!     `screened = 1`, so `countGateCandidates()` returns 0 afterwards;
//!   * the **second** pass screens normally — a brand-new sender that arrives
//!     after the import is exactly what the Gate is for;
//!   * during the import exactly one bucket decision is automatic
//!     (newsletter → Feed). Receipts are NOT auto-filed: silently hiding a
//!     bill costs more trust than it saves taps.
//!
//! `tests/import_transition_gate_count` mirrors the predicate the frontend's
//! `countGateCandidates()` sends (`first_seen = 1 AND screened = 0`); the
//! frontend side of the contract is covered by
//! `src/stores/data.test.ts` (LIMIT) and `e2e/scenarios.spec.ts`.

use sendpalm_app_lib::services::sync_loop::{
    bucket_for_import, load_import_summary, persist_import_summary, upsert_contact,
    ContactRouteInfo,
};
use sqlx::sqlite::SqlitePool;

/// Production schema for the tables this test touches: `0001_init.sql` (the
/// real `contacts` DDL, including the `screened` / `first_seen` columns this
/// transition writes) plus the `app_kv` table that `ensure_schema()` creates
/// at boot. We deliberately do not run 0014's "first_seen=1 + screened=1 is
/// inconsistent" backfill against seeded rows — it is a historical migration
/// that only ever ran on pre-transition data, and running it after seeding
/// would undo exactly what we are testing.
async fn fresh_pool() -> SqlitePool {
    let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
    sqlx::raw_sql(include_str!("../migrations/0001_init.sql"))
        .execute(&pool)
        .await
        .expect("0001_init applies");
    sqlx::raw_sql(
        "CREATE TABLE IF NOT EXISTS app_kv (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )",
    )
    .execute(&pool)
    .await
    .unwrap();
    pool
}

/// The Gate's queue predicate, byte-for-byte what `countGateCandidates()`
/// sends (minus the LIMIT that only the IPC path needs).
async fn gate_candidates(pool: &SqlitePool) -> i64 {
    let (n,): (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM contacts WHERE first_seen = 1 AND screened = 0",
    )
    .fetch_one(pool)
    .await
    .unwrap();
    n
}

async fn screened_count(pool: &SqlitePool) -> i64 {
    let (n,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM contacts WHERE screened = 1")
        .fetch_one(pool)
        .await
        .unwrap();
    n
}

/// Simulate one sync pass: `senders` distinct addresses, each sending
/// `per_sender` messages. The contact upsert is the real production one; a
/// real pass would also insert the messages, but the transition lives entirely
/// in the contact write.
async fn import_pass(pool: &SqlitePool, senders: &[String], bulk_import: bool) {
    for sender in senders {
        for _ in 0..2 {
            upsert_contact(pool, sender, Some("历史发件人"), false, bulk_import)
                .await
                .unwrap();
        }
    }
}

fn senders(prefix: &str, n: usize) -> Vec<String> {
    (0..n).map(|i| format!("{prefix}{i}@example.com")).collect()
}

#[tokio::test]
async fn first_import_screens_every_historical_sender_out_of_the_gate() {
    let pool = fresh_pool().await;
    // 40 senders, 500 messages: the mailbox of someone with real history.
    let all = senders("history", 40);
    import_pass(&pool, &all, true).await;

    assert_eq!(
        screened_count(&pool).await,
        40,
        "every historical sender must be auto-screened"
    );
    assert_eq!(
        gate_candidates(&pool).await,
        0,
        "an imported mailbox must not hand the user 40 Screener decisions"
    );

    // Idempotent: a second chunk of the same pass must not resurrect them.
    import_pass(&pool, &all, true).await;
    assert_eq!(gate_candidates(&pool).await, 0);
    assert_eq!(screened_count(&pool).await, 40);
}

#[tokio::test]
async fn a_sender_who_arrives_after_the_import_still_goes_through_the_gate() {
    let pool = fresh_pool().await;
    import_pass(&pool, &senders("history", 40), true).await;
    assert_eq!(gate_candidates(&pool).await, 0);

    // Pass two: one stranger writes in.
    import_pass(&pool, &["newcomer@example.com".to_string()], false).await;

    assert_eq!(
        gate_candidates(&pool).await,
        1,
        "the Gate keeps its meaning: who may write to me from now on"
    );
    let (id,): (String,) = sqlx::query_as(
        "SELECT id FROM contacts WHERE first_seen = 1 AND screened = 0",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(
        id.contains("newcomer"),
        "the single Gate card must be the new sender, got {id}"
    );
}

#[tokio::test]
async fn a_historical_sender_keeps_their_approval_after_the_import() {
    // ON CONFLICT must only ever upgrade: a later message from someone the
    // import already screened must not push them back into the Gate.
    let pool = fresh_pool().await;
    import_pass(&pool, &["vip@example.com".to_string()], true).await;
    import_pass(&pool, &["vip@example.com".to_string()], false).await;

    let (screened, first_seen): (i64, i64) =
        sqlx::query_as("SELECT screened, first_seen FROM contacts WHERE id LIKE 'c_vip%'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!((screened, first_seen), (1, 1));
    assert_eq!(gate_candidates(&pool).await, 0);
}

#[tokio::test]
async fn the_import_reports_what_it_did() {
    let pool = fresh_pool().await;
    let summary = sendpalm_app_lib::services::ImportSummaryReport {
        messages: 3120,
        senders: 214,
        completed_at: chrono::Utc::now().to_rfc3339(),
    };
    persist_import_summary(&pool, "acct_1", &summary).await;

    assert_eq!(
        load_import_summary(&pool, "acct_1").await.unwrap(),
        Some(summary)
    );
    // An account that never imported reports nothing — the Settings row must
    // stay silent rather than print "0 封".
    assert_eq!(load_import_summary(&pool, "acct_2").await.unwrap(), None);

    // Writing twice keeps the latest tally (a resumed import rewrites it).
    persist_import_summary(
        &pool,
        "acct_1",
        &sendpalm_app_lib::services::ImportSummaryReport {
            messages: 5000,
            senders: 300,
            completed_at: chrono::Utc::now().to_rfc3339(),
        },
    )
    .await;
    assert_eq!(
        load_import_summary(&pool, "acct_1").await.unwrap().unwrap().messages,
        5000
    );
}

fn route(screened: bool, bucket: &str) -> ContactRouteInfo {
    ContactRouteInfo {
        id: "c_test".to_string(),
        screened,
        blocked: false,
        default_bucket: bucket.to_string(),
    }
}

#[test]
fn the_import_files_newsletters_into_the_feed() {
    assert_eq!(bucket_for_import(&route(true, "imbox"), true), "feed");
}

#[test]
fn the_import_does_not_file_receipts_behind_the_users_back() {
    // Keyword auto-filing is deliberately off during import: a bill that
    // silently lands in Records is a bill the user never sees.
    assert_eq!(bucket_for_import(&route(true, "imbox"), false), "imbox");
}

#[test]
fn the_import_respects_blocked_and_self_routes() {
    let blocked = ContactRouteInfo {
        id: "c_blocked".to_string(),
        screened: false,
        blocked: true,
        default_bucket: "imbox".to_string(),
    };
    assert_eq!(bucket_for_import(&blocked, true), "spam");

    // The self-contact's Sent copies keep going to the Paper Trail no matter
    // what headers the message carries.
    assert_eq!(bucket_for_import(&route(true, "paperTrail"), true), "paperTrail");
    // A sender the user already filed in Records keeps that decision.
    assert_eq!(
        bucket_for_import(&route(true, "paperTrail"), false),
        "paperTrail"
    );
    assert_eq!(bucket_for_import(&route(true, "feed"), false), "feed");
}

/* ── Post-import quiet window ─────────────────────────────────────── */

use sendpalm_app_lib::services::sync_loop::{
    inside_import_quiet_window, should_ping_os, IMPORT_QUIET_HOURS,
};

#[test]
fn a_message_from_a_person_pings_by_default() {
    assert!(should_ping_os(false, true, false, false));
    assert!(should_ping_os(true, false, true, false));
}

#[test]
fn newsletters_and_strangers_stay_silent_by_default() {
    // Not opted in, and either unscreened or a newsletter.
    assert!(!should_ping_os(false, false, false, false));
    assert!(!should_ping_os(false, true, true, false));
}

#[test]
fn the_quiet_window_silences_everything_but_the_explicit_opt_in() {
    for (notify, screened, is_newsletter) in
        [(false, true, false), (false, false, false), (false, true, true)]
    {
        assert!(
            !should_ping_os(notify, screened, is_newsletter, true),
            "quiet window must suppress notify={notify} screened={screened} newsletter={is_newsletter}"
        );
    }
    // A contact the user explicitly asked to be notified about still pings —
    // the quiet window is about noise, not about going deaf.
    assert!(should_ping_os(true, false, true, true));
}

#[test]
fn the_quiet_window_lasts_72_hours_from_the_import() {
    let done = chrono::Utc::now() - chrono::Duration::hours(1);
    let now = chrono::Utc::now();
    assert!(inside_import_quiet_window(&done.to_rfc3339(), now));

    let inside = now - chrono::Duration::hours(IMPORT_QUIET_HOURS - 1);
    assert!(inside_import_quiet_window(&inside.to_rfc3339(), now));

    let outside = now - chrono::Duration::hours(IMPORT_QUIET_HOURS + 1);
    assert!(!inside_import_quiet_window(&outside.to_rfc3339(), now));
}

#[test]
fn a_corrupt_or_future_timestamp_never_silences_the_user() {
    let now = chrono::Utc::now();
    assert!(!inside_import_quiet_window("", now));
    assert!(!inside_import_quiet_window("not a timestamp", now));
    // A clock that jumped backwards must not mute notifications forever.
    let future = now + chrono::Duration::hours(24);
    assert!(!inside_import_quiet_window(&future.to_rfc3339(), now));
}
