//! Diagnostic test — list all mailboxes to understand folder layout.

use sendpalm_app_lib::services::imap::ImapClient;

fn e2e_enabled() -> bool {
    std::env::var("SENDPALM_E2E_NETWORK").is_ok()
}

fn creds() -> Option<sendpalm_app_lib::services::EmailCredentials> {
    let dotenv_result = dotenvy::from_filename("../.env");
    eprintln!(
        "[probe] dotenvy from_filename('../.env') = {:?}",
        dotenv_result.is_ok()
    );
    let _ = dotenvy::dotenv();
    let email = std::env::var("SENDPALM_TEST_EMAIL").ok()?;
    let pw = std::env::var("SENDPALM_TEST_PASSWORD").ok()?;
    let imap_host =
        std::env::var("SENDPALM_TEST_IMAP_HOST").unwrap_or_else(|_| "imap.feishu.cn".to_string());
    let imap_port: u16 = std::env::var("SENDPALM_TEST_IMAP_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(993);
    let smtp_host =
        std::env::var("SENDPALM_TEST_SMTP_HOST").unwrap_or_else(|_| "smtp.feishu.cn".to_string());
    let smtp_port: u16 = std::env::var("SENDPALM_TEST_SMTP_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(465);
    Some(sendpalm_app_lib::services::EmailCredentials {
        email,
        password: pw,
        imap_host,
        imap_port,
        smtp_host,
        smtp_port,
        smtp_implicit_tls: smtp_port == 465,
    })
}

#[tokio::test]
async fn list_mailboxes() {
    eprintln!(
        "[probe] SENDPALM_E2E_NETWORK={}",
        if e2e_enabled() { "yes" } else { "NO" }
    );
    if !e2e_enabled() {
        eprintln!("SENDPALM_E2E_NETWORK not set");
        return;
    }
    let Some(c) = creds() else {
        eprintln!("[probe] creds() returned None — check .env");
        return;
    };
    eprintln!(
        "[probe] creds: email={} host={}:{}",
        c.email, c.imap_host, c.imap_port
    );
    let client = ImapClient::new(c);
    let mb = client.list_mailboxes().await.expect("list_mailboxes");
    eprintln!("=== MAILBOXES ===");
    for m in &mb {
        eprintln!("  {}", m);
    }
    eprintln!("=================");
}

#[tokio::test]
async fn fetch_from_multiple_folders() {
    if !e2e_enabled() {
        eprintln!("SENDPALM_E2E_NETWORK not set");
        return;
    }
    let Some(c) = creds() else {
        return;
    };
    let client = ImapClient::new(c);
    let mb = client.list_mailboxes().await.expect("list_mailboxes");
    eprintln!("Probing {} folders", mb.len());
    for folder in &mb {
        match client.sync(folder, 0).await {
            Ok(bundle) => {
                eprintln!(
                    "[{}] uid_validity={} highest_uid={} msgs={}",
                    folder,
                    bundle.uid_validity,
                    bundle.highest_uid,
                    bundle.messages.len()
                );
                for (uid, m) in bundle.messages.iter().take(3) {
                    eprintln!(
                        "    uid={} from={} subj={:?}",
                        uid,
                        m.sender_email,
                        m.subject.chars().take(60).collect::<String>()
                    );
                }
            }
            Err(e) => eprintln!("[{}] err={}", folder, e),
        }
    }
}
