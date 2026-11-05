//! The first-import transition against a REAL mailbox.
//!
//! `tests/import_transition.rs` proves the rule on synthetic contacts. This
//! file proves it on the mail a live IMAP server actually returns: a real
//! chunk of INBOX, parsed by the real MIME parser, written by the real
//! `upsert_contact`, with the real `bulk_import` flag.
//!
//! Gated behind `SENDPALM_E2E_NETWORK=1` and the `SENDPALM_TEST_*` credentials
//! in `app/.env`, so CI without a mailbox skips it. Read-only: the pool is
//! in-memory, the IMAP session only fetches.
//!
//! **Run serially** (`--test-threads=1`): these tests mutate process env
//! through dotenvy and hold a live connection.

use sendpalm_app_lib::services::sync_loop::{
    bucket_for_import, count_imported_senders, upsert_contact,
};
use sqlx::sqlite::SqlitePool;

fn e2e_enabled() -> bool {
    std::env::var("SENDPALM_E2E_NETWORK").is_ok()
}

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

async fn gate_candidates(pool: &SqlitePool) -> i64 {
    let (n,): (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM contacts WHERE first_seen = 1 AND screened = 0")
            .fetch_one(pool)
            .await
            .unwrap();
    n
}

#[tokio::test]
async fn a_real_mailbox_import_leaves_the_gate_empty() {
    if !e2e_enabled() {
        eprintln!("SENDPALM_E2E_NETWORK not set — skipping");
        return;
    }
    let _ = dotenvy::dotenv();
    let _ = dotenvy::from_filename("../.env");
    let Ok(creds) = sendpalm_app_lib::services::load_test_credentials() else {
        eprintln!("Test creds missing — set SENDPALM_TEST_* in .env");
        return;
    };
    sendpalm_app_lib::install_crypto_provider();

    let client = sendpalm_app_lib::services::imap::ImapClient::new(creds.clone());
    // Cursor 0 = "treat whatever comes back as history", exactly what the first
    // pass does.
    let bundle = client
        .sync("INBOX", 0)
        .await
        .expect("fetch the first INBOX chunk");
    assert!(
        !bundle.messages.is_empty(),
        "a real mailbox should return at least one message for the first chunk"
    );

    let pool = fresh_pool().await;
    let started_at = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let mut newsletters = 0usize;

    for fetched in &bundle.messages {
        let parsed = &fetched.parsed;
        let is_self = parsed.sender_email.eq_ignore_ascii_case(&creds.email);
        // The production decision for a first pass.
        let route = upsert_contact(
            &pool,
            &parsed.sender_email,
            parsed.sender_name.as_deref(),
            is_self,
            true,
        )
        .await
        .expect("upsert historical contact");
        if !is_self {
            assert!(
                route.screened,
                "historical sender {} must be pre-screened",
                parsed.sender_email
            );
            if bucket_for_import(&route, parsed.is_newsletter) == "feed" {
                newsletters += 1;
            }
        }
        // The text body must be readable prose, never markup — this is the
        // assertion that would have caught <!DOCTYPE html> in 专注回复.
        let body = parsed.body_text.trim_start();
        assert!(
            !body.starts_with("<!DOCTYPE") && !body.starts_with("<html"),
            "body_text for {} is raw HTML: {:.60}",
            parsed.sender_email,
            body
        );
    }

    assert_eq!(
        gate_candidates(&pool).await,
        0,
        "importing a real mailbox must not queue a single Screener decision"
    );
    let senders = count_imported_senders(&pool, &started_at).await.unwrap();
    assert!(
        senders > 0,
        "the import should have auto-approved at least one real sender"
    );

    eprintln!(
        "[live] {} real messages → {senders} senders auto-approved, {newsletters} filed into the Feed, 0 Gate cards",
        bundle.messages.len()
    );
}
