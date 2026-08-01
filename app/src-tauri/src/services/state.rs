//! Sync-state container.
//! Tracks `(uid_validity, last_uid, last_synced_at)` per account.

use std::collections::HashMap;
use std::sync::Mutex;

#[derive(Debug, Clone)]
pub struct AccountSyncState {
    pub uid_validity: u32,
    pub last_uid: u32,
    pub last_synced_at: chrono::DateTime<chrono::Utc>,
}

impl Default for AccountSyncState {
    fn default() -> Self {
        Self {
            uid_validity: 0,
            last_uid: 0,
            last_synced_at: chrono::DateTime::from_timestamp(0, 0).unwrap().with_timezone(&chrono::Utc),
        }
    }
}

/// Process-global sync state. Persisted via `tauri-plugin-store` separately.
pub struct SyncStateStore {
    inner: Mutex<HashMap<String, AccountSyncState>>,
}

impl SyncStateStore {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(HashMap::new()),
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
        self.inner.lock().unwrap().insert(account_id.to_string(), state);
    }
}

impl Default for SyncStateStore {
    fn default() -> Self {
        Self::new()
    }
}