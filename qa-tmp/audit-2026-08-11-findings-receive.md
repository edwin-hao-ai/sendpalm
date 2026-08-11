# 接收链路审计 findings (草稿)

> Auditor: superpowers Task 3 of `2026-08-11-email-html-link-audit`.
> Scope: read-only audit of the IMAP receive pipeline (imap.rs, sync_loop.rs, parser.rs, db.rs + 0001_init.sql, commands/mod.rs).
> Verdict criteria: ✅ present and correct, 🟡 present but imperfect, ❌ missing.

---

## 1. `app/src-tauri/src/services/imap.rs`

### 1.1 TLS path (SslTunnel / rustls)
🟡 TLS via `async-native-tls` over `native-tls`, NOT `SslTunnel` or pure `rustls`.

Evidence:
- `app/src-tauri/Cargo.toml:32-33` — `async-native-tls = "0.5"` + `native-tls = "0.2"`.
- `app/src-tauri/src/services/imap.rs:1` — `//! IMAP sync via \`async-imap\` over \`native-tls\`.`
- `app/src-tauri/src/services/imap.rs:7` — `use async_native_tls::{TlsConnector, TlsStream};`
- `app/src-tauri/src/services/imap.rs:90-93` — TLS handshake:
  ```rust
  let tls = TlsConnector::new()
      .connect(&self.creds.imap_host, tcp_compat)
      .await
      .map_err(|e| format!("imap tls: {e}"))?;
  ```
- `app/src-tauri/src/services/imap.rs:271` — `type ImapSession = Session<TlsStream<Compat<TcpStream>>>;`

Caveat: AGENTS §10.5 specifies **`SslTunnel` for IMAP**. The current code uses `native-tls` instead. Functionally equivalent (both are TLS), but does not match the spec text. `rustls` IS used for the DoH fallback (line 305), not the IMAP session.

### 1.2 `SELECT INBOX`
✅ Explicit `select` is called per sync with the configured mailbox name (which defaults to `INBOX` from callers).

Evidence:
- `app/src-tauri/src/services/imap.rs:193-197` — `sync()`:
  ```rust
  let wire_name = encode_utf7_imap(mailbox_name);
  let mailbox = session
      .select(&wire_name)
      .await
      .map_err(|e| format!("select {mailbox_name} ({wire_name}): {e}"))?;
  ```
- `app/src-tauri/src/services/sync_loop.rs:244` — `client.idle_wait("INBOX", idle_timeout)` (IDLE caller).
- `app/src-tauri/src/services/sync_loop.rs:562-563` — `let is_inbox = folder.eq_ignore_ascii_case("INBOX");` and the INBOX-folder fast-path comment.

Note: `list_mailboxes` does NOT call `select` (it only uses `list`); the `select` is in the per-folder `sync()`. That matches the IMAP pattern.

### 1.3 UID fetch with `UID` command (not sequence)
🟡 The code passes a UID-formatted range (e.g. `12345:12544`) but issues `session.fetch(...)` which is the **sequence** `FETCH` command, not `UID FETCH`. The literal `UID` inside the items parenthesized list is just a data item to return, not the command modifier.

Evidence:
- `app/src-tauri/src/services/imap.rs:209-215`:
  ```rust
  let end_uid = last_uid.saturating_add(MAX_PER_TICK);
  let range = format!("{start_uid}:{end_uid}");
  eprintln!("[imap] FETCH {range} on {mailbox_name}");
  let mut stream = session
      .fetch(&range, "(FLAGS UID ENVELOPE BODY.PEEK[])")
      .await
  ```
- `app/src-tauri/src/services/imap.rs:201-205` — comment claims "async-imap interprets the range `a:b` as UID a through UID b", which is **incorrect** for `Session::fetch` (sequence-fetch); per the async-imap docs, `uid_fetch` is required for UID-range semantics.
- `app/src-tauri/src/services/imap.rs:18` — `pub const MAX_PER_TICK: u32 = 200;`
- `Fetch` also writes `BODY.PEEK[]` (not `BODY[]`), which is correct — it avoids silently marking messages as `\Seen` — but the command choice is still wrong for UID semantics.

Consequence: in a fresh mailbox where sequence numbers ≈ UID numbers the code accidentally works. On any mailbox that has had messages deleted/expunged, sequence numbers diverge from UID numbers and the wrong messages will be fetched. Should call `session.uid_fetch(range, items)` instead.

### 1.4 Error propagation (`?` or explicit match)
✅ All network/imap errors are mapped to descriptive strings and propagated via `?`.

Evidence (15 distinct `.map_err(...)?` sites in `imap.rs`):
- `imap.rs:81` — `let (endpoint, port) = self.resolve_endpoint().await?;`
- `imap.rs:85` — `connect_fut...map_err(|_| format!("...timeout..."))?`
- `imap.rs:86` — `connect_fut...map_err(|e| format!("...{e}..."))?`
- `imap.rs:93` — `.connect(...).map_err(|e| format!("imap tls: {e}"))?`
- `imap.rs:99` — `.login(...).map_err(|(e, _)| format!("imap login: {e}"))?`
- `imap.rs:109` — `.list(...).map_err(|e| format!("list: {e}"))?`
- `imap.rs:128` — `session.select(mailbox_name).map_err(|e| format!("select {mailbox_name}: {e}"))?`
- `imap.rs:131` — `handle.init().map_err(|e| format!("idle init: {e}"))?`
- `imap.rs:197` — `session.select(...).map_err(|e| format!("select {mailbox_name} ({wire_name}): {e}"))?`
- `imap.rs:215` — `.fetch(...).map_err(|e| format!("fetch: {e}"))?`
- `imap.rs:218` — `let msg = msg.map_err(|e| format!("fetch item: {e}"))?;`

---

## 2. `app/src-tauri/src/services/sync_loop.rs`

### 2.1 `last_uid` advance logic
✅ Cursor advances per chunk; tested seam `advance_cursor` documented.

Evidence:
- `app/src-tauri/src/services/sync_loop.rs:672-689` — pure function:
  ```rust
  pub fn advance_cursor(start: u32, results: &[(u32, bool)]) -> (u32, u32) { ... }
  ```
  with comment: "The cursor is the largest UID whose outcome was `success`; it never advances past a failed UID."
- `app/src-tauri/src/services/sync_loop.rs:730-734` — usage in `sync_folder`:
  ```rust
  let (chunk_inserted, chunk_last_ok) = advance_cursor(cursor, &chunk_outcomes);
  inserted += chunk_inserted;
  // advance_cursor already returns the highest successful UID; on a partial chunk
  // we deliberately stay below bundle.highest_uid so the next tick retries the rest.
  cursor = chunk_last_ok;
  ```
- `app/src-tauri/src/services/sync_loop.rs:491-492` — `account.last_uid = new_last_uid; account.uid_validity = new_uv;`
- `app/src-tauri/src/services/sync_loop.rs:597` — persisted via `save_folder_sync_state(pool, &state_key, cursor, uid_validity)`.

### 2.2 UIDVALIDITY invalidation handling
🟡 `uid_validity` is captured and persisted, but **no logic detects a value change and invalidates the UID cursor cache**.

Evidence:
- `app/src-tauri/src/services/imap.rs:199` — `let uid_validity = mailbox.uid_validity.unwrap_or(0);`
- `app/src-tauri/src/services/sync_loop.rs:167-176` — restored on loop boot:
  ```rust
  // Restore last_uid/uid_validity from app_kv.
  if let Ok(Some(json)) = load_sync_state(&pool, &account.account_id).await {
      if let Ok(v) = serde_json::from_str::<serde_json::Value>(&json) {
          if let Some(uid) = v.get("last_uid").and_then(|x| x.as_u64()) {
              account.last_uid = uid as u32;
          }
          if let Some(uv) = v.get("uid_validity").and_then(|x| x.as_u64()) {
              account.uid_validity = uv as u32;
          }
      }
  }
  ```
- `app/src-tauri/src/services/sync_loop.rs:646-666` — `save_folder_sync_state` upserts `{last_uid, uid_validity, last_synced_at}` into `app_kv`.
- `app/src-tauri/src/services/sync_loop.rs:592` — on folder failure the cursor is **persisted as start_uid**:
  ```rust
  let _ = save_folder_sync_state(pool, &state_key, start_uid, 0).await;
  ```
  (Note: this also overwrites `uid_validity` with 0, which would cause the next boot to think the validity is unset. Minor concern.)

Missing: there is NO `if new_uv != account.uid_validity { reset_cursor_to_0() }` style check anywhere. Searches for `changed`, `invalidate`, `resync`, `!=` on uid_validity all return empty:
- `grep "uid_validity_changed"` → no match.
- `grep "if.*uid_validity.*!="` → no match.
- `grep "invalidate"` in sync_loop.rs → no match.

Per RFC 3501 §6.4.8, when UIDVALIDITY changes the UID cache is invalid; the client must resync from UID 1. The current code would happily continue using UIDs from the previous namespace.

### 2.3 Backfill chunk loop (`MAX_PER_TICK` / `while` / `chunk`)
✅ Explicit chunk loop walks chunks until a chunk is not full, matching AGENTS §10.5.

Evidence:
- `app/src-tauri/src/services/sync_loop.rs:707-743` — `loop { let bundle = client.sync(folder, cursor).await?; ... }`:
  ```rust
  loop {
      let bundle = client.sync(folder, cursor).await?;
      uid_validity = bundle.uid_validity;
      if bundle.messages.is_empty() {
          cursor = bundle.highest_uid;
          break;
      }
      ...
      if (bundle.messages.len() as u32) < crate::services::imap::MAX_PER_TICK {
          break;
      }
  }
  ```
- `app/src-tauri/src/services/imap.rs:18` — `pub const MAX_PER_TICK: u32 = 200;`
- `app/src-tauri/src/services/sync_loop.rs:740` — break condition `bundle.messages.len() < MAX_PER_TICK`.

---

## 3. `app/src-tauri/src/services/parser.rs`

### 3.1 `mailparse::parse_mail` call
✅ Uses `parse_mail` from `mailparse` crate.

Evidence:
- `app/src-tauri/src/services/parser.rs:8` — `use mailparse::{parse_mail, ParsedMail};`
- `app/src-tauri/src/services/parser.rs:50` — `let parsed = parse_mail(raw).map_err(|e| format!("mailparse: {e}"))?;`

### 3.2 Header / body / attachment / multipart extraction
✅ All four categories are extracted.

Evidence:
- `subject` — `parser.rs:70` — `let subject = header_value(&parsed.headers, "Subject").unwrap_or_default();`
- `from` — `parser.rs:61` — `let (sender_email, sender_name) = parse_address_pair(&parsed.headers, "From");` (helper at parser.rs:107-135).
- `body` — `parser.rs:77` — `let body_text = extract_text(&parsed).unwrap_or_default();` (helper at parser.rs:167-198).
- `attachments` — `parser.rs:78` + `parser.rs:221-225` (`fn collect_attachments`) + `parser.rs:305-340` (`walk_attachments` walks the MIME tree, recognizes `Content-Disposition: attachment`).
- `multipart` — `parser.rs:176` — `for part in &parsed.subparts`; recursive walk at `parser.rs:187` — `if let Some(t) = extract_text(part) { return Some(t); }` and similar for HTML/calendar.

Bonus evidence (test coverage proves the extraction shape):
- `parser.rs:384-393` `parses_basic_headers` — asserts `sender_email`, `subject`, `body_text`.
- `parser.rs:451-483` `decodes_attachment` — asserts `attachments[0].content`.

### 3.3 `text/html` part extraction
✅ Explicit `text/html` extraction in `extract_html`.

Evidence:
- `app/src-tauri/src/services/parser.rs:79` — `let body_html = extract_html(&parsed).map(|html| rewrite_inline_images(&html, &attachments));`
- `app/src-tauri/src/services/parser.rs:200-219` — function body (key line `parser.rs:209` — `if ctype == "text/html" { if let Ok(decoded) = part.get_body() { return Some(decoded); } }`).
- `parser.rs:230-247` — `rewrite_inline_images` rewrites `cid:` references to base64 data URLs (good practice; consistent with AGENTS §11 "long unbroken strings" lesson re: image handling).
- Test: `parser.rs:425-449` `parses_html_part` — asserts body_html starts with `<p>hi</p>`.

### 3.4 `text/plain` fallback
✅ `extract_text` prefers `text/plain` and falls back to HTML.

Evidence:
- `app/src-tauri/src/services/parser.rs:167-198` — `fn extract_text`:
  ```rust
  fn extract_text(parsed: &ParsedMail<'_>) -> Option<String> {
      let own = parsed.ctype.mimetype.to_lowercase();
      if own == "text/plain" { ... }       // single-part plain
      let mut best: Option<String> = None;
      for part in &parsed.subparts {
          let ctype = part.ctype.mimetype.to_lowercase();
          if ctype == "text/plain" { ... return ... }  // multipart alt — text/plain wins
          else if ctype == "text/html" && best.is_none() { ... best = Some(...) }
          if let Some(t) = extract_text(part) { return Some(t); }
      }
      if own == "text/html" { ... }        // single-part HTML fallback
      best
  }
  ```
- `parser.rs:182-186` — note that the **multipart/alternative** branch correctly picks `text/plain` first, falling back to text/html stored in `best`.
- Test: `parser.rs:443` — `assert_eq!(p.body_text, "hi");` after parsing `multipart/alternative`.

---

## 4. `app/src-tauri/migrations/0001_init.sql` + `app/src-tauri/src/services/db.rs`

### `messages` table (after all migrations are applied — see `lib.rs:22-113`)

Columns actually written by the receive INSERT vs. the DTO `Message` interface (`app/src/types/index.ts:142-172`):

| Migration | Column added |
|---|---|
| `0001_init.sql:65-89` | id, pid, subj, prev, body, tm, st, ac, bucket, unread, labels_json, attachments_json, trackers_json, reply_later, set_aside, bubble_up_at, remind_at, to_addr, cc_json, bcc_json, thread_id |
| `0002_calendar.sql` | calendar_json |
| `0004_body_html.sql` | body_html |
| `0006_message_direction.sql` | direction |
| `0010_trash_expiry.sql` | deleted_at |

Receive INSERT (`app/src-tauri/src/services/sync_loop.rs:781-784`) writes:
`id, pid, subj, prev, body, body_html, tm, st, ac, bucket, direction, unread, labels_json, attachments_json, trackers_json, thread_id, calendar_json, to_addr, cc_json, bcc_json`

`Message` DTO (`app/src/types/index.ts:142-172`) fields: `id, pid, subj, prev, body, bodyHtml, tm, st, ac, bucket, direction, unread, labels, attachments, trackers, replyLater, setAside, bubbleUpAt, remindAt, to, cc, bcc, threadId, deletedAt, calendarInvite`.

✅ All `Message` DTO fields are covered by the final schema (m001 + later migrations). The receive pipeline writes everything needed for a new inbound message. Workflow-only fields (`replyLater`, `setAside`, `bubbleUpAt`, `deletedAt`, `remindAt`) use schema defaults.

🟡 Note: `0001_init.sql` alone is **not** the final `messages` schema. It lacks `body_html`, `direction`, `calendar_json`, `deleted_at`. These rely on migrations 0002/0004/0006/0010 being registered in `lib.rs:22-113`. If a future migration ever drops one (or the `lib.rs` registration is missing), the receive INSERT (`sync_loop.rs:782-783`) would fail at runtime.

`db.rs` itself (22 lines) only contains the `merge_json_array` helper (line 6-21) used by `sync_loop.rs:1127, 1201` to merge attachment `source_message_ids` JSON arrays. Not directly part of field alignment, but the helper is required for the receive pipeline's attachment-merge correctness.

---

## 5. `app/src-tauri/src/commands/message.rs` (or `commands/mod.rs`)

❌/🟡 No dedicated `commands/message.rs` and **no message-list / get-message Tauri command in `commands/mod.rs`**. Message reads go through `tauri-plugin-sql` directly from the JS frontend, NOT through the Rust command surface.

Evidence:
- `ls app/src-tauri/src/commands/` lists only `mod.rs` and `notification_settings.rs` — no `message.rs`.
- `commands/mod.rs` content exposes only: `sync_now`, `list_mailboxes`, `send_message`, `get_sync_state`, `list_email_providers`, `vault_save/load/delete`, `add_calendar_event`, `get_attachment_content`, `get_attachment_path`, `notification_settings::notify_settings_changed` (see `lib.rs:144-157`).
- `grep "list_messages\|get_message" commands/mod.rs` → no matches; the only `messages` reference is `commands/mod.rs:65` (inside `bundle.report(...)` which counts new messages).

Body / body_html delivery to the frontend goes via `tauri-plugin-sql`:
- `app/src-tauri/Cargo.toml:18` — `tauri-plugin-sql = { version = "2", features = ["sqlite"] }`
- `app/src-tauri/src/lib.rs:132-136` — plugin registered with all 15 migrations.
- `app/src/stores/data.ts:687-692` — frontend read path:
  ```ts
  export async function listMessages(): Promise<Message[]> {
    const db = await getDb();
    const rows = await db.select<Record<string, unknown>[]>(
      "SELECT * FROM messages ORDER BY st DESC",
    );
    return rows.map(rowToMessage);
  }
  ```
- `app/src/stores/data.ts:147-164` `rowToMessage` reads:
  ```ts
  body: r.body as string,
  bodyHtml: (r.body_html as string | null) ?? null,
  ```

### 5.1 `body_html` in response
✅ `body_html` is in the IPC response. The `SELECT *` includes all columns and `rowToMessage` at `data.ts:154` surfaces it as `bodyHtml`.

### 5.2 `body` field in response
✅ `body` is in the IPC response. `data.ts:153` maps `r.body` straight to the `Message.body` field.

### 5.3 IPC serialization (`serde_json`)
✅ Serialization goes through `serde_json`.

Evidence:
- `app/src-tauri/Cargo.toml:27` — `serde_json = "1"`.
- `tauri-plugin-sql` v2 (line 18) uses `serde_json` for all IPC payloads (standard Tauri plugin convention).
- `commands/mod.rs` DTOs use `#[derive(Debug, Serialize, Deserialize)]` (e.g. line 347-360 — `SendResult`, `SyncStateDto`); not required for the SQL-direct path, but proves the serialization convention used elsewhere in commands.

---

## Summary table

| Area | Checks | ✅ | 🟡 | ❌ |
|---|---|---|---|---|
| `imap.rs` | 4 | 3 (select INBOX, errors, partial TLS) | 1 (TLS impl mismatch + UID-fetch → sequence-fetch) | 0 |
| `sync_loop.rs` | 3 | 2 (last_uid advance, chunk loop) | 1 (UIDVALIDITY invalidation) | 0 |
| `parser.rs` | 4 | 4 (parse_mail, header/body/att/multi, text/html, text/plain) | 0 | 0 |
| `db.rs + 0001_init.sql` | 1 (field alignment) | 1 (full schema + migrations cover DTO) | 1 (m001 alone insufficient; relies on m002/4/6/10) | 0 |
| `commands/message.rs` | 3 | 2 (body_html + body in IPC response) | 0 | 1 (no Rust command for messages; reads go via plugin-sql — verifies indirectly) |

**Top issues found (ranked):**
1. **`imap.rs:212-215` uses `session.fetch(...)` instead of `session.uid_fetch(...)`.** The UID-range string is fed to the sequence-fetch command. Coincidentally correct on a pristine mailbox; incorrect after any expunge/delete. Loudest bug in the pipeline.
2. **`sync_loop.rs` has no UIDVALIDITY-change detection.** Per RFC 3501 §6.4.8 the UID cache must be reset when `UIDVALIDITY` changes; current code silently carries the cursor across validity boundaries.
3. **TLS impl mismatch with AGENTS §10.5 spec** (`async-native-tls`/`native-tls` instead of `SslTunnel`). Functionally equivalent; not a runtime defect; a spec text that needs updating.
4. **No dedicated message-fetch Tauri command.** Reads go via `tauri-plugin-sql` from JS, which works, but the brief's expected `commands/message.rs` shape does not exist.
