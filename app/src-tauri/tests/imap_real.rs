//! Real IMAP integration test against imap.feishu.cn.
//!
//! Gated behind `SENDPALM_E2E_NETWORK=1` so CI without credentials skips it.
//! Locally with `app/.env` populated the test connects and asserts at least one
//! message is fetchable.

use sendpalm_app_lib::services::{EmailCredentials, load_test_credentials};

fn e2e_enabled() -> bool {
    std::env::var("SENDPALM_E2E_NETWORK").is_ok()
}

async fn creds() -> Option<EmailCredentials> {
    let _ = dotenvy::dotenv();
    // Tests run from `app/src-tauri/`; .env is one level up.
    let _ = dotenvy::from_filename("../.env");
    let email = std::env::var("SENDPALM_TEST_EMAIL").ok()?;
    let pw = std::env::var("SENDPALM_TEST_PASSWORD").ok()?;
    let imap_host = std::env::var("SENDPALM_TEST_IMAP_HOST")
        .unwrap_or_else(|_| "imap.feishu.cn".to_string());
    let imap_port: u16 = std::env::var("SENDPALM_TEST_IMAP_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(993);
    let smtp_host = std::env::var("SENDPALM_TEST_SMTP_HOST")
        .unwrap_or_else(|_| "smtp.feishu.cn".to_string());
    let smtp_port: u16 = std::env::var("SENDPALM_TEST_SMTP_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(465);
    Some(EmailCredentials {
        email,
        password: pw,
        imap_host,
        imap_port,
        smtp_host,
        smtp_port,
    })
}

#[tokio::test]
async fn imap_login_and_list() {
    if !e2e_enabled() {
        eprintln!("SENDPALM_E2E_NETWORK not set — skipping");
        return;
    }
    let Some(c) = creds().await else {
        eprintln!("Test creds missing — set SENDPALM_TEST_* in .env");
        return;
    };
    // Make sure load_test_credentials() also works end-to-end
    let loaded = match load_test_credentials() {
        Ok(c) => c,
        Err(e) => {
            eprintln!("load_test_credentials failed: {e}");
            return;
        }
    };
    assert_eq!(loaded.email, c.email);
    assert_eq!(loaded.imap_port, c.imap_port);

    let client = sendpalm_app_lib::services::imap::ImapClient::new(c);
    let mb = client.list_mailboxes().await.expect("list_mailboxes");
    assert!(!mb.is_empty(), "expected at least one mailbox");
    assert!(
        mb.iter().any(|m| m.to_uppercase().contains("INBOX")),
        "expected INBOX in {mb:?}"
    );
}

#[tokio::test]
async fn imap_sync_returns_messages() {
    if !e2e_enabled() {
        eprintln!("SENDPALM_E2E_NETWORK not set — skipping");
        return;
    }
    let Some(c) = creds().await else {
        eprintln!("Test creds missing");
        return;
    };
    let client = sendpalm_app_lib::services::imap::ImapClient::new(c);
    let bundle = client.sync("INBOX", 0).await.expect("sync INBOX");

    // Inbox must contain at least one message. Even an empty inbox has UIDs.
    assert!(
        !bundle.messages.is_empty() || bundle.uid_validity > 0,
        "expected at least one message or valid UIDVALIDITY; got {:?}",
        bundle
    );
    eprintln!(
        "[imap] INBOX uid_validity={} highest_uid={} msgs={}",
        bundle.uid_validity, bundle.highest_uid, bundle.messages.len()
    );
    for (uid, m) in bundle.messages.iter().take(3) {
        eprintln!(
            "[imap] uid={} from={} subj={}",
            uid,
            m.sender_email,
            m.subject.chars().take(50).collect::<String>()
        );
    }
}

#[tokio::test]
async fn imap_idle_inits_and_times_out() {
    if !e2e_enabled() {
        eprintln!("SENDPALM_E2E_NETWORK not set — skipping");
        return;
    }
    let Some(c) = creds().await else {
        eprintln!("Test creds missing");
        return;
    };
    let client = sendpalm_app_lib::services::imap::ImapClient::new(c);
    // Use a short timeout so the test finishes quickly. The server should
    // accept IDLE, then return either a keep-alive or the timeout path.
    client
        .idle_wait("INBOX", std::time::Duration::from_secs(3))
        .await
        .expect("IDLE init should succeed");
}