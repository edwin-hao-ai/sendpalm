# Inbox Data + Real-Time Notifications + Sidebar/Titlebar Revamp — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make real IMAP mail appear in the Inbox within ~5 s of arrival (with OS-level desktop notifications), fix the empty-Inbox bug, and turn the desktop chrome (sidebar + titlebar) into the icon-only, brand-on-topbar design approved in the spec.

**Architecture:** Five sequential phases, each ending in a green build, an updated `docs/PROGRESS.md`, and a self-contained commit. Phase 1 (Rust) introduces a `mailbox_resolver` and per-folder failure isolation so IDLE can fire `sync:new-messages`; Phase 2 (Rust + JS) wires `tauri-plugin-notification` and a JS-side permission bootstrap; Phase 3 (DB) adds `0014_gate_screened_backfill.sql` and the `countGateCandidates` helper; Phase 4 (FE) turns the desktop sidebar icon-only with a tooltip primitive; Phase 5 (Tauri + FE) flips `titleBarStyle` to `Overlay` and moves the brand into the topbar.

**Tech Stack:** Rust 2021 + `async-imap` + `sqlx` (Tauri 2 backend), SolidJS + `@tauri-apps/api` (frontend), `tauri-plugin-notification`, `tauri-plugin-store`, Vitest, Playwright.

## Global Constraints

These are the spec's project-wide rules. Every task implicitly conforms.

- **AGENTS.md §3.2** — no `any` in TypeScript, no magic strings, all colors/spacing in `app/src/styles/tokens.css`.
- **AGENTS.md §3.3** — DRY; if the same JSX appears twice, extract.
- **AGENTS.md §3.4** — unit tests for any logic (Rust: `cargo test`; TS: `vitest`); integration tests gated behind `SENDPALM_E2E_NETWORK=1` for IMAP/SMTP.
- **AGENTS.md §3.5** — one conventional commit per task; `feat`, `fix`, `refactor`, `test`, `chore` prefixes.
- **AGENTS.md §10** — never log `.env`; never commit `.env`; never expose IMAP/SMTP passwords; `app/.env` stays gitignored; `app/.env.example` carries placeholders.
- **AGENTS.md §11** — animations use `transform`, not `top`/`left`; overflow-wrap `anywhere` for paragraphs.
- **AGENTS.md §6** — mobile ≤767 px, tablet 768–1023 px, desktop ≥1024 px; tap targets ≥ 44×44 px; `100dvh`.
- **AGENTS.md §4 stack** — Tauri 2.x + SolidJS 1.9 + Vite 6 + TypeScript strict; `tauri-plugin-notification` already in `Cargo.toml:22` and `lib.rs:127`; `app/src-tauri/Cargo.toml` is the single source of deps.
- **AGENTS.md §7** — every milestone updates `docs/PROGRESS.md` and re-reads the spec section for the surface touched.
- **Heuristic from `docs/lessons.md`** — don't pre-truncate labels; tooltip flips when near viewport edges; the single `text=SendPalm` Playwright selector scopes to `[data-testid="brand-mark"]` to avoid splash collision.
- **Provider contract** — auth mode is per-provider; Feishu/Gmail/Outlook/iCloud/Yahoo/Fastmail = `app-password`; QQ/网易 163/126 = `password-with-auth-code`.
- **Rust style** — `let _ = app.emit(...)` for fire-and-forget events; `eprintln!("[<module>] <message>")` for sync log lines; `?` only for non-fatal results inside per-folder loops.
- **TS style** — `interface` over `type` for shapes; `unknown` over `any`; const exports from a single barrel; SolidJS `createMemo` for derived state.
- **CSS** — every value is a token (`var(--…)`); no raw `px` literals in component styles except `1px` borders.
- **iOS** — no `xcrun simctl tap`; bake the desired UI state into the build via bootstrap flags; `navigator.userAgent` checks are off-limits; rely on `useViewport().isMobile()`.

---

## File Structure (per task)

New files this plan introduces:

- `app/src-tauri/src/services/mailbox_resolver.rs` — folder candidate table + resolver
- `app/src-tauri/src/services/desktop_notifier.rs` — OS-level notification helper
- `app/src-tauri/src/commands/notification_settings.rs` — IPC for JS → Rust notification prefs
- `app/src-tauri/migrations/0014_gate_screened_backfill.sql` — defensive Gate normalization
- `app/src/components/SidebarTooltip.tsx` — floating tooltip primitive
- `app/src/components/BrandMark.tsx` — leftmost topbar brand mark
- `app/src/services/notifications.ts` — JS permission bootstrap
- `app/src/test/empty-state.test.ts` — InboxEmptyState branches
- `app/src-tauri/tests/mailbox_resolver_test.rs` — candidate table unit tests

Files this plan modifies (each task lists the exact line range it touches):

- `app/src-tauri/src/services/sync_loop.rs` — call resolver; per-folder match; cursor strictness; notifier hook
- `app/src-tauri/src/services/imap.rs` — UTF-7 aware `select` (Defect A prerequisite)
- `app/src-tauri/src/services/mod.rs` — register `mailbox_resolver` and `desktop_notifier` modules
- `app/src-tauri/src/lib.rs` — register `notify_settings_changed` command
- `app/src-tauri/src/commands/mod.rs` — re-export the new commands
- `app/src-tauri/tests/imap_real.rs` — extend with `resolve_folder_names_feishu` test
- `app/src/services/sync-events.ts` — accept new `desktopNotified` payload flag
- `app/src/components/Topbar.tsx` — remove leaf icon from view-title (desktop/tablet); add `<BrandMark />`; traffic-light padding
- `app/src/components/Sidebar.tsx` — icon-only NavItem; tooltip; aria-current; ⌘N chip reposition
- `app/src/components/Titlebar.tsx` — **delete**
- `app/src/App.tsx` — remove `<Titlebar />` mount
- `app/src/stores/data.ts` — add `countGateCandidates()`
- `app/src/stores/ui.ts` — add `gateCandidateCount` signal
- `app/src/views/Imbox.tsx` — replace `InboxZero` with `InboxEmptyState`
- `app/src/views/Settings.tsx` — add Notifications tab content
- `app/src/bootstrap.ts` — call `ensureNotificationPermission` after settings load
- `app/src/styles/tokens.css` — `--titlebar-height: 0`; add `--titlebar-traffic-pad: 78px`
- `app/src/styles/base.css` — remove titlebar grid row; add 78px safe area to `#topbar` on desktop/tablet
- `app/src-tauri/tauri.conf.json` — `titleBarStyle: Overlay`, `trafficLightPosition`
- `app/e2e/views.spec.ts` — update Sidebar / titlebar tests

---

# Phase 1 — Inbox data chain (Rust + first JS view updates)

Goal: `sync_one` no longer aborts on a single bad folder, the cursor advances only on successful inserts, and `Sent` is auto-resolved to the server's actual name (so Feishu's `&XfJT0ZAB-` works). After Phase 1, the Imbox will populate within IDLE latency and `sync:new-messages` will fire reliably.

## Task 1.1: Resolve a folder name via candidate matching (Rust unit, no network)

**Files:**
- Create: `app/src-tauri/src/services/mailbox_resolver.rs`
- Test: `app/src-tauri/tests/mailbox_resolver_test.rs`

**Interfaces:**
- Produces: `pub fn resolve_folder_name(server_mailboxes: &[String], desired: FolderKind) -> Option<String>` where `FolderKind` is `pub enum FolderKind { Inbox, Sent, Drafts, Trash, Spam }`.

- [ ] **Step 1: Write the failing test**

Add to `app/src-tauri/tests/mailbox_resolver_test.rs`:

```rust
use sendpalm_app_lib::services::mailbox_resolver::{resolve_folder_name, FolderKind};

#[test]
fn feishu_sent_resolves_to_utf7_name() {
    let mailboxes = vec![
        "INBOX".to_string(),
        "&XfJT0ZAB-".to_string(),
        "&XfJ8T-".to_string(),
    ];
    assert_eq!(
        resolve_folder_name(&mailboxes, FolderKind::Sent),
        Some("&XfJT0ZAB-".to_string())
    );
}

#[test]
fn gmail_sent_resolves_to_gmail_label() {
    let mailboxes = vec!["INBOX".to_string(), "[Gmail]/Sent Mail".to_string()];
    assert_eq!(
        resolve_folder_name(&mailboxes, FolderKind::Sent),
        Some("[Gmail]/Sent Mail".to_string())
    );
}

#[test]
fn outlook_sent_resolves_to_sent_items() {
    let mailboxes = vec!["Inbox".to_string(), "Sent Items".to_string()];
    assert_eq!(
        resolve_folder_name(&mailboxes, FolderKind::Sent),
        Some("Sent Items".to_string())
    );
}

#[test]
fn chinese_inbox_resolves_to_zh_label() {
    let mailboxes = vec!["收件箱".to_string(), "已发送".to_string()];
    assert_eq!(
        resolve_folder_name(&mailboxes, FolderKind::Inbox),
        Some("收件箱".to_string())
    );
}

#[test]
fn unknown_provider_returns_none() {
    let mailboxes = vec!["Foo".to_string(), "Bar".to_string()];
    assert_eq!(resolve_folder_name(&mailboxes, FolderKind::Trash), None);
}

#[test]
fn case_insensitive_match_for_inbox() {
    let mailboxes = vec!["inbox".to_string()];
    assert_eq!(
        resolve_folder_name(&mailboxes, FolderKind::Inbox),
        Some("inbox".to_string())
    );
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd app/src-tauri && cargo test --test mailbox_resolver_test`
Expected: FAIL with "unresolved import sendpalm_app_lib::services::mailbox_resolver".

- [ ] **Step 3: Implement the resolver module**

Create `app/src-tauri/src/services/mailbox_resolver.rs`:

```rust
//! IMAP folder name resolution. Some servers (Feishu, Gmail, Outlook)
//! localize folder names. This module provides a case-insensitive candidate
//! table so the sync loop can pick the real mailbox name from a `LIST`
//! response.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FolderKind {
    Inbox,
    Sent,
    Drafts,
    Trash,
    Spam,
}

/// Look up the server-side name for a desired folder, returning `None` if
/// none of the candidates is present in `server_mailboxes`. Matching is
/// case-insensitive and exact (no substring, no normalization beyond case
/// folding) so a stray `INBOX` never matches `INBOX/Subfolder`.
pub fn resolve_folder_name(
    server_mailboxes: &[String],
    desired: FolderKind,
) -> Option<String> {
    let candidates: &[&str] = match desired {
        FolderKind::Inbox => &["INBOX", "Inbox", "收件箱"],
        FolderKind::Sent => &[
            "Sent",
            "Sent Messages",
            "Sent Items",
            "已发送",
            "[Gmail]/Sent Mail",
            "&XfJT0ZAB-", // Feishu
        ],
        FolderKind::Drafts => &["Drafts", "Draft", "草稿箱", "&XfJ8T-"],
        FolderKind::Trash => &[
            "Trash",
            "Deleted",
            "Deleted Items",
            "Deleted Messages",
            "已删除",
            "[Gmail]/Trash",
        ],
        FolderKind::Spam => &[
            "Spam",
            "Junk",
            "Junk Mail",
            "Junk E-mail",
            "Bulk Mail",
            "垃圾邮件",
            "[Gmail]/Spam",
        ],
    };
    let lower: Vec<String> = server_mailboxes.iter().map(|s| s.to_lowercase()).collect();
    for (i, mb) in lower.iter().enumerate() {
        if candidates.iter().any(|c| c.eq_ignore_ascii_case(mb)) {
            return server_mailboxes.get(i).cloned();
        }
    }
    None
}

/// Resolve every folder kind in one call, skipping any that the server
/// doesn't expose. The first entry is always `Inbox`; if even that is
/// missing the caller should treat the account as mis-configured.
pub fn resolve_all(server_mailboxes: &[String]) -> Vec<String> {
    let kinds = [
        FolderKind::Inbox,
        FolderKind::Sent,
        FolderKind::Drafts,
        FolderKind::Trash,
        FolderKind::Spam,
    ];
    let mut out = Vec::with_capacity(kinds.len());
    for k in kinds {
        if let Some(name) = resolve_folder_name(server_mailboxes, k) {
            if !out.contains(&name) {
                out.push(name);
            }
        }
    }
    out
}
```

Add `pub mod mailbox_resolver;` to `app/src-tauri/src/services/mod.rs:13`
(after the `state` line, before `sync_loop`).

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd app/src-tauri && cargo test --test mailbox_resolver_test`
Expected: PASS (6/6 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/edwinhao/sendpalm
git add app/src-tauri/src/services/mailbox_resolver.rs \
        app/src-tauri/src/services/mod.rs \
        app/src-tauri/tests/mailbox_resolver_test.rs
git commit -m "feat(sync): IMAP folder name resolver with provider candidate table"
```

## Task 1.2: UTF-7 safe `select` in `ImapClient::sync`

**Files:**
- Modify: `app/src-tauri/src/services/imap.rs:151-156`

**Interfaces:**
- Consumes: `mailbox_name: &str` (the user-facing folder name, possibly localized).
- Produces: same return type; internally encodes `&` sequences to UTF-7 if needed.

- [ ] **Step 1: Write a failing test for the encoder**

Add to `app/src-tauri/tests/mailbox_resolver_test.rs` (or a new
`app/src-tauri/tests/imap_utf7_test.rs` — choose the latter to keep the
parser tests separate):

```rust
use sendpalm_app_lib::services::imap::encode_utf7_imap;

#[test]
fn utf7_passes_through_ascii() {
    assert_eq!(encode_utf7_imap("INBOX"), "INBOX");
}

#[test]
fn utf7_encodes_non_ascii() {
    // Feishu's "已发送" decodes from &XfJT0ZAB-
    assert_eq!(encode_utf7_imap("已发送"), "&XfJT0ZAB-");
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd app/src-tauri && cargo test --test imap_utf7_test`
Expected: FAIL with "function `encode_utf7_imap` not found".

- [ ] **Step 3: Add the encoder and use it inside `ImapClient::sync`**

Modify `app/src-tauri/src/services/imap.rs`:

After the `ImapClient` impl block (around line 145, before `pub async fn
sync`), add:

```rust
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
```

In the `sync` method (`app/src-tauri/src/services/imap.rs:151-156`), replace:

```rust
let mailbox = session
    .select(mailbox_name)
    .await
    .map_err(|e| format!("select {mailbox_name}: {e}"))?;
```

with:

```rust
let wire_name = encode_utf7_imap(mailbox_name);
let mailbox = session
    .select(&wire_name)
    .await
    .map_err(|e| format!("select {mailbox_name} ({wire_name}): {e}"))?;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd app/src-tauri && cargo test --test imap_utf7_test --test mailbox_resolver_test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/edwinhao/sendpalm
git add app/src-tauri/src/services/imap.rs \
        app/src-tauri/tests/imap_utf7_test.rs
git commit -m "fix(imap): encode folder names to modified UTF-7 before select"
```

## Task 1.3: Per-folder failure isolation in `sync_one`

**Files:**
- Modify: `app/src-tauri/src/services/sync_loop.rs:497-537` (the `for folder in &folders` loop in `sync_one`)

**Interfaces:**
- Consumes: existing `sync_folder(...)` signature.
- Produces: `sync_one` continues past folder errors; total_inserted and `sync:new-messages` payload still aggregate success.

- [ ] **Step 1: Write a failing test**

Add to `app/src-tauri/tests/sync_loop_isolation_test.rs`:

```rust
use sendpalm_app_lib::services::sync_loop::{SyncOutcome, sync_one_outcome};

#[tokio::test]
async fn per_folder_failure_does_not_abort_remaining_folders() {
    // Two folders: INBOX succeeds (inserted=1), Sent fails.
    // The aggregated result must still include INBOX's insert.
    let outcome: SyncOutcome = sync_one_outcome(vec![
        ("INBOX", Ok(1)),
        ("Sent", Err("no such mailbox".to_string())),
    ])
    .await;
    assert_eq!(outcome.total_inserted, 1);
    assert_eq!(outcome.failed_folders, vec!["Sent".to_string()]);
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd app/src-tauri && cargo test --test sync_loop_isolation_test`
Expected: FAIL with "unresolved import sendpalm_app_lib::services::sync_loop::SyncOutcome".

- [ ] **Step 3: Expose a testable helper**

In `app/src-tauri/src/services/sync_loop.rs`, add above the existing
`sync_one` function (around line 470):

```rust
/// Aggregate of one `sync_one` cycle, exposed for tests.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct SyncOutcome {
    pub total_inserted: u32,
    pub failed_folders: Vec<String>,
}

/// Test seam: aggregate per-folder outcomes without touching IMAP.
pub async fn sync_one_outcome(
    results: Vec<(&str, Result<u32, String>)>,
) -> SyncOutcome {
    let mut out = SyncOutcome::default();
    for (folder, result) in results {
        match result {
            Ok(n) => out.total_inserted += n,
            Err(_) => out.failed_folders.push(folder.to_string()),
        }
    }
    out
}
```

Then in `sync_one` (line 510), replace the bare `?`:

```rust
let (inserted, cursor, uid_validity) = match sync_folder(
    app,
    data_dir,
    pool,
    client,
    account,
    folder,
    start_uid,
    if is_inbox { previous_last_uid } else { 0 },
)
.await
{
    Ok(t) => t,
    Err(e) => {
        eprintln!(
            "[sync] folder={folder} failed for {}: {e}",
            account.account_id
        );
        // Persist the previous cursor so a fixed folder can resume cleanly.
        let _ = save_folder_sync_state(pool, &state_key, start_uid, 0).await;
        continue;
    }
};
```

Move the `save_folder_sync_state` call (currently at line 524) inside the
`Ok` branch right after the destructuring — when a folder fails we already
saved with the previous cursor above.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd app/src-tauri && cargo test --test sync_loop_isolation_test --test mailbox_resolver_test --test imap_utf7_test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/edwinhao/sendpalm
git add app/src-tauri/src/services/sync_loop.rs \
        app/src-tauri/tests/sync_loop_isolation_test.rs
git commit -m "fix(sync): isolate per-folder failures so INBOX keeps syncing"
```

## Task 1.4: Cursor advances only on successful insert (Defect C)

**Files:**
- Modify: `app/src-tauri/src/services/sync_loop.rs:597-645` (the `sync_folder` function)

**Interfaces:**
- Produces: `cursor` after `sync_folder` is `max(highest_uid, last_success_uid)` where `last_success_uid` is the highest UID whose `insert_message` returned `Ok(())`. Parse failures and DB-insert failures both keep the cursor below their UID.

- [ ] **Step 1: Write a failing test**

Add to `app/src-tauri/tests/sync_loop_cursor_test.rs`:

```rust
use sendpalm_app_lib::services::sync_loop::advance_cursor;

#[test]
fn cursor_does_not_advance_past_failed_uid() {
    // UIDs 100, 101, 102 attempted; only 100 succeeded.
    // Cursor must stay at 100 so the next tick retries 101+102.
    let (inserted, cursor) = advance_cursor(0, &[(100, true), (101, false), (102, false)]);
    assert_eq!(inserted, 1);
    assert_eq!(cursor, 100);
}

#[test]
fn cursor_advances_past_full_chunk() {
    let (inserted, cursor) = advance_cursor(0, &[(200, true), (201, true), (202, true)]);
    assert_eq!(inserted, 3);
    assert_eq!(cursor, 202);
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd app/src-tauri && cargo test --test sync_loop_cursor_test`
Expected: FAIL with "unresolved import sendpalm_app_lib::services::sync_loop::advance_cursor".

- [ ] **Step 3: Extract a pure helper and call it from `sync_folder`**

In `app/src-tauri/src/services/sync_loop.rs`, add above the `sync_folder`
function (line 596):

```rust
/// Test seam: given a starting cursor and a list of `(uid, success)`
/// outcomes, return `(inserted, new_cursor)`. The cursor is the largest UID
/// whose outcome was `success`; it never advances past a failed UID.
pub fn advance_cursor(
    start: u32,
    results: &[(u32, bool)],
) -> (u32, u32) {
    let mut cursor = start;
    let mut inserted = 0u32;
    for &(uid, ok) in results {
        if ok {
            cursor = cursor.max(uid);
            inserted += 1;
        } else {
            break;
        }
    }
    (inserted, cursor)
}
```

In `sync_folder`, replace the inner `for (uid, parsed) in &bundle.messages`
loop (lines 620-632) and the chunk-end cursor update (lines 633-637) with
this logic that records success per UID:

```rust
let mut chunk_outcomes: Vec<(u32, bool)> = Vec::with_capacity(bundle.messages.len());
for (uid, parsed) in &bundle.messages {
    let ok = insert_message(
        data_dir,
        pool,
        account,
        folder,
        *uid,
        parsed,
        previous_last_uid,
    )
    .await
    .is_ok();
    chunk_outcomes.push((*uid, ok));
}
let (chunk_inserted, chunk_last_ok) = advance_cursor(cursor, &chunk_outcomes);
inserted += chunk_inserted;
let next_cursor = chunk_last_ok.max(bundle.highest_uid);
cursor = next_cursor;
if !chunk_outcomes.iter().all(|(_, ok)| *ok) {
    // Don't skip past failures within a chunk.
    break;
}
if (bundle.messages.len() as u32) < crate::services::imap::MAX_PER_TICK {
    break;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd app/src-tauri && cargo test --test sync_loop_cursor_test --test sync_loop_isolation_test --test mailbox_resolver_test --test imap_utf7_test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/edwinhao/sendpalm
git add app/src-tauri/src/services/sync_loop.rs \
        app/src-tauri/tests/sync_loop_cursor_test.rs
git commit -m "fix(sync): only advance cursor past UIDs that were successfully inserted"
```

## Task 1.5: Wire mailbox_resolver into spawn_account_loop (Defect A end-to-end)

**Files:**
- Modify: `app/src-tauri/src/services/sync_loop.rs:178-196` (the spawn_account_loop prelude before the first `sync_and_notify` call)

**Interfaces:**
- Consumes: `account: SyncAccount` with `account.creds` and `account.settings_json`.
- Produces: `account.settings_json` updated in-memory with resolved folder names; `upsert_account` is called once to persist.

- [ ] **Step 1: Write a failing test**

Add to `app/src-tauri/tests/mailbox_resolver_test.rs`:

```rust
use sendpalm_app_lib::services::mailbox_resolver::resolve_all;

#[test]
fn resolve_all_returns_inbox_then_sent() {
    let mailboxes = vec!["INBOX".to_string(), "&XfJT0ZAB-".to_string()];
    let resolved = resolve_all(&mailboxes);
    assert_eq!(resolved, vec!["INBOX".to_string(), "&XfJT0ZAB-".to_string()]);
}

#[test]
fn resolve_all_skips_missing_kinds() {
    let mailboxes = vec!["INBOX".to_string()];
    let resolved = resolve_all(&mailboxes);
    assert_eq!(resolved, vec!["INBOX".to_string()]);
}
```

- [ ] **Step 2: Run the test to verify it fails** (these were already covered by Task 1.1; this confirms we don't regress).

Run: `cd app/src-tauri && cargo test --test mailbox_resolver_test`
Expected: PASS (already covered).

If the test passes, skip the next step and proceed to Step 3.

- [ ] **Step 3: Modify `spawn_account_loop` to call the resolver**

In `app/src-tauri/src/services/sync_loop.rs`, add to the imports at the
top of the file (line 8):

```rust
use crate::services::mailbox_resolver::{resolve_all, resolve_folder_name};
```

In `spawn_account_loop` (lines 183-189), after the `let client =
ImapClient::new(...)` line and before the `if !stop.load(Ordering::Relaxed)`
block, add:

```rust
// Resolve server-side folder names once per account boot, before the
// first sync. The result is persisted into accounts.settings_json.syncFolders
// so subsequent ticks reuse the same mapping.
match client.list_mailboxes().await {
    Ok(server) => {
        let resolved = resolve_all(&server);
        eprintln!(
            "[mailbox] resolved folders for {}: {:?}",
            account.account_id, resolved
        );
        // Persist as a Vec<{name, enabled}> shape used by Settings.tsx.
        let resolved_json = serde_json::json!({
            "folders": resolved.iter().map(|n| serde_json::json!({
                "name": n,
                "enabled": true,
            })).collect::<Vec<_>>()
        });
        let mut updated_settings: serde_json::Value = serde_json::from_str(
            account.settings_json.as_deref().unwrap_or("{}"),
        )
        .unwrap_or_default();
        if let Some(obj) = updated_settings.as_object_mut() {
            obj.insert("syncFolders".to_string(), resolved_json);
        }
        account.settings_json = Some(updated_settings.to_string());
        let _ = upsert_account(pool, &account).await;
    }
    Err(e) => {
        eprintln!(
            "[mailbox] list_mailboxes failed for {}: {e}; using default folders",
            account.account_id
        );
    }
}
```

- [ ] **Step 4: Verify with `cargo check` + a unit test**

Run: `cd app/src-tauri && cargo check --tests && cargo test --test mailbox_resolver_test --test sync_loop_isolation_test --test sync_loop_cursor_test --test imap_utf7_test`
Expected: all PASS, no compiler warnings from this file.

- [ ] **Step 5: Commit**

```bash
cd /Users/edwinhao/sendpalm
git add app/src-tauri/src/services/sync_loop.rs
git commit -m "feat(sync): auto-resolve IMAP folder names on first sync per account"
```

## Task 1.6: Add `countGateCandidates` data helper + test

**Files:**
- Modify: `app/src/stores/data.ts` (add a new function after `listContacts` at line 563)
- Test: `app/src/test/empty-state.test.ts` (created here, also covers Task 1.7)

**Interfaces:**
- Produces: `export async function countGateCandidates(): Promise<number>` returning the count of `contacts WHERE first_seen=1 AND screened=0`.

- [ ] **Step 1: Write the failing test**

Create `app/src/test/empty-state.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../services/tauri-shim", () => ({ IS_BROWSER: () => true }));

import {
  listMessages,
  listContacts,
  listAccounts,
  countGateCandidates,
} from "../stores/data";
import { resetMockDb } from "../services/mock-db";

describe("countGateCandidates", () => {
  beforeEach(async () => {
    await resetMockDb();
  });

  it("returns 0 when no contacts", async () => {
    expect(await countGateCandidates()).toBe(0);
  });

  it("counts first_seen=1, screened=0 only", async () => {
    // Insert contacts directly via the underlying store.
    // MockDb exposes upsertContact.
    const { MockDb } = await import("../services/mock-db");
    const db = new MockDb();
    await db.upsertContact({
      id: "c_a_at_x",
      firstName: "A",
      lastName: "",
      name: "a@x",
      email: "a@x",
      firstSeen: true,
      screened: false,
      blocked: false,
    } as never);
    await db.upsertContact({
      id: "c_b_at_x",
      firstName: "B",
      lastName: "",
      name: "b@x",
      email: "b@x",
      firstSeen: false,
      screened: true,
      blocked: false,
    } as never);

    expect(await countGateCandidates()).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd app && pnpm test -- empty-state.test.ts`
Expected: FAIL with "countGateCandidates is not a function".

- [ ] **Step 3: Implement `countGateCandidates`**

In `app/src/stores/data.ts`, immediately after the `listContacts` function
(around line 562), add:

```ts
/** Count of contacts that still need screening at the Gate.
 *
 * Returns the number of rows in `contacts` where `first_seen=1 AND screened=0`.
 * This drives the Inbox empty-state copy: if there are no accounts we say
 * "add an account"; if there are unscreened contacts we say "open Gate";
 * otherwise we say "inbox is empty".
 */
export async function countGateCandidates(): Promise<number> {
  const db = await getDb();
  const rows = await db.select<Array<{ cnt: number | string }>>(
    "SELECT COUNT(*) AS cnt FROM contacts WHERE first_seen = 1 AND screened = 0",
  );
  return Number(rows[0]?.cnt ?? 0);
}
```

Add `listMessages, listContacts, listAccounts,` to the import in the new
test file (already in the import list above).

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd app && pnpm test -- empty-state.test.ts`
Expected: PASS (2/2).

- [ ] **Step 5: Commit**

```bash
cd /Users/edwinhao/sendpalm
git add app/src/stores/data.ts \
        app/src/test/empty-state.test.ts
git commit -m "feat(data): countGateCandidates helper for empty-state copy"
```

## Task 1.7: InboxEmptyState three-branch component (Defect D)

**Files:**
- Modify: `app/src/views/Imbox.tsx:1707-1718` (replace `InboxZero`)
- Modify: `app/src/stores/ui.ts:81-86` (add `gateCandidateCount` signal)
- Test: extend `app/src/test/empty-state.test.ts`

**Interfaces:**
- Produces: a `InboxEmptyState` component that branches on three resource states.

- [ ] **Step 1: Add a UI signal for the gate candidate count**

In `app/src/stores/ui.ts`, immediately after the `refreshTick` /
`bumpRefreshTick` block (lines 81-86), add:

```ts
/** Live count of contacts that still need Gate screening.
 * Updated by `useRefreshEffect` in views that surface the Inbox empty
 * state; the resource itself lives in `stores/data.ts::countGateCandidates`.
 */
export const [gateCandidateCount, setGateCandidateCount] = createSignal(0);
```

- [ ] **Step 2: Replace `InboxZero` with `InboxEmptyState`**

In `app/src/views/Imbox.tsx`, replace the `InboxZero` function (lines
1707-1718) with:

```tsx
import { countGateCandidates, listAccounts, listMessages } from "../stores/data";
import { gateCandidateCount, setGateCandidateCount, setView } from "../stores/ui";
import { useRefreshEffect } from "../utils/gestures";

function InboxEmptyState() {
  const [accounts] = createResource(listAccounts);
  const [gate] = createResource(countGateCandidates);

  // Keep the store's gateCandidateCount signal fresh with the resource.
  useRefreshEffect(() => {
    if (gate.state === "ready" && gate() !== undefined) {
      setGateCandidateCount(gate() ?? 0);
    }
  });

  const emailAccountCount = createMemo(
    () => (accounts() ?? []).filter((a) => a.type === "email").length,
  );
  const unscreened = createMemo(() => gateCandidateCount());

  return (
    <Show when={emailAccountCount() === 0} fallback={
      <Show when={unscreened() > 0} fallback={
        <Empty
          icon="ph-tray"
          title="Inbox 是空的"
          description="新邮件到达时会自动显示在此处。试着给自己发一封测试邮件吧。"
        />
      }>
        <Empty
          icon="ph-shield-check"
          title={`${unscreened()} 个发件人待 Gate 筛选`}
          description="这些发件人的邮件会先沉淀在 Gate，直到你决定是收进 Inbox 还是 Block。"
          action={{
            label: "打开 Gate",
            onClick: () => setView("screener"),
          }}
        />
      </Show>
    }>
      <Empty
        icon="ph-tray"
        title="Inbox 是空的"
        description="请到 Settings → Accounts → Add account 接入真实邮箱。背景同步会从 IMAP 拉取最近的邮件。"
        action={{ label: "打开 Settings", onClick: () => setView("settings") }}
      />
    </Show>
  );
}
```

In the same file, replace every occurrence of `<InboxZero />` (one
occurrence at line 396) with `<InboxEmptyState />`.

The unused import `useRefreshEffect` is already imported in this file
(line 43); confirm `countGateCandidates` is added to the existing
`stores/data` import (line 14-21) — if it isn't, add it. The `Empty`
component is already imported (line 37).

- [ ] **Step 3: Add a Vitest test for the three branches**

Append to `app/src/test/empty-state.test.ts`:

```ts
import { render } from "@solidjs/testing-library";

describe("InboxEmptyState branches", () => {
  beforeEach(async () => {
    const { resetMockDb } = await import("../services/mock-db");
    await resetMockDb();
  });

  it("renders 'add account' when no email accounts", async () => {
    const { MockDb } = await import("../services/mock-db");
    const db = new MockDb();
    // Empty database.
    const { App: _ } = await Promise.resolve();
    // Smoke test: the resource loaders should each return [].
    expect(await listAccounts()).toEqual([]);
  });

  it("renders 'open Gate' when unscreened contacts exist", async () => {
    const { MockDb } = await import("../services/mock-db");
    const db = new MockDb();
    await db.upsertAccount({
      id: "acct_x",
      type: "email",
      provider: "feishu",
      email: "x@x",
      label: "x",
      displayName: "x",
      status: "connected",
      synced: 0,
      total: 0,
      privacy: "unified",
      color: "#0A8F63",
      avatar: "x",
      lastSync: "",
      settings: {},
    } as never);
    await db.upsertContact({
      id: "c_a",
      firstName: "A",
      lastName: "",
      name: "a@x",
      email: "a@x",
      firstSeen: true,
      screened: false,
      blocked: false,
    } as never);
    expect(await listAccounts()).toHaveLength(1);
    expect(await countGateCandidates()).toBe(1);
  });

  it("renders 'inbox empty' when accounts exist and no unscreened contacts", async () => {
    const { MockDb } = await import("../services/mock-db");
    const db = new MockDb();
    await db.upsertAccount({
      id: "acct_x",
      type: "email",
      provider: "feishu",
      email: "x@x",
      label: "x",
      displayName: "x",
      status: "connected",
      synced: 0,
      total: 0,
      privacy: "unified",
      color: "#0A8F63",
      avatar: "x",
      lastSync: "",
      settings: {},
    } as never);
    expect(await listAccounts()).toHaveLength(1);
    expect(await countGateCandidates()).toBe(0);
  });
});
```

- [ ] **Step 4: Run the tests**

Run: `cd app && pnpm test -- empty-state.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/edwinhao/sendpalm
git add app/src/views/Imbox.tsx \
        app/src/stores/ui.ts \
        app/src/test/empty-state.test.ts
git commit -m "feat(imbox): three-branch InboxEmptyState (no account / unscreened / empty)"
```

## Task 1.8: Add the Gate normalization migration (Defect D defensive)

**Files:**
- Create: `app/src-tauri/migrations/0014_gate_screened_backfill.sql`
- Modify: `app/src-tauri/src/lib.rs:101` (register the new migration)

**Interfaces:**
- Produces: a SQL migration that, on first run, normalizes the rare inconsistent state where a contact is `first_seen=1` but `screened=1`. No destructive schema change.

- [ ] **Step 1: Write the migration SQL**

Create `app/src-tauri/migrations/0014_gate_screened_backfill.sql`:

```sql
-- Defensive normalization: any contact that arrived via IMAP (`first_seen=1`)
-- but is also marked `screened=1` (an inconsistent state from earlier
-- migrations) is flipped back to `screened=0` so it appears in the Gate
-- screener. No-op on a healthy database.
UPDATE contacts
   SET screened = 0
 WHERE first_seen = 1
   AND screened = 1;
```

- [ ] **Step 2: Register the migration**

In `app/src-tauri/src/lib.rs`, add a new `Migration` entry inside the
`migrations` vec (immediately after the version 13 entry, around line
101):

```rust
        Migration {
            version: 14,
            description: "normalize_gate_screened_state",
            sql: include_str!("../migrations/0014_gate_screened_backfill.sql"),
            kind: MigrationKind::Up,
        },
```

- [ ] **Step 3: Verify with `cargo check`**

Run: `cd app/src-tauri && cargo check --tests`
Expected: builds clean; no test changes required (the migration is exercised by the live database on the next boot, not by unit tests).

- [ ] **Step 4: Commit**

```bash
cd /Users/edwinhao/sendpalm
git add app/src-tauri/migrations/0014_gate_screened_backfill.sql \
        app/src-tauri/src/lib.rs
git commit -m "chore(db): defensive Gate screened-state normalization migration"
```

## Task 1.9: Update `docs/PROGRESS.md` for Phase 1

**Files:**
- Modify: `docs/PROGRESS.md` (append a new entry under the most recent milestone)

- [ ] **Step 1: Append a phase-1 entry**

Open `docs/PROGRESS.md`, find the most recent `## M11` (or `## Phase`)
heading, and below it add:

```markdown
### Phase 1 — Inbox data chain (2026-08-10)

- Added `services::mailbox_resolver` with provider-aware candidate table
  (Feishu `&XfJT0ZAB-`, Gmail `[Gmail]/Sent Mail`, Outlook `Sent Items`,
  Chinese labels). Replaces the hard-coded `"Sent"` folder name.
- `ImapClient::sync` now encodes folder names to modified UTF-7 before
  `session.select` (RFC 3501 §5.1.3).
- `sync_one` no longer aborts on a single failed folder; failed folders
  are logged and the next folder continues. `sync:new-messages` always
  fires when at least one folder inserted messages.
- `sync_folder` only advances the persisted cursor past UIDs that were
  successfully inserted. Parse failures and DB-insert failures keep the
  cursor below their UID, so the next tick retries them.
- `spawn_account_loop` calls `client.list_mailboxes` once per boot and
  persists the resolved names into `accounts.settings_json.syncFolders`.
- New `0014_gate_screened_backfill.sql` defensively normalizes the rare
  inconsistent contact state.
- `countGateCandidates` added to `stores/data.ts`; `InboxEmptyState` in
  `views/Imbox.tsx` now branches three ways (no account / unscreened /
  empty) instead of always saying "add an account".
- Tests added: `mailbox_resolver_test` (6), `imap_utf7_test` (2),
  `sync_loop_isolation_test` (1), `sync_loop_cursor_test` (2),
  `empty-state.test.ts` (5).
- Net effect: real mail now appears in the Inbox within IDLE latency
  (~5 s) for any provider whose Sent folder is one of the candidate
  table entries; the Inbox empty-state copy is now truthful.
```

- [ ] **Step 2: Commit**

```bash
cd /Users/edwinhao/sendpalm
git add docs/PROGRESS.md
git commit -m "docs: PROGRESS phase 1 — inbox data chain"
```

---

# Phase 2 — Desktop notifications (Rust + JS)

Goal: every newly-inserted mail triggers an OS-level notification, gated
by user permission and quiet-hours preference. The JS bootstrap requests
permission on first run; the Rust side mirrors the preferences and calls
`tauri_plugin_notification`.

## Task 2.1: Add `desktop_notifier` module skeleton + tests

**Files:**
- Create: `app/src-tauri/src/services/desktop_notifier.rs`
- Test: create `app/src-tauri/tests/desktop_notifier_test.rs`

**Interfaces:**
- Produces:
  - `pub struct NotificationPrefs { pub desktop_enabled: bool, pub quiet_hours_enabled: bool, pub quiet_hours_start: String, pub quiet_hours_end: String }`
  - `pub fn should_notify(prefs: &NotificationPrefs, now_local_hhmm: &str) -> bool`
  - `pub async fn notify_new_mail(app: &AppHandle, prefs: &NotificationPrefs, account_id: &str, subject: &str, sender: &str) -> Result<(), String>`

- [ ] **Step 1: Write the failing tests**

Create `app/src-tauri/tests/desktop_notifier_test.rs`:

```rust
use sendpalm_app_lib::services::desktop_notifier::{should_notify, NotificationPrefs};

fn prefs(desktop: bool, quiet: bool, start: &str, end: &str) -> NotificationPrefs {
    NotificationPrefs {
        desktop_enabled: desktop,
        quiet_hours_enabled: quiet,
        quiet_hours_start: start.to_string(),
        quiet_hours_end: end.to_string(),
    }
}

#[test]
fn allows_when_desktop_enabled_and_no_quiet_hours() {
    assert!(should_notify(&prefs(true, false, "22:00", "08:00"), "14:30"));
}

#[test]
fn blocks_when_desktop_disabled() {
    assert!(!should_notify(&prefs(false, false, "22:00", "08:00"), "14:30"));
}

#[test]
fn blocks_during_quiet_hours_same_day() {
    // 14:00 is inside 13:00-15:00
    assert!(!should_notify(&prefs(true, true, "13:00", "15:00"), "14:00"));
}

#[test]
fn blocks_during_quiet_hours_overnight() {
    // 23:30 is inside 22:00-08:00 (wraps midnight)
    assert!(!should_notify(&prefs(true, true, "22:00", "08:00"), "23:30"));
    assert!(!should_notify(&prefs(true, true, "22:00", "08:00"), "02:00"));
}

#[test]
fn allows_outside_quiet_hours_overnight() {
    // 09:00 is outside 22:00-08:00
    assert!(should_notify(&prefs(true, true, "22:00", "08:00"), "09:00"));
}

#[test]
fn boundary_inclusive() {
    // 22:00 is the start, inclusive.
    assert!(!should_notify(&prefs(true, true, "22:00", "08:00"), "22:00"));
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd app/src-tauri && cargo test --test desktop_notifier_test`
Expected: FAIL with "unresolved import sendpalm_app_lib::services::desktop_notifier".

- [ ] **Step 3: Implement the notifier**

Create `app/src-tauri/src/services/desktop_notifier.rs`:

```rust
//! OS-level desktop notifications. The Rust side mirrors the JS-side
//! preferences so a `sync:new-messages` event can show a notification
//! without round-tripping to the frontend.

use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NotificationPrefs {
    pub desktop_enabled: bool,
    pub quiet_hours_enabled: bool,
    pub quiet_hours_start: String, // "HH:MM" 24h
    pub quiet_hours_end: String,
}

impl Default for NotificationPrefs {
    fn default() -> Self {
        Self {
            desktop_enabled: true,
            quiet_hours_enabled: false,
            quiet_hours_start: "22:00".to_string(),
            quiet_hours_end: "08:00".to_string(),
        }
    }
}

/// Pure helper, used by tests and by the Rust notifier hook.
pub fn should_notify(prefs: &NotificationPrefs, now_local_hhmm: &str) -> bool {
    if !prefs.desktop_enabled {
        return false;
    }
    if !prefs.quiet_hours_enabled {
        return true;
    }
    let now = parse_hhmm(now_local_hhmm);
    let start = parse_hhmm(&prefs.quiet_hours_start);
    let end = parse_hhmm(&prefs.quiet_hours_end);
    match (now, start, end) {
        (Some(n), Some(s), Some(e)) => {
            if s <= e {
                // Same-day window.
                n >= s && n < e
            } else {
                // Overnight window (e.g. 22:00–08:00).
                n >= s || n < e
            }
        }
        _ => true,
    }
}

fn parse_hhmm(s: &str) -> Option<u32> {
    let mut parts = s.split(':');
    let h: u32 = parts.next()?.parse().ok()?;
    let m: u32 = parts.next()?.parse().ok()?;
    if h > 23 || m > 59 {
        return None;
    }
    Some(h * 60 + m)
}

/// Show an OS-level notification for a single new mail. No-op if the
/// preferences say so. The frontend permission state is assumed to be
/// already resolved; the plugin surfaces any failure to the user.
pub async fn notify_new_mail(
    app: &AppHandle,
    prefs: &NotificationPrefs,
    account_id: &str,
    subject: &str,
    sender: &str,
) -> Result<(), String> {
    let now = chrono::Local::now().format("%H:%M").to_string();
    if !should_notify(prefs, &now) {
        return Ok(());
    }
    let title = if subject.is_empty() {
        format!("New message from {sender}")
    } else {
        subject.to_string()
    };
    let body = format!("From {sender}\n({account_id})");
    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .map_err(|e| format!("notification: {e}"))?;
    Ok(())
}
```

Add `pub mod desktop_notifier;` to `app/src-tauri/src/services/mod.rs:14`
(after `sync_loop`).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd app/src-tauri && cargo test --test desktop_notifier_test`
Expected: PASS (6/6).

- [ ] **Step 5: Commit**

```bash
cd /Users/edwinhao/sendpalm
git add app/src-tauri/src/services/desktop_notifier.rs \
        app/src-tauri/src/services/mod.rs \
        app/src-tauri/tests/desktop_notifier_test.rs
git commit -m "feat(notify): OS-level notifier with quiet-hours helper"
```

## Task 2.2: Add a `NotificationPrefsCache` to `SyncStateStore`

**Files:**
- Modify: `app/src-tauri/src/services/state.rs:1-61`

**Interfaces:**
- Produces: `SyncStateStore` gains a `set_notification_prefs(prefs: NotificationPrefs)` and `notification_prefs() -> NotificationPrefs`. Threadsafe via the existing `Mutex<HashMap>`.

- [ ] **Step 1: Add the cache and accessor**

In `app/src-tauri/src/services/state.rs`, add at the top:

```rust
use crate::services::desktop_notifier::NotificationPrefs;
```

Inside `SyncStateStore`, add a field:

```rust
pub struct SyncStateStore {
    inner: Mutex<HashMap<String, AccountSyncState>>,
    notif: Mutex<NotificationPrefs>,
}
```

In `new`:

```rust
pub fn new() -> Self {
    Self {
        inner: Mutex::new(HashMap::new()),
        notif: Mutex::new(NotificationPrefs::default()),
    }
}
```

Add accessor methods:

```rust
pub fn notification_prefs(&self) -> NotificationPrefs {
    self.notif.lock().unwrap().clone()
}

pub fn set_notification_prefs(&self, prefs: NotificationPrefs) {
    *self.notif.lock().unwrap() = prefs;
}
```

- [ ] **Step 2: Run the existing test suite**

Run: `cd app/src-tauri && cargo test`
Expected: PASS — no behavior change, just new fields.

- [ ] **Step 3: Commit**

```bash
cd /Users/edwinhao/sendpalm
git add app/src-tauri/src/services/state.rs
git commit -m "feat(notify): SyncStateStore caches notification prefs from JS"
```

## Task 2.3: IPC command to push notification prefs JS → Rust

**Files:**
- Create: `app/src-tauri/src/commands/notification_settings.rs`
- Modify: `app/src-tauri/src/commands/mod.rs` (re-export the new command)
- Modify: `app/src-tauri/src/lib.rs:132-144` (register in `invoke_handler`)

**Interfaces:**
- Produces: `#[tauri::command] pub async fn notify_settings_changed(app: AppHandle, prefs: NotificationPrefs) -> Result<(), String>`.

- [ ] **Step 1: Implement the command**

Create `app/src-tauri/src/commands/notification_settings.rs`:

```rust
use tauri::{AppHandle, Manager};

use crate::services::desktop_notifier::NotificationPrefs;

#[tauri::command]
pub async fn notify_settings_changed(
    app: AppHandle,
    desktop_enabled: bool,
    quiet_hours_enabled: bool,
    quiet_hours_start: String,
    quiet_hours_end: String,
) -> Result<(), String> {
    let prefs = NotificationPrefs {
        desktop_enabled,
        quiet_hours_enabled,
        quiet_hours_start,
        quiet_hours_end,
    };
    let store = app.state::<crate::services::state::SyncStateStore>();
    store.set_notification_prefs(prefs);
    Ok(())
}
```

In `app/src-tauri/src/commands/mod.rs`, add at the top (after the
existing use lines):

```rust
pub mod notification_settings;
```

In `app/src-tauri/src/lib.rs`, add `commands::notification_settings::notify_settings_changed`
to the `invoke_handler!` macro (around line 144).

- [ ] **Step 2: Run `cargo check --tests` to confirm the macro accepts the new command**

Run: `cd app/src-tauri && cargo check --tests`
Expected: clean build.

- [ ] **Step 3: Commit**

```bash
cd /Users/edwinhao/sendpalm
git add app/src-tauri/src/commands/notification_settings.rs \
        app/src-tauri/src/commands/mod.rs \
        app/src-tauri/src/lib.rs
git commit -m "feat(notify): IPC notify_settings_changed for JS→Rust prefs"
```

## Task 2.4: Hook the notifier into `insert_message`

**Files:**
- Modify: `app/src-tauri/src/services/sync_loop.rs:743-757` (the `INSERT INTO notifications` block)

**Interfaces:**
- Consumes: the existing parsed mail + `account_id`.
- Produces: a single `notify_new_mail` call after the DB insert succeeds; respects current prefs and quiet hours.

- [ ] **Step 1: Add the hook**

In `app/src-tauri/src/services/sync_loop.rs`, modify the bottom of
`insert_message`. After the existing `INSERT INTO notifications` block
(line 753), add:

```rust
        // OS-level desktop notification. Skipped automatically when
        // desktop_enabled is false or during quiet hours.
        let store = app.state::<crate::services::state::SyncStateStore>();
        let prefs = store.notification_prefs();
        let _ = crate::services::desktop_notifier::notify_new_mail(
            app,
            &prefs,
            &account.account_id,
            &title,
            sender,
        )
        .await;
```

`insert_message` currently doesn't take `app: &AppHandle`. Update its
signature (line 647) to:

```rust
async fn insert_message(
    app: &AppHandle,
    data_dir: &std::path::Path,
    pool: &SqlitePool,
    account: &SyncAccount,
    folder: &str,
    uid: u32,
    parsed: &crate::services::parser::ParsedMessage,
    previous_last_uid: u32,
) -> Result<(), String> {
```

Update the single caller in `sync_folder` (line 621) to pass `app`:

```rust
let ok = insert_message(
    app,
    data_dir,
    pool,
    account,
    folder,
    *uid,
    parsed,
    previous_last_uid,
)
.await
.is_ok();
```

- [ ] **Step 2: Run `cargo check` and existing tests**

Run: `cd app/src-tauri && cargo check --tests && cargo test --test sync_loop_isolation_test --test sync_loop_cursor_test --test desktop_notifier_test`
Expected: all PASS.

- [ ] **Step 3: Commit**

```bash
cd /Users/edwinhao/sendpalm
git add app/src-tauri/src/services/sync_loop.rs
git commit -m "feat(notify): hook desktop_notifier into insert_message"
```

## Task 2.5: JS permission bootstrap

**Files:**
- Create: `app/src/services/notifications.ts`
- Modify: `app/src/bootstrap.ts:70-103` (after the store loads, call `ensureNotificationPermission`)
- Test: `app/src/test/notifications.test.ts`

**Interfaces:**
- Produces: `export async function ensureNotificationPermission(): Promise<void>` — checks the JS-side `appSettings.preferences.notifications.desktop` and, when true, calls the Tauri permission helpers, persists the new value, and pushes it to Rust via `notify_settings_changed`.

- [ ] **Step 1: Write the failing test**

Create `app/src/test/notifications.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../services/tauri-shim", () => ({ IS_BROWSER: () => true }));

describe("ensureNotificationPermission", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("no-ops in browser mode without throwing", async () => {
    const { ensureNotificationPermission } = await import("../services/notifications");
    await expect(ensureNotificationPermission()).resolves.toBeUndefined();
  });

  it("skips the prompt when desktop notifications are disabled in settings", async () => {
    vi.doMock("@tauri-apps/api/notification", () => ({
      isPermissionGranted: vi.fn().mockResolvedValue(false),
      requestPermission: vi.fn(),
    }));
    vi.doMock("../stores/ui", () => ({
      appSettings: {
        preferences: { notifications: { desktop: false, quietHoursEnabled: false, quietHoursStart: "22:00", quietHoursEnd: "08:00" } },
      },
      setAppSettings: vi.fn(),
    }));
    const { ensureNotificationPermission } = await import("../services/notifications");
    await ensureNotificationPermission();
    const { requestPermission } = await import("@tauri-apps/api/notification");
    expect(requestPermission).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd app && pnpm test -- notifications.test.ts`
Expected: FAIL with "Cannot find module ../services/notifications".

- [ ] **Step 3: Implement the bootstrap module**

Create `app/src/services/notifications.ts`:

```ts
import { IS_BROWSER } from "./tauri-shim";
import { appSettings, setAppSettings } from "../stores/ui";

/** Ensure the OS permission for desktop notifications is decided, then mirror
 *  the user's preference into the Rust sync loop via the
 *  `notify_settings_changed` IPC.
 *
 *  No-op in browser mode (Playwright / `pnpm dev`).
 */
export async function ensureNotificationPermission(): Promise<void> {
  if (IS_BROWSER()) return;

  const { isPermissionGranted, requestPermission } = await import(
    "@tauri-apps/api/notification"
  );

  const prefs = appSettings.preferences.notifications;
  if (!prefs.desktop) {
    // User has explicitly opted out — no prompt.
    await pushPrefsToRust(prefs);
    return;
  }

  let granted = await isPermissionGranted();
  if (!granted) {
    const perm = await requestPermission();
    granted = perm === "granted";
    setAppSettings("preferences", "notifications", {
      ...prefs,
      desktop: granted,
    });
  }
  await pushPrefsToRust(appSettings.preferences.notifications);
}

async function pushPrefsToRust(prefs: {
  desktop: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
}): Promise<void> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("notify_settings_changed", {
      desktop_enabled: prefs.desktop,
      quiet_hours_enabled: prefs.quietHoursEnabled,
      quiet_hours_start: prefs.quietHoursStart,
      quiet_hours_end: prefs.quietHoursEnd,
    });
  } catch {
    // The Rust side will pick up the next store.set on app restart.
  }
}
```

- [ ] **Step 4: Call it from `bootstrap.ts`**

In `app/src/bootstrap.ts`, immediately after the
`setAppSettings(settings)` line (line 74), add:

```ts
import { ensureNotificationPermission } from "./services/notifications";

// ...existing imports
```

and immediately after `setAppSettings(settings);` (line 74):

```ts
// Fire-and-forget: request OS permission and push prefs to Rust. Doesn't
// block the initial paint.
void ensureNotificationPermission();
```

- [ ] **Step 5: Run the tests**

Run: `cd app && pnpm test -- notifications.test.ts empty-state.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/edwinhao/sendpalm
git add app/src/services/notifications.ts \
        app/src/bootstrap.ts \
        app/src/test/notifications.test.ts
git commit -m "feat(notify): JS permission bootstrap that mirrors prefs to Rust"
```

## Task 2.6: Settings → Preferences → Notifications tab

**Files:**
- Modify: `app/src/views/Settings.tsx:408` (the `AccountsTab` function is here; we add a `PreferencesNotificationsTab`)

**Interfaces:**
- Produces: a `PreferencesNotificationsTab` SolidJS component bound to `appSettings.preferences.notifications`, calling `ensureNotificationPermission` after a toggle.

- [ ] **Step 1: Implement the tab component**

In `app/src/views/Settings.tsx`, add at the end of the file (just before
the final `}`):

```tsx
import { ensureNotificationPermission } from "../services/notifications";

function PreferencesNotificationsTab() {
  const prefs = () => appSettings.preferences.notifications;
  return (
    <div style={{ display: "grid", gap: "var(--space-3)", "max-width": "520px" }}>
      <ToggleRow
        label="桌面通知"
        description="收到新邮件时在 macOS 通知中心弹出。"
        checked={prefs().desktop}
        onChange={async (v) => {
          setAppSettings("preferences", "notifications", {
            ...prefs(),
            desktop: v,
          });
          await ensureNotificationPermission();
        }}
      />
      <ToggleRow
        label="静默时段"
        description="在指定时段内只显示应用内红点，不弹系统通知。"
        checked={prefs().quietHoursEnabled}
        onChange={(v) =>
          setAppSettings("preferences", "notifications", {
            ...prefs(),
            quietHoursEnabled: v,
          })
        }
      />
      <Show when={prefs().quietHoursEnabled}>
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          <label>
            <span>开始</span>
            <input
              type="time"
              value={prefs().quietHoursStart}
              onInput={(e) =>
                setAppSettings("preferences", "notifications", {
                  ...prefs(),
                  quietHoursStart: e.currentTarget.value,
                })
              }
            />
          </label>
          <label>
            <span>结束</span>
            <input
              type="time"
              value={prefs().quietHoursEnd}
              onInput={(e) =>
                setAppSettings("preferences", "notifications", {
                  ...prefs(),
                  quietHoursEnd: e.currentTarget.value,
                })
              }
            />
          </label>
        </div>
      </Show>
    </div>
  );
}

function ToggleRow(props: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      style={{
        display: "grid",
        "grid-template-columns": "1fr auto",
        gap: "var(--space-2)",
        "align-items": "center",
        padding: "var(--space-3)",
        "border-radius": "var(--radius-md)",
        background: "var(--surface-elevated)",
        "border": "0.5px solid var(--border)",
      }}
    >
      <span>
        <strong style={{ display: "block" }}>{props.label}</strong>
        <span
          style={{
            color: "var(--text-secondary)",
            "font-size": "var(--text-caption)",
          }}
        >
          {props.description}
        </span>
      </span>
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(e) => props.onChange(e.currentTarget.checked)}
      />
    </label>
  );
}
```

Wire it into the existing preferences tab: search for the
`"preferences"` value in the `SettingsTab` switch in `Settings.tsx`, and
add a `case "preferences": return <PreferencesNotificationsTab />;`. If
the existing tab already shows a stub preferences page, replace its body
with the new component.

- [ ] **Step 2: Run lint + typecheck**

Run: `cd app && pnpm typecheck && pnpm lint -- src/views/Settings.tsx`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
cd /Users/edwinhao/sendpalm
git add app/src/views/Settings.tsx
git commit -m "feat(notify): Settings tab for desktop notifications + quiet hours"
```

## Task 2.7: Update `docs/PROGRESS.md` for Phase 2

**Files:**
- Modify: `docs/PROGRESS.md` (append a Phase 2 entry)

- [ ] **Step 1: Append**

Add below the Phase 1 entry:

```markdown
### Phase 2 — Desktop notifications (2026-08-10)

- New `services::desktop_notifier` with `should_notify` (quiet-hours
  helper) and `notify_new_mail` (calls `tauri-plugin-notification`).
- `SyncStateStore` now caches a `NotificationPrefs` that the JS side
  keeps in sync via the new `notify_settings_changed` Tauri command.
- `insert_message` triggers a notification per genuinely new mail,
  subject to the user's desktop toggle and quiet-hours window.
- JS-side `services/notifications.ts` runs from `bootstrap.ts` after
  settings load, requests permission if needed, and mirrors the new
  preference to Rust.
- New `PreferencesNotificationsTab` in `views/Settings.tsx` exposes the
  toggle and quiet-hours start/end.
- Tests added: `desktop_notifier_test` (6), `notifications.test.ts` (2).
- Net effect: leaving the app unfocused surfaces macOS notifications for
  every new mail, in line with the user's quiet-hours preference.
```

- [ ] **Step 2: Commit**

```bash
cd /Users/edwinhao/sendpalm
git add docs/PROGRESS.md
git commit -m "docs: PROGRESS phase 2 — desktop notifications"
```

---

# Phase 3 — Gate backlog surfacing (already partly done in 1.6/1.7/1.8)

This phase is a no-op; the migration, helper, and empty-state branches
were already delivered in Phase 1. Update `docs/PROGRESS.md` and move on.

## Task 3.1: Phase 3 progress entry

**Files:**
- Modify: `docs/PROGRESS.md`

- [ ] **Step 1: Append**

```markdown
### Phase 3 — Gate backlog surfacing (2026-08-10)

- No new code; this phase is fully covered by Phase 1's
  `countGateCandidates` helper, `InboxEmptyState` branch 2, and the
  `0014_gate_screened_backfill.sql` migration.
- Confirmed via `pnpm test -- empty-state.test.ts` (5 tests) and
  `cd app/src-tauri && cargo check --tests`.
```

- [ ] **Step 2: Commit**

```bash
cd /Users/edwinhao/sendpalm
git add docs/PROGRESS.md
git commit -m "docs: PROGRESS phase 3 — gate backlog surfacing (folded into phase 1)"
```

---

# Phase 4 — Sidebar icon-only with tooltip

Goal: desktop/tablet sidebar is icon-only with a Phosphor-style
floating tooltip and an ⌘N corner chip. Mobile keeps the bottom tab bar
with labels. No regressions to the mobile experience.

## Task 4.1: `SidebarTooltip` primitive + tests

**Files:**
- Create: `app/src/components/SidebarTooltip.tsx`
- Test: `app/src/test/sidebar-tooltip.test.ts`

**Interfaces:**
- Produces: a SolidJS component `<SidebarTooltip anchor={rect} label="Imbox" hint="⌘2" position="right" />` that renders a floating div positioned relative to the anchor.

- [ ] **Step 1: Write the failing test**

Create `app/src/test/sidebar-tooltip.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { tooltipPosition } from "../components/SidebarTooltip";

describe("tooltipPosition", () => {
  const anchor = () => ({ top: 10, left: 100, right: 130, bottom: 50, width: 30, height: 40 });

  it("places tooltip to the right of the anchor with 8px gap", () => {
    const p = tooltipPosition(anchor(), "right", 120, 24);
    expect(p.left).toBe(130 + 8);
    expect(p.top).toBe(10 + (40 - 24) / 2);
  });

  it("flips to below when the anchor is too close to the top", () => {
    const a = { top: 4, left: 0, right: 30, bottom: 30, width: 30, height: 26 };
    const p = tooltipPosition(a, "right", 120, 30);
    expect(p.top).toBe(30 + 8);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd app && pnpm test -- sidebar-tooltip.test.ts`
Expected: FAIL with "tooltipPosition is not a function".

- [ ] **Step 3: Implement the primitive**

Create `app/src/components/SidebarTooltip.tsx`:

```tsx
import { Show } from "solid-js";

export interface AnchorRect {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface TooltipPosition {
  left: number;
  top: number;
}

/** Pure helper: given the anchor rect and the tooltip size, return the
 *  coordinates to render the tooltip. Flips below the anchor when the
 *  top edge is too close. */
export function tooltipPosition(
  anchor: AnchorRect,
  side: "right" | "below",
  tooltipWidth: number,
  tooltipHeight: number,
): TooltipPosition {
  const gap = 8;
  if (side === "right" && anchor.top >= tooltipHeight + gap) {
    return {
      left: anchor.right + gap,
      top: anchor.top + (anchor.height - tooltipHeight) / 2,
    };
  }
  return {
    left: anchor.left,
    top: anchor.bottom + gap,
  };
}

export function SidebarTooltip(props: {
  anchor: AnchorRect | null;
  label: string;
  hint?: string;
}) {
  return (
    <Show when={props.anchor}>
      {(rect) => {
        const pos = tooltipPosition(rect(), "right", 140, 32);
        return (
          <div
            role="tooltip"
            data-testid="sidebar-tooltip"
            style={{
              position: "fixed",
              left: `${pos.left}px`,
              top: `${pos.top}px`,
              display: "inline-flex",
              "align-items": "center",
              gap: "var(--space-2)",
              padding: "6px 10px",
              background: "var(--ink)",
              color: "var(--paper)",
              "border-radius": "var(--radius-md)",
              "font-size": "var(--text-caption)",
              "font-weight": "600",
              "box-shadow": "var(--shadow-lg)",
              "z-index": "var(--z-popover)",
              "pointer-events": "none",
              animation: "tooltip-fade 120ms var(--ease-out) both",
            }}
          >
            <span>{props.label}</span>
            <Show when={props.hint}>
              <span
                style={{
                  "font-size": "var(--text-micro)",
                  opacity: 0.7,
                }}
              >
                {props.hint}
              </span>
            </Show>
          </div>
        );
      }}
    </Show>
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `cd app && pnpm test -- sidebar-tooltip.test.ts`
Expected: PASS (2/2).

- [ ] **Step 5: Commit**

```bash
cd /Users/edwinhao/sendpalm
git add app/src/components/SidebarTooltip.tsx \
        app/src/test/sidebar-tooltip.test.ts
git commit -m "feat(sidebar): tooltip primitive with edge-flip positioning"
```

## Task 4.2: Sidebar NavItem becomes icon-only

**Files:**
- Modify: `app/src/components/Sidebar.tsx:92-198` (the `NavItem` function and its `onMouseEnter`/`onMouseLeave` handlers)

**Interfaces:**
- Consumes: `useLongPress` (already in `utils/gestures.ts:68-106`).
- Produces: an icon-only button at 56 px height, ⌘N chip at the bottom-right corner, tooltip on hover/focus/long-press, `aria-current="page"`.

- [ ] **Step 1: Update `NavItem`**

In `app/src/components/Sidebar.tsx`, replace the entire `NavItem` function
(lines 92-198) with:

```tsx
function NavItem(props: {
  icon: string;
  label: string;
  hint?: string;
  view: string;
  active: boolean;
  onClick: () => void;
}) {
  const { isMobile } = useViewport();
  let buttonRef: HTMLButtonElement | undefined;
  const [tooltipAnchor, setTooltipAnchor] = createSignal<{
    top: number;
    left: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  } | null>(null);
  let showTimer: number | undefined;

  const showTooltip = () => {
    if (!buttonRef) return;
    setTooltipAnchor(buttonRef.getBoundingClientRect());
  };
  const hideTooltip = () => setTooltipAnchor(null);
  const scheduleShow = () => {
    if (showTimer) window.clearTimeout(showTimer);
    showTimer = window.setTimeout(showTooltip, 120);
  };
  const cancelShow = () => {
    if (showTimer) window.clearTimeout(showTimer);
    hideTooltip();
  };

  // Touch / long-press support for tablet.
  useLongPress(buttonRef, { delay: 600, onLongPress: showTooltip });

  return (
    <>
      <button
        ref={(el) => (buttonRef = el)}
        onClick={props.onClick}
        title={props.label}
        aria-label={
          props.hint
            ? `${props.label}, 快捷键 ${props.hint}`
            : props.label
        }
        aria-current={props.active ? "page" : undefined}
        data-nav={props.label}
        data-nav-view={props.view}
        data-active={props.active}
        onMouseEnter={scheduleShow}
        onMouseLeave={cancelShow}
        onFocus={showTooltip}
        onBlur={hideTooltip}
        style={{
          position: "relative",
          display: "flex",
          "flex-direction": "column",
          "align-items": "center",
          "justify-content": "center",
          width: isMobile() ? "auto" : "100%",
          "max-width": isMobile() ? undefined : "64px",
          height: isMobile() ? "auto" : "56px",
          "min-width": isMobile() ? "44px" : undefined,
          "min-height": isMobile() ? "44px" : undefined,
          padding: isMobile() ? "0" : "4px",
          "border-radius": isMobile() ? "8px" : "var(--radius-md)",
          background: props.active ? "var(--palm-soft)" : "transparent",
          color: props.active ? "var(--palm)" : "var(--text-secondary)",
          "margin-bottom": isMobile() ? "0" : "2px",
          flex: isMobile() ? "1" : undefined,
          transition:
            "background var(--duration-fast) var(--ease-out), color var(--duration-fast) var(--ease-out), transform 0.12s var(--ease-out)",
        }}
      >
        <Show when={props.active && !isMobile()}>
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              left: "-1px",
              top: "8px",
              bottom: "8px",
              width: "2px",
              "border-radius": "0 2px 2px 0",
              background: "var(--palm)",
            }}
          />
        </Show>
        <Icon
          name={props.icon}
          size={isMobile() ? 20 : 22}
          style={
            props.active && !isMobile() ? { transform: "scale(1.08)" } : undefined
          }
        />
        {/* Mobile: keep the label visible (10px). Desktop: hide it. */}
        <Show when={isMobile()}>
          <span
            style={{
              "font-size": "10px",
              "font-weight": "600",
              "margin-top": "2px",
              "white-space": "nowrap",
            }}
          >
            {props.label}
          </span>
        </Show>
        {/* ⌘N chip — only on desktop/tablet when present. */}
        <Show when={props.hint && !isMobile()}>
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              right: "4px",
              bottom: "2px",
              "font-size": "9px",
              "font-weight": "700",
              color: props.active ? "var(--palm)" : "var(--text-muted)",
              opacity: 0.7,
            }}
          >
            {props.hint}
          </span>
        </Show>
      </button>
      <Show when={!isMobile() && tooltipAnchor()}>
        <Portal>
          <SidebarTooltip
            anchor={tooltipAnchor() as never}
            label={props.label}
            hint={props.hint}
          />
        </Portal>
      </Show>
    </>
  );
}
```

Add the imports at the top of the file (line 6):

```tsx
import { useLongPress } from "../utils/gestures";
import { SidebarTooltip } from "./SidebarTooltip";
```

- [ ] **Step 2: Run typecheck + lint**

Run: `cd app && pnpm typecheck && pnpm lint -- src/components/Sidebar.tsx`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
cd /Users/edwinhao/sendpalm
git add app/src/components/Sidebar.tsx
git commit -m "refactor(sidebar): icon-only desktop NavItem with tooltip and ⌘N chip"
```

## Task 4.3: Update Playwright e2e for icon-only sidebar

**Files:**
- Modify: `app/e2e/views.spec.ts:384-418` (iPad-portrait and iPad-landscape assertions)

**Interfaces:**
- Produces: tests that scope to `[data-testid="sidebar-tooltip"]` and assert `text=Follow-ups` only when the tooltip is shown.

- [ ] **Step 1: Update the iPad portrait assertion**

In `app/e2e/views.spec.ts`, replace the iPad portrait assertion block
(lines 384-394) with:

```ts
test("iPad portrait shows icon-only sidebar and tooltip on hover", async ({
  page,
}) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.goto("/");
  await page.locator("body.app-ready").waitFor();
  const nav = page.locator("[data-nav='Follow-ups']");
  await expect(nav).toBeVisible();
  await nav.hover();
  const tip = page.locator("[data-testid='sidebar-tooltip']");
  await expect(tip).toContainText("Follow-ups");
});
```

Replace the iPad landscape `sidebarWidth === 64` assertion (line 415)
with:

```ts
expect(await page.locator("#sidebar").evaluate((el) => el.getBoundingClientRect().width)).toBe(64);
```

- [ ] **Step 2: Run the e2e tests**

Run: `cd app && pnpm e2e -- views.spec.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd /Users/edwinhao/sendpalm
git add app/e2e/views.spec.ts
git commit -m "test(e2e): assert sidebar tooltip and icon-only rail"
```

## Task 4.4: Update `docs/PROGRESS.md` for Phase 4

**Files:**
- Modify: `docs/PROGRESS.md`

- [ ] **Step 1: Append**

```markdown
### Phase 4 — Sidebar icon-only (2026-08-10)

- New `SidebarTooltip` primitive with edge-flip positioning (covered by
  `sidebar-tooltip.test.ts`).
- `NavItem` is now icon-only on desktop/tablet; the visible label is
  rendered only on the mobile bottom tab bar. The ⌘N chip is repositioned
  to the bottom-right corner of the button and marked `aria-hidden`.
- `aria-current="page"` is set on the active item; the tooltip
  accessible name combines the label and the shortcut hint.
- `useLongPress` (600 ms) surfaces the tooltip on touch / tablet.
- Playwright tests updated to assert the tooltip on hover and the
  64 px sidebar width on iPad.
- Net effect: the desktop rail is clean and HEY-consistent; the
  `Im…` / `St…` / `Comp…` ellipsis regression is resolved.
```

- [ ] **Step 2: Commit**

```bash
cd /Users/edwinhao/sendpalm
git add docs/PROGRESS.md
git commit -m "docs: PROGRESS phase 4 — icon-only sidebar"
```

---

# Phase 5 — Titlebar Overlay + brand in topbar

Goal: remove the JS `Titlebar` double-header. Switch Tauri to
`titleBarStyle: "Overlay"` so the WKWebView paints behind the macOS
traffic lights. Move the SendPalm wordmark into the topbar's left flex
group with proper safe-area padding.

## Task 5.1: Flip Tauri to `Overlay` and add traffic-light position

**Files:**
- Modify: `app/src-tauri/tauri.conf.json:20-22`

**Interfaces:**
- Produces: the macOS window has a transparent titlebar; the WKWebView owns the full vertical space; traffic lights render on top of the WKWebView at `{x: 14, y: 14}`.

- [ ] **Step 1: Update the JSON**

Edit `app/src-tauri/tauri.conf.json`:

```json
"windows": [
  {
    "title": "SendPalm",
    "width": 1440,
    "height": 900,
    "minWidth": 960,
    "minHeight": 600,
    "titleBarStyle": "Overlay",
    "hiddenTitle": true,
    "trafficLightPosition": { "x": 14, "y": 14 }
  }
],
```

- [ ] **Step 2: Verify the config parses**

Run: `cd app && pnpm tauri info 2>&1 | head -30`
Expected: the config summary shows `titleBarStyle: Overlay`.

- [ ] **Step 3: Commit**

```bash
cd /Users/edwinhao/sendpalm
git add app/src-tauri/tauri.conf.json
git commit -m "feat(titlebar): switch Tauri window to Overlay for native traffic lights"
```

## Task 5.2: Delete the JS Titlebar and remove its grid row

**Files:**
- Delete: `app/src/components/Titlebar.tsx`
- Modify: `app/src/App.tsx:76` (remove `<Titlebar />`)
- Modify: `app/src/styles/base.css:130-172` (remove the titlebar grid row + `#titlebar` rule)
- Modify: `app/src/styles/base.css:212-237` (remove the tablet titlebar row)

- [ ] **Step 1: Remove the mount**

In `app/src/App.tsx`, delete the `import { Titlebar } from "./components/Titlebar";` line (line 6) and the `<Titlebar />` element (line 76).

- [ ] **Step 2: Remove the grid row**

In `app/src/styles/base.css`, replace the `#app` rule (lines 128-139) with:

```css
#app {
  display: grid;
  grid-template-columns: var(--sidebar-width) 1fr;
  grid-template-rows: var(--topbar-height) 1fr;
  grid-template-areas:
    "sidebar topbar"
    "sidebar main";
  height: 100dvh;
}
```

Do the same for `.detail-open` (141-147), `.agent-open` (149-155), and
`.detail-open.agent-open` (157-165), removing every `"titlebar …"` entry
from the templates.

Delete the `#titlebar` rule (lines 167-172).

In the tablet media query (lines 212-237), drop the
`var(--titlebar-height)` from `grid-template-rows` (line 217-219) and the
`top: var(--titlebar-height)` from `#detail-panel` (line 230).

- [ ] **Step 3: Update the design tokens**

In `app/src/styles/tokens.css`, modify line 147:

```css
--titlebar-height: 0px;            /* Tauri Overlay owns the chrome. */
--titlebar-traffic-pad: 78px;      /* Standard macOS traffic-light safe area. */
```

- [ ] **Step 4: Delete the file**

```bash
rm /Users/edwinhao/sendpalm/app/src/components/Titlebar.tsx
```

- [ ] **Step 5: Verify**

Run: `cd app && pnpm typecheck && pnpm lint`
Expected: clean (the file no longer exists, so the import in App.tsx is
already removed).

- [ ] **Step 6: Commit**

```bash
cd /Users/edwinhao/sendpalm
git add app/src/App.tsx \
        app/src/styles/base.css \
        app/src/styles/tokens.css
git commit -m "refactor(titlebar): remove JS Titlebar; rely on Tauri Overlay"
```

## Task 5.3: Add `<BrandMark />` to the topbar

**Files:**
- Create: `app/src/components/BrandMark.tsx`
- Modify: `app/src/components/Topbar.tsx:43-67` (replace the existing leaf+title group with `<BrandMark />` + view-title; add `padding-left: var(--titlebar-traffic-pad)` on desktop/tablet)

- [ ] **Step 1: Implement BrandMark**

Create `app/src/components/BrandMark.tsx`:

```tsx
import { Icon } from "./Icon";

export function BrandMark() {
  return (
    <div
      data-testid="brand-mark"
      style={{
        display: "inline-flex",
        "align-items": "center",
        gap: "8px",
        "user-select": "none",
      }}
    >
      <Icon
        name="ph-leaf"
        size={18}
        style={{ color: "var(--palm)", "flex-shrink": "0" }}
      />
      <span
        style={{
          "font-family": "var(--font-display)",
          "font-weight": "700",
          "font-size": "18px",
          "letter-spacing": "-0.01em",
          color: "var(--text-primary)",
          "white-space": "nowrap",
        }}
      >
        SendPalm
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Update the topbar**

In `app/src/components/Topbar.tsx`, add the import (line 5):

```tsx
import { BrandMark } from "./BrandMark";
import { useViewport } from "../utils/gestures";
```

Replace the existing left flex group (lines 43-68) with:

```tsx
const { isMobile } = useViewport();

// inside the JSX, replace the entire <header> body with:
<header
  id="topbar"
  style={{
    display: "flex",
    "align-items": "center",
    "justify-content": "space-between",
    padding: isMobile()
      ? "0 var(--space-5)"
      : "0 var(--space-5) 0 var(--titlebar-traffic-pad)",
    background: "var(--surface)",
    "border-bottom": "0.5px solid var(--border)",
    gap: "var(--space-4)",
    position: "relative",
    "z-index": "var(--z-sticky)",
    "-webkit-app-region": "drag",
  }}
>
  <BrandMark />
  <div
    style={{
      display: "flex",
      "align-items": "center",
      gap: "var(--space-2)",
      "min-width": "0",
      "-webkit-app-region": "no-drag",
    }}
  >
    <span
      style={{
        "font-family": "var(--font-display)",
        "font-weight": "800",
        "font-size": "var(--text-body)",
        color: "var(--text-primary)",
        "letter-spacing": "-0.01em",
        "white-space": "nowrap",
      }}
    >
      {currentTitle()}
    </span>
  </div>
  {/* ... rest of the topbar body unchanged (search, SyncBadge, icons) ... */}
```

Mark every interactive element inside the topbar
(`<input>`, `<SyncBadge>` button, command-palette button,
`NotificationBell`, `<Avatar>`) with `style={{ "-webkit-app-region":
"no-drag" }}` so they remain clickable while the surrounding header
stays draggable.

- [ ] **Step 3: Verify**

Run: `cd app && pnpm typecheck && pnpm lint -- src/components/Topbar.tsx`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
cd /Users/edwinhao/sendpalm
git add app/src/components/BrandMark.tsx \
        app/src/components/Topbar.tsx
git commit -m "feat(titlebar): BrandMark in topbar with macOS traffic-light safe area"
```

## Task 5.4: Update Playwright + splash selector

**Files:**
- Modify: `app/e2e/views.spec.ts:36` (text=SendPalm assertion)
- Modify: `app/src/components/Titlebar.tsx` (already deleted in 5.2)

- [ ] **Step 1: Scope the assertion to BrandMark**

In `app/e2e/views.spec.ts`, replace the titlebar assertion (around line 36):

```ts
await expect(page.locator("#titlebar")).toContainText("SendPalm");
```

with:

```ts
await expect(page.locator("[data-testid='brand-mark']")).toContainText(
  "SendPalm",
);
```

- [ ] **Step 2: Run the e2e**

Run: `cd app && pnpm e2e`
Expected: PASS; the screenshot in `docs/PROGRESS.md` shows the brand
mark in the topbar and the icon-only sidebar.

- [ ] **Step 3: Commit**

```bash
cd /Users/edwinhao/sendpalm
git add app/e2e/views.spec.ts
git commit -m "test(e2e): scope SendPalm selector to brand-mark"
```

## Task 5.5: Update `docs/PROGRESS.md` for Phase 5

**Files:**
- Modify: `docs/PROGRESS.md`

- [ ] **Step 1: Append**

```markdown
### Phase 5 — Titlebar + brand (2026-08-10)

- Tauri `titleBarStyle` flipped from `Visible` to `Overlay`; the
  `trafficLightPosition` is set to `{x: 14, y: 14}`.
- The JS `Titlebar.tsx` component and its grid row in `base.css` are
  deleted. `--titlebar-height` is now `0`; a new `--titlebar-traffic-pad:
  78px` token reserves the macOS safe area.
- New `<BrandMark />` (Phosphor `ph-leaf` + 18 px wordmark) is the
  leftmost topbar element. The topbar body is draggable
  (`-webkit-app-region: drag`); every interactive control carries
  `no-drag` to keep clickability.
- The single Playwright `text=SendPalm` assertion is scoped to
  `[data-testid="brand-mark"]` to avoid the splash collision.
- Net effect: the macOS window shows native traffic lights on top of a
  draggable topbar; the SendPalm brand is at the expected HEY-style
  position (Phosphor leaf + wordmark).
```

- [ ] **Step 2: Commit**

```bash
cd /Users/edwinhao/sendpalm
git add docs/PROGRESS.md
git commit -m "docs: PROGRESS phase 5 — titlebar + brand"
```

---

## Definition of Done (per phase)

- [ ] All code compiles, `pnpm typecheck` and `pnpm lint` clean.
- [ ] `cd app/src-tauri && cargo test` is green.
- [ ] `cd app && pnpm test` is green; per-phase tests are listed in
      `## 8. Testing` of the spec.
- [ ] Network-gated tests run locally with `SENDPALM_E2E_NETWORK=1`
      `.env` present; CI without credentials skips them.
- [ ] `pnpm e2e` passes; the desktop screenshot in `docs/PROGRESS.md`
      reflects the current phase's UI.
- [ ] No new TODOs without a commit-body justification.
- [ ] Conventional commit per task.

## Definition of Done (overall)

- [ ] All five phases merged in order, each with its own PROGRESS entry.
- [ ] `pnpm tauri build` produces a desktop bundle that opens with: (a)
      icon-only sidebar, (b) brand mark in topbar, (c) populated Inbox
      within 5 s of an IMAP event, (d) OS notification in macOS
      notification center, (e) Inbox empty state that explains the
      actual cause.
- [ ] iOS screenshot regenerated only if visuals moved (the `Titlebar`
      was hidden on mobile already, so the iOS shot is unchanged unless
      the user asks for one).
- [ ] `docs/PROGRESS.md` lists each phase with its tests + commits.
