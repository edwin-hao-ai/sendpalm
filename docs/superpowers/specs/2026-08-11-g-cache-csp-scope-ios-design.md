# G. SendPalm 收尾：Cache Cap + CSP + Sub-E Nit + iOS Build Attempt

> Spec authored 2026-08-11. Status: Draft. Sub-project G of the 2026-08-11 email/HTML/link audit fix series (commit `cb95452`). 6 个 fix sub-project 全部完成 (A-F),本 sub-project 处理所有 deferred/parked 项。

## 1. 背景

`cb95452` §7 修复候选清单 22 条,Sub-A 到 Sub-F 处理了前 6 顺位 (HIGH 风险)。剩 deferred:

| 项 | 风险 | Sub-G 处理 |
|---|---|---|
| Cache size cap / LRU eviction | MED (磁盘占满) | ✅ 加 |
| `tauri.conf.json` csp: null (整体安全降级) | MED | ✅ 启用严格 CSP |
| Sub-E handler scope `.sp-plaintext-body` (final review parked nit) | LOW | ✅ 收紧 |
| iOS WKWebView 真机验证 | N/A | ✅ best effort build attempt |

## 2. 目标

- 邮件图片 proxy cache 上限 100MB,LRU 淘汰
- `tauri.conf.json` 启用严格 CSP (default-src 'self' 'unsafe-inline'; img-src 'self' data: https://*; style-src 'self' 'unsafe-inline')
- MessagePanel handler scope 从 `message-panel-root` 收紧到 `.sp-plaintext-body`
- iOS simulator build attempt (`pnpm tauri ios build`),记录成功/失败 (本会话无 macOS+Xcode 真机交互,但 build 步骤可以记录)

## 3. 非目标

- ❌ 不实现 ML-based tracking pixel detection (over-engineering)
- ❌ 不实现 per-mailbox UIDVALIDITY (Sub-D 单值已够用)
- ❌ 不实现图片 format conversion (Sub-F 原样透传)
- ❌ 不修复 pre-existing dirty 文件 (AGENTS.md / .gitignore / `.claude/` 等)
- ❌ 不跑 iOS 真机 UI 交互验证 (本会话无 Xcode + 没 AppleScript 权限)

## 4. Architecture

### 4.1 Cache cap (LRU)

`app/src-tauri/src/services/image_proxy.rs`:

加 1 个新函数 `enforce_cache_cap(cache_dir: &Path, max_bytes: u64)`:

```rust
pub async fn enforce_cache_cap(cache_dir: &Path, max_bytes: u64) -> Result<(), String> {
  let mut entries = tokio::fs::read_dir(cache_dir).await.map_err(...)?
    .filter_map(Result::ok)
    .filter_map(|e| async {
      let meta = e.metadata().await.ok()?;
      let modified = meta.modified().ok()?;
      Some((e.path(), meta.len(), modified))
    })
    .collect::<::<Vec<_>>().await;
  
  let mut total: u64 = entries.iter().map(|(_, s, _)| *s).sum();
  if total <= max_bytes { return Ok(()); }
  
  // Sort by mtime ascending (oldest first).
  entries.sort_by_key(|(_, _, m)| *m);
  
  for (path, size, _) in entries {
    if total <= max_bytes { break; }
    if tokio::fs::remove_file(&path).await.is_ok() {
      total -= size;
    }
  }
  Ok(())
}
```

`fetch_image` Tauri command 末尾调用 `enforce_cache_dir(&cache_dir, 100 * 1024 * 1024)` 在 fetch 后。

### 4.2 CSP 启用

`app/src-tauri/tauri.conf.json` 当前 `csp: null`。改为:

```json
{
  "csp": "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self' ipc: http://ipc.localhost"
}
```

**注意**:
- `'unsafe-inline'` script 是必需的 (srcdoc 注入的内联 `<script>`)
- `'unsafe-inline'` style 是必需的 (srcdoc `<style>`)
- `connect-src` 必须含 `ipc: http://ipc.localhost` (Tauri 2 IPC)
- `img-src https:` 允许 Sub-C DOMPurify 重写后的 `https://` 外链图 (实际 Sub-F 后是 `data:` 但允许 https 不会破坏)
- 不允许 `object-src` / `frame-src` / `script-src-elem` —— 邮件渲染在 iframe `内`,iframe sandbox 单独限制

### 4.3 Sub-E handler scope

`app/src/panels/MessagePanel.tsx`:

- Move `onClick={handlePlainTextLinkClick}` from `message-panel-root` div to `.sp-plaintext-body` div (the plain-text view container)
- Remove dead `class="sp-plaintext-body"` no-op (still needed for selector)

### 4.4 iOS simulator build attempt

尝试:
```bash
cd app && pnpm tauri ios build 2>&1 | tee qa-tmp/audit-2026-08-11-fix-g-ios-build.log
```

预期: 可能失败 (无 Xcode 工具链),或 build 出 bundle 但无法 boot simulator。记录实际结果。如果 build 系统不支持,记录 "skipped: iOS toolchain unavailable".

## 5. 改动清单

| 文件 | 改动 |
|---|---|
| `app/src-tauri/src/services/image_proxy.rs` | 加 `enforce_cache_cap` + 在 `fetch_image` 调用 |
| `app/src-tauri/src/commands/image_proxy.rs` | `fetch_image` 末尾 `enforce_cache_cap` |
| `app/src-tauri/src/services/image_proxy.rs` (tests) | 加 2 测试: `enforce_cache_cap` 删除最早文件 / 在 cap 以下不动 |
| `app/src-tauri/tauri.conf.json` | `csp: null` → 严格 CSP |
| `app/src/panels/MessagePanel.tsx` | handler scope 从 `message-panel-root` 收紧到 `.sp-plaintext-body` div |

## 6. Definition of DoD

- [ ] `image_proxy.rs` 加 `enforce_cache_cap` + 2 unit tests
- [ ] `commands/image_proxy.rs` 在 fetch_image 末尾调用
- [ ] `tauri.conf.json` `csp` 启用严格策略
- [ ] `MessagePanel.tsx` handler 移到 `.sp-plaintext-body` div
- [ ] cargo build + cargo test 全绿 (现有 70 + 2 新 = 72)
- [ ] pnpm test + pnpm typecheck 全绿 (现有 156 + 0 = 156,无新测试)
- [ ] pnpm lint 状态不变
- [ ] 尝试 `pnpm tauri ios build`,记录 log (无论成功失败)
- [ ] 1 个 conventional commit `fix(security): image cache cap + strict CSP + scope tight + iOS build attempt`
- [ ] 不写 `docs/PROGRESS.md`

## 7. 风险

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| CSP 'unsafe-inline' 被禁 (subresource integrity 严格) | 中 | srcdoc `<script>`/`<style>` 不执行 | spec 已声明必须 'unsafe-inline';后续 Sub-H 可升级 nonce-based CSP |
| LRU 淘汰误删 active cache (并发) | 低 | 下次 fetch 重新下载 (无害) | 单进程顺序操作;锁不是必需的 |
| CSP 太严导致正常功能失效 | 中 | 邮件/UI 坏掉 | 先在 dev build 跑过 `pnpm tauri dev` (本会话无 .env,跳过); 后续 manual |
| iOS build 失败 | 高 | log 里记录 "skipped: toolchain unavailable" | 不阻塞 commit;记录到 commit body 或 final report |
| 邮件里有 `<form>` action="javascript:" | 极低 | XSS | DOMPurify 已 strip `<form>` (Sub-C FORBID_TAGS) |

**回退**: 1 commit `git revert <sha>`。

## 8. References

- Audit report: `docs/superpowers/audit/2026-08-11-email-html-link-audit.md` §7
- Audit commit: `cb95452`
- Sub-F: `docs/superpowers/specs/2026-08-11-f-image-proxy-sender-policy-design.md` (cache size cap risk §7)
- Sub-C: `docs/superpowers/specs/2026-08-11-c-tracking-pixels-table-styles-design.md` (CSP risk §7)
- Sub-E final review: `.superpowers/sdd/2026-08-11-e-plaintext-url-autolink/final-review.md` (parked nit)
- AGENTS.md §10.6 (iOS verification caveats)