//! One-shot (ignored): copy the email app-password from .env into the OS
//! keychain under the existing account id, using the app's own vault path.
//! The password is never printed.
//! Run: cargo test --test install_mail_password -- --ignored

#[test]
#[ignore]
fn install_password_into_keychain() {
    let manifest = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let _ = dotenvy::from_path(manifest.join("../.env"));
    let password = std::env::var("SENDPALM_TEST_PASSWORD").expect("SENDPALM_TEST_PASSWORD in .env");
    let email = std::env::var("SENDPALM_TEST_EMAIL").expect("SENDPALM_TEST_EMAIL in .env");
    let account_id = format!("acct_{email}");
    sendpalm_app_lib::services::vault::set_password(&account_id, &password)
        .expect("keychain write");
    let roundtrip = sendpalm_app_lib::services::vault::get_password(&account_id)
        .expect("keychain read")
        .expect("entry exists");
    assert_eq!(roundtrip, password);
    eprintln!("keychain entry installed for {account_id} ({} chars)", password.len());
}
