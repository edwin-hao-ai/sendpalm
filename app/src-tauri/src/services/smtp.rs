//! SMTP send via `lettre`.
//! Wraps lettere's async SMTP transport with our `EmailCredentials`.

use super::EmailCredentials;
use lettre::{
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
}

/// Pure constructor test (no network).
#[cfg(test)]
mod tests {
    use super::*;

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
