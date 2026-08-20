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

use chrono::{DateTime, Datelike, NaiveDate, NaiveDateTime, TimeZone, Timelike, Utc, Weekday as ChronoWeekday};
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
    /// Per-attendee PARTSTAT extracted from the ATTENDEE lines. Populated
    /// for any method; empty for events where the source didn't carry
    /// PARTSTAT. The first entry typically corresponds to the message's
    /// author (the responder in a REPLY).
    pub attendee_responses: Vec<AttendeeResponse>,
    /// SEQUENCE number from the VEVENT. Used to detect updates.
    pub sequence: Option<u32>,
    /// RRULE if the event recurs. None means single-shot. Stored
    /// verbatim (the FREQ/INTERVAL/... key=value pairs) so we can
    /// re-emit it unchanged and pass it to a real recurrence
    /// expander when we need concrete occurrences.
    pub rrule: Option<String>,
    /// RDATE list of additional occurrence start times (RFC 5545
    /// §3.8.5.2). Each value is normalized to the same format as
    /// dtstart (UTC ISO-8601). Combined with RRULE for the full
    /// occurrence set.
    pub rdates: Vec<String>,
    /// EXDATE list of exception dates to remove from the expanded
    /// set (RFC 5545 §3.8.5.1). Same format as rdates.
    pub exdates: Vec<String>,
    /// VTIMEZONE blocks found anywhere in the surrounding iCal
    /// body (RFC 5545 §3.6.5). Empty for invites that don't
    /// reference a TZID. The calendar view uses these to convert
    /// `DTSTART;TZID=Asia/Shanghai` to a concrete UTC time so the
    /// "starts at" line is right in the user's local zone.
    pub vtimezones: Vec<VTimezone>,
}

/// Recurrence rule (RFC 5545 §3.3.10). We keep this as a parsed
/// structure separate from the raw `rrule` string so the expander
/// doesn't have to re-parse on every call, and so calendar UI can
/// introspect "is this weekly?" without grepping the source.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RecurrenceRule {
    /// FREQ: DAILY, WEEKLY, MONTHLY, YEARLY (we don't support HOURLY /
    /// MINUTELY / SECONDLY — none of the providers we sync with
    /// emit them and they're rare enough to defer).
    pub freq: RecurrenceFreq,
    /// INTERVAL — every Nth FREQ. Default 1.
    pub interval: u32,
    /// COUNT — number of occurrences. Mutually exclusive with UNTIL.
    pub count: Option<u32>,
    /// UNTIL — last occurrence start time (UTC ISO-8601). Mutually
    /// exclusive with COUNT.
    pub until: Option<String>,
    /// BYDAY list (e.g. `["MO", "WE", "FR"]` for a weekly rule on
    /// those days). We support a flat list of weekday codes; the
    /// positional `1MO` / `-1FR` forms are not handled and ignored
    /// if present.
    pub byday: Vec<Weekday>,
    /// BYMONTHDAY (1..=31, -1..=-31). Same simple form only.
    pub bymonthday: Vec<i32>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum RecurrenceFreq { Daily, Weekly, Monthly, Yearly }

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum Weekday { Mo, Tu, We, Th, Fr, Sa, Su }

/// One (email, partstat) pair parsed from an ATTENDEE line.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AttendeeResponse {
    pub email: String,
    /// RFC 5545 §3.2.12 partstat: ACCEPTED, DECLINED, TENTATIVE,
    /// NEEDS-ACTION, DELEGATED. Empty string when the ATTENDEE line had
    /// no PARTSTAT (a REQUEST invite typically does; a REPLY must).
    pub partstat: String,
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
    let mut attendee_responses: Vec<AttendeeResponse> = Vec::new();
    let mut sequence: Option<u32> = None;
    let mut rrule: Option<String> = None;
    let mut rdates: Vec<String> = Vec::new();
    let mut exdates: Vec<String> = Vec::new();

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
                // ATTENDEE;CN=Bob;PARTSTAT=ACCEPTED:mailto:bob@example.com
                let addr = extract_mailto(&value);
                if addr.is_empty() {
                    continue;
                }
                attendees.push(addr.clone());
                let partstat = extract_param(&name_and_params, "PARTSTAT")
                    .unwrap_or_default();
                attendee_responses.push(AttendeeResponse {
                    email: addr,
                    partstat,
                });
            }
            "SEQUENCE" => {
                if let Ok(n) = value.trim().parse::<u32>() {
                    sequence = Some(n);
                }
            }
            "RRULE" => {
                // Keep the raw text so the calendar UI can re-emit
                // it unchanged when building iTip responses.
                rrule = Some(value);
            }
            "RDATE" => {
                // RDATE can be a single value or a comma-separated
                // list. We accept the flat form here and normalize
                // each entry the same way DTSTART is.
                for v in value.split(',') {
                    let n = normalize_datetime(v.trim());
                    if !n.is_empty() {
                        rdates.push(n);
                    }
                }
            }
            "EXDATE" => {
                for v in value.split(',') {
                    let n = normalize_datetime(v.trim());
                    if !n.is_empty() {
                        exdates.push(n);
                    }
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
        attendee_responses,
        sequence,
        rrule,
        rdates,
        exdates,
        vtimezones: parse_vtimezones(ics),
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

// ── RRULE parsing + expansion ────────────────────────────────────────

/// Parse a single RRULE value (the part after `RRULE:` on the VEVENT).
///
/// Format: `FREQ=X;INTERVAL=N;COUNT=N|UNTIL=...;BYDAY=...;BYMONTHDAY=...`
/// separated by `;`. Unknown keys are ignored. Returns Err for
/// missing or unrecognised FREQ. INTERVAL defaults to 1.
pub fn parse_rrule(value: &str) -> Result<RecurrenceRule, String> {
    let mut freq: Option<RecurrenceFreq> = None;
    let mut interval: u32 = 1;
    let mut count: Option<u32> = None;
    let mut until: Option<String> = None;
    let mut byday: Vec<Weekday> = Vec::new();
    let mut bymonthday: Vec<i32> = Vec::new();

    for part in value.split(';') {
        let part = part.trim();
        if part.is_empty() {
            continue;
        }
        let (k, v) = match part.split_once('=') {
            Some(kv) => kv,
            None => continue,
        };
        let k_upper = k.to_uppercase();
        match k_upper.as_str() {
            "FREQ" => {
                freq = Some(match v.to_uppercase().as_str() {
                    "DAILY" => RecurrenceFreq::Daily,
                    "WEEKLY" => RecurrenceFreq::Weekly,
                    "MONTHLY" => RecurrenceFreq::Monthly,
                    "YEARLY" => RecurrenceFreq::Yearly,
                    _ => return Err(format!("unsupported FREQ: {v}")),
                });
            }
            "INTERVAL" => {
                if let Ok(n) = v.parse::<u32>() {
                    interval = n.max(1);
                }
            }
            "COUNT" => {
                if let Ok(n) = v.parse::<u32>() {
                    count = Some(n);
                }
            }
            "UNTIL" => {
                let norm = normalize_datetime(v);
                if !norm.is_empty() {
                    until = Some(norm);
                }
            }
            "BYDAY" => {
                for d in v.split(',') {
                    let d = d.trim();
                    // Ignore positional prefix like "1MO" or "-1FR" — the
                    // simple "MO" / "WE" form is the common case.
                    let code = if d.len() > 2 { &d[d.len() - 2..] } else { d };
                    if let Some(w) = parse_weekday(code) {
                        byday.push(w);
                    }
                }
            }
            "BYMONTHDAY" => {
                for d in v.split(',') {
                    if let Ok(n) = d.trim().parse::<i32>() {
                        bymonthday.push(n);
                    }
                }
            }
            _ => {
                // Unknown keys (BYSECOND, BYHOUR, BYMONTH, BYSETPOS, …)
                // are accepted and ignored. We don't have to support
                // them to cover the common Outlook / Google / Feishu
                // patterns; tracking the ignored keys would only
                // complicate the expander.
            }
        }
    }

    Ok(RecurrenceRule {
        freq: freq.ok_or_else(|| "RRULE missing FREQ".to_string())?,
        interval,
        count,
        until,
        byday,
        bymonthday,
    })
}

fn parse_weekday(s: &str) -> Option<Weekday> {
    match s.to_uppercase().as_str() {
        "MO" => Some(Weekday::Mo),
        "TU" => Some(Weekday::Tu),
        "WE" => Some(Weekday::We),
        "TH" => Some(Weekday::Th),
        "FR" => Some(Weekday::Fr),
        "SA" => Some(Weekday::Sa),
        "SU" => Some(Weekday::Su),
        _ => None,
    }
}

fn weekday_to_chrono(w: Weekday) -> ChronoWeekday {
    match w {
        Weekday::Mo => ChronoWeekday::Mon,
        Weekday::Tu => ChronoWeekday::Tue,
        Weekday::We => ChronoWeekday::Wed,
        Weekday::Th => ChronoWeekday::Thu,
        Weekday::Fr => ChronoWeekday::Fri,
        Weekday::Sa => ChronoWeekday::Sat,
        Weekday::Su => ChronoWeekday::Sun,
    }
}

/// Expand a parsed RecurrenceRule starting at `dtstart` into a Vec of
/// UTC `DateTime` occurrences. The result is bounded by either the
/// rule's COUNT/UNTIL or the safety cap (`max_occurrences`), whichever
/// is smaller. The result is always non-empty and starts with
/// `dtstart`.
pub fn expand_occurrences(
    rule: &RecurrenceRule,
    dtstart: DateTime<Utc>,
    max_occurrences: usize,
) -> Vec<DateTime<Utc>> {
    let cap = max_occurrences.min(500);
    let count_cap = rule.count.map(|c| c as usize).unwrap_or(usize::MAX);
    let limit = count_cap.min(cap);

    let mut out: Vec<DateTime<Utc>> = Vec::new();
    out.push(dtstart);

    match rule.freq {
        RecurrenceFreq::Daily => {
            let step = chrono::Duration::days(rule.interval as i64);
            while out.len() < limit {
                let next = out.last().copied().unwrap() + step;
                if let Some(until) = &rule.until {
                    if let Ok(until_dt) = DateTime::parse_from_rfc3339(until) {
                        if next > until_dt.with_timezone(&Utc) {
                            break;
                        }
                    }
                }
                out.push(next);
            }
        }
        RecurrenceFreq::Weekly => {
            if rule.byday.is_empty() {
                // No BYDAY — repeat on the same weekday every `interval` weeks.
                let step = chrono::Duration::weeks(rule.interval as i64);
                while out.len() < limit {
                    let next = out.last().copied().unwrap() + step;
                    if let Some(until) = &rule.until {
                        if let Ok(until_dt) = DateTime::parse_from_rfc3339(until) {
                            if next > until_dt.with_timezone(&Utc) {
                                break;
                            }
                        }
                    }
                    out.push(next);
                }
            } else {
                // With BYDAY, walk forward day-by-day and pick days that
                // match. The rule's INTERVAL (= every Nth week) means
                // the BYDAY list only emits in weeks N apart from the
                // start, judged by the start's weekday.
                let target: Vec<ChronoWeekday> =
                    rule.byday.iter().copied().map(weekday_to_chrono).collect();
                let mut cursor = dtstart;
                while out.len() < limit {
                    // Walk forward `7 * interval` days, picking any
                    // matching weekday in that window.
                    for _ in 0..(7 * rule.interval) {
                        cursor += chrono::Duration::days(1);
                        if target.contains(&cursor.weekday()) {
                            let week_index = (cursor - dtstart).num_days() / 7;
                            if week_index >= 0 && (week_index as u32) % rule.interval == 0 {
                                if let Some(until) = &rule.until {
                                    if let Ok(until_dt) =
                                        DateTime::parse_from_rfc3339(until)
                                    {
                                        if cursor > until_dt.with_timezone(&Utc) {
                                            return out;
                                        }
                                    }
                                }
                                out.push(cursor);
                                if out.len() >= limit {
                                    return out;
                                }
                            }
                        }
                    }
                }
            }
        }
        RecurrenceFreq::Monthly => {
            // Day-of-month based: BYMONTHDAY if present, else dtstart's day.
            if !rule.bymonthday.is_empty() {
                // We support a flat BYMONTHDAY list by emitting one
                // occurrence per matching day in each month.
                let days: Vec<u32> = rule
                    .bymonthday
                    .iter()
                    .map(|d| if *d > 0 { *d as u32 } else { 0 })
                    .collect();
                let mut month = dtstart;
                while out.len() < limit {
                    month = add_months(month, rule.interval as i32);
                    for &d in &days {
                        if d == 0 {
                            continue; // -1 = last day handled below if needed
                        }
                        if let Some(next) = set_day_of_month(month, d) {
                            if next <= *out.last().unwrap() {
                                continue;
                            }
                            if let Some(until) = &rule.until {
                                if let Ok(until_dt) = DateTime::parse_from_rfc3339(until) {
                                    if next > until_dt.with_timezone(&Utc) {
                                        return out;
                                    }
                                }
                            }
                            out.push(next);
                            if out.len() >= limit {
                                return out;
                            }
                        }
                    }
                }
            } else {
                let base_day = dtstart.day();
                while out.len() < limit {
                    let next = add_months(*out.last().unwrap(), rule.interval as i32);
                    let next = set_day_of_month(next, base_day).unwrap_or(next);
                    if let Some(until) = &rule.until {
                        if let Ok(until_dt) = DateTime::parse_from_rfc3339(until) {
                            if next > until_dt.with_timezone(&Utc) {
                                break;
                            }
                        }
                    }
                    out.push(next);
                }
            }
        }
        RecurrenceFreq::Yearly => {
            while out.len() < limit {
                let next = out.last().copied().unwrap()
                    + chrono::Duration::days(365 * rule.interval as i64);
                if let Some(until) = &rule.until {
                    if let Ok(until_dt) = DateTime::parse_from_rfc3339(until) {
                        if next > until_dt.with_timezone(&Utc) {
                            break;
                        }
                    }
                }
                out.push(next);
            }
        }
    }

    out
}

fn add_months(dt: DateTime<Utc>, months: i32) -> DateTime<Utc> {
    let mut year = dt.year();
    let mut month = dt.month() as i32 + months;
    while month > 12 {
        month -= 12;
        year += 1;
    }
    while month < 1 {
        month += 12;
        year -= 1;
    }
    let new_naive = dt
        .with_year(year)
        .and_then(|d| d.with_month(month as u32))
        .unwrap_or(dt);
    new_naive
}

fn set_day_of_month(dt: DateTime<Utc>, day: u32) -> Option<DateTime<Utc>> {
    // If the requested day doesn't exist in the month (e.g. Feb 30),
    // skip the occurrence entirely — RFC 5545 says it's omitted.
    let next_month_first = add_months(dt, 1)
        .with_day(1)
        .and_then(|d| d.with_hour(0))
        .unwrap_or(dt);
    let last_day_of_month = (next_month_first - chrono::Duration::days(1)).day();
    if day == 0 || day > last_day_of_month {
        return None;
    }
    dt.with_day(day)
}

// ── VTIMEZONE parsing + TZID resolution ─────────────────────────────

/// One VTIMEZONE block (RFC 5545 §3.6.5). We capture just the
/// offset(s) we need to resolve a `DTSTART;TZID=X` to UTC. DST
/// transitions inside the rule's own RRULE are not evaluated —
/// we only use these to convert a *floating* local time to UTC.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct VTimezone {
    pub tzid: String,
    /// Offset in minutes (east of UTC positive) for the STANDARD
    /// sub-component, if any.
    pub standard_offset_minutes: Option<i32>,
    /// Offset in minutes for the DAYLIGHT sub-component, if any.
    pub daylight_offset_minutes: Option<i32>,
}

/// Parse all VTIMEZONE blocks in an iCal body. Each block lives
/// inside a VCALENDAR (so we walk line-by-line and match BEGIN/
/// END pairs at the right depth). The returned list may be empty.
pub fn parse_vtimezones(ics: &str) -> Vec<VTimezone> {
    let unfolded = unfold(ics);
    let mut out: Vec<VTimezone> = Vec::new();
    let mut current: Option<VTimezone> = None;
    let mut in_standard = false;
    let mut in_daylight = false;
    for raw in unfolded.lines() {
        let line = raw.trim_end_matches('\r');
        let upper = line.to_uppercase();
        if upper.starts_with("BEGIN:VTIMEZONE") {
            current = Some(VTimezone {
                tzid: String::new(),
                standard_offset_minutes: None,
                daylight_offset_minutes: None,
            });
            continue;
        }
        if upper.starts_with("END:VTIMEZONE") {
            if let Some(tz) = current.take() {
                out.push(tz);
            }
            continue;
        }
        let Some(tz) = current.as_mut() else { continue };
        if upper.starts_with("BEGIN:STANDARD") {
            in_standard = true;
            in_daylight = false;
            continue;
        }
        if upper.starts_with("END:STANDARD") {
            in_standard = false;
            continue;
        }
        if upper.starts_with("BEGIN:DAYLIGHT") {
            in_daylight = true;
            in_standard = false;
            continue;
        }
        if upper.starts_with("END:DAYLIGHT") {
            in_daylight = false;
            continue;
        }
        if let Some((name_and_params, value)) = split_property(line) {
            let key = name_and_params
                .split(';')
                .next()
                .unwrap_or("")
                .to_uppercase();
            match key.as_str() {
                "TZID" => tz.tzid = value,
                "TZOFFSETTO" => {
                    if let Some(minutes) = parse_offset_minutes(&value) {
                        if in_standard {
                            tz.standard_offset_minutes = Some(minutes);
                        } else if in_daylight {
                            tz.daylight_offset_minutes = Some(minutes);
                        }
                    }
                }
                _ => {}
            }
        }
    }
    out
}

fn parse_offset_minutes(value: &str) -> Option<i32> {
    // RFC 5545 §3.3.14: ±HHMM[SS] (positive = east of UTC). We strip
    // the seconds component for simplicity — SendPalm only displays
    // minute precision.
    let v = value.trim();
    if v.len() < 4 {
        return None;
    }
    let (sign, rest) = match v.as_bytes()[0] {
        b'+' => (1i32, &v[1..]),
        b'-' => (-1i32, &v[1..]),
        _ => (1i32, v),
    };
    let hh: i32 = rest.get(0..2)?.parse().ok()?;
    let mm: i32 = rest.get(2..4)?.parse().ok()?;
    Some(sign * (hh * 60 + mm))
}

/// Resolve a DTSTART-like value (already stripped of the `;TZID=`
/// parameter) to a UTC `DateTime`. The TZID is matched against
/// the supplied list; if no match is found or the value already
/// carries a trailing `Z` (already UTC), we fall back to treating
/// the time as floating (i.e. UTC as written, no offset).
pub fn resolve_dtstart_with_tzid(
    value: &str,
    tzid: Option<&str>,
    timezones: &[VTimezone],
) -> Option<DateTime<Utc>> {
    let v = value.trim();
    let is_utc = v.ends_with('Z');
    // Parse the body (strip trailing Z if present).
    let body = v.trim_end_matches('Z');
    // YYYYMMDD or YYYYMMDDTHHMMSS (or HHMMSS with seconds optional).
    let dt = if body.len() == 8 {
        // DATE only — treat as midnight UTC.
        let d = NaiveDate::parse_from_str(body, "%Y%m%d").ok()?;
        let t = d.and_hms_opt(0, 0, 0)?;
        Some(Utc.from_utc_datetime(&t))
    } else {
        let naive = parse_naive_datetime(body)?;
        if is_utc {
            Some(Utc.from_utc_datetime(&naive))
        } else {
            // Floating or TZID-referenced: subtract the TZID offset
            // to get UTC. Without a TZID, we treat the value as UTC
            // (an approximation that matches Feishu / Google which
            // always emit Z for cross-zone invites; real bugs would
            // show up as off-by-N-hours in the calendar view).
            let offset_minutes = tzid
                .and_then(|id| timezones.iter().find(|t| t.tzid == id))
                .and_then(|t| t.standard_offset_minutes);
            match offset_minutes {
                Some(off) => {
                    // The naive value is a *local* time in the TZID's
                    // standard offset. Use from_local_datetime to treat
                    // it as local (not UTC) before converting to UTC.
                    let fixed = chrono::FixedOffset::east_opt(off * 60)?;
                    fixed
                        .from_local_datetime(&naive)
                        .single()
                        .map(|d| d.with_timezone(&Utc))
                }
                None => Some(Utc.from_utc_datetime(&naive)),
            }
        }
    };
    dt
}

fn parse_naive_datetime(s: &str) -> Option<NaiveDateTime> {
    // YYYYMMDDTHHMMSS
    if s.len() >= 15 && s.as_bytes()[8] == b'T' {
        NaiveDateTime::parse_from_str(&s[..15], "%Y%m%dT%H%M%S").ok()
    } else {
        None
    }
}

/// Resolve a parsed IcalEvent's `dtstart` to a UTC `DateTime`, taking
/// the iCal body's VTIMEZONE blocks into account. The stored
/// `dtstart` field is the raw value (iCal form); this helper is the
/// canonical way to get the actual UTC time of the first occurrence
/// (or of a specific RDATE / EXDATE entry).
pub fn event_utc_start(ev: &IcalEvent) -> Option<DateTime<Utc>> {
    let raw = ev.dtstart.as_deref()?;
    // The `dtstart` field already went through normalize_datetime
    // (which only fixes YYYYMMDDTHHMMSSZ ↔ YYYYMMDDTHHMMSS shapes),
    // so for the UTC path we just parse the body again. For the
    // TZID path we need the original iCal value, which we don't
    // have here — the caller can pass it through `ev.dtstart_tzid`.
    // This helper is the common case (UTC invites).
    let body = raw.trim_end_matches('Z');
    let naive = parse_naive_datetime(body)?;
    if raw.ends_with('Z') || ev.dtstart_tzid.is_none() {
        Some(Utc.from_utc_datetime(&naive))
    } else {
        let id = ev.dtstart_tzid.as_deref().unwrap_or("");
        let off = ev
            .vtimezones
            .iter()
            .find(|t| t.tzid == id)
            .and_then(|t| t.standard_offset_minutes);
        match off {
            Some(o) => chrono::FixedOffset::east_opt(o * 60)
                .and_then(|f| f.from_local_datetime(&naive).single())
                .map(|d| d.with_timezone(&Utc)),
            None => Some(Utc.from_utc_datetime(&naive)),
        }
    }
}

#[cfg(test)]
fn parse_dt(s: &str) -> DateTime<Utc> {
    DateTime::parse_from_rfc3339(s)
        .expect("parse_dt fixture must be RFC3339")
        .with_timezone(&Utc)
}


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
        // REQUEST invites don't carry PARTSTAT — both ATTENDEE rows
        // have empty partstat fields.
        for ar in &ev.attendee_responses {
            assert_eq!(ar.partstat, "", "REQUEST attendee has no partstat");
        }
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
    fn parses_attendee_partstat_in_reply() {
        // A REPLY message has exactly one ATTENDEE line carrying the
        // responder's PARTSTAT. The parser must surface both the email
        // AND the partstat so the sync loop can record the response.
        let ics = "BEGIN:VCALENDAR\r\n\
METHOD:REPLY\r\n\
BEGIN:VEVENT\r\n\
UID:meeting-42\r\n\
SUMMARY:Design review\r\n\
DTSTART:20260101T100000Z\r\n\
ORGANIZER:mailto:boss@example.com\r\n\
ATTENDEE;CN=Bob;PARTSTAT=ACCEPTED;RSVP=TRUE:mailto:bob@example.com\r\n\
END:VEVENT\r\n\
END:VCALENDAR\r\n";
        let ev = parse_vevent(ics).unwrap();
        assert_eq!(ev.method.as_deref(), Some("REPLY"));
        assert_eq!(ev.attendees, vec!["bob@example.com"]);
        assert_eq!(ev.attendee_responses.len(), 1);
        let ar = &ev.attendee_responses[0];
        assert_eq!(ar.email, "bob@example.com");
        assert_eq!(ar.partstat, "ACCEPTED");
    }

    #[test]
    fn parses_multiple_attendee_partstats() {
        // Rare for REPLY but possible for forwarding scenarios or
        // when an organizer delegates one attendee's response to
        // another. The parser keeps them in order.
        let ics = "BEGIN:VCALENDAR\r\n\
METHOD:REPLY\r\n\
BEGIN:VEVENT\r\n\
UID:meeting-43\r\n\
SUMMARY:Multi\r\n\
DTSTART:20260101T100000Z\r\n\
ORGANIZER:mailto:boss@example.com\r\n\
ATTENDEE;PARTSTAT=DECLINED:mailto:bob@example.com\r\n\
ATTENDEE;PARTSTAT=TENTATIVE:mailto:carol@example.com\r\n\
END:VEVENT\r\n\
END:VCALENDAR\r\n";
        let ev = parse_vevent(ics).unwrap();
        assert_eq!(ev.attendee_responses.len(), 2);
        assert_eq!(ev.attendee_responses[0].partstat, "DECLINED");
        assert_eq!(ev.attendee_responses[1].partstat, "TENTATIVE");
    }

    #[test]
    fn build_itip_reply_escapes_special_chars() {
        let ics = "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:esc-1\r\nSUMMARY:Q1, Q2; review\r\nDTSTART:20260101T100000Z\r\nORGANIZER:mailto:boss@example.com\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";
        let original = parse_vevent(ics).unwrap();
        let reply = build_itip_reply(&original, "me@example.com", RsvpStatus::Accepted).unwrap();
        assert!(reply.contains("SUMMARY:Q1\\, Q2\\; review\r\n"));
    }

    // ── RRULE parsing + expansion ──────────────────────────────────

    #[test]
    fn parse_rrule_daily_with_count() {
        let rule = parse_rrule("FREQ=DAILY;INTERVAL=2;COUNT=5").unwrap();
        assert_eq!(rule.freq, RecurrenceFreq::Daily);
        assert_eq!(rule.interval, 2);
        assert_eq!(rule.count, Some(5));
        assert_eq!(rule.until, None);
        assert!(rule.byday.is_empty());
    }

    #[test]
    fn parse_rrule_weekly_with_byday() {
        let rule = parse_rrule("FREQ=WEEKLY;BYDAY=MO,WE,FR").unwrap();
        assert_eq!(rule.freq, RecurrenceFreq::Weekly);
        assert_eq!(rule.interval, 1);
        assert_eq!(
            rule.byday,
            vec![Weekday::Mo, Weekday::We, Weekday::Fr]
        );
    }

    #[test]
    fn parse_rrule_monthly_with_bymonthday() {
        let rule = parse_rrule("FREQ=MONTHLY;BYMONTHDAY=15,-1").unwrap();
        assert_eq!(rule.freq, RecurrenceFreq::Monthly);
        assert_eq!(rule.bymonthday, vec![15, -1]);
    }

    #[test]
    fn parse_rrule_yearly_with_until() {
        let rule = parse_rrule("FREQ=YEARLY;UNTIL=20261231T235959Z").unwrap();
        assert_eq!(rule.freq, RecurrenceFreq::Yearly);
        // UNTIL normalizes to RFC3339 (chrono emits +00:00 for UTC, not Z).
        assert_eq!(rule.until.as_deref(), Some("2026-12-31T23:59:59+00:00"));
    }

    #[test]
    fn parse_rrule_rejects_unknown_freq() {
        assert!(parse_rrule("FREQ=SECONDLY;COUNT=3").is_err());
    }

    #[test]
    fn expand_daily_count_5() {
        let rule = parse_rrule("FREQ=DAILY;COUNT=5").unwrap();
        let start = parse_dt("2026-01-01T10:00:00Z");
        let occ = expand_occurrences(&rule, start, 50);
        assert_eq!(occ.len(), 5);
        assert_eq!(occ[0], start);
        assert_eq!(occ[4], start + chrono::Duration::days(4));
    }

    #[test]
    fn expand_daily_interval_2_count_3() {
        let rule = parse_rrule("FREQ=DAILY;INTERVAL=2;COUNT=3").unwrap();
        let start = parse_dt("2026-01-01T10:00:00Z");
        let occ = expand_occurrences(&rule, start, 50);
        assert_eq!(occ.len(), 3);
        assert_eq!(occ[0], start);
        assert_eq!(occ[1], start + chrono::Duration::days(2));
        assert_eq!(occ[2], start + chrono::Duration::days(4));
    }

    #[test]
    fn expand_weekly_byday() {
        let rule = parse_rrule("FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=6").unwrap();
        let start = parse_dt("2026-01-05T10:00:00Z"); // Monday
        let occ = expand_occurrences(&rule, start, 50);
        assert_eq!(occ.len(), 6);
        // Mon, Wed, Fri, Mon, Wed, Fri — same week pattern repeated
        assert_eq!(occ[0], start);
        assert_eq!(occ[1], start + chrono::Duration::days(2)); // Wed
        assert_eq!(occ[2], start + chrono::Duration::days(4)); // Fri
        assert_eq!(occ[3], start + chrono::Duration::days(7)); // next Mon
    }

    #[test]
    fn expand_daily_until_stops_at_horizon() {
        let rule = parse_rrule("FREQ=DAILY;UNTIL=2026-01-04T10:00:00Z").unwrap();
        let start = parse_dt("2026-01-01T10:00:00Z");
        let occ = expand_occurrences(&rule, start, 50);
        // Jan 1, 2, 3, 4 — UNTIL is inclusive of the day's 10:00.
        assert_eq!(occ.len(), 4);
        assert_eq!(occ.last().unwrap(), &parse_dt("2026-01-04T10:00:00Z"));
    }

    #[test]
    fn expand_daily_caps_at_max_occurrences() {
        let rule = parse_rrule("FREQ=DAILY;COUNT=10000").unwrap();
        let start = parse_dt("2026-01-01T10:00:00Z");
        // safety cap of 500 even if COUNT/UNTIL would yield more
        let occ = expand_occurrences(&rule, start, 500);
        assert_eq!(occ.len(), 500);
    }

    // ── VTIMEZONE parsing + TZID resolution ────────────────────────

    #[test]
    fn parse_vtimezones_extracts_single_standard_offset() {
        let ics = "BEGIN:VTIMEZONE\r\nTZID:Asia/Shanghai\r\n\
                   BEGIN:STANDARD\r\nDTSTART:19700101T000000\r\nTZOFFSETFROM:+0800\r\nTZOFFSETTO:+0800\r\n\
                   END:STANDARD\r\nEND:VTIMEZONE\r\n";
        let tzs = parse_vtimezones(ics);
        assert_eq!(tzs.len(), 1);
        assert_eq!(tzs[0].tzid, "Asia/Shanghai");
        // The CST offset is +08:00. We store it as 480 minutes.
        assert_eq!(tzs[0].standard_offset_minutes, Some(480));
    }

    #[test]
    fn parse_vtimezones_extracts_daylight_for_us_eastern() {
        // America/New_York: standard = -5, daylight = -4
        let ics = "BEGIN:VTIMEZONE\r\nTZID:America/New_York\r\n\
                   BEGIN:STANDARD\r\nDTSTART:19701101T020000\r\nTZOFFSETFROM:-0400\r\nTZOFFSETTO:-0500\r\n\
                   END:STANDARD\r\n\
                   BEGIN:DAYLIGHT\r\nDTSTART:19700308T020000\r\nTZOFFSETFROM:-0500\r\nTZOFFSETTO:-0400\r\n\
                   END:DAYLIGHT\r\nEND:VTIMEZONE\r\n";
        let tzs = parse_vtimezones(ics);
        assert_eq!(tzs.len(), 1);
        assert_eq!(tzs[0].tzid, "America/New_York");
        assert_eq!(tzs[0].standard_offset_minutes, Some(-300));
        assert_eq!(tzs[0].daylight_offset_minutes, Some(-240));
    }

    #[test]
    fn resolve_dtstart_with_tzid_shanghai() {
        let ics = "BEGIN:VTIMEZONE\r\nTZID:Asia/Shanghai\r\n\
                   BEGIN:STANDARD\r\nDTSTART:19700101T000000\r\nTZOFFSETFROM:+0800\r\nTZOFFSETTO:+0800\r\n\
                   END:STANDARD\r\nEND:VTIMEZONE\r\n";
        let tzs = parse_vtimezones(ics);
        // 10:00 in Shanghai (+08:00) = 02:00 UTC
        let utc = resolve_dtstart_with_tzid("20260101T100000", Some("Asia/Shanghai"), &tzs)
            .expect("resolved");
        assert_eq!(utc.to_rfc3339(), "2026-01-01T02:00:00+00:00");
    }

    #[test]
    fn resolve_dtstart_with_unknown_tzid_falls_back() {
        // No matching VTIMEZONE — treat as floating (naive) time.
        let utc = resolve_dtstart_with_tzid("20260101T100000", Some("Mars/Olympus"), &[])
            .expect("floating fallback");
        assert_eq!(utc.to_rfc3339(), "2026-01-01T10:00:00+00:00");
    }

    #[test]
    fn resolve_dtstart_utc_unchanged() {
        // No TZID — the value is already in UTC ('Z' suffix).
        let utc = resolve_dtstart_with_tzid("20260101T100000Z", Some("ignored"), &[])
            .expect("utc");
        assert_eq!(utc.to_rfc3339(), "2026-01-01T10:00:00+00:00");
    }
}
