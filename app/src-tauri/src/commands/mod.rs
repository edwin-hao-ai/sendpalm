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