//! Real backend services — IMAP sync + SMTP send + MIME parse.
//!
//! See AGENTS.md §10 "Real backend integration" for the design and
//! `docs/CREDENTIALS.md` for the test account.

pub mod db;
pub mod desktop_notifier;
pub mod ical;
pub mod image_proxy;
pub mod imap;
pub mod llm;
pub mod mailbox_resolver;
pub mod parser;
pub mod providers;
pub mod scheduled_send;
pub mod smtp;
pub mod state;
pub mod sync_loop;
pub mod vault;

use serde::{Deserialize, Serialize};

/// Credentials for connecting to one email account.
/// Sourced from `tauri-plugin-store` (per-account, not from `.env` directly)
/// or, for the test account, from `.env` at startup.
///
/// SEC-4: `Debug` is implemented manually so the `password` field
/// is redacted. A `#[derive(Debug)]` on this struct would have
/// logged the password verbatim to stdout/stderr whenever a
/// `Result<EmailCredentials, _>` was `unwrap()`ed, formatted with
/// `{:?}`, or routed through `eprintln!`. The custom impl below
/// prints `password: "***"` instead.
#[derive(Clone, Serialize, Deserialize)]
pub struct EmailCredentials {
    pub email: String,
    pub password: String,
    pub imap_host: String,
    pub imap_port: u16,
    pub smtp_host: String,
    pub smtp_port: u16,
    /// `true` for SMTPS (TLS wrapper, usually port 465); `false` for STARTTLS
    /// (usually port 587).
    pub smtp_implicit_tls: bool,
}

impl std::fmt::Debug for EmailCredentials {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("EmailCredentials")
            .field("email", &self.email)
            .field("password", &"***")
            .field("imap_host", &self.imap_host)
            .field("imap_port", &self.imap_port)
            .field("smtp_host", &self.smtp_host)
            .field("smtp_port", &self.smtp_port)
            .field("smtp_implicit_tls", &self.smtp_implicit_tls)
            .finish()
    }
}

/// Load credentials from environment variables.
/// Reads `SENDPALM_TEST_*` set in `.env` (dev) or process env (release).
pub fn load_test_credentials() -> Result<EmailCredentials, String> {
    let _ = dotenvy::dotenv();
    let smtp_port = std::env::var("SENDPALM_TEST_SMTP_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(465);
    Ok(EmailCredentials {
        email: std::env::var("SENDPALM_TEST_EMAIL")
            .map_err(|e| format!("SENDPALM_TEST_EMAIL missing: {e}"))?,
        password: std::env::var("SENDPALM_TEST_PASSWORD")
            .map_err(|e| format!("SENDPALM_TEST_PASSWORD missing: {e}"))?,
        imap_host: std::env::var("SENDPALM_TEST_IMAP_HOST")
            .unwrap_or_else(|_| "imap.feishu.cn".to_string()),
        imap_port: std::env::var("SENDPALM_TEST_IMAP_PORT")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(993),
        smtp_host: std::env::var("SENDPALM_TEST_SMTP_HOST")
            .unwrap_or_else(|_| "smtp.feishu.cn".to_string()),
        smtp_port,
        smtp_implicit_tls: smtp_port == 465,
    })
}

/// Result of one IMAP sync cycle.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncReport {
    pub account_id: String,
    pub mailbox: String,
    pub new_messages: usize,
    pub skipped: usize,
    pub uid_validity: u64,
    pub last_uid: u64,
    /// IDs of messages newly inserted by this cycle, in insertion order
    /// (oldest first). The frontend uses this to prepend them to the
    /// current list view instead of triggering a full paginated refetch.
    /// Empty when new_messages == 0.
    #[serde(default)]
    pub new_message_ids: Vec<String>,
    pub error: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    /// SEC-4 regression test. A leaked password in production logs
    /// is a P0 data breach — the redaction must be present and the
    /// test must fail loudly if the field ever loses its
    /// redaction (e.g. someone replaces the manual `Debug` impl
    /// with `#[derive(Debug)]`).
    #[test]
    fn email_credentials_debug_redacts_password() {
        let c = EmailCredentials {
            email: "user@example.com".into(),
            password: "s3cret-app-password".into(),
            imap_host: "imap.example.com".into(),
            imap_port: 993,
            smtp_host: "smtp.example.com".into(),
            smtp_port: 465,
            smtp_implicit_tls: true,
        };
        let rendered = format!("{:?}", c);
        assert!(
            !rendered.contains("s3cret-app-password"),
            "EmailCredentials Debug output leaked the password: {rendered}"
        );
        assert!(
            rendered.contains("***"),
            "EmailCredentials Debug output should mask the password: {rendered}"
        );
        assert!(
            rendered.contains("user@example.com"),
            "EmailCredentials Debug output should still show the email: {rendered}"
        );
    }
}
