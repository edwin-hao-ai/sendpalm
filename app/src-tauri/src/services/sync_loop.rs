//! Background sync loop — uses IMAP IDLE for INBOX when possible, falling
//! back to a short poll sleep if the server doesn't support IDLE.
//!
//! v2: supports multiple email accounts. Each account gets its own spawned
//! task and IMAP session. The account list is reloaded every minute so
//! accounts added in Settings start syncing without an app restart.

use crate::services::imap::{ImapClient, IDLE_TIMEOUT};
use crate::services::mailbox_resolver::resolve_all;
use crate::services::providers;
use crate::services::vault;
use crate::services::{load_test_credentials, EmailCredentials};
use lettre::message::Mailbox;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePool};
use std::collections::HashSet;
use std::path::PathBuf;
use std::str::FromStr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::async_runtime::{spawn, JoinHandle};
use tauri::{AppHandle, Emitter, Manager};

/// When IDLE fails (server doesn't support it, connection drop, etc.), wait
/// this long before the next sync attempt.
const IDLE_ERROR_BACKOFF: Duration = Duration::from_secs(60);

/// How often we reload the `accounts` table to pick up newly added/removed
/// accounts.
const ACCOUNT_RELOAD_INTERVAL: Duration = Duration::from_secs(60);

/// How often the background purge job scans for expired trash/spam messages.
const PURGE_INTERVAL: Duration = Duration::from_secs(24 * 60 * 60);

/// If the database has no configured email accounts, fall back to the
/// `SENDPALM_TEST_*` credentials so `pnpm tauri dev` still syncs mail.
const TEST_FALLBACK_ENABLED: bool = true;

#[derive(Debug, Clone)]
pub struct SyncAccount {
    pub account_id: String,
    pub creds: EmailCredentials,
    pub last_uid: u32,
    pub uid_validity: u32,
    pub enabled: bool,
    pub settings_json: Option<String>,
}

#[derive(Debug)]
pub struct ContactRouteInfo {
    id: String,
    screened: bool,
    blocked: bool,
    default_bucket: String,
}

/// Start the background sync loop for every configured email account.
pub fn start(app: AppHandle) {
    spawn(async move {
        if let Err(e) = run_loop(app).await {
            eprintln!("[sync] background loop crashed: {e}");
        }
    });
}

async fn run_loop(app: AppHandle) -> Result<(), String> {
    let pool = open_pool().await?;
    ensure_schema(&pool).await?;

    // Start the 30-day trash/spam expiry purger. It runs independently of
    // account sync so it keeps working even when no email accounts exist.
    spawn_purge_loop(pool.clone());

    // Per-account stop flags and join handles. The reload loop reconciles the
    // DB account list against this map: starts missing accounts and signals
    // removed/disabled accounts to stop.
    let mut handles: std::collections::HashMap<String, (Arc<AtomicBool>, JoinHandle<()>)> =
        std::collections::HashMap::new();

    loop {
        let desired = load_sync_accounts(&pool).await?;

        // Start any account that isn't already running.
        for account in &desired {
            if !handles.contains_key(&account.account_id) {
                let stop = Arc::new(AtomicBool::new(false));
                let handle =
                    spawn_account_loop(app.clone(), pool.clone(), account.clone(), stop.clone());
                handles.insert(account.account_id.clone(), (stop, handle));
            }
        }

        // Signal removed/disabled accounts to stop, then drop their handles.
        let desired_ids: HashSet<String> = desired.iter().map(|a| a.account_id.clone()).collect();
        let to_remove: Vec<String> = handles
            .keys()
            .filter(|k| !desired_ids.contains(*k))
            .cloned()
            .collect();
        for id in to_remove {
            if let Some((stop, handle)) = handles.remove(&id) {
                stop.store(true, Ordering::Relaxed);
                handle.abort();
                // Best-effort cleanup of persisted sync state so a re-added
                // account with the same id starts from scratch.
                if let Err(e) = delete_sync_state(&pool, &id).await {
                    eprintln!("[sync] cleanup sync_state for {id} failed: {e}");
                }
                eprintln!("[sync] stopped account loop for {id}");
            }
        }

        if desired.is_empty() && !handles.is_empty() {
            eprintln!("[sync] no email accounts configured; loops are idle");
        }

        tokio::time::sleep(ACCOUNT_RELOAD_INTERVAL).await;
    }
}

/// Background job that permanently deletes trash/spam messages after 30 days.
fn spawn_purge_loop(pool: SqlitePool) -> JoinHandle<()> {
    spawn(async move {
        loop {
            tokio::time::sleep(PURGE_INTERVAL).await;
            if let Err(e) = purge_expired_messages(&pool).await {
                eprintln!("[purge] failed: {e}");
            }
        }
    })
}

async fn purge_expired_messages(pool: &SqlitePool) -> Result<(), String> {
    // Remove stale full-text index entries first so they don't surface in search.
    sqlx::query(
        "DELETE FROM search_index WHERE id IN ( \
         SELECT id FROM messages WHERE bucket IN ('trash','spam') \
         AND deleted_at < datetime('now','-30 days'))",
    )
    .execute(pool)
    .await
    .map_err(|e| format!("purge search_index: {e}"))?;

    let result = sqlx::query(
        "DELETE FROM messages WHERE bucket IN ('trash','spam') \
         AND deleted_at < datetime('now','-30 days')",
    )
    .execute(pool)
    .await
    .map_err(|e| format!("purge expired messages: {e}"))?;
    let n = result.rows_affected();
    if n > 0 {
        eprintln!("[purge] removed {n} expired trash/spam message(s)");
    }
    Ok(())
}

/// Spawn a dedicated per-account task. The task owns its own IMAP session and
/// loops forever (initial sync → IDLE → sync on trigger) until `stop` is set.
fn spawn_account_loop(
    app: AppHandle,
    pool: SqlitePool,
    mut account: SyncAccount,
    stop: Arc<AtomicBool>,
) -> JoinHandle<()> {
    spawn(async move {
        // Restore last_uid/uid_validity from app_kv.
        if let Ok(Some(json)) = load_sync_state(&pool, &account.account_id).await {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&json) {
                if let Some(uid) = v.get("last_uid").and_then(|x| x.as_u64()) {
                    account.last_uid = uid as u32;
                }
                if let Some(uv) = v.get("uid_validity").and_then(|x| x.as_u64()) {
                    account.uid_validity = uv as u32;
                }
            }
        }

        eprintln!(
            "[sync] starting account loop, account={} email={} last_uid={}",
            account.account_id, account.creds.email, account.last_uid
        );

        let client = ImapClient::new(account.creds.clone());
        let idle_timeout = account
            .settings_json
            .as_deref()
            .and_then(|s| serde_json::from_str::<serde_json::Value>(s).ok())
            .map(|v| sync_frequency_from_json(&v))
            .unwrap_or(IDLE_TIMEOUT);

        // Resolve server-side folder names once per account boot, before the
        // first sync. The result is persisted into accounts.settings_json.syncFolders
        // so subsequent ticks reuse the same mapping.
        match client.list_mailboxes().await {
            Ok(server) => {
                let resolved = resolve_all(&server);
                eprintln!(
                    "[mailbox] resolved folders for {}: {:?}",
                    account.account_id, resolved
                );
                let resolved_json = serde_json::Value::Array(
                    resolved
                        .iter()
                        .map(|n| {
                            serde_json::json!({
                                "name": n,
                                "enabled": true,
                            })
                        })
                        .collect(),
                );
                let mut updated_settings: serde_json::Value = serde_json::from_str(
                    account.settings_json.as_deref().unwrap_or("{}"),
                )
                .unwrap_or_default();
                if let Some(obj) = updated_settings.as_object_mut() {
                    obj.insert("syncFolders".to_string(), resolved_json);
                }
                account.settings_json = Some(updated_settings.to_string());
                let _ = upsert_account(&pool, &account).await;
            }
            Err(e) => {
                eprintln!(
                    "[mailbox] list_mailboxes failed for {}: {e}; using default folders",
                    account.account_id
                );
            }
        }

        if !stop.load(Ordering::Relaxed) {
            if let Err(e) = sync_and_notify(&app, &pool, &client, &mut account).await {
                eprintln!("[sync] initial sync failed for {}: {e}", account.account_id);
                tokio::time::sleep(IDLE_ERROR_BACKOFF).await;
            }
        }

        loop {
            if stop.load(Ordering::Relaxed) {
                eprintln!("[sync] stopping account loop for {}", account.account_id);
                break;
            }

            match client.idle_wait("INBOX", idle_timeout).await {
                Ok(()) => {
                    if stop.load(Ordering::Relaxed) {
                        break;
                    }
                    eprintln!("[sync] IDLE triggered for {}, syncing", account.account_id);
                    if let Err(e) = sync_and_notify(&app, &pool, &client, &mut account).await {
                        eprintln!("[sync] sync failed for {}: {e}", account.account_id);
                        tokio::time::sleep(IDLE_ERROR_BACKOFF).await;
                    }
                }
                Err(e) => {
                    eprintln!(
                        "[sync] IDLE failed for {}: {e}; falling back to poll",
                        account.account_id
                    );
                    if stop.load(Ordering::Relaxed) {
                        break;
                    }
                    if let Err(e) = sync_and_notify(&app, &pool, &client, &mut account).await {
                        eprintln!(
                            "[sync] fallback sync failed for {}: {e}",
                            account.account_id
                        );
                    }
                    tokio::time::sleep(idle_timeout).await;
                }
            }
        }
    })
}

async fn build_test_fallback_account() -> Result<SyncAccount, String> {
    let creds = load_test_credentials().map_err(|e| format!("no test credentials: {e}"))?;
    let account_id = format!("acct_{}", creds.email);
    Ok(SyncAccount {
        account_id,
        creds,
        last_uid: 0,
        uid_validity: 0,
        enabled: true,
        settings_json: None,
    })
}

async fn load_sync_accounts(pool: &SqlitePool) -> Result<Vec<SyncAccount>, String> {
    let db_accounts = load_accounts(pool).await?;
    if !db_accounts.is_empty() {
        return Ok(db_accounts);
    }
    if TEST_FALLBACK_ENABLED {
        match build_test_fallback_account().await {
            Ok(a) => Ok(vec![a]),
            Err(e) => {
                eprintln!("[sync] no accounts configured and test fallback unavailable: {e}");
                Ok(Vec::new())
            }
        }
    } else {
        Ok(Vec::new())
    }
}

async fn load_accounts(pool: &SqlitePool) -> Result<Vec<SyncAccount>, String> {
    let rows = sqlx::query_as::<_, (String, String, Option<String>, Option<String>)>(
        "SELECT id, provider, email, settings_json FROM accounts WHERE type = 'email'",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| format!("load accounts: {e}"))?;

    let mut accounts = Vec::with_capacity(rows.len());
    for (id, provider, email, settings_json) in rows {
        let email = email.unwrap_or_default();
        if email.is_empty() {
            eprintln!("[sync] skipping account {id}: no email");
            continue;
        }
        match resolve_credentials(&id, &provider, &email, settings_json.as_deref()).await {
            Ok(creds) => accounts.push(SyncAccount {
                account_id: id,
                creds,
                last_uid: 0,
                uid_validity: 0,
                enabled: true,
                settings_json,
            }),
            Err(e) => eprintln!("[sync] skipping account {id}: {e}"),
        }
    }
    Ok(accounts)
}

async fn resolve_credentials(
    account_id: &str,
    provider_id: &str,
    email: &str,
    settings_json: Option<&str>,
) -> Result<EmailCredentials, String> {
    let provider =
        providers::by_id(provider_id).ok_or_else(|| format!("unknown provider '{provider_id}'"))?;

    // Ensure dev `.env` is loaded so the test-account fallback works when
    // `resolve_credentials` runs before any explicit `load_test_credentials()`.
    let _ = dotenvy::dotenv();

    // 1. Prefer the OS keyring.
    let password = match vault::get_password(account_id) {
        Ok(Some(p)) => p,
        Ok(None) => {
            // 2. Dev convenience: if no keyring entry, fall back to the test
            //    account password when the email matches.
            let test_email = std::env::var("SENDPALM_TEST_EMAIL").unwrap_or_default();
            if email == test_email {
                std::env::var("SENDPALM_TEST_PASSWORD")
                    .map_err(|e| format!("keyring empty and test password unavailable: {e}"))?
            } else {
                return Err("no password in keyring".into());
            }
        }
        Err(e) => {
            // iOS Simulator (and some locked-down environments) cannot access the
            // OS keychain because the required entitlement isn't present. Fall
            // back to the dev test-account env vars when the email matches so
            // simulator smoke tests with real mail can still run.
            eprintln!("[sync] keyring unavailable for {account_id} ({e}); trying env fallback");
            let test_email = std::env::var("SENDPALM_TEST_EMAIL").unwrap_or_default();
            if email == test_email {
                std::env::var("SENDPALM_TEST_PASSWORD")
                    .map_err(|e| format!("keyring failed and test password unavailable: {e}"))?
            } else {
                return Err(format!("keyring error: {e}"));
            }
        }
    };

    let settings: serde_json::Value = settings_json
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or_default();

    let imap_host = pick_host(&provider.imap_host, &settings, "imap_host");
    let smtp_host = pick_host(&provider.smtp_host, &settings, "smtp_host");

    if imap_host.is_empty() {
        return Err("missing IMAP host".into());
    }
    if smtp_host.is_empty() {
        return Err("missing SMTP host".into());
    }

    let imap_port = pick_port(provider.imap_port, &settings, "imap_port");
    let smtp_port = pick_port(provider.smtp_port, &settings, "smtp_port");
    let smtp_implicit_tls = provider.smtp_implicit_tls
        || settings
            .get("smtp_implicit_tls")
            .and_then(|v| v.as_bool())
            .unwrap_or(false)
        || smtp_port == 465;

    Ok(EmailCredentials {
        email: email.to_string(),
        password,
        imap_host,
        imap_port,
        smtp_host,
        smtp_port,
        smtp_implicit_tls,
    })
}

fn pick_host(template_host: &str, settings: &serde_json::Value, key: &str) -> String {
    if !template_host.is_empty() {
        return template_host.to_string();
    }
    settings
        .get(key)
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string()
}

fn pick_port(template_port: u16, settings: &serde_json::Value, key: &str) -> u16 {
    settings
        .get(key)
        .and_then(|v| v.as_u64())
        .and_then(|n| u16::try_from(n).ok())
        .unwrap_or(template_port)
}

async fn load_sync_state(pool: &SqlitePool, account_id: &str) -> Result<Option<String>, String> {
    sqlx::query_as::<_, (String,)>("SELECT value FROM app_kv WHERE key = $1")
        .bind(format!("sync_state::{account_id}"))
        .fetch_optional(pool)
        .await
        .map(|opt| opt.map(|(json,)| json))
        .map_err(|e| e.to_string())
}

async fn delete_sync_state(pool: &SqlitePool, account_id: &str) -> Result<(), String> {
    sqlx::query("DELETE FROM app_kv WHERE key = $1")
        .bind(format!("sync_state::{account_id}"))
        .execute(pool)
        .await
        .map(|_| ())
        .map_err(|e| e.to_string())
}

async fn sync_and_notify(
    app: &AppHandle,
    pool: &SqlitePool,
    client: &ImapClient,
    account: &mut SyncAccount,
) -> Result<(), String> {
    let store = app.state::<crate::services::state::SyncStateStore>();
    store.put(
        &account.account_id,
        crate::services::state::AccountSyncState {
            uid_validity: account.uid_validity,
            last_uid: account.last_uid,
            last_synced_at: chrono::Utc::now(),
            busy: true,
        },
    );

    let previous_last_uid = account.last_uid;
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {e}"))?;
    let result = sync_one(app, &data_dir, pool, client, account, previous_last_uid).await;

    let (n, new_last_uid, new_uv) = match result {
        Ok(r) => r,
        Err(e) => {
            store.put(
                &account.account_id,
                crate::services::state::AccountSyncState {
                    uid_validity: account.uid_validity,
                    last_uid: account.last_uid,
                    last_synced_at: chrono::Utc::now(),
                    busy: false,
                },
            );
            return Err(e);
        }
    };

    account.last_uid = new_last_uid;
    account.uid_validity = new_uv;

    store.put(
        &account.account_id,
        crate::services::state::AccountSyncState {
            uid_validity: new_uv,
            last_uid: new_last_uid,
            last_synced_at: chrono::Utc::now(),
            busy: false,
        },
    );

    if n > 0 {
        eprintln!(
            "[sync] inserted {} new message(s) for {}",
            n, account.account_id
        );
    }
    Ok(())
}

/// Aggregate of one `sync_one` cycle, exposed for tests.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct SyncOutcome {
    pub total_inserted: u32,
    pub failed_folders: Vec<String>,
}

/// Test seam: aggregate per-folder outcomes without touching IMAP.
pub async fn sync_one_outcome(
    results: Vec<(&str, Result<u32, String>)>,
) -> SyncOutcome {
    let mut out = SyncOutcome::default();
    for (folder, result) in results {
        match result {
            Ok(n) => out.total_inserted += n,
            Err(_) => out.failed_folders.push(folder.to_string()),
        }
    }
    out
}

async fn sync_one(
    app: &AppHandle,
    data_dir: &std::path::Path,
    pool: &SqlitePool,
    client: &ImapClient,
    account: &SyncAccount,
    previous_last_uid: u32,
) -> Result<(u32, u32, u32), String> {
    // Ensure the account row exists in the accounts table so the foreign
    // key on messages.ac is satisfied. For DB-configured accounts this is a
    // no-op update; for the test fallback it creates the row.
    upsert_account(pool, account).await?;

    let settings: serde_json::Value = account
        .settings_json
        .as_deref()
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or_default();
    let folders = sync_folders_from_json(&settings);

    let mut total_inserted = 0u32;
    let mut inbox_cursor = account.last_uid;
    let mut inbox_uid_validity = account.uid_validity;

    for folder in &folders {
        let state_key = format!("sync_state::{}::{}", account.account_id, folder);
        let (folder_last_uid, _folder_uid_validity) =
            load_folder_sync_state(pool, &state_key).await?;
        let is_inbox = folder.eq_ignore_ascii_case("INBOX");
        // For INBOX, keep using the legacy account-level state as the source of
        // truth so existing installs don't lose their cursor.
        let start_uid = if is_inbox {
            account.last_uid.max(folder_last_uid)
        } else {
            folder_last_uid
        };

        let (inserted, cursor, uid_validity) = match sync_folder(
            app,
            data_dir,
            pool,
            client,
            account,
            folder,
            start_uid,
            // Only trigger vacation replies for new mail in INBOX.
            if is_inbox { previous_last_uid } else { 0 },
        )
        .await
        {
            Ok(t) => t,
            Err(e) => {
                eprintln!(
                    "[sync] folder={folder} failed for {}: {e}",
                    account.account_id
                );
                // Persist the previous cursor so a fixed folder can resume cleanly.
                let _ = save_folder_sync_state(pool, &state_key, start_uid, 0).await;
                continue;
            }
        };
        total_inserted += inserted;

        save_folder_sync_state(pool, &state_key, cursor, uid_validity).await?;
        if is_inbox {
            inbox_cursor = cursor;
            inbox_uid_validity = uid_validity;
            // Keep the legacy account-level state in sync as well.
            save_folder_sync_state(
                pool,
                &format!("sync_state::{}", account.account_id),
                cursor,
                uid_validity,
            )
            .await?;
        }
    }

    // Notify the frontend so it can refresh Imbox / Notifications in real time.
    let report = crate::services::SyncReport {
        account_id: account.account_id.clone(),
        mailbox: "INBOX".to_string(),
        new_messages: total_inserted as usize,
        skipped: 0,
        uid_validity: inbox_uid_validity as u64,
        last_uid: inbox_cursor as u64,
        error: None,
    };
    let _ = app.emit("sync:new-messages", report);

    Ok((total_inserted, inbox_cursor, inbox_uid_validity))
}

async fn load_folder_sync_state(pool: &SqlitePool, key: &str) -> Result<(u32, u32), String> {
    let row: Option<(String,)> = sqlx::query_as("SELECT value FROM app_kv WHERE key = $1")
        .bind(key)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("load sync state {key}: {e}"))?;

    let Some((json,)) = row else {
        return Ok((0, 0));
    };
    let value: serde_json::Value = serde_json::from_str(&json).unwrap_or_default();
    let last_uid = value.get("last_uid").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
    let uid_validity = value
        .get("uid_validity")
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as u32;
    Ok((last_uid, uid_validity))
}

async fn save_folder_sync_state(
    pool: &SqlitePool,
    key: &str,
    last_uid: u32,
    uid_validity: u32,
) -> Result<(), String> {
    let json = serde_json::json!({
        "uid_validity": uid_validity,
        "last_uid": last_uid,
        "last_synced_at": chrono::Utc::now().to_rfc3339(),
    });
    sqlx::query(
        "INSERT INTO app_kv (key, value, updated_at) VALUES ($1, $2, datetime('now')) \
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    )
    .bind(key)
    .bind(json.to_string())
    .execute(pool)
    .await
    .map_err(|e| format!("save sync state {key}: {e}"))?;
    Ok(())
}

/// Test seam: given a starting cursor and a list of `(uid, success)`
/// outcomes, return `(inserted, new_cursor)`. The cursor is the largest UID
/// whose outcome was `success`; it never advances past a failed UID.
pub fn advance_cursor(
    start: u32,
    results: &[(u32, bool)],
) -> (u32, u32) {
    let mut cursor = start;
    let mut inserted = 0u32;
    for &(uid, ok) in results {
        if ok {
            cursor = cursor.max(uid);
            inserted += 1;
        } else {
            // Stop at the first failed UID so the cursor never advances past
            // a failure (even if later UIDs in the chunk succeed).
            break;
        }
    }
    (inserted, cursor)
}

#[allow(clippy::too_many_arguments)]
async fn sync_folder(
    _app: &AppHandle,
    data_dir: &std::path::Path,
    pool: &SqlitePool,
    client: &ImapClient,
    account: &SyncAccount,
    folder: &str,
    start_uid: u32,
    previous_last_uid: u32,
) -> Result<(u32, u32, u32), String> {
    let mut inserted = 0u32;
    #[allow(unused_assignments)]
    let mut uid_validity = 0u32;
    let mut cursor = start_uid;

    loop {
        let bundle = client.sync(folder, cursor).await?;
        uid_validity = bundle.uid_validity;
        if bundle.messages.is_empty() {
            cursor = bundle.highest_uid;
            break;
        }
        let mut chunk_outcomes: Vec<(u32, bool)> = Vec::with_capacity(bundle.messages.len());
        for (uid, parsed) in &bundle.messages {
            let ok = insert_message(
                data_dir,
                pool,
                account,
                folder,
                *uid,
                parsed,
                previous_last_uid,
            )
            .await
            .is_ok();
            chunk_outcomes.push((*uid, ok));
        }
        let (chunk_inserted, chunk_last_ok) = advance_cursor(cursor, &chunk_outcomes);
        inserted += chunk_inserted;
        // advance_cursor already returns the highest successful UID; on a partial chunk
        // we deliberately stay below bundle.highest_uid so the next tick retries the rest.
        cursor = chunk_last_ok;
        if !chunk_outcomes.iter().all(|(_, ok)| *ok) {
            // Short-circuit: don't fetch another chunk after a partial failure
            // (the cursor is already pinned to the last successful UID above).
            break;
        }
        if (bundle.messages.len() as u32) < crate::services::imap::MAX_PER_TICK {
            break;
        }
    }

    eprintln!("[sync] folder={folder} inserted={inserted} cursor={cursor}");
    Ok((inserted, cursor, uid_validity))
}

async fn insert_message(
    data_dir: &std::path::Path,
    pool: &SqlitePool,
    account: &SyncAccount,
    folder: &str,
    uid: u32,
    parsed: &crate::services::parser::ParsedMessage,
    previous_last_uid: u32,
) -> Result<(), String> {
    let route = upsert_contact(pool, &parsed.sender_email, parsed.sender_name.as_deref()).await?;
    let bucket = compute_message_bucket(&route);
    let contact_id = route.id;
    let folder_slug = folder.replace(['/', ' '], "_");
    let mid = format!("imap_{}_{folder_slug}_{uid}", account.account_id);

    let prev_excerpt = parsed
        .body_text
        .split('\n')
        .next()
        .unwrap_or("")
        .chars()
        .take(140)
        .collect::<String>();
    let calendar_json = parsed
        .calendar_invite
        .as_ref()
        .and_then(|e| serde_json::to_string(e).ok());
    let body_html = parsed.body_html.as_deref().unwrap_or("");
    let cc_json = serde_json::to_string(&parsed.cc).unwrap_or_else(|_| "[]".to_string());
    let bcc_json = serde_json::to_string(&parsed.bcc).unwrap_or_else(|_| "[]".to_string());
    sqlx::query(
        "INSERT OR IGNORE INTO messages \
         (id, pid, subj, prev, body, body_html, tm, st, ac, bucket, direction, unread, labels_json, attachments_json, trackers_json, thread_id, calendar_json, to_addr, cc_json, bcc_json) \
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'in', 1, '[]', '[]', '[]', $11, $12, $13, $14, $15)"
    )
    .bind(&mid)
    .bind(&contact_id)
    .bind(&parsed.subject)
    .bind(&prev_excerpt)
    .bind(&parsed.body_text)
    .bind(body_html)
    .bind(parsed.date.format("%Y-%m-%d %H:%M").to_string())
    .bind(parsed.date.to_rfc3339())
    .bind(&account.account_id)
    .bind(bucket)
    .bind(parsed.thread_id.as_deref().unwrap_or(""))
    .bind(calendar_json.as_deref())
    .bind(&parsed.to_addr)
    .bind(&cc_json)
    .bind(&bcc_json)
    .execute(pool)
    .await
    .map_err(|e| format!("insert message uid={uid}: {e}"))?;

    // Index the message for full-text search.
    let search_body = format!(
        "{} {} {}",
        parsed.sender_email,
        parsed.sender_name.as_deref().unwrap_or(""),
        parsed.body_text
    );
    let _ = index_entity(pool, &mid, "message", &parsed.subject, &search_body).await;

    // Persist attachments to disk and link them to the message.
    let attachment_ids = persist_attachments(data_dir, pool, &contact_id, &parsed.attachments)
        .await
        .map_err(|e| format!("persist attachments uid={uid}: {e}"))?;
    if !attachment_ids.is_empty() {
        let ids_json = serde_json::to_string(&attachment_ids).unwrap_or_else(|_| "[]".to_string());
        sqlx::query("UPDATE messages SET attachments_json = $1 WHERE id = $2")
            .bind(&ids_json)
            .bind(&mid)
            .execute(pool)
            .await
            .map_err(|e| format!("update attachments_json uid={uid}: {e}"))?;
    }

    // Auto-import calendar invites so they appear in the sender's Contact
    // Calendar tab and in the Calendar view without requiring a manual click.
    if let Some(invite) = &parsed.calendar_invite {
        let _ = insert_event_from_invite(pool, invite, &contact_id).await;
    }

    // Only notify for genuinely new mail (skip the historic backlog on
    // the first sync). previous_last_uid == 0 means this is the initial
    // backfill.
    if previous_last_uid > 0 && uid > previous_last_uid {
        let sender = parsed
            .sender_name
            .as_deref()
            .unwrap_or(&parsed.sender_email);
        let title = if parsed.subject.is_empty() {
            format!("New message from {sender}")
        } else {
            parsed.subject.clone()
        };
        sqlx::query(
            "INSERT OR IGNORE INTO notifications (id, type, title, body, ref_json, read, created_at) \
             VALUES ($1, 'mail', $2, $3, $4, 0, datetime('now'))"
        )
        .bind(format!("nt_{mid}"))
        .bind(&title)
        .bind(format!("From {sender}"))
        .bind(format!("{{\"type\":\"message\",\"id\":\"{mid}\"}}"))
        .execute(pool)
        .await
        .map_err(|e| format!("insert notification uid={uid}: {e}"))?;

        // Trigger vacation auto-responder for new mail.
        let _ = maybe_send_vacation_reply(pool, &account.account_id, &account.creds, parsed).await;
    }
    Ok(())
}

/// Send a vacation auto-reply if the account has one enabled and the sender
/// has not received one recently (last 7 days).
async fn maybe_send_vacation_reply(
    pool: &SqlitePool,
    account_id: &str,
    creds: &EmailCredentials,
    parsed: &crate::services::parser::ParsedMessage,
) -> Result<(), String> {
    let settings = load_account_settings_json(account_id).await?;
    let vacation = settings
        .get("vacationResponder")
        .cloned()
        .unwrap_or_default();
    let enabled = vacation
        .get("enabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    if !enabled {
        return Ok(());
    }

    let subject = vacation
        .get("subject")
        .and_then(|v| v.as_str())
        .unwrap_or("Out of office")
        .to_string();
    let body = vacation
        .get("body")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    if subject.is_empty() && body.is_empty() {
        return Ok(());
    }

    let sender = parsed.sender_email.trim();
    if sender.is_empty() || !sender.contains('@') {
        return Ok(());
    }

    // Do not auto-reply to ourselves or to automated senders.
    if sender.eq_ignore_ascii_case(&creds.email) {
        return Ok(());
    }
    let lower_from = parsed.sender_email.to_lowercase();
    if lower_from.contains("mailer-daemon")
        || lower_from.contains("noreply")
        || lower_from.contains("no-reply")
    {
        return Ok(());
    }

    // Throttle: one reply per sender per account in the last 7 days.
    let week_ago = (chrono::Utc::now() - chrono::Duration::days(7)).to_rfc3339();
    let recent: Option<(String,)> = sqlx::query_as(
        "SELECT sent_at FROM vacation_replies WHERE account_id = $1 AND sender_email = $2 AND sent_at > $3",
    )
    .bind(account_id)
    .bind(sender)
    .bind(&week_ago)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("vacation throttle check: {e}"))?;
    if recent.is_some() {
        return Ok(());
    }

    let smtp = crate::services::smtp::SmtpClient::new(creds.clone());
    let from = build_from_mailbox(&creds.email, "")?;
    let reply_subject = if subject.to_lowercase().starts_with("re:") {
        subject
    } else {
        format!("Re: {subject}")
    };

    smtp.send(
        &from,
        &[sender.to_string()],
        &[],
        &[],
        None,
        &reply_subject,
        &body,
        None,
        vec![],
    )
    .await?;

    sqlx::query(
        "INSERT INTO vacation_replies (id, account_id, sender_email, sent_at) VALUES ($1, $2, $3, $4) \
         ON CONFLICT(account_id, sender_email) DO UPDATE SET sent_at = excluded.sent_at",
    )
    .bind(format!("vr_{}_{}", account_id, sender))
    .bind(account_id)
    .bind(sender)
    .bind(chrono::Utc::now().to_rfc3339())
    .execute(pool)
    .await
    .map_err(|e| format!("record vacation reply: {e}"))?;

    Ok(())
}

async fn insert_event_from_invite(
    pool: &SqlitePool,
    invite: &crate::services::ical::IcalEvent,
    contact_id: &str,
) -> Result<(), String> {
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

    sqlx::query(
        "INSERT OR IGNORE INTO events (id, title, dt, tm, dur, location, agenda_json, pids_json, brief, color) \
         VALUES ($1, $2, $3, $4, $5, $6, '[]', $7, $8, '#0A8F63')",
    )
    .bind(&id)
    .bind(&invite.summary)
    .bind(&date_str)
    .bind(&time_str)
    .bind(dur)
    .bind(invite.location.as_deref().unwrap_or(""))
    .bind(format!("[\"{contact_id}\"]"))
    .bind(invite.description.as_deref().unwrap_or(""))
    .execute(pool)
    .await
    .map_err(|e| format!("insert event from invite: {e}"))?;
    Ok(())
}

/// Persist a copy of a message sent via SMTP so it appears in the recipient's
/// contact timeline. This is a local "Sent" copy; full two-way Sent-folder sync
/// can be added later.
pub async fn save_sent_message(
    pool: &SqlitePool,
    data_dir: &std::path::Path,
    account_id: &str,
    to_email: &str,
    subject: &str,
    body: &str,
    attachments: &[crate::services::smtp::OutgoingAttachment],
) -> Result<String, String> {
    let route = upsert_contact(pool, to_email, None).await?;
    let mid = format!("sent_{}", uuid::Uuid::new_v4().simple());
    let prev_excerpt = body
        .split('\n')
        .next()
        .unwrap_or("")
        .chars()
        .take(140)
        .collect::<String>();
    let now = chrono::Utc::now();

    // Persist outgoing attachments to disk and link them to the recipient.
    let attachment_ids =
        persist_outgoing_attachments(data_dir, pool, &route.id, attachments).await?;
    let attachments_json =
        serde_json::to_string(&attachment_ids).unwrap_or_else(|_| "[]".to_string());

    sqlx::query(
        "INSERT INTO messages \
         (id, pid, subj, prev, body, tm, st, ac, bucket, direction, unread, labels_json, attachments_json, trackers_json) \
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'paperTrail', 'out', 0, '[]', $9, '[]')"
    )
    .bind(&mid)
    .bind(&route.id)
    .bind(subject)
    .bind(&prev_excerpt)
    .bind(body)
    .bind(now.format("%Y-%m-%d %H:%M").to_string())
    .bind(now.to_rfc3339())
    .bind(account_id)
    .bind(&attachments_json)
    .execute(pool)
    .await
    .map_err(|e| format!("insert sent message: {e}"))?;
    let _ = index_entity(pool, &mid, "message", subject, body).await;
    Ok(mid)
}

async fn persist_attachments(
    data_dir: &std::path::Path,
    pool: &SqlitePool,
    contact_id: &str,
    attachments: &[crate::services::parser::ParsedAttachment],
) -> Result<Vec<String>, String> {
    if attachments.is_empty() {
        return Ok(Vec::new());
    }

    let attachments_dir = data_dir.join("attachments");
    tokio::fs::create_dir_all(&attachments_dir)
        .await
        .map_err(|e| format!("create attachments dir: {e}"))?;

    let mut ids = Vec::with_capacity(attachments.len());
    for att in attachments {
        let Some(content) = &att.content else {
            continue;
        };
        let file_id = format!("att_{}", uuid::Uuid::new_v4().simple());
        let safe_name = sanitize_filename(&att.filename);
        let file_dir = attachments_dir.join(&file_id);
        tokio::fs::create_dir_all(&file_dir)
            .await
            .map_err(|e| format!("create file dir {file_id}: {e}"))?;
        let file_path = file_dir.join(&safe_name);
        tokio::fs::write(&file_path, content)
            .await
            .map_err(|e| format!("write attachment {file_id}: {e}"))?;

        let relative = format!("attachments/{file_id}/{safe_name}");
        let file_type = crate::services::parser::file_type_from_mime(&att.mime);
        let now = chrono::Utc::now().to_rfc3339();
        sqlx::query(
            "INSERT INTO files (id, pid, name, type, mime, size, url, st) \
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
        )
        .bind(&file_id)
        .bind(contact_id)
        .bind(&att.filename)
        .bind(file_type)
        .bind(&att.mime)
        .bind(content.len() as i64)
        .bind(&relative)
        .bind(&now)
        .execute(pool)
        .await
        .map_err(|e| format!("insert file row {file_id}: {e}"))?;

        ids.push(file_id);
    }

    Ok(ids)
}

async fn persist_outgoing_attachments(
    data_dir: &std::path::Path,
    pool: &SqlitePool,
    contact_id: &str,
    attachments: &[crate::services::smtp::OutgoingAttachment],
) -> Result<Vec<String>, String> {
    if attachments.is_empty() {
        return Ok(Vec::new());
    }

    let attachments_dir = data_dir.join("attachments");
    tokio::fs::create_dir_all(&attachments_dir)
        .await
        .map_err(|e| format!("create attachments dir: {e}"))?;

    let mut ids = Vec::with_capacity(attachments.len());
    for att in attachments {
        let file_id = format!("att_{}", uuid::Uuid::new_v4().simple());
        let safe_name = sanitize_filename(&att.filename);
        let file_dir = attachments_dir.join(&file_id);
        tokio::fs::create_dir_all(&file_dir)
            .await
            .map_err(|e| format!("create file dir {file_id}: {e}"))?;
        let file_path = file_dir.join(&safe_name);
        tokio::fs::write(&file_path, &att.bytes)
            .await
            .map_err(|e| format!("write attachment {file_id}: {e}"))?;

        let relative = format!("attachments/{file_id}/{safe_name}");
        let file_type = crate::services::parser::file_type_from_mime(&att.mime);
        let now = chrono::Utc::now().to_rfc3339();
        sqlx::query(
            "INSERT INTO files (id, pid, name, type, mime, size, url, st) \
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
        )
        .bind(&file_id)
        .bind(contact_id)
        .bind(&att.filename)
        .bind(file_type)
        .bind(&att.mime)
        .bind(att.bytes.len() as i64)
        .bind(&relative)
        .bind(&now)
        .execute(pool)
        .await
        .map_err(|e| format!("insert file row {file_id}: {e}"))?;

        ids.push(file_id);
    }

    Ok(ids)
}

fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect::<String>()
        .trim_start_matches('.')
        .to_string()
}

async fn upsert_account(pool: &SqlitePool, account: &SyncAccount) -> Result<(), String> {
    let settings_json = serde_json::to_string(&serde_json::json!({
        "aliases": [],
        "signature": "",
        "replyTo": "",
        "defaultFrom": account.creds.email,
        "syncFolders": [
            { "name": "INBOX", "enabled": true },
            { "name": "Sent", "enabled": true }
        ],
        "syncFrequency": "15min",
        "autoBcc": false,
        "autoBccAddress": "",
        "vacationResponder": { "enabled": false, "subject": "", "body": "" }
    }))
    .unwrap_or_default();
    sqlx::query(
        "INSERT INTO accounts (id, type, provider, email, label, display_name, status, synced, total, privacy, color, avatar, last_sync, settings_json) \
         VALUES ($1, 'email', 'feishu', $2, $3, $4, 'connected', 0, 0, 'unified', '#0A8F63', substr($4, 1, 1), datetime('now'), $5) \
         ON CONFLICT(id) DO UPDATE SET display_name = excluded.display_name, last_sync = excluded.last_sync, settings_json = excluded.settings_json"
    )
    .bind(&account.account_id)
    .bind(&account.creds.email)
    .bind(&account.creds.email)
    .bind(&account.creds.email)
    .bind(&settings_json)
    .execute(pool)
    .await
    .map_err(|e| format!("upsert account: {e}"))?;
    Ok(())
}

fn compute_message_bucket(route: &ContactRouteInfo) -> &'static str {
    if route.blocked {
        return "spam";
    }
    if route.screened {
        return match route.default_bucket.as_str() {
            "feed" => "feed",
            "paperTrail" => "paperTrail",
            "trash" => "trash",
            "spam" => "spam",
            _ => "imbox",
        };
    }
    "imbox"
}

pub async fn upsert_contact(
    pool: &SqlitePool,
    email: &str,
    name: Option<&str>,
) -> Result<ContactRouteInfo, String> {
    let id = format!("c_{}", email.replace('@', "_at_").replace('.', "_"));
    let display_name = name
        .map(|s| s.to_string())
        .unwrap_or_else(|| email.split('@').next().unwrap_or(email).to_string());
    // Split the display name into first/last parts. The SQL store requires
    // both fields (NOT NULL).
    let (first, last) = match display_name.split_once(' ') {
        Some((f, l)) => (f.to_string(), l.to_string()),
        None => (display_name.clone(), "".to_string()),
    };
    sqlx::query(
        "INSERT INTO contacts (id, first_name, last_name, nickname, name, emails_json, stage, grp, health, first_contact, first_seen, screened, default_bucket) \
         VALUES ($1, $2, $3, '', $4, $5, 'active', 'active', 75, datetime('now'), 1, 0, 'imbox') \
         ON CONFLICT(id) DO UPDATE SET first_name = excluded.first_name, last_name = excluded.last_name, name = excluded.name"
    )
    .bind(&id)
    .bind(&first)
    .bind(&last)
    .bind(&display_name)
    .bind(format!("[{{\"value\":\"{}\",\"label\":\"work\"}}]", email))
    .execute(pool)
    .await
    .map_err(|e| format!("upsert contact: {e}"))?;

    let row = sqlx::query_as::<_, (bool, bool, String)>(
        "SELECT screened, blocked, default_bucket FROM contacts WHERE id = $1",
    )
    .bind(&id)
    .fetch_one(pool)
    .await
    .map_err(|e| format!("load contact route info: {e}"))?;

    Ok(ContactRouteInfo {
        id,
        screened: row.0,
        blocked: row.1,
        default_bucket: row.2,
    })
}

/// Resolve credentials for a single account by id, opening a fresh SQL pool.
/// Used by Tauri commands (e.g. SMTP send) that need to authenticate without
/// the background sync loop's pool.
pub async fn resolve_account_credentials(account_id: &str) -> Result<EmailCredentials, String> {
    let pool = open_pool().await?;
    resolve_account_credentials_with_pool(&pool, account_id).await
}

pub async fn resolve_account_credentials_with_pool(
    pool: &SqlitePool,
    account_id: &str,
) -> Result<EmailCredentials, String> {
    let row = sqlx::query_as::<_, (String, String, Option<String>, Option<String>)>(
        "SELECT id, provider, email, settings_json FROM accounts WHERE id = $1",
    )
    .bind(account_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("load account {account_id}: {e}"))?;

    let (id, provider, email, settings_json) =
        row.ok_or_else(|| format!("account {account_id} not found"))?;
    let email = email.unwrap_or_default();
    if email.is_empty() {
        return Err(format!("account {account_id} has no email"));
    }
    resolve_credentials(&id, &provider, &email, settings_json.as_deref()).await
}

/// Load the raw `settings_json` blob for an account (email-only).
pub async fn load_account_settings_json(account_id: &str) -> Result<serde_json::Value, String> {
    let pool = open_pool().await?;
    let row =
        sqlx::query_as::<_, (Option<String>,)>("SELECT settings_json FROM accounts WHERE id = $1")
            .bind(account_id)
            .fetch_optional(&pool)
            .await
            .map_err(|e| format!("load account settings {account_id}: {e}"))?;
    let settings_json = row.map(|r| r.0).unwrap_or_default();
    Ok(settings_json
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default())
}

/// Resolved outgoing-mail settings derived from `AccountSettings`.
#[derive(Debug, Default, Clone)]
pub struct OutgoingMailSettings {
    pub signature: String,
    pub reply_to: String,
    pub default_from_name: String,
    pub auto_bcc: String,
}

/// Extract the list of IMAP folders to sync from `settings_json`.
/// Falls back to `["INBOX"]` when not configured.
pub fn sync_folders_from_json(settings: &serde_json::Value) -> Vec<String> {
    let mut folders: Vec<String> = settings
        .get("syncFolders")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|item| {
                    let enabled = item
                        .get("enabled")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(true);
                    if !enabled {
                        return None;
                    }
                    item.get("name")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string())
                })
                .filter(|s| !s.is_empty())
                .collect()
        })
        .unwrap_or_default();
    if folders.is_empty() {
        folders.push("INBOX".to_string());
    }
    folders
}

/// Convert the account `syncFrequency` setting into a poll/IDLE timeout.
/// Defaults to 60 seconds for real-time behavior.
pub fn sync_frequency_from_json(settings: &serde_json::Value) -> Duration {
    let value = settings
        .get("syncFrequency")
        .and_then(|v| v.as_str())
        .unwrap_or("1h");
    match value {
        "5min" => Duration::from_secs(5 * 60),
        "15min" => Duration::from_secs(15 * 60),
        "30min" => Duration::from_secs(30 * 60),
        "1h" => Duration::from_secs(60 * 60),
        "manual" => Duration::from_secs(60 * 60),
        _ => Duration::from_secs(60 * 60),
    }
}

/// Extract outgoing-mail settings from the account's `settings_json` value.
pub fn outgoing_settings_from_json(
    settings: &serde_json::Value,
    account_email: &str,
) -> OutgoingMailSettings {
    let signature = settings
        .get("signature")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    let reply_to = settings
        .get("replyTo")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    let default_from_name = settings
        .get("defaultFrom")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    let auto_bcc = if settings
        .get("autoBcc")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
    {
        settings
            .get("autoBccAddress")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string()
    } else {
        String::new()
    };

    // Fallback reply-to to the account email when not configured.
    let reply_to = if reply_to.is_empty() {
        account_email.to_string()
    } else {
        reply_to
    };

    OutgoingMailSettings {
        signature,
        reply_to,
        default_from_name,
        auto_bcc,
    }
}

/// Build a `From` mailbox from account email + optional display name override.
pub fn build_from_mailbox(account_email: &str, display_name: &str) -> Result<String, String> {
    if display_name.is_empty() {
        Ok(account_email.to_string())
    } else {
        format!("{} <{account_email}>", display_name)
            .parse::<Mailbox>()
            .map(|_| format!("{} <{account_email}>", display_name))
            .or_else(|_| {
                // If the display name contains special characters, quote it.
                format!("\"{}\" <{account_email}>", display_name)
                    .parse::<Mailbox>()
                    .map(|_| format!("\"{}\" <{account_email}>", display_name))
                    .map_err(|e| format!("bad from display name: {e}"))
            })
    }
}

pub async fn open_pool() -> Result<SqlitePool, String> {
    let path = db_path();
    let opts = SqliteConnectOptions::from_str(&format!("sqlite://{}", path.display()))
        .map_err(|e| format!("parse db url: {e}"))?
        .create_if_missing(true)
        .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal);
    SqlitePool::connect_with(opts)
        .await
        .map_err(|e| format!("connect db: {e}"))
}

fn db_path() -> PathBuf {
    // Mirror the tauri-plugin-sql `sqlite:sendpalm.db` resolution:
    // macOS: $HOME/Library/Application Support/com.sendpalm.app/sendpalm.db
    let dir = dirs_app_support();
    dir.join("sendpalm.db")
}

fn dirs_app_support() -> PathBuf {
    // Try $APPDATA / $XDG_DATA_HOME / ~/Library/Application Support/<bundle_id>
    if let Some(p) = std::env::var_os("APPDATA") {
        let mut path = PathBuf::from(p);
        path.push("com.sendpalm.app");
        return path;
    }
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| ".".to_string());
    let mut path = PathBuf::from(home);
    path.push("Library/Application Support/com.sendpalm.app");
    path
}

pub async fn index_entity(
    pool: &SqlitePool,
    id: &str,
    kind: &str,
    title: &str,
    body: &str,
) -> Result<(), String> {
    sqlx::query("DELETE FROM search_index WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| format!("delete search_index {id}: {e}"))?;
    sqlx::query("INSERT INTO search_index (id, kind, title, body) VALUES ($1, $2, $3, $4)")
        .bind(id)
        .bind(kind)
        .bind(title)
        .bind(body)
        .execute(pool)
        .await
        .map_err(|e| format!("index {id}: {e}"))?;
    Ok(())
}

async fn ensure_schema(pool: &SqlitePool) -> Result<(), String> {
    // App-level KV table used to track sync state per account.
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS app_kv (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )",
    )
    .execute(pool)
    .await
    .map_err(|e| format!("ensure app_kv: {e}"))?;

    // Backfill: queue any unscreened, unblocked contacts into the Gate
    // screener. Older builds (before first_seen was set on insert) left every
    // contact at first_seen=0, so Gate would never surface them. This is
    // idempotent — once a contact has first_seen=1 or screened=1, it's a
    // no-op.
    sqlx::query(
        "UPDATE contacts SET first_seen = 1 \
         WHERE first_seen = 0 AND screened = 0 AND blocked = 0",
    )
    .execute(pool)
    .await
    .map_err(|e| format!("backfill gate queue: {e}"))?;
    Ok(())
}
