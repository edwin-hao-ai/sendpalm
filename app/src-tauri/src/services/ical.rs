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
    pub location: Option<String>,
    pub description: Option<String>,
}

/// Parse an iCalendar text body. Returns the first VEVENT found, or `None`.
pub fn parse_vevent(ics: &str) -> Option<IcalEvent> {
    // Unfold continuation lines (RFC 5545 §3.1).
    let unfolded = unfold(ics);

// Collect the content between the first BEGIN:VEVENT and matching END:VEVENT.
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
    let mut dtend = None;
    let mut dtend_tzid = None;
    let mut location = None;
    let mut description = None;

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
                dtstart = Some(normalize_datetime(&value));
                dtstart_tzid = tzid;
            }
            "DTEND" => {
                dtend = Some(normalize_datetime(&value));
                dtend_tzid = tzid;
            }
            "LOCATION" => location = Some(value),
            "DESCRIPTION" => description = Some(value),
            _ => {}
        }
    }

    Some(IcalEvent {
        uid,
        summary,
        dtstart,
        dtstart_tzid,
        dtend,
        dtend_tzid,
        location,
        description,
    })
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
        if b == b'\r' && i + 2 < bytes.len() && bytes[i + 1] == b'\n' && (bytes[i + 2] == b' ' || bytes[i + 2] == b'\t') {
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
        assert_eq!(ev.summary, "This is a long summary that spans multiple lines");
    }

    #[test]
    fn parses_date_only() {
        let ics = "BEGIN:VEVENT\r\nSUMMARY:All day\r\nDTSTART;VALUE=DATE:20260101\r\nEND:VEVENT\r\n";
        let ev = parse_vevent(ics).unwrap();
        assert_eq!(ev.summary, "All day");
        assert!(ev.dtstart.as_deref().unwrap().starts_with("2026-01-01"));
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
}