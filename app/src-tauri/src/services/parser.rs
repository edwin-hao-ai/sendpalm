//! MIME → SendPalm schema parser.
//! Wraps `mailparse` and maps parsed RFC822 messages into our
//! `Message` and `Contact` shapes that the SQL store expects.

use crate::services::ical::{self, IcalEvent};
use base64::Engine;
use chrono::{DateTime, Utc};
use mailparse::{parse_mail, ParsedMail};
use serde::{Deserialize, Serialize};

/// Lightweight message DTO sent over the Tauri IPC boundary.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedMessage {
    pub message_id: String,
    pub thread_id: Option<String>,
    pub sender_email: String,
    pub sender_name: Option<String>,
    pub to_addr: String,
    pub cc: Vec<String>,
    pub bcc: Vec<String>,
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
    /// Content-ID for inline image references (`cid:<content-id>`).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content_id: Option<String>,
    /// Decoded attachment bytes. Kept in memory during sync so the sync loop
    /// can persist them to the app data directory without re-parsing the raw
    /// RFC822 message.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<Vec<u8>>,
}

pub fn parse_email(raw: &[u8]) -> Result<ParsedMessage, String> {
    let parsed = parse_mail(raw).map_err(|e| format!("mailparse: {e}"))?;

    let message_id = header_value(&parsed.headers, "Message-ID")
        .unwrap_or_else(|| format!("local-{}", Utc::now().timestamp_millis()));
    let thread_id = header_value(&parsed.headers, "In-Reply-To").or_else(|| {
        // Gmail-style threading: the first entry in References is the
        // conversation root when In-Reply-To is absent.
        header_value(&parsed.headers, "References")
            .and_then(|s| s.split_whitespace().next().map(|r| r.to_string()))
    });

    let (sender_email, sender_name) = parse_address_pair(&parsed.headers, "From");
    if sender_email.is_empty() {
        return Err("no From header".into());
    }

    let to_addr = parse_address_list(&parsed.headers, "To");
    let cc = parse_address_list(&parsed.headers, "Cc");
    let bcc = parse_address_list(&parsed.headers, "Bcc");

    let subject = header_value(&parsed.headers, "Subject").unwrap_or_default();

    let date = header_value(&parsed.headers, "Date")
        .and_then(|s| DateTime::parse_from_rfc2822(&s).ok())
        .map(|d| d.with_timezone(&Utc))
        .unwrap_or_else(Utc::now);

    let body_text = extract_text(&parsed).unwrap_or_default();
    let attachments = collect_attachments(&parsed);
    let body_html = extract_html(&parsed).map(|html| rewrite_inline_images(&html, &attachments));
    let calendar_invite = extract_calendar(&parsed);

    Ok(ParsedMessage {
        message_id,
        thread_id,
        sender_email,
        sender_name,
        to_addr: to_addr.first().cloned().unwrap_or_default(),
        cc,
        bcc,
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

fn parse_address_pair(
    headers: &[mailparse::MailHeader<'_>],
    name: &str,
) -> (String, Option<String>) {
    let header = match headers
        .iter()
        .find(|h| h.get_key().eq_ignore_ascii_case(name))
    {
        Some(h) => h,
        None => return (String::new(), None),
    };
    match mailparse::addrparse_header(header) {
        Ok(list) => {
            for addr in list.iter() {
                if let mailparse::MailAddr::Single(info) = addr {
                    return (
                        info.addr.trim().to_string(),
                        info.display_name
                            .as_ref()
                            .map(|s| s.trim().to_string())
                            .filter(|s| !s.is_empty()),
                    );
                }
            }
        }
        Err(e) => eprintln!("[parser] failed to parse {name}: {e}"),
    }
    (String::new(), None)
}

fn parse_address_list(headers: &[mailparse::MailHeader<'_>], name: &str) -> Vec<String> {
    let header = match headers
        .iter()
        .find(|h| h.get_key().eq_ignore_ascii_case(name))
    {
        Some(h) => h,
        None => return Vec::new(),
    };
    match mailparse::addrparse_header(header) {
        Ok(list) => list
            .iter()
            .flat_map(|addr| match addr {
                mailparse::MailAddr::Single(info) => {
                    vec![info.addr.trim().to_string()]
                }
                mailparse::MailAddr::Group(group) => group
                    .addrs
                    .iter()
                    .map(|m| m.addr.trim().to_string())
                    .collect::<Vec<_>>(),
            })
            .filter(|s| !s.is_empty())
            .collect(),
        Err(e) => {
            eprintln!("[parser] failed to parse {name}: {e}");
            Vec::new()
        }
    }
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

/// Replace `cid:<content-id>` references in an HTML body with base64 data URLs
/// so the message detail iframe can render inline images without an external
/// image-loading policy.
fn rewrite_inline_images(html: &str, attachments: &[ParsedAttachment]) -> String {
    let mut out = html.to_string();
    for att in attachments {
        let Some(cid) = &att.content_id else { continue };
        let Some(bytes) = &att.content else { continue };
        if !att.mime.starts_with("image/") {
            continue;
        }
        let b64 = base64::engine::general_purpose::STANDARD.encode(bytes);
        let data_url = format!("data:{};base64,{}", att.mime, b64);
        // Match quoted cid references (cid:"id") and plain ones (cid:id).
        let quoted = format!("cid:\"{}\"", cid);
        let plain = format!("cid:{}", cid);
        out = out.replace(&quoted, &data_url);
        out = out.replace(&plain, &data_url);
    }
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
    headers
        .iter()
        .any(|h| h.get_key().eq_ignore_ascii_case(name))
}

fn header_value_at(headers: &[mailparse::MailHeader<'_>], name: &str) -> Option<String> {
    headers
        .iter()
        .find(|h| h.get_key().eq_ignore_ascii_case(name))
        .map(|h| h.get_value())
}

pub fn file_type_from_mime(mime: &str) -> &'static str {
    let m = mime.to_lowercase();
    if m.starts_with("image/") {
        "image"
    } else if m == "application/pdf" {
        "pdf"
    } else if m.contains("spreadsheet") || m.contains("excel") || m.contains("csv") {
        "spreadsheet"
    } else if m.contains("word") || m.contains("document") || m.contains("opendocument.text") {
        "doc"
    } else {
        "other"
    }
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
            let content = part.get_body_raw().ok();
            let size = content.as_ref().map(|b| b.len() as u64).unwrap_or(0);
            let content_id = header_value_at(&part.headers, "Content-ID")
                .map(|s| {
                    s.trim()
                        .trim_start_matches('<')
                        .trim_end_matches('>')
                        .to_string()
                })
                .filter(|s| !s.is_empty());
            out.push(ParsedAttachment {
                filename,
                mime: cd,
                size,
                content_id,
                content,
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
    Some(
        trimmed[..end]
            .trim_matches(|c| c == '"' || c == '\'')
            .to_string(),
    )
}

fn extract_name(ct: &str) -> Option<String> {
    let idx = ct.find("name=")?;
    let rest = &ct[idx + 5..];
    let trimmed = rest.trim_start_matches('"').trim_start_matches('\'');
    let end = trimmed.find(';').unwrap_or(trimmed.len());
    Some(
        trimmed[..end]
            .trim_matches(|c| c == '"' || c == '\'')
            .to_string(),
    )
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
    fn extracts_thread_id_from_references() {
        let raw = "From: a@a.com\r\nSubject: s\r\n\
Message-ID: <m2@a.com>\r\nReferences: <m0@a.com> <m1@a.com>\r\n\r\nbody\r\n";
        let p = parse_email(raw.as_bytes()).unwrap();
        assert_eq!(p.thread_id.as_deref(), Some("<m0@a.com>"));
    }

    #[test]
    fn parses_recipient_headers() {
        let raw = "From: Alice <alice@example.com>\r\n\
To: Bob <bob@example.com>, Carol <carol@example.com>\r\n\
Cc: Dave <dave@example.com>\r\n\
Bcc: Eve <eve@example.com>\r\n\
Subject: recipients\r\nMessage-ID: <r@example.com>\r\n\r\nbody\r\n";
        let p = parse_email(raw.as_bytes()).unwrap();
        assert_eq!(p.to_addr, "bob@example.com");
        assert_eq!(p.cc, vec!["dave@example.com"]);
        assert_eq!(p.bcc, vec!["eve@example.com"]);
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
        assert!(p
            .body_html
            .as_deref()
            .unwrap_or("")
            .starts_with("<p>hi</p>"));
    }

    #[test]
    fn decodes_attachment() {
        // base64-encoded "hello attachment"
        let b64 = base64::engine::Engine::encode(
            &base64::engine::general_purpose::STANDARD,
            b"hello attachment",
        );
        let raw = format!(
            "From: a@a.com\r\n\
Subject: with attachment\r\n\
Message-ID: <att@a.com>\r\n\
MIME-Version: 1.0\r\n\
Content-Type: multipart/mixed; boundary=BOUND\r\n\
\r\n\
--BOUND\r\n\
Content-Type: text/plain\r\n\
\r\n\
see attached\r\n\
--BOUND\r\n\
Content-Type: application/octet-stream; name=\"test.txt\"\r\n\
Content-Disposition: attachment; filename=\"test.txt\"\r\n\
Content-Transfer-Encoding: base64\r\n\
\r\n\
{b64}\r\n\
--BOUND--\r\n"
        );
        let p = parse_email(raw.as_bytes()).unwrap();
        assert_eq!(p.body_text, "see attached");
        assert_eq!(p.attachments.len(), 1);
        let att = &p.attachments[0];
        assert_eq!(att.filename, "test.txt");
        assert_eq!(att.content.as_deref(), Some(b"hello attachment".as_slice()));
    }

    #[test]
    fn rewrites_inline_image_cid_to_data_url() {
        let image_bytes = b"\x89PNG\r\n\x1a\n";
        let b64 =
            base64::engine::Engine::encode(&base64::engine::general_purpose::STANDARD, image_bytes);
        let raw = format!(
            "From: a@a.com\r\n\
Subject: inline\r\n\
Message-ID: <inline@a.com>\r\n\
MIME-Version: 1.0\r\n\
Content-Type: multipart/related; boundary=BOUND\r\n\
\r\n\
--BOUND\r\n\
Content-Type: text/html\r\n\
\r\n\
<html><body><img src=\"cid:image001\"></body></html>\r\n\
--BOUND\r\n\
Content-Type: image/png; name=\"pixel.png\"\r\n\
Content-Disposition: inline\r\n\
Content-ID: <image001>\r\n\
Content-Transfer-Encoding: base64\r\n\
\r\n\
{b64}\r\n\
--BOUND--\r\n"
        );
        let p = parse_email(raw.as_bytes()).unwrap();
        let html = p.body_html.as_deref().unwrap();
        assert!(
            html.contains("data:image/png;base64,"),
            "expected data URL in html, got: {}",
            html
        );
        assert!(!html.contains("cid:image001"));
    }
}
