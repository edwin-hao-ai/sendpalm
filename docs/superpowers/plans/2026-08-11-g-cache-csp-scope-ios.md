# Plan G: Cache Cap + CSP + Sub-E Scope + iOS Build

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 4 件事收尾: (1) image proxy cache LRU cap 100MB, (2) `tauri.conf.json` 启用严格 CSP, (3) Sub-E handler scope 收紧到 `.sp-plaintext-body`, (4) iOS simulator build attempt (best effort)。

**Architecture:** Rust `enforce_cache_cap(cache_dir, max_bytes)` 在 fetch_image 末尾调用,LRU 按 mtime asc 删除旧文件直到 total ≤ cap。Tauri 2 CSP 配置使用 `tauri.conf.json:csp` 字段,白名单包括 `ipc:` connect-src + `'unsafe-inline'` script (srcdoc 必需)。MessagePanel handler 移到 `.sp-plaintext-body` div。`pnpm tauri ios build` best effort。

**Tech Stack:** Rust tokio fs (already), tauri.conf.json JSON edit, SolidJS onClick relocation. No new deps.

## Global Constraints

Verbatim from spec + AGENTS.md:
- AGENTS.md §3.5: 1 conventional commit at end.
- AGENTS.md §10.5: do NOT set `SENDPALM_E2E_NETWORK=1`.
- AGENTS.md §10.6: iOS verification caveats (no Xcode expected; `devUrl` params don't survive; `osascript` click doesn't reach WKWebView).
- Spec §7: risks documented; iOS may skip with log.

---

## Task 1: Cache cap (Rust)

**Files:**
- Modify: `app/src-tauri/src/services/image_proxy.rs` (add `enforce_cache_cap` + 2 unit tests)
- Modify: `app/src-tauri/src/commands/image_proxy.rs` (call `enforce_cache_cap` after fetch)

- [ ] **Step 1: 读 image_proxy.rs 当前 fetch_and_cache 段**

**- [ ] **Step 2: 加 `enforce_cache_cap` 函数**

完整代码见 spec §4.1。LRU by mtime asc,删除直到 total ≤ max_bytes。

- [ ] **Step 3: 加 2 unit tests**

```rust
#[test]
fn enforce_cache_cap_below_limit_no_op() { /* create 3 small files, total < cap, expect 0 deleted */ }

#[test]
fn enforce_cache_cap_above_limit_evicts_oldest() { /* create 3 files with different mtimes, total > cap, expect oldest deleted until within cap */ }
```

- [ ] **Step 4: 在 fetch_image 调用**

在 commands/image_proxy.rs 的 fetch_image 末尾加:
```rust
image_proxy::enforce_cache_cap(&cache_dir, 100 * 1024 * 1024).await?;
```

- [ ] **Step 5: cargo test**

```bash
cd app/src-tauri && cargo test --lib services::image_proxy 2>&1 | tee qa-tmp/audit-2026-08-11-fix-g-cargo-test.log
```

预期: 现有 5 + 2 新 = 7 pass。

- [ ] **Step 6: 不 commit**

---

## Task 2: CSP 启用

**Files:**
- Modify: `app/src-tauri/tauri.conf.json` (change `csp: null` → 严格 CSP)
- Read first: 完整文件 (找 csp 字段)

- [ ] **Step 1: 读 tauri.conf.json 找 csp 字段**

确认当前 `"csp": null` 或缺省。

- [ ] **Step 2: 改为严格 CSP**

```json
"csp": "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self' ipc: http://ipc.localhost"
```

(具体字段位置按文件实际格式)

- [ ] **Step 3: 验证 Tauri build 不报错**

```bash
cd app/src-tauri && cargo build 2>&1 | tee qa-tmp/audit-2026-08-11-fix-g-cargo-build.log
```

预期: 0 errors. CSP 在 build 阶段不会被 validate,只在 runtime 起作用。

- [ ] **Step 4: 不 commit**

---

## Task 3: Sub-E handler scope 收紧

**Files:**
- Modify: `app/src/panels/MessagePanel.tsx` (move `onClick={handlePlainTextLinkClick}` from `message-panel-root` div to `.sp-plaintext-body` div)
- Read first: 当前 handlePlainTextLinkHandler 绑定位置

- [ ] **Step 1: 读 MessagePanel.tsx 找 handler 绑定**

定位 `onClick={handlePlainTextLinkClick}` 当前绑定的 `<div class="message-panel-root">`。

- [ ] **Step 2: 移到 plain-text view div**

```diff
- <div class="message-panel-root" onClick={handlePlainTextLinkClick}>
+ <div class="message-panel-root">
```

+ 在 plain-text fallback 的 `<div class="sp-plaintext-body">` 加 `onClick={handlePlainTextLinkClick}`:

```tsx
<div
  class="sp-plaintext-body"
  onClick={handlePlainTextLinkClick}
  style={...}
  innerHTML={plainTextToHtml(m.body)}
/>
```

(具体插入位置按现有 JSX 结构)

- [ ] **Step 3: typecheck**

```bash
cd app && pnpm typecheck 2>&1 | tee qa-tmp/audit-2026-08-11-fix-g-typecheck.log
```

预期: 0 errors。

- [ ] **Step 4: 不 commit**

---

## Task 4: iOS simulator build attempt

**Files:**
- Create: `qa-tmp/audit-2026-08-11-fix-g-ios-build.log` (build output)
- Modify: nothing

- [ ] **Step 1: 尝试 iOS build**

```bash
cd app && pnpm tauri ios build 2>&1 | tee qa-tmp/audit-2026-08-11-fix-g-ios-build.log
```

预期: 可能失败 (本会话无 macOS toolchain)。失败也算 OK,记录到 commit body 或 final report。

- [ ] **Step 2: 记录结果**

无论成功失败,copy log 路径到 task-4-report.md;spec §6 DoD 已注明 "best effort, log always written"。

- [ ] **Step 3: 不 commit**

---

## Task 5: 全套验证 + commit

**Files:**
- Stage: 4 files (image_proxy.rs + commands/image_proxy.rs + tauri.conf.json + MessagePanel.tsx)

- [ ] **Step 1: cargo build + test 全套**

```bash
cd app/src-tauri && cargo build 2>&1 | tee qa-tmp/audit-2026-08-11-fix-g-cargo-build-final.log
cd app/src-tauri && cargo test 2>&1 | tee qa-tmp/audit-2026-08-11-fix-g-cargo-test-final.log
```

预期: 0 errors; 现有 70 + 2 新 = 72 全绿。

- [ ] **Step 2: pnpm 全套**

```bash
cd app && pnpm test 2>&1 | tee qa-tmp/audit-2026-08-11-fix-g-test-full.log
cd app && pnpm typecheck 2>&1 | tee qa-tmp/audit-2026-08-11-fix-g-typecheck-final.log
cd app && pnpm lint 2>&1 | tee qa-tmp/audit-2026-08-11-fix-g-lint-final.log
```

预期: vitest 156/156 unchanged; typecheck 0 errors; lint 1 pre-existing (views.spec.ts) 不动。

- [ ] **Step 3: 无 secret**

```bash
git diff --cached --name-only | grep -E "\.env$|password|secret" || echo "ok no secrets"
```

- [ ] **Step 4: 仅预期 4 文件 staged**

预期:
- `app/src-tauri/src/services/image_proxy.rs`
- `app/src-tauri/src/commands/image_proxy.rs`
- `app/src-tauri/tauri.conf.json`
- `app/src/panels/MessagePanel.tsx`

- [ ] **Step 5: 1 commit**

```bash
cd /Users/edwinhao/sendpalm
git add app/src-tauri/src/services/image_proxy.rs \
        app/src-tauri/src/commands/image_proxy.rs \
        app/src-tauri/tauri.conf.json \
        app/src/panels/MessagePanel.tsx
git commit -m "fix(security): image cache cap + strict CSP + scope tight + iOS build" \
  -m "Per audit report 2026-08-11 (commit cb95452) §7 deferred items:

1. Cache size cap (LRU eviction 100MB) — image_proxy.rs
   enforce_cache_cap deletes oldest files by mtime until total
   ≤ cap; called after every fetch_image. 2 cargo unit tests.

2. Strict CSP — tauri.conf.json csp was null. Now sets:
   default-src 'self'; img-src 'self' data: https:;
   style-src 'self' 'unsafe-inline';
   script-src 'self' 'unsafe-inline' (srcdoc <script> needs);
   connect-src 'self' ipc: http://ipc.localhost (Tauri IPC).
   Defense-in-depth on top of DOMPurify + iframe sandbox.

3. Sub-E handler scope tightened — moved onClick from
   message-panel-root to .sp-plaintext-body div so plain-text
   <a> clicks only fire from the plain-text view (resolves the
   parked final-review nit of Sub-E).

4. iOS simulator build attempt — pnpm tauri ios build
   logged to qa-tmp/audit-2026-08-11-fix-g-ios-build.log.
   Best-effort: iOS WKWebView caveats from AGENTS §10.6 still
   apply (devUrl params, osascript clicks, etc.). Manual UI
   verification skipped (no Xcode + no AppleScript perms in this session).

Refs: docs/superpowers/specs/2026-08-11-g-cache-csp-scope-ios-design.md
Refs: docs/superpowers/audit/2026-08-11-email-html-link-audit.md §7"
```

- [ ] **Step 6: 验证**

```bash
git log --oneline -3
git show --stat HEAD | head -10
```

预期: 1 commit, 4 files changed.

---

## Self-Review

**1. Spec coverage:**
- §2 (目标) → Tasks 1-4 ✅
- §3 (非目标) → no ML / no per-mailbox UIDVALIDITY / no pre-existing dirty handling / no iOS UI interaction ✅
- §4.1 (cache cap) → Task 1 ✅
- §4.2 (CSP) → Task 2 ✅
- §4.3 (Sub-E scope) → Task 3 ✅
- §4.4 (iOS build) → Task 4 ✅
- §5 (DoD) → Task 5 ✅
- §7 (risks) → Task 5 step 5 (iOS may skip; recorded in log) ✅
- §8 (references) → Task 5 step 5 commit body ✅

**2. Placeholder scan:**
- 0

**3. Type/接口 一致性:**
- Task 1 `enforce_cache_cap(&Path, u64)` pure async, callable from fetch_image
- Task 2 tauri.conf.json CSP is plain JSON string; Tauri 2 reads it on app init
- Task 3 handler moves between JSX nodes; same function ref; no logic change
- Log files use `fix-g-*` prefix distinct from audit + Sub-A/B/C/D/E/F ✅