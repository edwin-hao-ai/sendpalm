//! Background sync loop — uses IMAP IDLE for INBOX when possible, falling
//! back to a short poll sleep if the server doesn't support IDLE.
//!
//! v2: supports multiple email accounts. Each account gets its own spawned
//! task and IMAP session. The account list is reloaded every minute so
//! accounts added in Settings start syncing without an app restart.

use crate::commands::upsert_calendar_event;
use crate::services::imap::{ImapClient, IDLE_TIMEOUT};
use crate::services::mailbox_resolver::resolve_all;
use crate::services::providers;
use crate::services::vault;
use crate::services::{load_test_credentials, EmailCredentials};
use lettre::message::Mailbox;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePool, SqlitePoolOptions};
use std::collections::HashSet;
use std::path::PathBuf;
use std::str::FromStr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::async_runtime::{spawn, JoinHandle};
use tauri::{AppHandle, Emitter, Manager};

/// RFC 3501 §6.4.8: UIDVALIDITY change invalidates the UID cursor cache.
/// Returns `Some(0)` to signal cursor reset, `None` to keep current cursor.
/// First sync (stored == 0) is treated as initial sync, no reset.
fn detect_uid_validity_change(stored: u32, current: u32) -> Option<u32> {
    if stored != 0 && stored != current {
        Some(0)
    } else {
        None
    }
}

/// Where the mail being fetched right now sits relative to the account's
/// first import.
///
/// The Gate's promise is "who may write to me **from now on**". A mailbox
/// that already contains five years of history is not a queue of 3,000
/// decisions — deciding them one by one is how a new install gets abandoned
/// on day one. So the first pass treats everything it finds as history:
/// senders are pre-screened, newsletters are filed into the Feed, and the
/// Screener only ever sees senders who arrive *after* the import finishes.
#[derive(Debug, Clone, Copy)]
pub struct ImportPhase {
    /// Highest INBOX UID before this pass. 0 means the account has never
    /// completed a sync.
    pub previous_last_uid: u32,
    /// Is this pass still importing history?
    ///
    /// **Not** inferable from the cursor alone. A pass can end early — a
    /// single message fails to persist, a chunk comes back short, IMAP drops
    /// — and the per-chunk cursor is saved anyway so the next tick resumes
    /// where it left off. If "first pass" were `cursor == 0`, that resumption
    /// would look like ordinary mail and dump the remaining 9,900 historical
    /// senders into the Screener: the exact failure the import exists to
    /// prevent. So the answer is a persisted "import finished" marker, and
    /// the cursor only serves as the fast answer for a brand-new account.
    pub initial: bool,
    /// True while the account is inside the post-import quiet window: OS
    /// notifications are suppressed except for senders the user explicitly
    /// asked to be pinged about (`notify = 1`).
    pub os_quiet: bool,
}

impl ImportPhase {
    /// Three signals, because two are not enough:
    ///
    /// * `import_completed` — the persisted "history is in" marker;
    /// * `import_in_progress` — an `import_progress` record exists, i.e. an
    ///   earlier pass started the import and did not finish it;
    /// * `previous_last_uid` — a brand-new account has never fetched anything.
    ///
    /// A resumed import has a non-zero cursor and no completion marker, and an
    /// install that predates this feature has a non-zero cursor and no
    /// progress record. Only the progress record tells them apart: treating
    /// the upgrade case as an import would silently re-screen senders the
    /// user already decided about.
    pub fn new(
        previous_last_uid: u32,
        import_completed: bool,
        import_in_progress: bool,
    ) -> Self {
        Self {
            previous_last_uid,
            initial: !import_completed && (previous_last_uid == 0 || import_in_progress),
            os_quiet: false,
        }
    }

    pub fn with_quiet(mut self, os_quiet: bool) -> Self {
        self.os_quiet = os_quiet;
        self
    }
}

/// Is this message genuinely new mail for the user?
///
/// **Only INBOX counts.** Every folder has its own UID namespace, so feeding
/// a Sent/Trash/Archive UID through the INBOX cursor declares years of the
/// user's own mail "new": the bell fills up, desktop notifications fire for
/// messages the user wrote, and the vacation responder offers to reply to
/// their own sent folder. The pre-import behaviour was silence for non-INBOX
/// folders; this keeps that explicit instead of implicit.
///
/// Nothing is "new" during the import either — it is all history by
/// definition.
pub fn is_new_arrival(folder: &str, uid: u32, phase: ImportPhase) -> bool {
    folder.eq_ignore_ascii_case("INBOX")
        && !phase.initial
        && phase.previous_last_uid > 0
        && uid > phase.previous_last_uid
}

/// How long after a finished import OS notifications stay suppressed.
///
/// The import itself never pings (no message in it is "new mail"). The days
/// that follow are the risk: a freshly-imported mailbox often looks like a
/// flood to the user even when the mail is ordinary, and a notification storm
/// in that window is how people turn notifications off forever.
pub const IMPORT_QUIET_HOURS: i64 = 72;

/// Is `completed_at` (RFC 3339) inside the quiet window ending at `now`?
///
/// Unparseable or empty timestamps answer `false`: a corrupt tally must not
/// silence a user's notifications indefinitely.
pub fn inside_import_quiet_window(completed_at: &str, now: chrono::DateTime<chrono::Utc>) -> bool {
    let Ok(done) = chrono::DateTime::parse_from_rfc3339(completed_at) else {
        return false;
    };
    let elapsed = now.signed_duration_since(done.with_timezone(&chrono::Utc));
    elapsed >= chrono::Duration::zero()
        && elapsed < chrono::Duration::hours(IMPORT_QUIET_HOURS)
}

/// May this message raise an OS notification?
///
/// Normal rule: ping for people the user cares about — `notify = 1`, or a
/// sender already screened in and not sending a newsletter. During the
/// post-import quiet window only the explicit `notify = 1` opt-in survives;
/// everything else stays in the in-app notification list.
pub fn should_ping_os(
    notify: bool,
    screened: bool,
    is_newsletter: bool,
    os_quiet: bool,
) -> bool {
    if os_quiet {
        return notify;
    }
    notify || (screened && !is_newsletter)
}

/// How many senders did the import quietly approve?
///
/// Counted from the contacts the import actually created (`first_contact` is
/// set on insert), not from a set of every sender id seen in the batch — a
/// sender who appears in two resumed passes would otherwise be counted
/// twice, and a contact that already existed would be counted as if the
/// import were responsible for it.
pub async fn count_imported_senders(
    pool: &SqlitePool,
    import_started_at: &str,
) -> Result<u32, String> {
    let (n,): (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM contacts          WHERE first_seen = 1 AND screened = 1 AND blocked = 0 AND first_contact >= $1",
    )
    .bind(import_started_at)
    .fetch_one(pool)
    .await
    .map_err(|e| format!("count imported senders: {e}"))?;
    Ok(n as u32)
}

/// Timestamp format `contacts.first_contact` is written in (`datetime('now')`).
fn sql_now() -> String {
    chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

/// When IDLE fails (server doesn't support it, connection drop, etc.), wait
/// this long before the next sync attempt.
const IDLE_ERROR_BACKOFF: Duration = Duration::from_secs(60);

/// How often we reload the `accounts` table to pick up newly added/removed
/// accounts.
const ACCOUNT_RELOAD_INTERVAL: Duration = Duration::from_secs(60);

/// Credential problems already reported in this session.
///
/// The reload loop runs every 60 s, and an account with no password in the
/// keychain cannot get one until the user types it. One cycle emits three
/// distinct messages (per-account skip, test fallback warning, no accounts),
/// so a single "last message" slot still printed all three every minute and
/// buried everything else in the log. Remember the set, report each problem
/// once, and forget them when the situation recovers.
static REPORTED_PROBLEMS: std::sync::Mutex<Vec<String>> = std::sync::Mutex::new(Vec::new());

/// Log `message` unless the same `signature` was already reported.
fn log_problem_once(signature: &str, message: impl FnOnce() -> String) {
    let mut reported = match REPORTED_PROBLEMS.lock() {
        Ok(guard) => guard,
        // A poisoned lock must not silence the error path.
        Err(poisoned) => poisoned.into_inner(),
    };
    if reported.iter().any(|s| s == signature) {
        return;
    }
    eprintln!("{}", message());
    reported.push(signature.to_string());
}

/// Credentials work again — a later breakage must be reported again.
fn clear_problem_memory() {
    let mut reported = match REPORTED_PROBLEMS.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    };
    reported.clear();
}

/// How often the background purge job scans for expired trash/spam messages.
const PURGE_INTERVAL: Duration = Duration::from_secs(24 * 60 * 60);

/// If the database has no configured email accounts, fall back to the
/// `SENDPALM_TEST_*` credentials so `pnpm tauri dev` still syncs mail.
///
/// P0-5: gated to debug builds only. Previously `const true`, so a release
/// binary would silently spin up a 60 s IDLE loop on the Feishu test
/// account if `SENDPALM_TEST_*` happened to be in the process env (e.g.
/// the user ran another tool that exports them, or a CI artifact kept
/// them around). On a multi-account user this means a release build
/// could send from / sync to the test account without the user
/// knowing. In dev we still want this on; release builds skip it.
#[cfg(debug_assertions)]
const TEST_FALLBACK_ENABLED: bool = true;
#[cfg(not(debug_assertions))]
const TEST_FALLBACK_ENABLED: bool = false;

#[derive(Debug, Clone)]
pub struct SyncAccount {
    pub account_id: String,
    pub creds: EmailCredentials,
    pub last_uid: u32,
    pub uid_validity: u32,
    pub enabled: bool,
    pub settings_json: Option<String>,
}

/// Where a sender's mail should land: the Gate decisions already made for
/// them. Fields are public so the import-transition tests can build routing
/// fixtures without a database round-trip.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ContactRouteInfo {
    pub id: String,
    pub screened: bool,
    pub blocked: bool,
    pub default_bucket: String,
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

    // One-shot repair for bodies written before HTML-only mail was stripped
    // (they hold raw markup, which every text preview then showed verbatim).
    // Chunked and idempotent; a failure only costs the next boot retrying.
    {
        let pool = pool.clone();
        spawn(async move {
            match crate::services::html_text::backfill_markup_bodies(&pool).await {
                Ok(0) => {}
                Ok(n) => eprintln!("[sync] repaired {n} markup-only message bodies"),
                Err(e) => eprintln!("[sync] markup body backfill failed: {e}"),
            }
        });
    }

    // Per-account stop flags and join handles. The reload loop reconciles the
    // DB account list against this map: starts missing accounts and signals
    // removed/disabled accounts to stop.
    let mut handles: std::collections::HashMap<String, (Arc<AtomicBool>, JoinHandle<()>)> =
        std::collections::HashMap::new();

    loop {
        let desired = load_sync_accounts(&pool, &app.state::<crate::services::state::SyncStateStore>()).await?;

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

        // Same race as the MCP gateway: this task is spawned from `setup()`,
        // but the `messages` table only exists once the webview has opened
        // the database and the SQL plugin has run its migrations.
        if !wait_for_schema(&pool, Duration::from_secs(20)).await {
            eprintln!(
                "[sync] schema never appeared for {}; not syncing this pass",
                account.account_id
            );
            return;
        }

        let client = ImapClient::new(account.creds.clone());
        let parsed_settings = account
            .settings_json
            .as_deref()
            .and_then(|s| serde_json::from_str::<serde_json::Value>(s).ok());
        let idle_timeout = parsed_settings
            .as_ref()
            .map(sync_frequency_from_json)
            .unwrap_or(IDLE_TIMEOUT);
        let manual_only = parsed_settings
            .as_ref()
            .map(is_manual_sync)
            .unwrap_or(false);

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

        // "手动" = no timer-driven sync. Park here (polling `stop` so a
        // settings change or account removal still tears the task down)
        // instead of entering the IDLE loop. Explicit 立即同步 goes through
        // `commands::sync_now`, which opens its own session.
        if manual_only {
            eprintln!(
                "[sync] account {} set to manual sync; background timer disabled",
                account.account_id
            );
            while !stop.load(Ordering::Relaxed) {
                tokio::time::sleep(Duration::from_secs(60)).await;
            }
            eprintln!("[sync] stopping account loop for {}", account.account_id);
            return;
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

async fn load_sync_accounts(
    pool: &SqlitePool,
    store: &crate::services::state::SyncStateStore,
) -> Result<Vec<SyncAccount>, String> {
    let db_accounts = load_accounts(pool, store).await?;
    if !db_accounts.is_empty() {
        clear_problem_memory();
        return Ok(db_accounts);
    }
    if TEST_FALLBACK_ENABLED {
        // P0-5: log loudly when the test fallback fires — even in
        // dev, the user should be able to tell from the console that
        // they're not syncing a real account.
        log_problem_once("test-fallback", || {
            format!(
                "[sync] WARNING: no real accounts configured — falling back to SENDPALM_TEST_EMAIL ({})",
                std::env::var("SENDPALM_TEST_EMAIL").unwrap_or_default()
            )
        });
        match build_test_fallback_account().await {
            Ok(a) => Ok(vec![a]),
            Err(e) => {
                log_problem_once("no-accounts", || {
                    format!("[sync] no accounts configured and test fallback unavailable: {e}")
                });
                Ok(Vec::new())
            }
        }
    } else {
        Ok(Vec::new())
    }
}

async fn load_accounts(
    pool: &SqlitePool,
    store: &crate::services::state::SyncStateStore,
) -> Result<Vec<SyncAccount>, String> {
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
            Err(e) => {
                log_problem_once(&format!("skip:{id}:{e}"), || {
                    format!("[sync] skipping account {id}: {e}")
                });
                // The account exists but cannot sync (almost always: no
                // password in the keychain). Surface it in the sync badge
                // so the user sees "needs password" instead of a silently
                // stale mailbox. Preserve any previous successful sync
                // timestamp — this is a credentials failure, not a sync.
                let prev = store.get(&id);
                store.put(
                    &id,
                    crate::services::state::AccountSyncState {
                        last_synced_at: prev.last_synced_at,
                        status: crate::services::state::AccountSyncStatus::NeedsCredentials,
                        error_code: Some("missing_credentials".to_string()),
                        ..Default::default()
                    },
                );
            }
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

/// Map a sync error to a sanitized machine-readable code. Never carries
/// the original message — IMAP/server strings can echo credentials or
/// account details.
/// Classify a sync error into a stable, user-facing code. The UI renders
/// different guidance per code — a changed password, a dead network, and a
/// server outage must not look the same.
///
/// - `missing_credentials`: nothing in the keychain to try.
/// - `auth_failed`: credentials were tried and REJECTED (user changed the
///   mailbox password / revoked the app password). Same entry point as
///   missing, different copy.
/// - `network`: DNS/TCP/TLS/timeout — nothing wrong with the account;
///   retry silently.
/// - `sync_failed`: anything else (server errors, parser bugs).
/// Public wrapper for the command layer (sync_now shares classification).
pub fn sync_error_code_pub(e: &str) -> &'static str {
    sync_error_code(e)
}

pub(crate) fn sync_error_code(e: &str) -> &'static str {
    let lower = e.to_lowercase();
    if lower.contains("keyring") && !lower.contains("authentication") && !lower.contains("failed") {
        return "missing_credentials";
    }
    if lower.contains("no password in keyring")
        || (lower.contains("keyring") && lower.contains("empty"))
    {
        return "missing_credentials";
    }
    if lower.contains("authentication")
        || lower.contains("invalid credential")
        || lower.contains("login failed")
        || lower.contains("username or password")
        || lower.contains("unauthorized")
        || lower.contains("535")
        || lower.contains("530")
    {
        return "auth_failed";
    }
    if lower.contains("network")
        || lower.contains("dns")
        || lower.contains("timed out")
        || lower.contains("timeout")
        || lower.contains("connection refused")
        || lower.contains("no route")
        || lower.contains("offline")
        || lower.contains("tls")
        || lower.contains("certificate")
    {
        return "network";
    }
    "sync_failed"
}

fn sync_failure_status(e: &str) -> crate::services::state::AccountSyncStatus {
    matches!(sync_error_code(e), "missing_credentials" | "auth_failed")
        .then_some(crate::services::state::AccountSyncStatus::NeedsCredentials)
        .unwrap_or(crate::services::state::AccountSyncStatus::Error)
}

#[cfg(test)]
mod sync_error_class_tests {
    use super::sync_error_code;

    #[test]
    fn classifies_the_user_scenarios() {
        // Password never entered / keychain entry deleted.
        assert_eq!(sync_error_code("no password in keyring"), "missing_credentials");
        // User changed the mailbox password or revoked the app password.
        assert_eq!(
            sync_error_code("authentication failed: [ALERT] Invalid credentials"),
            "auth_failed"
        );
        assert_eq!(
            sync_error_code("535 5.7.8 Error: authentication failed: UGFzc3dvcmQ6"),
            "auth_failed"
        );
        assert_eq!(sync_error_code("LOGIN failed"), "auth_failed");
        // Airplane Wi-Fi / firewall / IPv6-only network.
        assert_eq!(sync_error_code("dns error: failed to lookup address"), "network");
        assert_eq!(sync_error_code("connection refused"), "network");
        assert_eq!(sync_error_code("tls handshake timeout"), "network");
        // Genuine server-side problems.
        assert_eq!(sync_error_code("select INBOX: no such mailbox"), "sync_failed");
        assert_eq!(sync_error_code("parse uid=123: malformed header"), "sync_failed");
    }
}

async fn sync_and_notify(
    app: &AppHandle,
    pool: &SqlitePool,
    client: &ImapClient,
    account: &mut SyncAccount,
) -> Result<(), String> {
    use crate::services::state::{AccountSyncState, AccountSyncStatus};

    let store = app.state::<crate::services::state::SyncStateStore>();
    let prev = store.get(&account.account_id);
    store.put(
        &account.account_id,
        AccountSyncState {
            uid_validity: account.uid_validity,
            last_uid: account.last_uid,
            // Keep the last successful timestamp while syncing — a busy
            // flag is not freshness.
            last_synced_at: prev.last_synced_at,
            busy: true,
            status: AccountSyncStatus::Syncing,
            error_code: None,
        },
    );

    let previous_last_uid = account.last_uid;
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {e}"))?;
    let result = sync_one(app, &data_dir, pool, client, account, previous_last_uid).await;

    // The import summary is carried on the `sync:new-messages` event and
    // persisted under `import_summary::<account>` for Settings; nothing in
    // the loop's own state needs it.
    let (n, new_last_uid, new_uv) = match result {
        Ok(r) => r,
        Err(e) => {
            store.put(
                &account.account_id,
                AccountSyncState {
                    uid_validity: account.uid_validity,
                    last_uid: account.last_uid,
                    // A failed attempt must not advance the freshness
                    // timestamp — preserve the last successful value.
                    last_synced_at: prev.last_synced_at,
                    busy: false,
                    status: sync_failure_status(&e),
                    error_code: Some(sync_error_code(&e).to_string()),
                },
            );
            return Err(e);
        }
    };

    account.last_uid = new_last_uid;
    account.uid_validity = new_uv;

    store.put(
        &account.account_id,
        AccountSyncState {
            uid_validity: new_uv,
            last_uid: new_last_uid,
            last_synced_at: chrono::Utc::now(),
            busy: false,
            status: AccountSyncStatus::Connected,
            error_code: None,
        },
    );

    if n > 0 {
        eprintln!(
            "[sync] inserted {} new message(s) for {}",
            n, account.account_id
        );
    }

    // Digest mode holds per-message pings during the pass; emit the single
    // summary banner here, once the whole pass is done.
    crate::services::desktop_notifier::flush_digest(app, &store.notification_prefs());

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
    // Snapshot the import phase BEFORE the first message is written: the
    // cursor advances during the pass, so asking later always answers
    // "not the first one".
    // A previous pass may already have finished the import; if it did, the
    // next 72 hours run quiet.
    let os_quiet = match load_import_summary(pool, &account.account_id).await {
        Ok(Some(s)) => inside_import_quiet_window(&s.completed_at, chrono::Utc::now()),
        Ok(None) => false,
        Err(e) => {
            eprintln!(
                "[sync] import summary unreadable for {}: {e} (notifications stay on)",
                account.account_id
            );
            false
        }
    };
    // The persisted marker, not the cursor, decides whether this pass is
    // still importing (see ImportPhase::initial).
    let import_completed = load_import_completed(pool, &account.account_id)
        .await
        .unwrap_or(false);
    let mut progress = load_import_progress(pool, &account.account_id)
        .await
        .ok()
        .flatten();
    let phase = ImportPhase::new(
        previous_last_uid,
        import_completed,
        progress.is_some(),
    )
    .with_quiet(os_quiet);
    let mut all_folders_complete = true;

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
    // User automation rules — loaded once per sync pass and threaded into
    // every insert so rule-routed mail lands where the user asked.
    let rules = crate::services::rules::list_rules(pool).await.unwrap_or_default();

    let mut total_inserted = 0u32;
    let mut inbox_cursor = account.last_uid;
    let mut inbox_uid_validity = account.uid_validity;
    let mut new_message_ids: Vec<String> = Vec::new();

    for folder in &folders {
        let state_key = format!("sync_state::{}::{}", account.account_id, folder);
        let (folder_last_uid, folder_prev_uid_validity) =
            load_folder_sync_state(pool, &state_key).await?;
        let is_inbox = folder.eq_ignore_ascii_case("INBOX");
        // For INBOX, keep using the legacy account-level state as the source of
        // truth so existing installs don't lose their cursor.
        let start_uid = if is_inbox {
            account.last_uid.max(folder_last_uid)
        } else {
            folder_last_uid
        };

        let (inserted, cursor, uid_validity, mut folder_new_ids, folder_complete) = match sync_folder(
            app,
            data_dir,
            pool,
            client,
            account,
            folder,
            &rules,
            start_uid,
            phase,
            &state_key,
        )
        .await
        {
            Ok(t) => t,
            Err(e) => {
                eprintln!(
                    "[sync] folder={folder} failed for {}: {e}",
                    account.account_id
                );
                // sync_folder persists the cursor after every successful chunk,
                // so on error the highest successfully-inserted UID is already
                // saved and the next tick resumes from there. Nothing to do.
                all_folders_complete = false;
                continue;
            }
        };
        if !folder_complete {
            all_folders_complete = false;
        }
        total_inserted += inserted;
        new_message_ids.append(&mut folder_new_ids);

        // Per-folder UIDVALIDITY: the account-level value only mirrors
        // INBOX, so comparing every folder against it re-fired the reset on
        // every pass (the cursor rewound locally while the persisted folder
        // state kept the old cursor — the folder could never advance).
        // Compare against the folder's OWN stored validity, and persist the
        // reset so the re-walk starts from scratch exactly once.
        if let Some(reset_to) = detect_uid_validity_change(folder_prev_uid_validity, uid_validity)
        {
            eprintln!(
                "[sync_loop] UIDVALIDITY changed for {folder} ({} → {}); resetting cursor to {}",
                folder_prev_uid_validity, uid_validity, reset_to
            );
            let reset_key = format!("sync_state::{}::{folder}", account.account_id);
            let _ =
                save_folder_sync_state(pool, &reset_key, reset_to, uid_validity).await;
        }

        // Repair missing sent/received dates for rows this folder has
        // already synced. Metadata-only (no bodies); failures are logged
        // and retried next tick — never fail the folder sync over it.
        let backfill_result = crate::services::date_backfill::run_date_backfill(
            pool,
            &account.account_id,
            folder,
            cursor,
            uid_validity,
            |start, end| client.fetch_date_metadata(folder, start, end),
        )
        .await;
        if let Err(e) = backfill_result {
            eprintln!(
                "[sync] date backfill failed for {}/{}: {e}",
                account.account_id, folder
            );
        }

        // sync_folder persists the cursor per-chunk (so a mid-backfill
        // error doesn't lose progress). Here we just keep the legacy
        // account-level state in sync for INBOX, which the on-boot
        // cursor-restore path reads.
        if is_inbox {
            inbox_cursor = cursor;
            inbox_uid_validity = uid_validity;
            save_folder_sync_state(
                pool,
                &format!("sync_state::{}", account.account_id),
                cursor,
                uid_validity,
            )
            .await?;
        }
    }

    // ── Import bookkeeping ────────────────────────────────────────────
    //
    // The import is "done" only when a pass walked every folder to its end
    // without a partial chunk or a folder failure. Until then the marker
    // stays unset, so the next tick keeps treating what it fetches as
    // history instead of handing the Gate the remainder of a five-year
    // mailbox.
    let mut summary_report: Option<crate::services::ImportSummaryReport> = None;
    if phase.initial {
        // Progress is persisted because the import can span several passes
        // (a chunk fails, IMAP drops, the app quits mid-backfill). A resumed
        // pass fetches only UIDs the cursor has not passed, so summing the
        // per-pass insert counts is exact — unlike recomputing from the
        // cursor, which would lose every earlier pass.
        let mut progress = progress.take().unwrap_or_else(|| ImportProgress {
            // The window `first_contact` is compared against starts with the
            // first pass, not the last one.
            started_at: sql_now(),
            messages: 0,
        });
        progress.messages = progress.messages.saturating_add(total_inserted);

        if all_folders_complete {
            let senders = count_imported_senders(pool, &progress.started_at)
                .await
                .unwrap_or(0);
            let report = crate::services::ImportSummaryReport {
                messages: progress.messages,
                senders,
                completed_at: chrono::Utc::now().to_rfc3339(),
            };
            persist_import_summary(pool, &account.account_id, &report).await;
            mark_import_completed(pool, &account.account_id).await;
            // Nothing to announce if history never actually landed.
            if report.messages > 0 {
                summary_report = Some(report);
            }
        } else {
            // Keep the running total for the pass that finishes the job.
            let _ = save_import_progress(pool, &account.account_id, &progress).await;
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
        new_message_ids,
        import_summary: summary_report,
        error: None,
    };
    let _ = app.emit("sync:new-messages", report);

    Ok((total_inserted, inbox_cursor, inbox_uid_validity))
}

/// Highest IMAP UID actually persisted for a folder, or 0 when the folder has
/// no identified rows yet.
///
/// This is the honest resume point when a cursor turns out to be out of
/// range: everything above it is mail we never imported.
async fn highest_stored_uid(
    pool: &SqlitePool,
    account_id: &str,
    folder: &str,
) -> Result<u32, String> {
    let row: Option<(i64,)> = sqlx::query_as(
        "SELECT COALESCE(MAX(imap_uid), 0) FROM messages \
          WHERE ac = $1 AND imap_folder = $2",
    )
    .bind(account_id)
    .bind(folder)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("highest stored uid for {folder}: {e}"))?;
    Ok(row.map(|(n,)| n.max(0) as u32).unwrap_or(0))
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

/// `app_kv` key holding an account's first-import tally.
fn import_summary_key(account_id: &str) -> String {
    format!("import_summary::{account_id}")
}

/// `app_kv` key: "1" once the account's history import finished.
fn import_completed_key(account_id: &str) -> String {
    format!("import_completed::{account_id}")
}

/// `app_kv` key: in-flight tally for an import that spans several passes.
fn import_progress_key(account_id: &str) -> String {
    format!("import_progress::{account_id}")
}

/// In-flight import tally. Persisted because an import can be interrupted
/// between passes and must not restart (or, worse, be mistaken for
/// ordinary new mail).
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ImportProgress {
    /// `datetime('now')` format — compared against `contacts.first_contact`.
    pub started_at: String,
    pub messages: u32,
}

async fn kv_get(pool: &SqlitePool, key: &str) -> Result<Option<String>, String> {
    let row: Option<(String,)> = sqlx::query_as("SELECT value FROM app_kv WHERE key = $1")
        .bind(key)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("kv get {key}: {e}"))?;
    Ok(row.map(|(v,)| v))
}

async fn kv_put(pool: &SqlitePool, key: &str, value: &str) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO app_kv (key, value, updated_at) VALUES ($1, $2, datetime('now')) \
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    )
    .bind(key)
    .bind(value)
    .execute(pool)
    .await
    .map_err(|e| format!("kv put {key}: {e}"))?;
    Ok(())
}

pub async fn import_completed(pool: &SqlitePool, account_id: &str) -> Result<bool, String> {
    Ok(kv_get(pool, &import_completed_key(account_id))
        .await?
        .as_deref()
        == Some("1"))
}

async fn load_import_completed(pool: &SqlitePool, account_id: &str) -> Result<bool, String> {
    import_completed(pool, account_id).await
}

async fn mark_import_completed(pool: &SqlitePool, account_id: &str) {
    if let Err(e) = kv_put(pool, &import_completed_key(account_id), "1").await {
        // Worst case the next pass keeps treating arrivals as history for a
        // while — never lose the import over this.
        eprintln!("[sync] import marker save failed for {account_id}: {e}");
    }
}

async fn load_import_progress(
    pool: &SqlitePool,
    account_id: &str,
) -> Result<Option<ImportProgress>, String> {
    let Some(raw) = kv_get(pool, &import_progress_key(account_id)).await? else {
        return Ok(None);
    };
    Ok(serde_json::from_str(&raw).ok())
}

async fn save_import_progress(
    pool: &SqlitePool,
    account_id: &str,
    progress: &ImportProgress,
) -> Result<(), String> {
    let json = serde_json::to_string(progress)
        .map_err(|e| format!("import progress encode: {e}"))?;
    kv_put(pool, &import_progress_key(account_id), &json).await
}

/// Persist what the first import did so Settings → Accounts can keep showing
/// it long after the one-shot toast is gone.
pub async fn persist_import_summary(
    pool: &SqlitePool,
    account_id: &str,
    summary: &crate::services::ImportSummaryReport,
) {
    let json = match serde_json::to_string(summary) {
        Ok(j) => j,
        Err(e) => {
            eprintln!("[sync] import summary encode failed for {account_id}: {e}");
            return;
        }
    };
    // Best-effort: losing the tally only costs a Settings line, never mail.
    if let Err(e) = sqlx::query(
        "INSERT INTO app_kv (key, value, updated_at) VALUES ($1, $2, datetime('now')) \
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    )
    .bind(import_summary_key(account_id))
    .bind(json)
    .execute(pool)
    .await
    {
        eprintln!("[sync] import summary save failed for {account_id}: {e}");
    }
}

/// Read back the first-import tally (Settings → Accounts). `None` when the
/// account has never imported — the row then shows nothing rather than "0".
pub async fn load_import_summary(
    pool: &SqlitePool,
    account_id: &str,
) -> Result<Option<crate::services::ImportSummaryReport>, String> {
    let row: Option<(String,)> = sqlx::query_as("SELECT value FROM app_kv WHERE key = $1")
        .bind(import_summary_key(account_id))
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("load import summary {account_id}: {e}"))?;
    let Some((json,)) = row else { return Ok(None) };
    serde_json::from_str(&json)
        .map(Some)
        .map_err(|e| format!("decode import summary {account_id}: {e}"))
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

/// Decide whether the chunk-walking loop should fetch another range.
///
/// Termination rules:
/// 1. If the server reported `uid_next`, keep going while the cursor hasn't
///    reached `uid_next - 1` (the last existing UID on the server). This is
///    the only correct condition — a "partial" chunk just means the requested
///    range had holes (UIDs that were deleted/expired) and there can still be
///    messages at much higher UIDs. The Feishu mailbox we're testing against
///    has ~3900 messages spread across UIDs 1..7228, so density is roughly
///    0.5 messages per UID; stopping on the first partial chunk would leave
///    ~3500 messages unfetched.
/// 2. If the server did NOT report `uid_next` (some IMAP servers omit it),
///    fall back to the old behaviour: stop when the chunk isn't full. This
///    matches the pre-fix behaviour for those servers.
pub fn should_continue_after_chunk(
    cursor: u32,
    uid_next: Option<u32>,
    chunk_size: u32,
) -> bool {
    if let Some(un) = uid_next {
        // uid_next is "the UID that will be assigned to the next new
        // message", so existing UIDs are < uid_next. The cursor sits at the
        // highest successful UID we've inserted, so we stop when cursor
        // reaches uid_next - 1.
        return cursor < un.saturating_sub(1);
    }
    // No UIDNEXT available — fall back to the legacy heuristic.
    chunk_size >= crate::services::imap::MAX_PER_TICK
}

/// Is the persisted cursor beyond the end of the mailbox?
///
/// IMAP says UIDs only ever grow — but that is per UIDVALIDITY, and servers
/// do recreate a mailbox underneath you while keeping UIDVALIDITY the same
/// (Feishu re-indexed this account: the cursor had walked to 201,683 against
/// a UIDNEXT that is now 7,724). Once that happens the cursor is past every
/// message that will ever exist, `should_continue_after_chunk` immediately
/// says "done", and the sync reports success while importing nothing — new
/// mail silently stops arriving and the list freezes at the last imported
/// day.
///
/// Returns the cursor to restart from (`uid_next - 1`) when the stored one is
/// out of range, `None` when it is fine.
pub fn recover_cursor_if_past_end(cursor: u32, uid_next: Option<u32>) -> Option<u32> {
    let un = uid_next?;
    if cursor > 0 && cursor >= un {
        return Some(un.saturating_sub(1));
    }
    None
}

/// Without UIDNEXT, a folder whose lowest UIDs were all expunged would
/// loop forever on chunk 1: every pass refetches the same empty range and
/// the legacy "partial chunk" heuristic stops after one chunk. Allow a
/// bounded number of consecutive empty chunks per pass so the walk makes
/// progress and the pass still terminates; the next pass resumes where the
/// persisted cursor left off.
pub const LEGACY_EMPTY_CHUNK_BUDGET: u32 = 40;

pub fn legacy_empty_budget_exhausted(consecutive_empty_chunks: u32) -> bool {
    consecutive_empty_chunks >= LEGACY_EMPTY_CHUNK_BUDGET
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
    app: &AppHandle,
    data_dir: &std::path::Path,
    pool: &SqlitePool,
    client: &ImapClient,
    account: &SyncAccount,
    folder: &str,
    rules: &[crate::services::rules::MailRule],
    start_uid: u32,
    phase: ImportPhase,
    state_key: &str,
) -> Result<(u32, u32, u32, Vec<String>, bool), String> {
    let folder_kind = crate::services::mailbox_resolver::folder_kind_for_name(folder);
    let mut inserted = 0u32;
    #[allow(unused_assignments)]
    let mut uid_validity = 0u32;
    let mut cursor = start_uid;
    let mut new_ids: Vec<String> = Vec::new();
    let mut consecutive_empty_chunks = 0u32;
    // True only when the loop ran out of UIDs to fetch. A partial chunk, a
    // legacy-budget stop, or an error leaves it false so the caller knows the
    // folder still has history waiting.
    let mut complete = true;

    let mut first_bundle = true;
    let mut tried_recovery = false;
    loop {
        let bundle = client.sync(folder, cursor).await?;
        uid_validity = bundle.uid_validity;

        // The stored cursor is past the end of this mailbox. Trust the server,
        // rewind to the highest message we actually hold, and walk forward
        // again. Guarded so a pathological server cannot loop us here.
        if first_bundle {
            first_bundle = false;
            if !tried_recovery {
                if let Some(restart) = recover_cursor_if_past_end(cursor, bundle.uid_next) {
                    tried_recovery = true;
                    let highest = highest_stored_uid(pool, &account.account_id, folder)
                        .await
                        .unwrap_or(0);
                    let target = highest.min(restart);
                    eprintln!(
                        "[sync] folder={folder} cursor={cursor} is past uid_next={:?}; \
                         rewinding to {target} (highest stored UID {highest})",
                        bundle.uid_next
                    );
                    cursor = target;
                    let _ =
                        save_folder_sync_state(pool, state_key, cursor, uid_validity).await;
                    continue;
                }
            }
        }
        // Empty chunk means every UID in the requested range was deleted/expired
        // — skip past it and try the next range. The previous implementation
        // broke here, which is what left ~3500 messages unbackfilled on the
        // Feishu account (most chunks after the first hit a sparse range).
        if bundle.messages.is_empty() {
            consecutive_empty_chunks += 1;
            cursor = cursor
                .saturating_add(crate::services::imap::MAX_PER_TICK);
            // Do not creep past the end: a sparse mailbox walked in 200-UID
            // steps can otherwise overshoot UIDNEXT and never look back.
            if let Some(un) = bundle.uid_next {
                cursor = cursor.min(un.saturating_sub(1));
            }
            // Persist so we resume from the new cursor even if a later chunk
            // fails.
            let _ = save_folder_sync_state(pool, state_key, cursor, uid_validity).await;
            match bundle.uid_next {
                Some(_) => {
                    if !should_continue_after_chunk(cursor, bundle.uid_next, 0) {
                        break;
                    }
                }
                None => {
                    // Legacy server without UIDNEXT: keep walking empty
                    // ranges within this pass's budget, then resume next
                    // pass from the persisted cursor.
                    if legacy_empty_budget_exhausted(consecutive_empty_chunks) {
                        eprintln!(
                            "[sync] folder={folder} legacy empty-chunk budget reached at cursor={cursor}; resuming next pass"
                        );
                        complete = false;
                        break;
                    }
                }
            }
            continue;
        }
        consecutive_empty_chunks = 0;
        let mut chunk_outcomes: Vec<(u32, bool)> = Vec::with_capacity(bundle.messages.len());
        for fetched in &bundle.messages {
            match insert_message(
                app,
                data_dir,
                pool,
                account,
                folder,
                folder_kind,
                rules,
                fetched.uid,
                &fetched.parsed,
                fetched.received_at,
                phase,
            )
            .await
            {
                Ok(Some(new_id)) => {
                    new_ids.push(new_id);
                    chunk_outcomes.push((fetched.uid, true));
                }
                Ok(None) => chunk_outcomes.push((fetched.uid, true)),
                Err(_) => chunk_outcomes.push((fetched.uid, false)),
            }
        }
        let (chunk_inserted, chunk_last_ok) = advance_cursor(cursor, &chunk_outcomes);
        inserted += chunk_inserted;
        // advance_cursor already returns the highest successful UID; on a partial chunk
        // we deliberately stay below bundle.highest_uid so the next tick retries the rest.
        cursor = chunk_last_ok;
        // Persist the cursor after every chunk so a mid-backfill error
        // (e.g. transient IMAP stream error) doesn't lose the progress we
        // already made. Previously this was only saved at the very end of
        // `sync_one`, so any chunk that failed mid-backfill reset the
        // persisted cursor to the pre-sync value and the next app restart
        // re-fetched (and re-failed on) the same UIDs.
        let _ = save_folder_sync_state(pool, state_key, cursor, uid_validity).await;
        if !chunk_outcomes.iter().all(|(_, ok)| *ok) {
            // Short-circuit: don't fetch another chunk after a partial failure
            // (the cursor is already pinned to the last successful UID above).
            // The folder is NOT done — the import bookkeeping depends on
            // knowing that, or a five-year backfill would be declared
            // finished after its first hiccup.
            complete = false;
            break;
        }
        if !should_continue_after_chunk(cursor, bundle.uid_next, bundle.messages.len() as u32) {
            break;
        }
    }

    eprintln!(
        "[sync] folder={folder} inserted={inserted} cursor={cursor} new_ids={}",
        new_ids.len()
    );
    Ok((inserted, cursor, uid_validity, new_ids, complete))
}

#[allow(clippy::too_many_arguments)]
async fn insert_message(
    app: &AppHandle,
    data_dir: &std::path::Path,
    pool: &SqlitePool,
    account: &SyncAccount,
    folder: &str,
    folder_kind: Option<crate::services::mailbox_resolver::FolderKind>,
    rules: &[crate::services::rules::MailRule],
    uid: u32,
    parsed: &crate::services::parser::ParsedMessage,
    received_at: Option<chrono::DateTime<chrono::Utc>>,
    phase: ImportPhase,
) -> Result<Option<String>, String> {
    let is_self = parsed
        .sender_email
        .eq_ignore_ascii_case(&account.creds.email);
    let route = upsert_contact(
        pool,
        &parsed.sender_email,
        parsed.sender_name.as_deref(),
        is_self,
        phase.initial,
    )
    .await?;
    let bucket: &str = if phase.initial {
        bucket_for_import(&route, parsed.is_newsletter)
    } else {
        compute_message_bucket(&route)
    };
    let mut owned_bucket: Option<String> = None;
    let mut rule_label: Option<String> = None;
    if rules.iter().any(|r| r.enabled) {
        let (rule_bucket, label) = crate::services::rules::apply_rules(
            rules,
            &parsed.sender_email,
            parsed.sender_name.as_deref().unwrap_or(""),
            &parsed.subject,
            &parsed.body_text,
        );
        if let Some(b) = rule_bucket {
            owned_bucket = Some(b);
        }
        rule_label = label;
    }
    let bucket_bind: String = owned_bucket.clone().unwrap_or_else(|| bucket.to_string());
    let contact_id = route.id;
    let folder_slug = folder.replace(['/', ' '], "_");
    let mid = format!("imap_{}_{folder_slug}_{uid}", account.account_id);

    // Sent folder messages are outgoing (sender is the user); they must be
    // tagged direction='out' so they never flow into the Imbox list, the
    // Gate screener, or the unread count. compute_message_bucket already
    // routes them to 'paperTrail' because the self-contact is screened=1
    // with default_bucket='paperTrail', but the explicit direction='out'
    // makes the data self-describing for any future per-direction query.
    let direction = match folder_kind {
        Some(crate::services::mailbox_resolver::FolderKind::Sent) => "out",
        _ => "in",
    };

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
    // The compatibility `st` column predates the split sent/received fields.
    // Prefer the sender's own date (what users expect in a mail list) and fall
    // back to the server receipt time when the Date header is missing or
    // invalid. Never invent a timestamp: both are absent only when the server
    // omits INTERNALDATE, in which case we keep sync time so a NOT NULL column
    // stays valid — such rows are reported as legacy by the UI.
    let timeline = parsed.sent_at.or(received_at).unwrap_or_else(chrono::Utc::now);
    let insert_result = sqlx::query(
        "INSERT OR IGNORE INTO messages \
         (id, pid, subj, prev, body, body_html, tm, st, sent_at, received_at, timeline_at, ac, bucket, direction, unread, is_newsletter, labels_json, attachments_json, trackers_json, thread_id, calendar_json, to_addr, cc_json, bcc_json, imap_folder, imap_uid, rfc_message_id) \
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 1, $15, '[]', '[]', '[]', $16, $17, $18, $19, $20, $21, $22, $23)"
    )
    .bind(&mid)
    .bind(&contact_id)
    .bind(&parsed.subject)
    .bind(&prev_excerpt)
    .bind(&parsed.body_text)
    .bind(body_html)
    .bind(timeline.format("%Y-%m-%d %H:%M").to_string())
    .bind(timeline.to_rfc3339())
    .bind(parsed.sent_at.map(|d| d.to_rfc3339()))
    .bind(received_at.map(|d| d.to_rfc3339()))
    .bind(timeline.to_rfc3339())
    .bind(&account.account_id)
    .bind(&bucket_bind)
    .bind(direction)
    .bind(if parsed.is_newsletter { 1 } else { 0 })
    .bind(parsed.thread_id.as_deref().unwrap_or(""))
    .bind(calendar_json.as_deref())
    .bind(&parsed.to_addr)
    .bind(&cc_json)
    .bind(&bcc_json)
    .bind(folder)
    .bind(uid)
    .bind(&parsed.message_id)
    .execute(pool)
    .await
    .map_err(|e| format!("insert message uid={uid}: {e}"))?;

    // INSERT OR IGNORE returns rows_affected() = 1 on first write, 0 on
    // conflict (idempotent re-sync). Surface the id only when we actually
    // wrote a new row so the frontend's prepend list is accurate.
    let new_id = if insert_result.rows_affected() > 0 {
        Some(mid.clone())
    } else {
        None
    };

    // Rule-driven label ("folder") assignment — same UPDATE pattern as
    // attachments so the INSERT stays idempotent.
    if let Some(label_id) = rule_label {
        let existing: Option<(String,)> = sqlx::query_as(
            "SELECT labels_json FROM messages WHERE id = $1",
        )
        .bind(&mid)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("rule label lookup uid={uid}: {e}"))?;
        if let Some((json,)) = existing {
            let mut ids: Vec<String> =
                serde_json::from_str(&json).unwrap_or_default();
            if !ids.iter().any(|x| x == &label_id) {
                ids.push(label_id);
                let _ = sqlx::query("UPDATE messages SET labels_json = $1 WHERE id = $2")
                    .bind(serde_json::to_string(&ids).unwrap_or_else(|_| "[]".into()))
                    .bind(&mid)
                    .execute(pool)
                    .await;
            }
        }
    }

    // Index the message for full-text search.
    let search_body = format!(
        "{} {} {}",
        parsed.sender_email,
        parsed.sender_name.as_deref().unwrap_or(""),
        parsed.body_text
    );
    let _ = index_entity(pool, &mid, "message", &parsed.subject, &search_body).await;

    // Persist attachments to disk and link them to the message.
    let attachment_ids = persist_attachments(
        data_dir,
        pool,
        &contact_id,
        &mid,
        &timeline.to_rfc3339(),
        &parsed.attachments,
    )
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
        let _ = insert_event_from_invite(pool, invite, &contact_id, &account.account_id).await;
    }

    // Only notify for genuinely new mail (skip the historic backlog on
    // the first sync). previous_last_uid == 0 means this is the initial
    // backfill.
    if is_new_arrival(folder, uid, phase) {
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

        // OS-level desktop notification — noise gate: only ping for mail
        // from PEOPLE the user cares about: contacts flagged notify=1, or
        // already-screened senders whose message is not a newsletter.
        // Newsletter/promo mail (List-*) arrives silently into the lists —
        // otherwise a busy mailbox drowns the notification center and the
        // user disables notifications entirely.
        let flags: Option<(i64, i64)> = sqlx::query_as(
            "SELECT notify, screened FROM contacts WHERE id = $1",
        )
        .bind(&contact_id)
        .fetch_optional(pool)
        .await
        .unwrap_or(None);
        let ping = flags
            .map(|(notify, screened)| {
                should_ping_os(
                    notify == 1,
                    screened == 1,
                    parsed.is_newsletter,
                    phase.os_quiet,
                )
            })
            .unwrap_or(false);
        if ping {
            let store = app.state::<crate::services::state::SyncStateStore>();
            let prefs = store.notification_prefs();
            let _ = crate::services::desktop_notifier::notify_new_mail(
                app,
                &prefs,
                &account.account_id,
                &title,
                sender,
            )
            .await;
        }

        // Trigger vacation auto-responder for new mail.
        let _ = maybe_send_vacation_reply(pool, &account.account_id, &account.creds, parsed).await;
    }
    Ok(new_id)
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

/// Process an incoming iCal event from a freshly-synced message and
/// reconcile it against the local `events` table.
///
/// METHOD handling (RFC 5546):
///   - REQUEST (or implicit) — upsert by ical_uid. New invite creates a
///     row; organizer resending with the same UID updates the existing
///     row; the row's local id is preserved so the MeetingPanel keeps
///     pointing at it.
///   - CANCEL — delete the row(s) matching ical_uid. No-op if the
///     invite was never auto-imported.
///   - REPLY — do NOT create a new event. Instead, find the event the
///     organizer's local copy is keyed by and merge the responder's
///     PARTSTAT into the per-attendee map (`attendee_responses_json`).
///
/// `contact_id` is the local contact id of the message sender — used
/// as the event's `pids_json` so the event shows up in that contact's
/// timeline + the Calendar view's "meetings" filter (which is keyed
/// off attendees).
pub async fn insert_event_from_invite(
    pool: &SqlitePool,
    invite: &crate::services::ical::IcalEvent,
    contact_id: &str,
    account_id: &str,
) -> Result<(), String> {
    let method = invite.method.as_deref().unwrap_or("REQUEST");

    // REPLY: the organizer (us, in this case) already has the canonical
    // event row keyed by ical_uid. We merge the responder's PARTSTAT
    // into the per-attendee map. If the invite was never imported
    // (UID doesn't match any row), the reply is silently ignored — the
    // organizer's copy of the event lives in the message thread.
    if method == "REPLY" {
        return record_incoming_reply(pool, invite).await;
    }

    // REQUEST / CANCEL / unknown: delegate to the shared upsert helper
    // so the user-initiated "Add to calendar" path and the auto-import
    // path share the exact same dedup / sequence / CANCEL semantics.
    let _id = upsert_calendar_event(
        pool,
        invite,
        Some(contact_id),
        Some(account_id),
    )
    .await?;
    Ok(())
}

/// Apply an incoming REPLY's ATTENDEE + PARTSTAT to the matching event.
/// No-op when the UID doesn't match any local event (the reply is for
/// an event the user is not organizing).
async fn record_incoming_reply(
    pool: &SqlitePool,
    invite: &crate::services::ical::IcalEvent,
) -> Result<(), String> {
    let Some(uid) = invite.uid.as_deref() else {
        return Ok(());
    };
    let responders: Vec<_> = invite
        .attendee_responses
        .iter()
        .filter(|ar| !ar.email.is_empty() && !ar.partstat.is_empty())
        .collect();
    if responders.is_empty() {
        return Ok(());
    }

    // Load the existing map (default to empty) so we don't clobber
    // responses we already have for other attendees.
    let existing_json: Option<String> =
        sqlx::query_scalar("SELECT attendee_responses_json FROM events WHERE ical_uid = $1")
            .bind(uid)
            .fetch_optional(pool)
            .await
            .map_err(|e| format!("lookup event by uid: {e}"))?;
    let Some(existing_json) = existing_json else {
        // No matching event — silently drop the reply.
        return Ok(());
    };
    let mut map: serde_json::Map<String, serde_json::Value> =
        serde_json::from_str(&existing_json).unwrap_or_default();
    let now = chrono::Utc::now().to_rfc3339();
    for ar in responders {
        map.insert(
            ar.email.to_lowercase(),
            serde_json::json!({
                "partstat": ar.partstat,
                "at": now,
            }),
        );
    }
    let merged = serde_json::to_string(&map).map_err(|e| format!("encode rsvp map: {e}"))?;
    sqlx::query("UPDATE events SET attendee_responses_json = $2 WHERE ical_uid = $1")
        .bind(uid)
        .bind(&merged)
        .execute(pool)
        .await
        .map_err(|e| format!("update attendee_responses_json: {e}"))?;
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
    // P0-3: account_id may be empty in the dev / no-account fallback
    // path (e.g. test-fallback credentials). The messages table has
    // `ac TEXT REFERENCES accounts(id) ON DELETE SET NULL`, so an
    // empty `ac` would violate the FK and the error used to be
    // silently swallowed by 3 layers of `.ok()` in the call site.
    // Skip the Sent row entirely when no account is available.
    if account_id.trim().is_empty() {
        return Err(
            "save_sent_message: no account_id — Sent copy skipped. Connect a real account to keep a Sent record."
                .into(),
        );
    }
    // Replying to someone is not an import: the recipient stays a Gate
    // candidate unless the user approved them, which is exactly the HEY
    // model (writing to someone you blocked is itself a decision to revisit).
    let route = upsert_contact(pool, to_email, None, false, false).await?;
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
        persist_outgoing_attachments(data_dir, pool, &route.id, &mid, attachments).await?;
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

/// Persist parsed attachments to disk and insert their `files` rows.
///
/// `st` is the RFC3339 timestamp of the *message* the attachment belongs
/// to. Files must inherit the mail's date, not the sync time — otherwise
/// every attachment shows "刚刚" in the Files view after a backfill.
async fn persist_attachments(
    data_dir: &std::path::Path,
    pool: &SqlitePool,
    contact_id: &str,
    m_id: &str,
    st: &str,
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
        sqlx::query(
            "INSERT INTO files (id, pid, name, type, mime, size, url, st, source_message_ids) \
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) \
             ON CONFLICT(id) DO UPDATE SET \
                source_message_ids = excluded.source_message_ids, \
                pid = excluded.pid, \
                st = excluded.st",
        )
        .bind(&file_id)
        .bind(contact_id)
        .bind(&att.filename)
        .bind(file_type)
        .bind(&att.mime)
        .bind(content.len() as i64)
        .bind(&relative)
        .bind(st)
        .bind(format!("[\"{}\"]", m_id))
        .execute(pool)
        .await
        .map_err(|e| format!("insert file row {file_id}: {e}"))?;

        // Merge into existing source_message_ids if any.
        let existing: String = sqlx::query_scalar("SELECT source_message_ids FROM files WHERE id = $1")
            .bind(&file_id)
            .fetch_one(pool)
            .await
            .map_err(|e| format!("read source_message_ids: {e}"))?;
        let merged = crate::services::db::merge_json_array(&existing, &format!("[\"{}\"]", m_id))
            .map_err(|e| format!("merge_json_array: {e}"))?;
        sqlx::query("UPDATE files SET source_message_ids = $1 WHERE id = $2")
            .bind(&merged)
            .bind(&file_id)
            .execute(pool)
            .await
            .map_err(|e| format!("update source_message_ids: {e}"))?;

        ids.push(file_id);
    }

    Ok(ids)
}

async fn persist_outgoing_attachments(
    data_dir: &std::path::Path,
    pool: &SqlitePool,
    contact_id: &str,
    m_id: &str,
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
            "INSERT INTO files (id, pid, name, type, mime, size, url, st, source_message_ids) \
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) \
             ON CONFLICT(id) DO UPDATE SET \
                source_message_ids = excluded.source_message_ids, \
                pid = excluded.pid, \
                st = excluded.st",
        )
        .bind(&file_id)
        .bind(contact_id)
        .bind(&att.filename)
        .bind(file_type)
        .bind(&att.mime)
        .bind(att.bytes.len() as i64)
        .bind(&relative)
        .bind(&now)
        .bind(format!("[\"{}\"]", m_id))
        .execute(pool)
        .await
        .map_err(|e| format!("insert file row {file_id}: {e}"))?;

        // Merge into existing source_message_ids if any.
        let existing: String = sqlx::query_scalar("SELECT source_message_ids FROM files WHERE id = $1")
            .bind(&file_id)
            .fetch_one(pool)
            .await
            .map_err(|e| format!("read source_message_ids: {e}"))?;
        let merged = crate::services::db::merge_json_array(&existing, &format!("[\"{}\"]", m_id))
            .map_err(|e| format!("merge_json_array: {e}"))?;
        sqlx::query("UPDATE files SET source_message_ids = $1 WHERE id = $2")
            .bind(&merged)
            .bind(&file_id)
            .execute(pool)
            .await
            .map_err(|e| format!("update source_message_ids: {e}"))?;

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

/// Bucket for a message that arrived during the account's first import.
///
/// The import makes exactly **one** automatic filing decision: newsletters go
/// to the Feed, so five years of Gmail history doesn't hand the user an Imbox
/// that is 90% promos. Receipts and bills are deliberately NOT auto-filed —
/// quietly hiding a bill in a bucket the user never asked for is the kind of
/// silent error that costs trust, and there is no execute+undo UI for
/// keyword rules yet (see docs/TODOS.md §分类自动化).
pub fn bucket_for_import(route: &ContactRouteInfo, is_newsletter: bool) -> &'static str {
    if is_newsletter
        && !route.blocked
        && route.screened
        && !matches!(route.default_bucket.as_str(), "paperTrail" | "trash" | "spam")
    {
        return "feed";
    }
    compute_message_bucket(route)
}

/// Upsert a sender and return its routing info.
///
/// `bulk_import` marks the account's first sync pass: historical senders are
/// written straight to `screened = 1` so they never become Gate cards. The
/// Gate then means what it is supposed to mean — "who may write to me from
/// now on" — instead of a 3,000-item backlog nobody would ever finish.
pub async fn upsert_contact(
    pool: &SqlitePool,
    email: &str,
    name: Option<&str>,
    is_self: bool,
    bulk_import: bool,
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
    // Self-contact invariants: first_seen=0, screened=1, default_bucket='paperTrail'.
    // We force these on both INSERT and ON CONFLICT so the self-contact can never
    // accidentally surface in the Gate screener after the Sent folder is synced.
    let (first_seen, screened, default_bucket) = if is_self {
        (0i64, 1i64, "paperTrail")
    } else if bulk_import {
        // Historical sender: pre-screened, filed in the Imbox. Reversible —
        // the user can re-screen anyone from Contacts.
        (1i64, 1i64, "imbox")
    } else {
        (1i64, 0i64, "imbox")
    };
    sqlx::query(
        "INSERT INTO contacts (id, first_name, last_name, nickname, name, emails_json, stage, grp, health, first_contact, first_seen, screened, default_bucket) \
         VALUES ($1, $2, $3, '', $4, $5, 'active', 'active', 75, datetime('now'), $6, $7, $8) \
         ON CONFLICT(id) DO UPDATE SET \
           first_name = excluded.first_name, \
           last_name = excluded.last_name, \
           name = excluded.name, \
           first_seen = CASE WHEN excluded.first_seen = 0 THEN 0 ELSE contacts.first_seen END, \
           screened = CASE WHEN excluded.screened = 1 THEN 1 ELSE contacts.screened END, \
           default_bucket = CASE WHEN excluded.first_seen = 0 THEN excluded.default_bucket ELSE contacts.default_bucket END"
    )
    .bind(&id)
    .bind(&first)
    .bind(&last)
    .bind(&display_name)
    .bind(format!("[{{\"value\":\"{}\",\"label\":\"work\"}}]", email))
    .bind(first_seen)
    .bind(screened)
    .bind(default_bucket)
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
/// Defaults to one hour. `manual` is handled by `is_manual_sync` — it has no
/// timeout because it must never fire on a timer.
pub fn sync_frequency_from_json(settings: &serde_json::Value) -> Duration {
    let value = settings
        .get("syncFrequency")
        .and_then(|v| v.as_str())
        .unwrap_or("1h");
    match value {
        "5min" => Duration::from_secs(5 * 60),
        "15min" => Duration::from_secs(15 * 60),
        "30min" => Duration::from_secs(30 * 60),
        _ => Duration::from_secs(60 * 60),
    }
}

/// True when the account opted out of timer-driven sync.
///
/// `manual` used to map to a one-hour IDLE timeout, so "手动" quietly polled
/// once an hour — the setting did nothing. Manual accounts now sync on
/// connect and then wait for an explicit 立即同步 (`sync_now`), which runs on
/// its own session and does not depend on the background loop.
pub fn is_manual_sync(settings: &serde_json::Value) -> bool {
    settings
        .get("syncFrequency")
        .and_then(|v| v.as_str())
        .map(|v| v == "manual")
        .unwrap_or(false)
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
    open_pool_at(&db_path()).await
}

/// Wait until the SQL plugin has finished creating the schema.
///
/// Migrations are run by `tauri-plugin-sql` when the **webview** opens the
/// database, i.e. after this Rust process is already up. Background work
/// started from `setup()` — the MCP gateway, the per-account sync loop — can
/// therefore race ahead of the schema: on a fresh install the gateway logged
/// `no such table: app_kv` and the sync loop began fetching mail into a
/// database with no `messages` table. Poll for the table instead of assuming
/// it exists; give up quietly after the timeout and let the next tick retry.
pub async fn wait_for_schema(pool: &SqlitePool, timeout: Duration) -> bool {
    let deadline = std::time::Instant::now() + timeout;
    loop {
        let ready: Result<(i64,), sqlx::Error> =
            sqlx::query_as("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='messages'")
                .fetch_one(pool)
                .await;
        if let Ok((n,)) = ready {
            if n > 0 {
                return true;
            }
        }
        if std::time::Instant::now() >= deadline {
            return false;
        }
        tokio::time::sleep(Duration::from_millis(250)).await;
    }
}

/// Path-parameterized variant for tests and the MCP gateway (same WAL +
/// busy-timeout + 8-connection settings, different file location).
pub async fn open_pool_at(path: &std::path::Path) -> Result<SqlitePool, String> {
    let opts = SqliteConnectOptions::from_str(&format!("sqlite://{}", path.display()))
        .map_err(|e| format!("parse db url: {e}"))?
        .create_if_missing(true)
        .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
        // 5s busy timeout: if a writer holds the lock, wait up to 5s
        // before returning SQLITE_BUSY. The default is 0 (immediate
        // failure), which means concurrent writers fail spuriously even
        // though one would have released its lock milliseconds later.
        .busy_timeout(Duration::from_secs(5));
    // max_connections(8) is the actual fix for the freeze. With the
    // default 1 connection, the IMAP sync loop's long write transaction
    // (a chunk of 200 UIDs takes seconds on the Feishu account) holds
    // the only connection — every frontend read (topbar polls, message
    // click, scroll-driven queries) blocks on the same connection,
    // even though WAL would allow concurrent readers in a separate
    // SQLite session. With 8 connections, sync keeps one, the rest are
    // free for IPC handlers. Tweak up if load grows.
    SqlitePoolOptions::new()
        .max_connections(8)
        .connect_with(opts)
        .await
        .map_err(|e| format!("connect db: {e}"))
}

pub(crate) fn db_path() -> PathBuf {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn uid_validity_unchanged_keeps_cursor() {
        assert_eq!(detect_uid_validity_change(123, 123), None);
    }

    #[test]
    fn uid_validity_changed_resets_cursor_to_zero() {
        assert_eq!(detect_uid_validity_change(123, 456), Some(0));
        assert_eq!(detect_uid_validity_change(1, u32::MAX), Some(0));
    }

    #[test]
    fn uid_validity_initial_sync_does_not_reset() {
        // stored == 0 means we have no prior UIDVALIDITY recorded; this is
        // either a brand-new account or a wiped cursor — treat as initial sync.
        assert_eq!(detect_uid_validity_change(0, 123), None);
        assert_eq!(detect_uid_validity_change(0, 0), None);
    }

    #[test]
    fn continue_when_uid_next_known_and_more_messages_remain() {
        // Regression for the user-reported "Imbox only shows 2022 emails"
        // bug: with uid_next known, a partial chunk MUST NOT stop the loop
        // as long as more UIDs exist on the server.
        assert!(should_continue_after_chunk(1152, Some(7229), 158));
        assert!(should_continue_after_chunk(1352, Some(7229), 42));
        assert!(should_continue_after_chunk(7227, Some(7229), 50));
    }

    #[test]
    fn stop_when_uid_next_known_and_cursor_at_last_uid() {
        // Reached the last existing UID — stop even if the chunk is full.
        assert!(!should_continue_after_chunk(7228, Some(7229), 200));
        assert!(!should_continue_after_chunk(200, Some(201), 1));
    }

    #[test]
    fn fallback_to_legacy_heuristic_when_uid_next_unknown() {
        // Some servers don't expose UIDNEXT — fall back to "stop on partial".
        assert!(should_continue_after_chunk(1152, None, 200));
        assert!(!should_continue_after_chunk(1152, None, 158));
        assert!(!should_continue_after_chunk(0, None, 0));
    }

    #[test]
    fn sync_frequency_maps_each_option_to_a_timeout() {
        let d = |v: &str| {
            let settings = serde_json::json!({ "syncFrequency": v });
            sync_frequency_from_json(&settings)
        };
        assert_eq!(d("5min"), Duration::from_secs(300));
        assert_eq!(d("15min"), Duration::from_secs(900));
        assert_eq!(d("30min"), Duration::from_secs(1800));
        assert_eq!(d("1h"), Duration::from_secs(3600));
        // Unknown / missing values fall back to hourly rather than a busy loop.
        assert_eq!(d("nonsense"), Duration::from_secs(3600));
        assert_eq!(
            sync_frequency_from_json(&serde_json::json!({})),
            Duration::from_secs(3600)
        );
    }

    #[test]
    fn manual_sync_disables_the_background_timer() {
        // "手动" used to map to a one-hour IDLE timeout, so the account kept
        // polling hourly and the setting did nothing visible.
        assert!(is_manual_sync(
            &serde_json::json!({ "syncFrequency": "manual" })
        ));
        assert!(!is_manual_sync(&serde_json::json!({ "syncFrequency": "1h" })));
        assert!(!is_manual_sync(&serde_json::json!({})));
    }
}

#[cfg(test)]
mod folder_walk_tests {
    use super::*;

    #[test]
    fn legacy_empty_chunk_budget_terminates_a_pass() {
        assert!(!legacy_empty_budget_exhausted(0));
        assert!(!legacy_empty_budget_exhausted(39));
        assert!(legacy_empty_budget_exhausted(40));
        // 8000 UIDs of walking per pass: 40 chunks × 200.
        assert_eq!(LEGACY_EMPTY_CHUNK_BUDGET * crate::services::imap::MAX_PER_TICK, 8000);
    }

    #[test]
    fn uid_validity_reset_requires_stored_value() {
        // First sync of a folder (stored 0) never resets.
        assert_eq!(detect_uid_validity_change(0, 5), None);
        // Unchanged validity: no reset.
        assert_eq!(detect_uid_validity_change(5, 5), None);
        // Rebuilt folder: reset exactly once (the caller persists the new
        // validity with the reset cursor, so it can't re-fire).
        assert_eq!(detect_uid_validity_change(1, 5), Some(0));
    }
}

/// One-time backfill of imap identity for rows synced before the columns
/// existed (0029). The message id encodes `imap_<acct>_<folder_slug>_<uid>`;
/// folder slugs are lossy (spaces→_), so match against the account's known
/// syncFolders and take the candidate whose prefix fits. Rows that can't be
/// identified stay null (they just don't flag-sync).
pub async fn backfill_imap_identity(pool: &SqlitePool) -> Result<u32, String> {
    let done: Option<(String,)> =
        sqlx::query_as("SELECT value FROM app_kv WHERE key = 'imap_identity_backfilled'")
            .fetch_optional(pool)
            .await
            .map_err(|e| format!("backfill check: {e}"))?;
    if done.is_some() {
        return Ok(0);
    }
    let rows = sqlx::query_as::<_, (String, String)>(
        "SELECT id, ac FROM messages WHERE imap_uid IS NULL AND id LIKE 'imap\\_%' ESCAPE '\\' LIMIT 20000",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| format!("backfill scan: {e}"))?;

    let mut updated = 0u32;
    for (id, ac) in rows {
        let Some(rest) = id.strip_prefix("imap_") else { continue };
        // Account folders to try, longest-slug first so "Sent Items" wins
        // over "Sent" when both could prefix-match.
        let settings = load_account_settings_json(&ac).await.unwrap_or_default();
        let folders = crate::services::sync_loop::sync_folders_from_json(&settings);
        let mut candidates: Vec<String> = folders.clone();
        candidates.push("INBOX".to_string());
        candidates.sort_by_key(|f| std::cmp::Reverse(f.len()));

        for folder in candidates {
            let slug = folder.replace(['/', ' '], "_");
            let prefix = format!("imap_{ac}_{slug}_");
            if let Some(uid_str) = id.strip_prefix(&prefix) {
                if let Ok(uid) = uid_str.parse::<i64>() {
                    let _ = sqlx::query(
                        "UPDATE messages SET imap_folder = $1, imap_uid = $2 WHERE id = $3",
                    )
                    .bind(&folder)
                    .bind(uid)
                    .bind(&id)
                    .execute(pool)
                    .await;
                    updated += 1;
                    break;
                }
            }
        }
    }
    sqlx::query(
        "INSERT INTO app_kv (key, value, updated_at) VALUES ('imap_identity_backfilled', '1', datetime('now'))",
    )
    .execute(pool)
    .await
    .map_err(|e| format!("backfill mark: {e}"))?;
    eprintln!("[sync] imap identity backfill: {updated} rows");
    Ok(updated)
}
