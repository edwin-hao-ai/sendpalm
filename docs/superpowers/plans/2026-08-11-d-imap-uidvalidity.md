# Plan D: IMAP UID fetch + UIDVALIDITY reset

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 修两个 IMAP 正确性 bug: (1) `session.fetch` → `session.uid_fetch`, (2) UIDVALIDITY 变化时 cursor 自动重置为 0 (RFC 3501 §6.4.8 严格)。

**Architecture:** 1 行 Rust 改动 (`imap.rs:212`); 抽 1 个 `detect_uid_validity_change` 纯函数 + 在 `sync_folder` 调用 + 加单元测试覆盖 3 个 case。

**Tech Stack:** Rust, async-imap (already), cargo test. No new deps.

## Global Constraints

Verbatim from spec + AGENTS.md:
- AGENTS.md §3.5: conventional commits; 1 commit at end.
- AGENTS.md §3.7: verification-before-completion.
- AGENTS.md §10.5: do NOT set `SENDPALM_E2E_NETWORK=1` (skip imap_real.rs / smtp_roundtrip.rs).
- Spec §6: DoD — 3 unit tests + cargo build + cargo test + clippy baseline.
- No `.env` / passwords / secrets staged.
- No modifications outside 2 Rust files.

---

## Task 1: imap.rs 1 行改动

**Files:**
- Modify: `app/src-tauri/src/services/imap.rs:212` (1 行)
- Read first: `app/src-tauri/src/services/imap.rs:200-220`

**Interfaces:**
- Consumes: `session.fetch(range, "(FLAGS UID ENVELOPE BODY.PEEK[])")`.
- Produces: `session.uid_fetch(...)`.

- [ ] **Step 1: 读 imap.rs:200-220 上下文**

确认 line 212 是 `session.fetch` 调用,且 line 201-205 是错误注释 (声称 async-imap 把 range 当 UID 解释)。

- [ ] **Step 2: 改 `session.fetch` → `session.uid_fetch`**

```diff
   let mut stream = session
-    .fetch(&range, "(FLAGS UID ENVELOPE BODY.PEEK[])")
+    .uid_fetch(&range, "(FLAGS UID ENVELOPE BODY.PEEK[])")
     .await
```

- [ ] **Step 3: 删除 line 201-205 的错误注释**

原文 (audit Task 3 引用 line 201-205):

```rust
// async-imap interprets the range `a:b` as UID a through UID b, which is
// **incorrect** for `Session::fetch` (sequence-fetch); per the async-imap docs,
// `uid_fetch` is required for UID-range semantics.
```

替换为空 (一行注释解释 fetch → uid_fetch 迁移即可):

```rust
// UID-range fetch via UID FETCH command (RFC 3501 §6.4.8); Session::fetch is
// sequence-based and would break after any expunge (sequence ≠ UID).
```

实际删除的注释文字以文件实际为准 (`grep -A 5 "async-imap interprets"` 验证),用简明正确的注释替换。

- [ ] **Step 4: 验证 cargo build**

```bash
cd app/src-tauri && cargo build 2>&1 | tee qa-tmp/audit-2026-08-11-fix-d-cargo-build.log
```

预期: 0 errors (1 行 + 注释替换,不破坏类型)。

- [ ] **Step 5: 不 commit**

---

## Task 2: sync_loop.rs UIDVALIDITY 失效检测 + cursor 重置

**Files:**
- Modify: `app/src-tauri/src/services/sync_loop.rs` (加纯函数 + 在 sync_folder 调用)
- Read first: `app/src-tauri/src/services/sync_loop.rs:480-510` (sync_folder 函数)

**Interfaces:**
- Consumes: 现有 sync_folder 函数,account.uid_validity 已存在 (line 492)。
- Produces:
  - 新 `detect_uid_validity_change(stored: u32, current: u32) -> Option<u32>` 纯函数
  - sync_folder 在赋值 uid_validity 之前调用并按需重置 cursor

- [ ] **Step 1: 读 sync_loop.rs:480-510 确认结构**

定位 `account.last_uid = new_last_uid; account.uid_validity = new_uv;` 行。

- [ ] **Step 2: 加纯函数 `detect_uid_validity_change`**

放在文件顶部 (use 之后) 或 sync_folder 之上。建议:

```rust
/// RFC 3501 §6.4.8: UIDVALIDITY change invalidates the UID cursor cache.
/// Returns `Some(0)` to signal cursor reset, `None` to keep current cursor.
/// First sync (stored == 0) is treated as initial sync, no reset.
fn detect_uid_validity_change(stored: u32, current: u32) -> Option<u32> {
  if stored != 0 && stored != current { Some(0) } else { None }
}
```

- [ ] **Step 3: 在 sync_folder 加调用**

在 `account.last_uid = new_last_uid; account.uid_validity = new_uv;` 之前插入:

```rust
// RFC 3501 §6.4.8: detect UIDVALIDITY change → reset cursor.
if let Some(reset_to) = detect_uid_validity_change(account.uid_validity, new_uv) {
  eprintln!(
    "[sync_loop] UIDVALIDITY changed for {folder} ({} → {}); resetting cursor to {}",
    account.uid_validity, new_uv, reset_to
  );
  cursor = reset_to;
}
account.last_uid = new_last_uid;
account.uid_validity = new_uv;
```

- [ ] **Step 4: 验证 cargo build**

```bash
cd app/src-tauri && cargo build 2>&1 | tee qa-tmp/audit-2026-08-11-fix-d-cargo-build-2.log
```

预期: 0 errors。

- [ ] **Step 5: 不 commit**

---

## Task 3: 单元测试 sync_loop.rs

**Files:**
- Modify: `app/src-tauri/src/services/sync_loop.rs` (末尾加 `#[cfg(test)] mod tests`)
- Read first: `app/src-tauri/src/services/sync_loop.rs` 末尾

**Interfaces:**
- Consumes: 纯函数 `detect_uid_validity_change`。
- Produces: 3 个 unit tests 覆盖 stored==current / stored!=current / stored==0 (initial)。

- [ ] **Step 1: 读 sync_loop.rs 末尾**

找合适位置插入 `#[cfg(test)] mod tests` (通常在最后一个 use 之后,文件末尾)。

- [ ] **Step 2: 加 tests 模块**

```rust
#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn uid_validity_unchanged_keeps_cursor() {
    assert_eq!(detect_uid_validity_change(123, 123), None);
  }

  #[test]
  fn uid_validity_changed_resets_cursor_to_zero() {
    assert_eq!(detect_uid_validity_change(123, 456), Some(0));
    assert_eq!(detect_uid_validity_change(1, u32::MAX), Some(0));
  }

  #[test]
  fn uid_validity_initial_sync_does_not_reset() {
    // stored == 0 means we have no prior UIDVALIDITY recorded; this is
    // either a brand-new account or a wiped cursor — treat as initial sync.
    assert_eq!(detect_uid_validity_change(0, 123), None);
    assert_eq!(detect_uid_validity_change(0, 0), None);
  }
}
```

- [ ] **Step 3: 跑 cargo test (不带 SENDPALM_E2E_NETWORK)**

```bash
cd app/src-tauri && cargo test 2>&1 | tee qa-tmp/audit-2026-08-11-fix-d-cargo-test.log
```

预期: 现有 + 3 新 = 全绿;新 3 个 it-block 全 pass。

- [ ] **Step 4: 不 commit**

---

## Task 4: 全套验证 + commit

**Files:**
- Stage: `app/src-tauri/src/services/imap.rs`, `app/src-tauri/src/services/sync_loop.rs`

- [ ] **Step 1: cargo build + clippy**

```bash
cd app/src-tauri && cargo build 2>&1 | tee qa-tmp/audit-2026-08-11-fix-d-cargo-build-final.log
cd app/src-tauri && cargo clippy --all-targets 2>&1 | tee qa-tmp/audit-2026-08-11-fix-d-cargo-clippy.log
```

预期: 0 errors;clippy 状态不变 (Sub-A 留下的 baseline)。

- [ ] **Step 2: cargo test 全套**

```bash
cd app/src-tauri && cargo test 2>&1 | tee qa-tmp/audit-2026-08-11-fix-d-cargo-test-full.log
```

预期: 全绿 (现有 + 3 新)。

- [ ] **Step 3: 无 secret**

```bash
git diff --cached --name-only | grep -E "\.env$|password|secret" || echo "ok no secrets"
```

- [ ] **Step 4: 仅 2 文件 staged**

```bash
git diff --cached --name-only
```

预期: `app/src-tauri/src/services/imap.rs`, `app/src-tauri/src/services/sync_loop.rs` — 2 文件。

- [ ] **Step 5: 1 commit**

```bash
cd /Users/edwinhao/sendpalm
git add app/src-tauri/src/services/imap.rs \
        app/src-tauri/src/services/sync_loop.rs
git commit -m "fix(imap): use UID fetch + reset cursor on UIDVALIDITY change" \
  -m "Per audit report 2026-08-11 (commit cb95452) §3.1 +
§7 HIGH-risk #5: imap.rs:213 used session.fetch (sequence)
with a UID-range string. Coincidentally correct on pristine
mailboxes; broke after any expunge because sequence numbers
diverge from UIDs. Switch to session.uid_fetch (the
async-imap method that issues UID FETCH).

Also §7 MED-risk: sync_loop.rs had no UIDVALIDITY-change
detection. Per RFC 3501 §6.4.8, when UIDVALIDITY changes the
UID cursor cache is invalid and the client must reset to
UID 1. Add detect_uid_validity_change() pure function +
sync_folder invocation that resets cursor to 0 on change
(per brainstorm §3.1 user pick: RFC-strict path). Existing
chunked backfill (MAX_PER_TICK = 200) handles the resulting
full re-sync naturally; only the first sync after a
UIDVALIDITY change is slow.

Tests: 3 cargo unit tests cover detect_uid_validity_change
(unchanged → None, changed → Some(0), initial sync with
stored=0 → None).

Refs: docs/superpowers/specs/2026-08-11-d-imap-uidvalidity-design.md
Refs: docs/superpowers/audit/2026-08-11-email-html-link-audit.md §3.1, §7"
```

- [ ] **Step 6: 验证 commit**

```bash
git log --oneline -3
git show --stat HEAD | head -8
```

预期: 1 commit `fix(imap): use UID fetch + reset cursor on UIDVALIDITY change`, 2 files changed.

---

## Self-Review

**1. Spec coverage:**
- Spec §1 (背景) → Tasks 1-2 rationale ✅
- Spec §2 (目标) → Tasks 1-2 deliverables ✅
- Spec §4 (Architecture) → Tasks 1-2 ✅
- Spec §5.1 (imap.rs) → Task 1 ✅
- Spec §5.2 (sync_loop.rs) → Tasks 2-3 ✅
- Spec §6 (DoD) → Task 4 ✅
- Spec §7 (risks) → Task 4 step 4 (UIDVALIDITY reset triggers full re-sync) ✅
- Spec §8 (references) → Task 4 step 5 commit body ✅

**2. Placeholder scan:**
- "TBD" / "TODO" → 0

**3. Type/接口 一致性:**
- Task 1: `session.fetch` → `session.uid_fetch` (both methods exist on async-imap Session) ✅
- Task 2: `detect_uid_validity_change(stored: u32, current: u32) -> Option<u32>` — pure, testable ✅
- Task 3: 3 unit tests cover the 3 cases ✅
- Log files use `fix-d-*` prefix distinct from audit + Sub-A/B/C ✅