//! Sync-state container.
//! Tracks `(uid_validity, last_uid, last_synced_at)` per account.

use std::collections::HashMap;
use std::sync::Mutex;

use crate::services::desktop_notifier::NotificationPrefs;

#[derive(Debug, Clone)]
pub struct AccountSyncState {
    pub uid_validity: u32,
    pub last_uid: u32,
    /// Timestamp of the last SUCCESSFUL sync. A failed attempt never
    /// advances this — the UI must not present a failure as freshness.
    pub last_synced_at: chrono::DateTime<chrono::Utc>,
    pub busy: bool,
    pub status: AccountSyncStatus,
    /// Sanitized machine-readable error code (e.g. "missing_credentials").
    /// Never a raw error string — those can contain server responses.
    pub error_code: Option<String>,
}

/// User-facing sync lifecycle. Serializes to a stable lowercase string for
/// the IPC boundary.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AccountSyncStatus {
    /// No successful sync has ever completed for this account.
    NeverSynced,
    Syncing,
    Connected,
    /// The account is configured but the OS keychain has no password (or
    /// the stored one was rejected). Actionable in Settings → Accounts.
    NeedsCredentials,
    Error,
}

impl AccountSyncStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::NeverSynced => "never_synced",
            Self::Syncing => "syncing",
            Self::Connected => "connected",
            Self::NeedsCredentials => "needs_credentials",
            Self::Error => "error",
        }
    }
}

impl Default for AccountSyncState {
    fn default() -> Self {
        Self {
            uid_validity: 0,
            last_uid: 0,
            last_synced_at: chrono::DateTime::from_timestamp(0, 0)
                .unwrap()
                .with_timezone(&chrono::Utc),
            busy: false,
            status: AccountSyncStatus::NeverSynced,
            error_code: None,
        }
    }
}

/// Process-global sync state. Persisted via `tauri-plugin-store` separately.
pub struct SyncStateStore {
    inner: Mutex<HashMap<String, AccountSyncState>>,
    notif: Mutex<NotificationPrefs>,
}

impl SyncStateStore {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(HashMap::new()),
            notif: Mutex::new(NotificationPrefs::default()),
        }
    }

    pub fn get(&self, account_id: &str) -> AccountSyncState {
        self.inner
            .lock()
            .unwrap()
            .get(account_id)
            .cloned()
            .unwrap_or_default()
    }

    pub fn put(&self, account_id: &str, state: AccountSyncState) {
        self.inner
            .lock()
            .unwrap()
            .insert(account_id.to_string(), state);
    }

    pub fn notification_prefs(&self) -> NotificationPrefs {
        self.notif.lock().unwrap().clone()
    }

    pub fn set_notification_prefs(&self, prefs: NotificationPrefs) {
        *self.notif.lock().unwrap() = prefs;
    }
}

impl Default for SyncStateStore {
    fn default() -> Self {
        Self::new()
    }
}
