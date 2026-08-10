//! Scheduled-send executor — wakes up every minute, finds drafts whose
//! `scheduled_at` has passed, and dispatches them over SMTP.
//!
//! Mirrors the real backend integration in `sync_loop.rs`: opens its own
//! SQLite pool (same on-disk file) and resolves per-account credentials from
//! the OS keyring / test fallback.

use crate::services::smtp::{OutgoingAttachment, SmtpClient};
use crate::services::sync_loop::{open_pool, resolve_account_credentials, save_sent_message};
use sqlx::sqlite::SqlitePool;
use std::time::Duration;
use tauri::async_runtime::spawn;
use tauri::{AppHandle, Manager};

/// How often we poll the `scheduled_sends` table for due items.
const POLL_INTERVAL: Duration = Duration::from_secs(60);

/// Start the background scheduled-send loop.
pub fn start(app: AppHandle) {
    spawn(async move {
        if let Err(e) = run_loop(app).await {
            eprintln!("[scheduled-send] background loop crashed: {e}");
        }
    });
}

async fn run_loop(app: AppHandle) -> Result<(), String> {
    let pool = open_pool().await?;

    loop {
        if let Err(e) = tick(&app, &pool).await {
            eprintln!("[scheduled-send] tick failed: {e}");
        }
        tokio::time::sleep(POLL_INTERVAL).await;
    }
}

async fn tick(app: &AppHandle, pool: &SqlitePool) -> Result<(), String> {
    let now = chrono::Utc::now().to_rfc3339();
    let rows = sqlx::query_as::<
        _,
        (String, String, String, String),
    >("SELECT id, draft_id, account_id, scheduled_at FROM scheduled_sends WHERE status = 'scheduled' AND scheduled_at <= $1 ORDER BY scheduled_at ASC")
    .bind(&now)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("load scheduled sends: {e}"))?;

    for (id, draft_id, account_id, _scheduled_at) in rows {
        if let Err(e) = dispatch_one(app, pool, &id, &draft_id, &account_id).await {
            eprintln!("[scheduled-send] failed to dispatch {}: {}", id, e);
            // Leave the row as 'scheduled' so the next tick can retry.
            // In the future we may want a retry counter / 'failed' status.
        }
    }

    Ok(())
}

async fn dispatch_one(
    app: &AppHandle,
    pool: &SqlitePool,
    scheduled_id: &str,
    draft_id: &str,
    account_id: &str,
) -> Result<(), String> {
    let draft = load_draft(pool, draft_id).await?;

    let creds = resolve_account_credentials(account_id).await?;
    let account_email = creds.email.clone();
    let settings = crate::services::sync_loop::load_account_settings_json(account_id).await?;
    let outgoing =
        crate::services::sync_loop::outgoing_settings_from_json(&settings, &account_email);
    let smtp = SmtpClient::new(creds);

    let from = if let Some(alias) = draft.from_alias.filter(|s| !s.trim().is_empty()) {
        crate::services::sync_loop::build_from_mailbox(&account_email, &alias)?
    } else {
        crate::services::sync_loop::build_from_mailbox(&account_email, &outgoing.default_from_name)?
    };

    let to = split_addrs(&draft.recipient);
    if to.is_empty() {
        return Err("draft has no recipient".into());
    }
    let cc = split_addrs(&draft.cc);
    let mut bcc = split_addrs(&draft.bcc);
    if !outgoing.auto_bcc.is_empty() && !bcc.contains(&outgoing.auto_bcc) {
        bcc.push(outgoing.auto_bcc.clone());
    }

    let body = if outgoing.signature.is_empty() {
        draft.body.clone()
    } else {
        format!("{}\n\n--\n{}", draft.body, outgoing.signature)
    };

    let attachments = load_attachments(app, pool, &draft.attachments).await?;
    let attachments_for_sent = attachments.clone();

    let _message_id = smtp
        .send(
            &from,
            &to,
            &cc,
            &bcc,
            Some(&outgoing.reply_to),
            &draft.subject,
            &body,
            None,
            attachments,
        )
        .await?;

    // Persist a local "Sent" copy so scheduled messages show up in the
    // recipient's contact timeline.
    if let (Some(to_email), Ok(data_dir)) = (to.first(), app.path().app_data_dir()) {
        let _ = save_sent_message(
            pool,
            &data_dir,
            account_id,
            to_email,
            &draft.subject,
            &body,
            &attachments_for_sent,
        )
        .await;
    }

    // Mark draft as sent and scheduled_send as sent.
    sqlx::query("UPDATE drafts SET status = 'sent' WHERE id = $1")
        .bind(draft_id)
        .execute(pool)
        .await
        .map_err(|e| format!("update draft status: {e}"))?;

    sqlx::query("UPDATE scheduled_sends SET status = 'sent' WHERE id = $1")
        .bind(scheduled_id)
        .execute(pool)
        .await
        .map_err(|e| format!("update scheduled send status: {e}"))?;

    eprintln!(
        "[scheduled-send] dispatched draft {} via account {}",
        draft_id, account_id
    );
    Ok(())
}

#[derive(Debug)]
struct DraftRow {
    recipient: String,
    subject: String,
    body: String,
    cc: String,
    bcc: String,
    attachments: Vec<String>,
    from_alias: Option<String>,
}

async fn load_draft(pool: &SqlitePool, draft_id: &str) -> Result<DraftRow, String> {
    let row = sqlx::query_as::<
        _,
        (String, String, String, String, String, String, Option<String>),
    >("SELECT recipient, subject, body, cc_json, bcc_json, attachments_json, from_alias FROM drafts WHERE id = $1")
    .bind(draft_id)
    .fetch_one(pool)
    .await
    .map_err(|e| format!("load draft {}: {e}", draft_id))?;

    let attachments: Vec<String> =
        serde_json::from_str(&row.5).map_err(|e| format!("parse attachments_json: {e}"))?;

    Ok(DraftRow {
        recipient: row.0,
        subject: row.1,
        body: row.2,
        cc: join_addrs(&row.3),
        bcc: join_addrs(&row.4),
        attachments,
        from_alias: row.6,
    })
}

/// CC/BCC are stored as JSON arrays of strings in `cc_json` / `bcc_json`.
fn join_addrs(json: &str) -> String {
    let addrs: Vec<String> = serde_json::from_str(json).unwrap_or_default();
    addrs.join(", ")
}

fn split_addrs(s: &str) -> Vec<String> {
    s.split(',')
        .map(|p| p.trim().to_string())
        .filter(|p| !p.is_empty())
        .collect()
}

async fn load_attachments(
    app: &AppHandle,
    pool: &SqlitePool,
    file_ids: &[String],
) -> Result<Vec<OutgoingAttachment>, String> {
    if file_ids.is_empty() {
        return Ok(Vec::new());
    }

    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {e}"))?;

    let mut attachments = Vec::with_capacity(file_ids.len());
    for file_id in file_ids {
        let row = sqlx::query_as::<_, (String, String, String)>(
            "SELECT name, mime, url FROM files WHERE id = $1",
        )
        .bind(file_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("load file {}: {e}", file_id))?
        .ok_or_else(|| format!("attachment file {} not found", file_id))?;

        let (name, mime, url) = row;
        if url.is_empty() {
            return Err(format!("file {} has no url", file_id));
        }
        let path = data_dir.join(&url);
        let bytes = tokio::fs::read(&path)
            .await
            .map_err(|e| format!("read attachment {} at {:?}: {e}", file_id, path))?;

        attachments.push(OutgoingAttachment {
            filename: name,
            mime,
            bytes,
        });
    }

    Ok(attachments)
}
