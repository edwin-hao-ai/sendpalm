//! Background periodic sync loop — walks every connected account every
//! 60 s and persists new messages to the same SQLite DB the frontend uses.

use crate::services::imap::ImapClient;
use crate::services::{EmailCredentials, load_test_credentials};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePool};
use std::path::PathBuf;
use std::str::FromStr;
use std::time::Duration;
use tauri::async_runtime::spawn;
use tauri::AppHandle;

pub const TICK_MS: u64 = 60_000;

#[derive(Debug, Clone)]
pub struct SyncAccount {
    pub account_id: String,
    pub creds: EmailCredentials,
    pub last_uid: u32,
    pub uid_validity: u32,
    pub enabled: bool,
}

/// Start the periodic sync loop.
pub fn start(app: AppHandle) {
    spawn(async move {
        if let Err(e) = run_loop(app).await {
            eprintln!("[sync] background loop crashed: {e}");
        }
    });
}

async fn run_loop(_app: AppHandle) -> Result<(), String> {
    let creds = load_test_credentials()
        .map_err(|e| format!("no credentials: {e}"))?;
    let account_id = format!("acct_{}", creds.email);

    let pool = open_pool().await?;
    ensure_schema(&pool).await?;

    let mut account = SyncAccount {
        account_id: account_id.clone(),
        creds,
        last_uid: 0,
        uid_validity: 0,
        enabled: true,
    };

    // Restore last_uid from sync_state:: table
    if let Ok(v) = sqlx::query_as::<_, (String,)>(
        "SELECT value FROM app_kv WHERE key = $1"
    )
    .bind(format!("sync_state::{}", account.account_id))
    .fetch_optional(&pool)
    .await
    {
        if let Some((json,)) = v {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&json) {
                if let Some(uid) = v.get("last_uid").and_then(|x| x.as_u64()) {
                    account.last_uid = uid as u32;
                }
                if let Some(uv) = v.get("uid_validity").and_then(|x| x.as_u64()) {
                    account.uid_validity = uv as u32;
                }
            }
        }
    }

    eprintln!(
        "[sync] starting background loop, account={} last_uid={}",
        account.account_id, account.last_uid
    );

    let mut interval = tokio::time::interval(Duration::from_millis(TICK_MS));
    interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

    loop {
        interval.tick().await;
        match sync_one(&pool, &account).await {
            Ok((n, new_last_uid, new_uv)) => {
                if n > 0 {
                    eprintln!(
                        "[sync] inserted {} new message(s) for {} (uid_validity {} -> {})",
                        n, account.account_id, account.uid_validity, new_uv
                    );
                }
                account.last_uid = new_last_uid;
                account.uid_validity = new_uv;
            }
            Err(e) => {
                eprintln!("[sync] tick failed for {}: {e}", account.account_id);
                // Retry on next tick; do not break the loop.
            }
        }
    }
}

async fn sync_one(
    pool: &SqlitePool,
    account: &SyncAccount,
) -> Result<(u32, u32, u32), String> {
    let client = ImapClient::new(account.creds.clone());
    let bundle = client.sync("INBOX", account.last_uid).await?;

    let mut inserted = 0u32;
    for (uid, parsed) in &bundle.messages {
        let contact_id = upsert_contact(pool, &parsed.sender_email, parsed.sender_name.as_deref()).await?;
        let mid = format!("imap_{uid}");

        // INSERT OR IGNORE; if already present, just refresh last-read state.
        sqlx::query(
            "INSERT OR IGNORE INTO messages \
             (id, pid, subj, prev, body, tm, st, ac, bucket, unread, labels_json, attachments_json, trackers_json, thread_id, message_id) \
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'imbox', 1, '[]', '[]', '[]', $9, $10)"
        )
        .bind(&mid)
        .bind(&contact_id)
        .bind(&parsed.subject)
        .bind(parsed.body_text.split('\n').next().unwrap_or("").chars().take(140).collect::<String>())
        .bind(&parsed.body_text)
        .bind(parsed.date.format("%Y-%m-%d %H:%M").to_string())
        .bind(parsed.date.to_rfc3339())
        .bind(&account.account_id)
        .bind(parsed.thread_id.as_deref().unwrap_or(""))
        .bind(&parsed.message_id)
        .execute(pool)
        .await
        .map_err(|e| format!("insert message uid={uid}: {e}"))?;
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

    Ok((inserted, bundle.highest_uid, bundle.uid_validity))
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
    sqlx::query(
        "INSERT INTO contacts (id, name, emails_json, stage, health, first_contact) \
         VALUES ($1, $2, $3, 'active', 50, datetime('now')) \
         ON CONFLICT(id) DO UPDATE SET name = excluded.name"
    )
    .bind(&id)
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