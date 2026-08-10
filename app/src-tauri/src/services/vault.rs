//! Encrypted credential vault.
//!
//! Uses the OS-native credential store via the `keyring` crate:
//! - macOS: Keychain
//! - Windows: Credential Manager
//! - Linux: Secret Service (GNOME Keyring / KWallet)
//!
//! Each account gets its own entry under the service id `com.sendpalm.app`
//! with the account id as the username. Passwords never touch our SQL store.

use keyring::Entry;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

pub const SERVICE_ID: &str = "com.sendpalm.app";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct VaultEntry {
    pub account_id: String,
    pub password: String,
}

/// Save or update a password for `account_id`.
pub fn set_password(account_id: &str, password: &str) -> Result<(), String> {
    let entry = Entry::new(SERVICE_ID, account_id).map_err(|e| format!("keyring entry: {e}"))?;
    entry
        .set_password(password)
        .map_err(|e| format!("keyring set: {e}"))
}

/// Load the password for `account_id`. Returns `Ok(None)` if missing.
pub fn get_password(account_id: &str) -> Result<Option<String>, String> {
    let entry = Entry::new(SERVICE_ID, account_id).map_err(|e| format!("keyring entry: {e}"))?;
    match entry.get_password() {
        Ok(p) => Ok(Some(p)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("keyring get: {e}")),
    }
}

/// Delete a password entry.
pub fn delete_password(account_id: &str) -> Result<(), String> {
    let entry = Entry::new(SERVICE_ID, account_id).map_err(|e| format!("keyring entry: {e}"))?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("keyring delete: {e}")),
    }
}

/// List known accounts (best-effort — not all keychains support enumeration).
/// Returns Vec<(account_id, has_password)> so the UI can show which accounts
/// are configured to connect.
pub fn list_known_accounts() -> Vec<(String, bool)> {
    // The `keyring` crate doesn't provide enumeration across platforms.
    // We return what we can: try a few sentinel names. Real implementation
    // should keep the canonical account-id list in SQL.
    Vec::new()
}

/// In-memory credential cache for the lifetime of the app. Avoids hitting
/// the OS keychain on every send/sync. Cleared on app shutdown.
#[derive(Default)]
pub struct CredentialCache {
    inner: std::sync::Mutex<HashMap<String, String>>,
}

impl CredentialCache {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn put(&self, account_id: &str, password: String) {
        self.inner
            .lock()
            .unwrap()
            .insert(account_id.to_string(), password);
    }

    pub fn get(&self, account_id: &str) -> Option<String> {
        self.inner.lock().unwrap().get(account_id).cloned()
    }

    pub fn clear(&self) {
        self.inner.lock().unwrap().clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Mock-style test that verifies the cache behaves as expected.
    /// Real keyring tests require a platform credential store; CI skip.
    #[test]
    fn cache_put_and_get_round_trips() {
        let cache = CredentialCache::new();
        cache.put("acct_a", "pw-a".to_string());
        cache.put("acct_b", "pw-b".to_string());
        assert_eq!(cache.get("acct_a").as_deref(), Some("pw-a"));
        assert_eq!(cache.get("acct_b").as_deref(), Some("pw-b"));
        assert_eq!(cache.get("acct_missing"), None);
        cache.clear();
        assert_eq!(cache.get("acct_a"), None);
    }

    #[test]
    fn vault_entry_serializes() {
        let e = VaultEntry {
            account_id: "acct_test".into(),
            password: "secret123".into(),
        };
        let json = serde_json::to_string(&e).unwrap();
        assert!(json.contains("acct_test"));
        assert!(json.contains("secret123"));
        let back: VaultEntry = serde_json::from_str(&json).unwrap();
        assert_eq!(back, e);
    }
}
