//! Live two-way read-state check against the real mailbox (ignored by
//! default). Picks one real message, flips \Seen on the server both ways,
//! then RESTORES the original unread state. Run with --ignored + .env.

#[tokio::test]
#[ignore]
async fn set_seen_roundtrips_on_server() {
    let _ = rustls::crypto::ring::default_provider().install_default();
    let manifest = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let _ = dotenvy::from_path(manifest.join("../.env"));
    let creds = sendpalm_app_lib::services::load_test_credentials().unwrap();

    // Newest message with an IMAP identity.
    let pool = sendpalm_app_lib::services::sync_loop::open_pool().await.unwrap();
    let row: (String, i64, String) = sqlx::query_as(
        "SELECT id, imap_uid, imap_folder FROM messages \
         WHERE imap_uid IS NOT NULL ORDER BY timeline_at DESC LIMIT 1",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    eprintln!("target: {} folder={} uid={}", row.0, row.2, row.1);

    let client = sendpalm_app_lib::services::imap::ImapClient::new(creds);
    // Both directions accepted by the server (Feishu errors on invalid
    // UIDs), then restore the original unread state.
    client
        .set_seen(&row.2, row.1 as u32, true)
        .await
        .expect("set seen");
    client
        .set_seen(&row.2, row.1 as u32, false)
        .await
        .expect("unset (restore)");
    eprintln!("read-state STORE accepted in both directions; original state restored");
}
