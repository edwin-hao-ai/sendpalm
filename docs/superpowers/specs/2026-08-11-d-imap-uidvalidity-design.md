# D. SendPalm IMAP UID fetch + UIDVALIDITY 重置

> Spec authored 2026-08-11. Status: Draft. Sub-project D of the 2026-08-11 email/HTML/link audit fix series (commit `cb95452`). 5 个独立 sub-project 之一 (A/B/C/E 各有独立 spec/plan/implementation)。

## 1. 背景与问题

`cb95452` §3.1 + §7:
- 🟡 `imap.rs:212-215` 用 `session.fetch(...)` (sequence-fetch) 喂 UID-range string — 巧合正确于 pristine mailbox,任何 expunge 后 sequence≠UID,拉错邮件
- 🟡 `sync_loop.rs` 不检测 UIDVALIDITY 变化 — RFC 3501 §6.4.8 要求 UIDVALIDITY 改变时 cursor 必须失效,当前代码跨 validity 边界继续用旧 cursor

## 2. 目标

1. `session.fetch` → `session.uid_fetch` (1 行),所有 IMAP 拉取走 UID-based 协议命令
2. UIDVALIDITY 失效检测 + cursor 自动重置为 0 (RFC 3501 §6.4.8 严格)
3. 现有 chunked backfill 循环 (`MAX_PER_TICK = 200`) 自然处理 full re-sync

## 3. 非目标

- ❌ 不动 Rust 邮件解析 / 发送逻辑 (Sub-A/C 与本次无关)
- ❌ 不动前端代码
- ❌ 不实现 `imap.rs` 的 mock test (async-imap Session 难以 mock;靠 code review + 后续网络集成测试覆盖)
- ❌ 不实现 per-mailbox UIDVALIDITY tracking (现 `account.uid_validity` 是 per-account 单值,够用)

## 4. Architecture

**改动 1: imap.rs:212-215 fetch → uid_fetch**

```diff
   let end_uid = last_uid.saturating_add(MAX_PER_TICK);
   let range = format!("{start_uid}:{end_uid}");
   eprintln!("[imap] UID FETCH {range} on {mailbox_name}");
   let mut stream = session
-    .fetch(&range, "(FLAGS UID ENVELOPE BODY.PEEK[])")
+    .uid_fetch(&range, "(FLAGS UID ENVELOPE BODY.PEEK[])")
     .await
```

**改动 2: sync_loop.rs UIDVALIDITY 失效检测**

在 `sync_folder` 函数 (大约 line 491) `account.last_uid = new_last_uid; account.uid_validity = new_uv;` 之前,加 comparison + reset:

```rust
// RFC 3501 §6.4.8: UIDVALIDITY change invalidates the UID cursor cache.
// On change, reset cursor to 0 to force full re-sync from UID 1.
if account.uid_validity != 0 && new_uv != account.uid_validity {
  eprintln!(
    "[sync_loop] UIDVALIDITY changed for {folder} ({} → {}); resetting cursor to 0",
    account.uid_validity, new_uv
  );
  cursor = 0;
}
account.last_uid = new_last_uid;
account.uid_validity = new_uv;
```

**测试覆盖**

`app/src-tauri/src/services/sync_loop.rs` 末尾加 `#[cfg(test)] mod tests` 单元测试:

```rust
#[cfg(test)]
mod tests {
  use super::*;
  // Build a test with mock uid_validity change:
  // - construct account with uid_validity=123
  // - call detect_uid_validity_change(123, 123) → no reset
  // - call detect_uid_validity_change(123, 456) → reset to 0
  // - call detect_uid_validity_change(0, 456) → no reset (initial sync)
}
```

为便于测试,把失效检测抽成 1 个纯函数 `detect_uid_validity_change(stored: u32, current: u32) -> Option<u32>` 返回 `Some(0)` 如果应重置 / `None` 如果保持。

## 5. 改动清单

### 5.1 `app/src-tauri/src/services/imap.rs:212`

1 行: `session.fetch(...)` → `session.uid_fetch(...)`。删除 line 201-205 的错误注释 (声称 async-imap 把 range `a:b` 当 UID 解释 — 那描述错误,本次一并修正)。

### 5.2 `app/src-tauri/src/services/sync_loop.rs`

**(a)** 抽纯函数 `detect_uid_validity_change(stored, current) -> Option<u32>` 便于测试。

**(b)** `sync_folder` (大约 line 491) 加 UIDVALIDITY 失效检测 + cursor 重置 (如 §4 改动 2 代码)。

**(c)** 末尾加 `#[cfg(test)] mod tests` 单元测试。

## 6. Definition of Done

- [ ] `app/src-tauri/src/services/imap.rs` 1 行: fetch → uid_fetch
- [ ] `app/src-tauri/src/services/sync_loop.rs` 加 `detect_uid_validity_change` 纯函数
- [ ] `app/src-tauri/src/services/sync_loop.rs` 加 UIDVALIDITY 失效检测 + cursor 重置
- [ ] `app/src-tauri/src/services/sync_loop.rs` 加 ≥3 个单元测试覆盖 stored==current / stored!=current / stored==0 (initial)
- [ ] `cargo build` 全绿
- [ ] `cargo test` 全绿 (现有 + 新增 ≥3 个)
- [ ] `cargo clippy` 状态不变
- [ ] 1 个 conventional commit `fix(imap): use UID fetch + reset cursor on UIDVALIDITY change`
- [ ] 不写 `docs/PROGRESS.md`

## 7. 风险

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| 抽纯函数改动 `sync_folder` 调用链 | 低 | 编译错 | 保留原函数签名,纯函数 internal use only |
| 真实邮箱 UIDVALIDITY 变化时全量重拉 10K+ 邮件 | 高 (RFC 严格) | 用户感知首次慢 | log 明显 warning;后续增量同步不受影响 |
| 测试用 mock 难写 | 中 | 测试覆盖不全 | 抽纯函数后只需测函数本身,无需 mock IMAP session |
| 已有 `imap.rs:201-205` 错误注释被删除 | 极低 | 不影响行为 | 注释错误,本次修正确 |
| UIDVALIDITY 比较放在循环外 vs 循环内 | 低 | 性能 | 每次 sync_folder 入口检查一次,循环内只读 |

**回退**: 1 commit `git revert <sha>`。

## 8. References

- Audit report: `docs/superpowers/audit/2026-08-11-email-html-link-audit.md` §3.1, §7
- Audit commit: `cb95452`
- RFC 3501 §6.4.8: https://datatracker.ietf.org/doc/html/rfc3501#section-6.4.8
- AGENTS.md §10.5 (multi-account sync, `account.last_uid` / `uid_validity` 字段)