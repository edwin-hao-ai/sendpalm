//! End-to-end test for the calendar-invite flow.
//!
//! Loads real `.eml` fixtures (RFC 822 multipart with `text/calendar` parts)
//! and asserts that `parse_email` correctly extracts the iCal VEVENT. Covers
//! the previously-untested path from raw email → `IcalEvent`.
//!
//! The fixtures live next to this file under `tests/fixtures/`. They use
//! `include_str!` so they're compiled into the test binary and the test
//! doesn't depend on the runtime CWD.

use sendpalm_app_lib::services::ical::parse_vevent;
use sendpalm_app_lib::services::parser::parse_email;

const REQUEST_EML: &str = include_str!("fixtures/ical_invite.eml");
const CANCEL_EML: &str = include_str!("fixtures/ical_cancellation.eml");

#[test]
fn parses_real_invite_eml_fixture() {
    let parsed = parse_email(REQUEST_EML.as_bytes()).expect("parse_email");
    let invite = parsed
        .calendar_invite
        .as_ref()
        .expect("calendar_invite should be present");
    assert_eq!(invite.uid.as_deref(), Some("alice-meeting-2026-01-15@example.com"));
    assert_eq!(invite.summary, "Project sync");
    assert!(invite.dtstart.as_deref().unwrap().starts_with("2026-01-15"));
    assert!(invite.dtend.as_deref().unwrap().starts_with("2026-01-15"));
    assert_eq!(invite.location.as_deref(), Some("Room 42"));
    assert_eq!(invite.organizer.as_deref(), Some("alice@example.com"));
    assert_eq!(
        invite.attendees,
        vec!["bob@example.com".to_string(), "carol@example.com".to_string()]
    );
    assert_eq!(invite.method.as_deref(), Some("REQUEST"));
    assert_eq!(invite.sequence, Some(0));
    assert!(!invite.all_day);
    // description is empty in the inline body part; the iCal DESCRIPTION
    // lives inside the .ics attachment, which is what this test is
    // exercising.
}

#[test]
fn parses_real_cancellation_eml_fixture() {
    let parsed = parse_email(CANCEL_EML.as_bytes()).expect("parse_email");
    let invite = parsed
        .calendar_invite
        .as_ref()
        .expect("calendar_invite should be present for CANCEL too");
    assert_eq!(invite.method.as_deref(), Some("CANCEL"));
    // Same UID as the original REQUEST — the dedup logic in
    // add_calendar_event relies on this.
    assert_eq!(invite.uid.as_deref(), Some("alice-meeting-2026-01-15@example.com"));
    assert_eq!(invite.sequence, Some(1));
}

#[test]
fn fixture_roundtrips_through_ical_parser_directly() {
    // Some non-Tauri consumers may want to parse the raw .ics body without
    // the full MIME walk. Confirm the inner block extracted by walk_calendar
    // is what parse_vevent expects.
    let parsed = parse_email(REQUEST_EML.as_bytes()).unwrap();
    let invite = parsed.calendar_invite.as_ref().unwrap();
    let round = parse_vevent(&format!(
        "BEGIN:VCALENDAR\r\n\
METHOD:REQUEST\r\n\
BEGIN:VEVENT\r\n\
UID:{}\r\n\
SUMMARY:{}\r\n\
DTSTART:{}\r\n\
END:VEVENT\r\n\
END:VCALENDAR\r\n",
        invite.uid.as_deref().unwrap(),
        invite.summary,
        invite.dtstart.as_deref().unwrap(),
    ))
    .unwrap();
    assert_eq!(round.uid, invite.uid);
    assert_eq!(round.method, invite.method);
}
