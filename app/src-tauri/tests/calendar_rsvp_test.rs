//! Integration tests for the calendar invite dedup / CANCEL / RSVP
//! pipeline. Uses an in-memory SQLite + the real migration set so the
//! test sees the production schema.

use sendpalm_app_lib::commands::upsert_calendar_event;
use sendpalm_app_lib::services::ical::{parse_vevent, IcalEvent};
use sendpalm_app_lib::services::parser::parse_email;
use sqlx::sqlite::SqlitePool;

const REQUEST_EML: &str = include_str!("fixtures/ical_invite.eml");
const CANCEL_EML: &str = include_str!("fixtures/ical_cancellation.eml");

/// Build the events table + run every migration up to and including
/// 0018 (which adds the iCal/RSVP columns this test relies on).
async fn fresh_pool() -> SqlitePool {
    let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();

    // Apply every migration in order, exactly as the production app does.
    // We inline the list because sqlx::migrate!() is reserved for a
    // pre-baked _sqlx_migrations table; tests want a known schema without
    // that bookkeeping.
    let migrations: &[&str] = &[
        include_str!("../migrations/0001_init.sql"),
        include_str!("../migrations/0002_calendar.sql"),
        include_str!("../migrations/0003_drafts_attachments.sql"),
        include_str!("../migrations/0004_body_html.sql"),
        include_str!("../migrations/0005_follow_up_surfaced.sql"),
        include_str!("../migrations/0006_message_direction.sql"),
        include_str!("../migrations/0007_event_end_dt.sql"),
        include_str!("../migrations/0008_drafts_from_alias.sql"),
        include_str!("../migrations/0009_search_index.sql"),
        include_str!("../migrations/0010_trash_expiry.sql"),
        include_str!("../migrations/0011_vacation_replies.sql"),
        include_str!("../migrations/0012_fix_fts_tokenizer.sql"),
        include_str!("../migrations/0013_event_all_day.sql"),
        include_str!("../migrations/0014_gate_screened_backfill.sql"),
        include_str!("../migrations/0015_file_source_message_ids.sql"),
        include_str!("../migrations/0016_sent_direction_backfill.sql"),
        include_str!("../migrations/0017_follow_up_statuses.sql"),
        include_str!("../migrations/0018_calendar_rsvp.sql"),
    ];
    for sql in migrations {
        sqlx::raw_sql(sql)
            .execute(&pool)
            .await
            .unwrap_or_else(|e| panic!("migration failed: {e}\n---\n{sql}"));
    }
    pool
}

fn event_from_request_eml() -> IcalEvent {
    let parsed = parse_email(REQUEST_EML.as_bytes()).unwrap();
    parsed.calendar_invite.expect("calendar_invite present")
}

fn event_from_cancel_eml() -> IcalEvent {
    let parsed = parse_email(CANCEL_EML.as_bytes()).unwrap();
    parsed.calendar_invite.expect("calendar_invite present")
}

#[tokio::test]
async fn request_inserts_new_event() {
    let pool = fresh_pool().await;
    let invite = event_from_request_eml();
    let id = upsert_calendar_event(&pool, &invite, Some("c_alice"))
        .await
        .expect("insert");
    assert!(id.starts_with("evt_"));

    let row: (String, String, String, String) = sqlx::query_as(
        "SELECT id, ical_uid, ical_method, organizer_email FROM events WHERE id = $1",
    )
    .bind(&id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(row.0, id);
    assert_eq!(row.1, "alice-meeting-2026-01-15@example.com");
    assert_eq!(row.2, "REQUEST");
    assert_eq!(row.3, "alice@example.com");
}

#[tokio::test]
async fn duplicate_uid_updates_existing_row_in_place() {
    let pool = fresh_pool().await;
    let invite1 = event_from_request_eml();
    let id1 = upsert_calendar_event(&pool, &invite1, Some("c_alice"))
        .await
        .unwrap();

    // Organizer resends the same invite (same UID) with SEQUENCE=1 and
    // a rescheduled time. The dedup logic must UPDATE the existing row
    // and return the SAME id, not create a second one.
    let mut invite2 = invite1.clone();
    invite2.sequence = Some(1);
    invite2.dtstart = Some("2026-02-01T10:00:00Z".to_string());
    invite2.dtend = Some("2026-02-01T11:00:00Z".to_string());
    let id2 = upsert_calendar_event(&pool, &invite2, Some("c_alice"))
        .await
        .unwrap();

    assert_eq!(id1, id2, "second insert must hit the same row");

    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM events")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 1, "no duplicates");

    let stored_seq: Option<i64> =
        sqlx::query_scalar("SELECT ical_sequence FROM events WHERE id = $1")
            .bind(&id1)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(stored_seq, Some(1));
}

#[tokio::test]
async fn stale_sequence_is_no_op() {
    let pool = fresh_pool().await;
    let invite1 = event_from_request_eml();
    let id1 = upsert_calendar_event(&pool, &invite1, Some("c_alice"))
        .await
        .unwrap();

    // Same SEQUENCE again — should be a no-op, not an UPDATE.
    let mut invite2 = invite1.clone();
    invite2.dtstart = Some("2099-01-01T10:00:00Z".to_string()); // would change
    let id2 = upsert_calendar_event(&pool, &invite2, Some("c_alice"))
        .await
        .unwrap();
    assert_eq!(id1, id2);

    let stored: (Option<i64>, String) = sqlx::query_as(
        "SELECT ical_sequence, dt FROM events WHERE id = $1",
    )
    .bind(&id1)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(stored.0, Some(0), "sequence unchanged");
    // The rescheduled date must NOT have been applied.
    assert!(!stored.1.starts_with("2099"));
}

#[tokio::test]
async fn cancel_deletes_matching_event() {
    let pool = fresh_pool().await;
    let invite = event_from_request_eml();
    let id = upsert_calendar_event(&pool, &invite, Some("c_alice"))
        .await
        .unwrap();
    assert!(
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM events")
            .fetch_one(&pool)
            .await
            .unwrap()
            == 1
    );

    // Organizer sends a CANCEL with the same UID.
    let cancel = event_from_cancel_eml();
    assert_eq!(cancel.method.as_deref(), Some("CANCEL"));
    let deleted = upsert_calendar_event(&pool, &cancel, None).await.unwrap();
    assert_eq!(deleted, "alice-meeting-2026-01-15@example.com");

    // Event row is gone.
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM events")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 0);

    // The unused `id` binding keeps the request_id reachable for diagnostics.
    let _ = id;
}

#[tokio::test]
async fn cancel_for_unknown_uid_returns_empty() {
    let pool = fresh_pool().await;
    let cancel = IcalEvent {
        uid: Some("never-existed@example.com".to_string()),
        summary: "Whatever".to_string(),
        dtstart: Some("2026-01-01T10:00:00Z".to_string()),
        dtstart_tzid: None,
        dtend: None,
        dtend_tzid: None,
        all_day: false,
        location: None,
        description: None,
        method: Some("CANCEL".to_string()),
        organizer: None,
        attendees: vec![],
        sequence: Some(0),
    };
    let r = upsert_calendar_event(&pool, &cancel, None).await.unwrap();
    assert_eq!(r, "");
}

#[tokio::test]
async fn reply_does_not_create_event() {
    let pool = fresh_pool().await;
    let mut reply = event_from_request_eml();
    reply.method = Some("REPLY".to_string());
    let r = upsert_calendar_event(&pool, &reply, Some("c_bob"))
        .await
        .unwrap();
    assert_eq!(r, "");

    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM events")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 0);
}

#[tokio::test]
async fn full_flow_invite_then_update_then_cancel() {
    // E2E within the test: walk the whole lifecycle and assert the
    // database ends up empty after CANCEL.
    let pool = fresh_pool().await;

    // Step 1: initial invite
    let r1 = upsert_calendar_event(&pool, &event_from_request_eml(), None)
        .await
        .unwrap();
    assert!(!r1.is_empty());

    // Step 2: organizer reschedules (SEQUENCE=1, different dt)
    let mut updated = event_from_request_eml();
    updated.sequence = Some(1);
    updated.dtstart = Some("2026-03-01T10:00:00Z".to_string());
    let r2 = upsert_calendar_event(&pool, &updated, None).await.unwrap();
    assert_eq!(r2, r1, "reschedule hits the same row");

    // Step 3: organizer cancels
    let r3 = upsert_calendar_event(&pool, &event_from_cancel_eml(), None)
        .await
        .unwrap();
    assert!(!r3.is_empty());

    let remaining: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM events")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(remaining, 0);
}

#[tokio::test]
async fn parse_vevent_handles_organizer_param() {
    // Regression test for AGENTS §10.5: split(':').next() returns
    // 'ORGANIZER' for both 'ORGANIZER:...' and 'ORGANIZER;CN=...:mailto:...',
    // so we need the full-line check too.
    let ics = "BEGIN:VCALENDAR\r\n\
METHOD:REQUEST\r\n\
BEGIN:VEVENT\r\n\
UID:org-test\r\n\
SUMMARY:Org param check\r\n\
DTSTART:20260101T100000Z\r\n\
ORGANIZER;CN=Alice Example:mailto:alice@example.com\r\n\
END:VEVENT\r\n\
END:VCALENDAR\r\n";
    let ev = parse_vevent(ics).unwrap();
    assert_eq!(ev.organizer.as_deref(), Some("alice@example.com"));
}
