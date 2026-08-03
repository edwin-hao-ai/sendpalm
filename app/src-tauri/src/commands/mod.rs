//! Tauri commands exposing real IMAP/SMTP services to JS.

use crate::services::{
    EmailCredentials, SyncReport, imap::ImapClient, load_test_credentials, smtp::SmtpClient,
};
use crate::services::providers::{EmailProvider, list as provider_list};
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
    let creds = get_creds().await?;
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
pub async fn list_mailboxes() -> Result<Vec<String>, String> {
    let creds = get_creds().await?;
    ImapClient::new(creds).list_mailboxes().await
}

#[tauri::command]
pub async fn send_message(
    to: String,
    subject: String,
    body: String,
    account_id: Option<String>,
) -> Result<SendResult, String> {
    // Resolve credentials: prefer the explicit account_id from the From selector;
    // fall back to the test credentials when no account is selected (dev only).
    let creds = match account_id.as_deref() {
        Some(id) if !id.is_empty() => {
            crate::services::sync_loop::resolve_account_credentials(id).await?
        }
        _ => get_creds().await?,
    };
    let smtp = SmtpClient::new(creds);
    let from = smtp.creds().email.clone();
    let id = smtp.send(&from, &to, &subject, &body).await?;
    Ok(SendResult { message_id: id })
}

#[tauri::command]
pub async fn get_sync_state(
    app: AppHandle,
    account_id: String,
) -> Result<SyncStateDto, String> {
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
pub async fn vault_save(
    account_id: String,
    password: String,
) -> Result<(), String> {
    crate::services::vault::set_password(&account_id, &password)
}

#[tauri::command]
pub async fn vault_load(
    account_id: String,
) -> Result<Option<String>, String> {
    crate::services::vault::get_password(&account_id)
}

#[tauri::command]
pub async fn vault_delete(account_id: String) -> Result<(), String> {
    crate::services::vault::delete_password(&account_id)
}

/// Create a calendar event from a parsed iCal VEVENT.
#[tauri::command]
pub async fn add_calendar_event(invite: crate::services::ical::IcalEvent) -> Result<String, String> {
    let pool = open_calendar_pool().await?;
    let id = format!("evt_{}", uuid::Uuid::new_v4().simple());
    let dt = invite.dtstart.clone().unwrap_or_else(|| chrono::Utc::now().to_rfc3339());
    // Parse the dtstart ISO timestamp and split into date+time for the events table.
    let (date_str, time_str) = split_iso_datetime(&dt);
    let dur = compute_duration_minutes(invite.dtstart.as_deref(), invite.dtend.as_deref());

    sqlx::query(
        "INSERT INTO events (id, title, dt, tm, dur, location, agenda_json, brief, color) \
         VALUES ($1, $2, $3, $4, $5, $6, '[]', $7, '#0A8F63')",
    )
    .bind(&id)
    .bind(&invite.summary)
    .bind(&date_str)
    .bind(&time_str)
    .bind(dur)
    .bind(invite.location.as_deref().unwrap_or(""))
    .bind(invite.description.as_deref().unwrap_or(""))
    .execute(&pool)
    .await
    .map_err(|e| format!("insert event: {e}"))?;

    Ok(id)
}

/// Open the SendPalm SQLite database at the same path the sync loop uses.
async fn open_calendar_pool() -> Result<sqlx::SqlitePool, String> {
    use sqlx::sqlite::SqliteConnectOptions;
    use sqlx::sqlite::SqlitePoolOptions;
    use std::str::FromStr;

    let dir = if let Some(p) = std::env::var_os("APPDATA") {
        let mut pb = std::path::PathBuf::from(p);
        pb.push("com.sendpalm.app");
        pb
    } else {
        let home = std::env::var("HOME")
            .or_else(|_| std::env::var("USERPROFILE"))
            .unwrap_or_else(|_| ".".to_string());
        let mut pb = std::path::PathBuf::from(home);
        pb.push("Library/Application Support/com.sendpalm.app");
        pb
    };
    let db_path = dir.join("sendpalm.db");
    let opts = SqliteConnectOptions::from_str(&format!("sqlite://{}", db_path.display()))
        .map_err(|e| format!("parse db url: {e}"))?
        .create_if_missing(true)
        .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal);
    SqlitePoolOptions::new()
        .max_connections(2)
        .connect_with(opts)
        .await
        .map_err(|e| format!("connect db: {e}"))
}

fn split_iso_datetime(iso: &str) -> (String, String) {
    // Best-effort: split "2026-01-01T10:00:00+00:00" into date "2026-01-01" and time "10:00".
    if let Some(idx) = iso.find('T') {
        let date = iso[..idx].to_string();
        let time = iso[idx + 1..].split('+').next().unwrap_or("").split('-').next().unwrap_or("");
        let time_short = if time.len() >= 5 { time[..5].to_string() } else { time.to_string() };
        return (date, time_short);
    }
    (iso.to_string(), "00:00".to_string())
}

fn compute_duration_minutes(start: Option<&str>, end: Option<&str>) -> Option<i32> {
    let s = start?;
    let e = end?;
    let sd = chrono::DateTime::parse_from_rfc3339(s).ok()?;
    let ed = chrono::DateTime::parse_from_rfc3339(e).ok()?;
    let mins = (ed - sd).num_minutes();
    Some(mins as i32)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SendResult {
    pub message_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SyncStateDto {
    pub account_id: String,
    pub uid_validity: u32,
    pub last_uid: u32,
    pub last_synced_at: String,
    pub busy: bool,
}