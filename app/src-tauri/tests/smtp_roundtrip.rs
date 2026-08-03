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

    // Now sync INBOX and the Sent folder. Feishu Mail uses UTF-7 encoded
    // folder names — the Sent folder shows as "&XfJT0ZAB-" in IMAP.
    // We walk a generous range to be robust to the 200-per-tick cap.
    let imap = ImapClient::new(c.clone());

    // Search across likely folders where a self-sent email might land.
    let candidates = ["INBOX", "&XfJT0ZAB-"];
    let mut found = false;
    let mut total_checked = 0;

    for folder in candidates {
        let first = imap.sync(folder, 0).await.expect("sync");
        let mut all = first.messages;
        let mut last_uid = first.highest_uid;
        // Walk forward in chunks to get past the 200/tick cap.
        for _ in 0..20 {
            let next = imap.sync(folder, last_uid).await.expect("next");
            if next.messages.is_empty() {
                break;
            }
            last_uid = next.highest_uid;
            all.extend(next.messages);
            if all.iter().any(|(_, m)| m.subject.trim() == subject.trim()) {
                break;
            }
        }
        total_checked += all.len();
        eprintln!(
            "[smtp-test] folder={} found {} msgs (max_uid={})",
            folder,
            all.len(),
            last_uid
        );
        if all.iter().any(|(_, m)| m.subject.trim() == subject.trim()) {
            found = true;
            break;
        }
    }
    assert!(
        found,
        "subject '{subject}' not found after scanning {total_checked} messages across INBOX + Sent"
    );
}