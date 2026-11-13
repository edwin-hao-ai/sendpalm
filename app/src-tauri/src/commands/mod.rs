//! Tauri commands exposing real IMAP/SMTP services to JS.

pub mod image_proxy;
pub mod notification_settings;

use crate::services::providers::{list as provider_list, EmailProvider};
use crate::services::{
    imap::ImapClient, load_test_credentials, EmailCredentials, SyncReport,
};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use tokio::sync::OnceCell;

static TEST_CREDS: OnceCell<EmailCredentials> = OnceCell::const_new();

pub(crate) async fn get_creds() -> Result<EmailCredentials, String> {
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
            status: crate::services::state::AccountSyncStatus::Syncing,
            error_code: None,
        },
    );
    let result = client.sync(&mailbox, prev.last_uid).await;
    let bundle = match result {
        Ok(b) => b,
        Err(e) => {
            let code = crate::services::sync_loop::sync_error_code_pub(&e);
            let needs_credentials = matches!(
                code,
                "missing_credentials" | "auth_failed" | "credentials_unreadable"
            );
            state.put(
                &account_id,
                crate::services::state::AccountSyncState {
                    busy: false,
                    status: if needs_credentials {
                        crate::services::state::AccountSyncStatus::NeedsCredentials
                    } else {
                        crate::services::state::AccountSyncStatus::Error
                    },
                    error_code: Some(code.to_string()),
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
            status: crate::services::state::AccountSyncStatus::Connected,
            error_code: None,
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
    to: String,
    subject: String,
    body: String,
    html_body: Option<String>,
    account_id: Option<String>,
    attachments: Vec<OutgoingAttachmentDto>,
    cc: Option<String>,
    bcc: Option<String>,
    from_override: Option<String>,
    in_reply_to: Option<String>,
) -> Result<SendResult, String> {
    // Everything this used to do lives in services::outgoing so the MCP
    // send/reply/forward tools share one implementation of account defaults,
    // auto-BCC, signature, attachments and the local Sent copy.
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

    let outcome = crate::services::outgoing::send(crate::services::outgoing::SendRequest {
        to,
        subject,
        body,
        html_body,
        cc,
        bcc,
        account_id,
        from_override,
        in_reply_to,
        attachments,
    })
    .await?;

    Ok(SendResult {
        message_id: outcome.message_id,
        local_message_id: outcome.local_message_id,
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
        status: s.status.as_str().to_string(),
        error_code: s.error_code.clone(),
    })
}

/// What the account's first sync imported, for Settings → Accounts.
///
/// Returns `None` when the account has never completed an import, so the row
/// can stay silent instead of showing a meaningless "0".
#[tauri::command]
pub async fn get_import_summary(
    account_id: String,
) -> Result<Option<crate::services::ImportSummaryReport>, String> {
    let pool = crate::services::sync_loop::open_pool().await?;
    crate::services::sync_loop::load_import_summary(&pool, &account_id).await
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

/// SEC-2: store an arbitrary secret under a named key in the OS
/// keychain. Used by Settings → Agent to keep the LLM API key out
/// of the plain-text `sendpalm.prefs.json` file. The well-known key
/// `llm_api_key` is the LLM key; arbitrary keys are allowed so
/// other future secrets (e.g. a webhook URL or a personal access
/// token) can land in the same place.
#[tauri::command]
pub async fn vault_set_secret(key: String, value: String) -> Result<(), String> {
    crate::services::vault::set_password(&key, &value)
}

#[tauri::command]
pub async fn vault_get_secret(key: String) -> Result<Option<String>, String> {
    crate::services::vault::get_password(&key)
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
    account_id: Option<String>,
) -> Result<String, String> {
    let pool = crate::services::sync_loop::open_pool().await?;
    upsert_calendar_event(
        &pool,
        &invite,
        contact_id.as_deref(),
        account_id.as_deref(),
    )
    .await
}

/// Pure upsert logic, separated from the Tauri command so it can be
/// exercised by integration tests with an in-memory pool.
pub async fn upsert_calendar_event(
    pool: &sqlx::SqlitePool,
    invite: &crate::services::ical::IcalEvent,
    contact_id: Option<&str>,
    account_id: Option<&str>,
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
                 ical_method = $10, ical_sequence = $11, organizer_email = $12, \
                 recurrence_rule = $13, recurrence_dates_json = $14, \
                 excluded_dates_json = $15, original_tzid = $16 \
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
            .bind(invite.rrule.as_deref().unwrap_or(""))
            .bind(serde_json::to_string(&invite.rdates).unwrap_or_else(|_| "[]".into()))
            .bind(serde_json::to_string(&invite.exdates).unwrap_or_else(|_| "[]".into()))
            .bind(invite.dtstart_tzid.as_deref().unwrap_or(""))
            .execute(pool)
            .await
            .map_err(|e| format!("update event: {e}"))?;
            return Ok(existing_id);
        }
    }

    let id = format!("evt_{}", uuid::Uuid::new_v4().simple());
    sqlx::query(
        "INSERT INTO events (id, title, dt, end_dt, all_day, tm, dur, location, agenda_json, pids_json, brief, color, ical_uid, ical_method, ical_sequence, organizer_email, recurrence_rule, recurrence_dates_json, excluded_dates_json, original_tzid, account_id) \
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, '[]', $9, $10, '#0A8F63', $11, $12, $13, $14, $15, $16, $17, $18, $19)",
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
    .bind(invite.rrule.as_deref().unwrap_or(""))
    .bind(serde_json::to_string(&invite.rdates).unwrap_or_else(|_| "[]".into()))
    .bind(serde_json::to_string(&invite.exdates).unwrap_or_else(|_| "[]".into()))
    .bind(invite.dtstart_tzid.as_deref().unwrap_or(""))
    .bind(account_id)
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
        Option<String>,    // account_id
    )> = sqlx::query_as(
        "SELECT ical_uid, organizer_email, title, dt, tm, end_dt, dur, \
                location, ical_sequence, ical_method, account_id \
           FROM events WHERE id = $1",
    )
    .bind(&event_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| format!("load event: {e}"))?;
    let Some((uid, organizer, title, dt, _tm, _end_dt, _dur, location, seq, _method, event_account_id)) = row else {
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
        attendee_responses: Vec::new(),
        sequence: seq.map(|n| n as u32),
        rrule: None,
        rdates: Vec::new(),
        exdates: Vec::new(),
        vtimezones: Vec::new(),
    };

    // P0-4: resolve SMTP creds by the event's account_id (which account
    // actually received the invite). If the event has no account_id
    // (e.g. a locally-created event with no iCal origin), fall back to
    // the test account. Previously we always used the test fallback,
    // so multi-account users had their RSVP sent from the wrong
    // address — the organizer would see "from: <test-account>".
    let creds = match event_account_id.as_deref() {
        Some(acct_id) if !acct_id.is_empty() => {
            match crate::services::sync_loop::resolve_account_credentials(acct_id).await {
                Ok(c) => c,
                Err(_) => get_creds().await?,
            }
        }
        _ => get_creds().await?,
    };
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
    /// never_synced | syncing | connected | needs_credentials | error
    pub status: String,
    /// Sanitized machine-readable error code; None on success.
    pub error_code: Option<String>,
}

/// M11 — Run a single OpenAI-compatible chat completion against the
/// user's configured provider. The frontend reads the API key +
/// model + base URL from tauri-plugin-store (so they survive
/// restarts and can be edited in Settings) and passes them in
/// here on every call; we never persist the key on disk.
#[tauri::command]
pub async fn agent_chat(
    config: crate::services::llm::LlmConfig,
    messages: Vec<crate::services::llm::ChatMessage>,
) -> Result<crate::services::llm::ChatResponse, String> {
    crate::services::llm::chat_complete(
        &crate::services::llm::ChatRequest { config, messages },
    )
    .await
}

#[tauri::command]
pub async fn llm_list_models(
    config: crate::services::llm::LlmConfig,
) -> Result<Vec<crate::services::llm::LlmModelInfo>, String> {
    crate::services::llm::list_models(&config).await
}

#[tauri::command]
pub fn list_llm_providers() -> Vec<crate::services::llm::LlmProviderDto> {
    crate::services::llm::provider_dtos()
}

#[tauri::command]
pub async fn detect_agent_clients(
    state: tauri::State<'_, crate::services::mcp::McpGatewayState>,
) -> Result<Vec<crate::services::agent_clients::AgentClientDto>, String> {
    // The endpoint is set at startup; if it's missing (server failed to
    // start), clients show as installed-but-not-connectable.
    let url = state.get().map(|e| e.url).unwrap_or_default();
    Ok(crate::services::agent_clients::detect_clients(&url).await)
}

#[tauri::command]
pub async fn connect_agent_client(
    id: String,
    state: tauri::State<'_, crate::services::mcp::McpGatewayState>,
) -> Result<(), String> {
    let ep = state
        .get()
        .ok_or_else(|| "MCP gateway is not running — restart SendPalm".to_string())?;
    crate::services::agent_clients::connect_client(&id, &ep.url, &ep.token).await
}

#[tauri::command]
pub async fn disconnect_agent_client(id: String) -> Result<(), String> {
    crate::services::agent_clients::disconnect_client(&id).await
}

#[tauri::command]
pub fn mcp_gateway_status(
    state: tauri::State<'_, crate::services::mcp::McpGatewayState>,
) -> Option<crate::services::mcp::McpStatusDto> {
    state.get().map(|ep| crate::services::mcp::McpStatusDto {
        url: ep.url,
        token_preview: format!("{}…", &ep.token[..ep.token.len().min(10)]),
    })
}

#[tauri::command]
pub async fn list_mail_rules() -> Result<Vec<crate::services::rules::MailRule>, String> {
    let pool = crate::services::sync_loop::open_pool().await?;
    crate::services::rules::list_rules(&pool).await
}

#[tauri::command]
pub async fn upsert_mail_rule(
    rule: crate::services::rules::MailRule,
) -> Result<String, String> {
    let pool = crate::services::sync_loop::open_pool().await?;
    sqlx::query(
        "INSERT INTO mail_rules (id, name, enabled, match_field, match_pattern, action_bucket, action_label, priority) \
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) \
         ON CONFLICT(id) DO UPDATE SET name=excluded.name, enabled=excluded.enabled, \
           match_field=excluded.match_field, match_pattern=excluded.match_pattern, \
           action_bucket=excluded.action_bucket, action_label=excluded.action_label, \
           priority=excluded.priority",
    )
    .bind(&rule.id)
    .bind(&rule.name)
    .bind(if rule.enabled { 1 } else { 0 })
    .bind(&rule.match_field)
    .bind(&rule.match_pattern)
    .bind(rule.action_bucket.as_deref())
    .bind(rule.action_label.as_deref())
    .bind(rule.priority)
    .execute(&pool)
    .await
    .map_err(|e| format!("upsert rule: {e}"))?;
    Ok(rule.id)
}

#[tauri::command]
pub async fn delete_mail_rule(id: String) -> Result<(), String> {
    let pool = crate::services::sync_loop::open_pool().await?;
    sqlx::query("DELETE FROM mail_rules WHERE id = $1")
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| format!("delete rule: {e}"))?;
    Ok(())
}

/// Two-way read state: mark a message read/unread ON THE SERVER too.
/// Reads the message's imap identity, resolves the account credentials,
/// and issues UID STORE. Fire-and-forget from the UI's perspective —
/// failures are logged, never surfaced as user errors (the local state
/// is already correct and the next sync self-heals flags).
#[tauri::command]
pub async fn imap_set_seen(message_id: String, seen: bool) -> Result<(), String> {
    let pool = crate::services::sync_loop::open_pool().await?;
    let row: Option<(String, Option<i64>, String)> = sqlx::query_as(
        "SELECT ac, imap_uid, COALESCE(imap_folder, '') FROM messages WHERE id = $1",
    )
    .bind(&message_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| format!("lookup message: {e}"))?;
    let Some((account_id, Some(uid), folder)) = row else {
        return Ok(()); // local row without IMAP identity — nothing to sync
    };
    if folder.is_empty() {
        return Ok(());
    }
    let creds = crate::services::sync_loop::resolve_account_credentials(&account_id).await?;
    let client = ImapClient::new(creds);
    client.set_seen(&folder, uid as u32, seen).await
}

/// Test-only: the account bootstrap an automated run asks for.
///
/// iOS has no way to type into the app from a script (XCUITest's WebKit
/// accessibility snapshots time out on a real iPhone), and the two things that
/// actually break on a phone are the keychain write and the first IMAP sync —
/// neither of which is provable from a simulator. `verify-ios-device.sh` launches
/// the app with these variables and the frontend then runs the *real* code path
/// (`upsertAccount` -> `vaultSave` -> `syncNow`), skipping only the form.
///
/// Returns None unless both variables are set, so a normal launch is untouched.
#[derive(Debug, serde::Serialize)]
pub struct E2eSeedAccount {
    pub email: String,
    pub password: String,
    pub provider: String,
}

#[tauri::command]
pub fn e2e_seed_account() -> Option<E2eSeedAccount> {
    let email = std::env::var("SENDPALM_E2E_SEED_EMAIL").ok()?;
    let password = std::env::var("SENDPALM_E2E_SEED_PASSWORD").ok()?;
    if email.trim().is_empty() || password.is_empty() {
        return None;
    }
    let provider = std::env::var("SENDPALM_E2E_SEED_PROVIDER").unwrap_or_else(|_| "feishu".into());
    Some(E2eSeedAccount { email, password, provider })
}
