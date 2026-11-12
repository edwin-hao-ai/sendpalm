//! One outbound-mail path shared by the Tauri command and the MCP tools.
//!
//! `commands::send_message` used to own all of this (account/alias resolution,
//! auto-BCC, signature, attachments, `In-Reply-To`, and the local Sent copy).
//! The MCP send/reply/forward tools need exactly the same behaviour but have no
//! `AppHandle`, so the logic moved here and the command became a thin wrapper.
//! Two copies of this would drift on the first change to signatures or BCC.

use std::path::{Path, PathBuf};

use crate::services::smtp::{OutgoingAttachment, SmtpClient};

/// A fully-specified outbound message, before account defaults are applied.
#[derive(Debug, Clone)]
pub struct SendRequest {
    /// Comma-separated, matching what the IPC command accepted.
    pub to: String,
    pub subject: String,
    pub body: String,
    pub html_body: Option<String>,
    pub cc: Option<String>,
    pub bcc: Option<String>,
    pub account_id: Option<String>,
    /// Explicit alias for the From display name; wins over the account default.
    pub from_override: Option<String>,
    /// RFC 5322 Message-ID being replied to.
    pub in_reply_to: Option<String>,
    pub attachments: Vec<OutgoingAttachment>,
}

pub struct SendOutcome {
    /// Generated Message-ID — what a `In-Reply-To` on a later mail would use.
    pub message_id: String,
    /// Row id of the local Sent copy, when one could be written.
    pub local_message_id: Option<String>,
}

/// App-data directory, derived the same way the SQLite path is. Kept here so
/// callers with only a pool (the MCP gateway) can still write the Sent copy.
fn data_dir() -> Option<PathBuf> {
    crate::services::sync_loop::db_path().parent().map(|p| p.to_path_buf())
}

fn split_addrs(s: Option<String>) -> Vec<String> {
    s.unwrap_or_default()
        .split(',')
        .map(|p| p.trim().to_string())
        .filter(|p| !p.is_empty())
        .collect()
}

/// Send through SMTP and, when possible, keep a local copy of what was sent.
///
/// The account is resolved from `req.account_id`; with no account it falls back
/// to the dev/test credentials, which is why the Sent copy is allowed to be
/// `None` rather than failing the send.
pub async fn send(req: SendRequest) -> Result<SendOutcome, String> {
    let (creds, outgoing_settings, account_email) = match req.account_id.as_deref() {
        Some(id) if !id.is_empty() => {
            let creds = crate::services::sync_loop::resolve_account_credentials(id).await?;
            let email = creds.email.clone();
            let settings = crate::services::sync_loop::load_account_settings_json(id).await?;
            let outgoing =
                crate::services::sync_loop::outgoing_settings_from_json(&settings, &email);
            (creds, outgoing, email)
        }
        _ => {
            let creds = crate::commands::get_creds().await?;
            let email = creds.email.clone();
            (creds, Default::default(), email)
        }
    };

    // Determine effective From: explicit alias wins, then account default.
    let from = if let Some(alias) = req.from_override.filter(|s| !s.trim().is_empty()) {
        crate::services::sync_loop::build_from_mailbox(&account_email, &alias)?
    } else {
        crate::services::sync_loop::build_from_mailbox(
            &account_email,
            &outgoing_settings.default_from_name,
        )?
    };

    let to_addrs = split_addrs(Some(req.to));
    let cc_addrs = split_addrs(req.cc);
    let mut bcc_addrs = split_addrs(req.bcc);
    if !outgoing_settings.auto_bcc.is_empty() && !bcc_addrs.contains(&outgoing_settings.auto_bcc) {
        bcc_addrs.push(outgoing_settings.auto_bcc.clone());
    }

    // Append the account signature when configured.
    let signature_plain = outgoing_settings.signature.as_str();
    let body = if signature_plain.is_empty() {
        req.body
    } else {
        format!("{}\n\n--\n{}", req.body, signature_plain)
    };
    let html_body = req.html_body.map(|html| {
        if signature_plain.is_empty() {
            html
        } else {
            let signature_html = signature_plain.replace('\n', "<br>");
            format!("{}<br><br>--<br>{}", html, signature_html)
        }
    });

    // Keep a clone for the local Sent copy before SMTP consumes the attachments.
    let attachments_for_sent = req.attachments.clone();
    let smtp = SmtpClient::new(creds);
    let message_id = smtp
        .send(
            &from,
            &to_addrs,
            &cc_addrs,
            &bcc_addrs,
            Some(&outgoing_settings.reply_to),
            req.in_reply_to.as_deref(),
            &req.subject,
            &body,
            html_body,
            req.attachments,
        )
        .await?;

    let local_message_id = save_sent_copy(
        &to_addrs,
        req.account_id.as_deref().unwrap_or_default(),
        &req.subject,
        &body,
        &attachments_for_sent,
    )
    .await;

    Ok(SendOutcome {
        message_id,
        local_message_id,
    })
}

/// Local Sent copy, so the thread shows up on the recipient's contact timeline.
/// Best-effort by design: a failed copy must not fail a send that already left.
async fn save_sent_copy(
    to_addrs: &[String],
    account_id: &str,
    subject: &str,
    body: &str,
    attachments: &[OutgoingAttachment],
) -> Option<String> {
    let to_email = to_addrs.first()?;
    let data_dir = data_dir()?;
    let pool = crate::services::sync_loop::open_pool().await.ok()?;
    crate::services::sync_loop::save_sent_message(
        &pool,
        &data_dir,
        account_id,
        to_email,
        subject,
        body,
        attachments,
    )
    .await
    .ok()
}

/// Whether an agent is allowed to send mail at all.
///
/// Settings → Agent → 允许 Agent 直接发信 writes
/// `app_settings.agent.allowAgentSend`. Absent means allowed: this app's user
/// asked for agent-operated mail, and turning it off is the explicit act.
pub fn agent_send_allowed(data_dir: &Path) -> bool {
    let Ok(text) = std::fs::read_to_string(data_dir.join("sendpalm.prefs.json")) else {
        return true;
    };
    let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) else {
        return true;
    };
    v["app_settings"]["agent"]["allowAgentSend"]
        .as_bool()
        .unwrap_or(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_comma_separated_recipients() {
        assert_eq!(
            split_addrs(Some("a@x.com, b@y.com ,, c@z.com".into())),
            vec!["a@x.com".to_string(), "b@y.com".to_string(), "c@z.com".to_string()]
        );
    }

    #[test]
    fn empty_recipient_list_is_empty_not_a_blank_address() {
        assert!(split_addrs(None).is_empty());
        assert!(split_addrs(Some("  ".into())).is_empty());
    }

    #[test]
    fn agent_send_defaults_to_allowed_when_no_prefs_file() {
        let dir = std::env::temp_dir().join("sendpalm-outgoing-test-missing");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        assert!(agent_send_allowed(&dir));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
