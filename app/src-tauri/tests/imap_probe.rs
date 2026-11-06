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
                for fetched in bundle.messages.iter().take(3) {
                    eprintln!(
                        "    uid={} from={} subj={:?}",
                        fetched.uid,
                        fetched.parsed.sender_email,
                        fetched.parsed.subject.chars().take(60).collect::<String>()
                    );
                }
            }
            Err(e) => eprintln!("[{}] err={}", folder, e),
        }
    }
}

/// Diagnostic for the "dates are wrong" report: ask the SERVER what date a
/// specific UID really has, and compare it with what the local row claims.
///
/// Message `imap_<account>_INBOX_7453` is stored as 2026-09-15T19:30:58Z
/// (2026-09-16 03:30 Asia/Shanghai). If the envelope Date or INTERNALDATE
/// disagree, the bug is in sync/storage; if they agree, the list is right and
/// the complaint is about something else.
#[tokio::test]
async fn probe_envelope_date_for_uid() {
    if !e2e_enabled() {
        eprintln!("SENDPALM_E2E_NETWORK not set — skipping");
        return;
    }
    let Some(c) = creds() else { return };
    sendpalm_app_lib::install_crypto_provider();
    let target: u32 = std::env::var("SENDPALM_PROBE_UID")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(7453);
    let client = ImapClient::new(c);
    let bundle = client
        .sync("INBOX", target.saturating_sub(1))
        .await
        .expect("sync chunk");
    for m in &bundle.messages {
        if m.uid == target {
            eprintln!(
                "[probe] uid={} subj={:?} sent_at={:?} internaldate={:?}",
                m.uid, m.parsed.subject, m.parsed.sent_at, m.received_at
            );
            return;
        }
    }
    eprintln!("[probe] uid={target} not in the returned chunk ({} msgs)", bundle.messages.len());
}

/// What does the server actually have near the end of INBOX, and does the
/// local table agree? Prints the newest UIDs with their real dates.
#[tokio::test]
async fn probe_newest_uids_in_inbox() {
    if !e2e_enabled() {
        eprintln!("SENDPALM_E2E_NETWORK not set — skipping");
        return;
    }
    let Some(c) = creds() else { return };
    sendpalm_app_lib::install_crypto_provider();
    let start: u32 = std::env::var("SENDPALM_PROBE_CURSOR")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(150_000);
    let client = ImapClient::new(c);
    let folder = std::env::var("SENDPALM_PROBE_FOLDER").unwrap_or_else(|_| "INBOX".to_string());
    let bundle = client.sync(&folder, start).await.expect("sync chunk");
    eprintln!(
        "[probe] folder={folder} cursor={start} uid_next={:?} returned={} highest={}",
        bundle.uid_next,
        bundle.messages.len(),
        bundle.highest_uid
    );
    for m in bundle.messages.iter().rev().take(6) {
        eprintln!(
            "[probe] uid={} sent={:?} received={:?} subj={:?}",
            m.uid,
            m.parsed.sent_at,
            m.received_at,
            &m.parsed.subject.chars().take(40).collect::<String>()
        );
    }
}
