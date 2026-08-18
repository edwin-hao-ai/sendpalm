//! IMAP sync via `async-imap` over `native-tls`.
//! Walks the configured mailbox's UIDs in order, fetches new messages,
//! parses them, and returns `SyncBundle`s the caller can apply to SQL.

use super::{parser, EmailCredentials, SyncReport};
use async_imap::{Client, Session};
use async_native_tls::{TlsConnector, TlsStream};
use futures::StreamExt;
use tokio::net::TcpStream;
use tokio::time::timeout;
use tokio_util::compat::{Compat, TokioAsyncReadCompatExt};

use async_imap::extensions::idle::IdleResponse;
use std::time::Duration;

/// Hard cap per sync tick — protects the UI from 100k+ message mailboxes.
/// We round-trip per chunk so a slow IMAP server doesn't hold the connection.
pub const MAX_PER_TICK: u32 = 200;

/// Default IDLE timeout before we re-issue the command to avoid server
/// inactivity cut-offs (RFC 2177 recommends < 30 min).
pub const IDLE_TIMEOUT: Duration = Duration::from_secs(5 * 60);

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

    /// Resolve the TCP endpoint for the IMAP server.
    ///
    /// Some networks (notably those running Clash fake-ip/TUN mode) return
    /// RFC 5735 test-net addresses (198.18.0.0/15) from the system resolver.
    /// Those addresses do not reach the real mail server, so we provide two
    /// escape hatches:
    ///   1. `SENDPALM_IMAP_IP` / `SENDPALM_SMTP_IP` env vars for manual override.
    ///   2. Automatic DoH fallback to Cloudflare when only fake IPs are returned.
    async fn resolve_endpoint(&self) -> Result<(String, u16), String> {
        let port = self.creds.imap_port;

        // 1. Explicit override wins.
        if let Ok(override_ip) = std::env::var("SENDPALM_IMAP_IP") {
            if !override_ip.is_empty() {
                return Ok((override_ip, port));
            }
        }

        // 2. Try system resolver.
        let addrs: Vec<std::net::SocketAddr> =
            match tokio::net::lookup_host((&self.creds.imap_host[..], port)).await {
                Ok(iter) => iter.collect(),
                Err(_) => Vec::new(),
            };

        let has_real = addrs.iter().any(|a| !is_fake_ip(&a.ip()));
        if has_real {
            // System resolver gave at least one real address; use the hostname.
            return Ok((self.creds.imap_host.clone(), port));
        }

        // 3. All system results are fake IPs (or lookup failed). Fall back to DoH.
        if let Some(ip) = doh_resolve_ipv4(&self.creds.imap_host).await {
            eprintln!("[imap] fake-ip detected; using DoH fallback {} for {}", ip, self.creds.imap_host);
            return Ok((ip, port));
        }

        // Last resort: return the hostname and let the underlying connector fail
        // with a clear message rather than hiding the issue.
        Ok((self.creds.imap_host.clone(), port))
    }

    /// Open a fresh authenticated IMAP session over TLS.
    pub async fn connect(&self) -> Result<ImapSession, String> {
        let (endpoint, port) = self.resolve_endpoint().await?;
        let connect_fut = TcpStream::connect((&endpoint[..], port));
        let tcp = timeout(std::time::Duration::from_secs(15), connect_fut)
            .await
            .map_err(|_| format!("tcp connect {}/{port}: timeout", self.creds.imap_host))?
            .map_err(|e| format!("tcp connect {}/{port}: {e}", self.creds.imap_host))?;

        let tcp_compat = tcp.compat();
        // Always use the real hostname for SNI / certificate validation.
        let tls = TlsConnector::new()
            .connect(&self.creds.imap_host, tcp_compat)
            .await
            .map_err(|e| format!("imap tls: {e}"))?;

        let client = Client::new(tls);
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

    /// Block on IMAP IDLE for `timeout`, returning Ok when the server reports
    /// new mailbox activity or when the timeout fires. This lets us react to
    /// new mail in seconds instead of polling every 60 s.
    pub async fn idle_wait(&self, mailbox_name: &str, timeout: Duration) -> Result<(), String> {
        let mut session = self.connect().await?;
        session
            .select(mailbox_name)
            .await
            .map_err(|e| format!("select {mailbox_name}: {e}"))?;

        let mut handle = session.idle();
        handle.init().await.map_err(|e| format!("idle init: {e}"))?;

        let (wait_fut, _stop) = handle.wait_with_timeout(timeout);
        let result = wait_fut.await;

        // Always try to terminate IDLE cleanly so the server releases the
        // connection state for the next command.
        let _ = handle.done().await;

        match result {
            Ok(IdleResponse::NewData(_)) => Ok(()),
            Ok(_) => Ok(()),
            Err(e) => Err(format!("idle wait: {e}")),
        }
    }
}

/// Encode a folder name to IMAP modified UTF-7 (RFC 3501 §5.1.3) so
/// non-ASCII folder names like Feishu's `&XfJT0ZAB-` are accepted by
/// `session.select`. ASCII names are returned unchanged.
pub fn encode_utf7_imap(name: &str) -> String {
    if name.is_ascii() {
        return name.to_string();
    }
    let mut out = String::with_capacity(name.len());
    let mut buf: Vec<u16> = Vec::new();
    for ch in name.chars() {
        if ch.is_ascii() && ch != '&' {
            if !buf.is_empty() {
                out.push_str(&encode_utf7_shift(&buf));
                buf.clear();
            }
            out.push(ch);
        } else {
            buf.push(ch as u16);
        }
    }
    if !buf.is_empty() {
        out.push_str(&encode_utf7_shift(&buf));
    }
    out
}

fn encode_utf7_shift(codes: &[u16]) -> String {
    // RFC 3501: shift from U+0000 to U+FFFF using big-endian 16-bit units,
    // base64-encoded with "," replaced by "/".
    let bytes: Vec<u8> = codes
        .iter()
        .flat_map(|c| c.to_be_bytes())
        .collect();
    let mut s = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &bytes);
    s = s.replace('=', "").replace('/', ",");
    format!("&{}-", s)
}

impl ImapClient {
    /// Sync a single mailbox, returning parsed messages and the highest UID seen.
    /// Caller persists `last_uid` and `uid_validity` on `accounts` row.
    /// Uses small chunks so a 4k-message mailbox completes in seconds,
    /// not 5 minutes.
    pub async fn sync(&self, mailbox_name: &str, last_uid: u32) -> Result<SyncBundle, String> {
        let mut session = self.connect().await?;
        let wire_name = encode_utf7_imap(mailbox_name);
        let mailbox = session
            .select(&wire_name)
            .await
            .map_err(|e| format!("select {mailbox_name} ({wire_name}): {e}"))?;

        let uid_validity = mailbox.uid_validity.unwrap_or(0);
        let uid_next = mailbox.uid_next;

        // UID-range fetch via UID FETCH command (RFC 3501 §6.4.8); Session::fetch is
        // sequence-based and would break after any expunge (sequence ≠ UID).
        let mut messages = Vec::new();
        let mut highest_uid = last_uid;
        let start_uid = last_uid.saturating_add(1).max(1);
        let end_uid = last_uid.saturating_add(MAX_PER_TICK);
        let range = format!("{start_uid}:{end_uid}");
        eprintln!("[imap] FETCH {range} on {mailbox_name}");
        let mut stream = session
            .uid_fetch(&range, "(FLAGS UID ENVELOPE BODY.PEEK[])")
            .await
            .map_err(|e| format!("fetch: {e}"))?;

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
            uid_next,
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
    pub uid_next: Option<u32>,
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
            new_message_ids: Vec::new(),
            error: None,
        }
    }
}

type ImapSession = Session<TlsStream<Compat<TcpStream>>>;

/// RFC 5735 TEST-NET-2 range used by Clash fake-ip/TUN mode.
fn is_fake_ip(ip: &std::net::IpAddr) -> bool {
    match ip {
        std::net::IpAddr::V4(v4) => {
            let octets = v4.octets();
            // 198.18.0.0/15
            octets[0] == 198 && octets[1] >= 18 && octets[1] <= 19
        }
        _ => false,
    }
}

/// Minimal DNS-over-HTTPS (DoH) fallback using Cloudflare's JSON API.
///
/// We avoid adding a heavy HTTP client dependency; `tokio-rustls` is already
/// pulled in by the lettre/sqlx stack, so we open one short HTTPS connection
/// to 1.1.1.1, request the A record, and parse the JSON response.
async fn doh_resolve_ipv4(hostname: &str) -> Option<String> {
    const DOH_HOST: &str = "1.1.1.1";
    const DOH_PATH: &str = "/dns-query";

    let mut root_store = rustls::RootCertStore::empty();
    let native = rustls_native_certs::load_native_certs();
    if native.certs.is_empty() {
        // If the platform cert store is empty/unreadable, fall back to webpki roots.
        root_store.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
    } else {
        for c in native.certs {
            let _ = root_store.add(c);
        }
    }

    let config = rustls::ClientConfig::builder()
        .with_root_certificates(root_store)
        .with_no_client_auth();
    let connector = std::sync::Arc::new(config);
    let connector = tokio_rustls::TlsConnector::from(connector);

    let server_name = match rustls_pki_types::ServerName::try_from(DOH_HOST) {
        Ok(n) => n,
        Err(_) => return None,
    };

    let tcp = match tokio::time::timeout(
        std::time::Duration::from_secs(5),
        tokio::net::TcpStream::connect((DOH_HOST, 443)),
    )
    .await
    {
        Ok(Ok(s)) => s,
        _ => return None,
    };

    let mut tls = match connector.connect(server_name, tcp).await {
        Ok(s) => s,
        Err(_) => return None,
    };

    let query = percent_encode(hostname);
    let request = format!(
        "GET {DOH_PATH}?name={query}&type=A HTTP/1.1\r\n\
         Host: {DOH_HOST}\r\n\
         Accept: application/dns-json\r\n\
         Connection: close\r\n\r\n"
    );
    if tokio::io::AsyncWriteExt::write_all(&mut tls, request.as_bytes())
        .await
        .is_err()
    {
        return None;
    }
    if tokio::io::AsyncWriteExt::flush(&mut tls).await.is_err() {
        return None;
    }

    let mut buf = Vec::new();
    if tokio::io::AsyncReadExt::read_to_end(&mut tls, &mut buf)
        .await
        .is_err()
    {
        return None;
    }

    let text = String::from_utf8_lossy(&buf);
    // Parse the first IPv4 address out of Cloudflare's JSON response.
    // Example: "Answer":[{"name":"x","type":1,"TTL":60,"data":"1.2.3.4"}]
    for line in text.lines() {
        if !line.contains("\"type\":1") {
            continue;
        }
        if let Some(start) = line.find("\"data\":\"") {
            let rest = &line[start + 8..];
            if let Some(end) = rest.find('"') {
                let ip = &rest[..end];
                if ip.parse::<std::net::Ipv4Addr>().is_ok() {
                    return Some(ip.to_string());
                }
            }
        }
    }
    None
}

/// Percent-encode a hostname for a query string. DNS hostnames are mostly
/// alphanumeric plus '.' and '-'; we only encode the truly unsafe characters.
fn percent_encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}
