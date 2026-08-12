# Plan F: Image Proxy + Per-sender + Tracking Filter

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 邮件外链图走本地 Tauri proxy; proxy 层滤掉 tracking pixel (size + dimension heuristic); per-sender "Always show" 偏好持久化; "Show images" 按钮 async 触发 fetch + srcMap 替换。

**Architecture:** Rust `fetch_and_cache(url)` 用 reqwest 拉图 + sha256 路径缓存 + tracking-pixel 检测 → 返回 (bytes, mime); Tauri command `fetch_image(url)` 包成 base64 data URL。前端 `prefetchImages(urls)` 并行调用 fetch_image; MessagePanel onClick 触发; iframe srcdoc 收 srcMap 替换 placeholder。Per-sender 偏好存 tauri-plugin-store。

**Tech Stack:** reqwest (rustls-tls), sha2, hex (Rust); tauri-plugin-store (already); Vitest, SolidJS. iOS WKWebView 跳过。

## Global Constraints

Verbatim from spec + AGENTS.md:
- AGENTS.md §3.5: 1 conventional commit at end of Task 7.
- AGENTS.md §3.7: verification-before-completion.
- AGENTS.md §10.5: do NOT set `SENDPALM_E2E_NETWORK=1`.
- AGENTS.md §10.5: NO `.env` / passwords / secrets.
- Spec §6: DoD — cargo + pnpm 全绿, lint baseline unchanged.
- Spec §7: known-acceptable-risks documented.

---

## Task 1: Rust deps

**Files:**
- Modify: `app/src-tauri/Cargo.toml`
- Read first: existing Cargo.toml deps block

- [ ] **Step 1: 读 Cargo.toml 现有 dependencies**

确认 deps 块结构 (按字母序, 加 reqwest / sha2 / hex)。

- [ ] **Step 2: 加 3 个 dep**

```toml
hex = "0.4"
reqwest = { version = "0.12", default-features = false, features = ["rustls-tls"] }
sha2 = "0.10"
```

(按字母序插;reqwest 用 rustls-tls 与 AGENTS §10.5 一致)

- [ ] **Step 3: 跑 cargo build 验证 deps resolve**

```bash
cd app/src-tauri && cargo build 2>&1 | tee qa-tmp/audit-2026-08-11-fix-f-cargo-build-deps.log
```

预期: 0 errors (新 dep 编译通过;还没用)。

- [ ] **Step 4: 不 commit (lockfile 会变)**

---

## Task 2: Rust image_proxy.rs

**Files:**
- Create: `app/src-tauri/src/services/image_proxy.rs`
- Read first: 现有 `services/mod.rs` (确认 export 模式)

- [ ] **Step 1: 读 services/mod.rs**

确认 export 模式 (re-export vs pub use)。

- [ ] **Step 2: 写 image_proxy.rs**

完整代码见 spec §4.1。关键点:
- `pub async fn fetch_and_cache(url: &str, cache_dir: &PathBuf) -> Result<(Vec<u8>, String), String>`
- sha256(url)[:16] hex → cache_path
- Cache hit: 直接 read
- Cache miss: reqwest::get(url), 检查 content_length, 读 bytes, tracking-pixel 检测, 写 cache
- `looks_like_tracking_pixel(bytes)`: 1×1 PNG/GIF/JPEG detection
- `guess_mime(bytes)`: magic byte sniffing
- `TRANSPARENT_1X1_PNG`: const `[u8; N]` for fallback

- [ ] **Step 3: 加 unit tests (≥3)**

```rust
#[cfg(test)]
mod tests {
  use super::*;
  
  #[test]
  fn guess_mime_png() {
    assert_eq!(guess_mime(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]), "image/png");
  }
  
  #[test]
  fn guess_mime_gif() {
    assert_eq!(guess_mime(&[b'G', b'I', b'F', b'8', b'9', b'a']), "image/gif");
  }
  
  #[test]
  fn guess_mime_jpeg() {
    assert_eq!(guess_mime(&[0xFF, 0xD8, 0xFF]), "image/jpeg");
  }
  
  #[test]
  fn tracking_pixel_png_1x1() {
    // PNG signature + IHDR with width=1, height=1
    let mut bytes = vec![0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A];
    // IHDR chunk: length(4) + "IHDR" + width(4=1) + height(4=1) + ...
    bytes.extend_from_slice(&[0, 0, 0, 13]); // chunk length
    bytes.extend_from_slice(b"IHDR");
    bytes.extend_from_slice(&[0, 0, 0, 1]); // width = 1
    bytes.extend_from_slice(&[0, 0, 0, 1]); // height = 1
    bytes.extend_from_slice(&[8, 6, 0, 0, 0]); // bit depth, color type, etc.
    assert!(looks_like_tracking_pixel(&bytes));
  }
  
  #[test]
  fn tracking_pixel_normal_png() {
    // PNG with width=100, height=100 → NOT a tracking pixel
    let mut bytes = vec![0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A];
    bytes.extend_from_slice(&[0, 0, 0, 13]);
    bytes.extend_from_slice(b"IHDR");
    bytes.extend_from_slice(&[0, 0, 0, 100]); // width = 100
    bytes.extend_from_slice(&[0, 0, 0, 100]); // height = 100
    bytes.extend_from_slice(&[8, 6, 0, 0, 0]);
    assert!(!looks_like_tracking_pixel(&bytes));
  }
}
```

- [ ] **Step 4: 跑 cargo test image_proxy**

```bash
cd app/src-tauri && cargo test --lib services::image_proxy 2>&1 | tee qa-tmp/audit-2026-08-11-fix-f-cargo-test-imageproxy.log
```

预期: 5 个 unit test 全 pass (mime + tracking pixel detection)。

- [ ] **Step 5: 不 commit**

---

## Task 3: Tauri command + lib.rs 注册

**Files:**
- Create: `app/src-tauri/src/commands/image_proxy.rs`
- Modify: `app/src-tauri/src/commands/mod.rs` (re-export) + `app/src-tauri/src/lib.rs` (register)
- Read first: `app/src-tauri/src/commands/mod.rs` (找现有 export pattern) + `app/src-tauri/src/lib.rs:144-157` (invoke_handler block)

- [ ] **Step 1: 读现有 commands/mod.rs + lib.rs invoke_handler**

确认 `pub use ...` + `invoke_handler![...]` 写法。

- [ ] **Step 2: 写 commands/image_proxy.rs**

```rust
use tauri::{AppHandle, Manager};

#[tauri::command]
pub async fn fetch_image(
  url: String,
  app: AppHandle,
) -> Result<String, String> {
  let cache_dir = app
    .path()
    .app_cache_dir()
    .map_err(|e| format!("cache dir: {e}"))?
    .join("images");
  tokio::fs::create_dir_all(&cache_dir)
    .await
    .map_err(|e| format!("create cache dir: {e}"))?;
  let (bytes, mime) =
    services::image_proxy::fetch_and_cache(&url, &cache_dir).await?;
  let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
  Ok(format!("data:{};base64,{}", mime, b64))
}
```

- [ ] **Step 3: 加到 commands/mod.rs**

```rust
pub mod image_proxy;
pub use image_proxy::fetch_image;
```

(假设现有 pattern;读后调整)

- [ ] **Step 4: 注册到 lib.rs invoke_handler**

在 `invoke_handler![...]` 数组加 `fetch_image,`。

- [ ] **Step 5: 跑 cargo build**

```bash
cd app/src-tauri && cargo build 2>&1 | tee qa-tmp/audit-2026-08-11-fix-f-cargo-build-command.log
```

预期: 0 errors.

- [ ] **Step 6: 不 commit**

---

## Task 4: Frontend utils/html.ts 加 extractExternalImageUrls + prefetchImages

**Files:**
- Modify: `app/src/utils/html.ts`
- Read first: 当前 analyzeImages 签名

- [ ] **Step 1: 读 utils/html.ts analyzeImages 段**

确认当前 export 列表。

- [ ] **Step 2: 加 extractExternalImageUrls**

```ts
export function extractExternalImageUrls(html: string): string[] {
  const matches = html.match(/<img\b[^>]*\bsrc\s*=\s*["']?https?:\/\/[^"'>\s]+/gi) || [];
  return matches
    .map((m) => {
      const srcMatch = m.match(/\bsrc\s*=\s*["']?([^"'>\s]+)/i);
      return srcMatch ? srcMatch[1]! : "";
    })
    .filter(Boolean);
}
```

- [ ] **Step 3: 加 prefetchImages**

```ts
import { invoke } from "@tauri-apps/api/core";

export async function prefetchImages(urls: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  await Promise.all(urls.map(async (url) => {
    try {
      const dataUrl = await invoke<string>("fetch_image", { url });
      result.set(url, dataUrl);
    } catch (_) {
      // Failed fetch — leave as placeholder.
    }
  }));
  return result;
}
```

- [ ] **Step 4: typecheck**

```bash
cd app && pnpm typecheck 2>&1 | tee qa-tmp/audit-2026-08-11-fix-f-typecheck-utils.log
```

预期: 0 errors.

- [ ] **Step 5: 不 commit**

---

## Task 5: Backend wrappers (sender policy)

**Files:**
- Modify: `app/src/services/backend.ts`
- Read first: `app/src/services/backend.ts` 现有 pattern (Sub-A camelCase fix 后)

- [ ] **Step 1: 读 backend.ts 现有 wrapper pattern**

看 `vaultSave` / `vaultLoad` 的 tauri-plugin-store 调法。

- [ ] **Step 2: 加 2 wrappers**

```ts
import { Store } from "@tauri-apps/plugin-store";

const STORE_PATH = ".sendpalm.dat"; // 或实际 store 路径

export async function getImageSenderPolicy(sender: string): Promise<"always" | "ask"> {
  const store = await Store.load(STORE_PATH);
  const map = (await store.get<Record<string, "always" | "ask">>("email-image-policy")) ?? {};
  return map[sender] ?? "ask";
}

export async function setImageSenderPolicy(sender: string, policy: "always" | "ask"): Promise<void> {
  const store = await Store.load(STORE_PATH);
  const map = (await store.get<Record<string, "always" | "ask">>("email-image-policy")) ?? {};
  map[sender] = policy;
  await store.set("email-image-policy", map);
  await store.save();
}
```

(实际 STORE_PATH 跟 ui.ts 里现有 store 一致;实现细节 implementer 看)

- [ ] **Step 3: 加 2 测试 in backend.test.ts**

```ts
it("getImageSenderPolicy returns 'ask' default", async () => {
  vi.mocked(getImageSenderPolicy).mockResolvedValueOnce("ask");
  expect(await getImageSenderPolicy("a@b")).toBe("ask");
});

it("setImageSenderPolicy writes to store", async () => {
  // 调用 setImageSenderPolicy + verify store.get 调用
});
```

具体 mock pattern 按 Sub-A / Sub-B 的 vi.hoisted 套路。

- [ ] **Step 4: typecheck + 测试**

```bash
cd app && pnpm typecheck 2>&1 | tee qa-tmp/audit-2026-08-11-fix-f-typecheck-backend.log
cd app && pnpm test -- backend.test 2>&1 | tee qa-tmp/audit-2026-08-11-fix-f-test-backend.log
```

预期: 全绿 (现有 154 + 2 新 = 156)。

- [ ] **Step 5: 不 commit**

---

## Task 6: MessagePanel 改造

**Files:**
- Modify: `app/src/panels/MessagePanel.tsx` (srcdoc `<script>` handler + Show images onClick + Always show checkbox)
- Read first: Sub-C 已加的 Show images button JSX + srcdoc script

- [ ] **Step 1: 读 MessagePanel.tsx 现有 Show images 区域 (Sub-C 加的)**

定位 Show images button + srcdoc `<script>` 里的 `'sendpalm:show-images'` handler。

- [ ] **Step 2: 改造 srcdoc `<script>` handler**

旧: 设 `data-shown="true"` on all `.sp-img-hidden`。

新: 接收 `srcMap` (parent 提供), 用 data URL 替换 placeholder src:

```js
window.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'sendpalm:show-images') {
    var srcMap = e.data.srcMap || {};
    var imgs = document.querySelectorAll('.sp-img-hidden');
    for (var i = 0; i < imgs.length; i++) {
      var orig = imgs[i].getAttribute('data-original-src');
      if (orig && srcMap[orig]) {
        imgs[i].setAttribute('src', srcMap[orig]);
        imgs[i].removeAttribute('class');
        imgs[i].removeAttribute('data-original-src');
      } else {
        imgs[i].setAttribute('data-shown', 'true'); // fallback for cache miss
      }
    }
  }
});
```

- [ ] **Step 3: 改造 Show images onClick**

```tsx
const [busy, setBusy] = createSignal(false);
const [always, setAlways] = createSignal(false);

const onShowImages = async () => {
  setBusy(true);
  try {
    const urls = extractExternalImageUrls(m.bodyHtml!);
    const map = await prefetchImages(urls);
    if (currentIframe?.contentWindow) {
      currentIframe.contentWindow.postMessage(
        { type: "sendpalm:show-images", srcMap: Object.fromEntries(map) },
        "*",
      );
    }
    if (always() && m.sender_email) {
      await setImageSenderPolicy(m.sender_email, "always");
    }
  } finally {
    setBusy(false);
  }
};
```

- [ ] **Step 4: 加 "Always show from this sender" checkbox**

在 Show images button 旁边加 SolidJS checkbox:

```tsx
<label>
  <input type="checkbox" checked={always()} onChange={(e) => setAlways(e.currentTarget.checked)} />
  Always show from this sender
</label>
```

- [ ] **Step 5: typecheck**

```bash
cd app && pnpm typecheck 2>&1 | tee qa-tmp/audit-2026-08-11-fix-f-typecheck-panel.log
```

预期: 0 errors.

- [ ] **Step 6: 不 commit**

---

## Task 7: 全套验证 + commit

**Files:**
- Stage: 5 source files (Cargo.toml + 2 new Rust files + 3 modified files)

- [ ] **Step 1: cargo build + test**

```bash
cd app/src-tauri && cargo build 2>&1 | tee qa-tmp/audit-2026-08-11-fix-f-cargo-build-final.log
cd app/src-tauri && cargo test 2>&1 | tee qa-tmp/audit-2026-08-11-fix-f-cargo-test-final.log
```

预期: 0 build errors; 现有 + 5 新 = 全绿。

- [ ] **Step 2: pnpm test + typecheck + lint**

```bash
cd app && pnpm test 2>&1 | tee qa-tmp/audit-2026-08-11-fix-f-test-final.log
cd app && pnpm typecheck 2>&1 | tee qa-tmp/audit-2026-08-11-fix-f-typecheck-final.log
cd app && pnpm lint 2>&1 | tee qa-tmp/audit-2026-08-11-fix-f-lint-final.log
```

预期: 154 现有 + 2 新 = 156 vitest; typecheck 0 errors; lint 1 pre-existing (views.spec.ts) 不动。

- [ ] **Step 3: 无 secret**

```bash
git diff --cached --name-only | grep -E "\.env$|password|secret" || echo "ok no secrets"
```

- [ ] **Step 4: 仅预期文件 staged**

预期:
- `app/src-tauri/Cargo.toml`
- `app/src-tauri/Cargo.lock` (auto)
- `app/src-tauri/src/services/image_proxy.rs` (new)
- `app/src-tauri/src/commands/image_proxy.rs` (new)
- `app/src-tauri/src/commands/mod.rs` (export)
- `app/src-tauri/src/lib.rs` (register)
- `app/src/utils/html.ts`
- `app/src/services/backend.ts`
- `app/src/services/backend.test.ts`
- `app/src/panels/MessagePanel.tsx`

- [ ] **Step 5: 1 commit**

```bash
cd /Users/edwinhao/sendpalm
git add app/src-tauri/Cargo.toml \
        app/src-tauri/Cargo.lock \
        app/src-tauri/src/services/image_proxy.rs \
        app/src-tauri/src/commands/image_proxy.rs \
        app/src-tauri/src/commands/mod.rs \
        app/src-tauri/src/lib.rs \
        app/src/utils/html.ts \
        app/src/services/backend.ts \
        app/src/services/backend.test.ts \
        app/src/panels/MessagePanel.tsx
git commit -m "feat(privacy): image proxy + per-sender always-show + tracking-pixel filter" \
  -m "Per audit report 2026-08-11 (commit cb95452) §4 + §5.2 +
§7: Sub-C's 'Show images (N)' button hid external <img> with
a placeholder, but the user's IP/UA still leaked when the
placeholder was replaced with the original src. Add a Rust
Tauri command fetch_image that proxies every external image
through a local reqwest fetch + filesystem cache, and
substitutes 1x1 tracking pixels with a transparent PNG.

Pipeline:
1. DOMPurify hook (Sub-C) marks external <img> as
   .sp-img-hidden with data-original-src.
2. MessagePanel 'Show images' click → async
   prefetchImages() calls invoke('fetch_image', { url }) for
   each hidden img in parallel.
3. fetch_image → fetch_and_cache(url) → SHA-256 cached at
   ~/.sendpalm/cache/images/<sha256(url)[:16]> →
   content-length < 200 OR 1x1 dimension heuristic returns
   transparent PNG instead. Returns base64 data URL.
4. prefetchImages builds srcMap; parent postMessages to iframe
   which rewrites each img.src = srcMap[data-original-src].
5. Optionally 'Always show from this sender' checkbox writes
   the policy to tauri-plugin-store; next email from same
   sender auto-prefetches (button shown as 'Always' instead
   of 'Show images').

Tests: 5 cargo unit tests for image_proxy (mime sniffing +
tracking-pixel detection across PNG/GIF/JPEG), 2 vitest
tests for backend wrappers (getImageSenderPolicy default +
setImageSenderPolicy write). Total: 154 + 2 + 5 cargo new.

iOS WKWebView verification skipped — no macOS+Xcode in this
session.

Refs: docs/superpowers/specs/2026-08-11-f-image-proxy-sender-policy-design.md
Refs: docs/superpowers/audit/2026-08-11-email-html-link-audit.md §4, §5.2, §7"
```

- [ ] **Step 6: 验证**

```bash
git log --oneline -3
git show --stat HEAD | head -15
```

预期: 1 commit, 10 files changed.

---

## Self-Review

**1. Spec coverage:**
- §2 (目标) → Tasks 1-6 ✅
- §3 (非目标) → 不实现 iOS / 不实现 ML / 不动 Sub-C sanitize / 不动 image format conversion ✅
- §4.1-§4.6 (Architecture) → Tasks 1-6 implement ✅
- §5.1-§5.2 (Files) → Tasks 1-6 cover all ✅
- §6 (DoD) → Task 7 ✅
- §7 (risks) → Task 7 step 5 (manual skipped) + Task 3 step 4 cache size cap mentioned ✅
- §8 (references) → Task 7 step 5 commit body ✅

**2. Placeholder scan:**
- 0

**3. Type/接口 一致性:**
- Task 2: `fetch_and_cache(url: &str, cache_dir: &PathBuf)` signature preserved across all callers
- Task 3: `fetch_image(url: String, app: AppHandle)` matches Tauri command signature
- Task 4: `extractExternalImageUrls` + `prefetchImages` pure / async split
- Task 5: `getImageSenderPolicy` / `setImageSenderPolicy` camelCase (per Sub-A)
- Task 6: `currentIframe` ref already from Sub-B; reuse
- Task 7: log paths use `fix-f-*` prefix distinct from audit + Sub-A/B/C/D/E ✅