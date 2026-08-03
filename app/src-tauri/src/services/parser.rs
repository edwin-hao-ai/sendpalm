//! MIME → SendPalm schema parser.
//! Wraps `mailparse` and maps parsed RFC822 messages into our
//! `Message` and `Contact` shapes that the SQL store expects.

use crate::services::ical::{self, IcalEvent};
use chrono::{DateTime, Utc};
use mailparse::{ParsedMail, parse_mail};
use serde::{Deserialize, Serialize};

/// Lightweight message DTO sent over the Tauri IPC boundary.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedMessage {
    pub message_id: String,
    pub thread_id: Option<String>,
    pub sender_email: String,
    pub sender_name: Option<String>,
    pub subject: String,
    pub body_text: String,
    pub body_html: Option<String>,
    pub date: DateTime<Utc>,
    pub attachments: Vec<ParsedAttachment>,
    /// Parsed iCalendar VEVENT, if the message carries a `text/calendar`
    /// invitation. Serialized to JSON and persisted alongside the message
    /// so the detail panel can render an "Add to calendar" action without
    /// re-fetching the raw email.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub calendar_invite: Option<IcalEvent>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedAttachment {
    pub filename: String,
    pub mime: String,
    pub size: u64,
}

pub fn parse_email(raw: &[u8]) -> Result<ParsedMessage, String> {
    let parsed = parse_mail(raw).map_err(|e| format!("mailparse: {e}"))?;

    let message_id = header_value(&parsed.headers, "Message-ID")
        .unwrap_or_else(|| format!("local-{}", Utc::now().timestamp_millis()));
    let thread_id = header_value(&parsed.headers, "In-Reply-To");

    let (sender_email, sender_name) = parse_address_pair(&parsed.headers, "From");
    if sender_email.is_empty() {
        return Err("no From header".into());
    }

    let subject = header_value(&parsed.headers, "Subject").unwrap_or_default();

    let date = header_value(&parsed.headers, "Date")
        .and_then(|s| DateTime::parse_from_rfc2822(&s).ok())
        .map(|d| d.with_timezone(&Utc))
        .unwrap_or_else(Utc::now);

    let body_text = extract_text(&parsed).unwrap_or_default();
    let body_html = extract_html(&parsed);
    let attachments = collect_attachments(&parsed);
    let calendar_invite = extract_calendar(&parsed);

    Ok(ParsedMessage {
        message_id,
        thread_id,
        sender_email,
        sender_name,
        subject,
        body_text,
        body_html,
        date,
        attachments,
        calendar_invite,
    })
}

fn header_value(headers: &[mailparse::MailHeader<'_>], name: &str) -> Option<String> {
    headers
        .iter()
        .find(|h| h.get_key().eq_ignore_ascii_case(name))
        .map(|h| h.get_value().trim().to_string())
        .filter(|s| !s.is_empty())
}

fn parse_address_pair(headers: &[mailparse::MailHeader<'_>], name: &str) -> (String, Option<String>) {
    let raw = match header_value(headers, name) {
        Some(v) => v,
        None => return (String::new(), None),
    };
    if let Some(start) = raw.find('<') {
        if let Some(end) = raw[start..].find('>') {
            let email = raw[start + 1..start + end].trim().to_string();
            let name = raw[..start].trim().trim_matches('"').to_string();
            return (email, if name.is_empty() { None } else { Some(name) });
        }
    }
    (raw.trim().to_string(), None)
}

fn extract_text(parsed: &ParsedMail<'_>) -> Option<String> {
    // The message itself may be text (non-multipart case).
    let own = parsed.ctype.mimetype.to_lowercase();
    if own == "text/plain" {
        if let Ok(decoded) = parsed.get_body() {
            return Some(decoded);
        }
    }
    let mut best: Option<String> = None;
    for part in &parsed.subparts {
        let ctype = part.ctype.mimetype.to_lowercase();
        if ctype == "text/plain" {
            if let Ok(decoded) = part.get_body() {
                return Some(decoded);
            }
        } else if ctype == "text/html" && best.is_none() {
            if let Ok(decoded) = part.get_body() {
                best = Some(decoded);
            }
        }
        if let Some(t) = extract_text(part) {
            return Some(t);
        }
    }
    // Fall back to the message's own HTML body if no text/plain was found.
    if own == "text/html" {
        if let Ok(decoded) = parsed.get_body() {
            return Some(decoded);
        }
    }
    best
}

fn extract_html(parsed: &ParsedMail<'_>) -> Option<String> {
    let own = parsed.ctype.mimetype.to_lowercase();
    if own == "text/html" {
        if let Ok(decoded) = parsed.get_body() {
            return Some(decoded);
        }
    }
    for part in &parsed.subparts {
        let ctype = part.ctype.mimetype.to_lowercase();
        if ctype == "text/html" {
            if let Ok(decoded) = part.get_body() {
                return Some(decoded);
            }
        }
        if let Some(h) = extract_html(part) {
            return Some(h);
        }
    }
    None
}

fn collect_attachments(parsed: &ParsedMail<'_>) -> Vec<ParsedAttachment> {
    let mut out = Vec::new();
    walk_attachments(parsed, &mut out);
    out
}

/// Walk the MIME tree looking for the first `text/calendar` part with a
/// `method` of REQUEST (or no method, which is the common single-invite case).
/// Returns the parsed VEVENT, or `None` if the message has no invite.
fn extract_calendar(parsed: &ParsedMail<'_>) -> Option<IcalEvent> {
    let mut buf: Option<String> = None;
    walk_calendar(parsed, &mut buf);
    buf.and_then(|ics| ical::parse_vevent(&ics))
}

fn walk_calendar(m: &ParsedMail<'_>, out: &mut Option<String>) {
    if out.is_some() {
        return;
    }
    let ctype = m.ctype.mimetype.to_lowercase();
    if ctype == "text/calendar" {
        if let Ok(body) = m.get_body() {
            *out = Some(body);
            return;
        }
    }
    for part in &m.subparts {
        walk_calendar(part, out);
        if out.is_some() {
            return;
        }
    }
}

fn header_is(headers: &[mailparse::MailHeader<'_>], name: &str) -> bool {
    headers.iter().any(|h| h.get_key().eq_ignore_ascii_case(name))
}

fn header_value_at(headers: &[mailparse::MailHeader<'_>], name: &str) -> Option<String> {
    headers
        .iter()
        .find(|h| h.get_key().eq_ignore_ascii_case(name))
        .map(|h| h.get_value())
}

fn walk_attachments(m: &ParsedMail<'_>, out: &mut Vec<ParsedAttachment>) {
    for part in &m.subparts {
        let cd = part.ctype.mimetype.to_lowercase();
        let is_attachment = header_is(&part.headers, "Content-Disposition")
            && header_value_at(&part.headers, "Content-Disposition")
                .map(|v| v.to_lowercase().contains("attachment"))
                .unwrap_or(false);
        if is_attachment || (!cd.starts_with("text/") && !cd.starts_with("multipart/")) {
            let cd_header = header_value_at(&part.headers, "Content-Disposition");
            let ct_header = header_value_at(&part.headers, "Content-Type");
            let filename = cd_header
                .as_deref()
                .and_then(extract_filename)
                .or_else(|| ct_header.as_deref().and_then(extract_name))
                .unwrap_or_else(|| format!("attachment-{}", out.len()));
            let size = part.raw_bytes.len() as u64;
            out.push(ParsedAttachment {
                filename,
                mime: cd,
                size,
            });
        }
        walk_attachments(part, out);
    }
}

fn extract_filename(cd: &str) -> Option<String> {
    let idx = cd.find("filename=")?;
    let rest = &cd[idx + 9..];
    let trimmed = rest.trim_start_matches('"').trim_start_matches('\'');
    let end = trimmed
        .find(';')
        .or_else(|| trimmed.find('"'))
        .or_else(|| trimmed.find('\''))
        .unwrap_or(trimmed.len());
    Some(trimmed[..end].trim_matches(|c| c == '"' || c == '\'').to_string())
}

fn extract_name(ct: &str) -> Option<String> {
    let idx = ct.find("name=")?;
    let rest = &ct[idx + 5..];
    let trimmed = rest.trim_start_matches('"').trim_start_matches('\'');
    let end = trimmed.find(';').unwrap_or(trimmed.len());
    Some(trimmed[..end].trim_matches(|c| c == '"' || c == '\'').to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    const RFC822_FIXTURE: &str = "From: Alice Example <alice@example.com>\r\n\
To: Bob Receiver <bob@example.com>\r\n\
Subject: Test message\r\n\
Date: Mon, 1 Jan 2024 10:00:00 +0000\r\n\
Message-ID: <abc123@example.com>\r\n\
MIME-Version: 1.0\r\n\
Content-Type: text/plain; charset=utf-8\r\n\
\r\n\
Hello world!\r\n";

    #[test]
    fn parses_basic_headers() {
        let parsed = parse_email(RFC822_FIXTURE.as_bytes()).unwrap();
        assert_eq!(parsed.message_id, "<abc123@example.com>");
        assert_eq!(parsed.sender_email, "alice@example.com");
        assert_eq!(parsed.sender_name.as_deref(), Some("Alice Example"));
        assert_eq!(parsed.subject, "Test message");
        assert_eq!(parsed.body_text, "Hello world!\r\n");
        assert_eq!(parsed.date.to_rfc3339(), "2024-01-01T10:00:00+00:00");
    }

    #[test]
    fn extracts_thread_id() {
        let raw = "From: a@a.com\r\nSubject: s\r\n\
Message-ID: <m1@a.com>\r\nIn-Reply-To: <m0@a.com>\r\n\r\nbody\r\n";
        let p = parse_email(raw.as_bytes()).unwrap();
        assert_eq!(p.message_id, "<m1@a.com>");
        assert_eq!(p.thread_id.as_deref(), Some("<m0@a.com>"));
    }

    #[test]
    fn parses_html_part() {
        let raw = "From: a@a.com\r\n\
Subject: html\r\n\
Message-ID: <h@a.com>\r\n\
MIME-Version: 1.0\r\n\
Content-Type: multipart/alternative; boundary=BOUND\r\n\
\r\n\
--BOUND\r\n\
Content-Type: text/plain\r\n\
\r\n\
hi\r\n\
--BOUND\r\n\
Content-Type: text/html\r\n\
\r\n\
<p>hi</p>\r\n\
--BOUND--\r\n";
        let p = parse_email(raw.as_bytes()).unwrap();
        assert_eq!(p.body_text, "hi");
        assert!(p.body_html.as_deref().unwrap_or("").starts_with("<p>hi</p>"));
    }
}