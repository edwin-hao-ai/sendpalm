# 发送链路审计 findings (草稿)

> Auditor: superpowers Task 4 of `2026-08-11-email-html-link-audit`.
> Scope: read-only audit of the SMTP send pipeline (`services/smtp.rs`, `services/scheduled_send.rs`, `commands/mod.rs::send_message`).
> Verdict criteria: ✅ present and correct, 🟡 present but imperfect, ❌ missing.

---

## 1. `app/src-tauri/src/services/smtp.rs`

### 1.1 `lettre` 构造 (`SmtpTransport::relay` / `builder`)

✅ Uses `lettre`'s `AsyncSmtpTransport<Tokio1Executor>` built via `relay` (implicit-TLS) or `starttls_relay` (opportunistic TLS), per-account configured.

Evidence:
- `app/src-tauri/Cargo.toml:34` — `lettre = { version = "0.11", default-features = false, features = ["tokio1-rustls-tls", "ring", "rustls-native-certs", "builder", "smtp-transport"] }` (rustls TLS provider enabled, `builder` feature on for the message DSL, `smtp-transport` for the SMTP wire protocol).
- `app/src-tauri/src/services/smtp.rs:5-9` — imports:
  ```rust
  use lettre::{
      message::{header::ContentType, Attachment, Mailbox, MultiPart, SinglePart},
      transport::smtp::authentication::Credentials,
      AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor,
  };
  ```
- `app/src-tauri/src/services/smtp.rs:22-26` — handle is `Arc<Mutex<Option<AsyncSmtpTransport<Tokio1Executor>>>>` so the transport is cached per-account.
- `app/src-tauri/src/services/smtp.rs:147-166` — `transport()`:
  ```rust
  async fn transport(&self) -> Result<AsyncSmtpTransport<Tokio1Executor>, String> {
      ...
      let creds = Credentials::new(self.creds.email.clone(), self.creds.password.clone());
      let builder = if self.creds.smtp_implicit_tls {
          AsyncSmtpTransport::<Tokio1Executor>::relay(&self.creds.smtp_host)
              .map_err(|e| format!("smtp relay: {e}"))?
      } else {
          AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&self.creds.smtp_host)
              .map_err(|e| format!("smtp starttls relay: {e}"))?
      };
      let t: AsyncSmtpTransport<Tokio1Executor> = builder
          .port(self.creds.smtp_port)
          .credentials(creds)
          .build();
      *guard = Some(t.clone());
      Ok(t)
  }
  ```
- `app/src-tauri/src/services/providers.rs:103-141` — every provider preset sets `smtp_port = 465` and `smtp_implicit_tls = true` for the implicit-TLS path; the conditional still allows STARTTLS via `starttls_relay` when the field is false.
- `app/src-tauri/src/services/smtp.rs:80-84` — actual send dispatch:
  ```rust
  transport.send(message).await.map(|_| message_id).map_err(|e| format!("smtp send: {e}"))
  ```

### 1.2 编码 (`MIME` / `MultiPart` / `MessageBuilder`)

✅ All three: `MultiPart::alternative` (text+html), `MultiPart::mixed` (with attachments), and `Message::builder()` (headers) are constructed and the message is finalised with `.multipart(...)`.

Evidence:
- `app/src-tauri/src/services/smtp.rs:118-137` — header construction:
  ```rust
  let mut builder = Message::builder()
      .from(from.clone())
      .subject(subject)
      .message_id(Some(message_id.to_owned()));
  if let Some(rt) = reply_to { builder = builder.reply_to(rt.clone()); }
  for mb in to  { builder = builder.to(mb.clone()); }
  for mb in cc  { builder = builder.cc(mb.clone()); }
  for mb in bcc { builder = builder.bcc(mb.clone()); }
  builder.multipart(multipart).map_err(|e| format!("build: {e}"))
  ```
- `app/src-tauri/src/services/smtp.rs:100-104` — body:
  ```rust
  let mut body_part =
      MultiPart::alternative().singlepart(SinglePart::plain(body.to_string()));
  if let Some(html) = html_body {
      body_part = body_part.singlepart(SinglePart::html(html));
  }
  ```
- `app/src-tauri/src/services/smtp.rs:105-116` — attachments wrap the alternative in `MultiPart::mixed`:
  ```rust
  let multipart = if attachments.is_empty() {
      body_part
  } else {
      let mut mixed = MultiPart::mixed().multipart(body_part);
      for att in attachments {
          let ct = ContentType::parse(&att.mime).map_err(|e| format!("bad mime {}: {e}", att.mime))?;
          let part = Attachment::new(att.filename).body(att.bytes, ct);
          mixed = mixed.singlepart(part);
      }
      mixed
  };
  ```
- `app/src-tauri/src/services/smtp.rs:58` — pre-built `Message-ID: <sendpalm-{uuid}@sendpalm>` is set with `.message_id(Some(...))` (line 121).
- `app/src-tauri/src/services/smtp.rs:54-64` — From / Reply-To parsed via `lettre::message::Mailbox`; bad addresses fail early with descriptive errors before the wire.

Test coverage proves the shape of the output:
- `smtp.rs:188-209` `builds_plain_message_without_attachments` — asserts `multipart/alternative` and absence of `multipart/mixed`.
- `smtp.rs:211-240` `builds_multipart_mixed_with_attachment` — asserts `multipart/mixed`, `Content-Disposition: attachment`, `filename="note.txt"`, `Cc: e@f.com`.
- `smtp.rs:242-266` `builds_html_alternative_when_html_body_supplied` — asserts both `text/plain` and `text/html` parts and that HTML body bytes appear verbatim.

### 1.3 TLS (`rustls` / `starttls` / `tls`)

✅ TLS path uses rustls for both implicit (port 465) and STARTTLS (port 587) modes — matches AGENTS §10.5 "SmtpTransport::relay over rustls for SMTP".

Evidence:
- `app/src-tauri/Cargo.toml:34` — `lettre = { ..., features = ["tokio1-rustls-tls", "ring", "rustls-native-certs", ...] }` (rustls TLS provider, ring crypto, OS certs).
- `app/src-tauri/src/services/smtp.rs:153-159` — branch on `smtp_implicit_tls`:
  - `true` → `AsyncSmtpTransport::<Tokio1Executor>::relay(&host)` (implicit TLS from the first byte, i.e. port 465).
  - `false` → `AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&host)` (plaintext connection, then `STARTTLS` upgrade using the same rustls stack).
- `app/src-tauri/src/services/providers.rs:103-141` — every provider preset ships with `smtp_port: 465, smtp_implicit_tls: true`, so the implicit-TLS branch is the default. STARTTLS path is wired and reachable when a provider opts in.
- `app/src-tauri/src/services/smtp.rs:160-163` — finalisation: `.port(self.creds.smtp_port).credentials(creds).build()`. No `dangerous_skip_tls` / `tls.for_test_only` overrides; CA validation is left to lettre's defaults, which use the OS native cert store via `rustls-native-certs`.

Caveat: no `let start` min-TLS-version override is set; if a server demanded TLS 1.3 the connection would still negotiate whatever rustls ships with by default. This is correct default behavior, not a defect.

### 1.4 鉴权失败传播 (`SmtpError` / `?` 传播)

✅ All auth/relay/send errors are mapped to descriptive `String` and propagated via `?` (or returned as `Err` from the public API).

Evidence (8 distinct error sites in `smtp.rs`):
- `smtp.rs:54` — `from.parse().map_err(|e| format!("bad from: {e}"))?`
- `smtp.rs:55` — `Self::parse_recipients(to).map_err(|e| format!("bad to: {e}"))?`
- `smtp.rs:56` — `Self::parse_recipients(cc).map_err(|e| format!("bad cc: {e}"))?`
- `smtp.rs:57` — `Self::parse_recipients(bcc).map_err(|e| format!("bad bcc: {e}"))?`
- `smtp.rs:63-64` — `reply_to.parse().map_err(|e| format!("bad reply-to: {e}"))?`
- `smtp.rs:111` — `ContentType::parse(&att.mime).map_err(|e| format!("bad mime {}: {e}", att.mime))?`
- `smtp.rs:136` — `builder.multipart(multipart).map_err(|e| format!("build: {e}"))?`
- `smtp.rs:155` — `relay(...).map_err(|e| format!("smtp relay: {e}"))?` (only on the `smtp_implicit_tls = true` branch; mirrors `starttls_relay` on line 158).
- `smtp.rs:158` — `starttls_relay(...).map_err(|e| format!("smtp starttls relay: {e}"))?`
- `smtp.rs:84` — `transport.send(message).await.map_err(|e| format!("smtp send: {e}"))?` — this is the primary auth-failure propagation site; lettre's `SmtpError` (response code 535, etc.) is rendered as `format!("smtp send: {e}")` and bubbles up to the Tauri command as `Err(String)`.

🟡 Minor: auth/relay/send errors are mapped to `String` via `format!("...: {e}")`, which discards structure (no `SmtpError` type for the caller to switch on). Acceptable for a Tauri command surface (returns `Result<_, String>` to JS), but means JS callers can't distinguish "auth failed" from "DNS failed" from "TLS failed" without parsing the message.

---

## 2. `app/src-tauri/src/services/scheduled_send.rs`

### 2.1 触发逻辑 (tokio interval / sleep loop)

✅ Uses `tokio::time::sleep` inside a `loop { ... }` with a `Duration::from_secs(60)` interval. Spawned via `tauri::async_runtime::spawn` at app boot.

Evidence:
- `app/src-tauri/src/services/scheduled_send.rs:16` — `const POLL_INTERVAL: Duration = Duration::from_secs(60);`
- `app/src-tauri/src/services/scheduled_send.rs:19-25` — `start()`:
  ```rust
  pub fn start(app: AppHandle) {
      spawn(async move {
          if let Err(e) = run_loop(app).await {
              eprintln!("[scheduled-send] background loop crashed: {e}");
          }
      });
  }
  ```
- `app/src-tauri/src/services/scheduled_send.rs:27-36` — `run_loop`:
  ```rust
  async fn run_loop(app: AppHandle) -> Result<(), String> {
      let pool = open_pool().await?;
      loop {
          if let Err(e) = tick(&app, &pool).await {
              eprintln!("[scheduled-send] tick failed: {e}");
          }
          tokio::time::sleep(POLL_INTERVAL).await;
      }
  }
  ```
- `app/src-tauri/src/services/scheduled_send.rs:38-58` — `tick()`:
  ```rust
  let now = chrono::Utc::now().to_rfc3339();
  let rows = sqlx::query_as::<_, (String, String, String, String)>(
      "SELECT id, draft_id, account_id, scheduled_at FROM scheduled_sends \
       WHERE status = 'scheduled' AND scheduled_at <= $1 ORDER BY scheduled_at ASC")
      .bind(&now).fetch_all(pool).await
      .map_err(|e| format!("load scheduled sends: {e}"))?;
  ```
- `app/src-tauri/src/lib.rs:127` — started from app boot: `services::scheduled_send::start(app.handle().clone());`.

🟡 Minor: the loop sleeps **after** every tick, even if a tick took > 60 s. There is no catch-up delay. A long-running dispatch that exceeds 60 s causes the next tick to start immediately after the sleep. For IMAP-over-mobile scenarios this is fine; the simpler pattern is intentional.

### 2.2 错误落 audit (搜 `audit` / `eprintln!` / `log::error!`)

🟡 Errors are logged to **stderr via `eprintln!`** but **not** written to an `audit` table, log file, or any persisted sink.

Evidence (4 distinct error sites in `scheduled_send.rs`):
- `scheduled_send.rs:22` — `eprintln!("[scheduled-send] background loop crashed: {e}");` (in `start`, fires when `run_loop` itself errors — e.g. on initial `open_pool` failure).
- `scheduled_send.rs:32` — `eprintln!("[scheduled-send] tick failed: {e}");` (in `run_loop`, per-tick failure of `SELECT scheduled_sends`).
- `scheduled_send.rs:51` — `eprintln!("[scheduled-send] failed to dispatch {}: {}", id, e);` (in `tick`, per-dispatch failure — the row is **left as `'scheduled'`** so the next tick can retry).
- `scheduled_send.rs:143-146` — `eprintln!("[scheduled-send] dispatched draft {} via account {}", draft_id, account_id);` (success log).

Searches:
- `grep "audit" scheduled_send.rs` → 0 matches.
- `grep "log::error\|tracing::error" scheduled_send.rs` → 0 matches.
- `grep "eprintln" scheduled_send.rs` → 4 matches (all 4 sites above).

Caveats:
1. **No retry counter / `failed` status.** The comment on `scheduled_send.rs:52-53` acknowledges this:
   ```rust
   // Leave the row as 'scheduled' so the next tick can retry.
   // In the future we may want a retry counter / 'failed' status.
   ```
   A permanently-bad draft (e.g. credentials revoked) will be retried every 60 s forever, generating a stderr line every minute.
2. **No persisted audit log.** Failed dispatches only show up in stderr, which is not retained in release builds. No `agent_audit` / `send_audit` row is written, so the frontend has no way to surface "this scheduled message failed 17 times" to the user.
3. **Success log is noisy at scale.** Every successful dispatch emits an eprintln; for users with many scheduled sends this floods stderr.

---

## 3. `app/src-tauri/src/commands/mod.rs::send_message`

Located at `app/src-tauri/src/commands/mod.rs:84-218` (the brief asked for `commands/send_message.rs` or the equivalent in `commands/mod.rs`; the latter applies here).

### 3.1 形参名 (与 `#[tauri::command]` 一致)

✅ Parameter names match the JS caller in `app/src/services/backend.ts:55-80`.

Evidence (Rust side — `commands/mod.rs:84-95`):
```rust
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn send_message(
    app: AppHandle,
    to: String,
    subject: String,
    body: String,
    html_body: Option<String>,
    account_id: Option<String>,
    attachments: Vec<OutgoingAttachmentDto>,
    cc: Option<String>,
    bcc: Option<String>,
    from_override: Option<String>,
) -> Result<SendResult, String>
```

Evidence (JS side — `app/src/services/backend.ts:55-80`):
```ts
return safeInvoke<{ message_id: string; local_message_id?: string }>(
  "send_message",
  {
    to, subject, body,
    html_body: htmlBody,
    account_id: accountId,
    attachments, cc, bcc,
    from_override: fromOverride,
  },
);
```

Parameter-name match: `to, subject, body, html_body, account_id, attachments, cc, bcc, from_override` — exact match (snake_case on both sides). This avoids the AGENTS §11 "frontend shim returns null for unknown commands" silent-breakage trap.

Tauri 2 maps JS camelCase→Rust snake_case by default for command argument names; the explicit snake_case keys above are belt-and-suspenders but correct.

Note: `app: AppHandle` is auto-injected by Tauri (not in the JS payload). `OutgoingAttachmentDto` (commands/mod.rs:74-80) is `{ filename, mime, data_base64 }`; the JS side sends `attachments: OutgoingAttachment[]` (the TS type), which serializes to the same three fields.

### 3.2 错误传播

✅ All upstream errors from credential lookup, settings load, address parsing, base64 decode, and SMTP send are propagated via `?`. One non-fatal sink (the local Sent copy) deliberately swallows errors with `.ok()`.

Evidence (propagation sites in `send_message`, `commands/mod.rs:84-218`):
- `commands/mod.rs:100` — `let creds = crate::services::sync_loop::resolve_account_credentials(id).await?;`
- `commands/mod.rs:102` — `let settings = crate::services::sync_loop::load_account_settings_json(id).await?;`
- `commands/mod.rs:108` — `let creds = get_creds().await?;` (test-credentials fallback)
- `commands/mod.rs:117` — `crate::services::sync_loop::build_from_mailbox(&account_email, &alias)?;` (From alias parse)
- `commands/mod.rs:121-122` — `crate::services::sync_loop::build_from_mailbox(&account_email, &outgoing_settings.default_from_name)?;`
- `commands/mod.rs:162` — `Engine::decode(...).map_err(|e| format!("decode attachment {}: {e}", a.filename))?;`
- `commands/mod.rs:174-185` — `let id = smtp.send(&from, &to_addrs, &cc_addrs, &bcc_addrs, Some(&outgoing_settings.reply_to), &subject, &body, html_body, attachments).await?;` (SMTP send, including auth failure from `smtp.rs:84`)

🟡 The local Sent-copy path is intentionally non-fatal (`commands/mod.rs:189-212`):
```rust
let local_message_id = if let Some(to_email) = to_addrs.first() {
    if let Ok(pool) = crate::services::sync_loop::open_pool().await {
        if let Ok(data_dir) = app.path().app_data_dir() {
            let account_id = account_id.unwrap_or_default();
            crate::services::sync_loop::save_sent_message(
                &pool, &data_dir, &account_id, to_email,
                &subject, &body, &attachments_for_sent,
            )
            .await
            .ok()
        } else { None }
    } else { None }
} else { None };
```
- The `open_pool` and `app_data_dir` results are converted via `.ok()`, so a missing SQLite pool or app data dir silently returns `None` for `local_message_id`.
- The `save_sent_message` call itself is also `.ok()`-swallowed.
- This is a deliberate "send must not fail because we can't write a local copy" design, but it means **a user can get `message_id` back while the Sent folder is silently empty**; the only signal is a missing `local_message_id` in the response.

Tauri 2 returns `Err(String)` to the JS layer as a rejected promise (the `safeInvoke` shim in `backend.ts:17` returns `null` on error per AGENTS §11 lesson). Since the failure strings from `smtp.rs` are descriptive (`"smtp send: ..."`, `"smtp relay: ..."`, `"bad from: ..."`), the JS caller can at least surface the message verbatim.

---

## Summary table

| Area | Checks | ✅ | 🟡 | ❌ |
|---|---|---|---|---|
| `smtp.rs` | 4 (lettre, MIME/MultiPart/Builder, TLS rustls, auth propagation) | 4 | 1 (overlap: SmtpError is collapsed to String — acceptable) | 0 |
| `scheduled_send.rs` | 2 (trigger logic, error to audit) | 1 (tokio sleep loop) | 1 (errors only to stderr, no persisted audit / no retry counter) | 0 |
| `commands/mod.rs::send_message` | 2 (param names, error propagation) | 2 (param-name match with JS, `?` propagation for all upstream) | 1 (overlap: local Sent copy silently swallowed via `.ok()`) | 0 |

**Top issues found (ranked):**

1. **`scheduled_send.rs:50-54` has no retry counter and no persisted failure log.** A permanently-bad scheduled draft (e.g. revoked credentials) is retried every 60 s forever, with only a stderr line per attempt. A `failed` status column and a per-draft `attempts` / `last_error` column would let the UI surface "this schedule failed N times" and stop retrying after a threshold.
2. **`scheduled_send.rs:22,32,51,143` only writes to `stderr`.** No `audit` table, no log file, no `tracing`/`log` framework. Release builds discard stderr; the user has no way to discover a failed scheduled send.
3. **`commands/mod.rs:189-212` silently swallows Sent-copy failures.** The Tauri command returns `Ok(SendResult { message_id, local_message_id: None })` when `save_sent_message` fails, so the UI can't distinguish "SMTP succeeded, local Sent folder written" from "SMTP succeeded, local Sent folder missing because the DB write failed". The local-copy failure is at most visible as a missing row in the recipient's contact timeline.
4. **`smtp.rs:54-84, 111, 136, 155, 158` flatten every error to `String`.** JS callers can read the message but cannot branch on the type. Acceptable for a `Result<_, String>` Tauri surface, but if a "retry" or "ask for app password" UX is wanted, a structured `SendError` enum would help.
5. **No retry/backoff on transient SMTP failures.** A 4xx response (e.g. mailbox-full, rate-limit) is surfaced to the user immediately; a 60 s scheduled retry exists only for scheduled sends (`scheduled_send.rs:50-54`).

**No ❌ findings.** The pipeline is wired end-to-end and the AGENTS §10.5 spec (rustls SMTP, multi-account, scheduled-send, .env-loaded credentials) is implemented. The gaps are around **observability** (no audit table, no retry counter) rather than correctness.
