//! Vault round-trip tests — uses an isolated test service id to avoid
//! touching the user's real keychain entries.

use sendpalm_app_lib::services::vault::{
    delete_password, get_password, set_password, CredentialCache, VaultEntry,
};

/// Create a unique test id per run to avoid cross-test pollution.
fn unique_id(suffix: &str) -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    format!("sendpalm.test.{ts}.{suffix}")
}

#[test]
fn round_trip_via_keyring() {
    // CI environments without a credential store should skip silently.
    let id = unique_id("rt");
    let pw = "hunter2-correct-horse";
    if set_password(&id, pw).is_err() {
        eprintln!("keyring unavailable — skipping");
        return;
    }
    let loaded = get_password(&id).expect("load");
    assert_eq!(loaded.as_deref(), Some(pw), "loaded value mismatch");
    delete_password(&id).expect("delete");
    let after = get_password(&id).expect("load after delete");
    assert_eq!(after, None);
}

#[test]
fn delete_missing_is_noop() {
    let id = unique_id("noop");
    delete_password(&id).expect("delete missing should be a no-op");
}

#[test]
fn cache_and_serialization() {
    let cache = CredentialCache::new();
    cache.put("a", "1".into());
    cache.put("b", "2".into());
    assert_eq!(cache.get("a").as_deref(), Some("1"));
    assert_eq!(cache.get("b").as_deref(), Some("2"));
    assert_eq!(cache.get("missing"), None);

    let entry = VaultEntry {
        account_id: "acct_x".into(),
        password: "secret".into(),
    };
    let s = serde_json::to_string(&entry).unwrap();
    let back: VaultEntry = serde_json::from_str(&s).unwrap();
    assert_eq!(back, entry);
}
