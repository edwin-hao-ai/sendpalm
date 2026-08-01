//! IMAP sync via `async-imap` over `native-tls`.
//! Walks the configured mailbox's UIDs in order, fetches new messages,
//! parses them, and returns `SyncBundle`s the caller can apply to SQL.

use super::{EmailCredentials, SyncReport, parser};
use async_imap::{Client, Session};
use async_native_tls::{TlsConnector, TlsStream};
use futures::StreamExt;
use tokio::net::TcpStream;
use tokio::time::timeout;
use tokio_util::compat::{Compat, TokioAsyncReadCompatExt};

pub struct ImapClient {
    creds: EmailCredentials,
}

impl ImapClient {
    pub fn new(creds: EmailCredentials) -> Self {
        Self { creds }
    }

    pub fn creds(&self) -> &EmailCredentials {
        &self.creds
    }

    /// Open a fresh authenticated IMAP session over TLS.
    pub async fn connect(&self) -> Result<ImapSession, String> {
        let connect_fut = TcpStream::connect((&self.creds.imap_host[..], self.creds.imap_port));
        let tcp = timeout(std::time::Duration::from_secs(15), connect_fut)
            .await
            .map_err(|_| format!("tcp connect {}/{}: timeout", self.creds.imap_host, self.creds.imap_port))?
            .map_err(|e| format!("tcp connect {}/{}: {e}", self.creds.imap_host, self.creds.imap_port))?;

        let tcp_compat = tcp.compat();
        let tls = TlsConnector::new()
            .connect(&self.creds.imap_host, tcp_compat)
            .await
            .map_err(|e| format!("imap tls: {e}"))?;

        let mut client = Client::new(tls);
        let session: async_imap::Session<_> = client
            .login(&self.creds.email, &self.creds.password)
            .await
            .map_err(|(e, _)| format!("imap login: {e}"))?;
        Ok(session)
    }

    /// List the mailboxes on the server.
    pub async fn list_mailboxes(&self) -> Result<Vec<String>, String> {
        let mut session = self.connect().await?;
        let names: Vec<String> = session
            .list(None, Some("*"))
            .await
            .map_err(|e| format!("list: {e}"))?
            .filter_map(|r| async { r.ok() })
            .collect::<Vec<_>>()
            .await
            .iter()
            .map(|mb| mb.name().to_string())
            .collect();
        let _ = session.logout().await;
        Ok(names)
    }

    /// Sync a single mailbox, returning parsed messages and the highest UID seen.
    /// Caller persists `last_uid` and `uid_validity` on `accounts` row.
    pub async fn sync(
        &self,
        mailbox_name: &str,
        last_uid: u32,
    ) -> Result<SyncBundle, String> {
        let mut session = self.connect().await?;
        let mailbox = session
            .select(mailbox_name)
            .await
            .map_err(|e| format!("select {mailbox_name}: {e}"))?;

        let uid_validity = mailbox.uid_validity.unwrap_or(0);

        let range = format!("{}:*", last_uid + 1);
        let mut stream = session
            .fetch(&range, "(FLAGS UID ENVELOPE BODY.PEEK[])")
            .await
            .map_err(|e| format!("fetch: {e}"))?;

        let mut messages = Vec::new();
        let mut highest_uid = last_uid;

        while let Some(msg) = stream.next().await {
            let msg = msg.map_err(|e| format!("fetch item: {e}"))?;
            let Some(uid) = msg.uid else { continue };
            let body_opt = msg.body();
            let Some(body_bytes) = body_opt else { continue };
            let raw = body_bytes.to_vec();
            match parser::parse_email(&raw) {
                Ok(parsed) => {
                    if uid > highest_uid {
                        highest_uid = uid;
                    }
                    messages.push((uid, parsed));
                }
                Err(e) => {
                    eprintln!("[imap] parse uid={uid} failed: {e}");
                }
            }
        }
        drop(stream);

        let _ = session.logout().await;

        Ok(SyncBundle {
            mailbox: mailbox_name.to_string(),
            uid_validity,
            highest_uid,
            messages,
        })
    }
}

/// One fetch round result.
#[derive(Debug)]
pub struct SyncBundle {
    pub mailbox: String,
    pub uid_validity: u32,
    pub highest_uid: u32,
    pub messages: Vec<(u32, super::parser::ParsedMessage)>,
}

impl SyncBundle {
    pub fn report(&self, account_id: &str, new_msgs: usize, skipped: usize) -> SyncReport {
        SyncReport {
            account_id: account_id.to_string(),
            mailbox: self.mailbox.clone(),
            new_messages: new_msgs,
            skipped,
            uid_validity: self.uid_validity as u64,
            last_uid: self.highest_uid as u64,
            error: None,
        }
    }
}

type ImapSession = Session<TlsStream<Compat<TcpStream>>>;