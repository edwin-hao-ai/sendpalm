//! SMTP roundtrip: send to self, then verify via IMAP that the message appears.

use sendpalm_app_lib::services::imap::ImapClient;
use sendpalm_app_lib::services::smtp::SmtpClient;
use sendpalm_app_lib::services::{EmailCredentials, load_test_credentials};
use std::time::Duration;

fn e2e_enabled() -> bool {
    std::env::var("SENDPALM_E2E_NETWORK").is_ok()
}

fn creds() -> Option<EmailCredentials> {
    let _ = dotenvy::dotenv();
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
async fn smtp_send_to_self() {
    if !e2e_enabled() {
        eprintln!("SENDPALM_E2E_NETWORK not set — skipping");
        return;
    }
    let Some(c) = creds() else {
        eprintln!("Test creds missing");
        return;
    };
    let _ = load_test_credentials().expect("load_test_credentials");

    let smtp = SmtpClient::new(c.clone());
    let subject = format!(
        "[sendpalm e2e] {}",
        chrono::Utc::now().format("%Y-%m-%d %H:%M:%S UTC")
    );
    let body = "Hello from SendPalm E2E!\n\nThis message was sent by the integration test suite.";
    let message_id = smtp
        .send(&c.email, &c.email, &subject, body)
        .await
        .expect("smtp.send");
    eprintln!("[smtp] sent message-id={message_id}");

    // Wait a few seconds for the message to be delivered to INBOX
    tokio::time::sleep(Duration::from_secs(5)).await;

    // Now sync INBOX and confirm our message is there.
    let imap = ImapClient::new(c);
    let bundle = imap.sync("INBOX", 0).await.expect("imap.sync INBOX");
    let found = bundle
        .messages
        .iter()
        .any(|(_, m)| m.subject.trim() == subject);
    assert!(
        found,
        "subject '{}' not found in INBOX after send (uid_range {}..={})",
        subject,
        0,
        bundle.highest_uid
    );
}