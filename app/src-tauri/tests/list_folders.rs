//! One-shot (ignored): list server-side IMAP folders. Run with --ignored.
#[tokio::test]
#[ignore]
async fn list_server_folders() {
    let manifest = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let _ = dotenvy::from_path(manifest.join("../.env"));
    let _ = rustls::crypto::ring::default_provider().install_default();
    let creds = sendpalm_app_lib::services::load_test_credentials().unwrap();
    let client = sendpalm_app_lib::services::imap::ImapClient::new(creds);
    let folders = client.list_mailboxes().await.expect("list");
    for f in &folders {
        eprintln!("FOLDER: {f}");
    }
}
