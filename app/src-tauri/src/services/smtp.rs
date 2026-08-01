//! SMTP send via `lettre`.
//! Wraps lettere's async SMTP transport with our `EmailCredentials`.

use super::EmailCredentials;
use lettre::{
    AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor,
    message::{Mailbox, MultiPart, SinglePart},
    transport::smtp::authentication::Credentials,
};
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

    /// Send a plain text message and return the RFC822 Message-ID the server accepted.
    pub async fn send(&self, from: &str, to: &str, subject: &str, body: &str) -> Result<String, String> {
        let from_mb: Mailbox = from.parse().map_err(|e| format!("bad from: {e}"))?;
        let to_mb: Mailbox = to.parse().map_err(|e| format!("bad to: {e}"))?;
        let message_id = format!("<sendpalm-{}@sendpalm>", uuid::Uuid::new_v4());

        let message = Message::builder()
            .from(from_mb)
            .to(to_mb)
            .subject(subject)
            .message_id(Some(message_id.clone()))
            .multipart(
                MultiPart::alternative().singlepart(SinglePart::plain(body.to_string())),
            )
            .map_err(|e| format!("build: {e}"))?;

        let transport = self.transport().await?;
        transport
            .send(message)
            .await
            .map(|_| message_id)
            .map_err(|e| format!("smtp send: {e}"))
    }

    async fn transport(&self) -> Result<AsyncSmtpTransport<Tokio1Executor>, String> {
        let mut guard = self.inner.lock().await;
        if let Some(t) = guard.as_ref() {
            return Ok(t.clone());
        }
        let creds = Credentials::new(self.creds.email.clone(), self.creds.password.clone());
        let t: AsyncSmtpTransport<Tokio1Executor> =
            AsyncSmtpTransport::<Tokio1Executor>::relay(&self.creds.smtp_host)
                .map_err(|e| format!("smtp relay: {e}"))?
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
        };
        let _ = SmtpClient::new(creds);
    }
}