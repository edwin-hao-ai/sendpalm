//! Tauri commands exposing real IMAP/SMTP services to JS.

use crate::services::providers::{list as provider_list, EmailProvider};
use crate::services::{
    imap::ImapClient, load_test_credentials, smtp::SmtpClient, EmailCredentials, SyncReport,
};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use tokio::sync::OnceCell;

static TEST_CREDS: OnceCell<EmailCredentials> = OnceCell::const_new();

async fn get_creds() -> Result<EmailCredentials, String> {
    let creds = TEST_CREDS
        .get_or_try_init(|| async { load_test_credentials() })
        .await
        .map_err(|e: String| e)?;
    Ok(creds.clone())
}

#[tauri::command]
pub async fn sync_now(
    app: AppHandle,
    account_id: String,
    mailbox: String,
) -> Result<SyncReport, String> {
    let creds = crate::services::sync_loop::resolve_account_credentials(&account_id).await?;
    let client = ImapClient::new(creds);
    let state = app.state::<crate::services::state::SyncStateStore>();
    let prev = state.get(&account_id);
    state.put(
        &account_id,
        crate::services::state::AccountSyncState {
            uid_validity: prev.uid_validity,
            last_uid: prev.last_uid,
            last_synced_at: prev.last_synced_at,
            busy: true,
        },
    );
    let result = client.sync(&mailbox, prev.last_uid).await;
    let bundle = match result {
        Ok(b) => b,
        Err(e) => {
            state.put(
                &account_id,
                crate::services::state::AccountSyncState {
                    busy: false,
                    ..prev
                },
            );
            return Err(e);
        }
    };
    state.put(
        &account_id,
        crate::services::state::AccountSyncState {
            uid_validity: bundle.uid_validity,
            last_uid: bundle.highest_uid,
            last_synced_at: chrono::Utc::now(),
            busy: false,
        },
    );
    Ok(bundle.report(&account_id, bundle.messages.len(), 0))
}

#[tauri::command]
pub async fn list_mailboxes(account_id: String) -> Result<Vec<String>, String> {
    let creds = crate::services::sync_loop::resolve_account_credentials(&account_id).await?;
    ImapClient::new(creds).list_mailboxes().await
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OutgoingAttachmentDto {
    filename: String,
    mime: String,
    data_base64: String,
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn send_message(
    app: AppHandle,
    to: String,
    subject: String,
    body: String,
    html_body: Option<String>,
    account_id: Option<String>,
    attachments: Vec<OutgoingAttachmentDto>,
    cc: Option<String>,
    bcc: Option<String>,
    from_override: Option<String>,
) -> Result<SendResult, String> {
    // Resolve credentials: prefer the explicit account_id from the From selector;
    // fall back to the test credentials when no account is selected (dev only).
    let (creds, outgoing_settings, account_email) = match account_id.as_deref() {
        Some(id) if !id.is_empty() => {
            let creds = crate::services::sync_loop::resolve_account_credentials(id).await?;
            let email = creds.email.clone();
            let settings = crate::services::sync_loop::load_account_settings_json(id).await?;
            let outgoing =
                crate::services::sync_loop::outgoing_settings_from_json(&settings, &email);
            (creds, outgoing, email)
        }
        _ => {
            let creds = get_creds().await?;
            let email = creds.email.clone();
            (creds, Default::default(), email)
        }
    };
    let smtp = SmtpClient::new(creds);

    // Determine effective From: explicit alias wins, then account default display name.
    let from = if let Some(alias) = from_override.filter(|s| !s.trim().is_empty()) {
        crate::services::sync_loop::build_from_mailbox(&account_email, &alias)?
    } else {
        crate::services::sync_loop::build_from_mailbox(
            &account_email,
            &outgoing_settings.default_from_name,
        )?
    };

    let split_addrs = |s: Option<String>| {
        s.unwrap_or_default()
            .split(',')
            .map(|p| p.trim().to_string())
            .filter(|p| !p.is_empty())
            .collect::<Vec<_>>()
    };
    let to_addrs = split_addrs(Some(to));
    let cc_addrs = split_addrs(cc);
    let mut bcc_addrs = split_addrs(bcc);
    if !outgoing_settings.auto_bcc.is_empty() && !bcc_addrs.contains(&outgoing_settings.auto_bcc) {
        bcc_addrs.push(outgoing_settings.auto_bcc.clone());
    }

    // Append account signature when configured.
    let signature_plain = outgoing_settings.signature.as_str();
    let body = if signature_plain.is_empty() {
        body
    } else {
        format!("{}\n\n--\n{}", body, signature_plain)
    };
    let html_body = html_body.map(|html| {
        if signature_plain.is_empty() {
            html
        } else {
            let signature_html = signature_plain.replace('\n', "<br>");
            format!("{}<br><br>--<br>{}", html, signature_html)
        }
    });

    let attachments = attachments
        .into_iter()
        .map(|a| {
            let bytes = base64::engine::Engine::decode(
                &base64::engine::general_purpose::STANDARD,
                &a.data_base64,
            )
            .map_err(|e| format!("decode attachment {}: {e}", a.filename))?;
            Ok(crate::services::smtp::OutgoingAttachment {
                filename: a.filename,
                mime: a.mime,
                bytes,
            })
        })
        .collect::<Result<Vec<_>, String>>()?;

    // Keep a clone for the local Sent copy before SMTP consumes the attachments.
    let attachments_for_sent = attachments.clone();
    let id = smtp
        .send(
            &from,
            &to_addrs,
            &cc_addrs,
            &bcc_addrs,
            Some(&outgoing_settings.reply_to),
            &subject,
            &body,
            html_body,
            attachments,
        )
        .await?;

    // Save a local copy of the sent message so it shows up in the recipient's
    // contact timeline. We use the first To address as the primary contact.
    let local_message_id = if let Some(to_email) = to_addrs.first() {
        if let Ok(pool) = crate::services::sync_loop::open_pool().await {
            if let Ok(data_dir) = app.path().app_data_dir() {
                let account_id = account_id.unwrap_or_default();
                crate::services::sync_loop::save_sent_message(
                    &pool,
                    &data_dir,
                    &account_id,
                    to_email,
                    &subject,
                    &body,
                    &attachments_for_sent,
                )
                .await
                .ok()
            } else {
                None
            }
        } else {
            None
        }
    } else {
        None
    };

    Ok(SendResult {
        message_id: id,
        local_message_id,
    })
}

#[tauri::command]
pub async fn get_sync_state(app: AppHandle, account_id: String) -> Result<SyncStateDto, String> {
    let state = app.state::<crate::services::state::SyncStateStore>();
    let s = state.get(&account_id);
    Ok(SyncStateDto {
        account_id,
        uid_validity: s.uid_validity,
        last_uid: s.last_uid,
        last_synced_at: s.last_synced_at.to_rfc3339(),
        busy: s.busy,
    })
}

#[tauri::command]
pub async fn list_email_providers() -> Result<Vec<EmailProvider>, String> {
    Ok(provider_list())
}

#[tauri::command]
pub async fn vault_save(account_id: String, password: String) -> Result<(), String> {
    crate::services::vault::set_password(&account_id, &password)
}

#[tauri::command]
pub async fn vault_load(account_id: String) -> Result<Option<String>, String> {
    crate::services::vault::get_password(&account_id)
}

#[tauri::command]
pub async fn vault_delete(account_id: String) -> Result<(), String> {
    crate::services::vault::delete_password(&account_id)
}

/// Create a calendar event from a parsed iCal VEVENT.
#[tauri::command]
pub async fn add_calendar_event(
    invite: crate::services::ical::IcalEvent,
    contact_id: Option<String>,
) -> Result<String, String> {
    let pool = crate::services::sync_loop::open_pool().await?;
    let id = format!("evt_{}", uuid::Uuid::new_v4().simple());
    let dt = invite
        .dtstart
        .clone()
        .unwrap_or_else(|| chrono::Utc::now().to_rfc3339());
    let (date_str, time_str) = crate::services::ical::split_iso_datetime(&dt);
    let dur = crate::services::ical::compute_duration_minutes(
        invite.dtstart.as_deref(),
        invite.dtend.as_deref(),
    );
    let end_dt_str = invite
        .dtend
        .as_deref()
        .map(crate::services::ical::split_iso_datetime)
        .map(|(d, _)| d);

    let pids_json = contact_id
        .map(|cid| format!("[\"{cid}\"]"))
        .unwrap_or_else(|| "[]".to_string());

    sqlx::query(
        "INSERT INTO events (id, title, dt, end_dt, all_day, tm, dur, location, agenda_json, pids_json, brief, color) \
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, '[]', $9, $10, '#0A8F63')",
    )
    .bind(&id)
    .bind(&invite.summary)
    .bind(&date_str)
    .bind(end_dt_str)
    .bind(if invite.all_day { 1 } else { 0 })
    .bind(&time_str)
    .bind(dur)
    .bind(invite.location.as_deref().unwrap_or(""))
    .bind(&pids_json)
    .bind(invite.description.as_deref().unwrap_or(""))
    .execute(&pool)
    .await
    .map_err(|e| format!("insert event: {e}"))?;

    Ok(id)
}

/// Read an attachment from the app data directory and return it as a base64
/// data URL so the frontend can display or download it without direct FS access.
#[tauri::command]
pub async fn get_attachment_content(app: AppHandle, file_id: String) -> Result<String, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let file_dir = data_dir.join("attachments").join(&file_id);
    let mut entries = tokio::fs::read_dir(&file_dir)
        .await
        .map_err(|e| format!("read attachment dir {file_id}: {e}"))?;
    let mut path: Option<std::path::PathBuf> = None;
    while let Ok(Some(entry)) = entries.next_entry().await {
        let p = entry.path();
        if p.is_file() {
            path = Some(p);
            break;
        }
    }
    let path = path.ok_or_else(|| format!("attachment file not found: {file_id}"))?;
    let bytes = tokio::fs::read(&path)
        .await
        .map_err(|e| format!("read attachment {file_id}: {e}"))?;
    let b64 = base64::engine::Engine::encode(&base64::engine::general_purpose::STANDARD, &bytes);
    let mime = mime_guess::from_path(&path)
        .first_or_octet_stream()
        .to_string();
    Ok(format!("data:{mime};base64,{b64}"))
}

/// Return the absolute filesystem path of an attachment so the frontend can
/// open it with the system default application.
#[tauri::command]
pub async fn get_attachment_path(app: AppHandle, file_id: String) -> Result<String, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let file_dir = data_dir.join("attachments").join(&file_id);
    let mut entries = tokio::fs::read_dir(&file_dir)
        .await
        .map_err(|e| format!("read attachment dir {file_id}: {e}"))?;
    while let Ok(Some(entry)) = entries.next_entry().await {
        let p = entry.path();
        if p.is_file() {
            return Ok(p.to_string_lossy().to_string());
        }
    }
    Err(format!("attachment file not found: {file_id}"))
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SendResult {
    pub message_id: String,
    pub local_message_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SyncStateDto {
    pub account_id: String,
    pub uid_validity: u32,
    pub last_uid: u32,
    pub last_synced_at: String,
    pub busy: bool,
}
