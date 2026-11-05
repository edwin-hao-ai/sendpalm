//! Mail date integrity — sender date vs. server receipt date.
//!
//! The parser must never invent a sender timestamp. A message with a missing
//! or malformed `Date` header reports `sent_at == None`; the timeline for such
//! a message is the IMAP server's `INTERNALDATE`, which the sync bundle carries
//! separately as `received_at`.

use chrono::{DateTime, TimeZone, Utc};
use sendpalm_app_lib::services::imap::{FetchedMessage, SYNC_FETCH_QUERY};
use sendpalm_app_lib::services::parser::parse_email;

const BASE_HEADERS: &str = "From: Alice Example <alice@example.com>\r\n\
To: Bob Receiver <bob@example.com>\r\n\
Subject: Test message\r\n\
Message-ID: <date-test@example.com>\r\n\
MIME-Version: 1.0\r\n\
Content-Type: text/plain; charset=utf-8\r\n";

fn raw_with_date(date_header: Option<&str>) -> Vec<u8> {
    let mut raw = String::from(BASE_HEADERS);
    if let Some(value) = date_header {
        raw.push_str(&format!("Date: {value}\r\n"));
    }
    raw.push_str("\r\nHello world!\r\n");
    raw.into_bytes()
}

#[test]
fn sent_at_normalizes_offset_to_utc() {
    let parsed = parse_email(&raw_with_date(Some("Mon, 1 Jan 2024 18:00:00 +0800"))).unwrap();
    assert_eq!(
        parsed.sent_at,
        Some(Utc.with_ymd_and_hms(2024, 1, 1, 10, 0, 0).unwrap())
    );
}

#[test]
fn sent_at_is_none_when_date_header_is_missing() {
    let parsed = parse_email(&raw_with_date(None)).unwrap();
    assert_eq!(
        parsed.sent_at, None,
        "a missing Date header must not become 'now'"
    );
}

#[test]
fn sent_at_is_none_when_date_header_is_malformed() {
    let parsed = parse_email(&raw_with_date(Some("not a real date"))).unwrap();
    assert_eq!(
        parsed.sent_at, None,
        "a malformed Date header must not become 'now'"
    );
}

#[test]
fn fetched_message_keeps_uid_and_separate_receipt_time() {
    let parsed = parse_email(&raw_with_date(Some("Mon, 1 Jan 2024 10:00:00 +0000"))).unwrap();
    let received: DateTime<Utc> = Utc.with_ymd_and_hms(2024, 1, 1, 10, 4, 12).unwrap();
    let fetched = FetchedMessage {
        uid: 4321,
        parsed,
        received_at: Some(received),
    };

    assert_eq!(fetched.uid, 4321);
    assert_eq!(
        fetched.parsed.sent_at,
        Some(Utc.with_ymd_and_hms(2024, 1, 1, 10, 0, 0).unwrap())
    );
    assert_eq!(fetched.received_at, Some(received));
}

#[test]
fn fetched_message_allows_missing_receipt_time() {
    let parsed = parse_email(&raw_with_date(Some("Mon, 1 Jan 2024 10:00:00 +0000"))).unwrap();
    let fetched = FetchedMessage {
        uid: 7,
        parsed,
        received_at: None,
    };
    assert_eq!(fetched.received_at, None);
}

#[test]
fn sync_fetch_query_requests_internal_date_and_body() {
    assert!(
        SYNC_FETCH_QUERY.contains("INTERNALDATE"),
        "sync must request INTERNALDATE so receipt time is real: {SYNC_FETCH_QUERY}"
    );
    assert!(
        SYNC_FETCH_QUERY.contains("BODY.PEEK[]"),
        "sync must still fetch the body for new mail: {SYNC_FETCH_QUERY}"
    );
    assert!(
        SYNC_FETCH_QUERY.contains("UID"),
        "sync must request UID to keep folder cursors valid: {SYNC_FETCH_QUERY}"
    );
}
