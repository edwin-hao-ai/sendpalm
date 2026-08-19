//! Minimal iCalendar VEVENT parser.
//!
//! RFC 5545 defines a complex grammar. For SendPalm's purpose — surfacing
//! meeting invites from incoming mail and offering "Add to calendar" —
//! we only need the first VEVENT and a handful of properties:
//! SUMMARY, DTSTART, DTEND, LOCATION, DESCRIPTION, UID.
//!
//! Supported features:
//! - Line unfolding (lines beginning with space/tab continue the previous)
//! - Property parameters (e.g. `DTSTART;TZID=America/New_York:...`)
//! - Text escaping (`\,`, `\;`, `\n`, `\\`)
//! - Both `VALUE=DATE` (`YYYYMMDD`) and default date-time
//!   (`YYYYMMDDTHHMMSSZ` UTC or floating) forms.
//!
//! Intentionally NOT supported:
//! - RRULE / recurrence (we treat the event as a single occurrence)
//! - Multiple VEVENTs in one ICS body
//! - VTIMEZONE blocks (we attach the TZID as opaque metadata)

use chrono::{NaiveDate, NaiveDateTime, TimeZone, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct IcalEvent {
    pub uid: Option<String>,
    pub summary: String,
    /// ISO-8601 / RFC3339 UTC timestamp.
    pub dtstart: Option<String>,
    pub dtstart_tzid: Option<String>,
    pub dtend: Option<String>,
    pub dtend_tzid: Option<String>,
    pub all_day: bool,
    pub location: Option<String>,
    pub description: Option<String>,
    /// iCalendar METHOD: REQUEST, CANCEL, REPLY, etc. (RFC 5546 / iTip).
    /// Only set when the wrapping VCALENDAR declared a METHOD property.
    /// None means "implicit REQUEST" — the iCal body is a new invite.
    pub method: Option<String>,
    /// Organizer's email (MAILTO from the ORGANIZER property), when present.
    pub organizer: Option<String>,
    /// Attendees as their MAILTO values. For a REPLY message this is
    /// typically a single entry: the responder.
    pub attendees: Vec<String>,
    /// SEQUENCE number from the VEVENT. Used to detect updates.
    pub sequence: Option<u32>,
}

/// Parse an iCalendar text body. Returns the first VEVENT found, or `None`.
pub fn parse_vevent(ics: &str) -> Option<IcalEvent> {
    // Unfold continuation lines (RFC 5545 §3.1).
    let unfolded = unfold(ics);

    // First pass: look for a METHOD property at the VCALENDAR level
    // (RFC 5546 §3.2). It always precedes the VEVENT block in valid iCal.
    let mut method: Option<String> = None;
    let mut in_vcal = false;
    for raw in unfolded.lines() {
        let line = raw.trim_end_matches('\r');
        let upper_full = line.to_uppercase();
        let upper_name = line.split(':').next().unwrap_or("").to_uppercase();
        if upper_name == "BEGIN" && upper_full.contains("VCALENDAR") {
            in_vcal = true;
            continue;
        }
        if upper_name == "END" && upper_full.contains("VCALENDAR") {
            in_vcal = false;
            continue;
        }
        // Only read METHOD while we're between BEGIN:VCALENDAR and
        // BEGIN:VEVENT (otherwise we'd match a method-shaped value
        // inside a VEVENT, which is a real concern for inline invites
        // where the body is itself text/calendar without a wrapper).
        if in_vcal && upper_name == "METHOD" {
            if let Some((_, v)) = split_property(line) {
                method = Some(unescape_text(&v).to_uppercase());
            }
        }
    }

    // Second pass: collect the content between the first BEGIN:VEVENT
    // and matching END:VEVENT.
    let mut in_event = false;
    let mut depth = 0u32;
    let mut lines: Vec<&str> = Vec::new();
    for raw in unfolded.lines() {
        let line = raw.trim_end_matches('\r');
        let upper_full = line.to_uppercase();
        let upper_name = line.split(':').next().unwrap_or("").to_uppercase();
        if upper_name.starts_with("BEGIN") && upper_full.contains("VEVENT") && !in_event {
            in_event = true;
            depth = 1;
            continue;
        }
        if in_event {
            if upper_name.starts_with("BEGIN") {
                depth += 1;
            } else if upper_name.starts_with("END") {
                depth -= 1;
                if depth == 0 {
                    break;
                }
            } else {
                lines.push(line);
            }
        }
    }
    if !in_event {
        return None;
    }

    let mut summary = String::new();
    let mut uid = None;
    let mut dtstart = None;
    let mut dtstart_tzid = None;
    let mut dtstart_value_param: Option<String> = None;
    let mut dtend = None;
    let mut dtend_tzid = None;
    let mut location = None;
    let mut description = None;
    let mut organizer: Option<String> = None;
    let mut attendees: Vec<String> = Vec::new();
    let mut sequence: Option<u32> = None;

    for line in lines {
        let (name_and_params, value) = match split_property(line) {
            Some(v) => v,
            None => continue,
        };
        let name_upper = name_and_params
            .split(';')
            .next()
            .unwrap_or("")
            .to_uppercase();
        let tzid = extract_param(&name_and_params, "TZID");
        let value = unescape_text(&value);

        match name_upper.as_str() {
            "SUMMARY" => summary = value,
            "UID" => uid = Some(value),
            "DTSTART" => {
                dtstart_value_param = Some(name_and_params.to_uppercase());
                dtstart = Some(normalize_datetime(&value));
                dtstart_tzid = tzid;
            }
            "DTEND" => {
                dtend = Some(normalize_datetime(&value));
                dtend_tzid = tzid;
            }
            "LOCATION" => location = Some(value),
            "DESCRIPTION" => description = Some(value),
            "ORGANIZER" => {
                // ORGANIZER;CN=Alice:mailto:alice@example.com
                organizer = Some(extract_mailto(&value));
            }
            "ATTENDEE" => {
                // ATTENDEE;CN=Bob;RSVP=TRUE:mailto:bob@example.com
                let addr = extract_mailto(&value);
                if !addr.is_empty() {
                    attendees.push(addr);
                }
            }
            "SEQUENCE" => {
                if let Ok(n) = value.trim().parse::<u32>() {
                    sequence = Some(n);
                }
            }
            _ => {}
        }
    }

    // An event is all-day when DTSTART uses VALUE=DATE or is a bare date.
    let all_day = dtstart_value_param
        .as_deref()
        .map(|s| s.contains("VALUE=DATE"))
        .unwrap_or(false)
        || dtstart.as_deref().map(|s| s.len() == 10).unwrap_or(false);

    Some(IcalEvent {
        uid,
        summary,
        dtstart,
        dtstart_tzid,
        dtend,
        dtend_tzid,
        all_day,
        location,
        description,
        method,
        organizer,
        attendees,
        sequence,
    })
}

/// Strip a leading `mailto:` (or `MAILTO:`) from an iCal value. If the
/// value is just an address with no scheme, return it as-is.
fn extract_mailto(value: &str) -> String {
    let v = value.trim();
    if let Some(rest) = v
        .strip_prefix("mailto:")
        .or_else(|| v.strip_prefix("MAILTO:"))
    {
        rest.trim().to_string()
    } else {
        v.to_string()
    }
}

/// RFC 5545 §3.1 line unfolding: a CRLF (or LF) followed by a single
/// linear white-space character (SPACE or HTAB) is removed — the continuation
/// line joins the prior content line.
fn unfold(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = String::with_capacity(input.len());
    let mut i = 0;
    while i < bytes.len() {
        let b = bytes[i];
        // CRLF + WSP — drop the CRLF and the WSP, joining the lines.
        if b == b'\r'
            && i + 2 < bytes.len()
            && bytes[i + 1] == b'\n'
            && (bytes[i + 2] == b' ' || bytes[i + 2] == b'\t')
        {
            i += 3;
            continue;
        }
        // LF + WSP
        if b == b'\n' && i + 1 < bytes.len() && (bytes[i + 1] == b' ' || bytes[i + 1] == b'\t') {
            i += 2;
            continue;
        }
        out.push(b as char);
        i += 1;
    }
    out
}

fn split_property(line: &str) -> Option<(String, String)> {
    // Property line: NAME[;PARAM=VALUE]*:TEXT
    let colon = line.find(':')?;
    let name = line[..colon].to_string();
    let value = line[colon + 1..].to_string();
    Some((name, value))
}

fn extract_param(name_and_params: &str, key: &str) -> Option<String> {
    let target = key.to_uppercase();
    for part in name_and_params.split(';').skip(1) {
        let (k, v) = part.split_once('=')?;
        if k.to_uppercase() == target {
            return Some(v.trim_matches('"').to_string());
        }
    }
    None
}

fn unescape_text(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\\' {
            match chars.next() {
                Some('n') | Some('N') => out.push('\n'),
                Some(',') => out.push(','),
                Some(';') => out.push(';'),
                Some('\\') => out.push('\\'),
                Some(other) => {
                    out.push('\\');
                    out.push(other);
                }
                None => out.push('\\'),
            }
        } else {
            out.push(c);
        }
    }
    out
}

/// Split an RFC3339 timestamp into a SQLite-friendly `YYYY-MM-DD` date string
/// and an `HH:MM` time string. Used when persisting events to the local DB.
pub fn split_iso_datetime(dt: &str) -> (String, String) {
    // Accept both full RFC3339 (`2026-01-01T10:00:00Z`) and the compact
    // `YYYY-MM-DD HH:MM` form already stored in some columns.
    let parts: Vec<&str> = dt.split(['T', ' ']).collect();
    let date = parts.first().unwrap_or(&"").to_string();
    let time = parts
        .get(1)
        .map(|t| {
            let mut iter = t.split(':');
            let h = iter.next().unwrap_or("00");
            let m = iter.next().unwrap_or("00");
            format!("{h}:{m}")
        })
        .unwrap_or_else(|| "00:00".to_string());
    (date, time)
}

/// Compute event duration in minutes from optional DTSTART/DTEND RFC3339 strings.
pub fn compute_duration_minutes(start: Option<&str>, end: Option<&str>) -> i64 {
    let Some(start) = start else { return 0 };
    let start_dt = match chrono::DateTime::parse_from_rfc3339(start) {
        Ok(d) => d.with_timezone(&Utc),
        Err(_) => return 0,
    };
    let end_dt = match end {
        Some(e) => match chrono::DateTime::parse_from_rfc3339(e) {
            Ok(d) => Some(d.with_timezone(&Utc)),
            Err(_) => None,
        },
        None => None,
    };
    let end_dt = end_dt.unwrap_or_else(|| start_dt + chrono::Duration::minutes(30));
    (end_dt - start_dt).num_minutes()
}

/// iTip RSVP partstat values (RFC 5545 §3.2.12).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RsvpStatus {
    Accepted,
    Declined,
    Tentative,
}

impl RsvpStatus {
    /// String value used in the iTip PARTSTAT property (case-sensitive per spec).
    pub fn as_partstat(self) -> &'static str {
        match self {
            RsvpStatus::Accepted => "ACCEPTED",
            RsvpStatus::Declined => "DECLINED",
            RsvpStatus::Tentative => "TENTATIVE",
        }
    }
}

/// Build an iTip REPLY (RFC 5546 §3.2.5) for the given original event,
/// addressed from `responder_email` to the organizer. The reply contains
/// exactly one VEVENT whose ATTENDEE carries the chosen PARTSTAT.
///
/// Returns `None` if the original event lacks a UID or organizer — the
/// caller should treat that as "can't reply, missing required fields."
pub fn build_itip_reply(
    original: &IcalEvent,
    responder_email: &str,
    response: RsvpStatus,
) -> Option<String> {
    let uid = original.uid.as_deref()?;
    let organizer = original.organizer.as_deref()?;
    if responder_email.trim().is_empty() {
        return None;
    }
    let now = Utc::now();
    let stamp = format_ical_utc(now);
    let sequence = original.sequence.unwrap_or(0);

    let dtstart_line = original
        .dtstart
        .as_deref()
        .map(|d| {
            let raw = ical_to_compact(d);
            if let Some(tz) = &original.dtstart_tzid {
                format!("DTSTART;TZID={tz}:{raw}\r\n")
            } else {
                format!("DTSTART:{raw}\r\n")
            }
        })
        .unwrap_or_default();
    let dtend_line = original
        .dtend
        .as_deref()
        .map(|d| {
            let raw = ical_to_compact(d);
            if let Some(tz) = &original.dtend_tzid {
                format!("DTEND;TZID={tz}:{raw}\r\n")
            } else {
                format!("DTEND:{raw}\r\n")
            }
        })
        .unwrap_or_default();
    let summary_line = original
        .summary
        .is_empty()
        .then(String::new)
        .unwrap_or_else(|| format!("SUMMARY:{}\r\n", escape_text(&original.summary)));
    let location_line = original
        .location
        .as_deref()
        .filter(|s| !s.is_empty())
        .map(|s| format!("LOCATION:{}\r\n", escape_text(s)))
        .unwrap_or_default();

    Some(format!(
        "BEGIN:VCALENDAR\r\n\
METHOD:REPLY\r\n\
PRODID:-//SendPalm//EN\r\n\
VERSION:2.0\r\n\
BEGIN:VEVENT\r\n\
UID:{uid}\r\n\
SEQUENCE:{sequence}\r\n\
DTSTAMP:{stamp}\r\n\
{summary_line}\
{dtstart_line}\
{dtend_line}\
{location_line}\
ORGANIZER:mailto:{organizer}\r\n\
ATTENDEE;CN={responder_email};PARTSTAT={partstat};RSVP=TRUE:mailto:{responder_email}\r\n\
END:VEVENT\r\n\
END:VCALENDAR\r\n",
        partstat = response.as_partstat()
    ))
}

/// Format a chrono::DateTime<Utc> as iCal UTC stamp `YYYYMMDDTHHMMSSZ`.
fn format_ical_utc(dt: chrono::DateTime<Utc>) -> String {
    dt.format("%Y%m%dT%H%M%SZ").to_string()
}

/// Convert a stored RFC3339 / ISO8601 datetime back to compact iCal form
/// (drop the dashes + colons). Best-effort: if the input doesn't match
/// either form, the original is returned.
fn ical_to_compact(iso: &str) -> String {
    let v = iso.trim();
    // Already compact (YYYYMMDDTHHMMSSZ) — pass through.
    if v.contains('T') && !v.contains('-') {
        return v.to_string();
    }
    // RFC3339 → compact: drop dashes, drop the seconds suffix, append Z if missing.
    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(v) {
        return format_ical_utc(dt.with_timezone(&Utc));
    }
    v.to_string()
}

/// Escape commas, semicolons, backslashes, and newlines per RFC 5545 §3.3.11.
fn escape_text(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            ',' => out.push_str("\\,"),
            ';' => out.push_str("\\;"),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            other => out.push(other),
        }
    }
    out
}

/// Normalize a DTSTART/DTEND value into an RFC3339 timestamp when possible.
fn normalize_datetime(value: &str) -> String {
    let v = value.trim();
    // DATE-only form: YYYYMMDD
    if v.len() == 8 && v.chars().all(|c| c.is_ascii_digit()) {
        if let Ok(d) = NaiveDate::parse_from_str(v, "%Y%m%d") {
            let dt = d.and_hms_opt(0, 0, 0).unwrap();
            return Utc.from_utc_datetime(&dt).to_rfc3339();
        }
        return v.to_string();
    }
    // DATE-TIME with Z (UTC): YYYYMMDDTHHMMSSZ
    if v.ends_with('Z') && v.len() >= 15 {
        let candidate = &v[..v.len() - 1];
        if let Ok(dt) = NaiveDateTime::parse_from_str(candidate, "%Y%m%dT%H%M%S") {
            return Utc.from_utc_datetime(&dt).to_rfc3339();
        }
    }
    // DATE-TIME without Z (floating local time). Best-effort: treat as UTC.
    if v.len() >= 15 && v.contains('T') {
        if let Ok(dt) = NaiveDateTime::parse_from_str(v, "%Y%m%dT%H%M%S") {
            return Utc.from_utc_datetime(&dt).to_rfc3339();
        }
    }
    // Fall through: return raw.
    v.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_minimal_vevent() {
        let ics = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:abc-123\r\nSUMMARY:Standup\r\nDTSTART:20260101T100000Z\r\nDTEND:20260101T103000Z\r\nLOCATION:Room 1\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";
        let ev = parse_vevent(ics).unwrap();
        assert_eq!(ev.summary, "Standup");
        assert_eq!(ev.uid.as_deref(), Some("abc-123"));
        assert!(ev.dtstart.as_deref().unwrap().starts_with("2026-01-01"));
        assert!(ev.dtend.as_deref().unwrap().starts_with("2026-01-01"));
        assert_eq!(ev.location.as_deref(), Some("Room 1"));
    }

    #[test]
    fn unfolds_continuation_lines() {
        let ics = "BEGIN:VEVENT\r\nSUMMARY:This is a long\r\n  summary that spans\r\n  multiple lines\r\nDTSTART:20260101T100000Z\r\nEND:VEVENT\r\n";
        let ev = parse_vevent(ics).unwrap();
        assert_eq!(
            ev.summary,
            "This is a long summary that spans multiple lines"
        );
    }

    #[test]
    fn parses_date_only() {
        let ics =
            "BEGIN:VEVENT\r\nSUMMARY:All day\r\nDTSTART;VALUE=DATE:20260101\r\nEND:VEVENT\r\n";
        let ev = parse_vevent(ics).unwrap();
        assert_eq!(ev.summary, "All day");
        assert!(ev.dtstart.as_deref().unwrap().starts_with("2026-01-01"));
        assert!(ev.all_day);
    }

    #[test]
    fn parses_timed_event_as_not_all_day() {
        let ics = "BEGIN:VEVENT\r\nSUMMARY:Standup\r\nDTSTART:20260101T100000Z\r\nDTEND:20260101T103000Z\r\nEND:VEVENT\r\n";
        let ev = parse_vevent(ics).unwrap();
        assert!(!ev.all_day);
    }

    #[test]
    fn unescapes_text() {
        let ics = "BEGIN:VEVENT\r\nSUMMARY:Line1\\nLine2\\, comma\\;semi\r\nDTSTART:20260101T100000Z\r\nEND:VEVENT\r\n";
        let ev = parse_vevent(ics).unwrap();
        assert_eq!(ev.summary, "Line1\nLine2, comma;semi");
    }

    #[test]
    fn returns_none_without_vevent() {
        let ics = "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n";
        assert!(parse_vevent(ics).is_none());
    }

    #[test]
    fn parses_method_request() {
        let ics = "BEGIN:VCALENDAR\r\n\
METHOD:REQUEST\r\n\
VERSION:2.0\r\n\
BEGIN:VEVENT\r\n\
UID:inv-1\r\n\
SUMMARY:Project sync\r\n\
DTSTART:20260101T100000Z\r\n\
DTEND:20260101T110000Z\r\n\
ORGANIZER;CN=Alice:mailto:alice@example.com\r\n\
ATTENDEE;CN=Bob;RSVP=TRUE:mailto:bob@example.com\r\n\
ATTENDEE:mailto:carol@example.com\r\n\
SEQUENCE:0\r\n\
END:VEVENT\r\n\
END:VCALENDAR\r\n";
        let ev = parse_vevent(ics).unwrap();
        assert_eq!(ev.method.as_deref(), Some("REQUEST"));
        assert_eq!(ev.organizer.as_deref(), Some("alice@example.com"));
        assert_eq!(ev.attendees, vec!["bob@example.com", "carol@example.com"]);
        assert_eq!(ev.sequence, Some(0));
    }

    #[test]
    fn parses_method_cancel() {
        let ics = "BEGIN:VCALENDAR\r\n\
METHOD:CANCEL\r\n\
BEGIN:VEVENT\r\n\
UID:inv-2\r\n\
SUMMARY:Cancelled meeting\r\n\
DTSTART:20260101T100000Z\r\n\
END:VEVENT\r\n\
END:VCALENDAR\r\n";
        let ev = parse_vevent(ics).unwrap();
        assert_eq!(ev.method.as_deref(), Some("CANCEL"));
        assert_eq!(ev.uid.as_deref(), Some("inv-2"));
    }

    #[test]
    fn no_method_implies_implicit_request() {
        // METHOD is optional; an invite without one is a default REQUEST.
        let ics = "BEGIN:VCALENDAR\r\n\
BEGIN:VEVENT\r\n\
UID:inv-3\r\n\
SUMMARY:No method\r\n\
DTSTART:20260101T100000Z\r\n\
END:VEVENT\r\n\
END:VCALENDAR\r\n";
        let ev = parse_vevent(ics).unwrap();
        assert!(ev.method.is_none());
    }

    #[test]
    fn sequence_higher_number_wins() {
        let s0 = "BEGIN:VEVENT\r\nUID:inv-4\r\nSUMMARY:r0\r\nDTSTART:20260101T100000Z\r\nSEQUENCE:0\r\nEND:VEVENT\r\n";
        let s2 = "BEGIN:VEVENT\r\nUID:inv-4\r\nSUMMARY:r2 (rescheduled)\r\nDTSTART:20260102T100000Z\r\nSEQUENCE:2\r\nEND:VEVENT\r\n";
        let a = parse_vevent(s0).unwrap();
        let b = parse_vevent(s2).unwrap();
        assert!(b.sequence.unwrap() > a.sequence.unwrap());
    }

    #[test]
    fn rsvp_status_partstat_values() {
        assert_eq!(RsvpStatus::Accepted.as_partstat(), "ACCEPTED");
        assert_eq!(RsvpStatus::Declined.as_partstat(), "DECLINED");
        assert_eq!(RsvpStatus::Tentative.as_partstat(), "TENTATIVE");
    }

    #[test]
    fn build_itip_reply_roundtrip() {
        // Step 1: parse a real REQUEST.
        let ics = "BEGIN:VCALENDAR\r\n\
METHOD:REQUEST\r\n\
VERSION:2.0\r\n\
BEGIN:VEVENT\r\n\
UID:roundtrip-1\r\n\
SEQUENCE:0\r\n\
SUMMARY:Quarterly review\r\n\
DTSTART:20260101T100000Z\r\n\
DTEND:20260101T110000Z\r\n\
LOCATION:Room 42\r\n\
ORGANIZER;CN=Alice:mailto:alice@example.com\r\n\
ATTENDEE;CN=Bob;RSVP=TRUE:mailto:bob@example.com\r\n\
END:VEVENT\r\n\
END:VCALENDAR\r\n";
        let original = parse_vevent(ics).unwrap();
        assert_eq!(original.uid.as_deref(), Some("roundtrip-1"));
        assert_eq!(original.organizer.as_deref(), Some("alice@example.com"));

        // Step 2: Bob accepts → build the REPLY body.
        let reply = build_itip_reply(&original, "bob@example.com", RsvpStatus::Accepted).unwrap();
        assert!(reply.contains("METHOD:REPLY\r\n"));
        assert!(reply.contains("UID:roundtrip-1\r\n"));
        assert!(reply.contains("ORGANIZER:mailto:alice@example.com\r\n"));
        assert!(reply.contains(
            "ATTENDEE;CN=bob@example.com;PARTSTAT=ACCEPTED;RSVP=TRUE:mailto:bob@example.com\r\n"
        ));
        assert!(reply.contains("BEGIN:VEVENT\r\n"));
        assert!(reply.contains("END:VEVENT\r\n"));
        assert!(reply.contains("END:VCALENDAR\r\n"));

        // Step 3: the REPLY itself is a valid iCal body that we can re-parse.
        let parsed_reply = parse_vevent(&reply).unwrap();
        assert_eq!(parsed_reply.method.as_deref(), Some("REPLY"));
        assert_eq!(parsed_reply.uid.as_deref(), Some("roundtrip-1"));
        assert_eq!(parsed_reply.organizer.as_deref(), Some("alice@example.com"));
        assert_eq!(parsed_reply.attendees, vec!["bob@example.com"]);
    }

    #[test]
    fn build_itip_reply_decline_preserves_original_dt() {
        let ics = "BEGIN:VCALENDAR\r\n\
METHOD:REQUEST\r\n\
BEGIN:VEVENT\r\n\
UID:decline-1\r\n\
SEQUENCE:3\r\n\
SUMMARY:Skip\r\n\
DTSTART:20260215T090000Z\r\n\
DTEND:20260215T100000Z\r\n\
ORGANIZER:mailto:boss@example.com\r\n\
END:VEVENT\r\n\
END:VCALENDAR\r\n";
        let original = parse_vevent(ics).unwrap();
        let reply =
            build_itip_reply(&original, "me@example.com", RsvpStatus::Declined).unwrap();
        assert!(reply.contains("DTSTART:20260215T090000Z\r\n"));
        assert!(reply.contains("DTEND:20260215T100000Z\r\n"));
        assert!(reply.contains("SEQUENCE:3\r\n"));
        assert!(reply.contains("PARTSTAT=DECLINED"));
    }

    #[test]
    fn build_itip_reply_requires_uid_and_organizer() {
        let ics = "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART:20260101T100000Z\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";
        let original = parse_vevent(ics).unwrap();
        assert!(build_itip_reply(&original, "me@example.com", RsvpStatus::Accepted).is_none());
    }

    #[test]
    fn build_itip_reply_escapes_special_chars() {
        let ics = "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:esc-1\r\nSUMMARY:Q1, Q2; review\r\nDTSTART:20260101T100000Z\r\nORGANIZER:mailto:boss@example.com\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";
        let original = parse_vevent(ics).unwrap();
        let reply = build_itip_reply(&original, "me@example.com", RsvpStatus::Accepted).unwrap();
        assert!(reply.contains("SUMMARY:Q1\\, Q2\\; review\r\n"));
    }
}
