//! Tauri commands exposing real IMAP/SMTP services to JS.

pub mod image_proxy;
pub mod notification_settings;

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

/// Create or update a calendar event from a parsed iCal VEVENT.
///
/// Behaviour by iTip METHOD:
///   - REQUEST  (new invite, or organizer resending with same UID) — upsert by
///              ical_uid. If a row with the same UID exists, update it; otherwise
///              insert. SEQUENCE > stored → update; SEQUENCE ≤ stored + same
///              summary/dt → no-op.
///   - CANCEL   — delete the row with the matching ical_uid (returns the deleted
///              id, or empty string if nothing matched).
///   - REPLY    — we don't auto-create events from a REPLY (the organizer's
///              inbox would see them); just return empty.
#[tauri::command]
pub async fn add_calendar_event(
    invite: crate::services::ical::IcalEvent,
    contact_id: Option<String>,
) -> Result<String, String> {
    let pool = crate::services::sync_loop::open_pool().await?;
    upsert_calendar_event(&pool, &invite, contact_id.as_deref()).await
}

/// Pure upsert logic, separated from the Tauri command so it can be
/// exercised by integration tests with an in-memory pool.
pub async fn upsert_calendar_event(
    pool: &sqlx::SqlitePool,
    invite: &crate::services::ical::IcalEvent,
    contact_id: Option<&str>,
) -> Result<String, String> {
    let method = invite.method.as_deref().unwrap_or("REQUEST");
    let uid = invite.uid.as_deref();

    // CANCEL: delete the row(s) matching the UID.
    if method == "CANCEL" {
        let Some(uid) = uid else {
            return Ok(String::new());
        };
        let res = sqlx::query("DELETE FROM events WHERE ical_uid = $1")
            .bind(uid)
            .execute(pool)
            .await
            .map_err(|e| format!("cancel event: {e}"))?;
        if res.rows_affected() == 0 {
            return Ok(String::new());
        }
        return Ok(uid.to_string());
    }
    if method == "REPLY" {
        // Replies don't create new events; the organizer's calendar already
        // has the canonical copy.
        return Ok(String::new());
    }

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

    // Upsert by ical_uid. Existing events with the same UID get their
    // title / dt / location refreshed; the local id is preserved so the
    // MeetingPanel keeps pointing at the right row.
    if let Some(uid) = uid {
        let existing: Option<(String, Option<i64>)> = sqlx::query_as(
            "SELECT id, ical_sequence FROM events WHERE ical_uid = $1 LIMIT 1",
        )
        .bind(uid)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("lookup by uid: {e}"))?;
        if let Some((existing_id, existing_seq)) = existing {
            let new_seq = invite.sequence.map(|n| n as i64);
            // If the new sequence is older or equal AND nothing important
            // changed, skip the UPDATE to keep churn low.
            let is_stale_seq = match (new_seq, existing_seq) {
                (Some(n), Some(prev)) if n <= prev => true,
                _ => false,
            };
            if is_stale_seq {
                return Ok(existing_id);
            }
            sqlx::query(
                "UPDATE events SET title = $2, dt = $3, end_dt = $4, all_day = $5, \
                 tm = $6, dur = $7, location = $8, brief = $9, \
                 ical_method = $10, ical_sequence = $11, organizer_email = $12 \
                 WHERE id = $1",
            )
            .bind(&existing_id)
            .bind(&invite.summary)
            .bind(&date_str)
            .bind(end_dt_str)
            .bind(if invite.all_day { 1 } else { 0 })
            .bind(&time_str)
            .bind(dur)
            .bind(invite.location.as_deref().unwrap_or(""))
            .bind(invite.description.as_deref().unwrap_or(""))
            .bind(method)
            .bind(new_seq)
            .bind(invite.organizer.as_deref().unwrap_or(""))
            .execute(pool)
            .await
            .map_err(|e| format!("update event: {e}"))?;
            return Ok(existing_id);
        }
    }

    let id = format!("evt_{}", uuid::Uuid::new_v4().simple());
    sqlx::query(
        "INSERT INTO events (id, title, dt, end_dt, all_day, tm, dur, location, agenda_json, pids_json, brief, color, ical_uid, ical_method, ical_sequence, organizer_email) \
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, '[]', $9, $10, '#0A8F63', $11, $12, $13, $14)",
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
    .bind(uid.unwrap_or(""))
    .bind(method)
    .bind(invite.sequence.map(|n| n as i64))
    .bind(invite.organizer.as_deref().unwrap_or(""))
    .execute(pool)
    .await
    .map_err(|e| format!("insert event: {e}"))?;

    Ok(id)
}

/// Send an iTip REPLY (Accept / Decline / Tentative) to the organizer of a
/// calendar event that came in as an invite. Records the response on the
/// event row so the MeetingPanel can show the user already replied.
#[tauri::command]
pub async fn respond_to_calendar_invite(
    event_id: String,
    response: String,
) -> Result<String, String> {
    use crate::services::ical::{self, RsvpStatus};
    let pool = crate::services::sync_loop::open_pool().await?;

    let rsvp = match response.to_uppercase().as_str() {
        "ACCEPTED" => RsvpStatus::Accepted,
        "DECLINED" => RsvpStatus::Declined,
        "TENTATIVE" => RsvpStatus::Tentative,
        other => return Err(format!("invalid RSVP: {other}")),
    };

    // Load enough fields to build a faithful REPLY (UID, organizer, dtstart,
    // dtend, summary, location, sequence, tzids, sender account).
    let row: Option<(
        Option<String>,    // ical_uid
        Option<String>,    // organizer_email
        Option<String>,    // summary (title)
        Option<String>,    // dt (date)
        Option<String>,    // tm (time)
        Option<String>,    // end_dt
        i64,               // dur
        Option<String>,    // location
        Option<i64>,       // ical_sequence
        Option<String>,    // ical_method
    )> = sqlx::query_as(
        "SELECT ical_uid, organizer_email, title, dt, tm, end_dt, dur, \
                location, ical_sequence, ical_method \
           FROM events WHERE id = $1",
    )
    .bind(&event_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| format!("load event: {e}"))?;
    let Some((uid, organizer, title, dt, _tm, _end_dt, _dur, location, seq, _method)) = row else {
        return Err(format!("event not found: {event_id}"));
    };
    let Some(uid) = uid else {
        return Err("event has no ical_uid — not an invite".to_string());
    };
    let Some(organizer) = organizer else {
        return Err("event has no organizer_email — can't reply".to_string());
    };

    // Rebuild an IcalEvent snapshot for the builder.
    let dtstart = dt
        .as_deref()
        .map(|d| format!("{d}T00:00:00Z"))
        .unwrap_or_else(|| chrono::Utc::now().to_rfc3339());
    let invite = ical::IcalEvent {
        uid: Some(uid.clone()),
        summary: title.unwrap_or_default(),
        dtstart: Some(dtstart),
        dtstart_tzid: None,
        dtend: None,
        dtend_tzid: None,
        all_day: false,
        location,
        description: None,
        method: Some("REPLY".to_string()),
        organizer: Some(organizer.clone()),
        attendees: Vec::new(),
        sequence: seq.map(|n| n as u32),
    };

    // Get SMTP creds for the local user. We use the test fallback if
    // no real account is configured (the same one the sync loop uses).
    let creds = get_creds().await?;
    let from = creds.email.clone();
    let responder_email = from.clone();

    let body = ical::build_itip_reply(&invite, &responder_email, rsvp)
        .ok_or_else(|| "build_itip_reply returned None".to_string())?;

    let smtp = crate::services::smtp::SmtpClient::new(creds);
    let subject = match rsvp {
        RsvpStatus::Accepted => format!("Accepted: {title}", title = invite.summary),
        RsvpStatus::Declined => format!("Declined: {title}", title = invite.summary),
        RsvpStatus::Tentative => format!("Tentative: {title}", title = invite.summary),
    };
    smtp.send_itip_reply(&from, &organizer, &subject, &body, &responder_email)
        .await
        .map_err(|e| format!("smtp send itip: {e}"))?;

    // Persist the response on the event so the UI can show "已回复".
    let now = chrono::Utc::now().to_rfc3339();
    sqlx::query(
        "UPDATE events SET attendee_response = $2, attendee_response_at = $3 WHERE id = $1",
    )
    .bind(&event_id)
    .bind(rsvp.as_partstat())
    .bind(&now)
    .execute(&pool)
    .await
    .map_err(|e| format!("update response: {e}"))?;

    Ok(format!("{organizer}|{responder_email}"))
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
