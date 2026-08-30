//! SMTP send via `lettre`.
//! Wraps lettere's async SMTP transport with our `EmailCredentials`.

use super::EmailCredentials;
use lettre::{
    address::Envelope,
    message::{header::ContentType, Attachment, Mailbox, MultiPart, SinglePart},
    transport::smtp::authentication::Credentials,
    AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor,
};

/// Attachment bytes + metadata to include in an outgoing message.
#[derive(Debug, Clone)]
pub struct OutgoingAttachment {
    pub filename: String,
    pub mime: String,
    pub bytes: Vec<u8>,
}
use std::sync::Arc;
use tokio::sync::Mutex;

/// Strip CR/LF/NUL from an RFC822 header value to prevent header-injection
/// (CVE-style: `Subject: foo\r\nBcc: attacker@evil.com`).
///
/// Per RFC 5322 §3.6.8, header values may not contain CR or LF outside of
/// a quoted-string + quoted-pair. We use whitespace folding instead of
/// quoting because the same string also flows into envelope parameters
/// (e.g. the RCPT-TO argument) where quoting is invalid.
pub fn fold_header_value(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            '\r' | '\n' | '\0' => ' ',
            _ => c,
        })
        .collect::<String>()
        .trim()
        .to_string()
}

/// One SMTP connection per account, lazily opened. Reused across sends.
#[derive(Clone)]
pub struct SmtpClient {
    inner: Arc<Mutex<Option<AsyncSmtpTransport<Tokio1Executor>>>>,
    creds: EmailCredentials,
}

impl SmtpClient {
    pub fn new(creds: EmailCredentials) -> Self {
        Self {
            inner: Arc::new(Mutex::new(None)),
            creds,
        }
    }

    pub fn creds(&self) -> &EmailCredentials {
        &self.creds
    }

    /// Send a plain text / HTML / multipart message and return the RFC822 Message-ID the server accepted.
    #[allow(clippy::too_many_arguments)]
    pub async fn send(
        &self,
        from: &str,
        to: &[String],
        cc: &[String],
        bcc: &[String],
        reply_to: Option<&str>,
        subject: &str,
        body: &str,
        html_body: Option<String>,
        attachments: Vec<OutgoingAttachment>,
    ) -> Result<String, String> {
        let from_mb: Mailbox = from.parse().map_err(|e| format!("bad from: {e}"))?;
        let to_mbs = Self::parse_recipients(to).map_err(|e| format!("bad to: {e}"))?;
        let cc_mbs = Self::parse_recipients(cc).map_err(|e| format!("bad cc: {e}"))?;
        let bcc_mbs = Self::parse_recipients(bcc).map_err(|e| format!("bad bcc: {e}"))?;
        let message_id = format!("<sendpalm-{}@sendpalm>", uuid::Uuid::new_v4());

        let reply_to_mb = reply_to
            .filter(|s| !s.trim().is_empty())
            .map(|s| s.parse::<Mailbox>())
            .transpose()
            .map_err(|e| format!("bad reply-to: {e}"))?;

        let message = Self::build_message(
            &from_mb,
            &to_mbs,
            &cc_mbs,
            &bcc_mbs,
            reply_to_mb.as_ref(),
            subject,
            &message_id,
            body,
            html_body,
            attachments,
        )?;

        let transport = self.transport().await?;
        transport
            .send(message)
            .await
            .map(|_| message_id)
            .map_err(|e| format!("smtp send: {e}"))
    }

    #[allow(clippy::too_many_arguments)]
    fn build_message(
        from: &Mailbox,
        to: &[Mailbox],
        cc: &[Mailbox],
        bcc: &[Mailbox],
        reply_to: Option<&Mailbox>,
        subject: &str,
        message_id: &str,
        body: &str,
        html_body: Option<String>,
        attachments: Vec<OutgoingAttachment>,
    ) -> Result<Message, String> {
        let mut body_part =
            MultiPart::alternative().singlepart(SinglePart::plain(body.to_string()));
        if let Some(html) = html_body {
            body_part = body_part.singlepart(SinglePart::html(html));
        }
        let multipart = if attachments.is_empty() {
            body_part
        } else {
            let mut mixed = MultiPart::mixed().multipart(body_part);
            for att in attachments {
                let ct = ContentType::parse(&att.mime)
                    .map_err(|e| format!("bad mime {}: {e}", att.mime))?;
                let part = Attachment::new(att.filename).body(att.bytes, ct);
                mixed = mixed.singlepart(part);
            }
            mixed
        };

        let mut builder = Message::builder()
            .from(from.clone())
            .subject(subject)
            .message_id(Some(message_id.to_owned()));
        if let Some(rt) = reply_to {
            builder = builder.reply_to(rt.clone());
        }
        for mb in to {
            builder = builder.to(mb.clone());
        }
        for mb in cc {
            builder = builder.cc(mb.clone());
        }
        for mb in bcc {
            builder = builder.bcc(mb.clone());
        }
        builder
            .multipart(multipart)
            .map_err(|e| format!("build: {e}"))
    }

    fn parse_recipients(addrs: &[String]) -> Result<Vec<Mailbox>, String> {
        addrs
            .iter()
            .filter(|s| !s.trim().is_empty())
            .map(|s| s.parse().map_err(|e| format!("{s}: {e}")))
            .collect()
    }

    async fn transport(&self) -> Result<AsyncSmtpTransport<Tokio1Executor>, String> {
        let mut guard = self.inner.lock().await;
        if let Some(t) = guard.as_ref() {
            return Ok(t.clone());
        }
        let creds = Credentials::new(self.creds.email.clone(), self.creds.password.clone());
        let builder = if self.creds.smtp_implicit_tls {
            AsyncSmtpTransport::<Tokio1Executor>::relay(&self.creds.smtp_host)
                .map_err(|e| format!("smtp relay: {e}"))?
        } else {
            AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&self.creds.smtp_host)
                .map_err(|e| format!("smtp starttls relay: {e}"))?
        };
        let t: AsyncSmtpTransport<Tokio1Executor> = builder
            .port(self.creds.smtp_port)
            .credentials(creds)
            .build();
        *guard = Some(t.clone());
        Ok(t)
    }

    /// Send an iTip REPLY (or any other iTip method) email to the organizer.
    /// The body is a full VCALENDAR payload sent as the only MIME part with
    /// Content-Type: text/calendar; method=REPLY; charset=utf-8.
    pub async fn send_itip_reply(
        &self,
        from: &str,
        to: &str,
        subject: &str,
        ics_body: &str,
        responder_email: &str,
    ) -> Result<String, String> {
        // P0-1: strip CRLF/NUL from headers interpolated into the raw
        // RFC822 message — `subject` originates from an attacker-controlled
        // iCal SUMMARY (unescape_text preserves CR/LF in source). Without
        // this, `Subject: foo\r\nBcc: attacker@evil.com` becomes a real
        // Bcc header in the outgoing mail.
        let from = fold_header_value(from);
        let to = fold_header_value(to);
        let subject = fold_header_value(subject);

        let from_addr: lettre::Address = from
            .parse()
            .map_err(|e| format!("bad from: {e}"))?;
        let to_addr: lettre::Address = to.parse().map_err(|e| format!("bad to: {e}"))?;
        let message_id = format!("<sendpalm-itip-{}@sendpalm>", uuid::Uuid::new_v4());

        // Hand-build the raw RFC822 message so we can pin the
        // `Content-Type: text/calendar; method=REPLY` header exactly.
        // lettre's `Message::builder` API doesn't expose per-MIME-part
        // headers cleanly enough for this.
        //
        // P0-1: ics_body is a MIME body part; CRLF inside it is legitimate
        // (the iCal line-folding), so we do NOT fold it. We only fold the
        // header-line values above.
        let raw = format!(
            "From: {from}\r\n\
To: {to}\r\n\
Subject: {subject}\r\n\
Date: {date}\r\n\
Message-ID: {message_id}\r\n\
MIME-Version: 1.0\r\n\
Content-Type: text/calendar; charset=utf-8; method=REPLY\r\n\
Content-Transfer-Encoding: 8bit\r\n\
\r\n\
{ics_body}",
            date = chrono::Utc::now().format("%a, %d %b %Y %H:%M:%S +0000"),
        );

        let transport = self.transport().await?;
        let envelope = Envelope::new(Some(from_addr), vec![to_addr])
            .map_err(|e| format!("itip envelope: {e}"))?;
        transport
            .send_raw(&envelope, raw.as_bytes())
            .await
            .map(|_| {
                // Touch `responder_email` so the parameter isn't unused
                // — callers pass it explicitly for logging/correlation.
                let _ = responder_email;
                message_id
            })
            .map_err(|e| format!("smtp itip send: {e}"))
    }
}

/// Pure constructor test (no network).
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_crlf_injection() {
        // Classic CRLF injection: insert a Bcc header into a Subject.
        // The CR/LF must go — without it, RFC822 parsers would treat
        // "Bcc: ..." as the start of a new header line.
        let raw = "foo\r\nBcc: attacker@evil.com";
        let out = fold_header_value(raw);
        assert!(!out.contains('\r'), "CR survived: {out:?}");
        assert!(!out.contains('\n'), "LF survived: {out:?}");
        // Verify the output is a single line (no embedded CRLF) — even
        // though "Bcc:" may appear in the text, the parser cannot see
        // it as a header boundary.
        assert_eq!(out.lines().count(), 1, "must be one line: {out:?}");
    }

    #[test]
    fn prevents_bcc_header_injection_end_to_end() {
        // A more thorough check: the folded value, prefixed with a
        // "Subject: " header, must NOT contain any line that starts
        // with a header name. This simulates what an SMTP receiver
        // sees.
        let raw = "hi\r\nBcc: attacker@evil.com\r\nX: y";
        let folded = fold_header_value(raw);
        let envelope = format!("Subject: {folded}\r\n");
        // After "Subject: hi Bcc: attacker@evil.com X: y", no line
        // except the first should look like a header (i.e. the second
        // and later lines must not start with a bare header name).
        let lines: Vec<&str> = envelope.split("\r\n").collect();
        for line in &lines[1..] {
            // A header line has form "Name: value" with Name
            // containing no spaces. The folded value uses spaces
            // only, so any "Name:" after a space can't start a line.
            assert!(
                !line.contains(':') || line.starts_with(' '),
                "possible injected header line: {line:?}"
            );
        }
    }

    #[test]
    fn strips_lone_lf() {
        let raw = "Subject\nwith\nnewlines";
        assert_eq!(fold_header_value(raw), "Subject with newlines");
    }

    #[test]
    fn strips_nul() {
        let raw = "addr\0@evil.com";
        assert!(!fold_header_value(raw).contains('\0'));
    }

    #[test]
    fn preserves_normal_text() {
        assert_eq!(fold_header_value("hello world"), "hello world");
        assert_eq!(fold_header_value("中文主题"), "中文主题");
    }

    #[test]
    fn builds_without_network() {
        let creds = EmailCredentials {
            email: "a@b.com".into(),
            password: "x".into(),
            imap_host: "imap.b.com".into(),
            imap_port: 993,
            smtp_host: "smtp.b.com".into(),
            smtp_port: 465,
            smtp_implicit_tls: true,
        };
        let _ = SmtpClient::new(creds);
    }

    #[test]
    fn builds_plain_message_without_attachments() {
        let from: Mailbox = "a@b.com".parse().unwrap();
        let to: Vec<Mailbox> = vec!["c@d.com".parse().unwrap()];
        let msg = SmtpClient::build_message(
            &from,
            &to,
            &[],
            &[],
            None,
            "hello",
            "<id@sendpalm>",
            "body text",
            None,
            vec![],
        )
        .unwrap();
        let bytes = msg.formatted();
        let raw = String::from_utf8_lossy(&bytes);
        assert!(raw.contains("multipart/alternative"));
        assert!(!raw.contains("multipart/mixed"));
    }

    #[test]
    fn builds_multipart_mixed_with_attachment() {
        let from: Mailbox = "a@b.com".parse().unwrap();
        let to: Vec<Mailbox> = vec!["c@d.com".parse().unwrap()];
        let cc: Vec<Mailbox> = vec!["e@f.com".parse().unwrap()];
        let msg = SmtpClient::build_message(
            &from,
            &to,
            &cc,
            &[],
            None,
            "hello",
            "<id@sendpalm>",
            "body text",
            None,
            vec![OutgoingAttachment {
                filename: "note.txt".to_string(),
                mime: "text/plain".to_string(),
                bytes: b"attachment body".to_vec(),
            }],
        )
        .unwrap();
        let bytes = msg.formatted();
        let raw = String::from_utf8_lossy(&bytes);
        assert!(raw.contains("multipart/mixed"));
        assert!(raw.contains("Content-Disposition: attachment"));
        assert!(raw.contains("filename=\"note.txt\""));
        assert!(raw.contains("Cc: e@f.com"));
        assert!(raw.contains("attachment body"));
    }

    #[test]
    fn builds_html_alternative_when_html_body_supplied() {
        let from: Mailbox = "a@b.com".parse().unwrap();
        let to: Vec<Mailbox> = vec!["c@d.com".parse().unwrap()];
        let msg = SmtpClient::build_message(
            &from,
            &to,
            &[],
            &[],
            None,
            "hello",
            "<id@sendpalm>",
            "plain text",
            Some("<p>html body</p>".to_string()),
            vec![],
        )
        .unwrap();
        let bytes = msg.formatted();
        let raw = String::from_utf8_lossy(&bytes);
        assert!(raw.contains("multipart/alternative"));
        assert!(raw.contains("Content-Type: text/plain"));
        assert!(raw.contains("Content-Type: text/html"));
        assert!(raw.contains("plain text"));
        assert!(raw.contains("<p>html body</p>"));
    }
}
