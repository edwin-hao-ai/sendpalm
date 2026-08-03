//! Background sync loop — uses IMAP IDLE for INBOX when possible, falling
//! back to a short poll sleep if the server doesn't support IDLE.
//!
//! v2: supports multiple email accounts. Each account gets its own spawned
//! task and IMAP session. The account list is reloaded every minute so
//! accounts added in Settings start syncing without an app restart.

use crate::services::imap::{ImapClient, IDLE_TIMEOUT};
use crate::services::providers;
use crate::services::vault;
use crate::services::{EmailCredentials, load_test_credentials};
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
                let handle = spawn_account_loop(
                    app.clone(),
                    pool.clone(),
                    account.clone(),
                    stop.clone(),
                );
                handles.insert(account.account_id.clone(), (stop, handle));
            }
        }

        // Signal removed/disabled accounts to stop, then drop their handles.
        let desired_ids: HashSet<String> =
            desired.iter().map(|a| a.account_id.clone()).collect();
        let to_remove: Vec<String> = handles
            .keys()
            .filter(|k| !desired_ids.contains(*k))
            .cloned()
            .collect();
        for id in to_remove {
            if let Some((stop, handle)) = handles.remove(&id) {
                stop.store(true, Ordering::Relaxed);
                handle.abort();
                eprintln!("[sync] stopped account loop for {id}");
            }
        }

        if desired.is_empty() && !handles.is_empty() {
            eprintln!("[sync] no email accounts configured; loops are idle");
        }

        tokio::time::sleep(ACCOUNT_RELOAD_INTERVAL).await;
    }
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

            match client.idle_wait("INBOX", IDLE_TIMEOUT).await {
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
                        eprintln!("[sync] fallback sync failed for {}: {e}", account.account_id);
                    }
                    tokio::time::sleep(IDLE_ERROR_BACKOFF).await;
                }
            }
        }
    })
}

async fn build_test_fallback_account() -> Result<SyncAccount, String> {
    let creds = load_test_credentials()
        .map_err(|e| format!("no test credentials: {e}"))?;
    let account_id = format!("acct_{}", creds.email);
    Ok(SyncAccount {
        account_id,
        creds,
        last_uid: 0,
        uid_validity: 0,
        enabled: true,
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
        "SELECT id, provider, email, settings_json FROM accounts WHERE type = 'email'"
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
    let provider = providers::by_id(provider_id)
        .ok_or_else(|| format!("unknown provider '{provider_id}'"))?;

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
        Err(e) => return Err(format!("keyring error: {e}")),
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

    Ok(EmailCredentials {
        email: email.to_string(),
        password,
        imap_host,
        imap_port,
        smtp_host,
        smtp_port,
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
    let result = sync_one(app, pool, client, account, previous_last_uid).await;

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
        eprintln!("[sync] inserted {} new message(s) for {}", n, account.account_id);
    }
    Ok(())
}

async fn sync_one(
    app: &AppHandle,
    pool: &SqlitePool,
    client: &ImapClient,
    account: &SyncAccount,
    previous_last_uid: u32,
) -> Result<(u32, u32, u32), String> {
    let bundle = client.sync("INBOX", account.last_uid).await?;

    // Ensure the account row exists in the accounts table so the foreign
    // key on messages.ac is satisfied. For DB-configured accounts this is a
    // no-op update; for the test fallback it creates the row.
    upsert_account(pool, account).await?;

    let mut inserted = 0u32;
    for (uid, parsed) in &bundle.messages {
        let contact_id = upsert_contact(pool, &parsed.sender_email, parsed.sender_name.as_deref()).await?;
        let mid = format!("imap_{uid}");

        // INSERT OR IGNORE; if already present, just refresh last-read state.
        // Note: messages table has no message_id column (we use id as the primary
        // key derived from the IMAP UID). The RFC822 Message-ID is stored
        // alongside as a tag inside the body or tracked separately.
        let prev_excerpt = parsed.body_text.split('\n').next().unwrap_or("").chars().take(140).collect::<String>();
        sqlx::query(
            "INSERT OR IGNORE INTO messages \
             (id, pid, subj, prev, body, tm, st, ac, bucket, unread, labels_json, attachments_json, trackers_json, thread_id) \
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'imbox', 1, '[]', '[]', '[]', $9)"
        )
        .bind(&mid)
        .bind(&contact_id)
        .bind(&parsed.subject)
        .bind(&prev_excerpt)
        .bind(&parsed.body_text)
        .bind(parsed.date.format("%Y-%m-%d %H:%M").to_string())
        .bind(parsed.date.to_rfc3339())
        .bind(&account.account_id)
        .bind(parsed.thread_id.as_deref().unwrap_or(""))
        .execute(pool)
        .await
        .map_err(|e| format!("insert message uid={uid}: {e}"))?;

        // Only notify for genuinely new mail (skip the historic backlog on
        // the first sync). previous_last_uid == 0 means this is the initial
        // backfill.
        if previous_last_uid > 0 && uid > &previous_last_uid {
            let sender = parsed.sender_name.as_deref().unwrap_or(&parsed.sender_email);
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
        }

        inserted += 1;
    }

    // Persist sync state
    let json = serde_json::json!({
        "uid_validity": bundle.uid_validity,
        "last_uid": bundle.highest_uid,
        "last_synced_at": chrono::Utc::now().to_rfc3339(),
    });
    let json_str = json.to_string();
    sqlx::query(
        "INSERT INTO app_kv (key, value, updated_at) VALUES ($1, $2, datetime('now')) \
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
    )
    .bind(format!("sync_state::{}", account.account_id))
    .bind(&json_str)
    .execute(pool)
    .await
    .map_err(|e| format!("save sync state: {e}"))?;

    // Notify the frontend so it can refresh Imbox / Notifications in real time.
    let report = crate::services::SyncReport {
        account_id: account.account_id.clone(),
        mailbox: bundle.mailbox.clone(),
        new_messages: inserted as usize,
        skipped: bundle.messages.len().saturating_sub(inserted as usize),
        uid_validity: bundle.uid_validity as u64,
        last_uid: bundle.highest_uid as u64,
        error: None,
    };
    let _ = app.emit("sync:new-messages", report);

    Ok((inserted, bundle.highest_uid, bundle.uid_validity))
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
         ON CONFLICT(id) DO UPDATE SET display_name = excluded.display_name, last_sync = excluded.last_sync"
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

async fn upsert_contact(
    pool: &SqlitePool,
    email: &str,
    name: Option<&str>,
) -> Result<String, String> {
    let id = format!(
        "c_{}",
        email.replace('@', "_at_").replace('.', "_")
    );
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
        "INSERT INTO contacts (id, first_name, last_name, nickname, name, emails_json, stage, health, first_contact) \
         VALUES ($1, $2, $3, '', $4, $5, 'active', 50, datetime('now')) \
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
    Ok(id)
}

async fn open_pool() -> Result<SqlitePool, String> {
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

async fn ensure_schema(pool: &SqlitePool) -> Result<(), String> {
    // App-level KV table used to track sync state per account.
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS app_kv (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )"
    )
    .execute(pool)
    .await
    .map_err(|e| format!("ensure app_kv: {e}"))?;
    Ok(())
}
