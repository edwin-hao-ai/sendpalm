//! Integration tests for `insert_event_from_invite` in sync_loop.rs.
//!
//! Covers the receive-side iCal pipeline that runs automatically when
//! a message carrying a `text/calendar` part arrives via IMAP.
//! This is the path that was creating duplicate events before
//! upsert_calendar_event was wired in.
//!
//! Tests run against an in-memory SQLite + the full migration set so
//! the schema is identical to production.

use sendpalm_app_lib::services::ical::IcalEvent;
use sendpalm_app_lib::services::sync_loop::insert_event_from_invite;
use sqlx::sqlite::SqlitePool;

const REQUEST_EML: &str = include_str!("fixtures/ical_invite.eml");
const CANCEL_EML: &str = include_str!("fixtures/ical_cancellation.eml");

async fn fresh_pool() -> SqlitePool {
    let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
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
        include_str!("../migrations/0019_attendee_responses.sql"),
    ];
    for sql in migrations {
        sqlx::raw_sql(sql)
            .execute(&pool)
            .await
            .unwrap_or_else(|e| panic!("migration failed: {e}\n---\n{sql}"));
    }
    pool
}

fn invite_from(eml: &str) -> IcalEvent {
    let parsed = sendpalm_app_lib::services::parser::parse_email(eml.as_bytes()).unwrap();
    parsed.calendar_invite.expect("calendar_invite present")
}

fn make_invite(method: &str, uid: &str, summary: &str) -> IcalEvent {
    IcalEvent {
        uid: Some(uid.to_string()),
        summary: summary.to_string(),
        dtstart: Some("2026-01-15T10:00:00Z".to_string()),
        dtstart_tzid: None,
        dtend: Some("2026-01-15T11:00:00Z".to_string()),
        dtend_tzid: None,
        all_day: false,
        location: None,
        description: None,
        method: Some(method.to_string()),
        organizer: Some("org@example.com".to_string()),
        attendees: vec!["bob@example.com".to_string()],
        attendee_responses: vec![],
        sequence: Some(0),
    }
}

#[tokio::test]
async fn request_invite_creates_event() {
    let pool = fresh_pool().await;
    let invite = invite_from(REQUEST_EML);
    insert_event_from_invite(&pool, &invite, "c_alice")
        .await
        .expect("insert");

    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM events")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 1);

    let (uid, method): (String, String) =
        sqlx::query_as("SELECT ical_uid, ical_method FROM events")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(uid, "alice-meeting-2026-01-15@example.com");
    assert_eq!(method, "REQUEST");
}

#[tokio::test]
async fn duplicate_request_does_not_create_a_second_event() {
    // Two messages carrying the same iCal UID arrive back-to-back.
    // The auto-import path must NOT create two rows.
    let pool = fresh_pool().await;
    let invite = invite_from(REQUEST_EML);
    insert_event_from_invite(&pool, &invite, "c_alice").await.unwrap();
    insert_event_from_invite(&pool, &invite, "c_alice").await.unwrap();
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM events")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 1, "duplicate UID must not create a second row");
}

#[tokio::test]
async fn updated_request_refreshes_existing_row() {
    // Organizer reschedules: same UID, SEQUENCE=1, different dtstart.
    // The local row should be updated, not duplicated.
    let pool = fresh_pool().await;
    let mut invite = invite_from(REQUEST_EML);
    insert_event_from_invite(&pool, &invite, "c_alice").await.unwrap();

    invite.sequence = Some(1);
    invite.dtstart = Some("2026-02-01T10:00:00Z".to_string());
    invite.dtend = Some("2026-02-01T11:00:00Z".to_string());
    insert_event_from_invite(&pool, &invite, "c_alice").await.unwrap();

    let (dt, seq): (String, Option<i64>) = sqlx::query_as(
        "SELECT dt, ical_sequence FROM events WHERE ical_uid = $1",
    )
    .bind("alice-meeting-2026-01-15@example.com")
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(dt, "2026-02-01");
    assert_eq!(seq, Some(1));
}

#[tokio::test]
async fn cancellation_deletes_matching_event() {
    let pool = fresh_pool().await;
    let invite = invite_from(REQUEST_EML);
    insert_event_from_invite(&pool, &invite, "c_alice").await.unwrap();
    assert!(
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM events")
            .fetch_one(&pool)
            .await
            .unwrap()
            == 1
    );

    let cancel = invite_from(CANCEL_EML);
    insert_event_from_invite(&pool, &cancel, "c_alice").await.unwrap();

    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM events")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 0, "CANCEL must delete the auto-imported event");
}

#[tokio::test]
async fn cancellation_for_unknown_uid_is_a_noop() {
    let pool = fresh_pool().await;
    let cancel = make_invite("CANCEL", "never-existed@example.com", "Whatever");
    insert_event_from_invite(&pool, &cancel, "c_alice")
        .await
        .expect("noop");
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM events")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 0);
}

#[tokio::test]
async fn reply_merges_partstat_into_attendee_responses() {
    // 1. Organizer's invite gets auto-imported.
    let pool = fresh_pool().await;
    let invite = invite_from(REQUEST_EML);
    insert_event_from_invite(&pool, &invite, "c_alice").await.unwrap();

    // 2. Bob replies with ACCEPTED.
    let reply = IcalEvent {
        uid: Some("alice-meeting-2026-01-15@example.com".to_string()),
        summary: String::new(),
        dtstart: Some("2026-01-15T10:00:00Z".to_string()),
        dtstart_tzid: None,
        dtend: None,
        dtend_tzid: None,
        all_day: false,
        location: None,
        description: None,
        method: Some("REPLY".to_string()),
        organizer: Some("alice@example.com".to_string()),
        attendees: vec!["bob@example.com".to_string()],
        attendee_responses: vec![sendpalm_app_lib::services::ical::AttendeeResponse {
            email: "bob@example.com".to_string(),
            partstat: "ACCEPTED".to_string(),
        }],
        sequence: Some(0),
    };
    insert_event_from_invite(&pool, &reply, "c_bob")
        .await
        .expect("reply");

    // 3. The organizer event still exists and now has bob's response.
    let map_json: String = sqlx::query_scalar(
        "SELECT attendee_responses_json FROM events WHERE ical_uid = $1",
    )
    .bind("alice-meeting-2026-01-15@example.com")
    .fetch_one(&pool)
    .await
    .unwrap();
    let map: serde_json::Map<String, serde_json::Value> = serde_json::from_str(&map_json).unwrap();
    assert_eq!(map.len(), 1);
    let bob = map.get("bob@example.com").expect("bob entry");
    assert_eq!(bob["partstat"], "ACCEPTED");
    assert!(bob["at"].as_str().is_some());
}

#[tokio::test]
async fn reply_does_not_create_a_new_event_row() {
    // 1. No matching organizer event in the DB.
    let pool = fresh_pool().await;
    let reply = make_invite("REPLY", "ghost-uid@example.com", "ghost event");
    insert_event_from_invite(&pool, &reply, "c_alice")
        .await
        .expect("reply for unknown event is noop");

    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM events")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 0, "REPLY must never create a new event row");
}

#[tokio::test]
async fn multiple_replies_are_merged() {
    let pool = fresh_pool().await;
    let invite = invite_from(REQUEST_EML);
    insert_event_from_invite(&pool, &invite, "c_alice").await.unwrap();

    // Bob accepts first.
    let reply_bob = IcalEvent {
        uid: Some("alice-meeting-2026-01-15@example.com".to_string()),
        summary: String::new(),
        dtstart: Some("2026-01-15T10:00:00Z".to_string()),
        dtstart_tzid: None,
        dtend: None,
        dtend_tzid: None,
        all_day: false,
        location: None,
        description: None,
        method: Some("REPLY".to_string()),
        organizer: Some("alice@example.com".to_string()),
        attendees: vec!["bob@example.com".to_string()],
        attendee_responses: vec![sendpalm_app_lib::services::ical::AttendeeResponse {
            email: "bob@example.com".to_string(),
            partstat: "ACCEPTED".to_string(),
        }],
        sequence: Some(0),
    };
    insert_event_from_invite(&pool, &reply_bob, "c_bob").await.unwrap();

    // Then Bob changes his mind and declines.
    let reply_bob_decline = IcalEvent {
        attendee_responses: vec![sendpalm_app_lib::services::ical::AttendeeResponse {
            email: "bob@example.com".to_string(),
            partstat: "DECLINED".to_string(),
        }],
        ..reply_bob.clone()
    };
    insert_event_from_invite(&pool, &reply_bob_decline, "c_bob")
        .await
        .unwrap();

    // Carol also declines.
    let reply_carol = IcalEvent {
        attendee_responses: vec![sendpalm_app_lib::services::ical::AttendeeResponse {
            email: "carol@example.com".to_string(),
            partstat: "DECLINED".to_string(),
        }],
        attendees: vec!["carol@example.com".to_string()],
        ..reply_bob.clone()
    };
    insert_event_from_invite(&pool, &reply_carol, "c_carol")
        .await
        .unwrap();

    let map_json: String = sqlx::query_scalar(
        "SELECT attendee_responses_json FROM events WHERE ical_uid = $1",
    )
    .bind("alice-meeting-2026-01-15@example.com")
    .fetch_one(&pool)
    .await
    .unwrap();
    let map: serde_json::Map<String, serde_json::Value> = serde_json::from_str(&map_json).unwrap();
    assert_eq!(map.len(), 2);
    assert_eq!(map["bob@example.com"]["partstat"], "DECLINED");
    assert_eq!(map["carol@example.com"]["partstat"], "DECLINED");
}

#[tokio::test]
async fn reply_email_lowercased_for_dedup() {
    // Bob's reply comes in as Bob@Example.com (mail clients often
    // canonicalize differently). The merge must still match the
    // existing attendee entry on a case-insensitive basis.
    let pool = fresh_pool().await;
    let invite = invite_from(REQUEST_EML);
    insert_event_from_invite(&pool, &invite, "c_alice").await.unwrap();

    let reply = IcalEvent {
        uid: Some("alice-meeting-2026-01-15@example.com".to_string()),
        summary: String::new(),
        dtstart: Some("2026-01-15T10:00:00Z".to_string()),
        dtstart_tzid: None,
        dtend: None,
        dtend_tzid: None,
        all_day: false,
        location: None,
        description: None,
        method: Some("REPLY".to_string()),
        organizer: Some("alice@example.com".to_string()),
        attendees: vec!["Bob@Example.com".to_string()],
        attendee_responses: vec![sendpalm_app_lib::services::ical::AttendeeResponse {
            email: "Bob@Example.com".to_string(),
            partstat: "ACCEPTED".to_string(),
        }],
        sequence: Some(0),
    };
    insert_event_from_invite(&pool, &reply, "c_bob").await.unwrap();

    let map_json: String = sqlx::query_scalar(
        "SELECT attendee_responses_json FROM events WHERE ical_uid = $1",
    )
    .bind("alice-meeting-2026-01-15@example.com")
    .fetch_one(&pool)
    .await
    .unwrap();
    let map: serde_json::Map<String, serde_json::Value> = serde_json::from_str(&map_json).unwrap();
    // Map key is lowercased regardless of input casing.
    assert!(map.contains_key("bob@example.com"));
    assert!(!map.contains_key("Bob@Example.com"));
}
