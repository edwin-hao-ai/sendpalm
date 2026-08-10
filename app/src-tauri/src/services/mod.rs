//! Real backend services — IMAP sync + SMTP send + MIME parse.
//!
//! See AGENTS.md §10 "Real backend integration" for the design and
//! `docs/CREDENTIALS.md` for the test account.

pub mod ical;
pub mod imap;
pub mod mailbox_resolver;
pub mod parser;
pub mod providers;
pub mod scheduled_send;
pub mod smtp;
pub mod state;
pub mod sync_loop;
pub mod desktop_notifier;
pub mod vault;

use serde::{Deserialize, Serialize};

/// Credentials for connecting to one email account.
/// Sourced from `tauri-plugin-store` (per-account, not from `.env` directly)
/// or, for the test account, from `.env` at startup.
#[derive(Debug, Clone, Serialize, Deserialize)]
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
    pub error: Option<String>,
}
