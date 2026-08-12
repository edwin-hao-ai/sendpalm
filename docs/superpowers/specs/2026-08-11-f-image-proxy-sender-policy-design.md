# F. SendPalm Image Proxy + Per-sender Memory + Tracking 滤除

> Spec authored 2026-08-11. Status: Draft. Sub-project F of the 2026-08-11 email/HTML/link audit fix series (commit `cb95452`). 6 个 sub-project 之一 (A-E 已 commit)。

## 1. 背景与问题

`cb95452` §4 + §5.2 + §7:
- Sub-C 实现了 "Show images (N)" 按钮但 **隐藏后只是 placeholder**, 用户点 "Show images" 后如果直接用 `data-original-src` 还原, 还是会泄露 IP/UA 给第三方 (tracker 服务器)
- ❌ 没有 per-sender memory —— 每封邮件都要手动点
- ❌ 没有 tracking pixel 滤除 —— 即使点 Show images, 1×1 跟踪 GIF 也会加载

## 2. 目标

- 邮件外链 `<img>` 通过 **本地 Tauri proxy** 加载 (不直连第三方)
- proxy 在 fetch 时检测 tracking pixel (Content-Length / 图像尺寸 heuristic) → 替换为 1×1 透明 PNG
- 缓存到 `~/.sendpalm/cache/images/<sha256(url)[:16]>` (filesystem cache)
- per-sender "Always show images from this sender" 偏好, 存 tauri-plugin-store
- 邮件打开时若 sender 在白名单 → 自动 prefetch + 揭示 (跳过按钮)
- 跟踪像素默认不加载 (proxy 层就拦掉)

## 3. 非目标

- ❌ 不实现 per-pixel machine-learning tracking detector (用 size/byte heuristic 够用)
- ❌ 不实现 image format conversion (原样透传, browser 解析)
- ❌ 不实现 cache eviction policy (用 LRU; 简化为手动 cache size cap 100MB)
- ❌ 不实现 iOS WKWebView 真机验证 (本会话无 macOS+Xcode 环境)
- ❌ 不动 HTML body 渲染 (Sub-C 范畴, sanitize 已就位)

## 4. Architecture

### 4.1 Rust image proxy

`app/src-tauri/src/services/image_proxy.rs` (新):

```rust
use std::path::PathBuf;
use sha2::{Sha256, Digest};

pub async fn fetch_and_cache(
  url: &str,
  cache_dir: &PathBuf,
) -> Result<(Vec<u8>, String), String> {
  let hash = Sha256::digest(url.as_bytes());
  let cache_path = cache_dir.join(hex::encode(&hash[..8]));
  if cache_path.exists() {
    let bytes = tokio::fs::read(&cache_path).await.map_err(...)?;
    let mime = guess_mime(&bytes);
    return Ok((bytes, mime));
  }
  let resp = reqwest::get(url).await.map_err(...)?;
  let content_length = resp.content_length().unwrap_or(0);
  let bytes = resp.bytes().await.map_err(...)?;
  // Tracking-pixel filter: < 200 bytes
  if content_length > 0 && content_length < 200 {
    return Ok((TRANSPARENT_1X1_PNG.to_vec(), "image/png".into()));
  }
  // Tracking-pixel filter: 1x1 dimensions in headers
  if looks_like_tracking_pixel(&bytes) {
    return Ok((TRANSPARENT_1X1_PNG.to_vec(), "image/png".into()));
  }
  let mime = guess_mime(&bytes);
  tokio::fs::write(&cache_path, &bytes).await.map_err(...)?;
  Ok((bytes, mime))
}
```

`looks_like_tracking_pixel(bytes)`: parse PNG IHDR (if PNG signature), GIF logical screen, JPEG SOF — check width/height ≤ 1.

`guess_mime(bytes)`: first 8-12 bytes (PNG signature, JFIF, GIF89a, `<svg `, `\x89PNG\r\n`).

### 4.2 Tauri command

`app/src-tauri/src/commands/image_proxy.rs` (新):

```rust
#[tauri::command]
pub async fn fetch_image(
  url: String,
  app: AppHandle,
) -> Result<String, String> {
  let cache_dir = app.path().app_cache_dir()
    .map_err(|e| format!("cache dir: {e}"))?
    .join("images");
  tokio::fs::create_dir_all(&cache_dir).await.map_err(...)?;
  let (bytes, mime) = image_proxy::fetch_and_cache(&url, &cache_dir).await?;
  let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
  Ok(format!("data:{};base64,{}", mime, b64))
}
```

注册到 `lib.rs:invoke_handler!`。

### 4.3 Frontend `analyzeImages` 扩展

`app/src/utils/html.ts` 加 `extractExternalImageUrls(html)`:

```ts
export function extractExternalImageUrls(html: string): string[] {
  const matches = html.match(/<img\b[^>]*\bsrc\s*=\s*["']?https?:\/\/[^"'>\s]+/gi) || [];
  return matches.map((m) => {
    const srcMatch = m.match(/\bsrc\s*=\s*["']?([^"'>\s]+)/i);
    return srcMatch ? srcMatch[1] : "";
  }).filter(Boolean);
}
```

### 4.4 Frontend `prefetchImages` + "Show images" async

`app/src/utils/html.ts` 加:

```ts
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

### 4.5 MessagePanel "Show images" + per-sender toggle

改 onClick:

```tsx
const [busy, setBusy] = createSignal(false);
const senderPolicy = createMemo(() => /* read store for sender */);
const isAlways = createMemo(() => senderPolicy() === "always");

const onShowImages = async () => {
  setBusy(true);
  try {
    const urls = extractExternalImageUrls(m.bodyHtml!);
    const map = await prefetchImages(urls);
    iframe.contentWindow.postMessage(
      { type: "sendpalm:show-images", srcMap: Object.fromEntries(map) },
      "*",
    );
    if (alwaysFromSender()) {
      await setSenderImagePolicy(m.sender_email, "always");
    }
  } finally {
    setBusy(false);
  }
};
```

iframe `<script>` 改造 `sendpalm:show-images` handler: 接收 `srcMap`, 用 map 里的 data URL 替换 `<img data-original-src="..." src="placeholder">` 为 `<img src="data:...">`。

### 4.6 Per-sender 偏好存储

`tauri-plugin-store` (已装, capability 已开) + key `email-image-policy` + value `Record<senderEmail, "always" | "ask">`。

加 backend wrappers:

```ts
// app/src/services/backend.ts
export async function getImageSenderPolicy(sender: string): Promise<"always" | "ask">
export async function setImageSenderPolicy(sender: string, policy: "always" | "ask"): Promise<void>
```

实际实现用 `tauri-plugin-store` 的 `get` / `set` (已 import 在 ui.ts 里)。

## 5. 改动清单

### 5.1 Rust

| 文件 | 改动 |
|---|---|
| `app/src-tauri/Cargo.toml` | 加 `reqwest = { version = "0.12", features = ["rustls-tls"] }` + `sha2 = "0.10"` + `hex = "0.4"` |
| `app/src-tauri/src/services/image_proxy.rs` | 新建 (上述) |
| `app/src-tauri/src/commands/image_proxy.rs` | 新建 fetch_image command |
| `app/src-tauri/src/lib.rs` | 注册 `commands::image_proxy::fetch_image` + 写 `mod image_proxy` |
| `app/src-tauri/src/services/image_proxy.rs` (test) | ≥3 unit tests: tracking pixel filter (small bytes), cache hit, normal fetch (mock reqwest) |

### 5.2 Frontend

| 文件 | 改动 |
|---|---|
| `app/src/utils/html.ts` | 加 `extractExternalImageUrls` + `prefetchImages` |
| `app/src/panels/MessagePanel.tsx` | srcdoc `<script>` 改造 show-images handler 接 srcMap; 父级 onClick 加 "Always show" checkbox; onShowImages async |
| `app/src/services/backend.ts` | 加 `getImageSenderPolicy` + `setImageSenderPolicy` wrappers |
| `app/src/services/backend.test.ts` | 加 2 测试覆盖 wrappers |

## 6. Definition of Done

- [ ] `app/src-tauri/Cargo.toml` 加 reqwest / sha2 / hex
- [ ] `app/src-tauri/src/services/image_proxy.rs` 新建 fetch_and_cache + tracking-pixel filter
- [ ] `app/src-tauri/src/commands/image_proxy.rs` 新建 fetch_image command
- [ ] `app/src-tauri/src/lib.rs` 注册 command
- [ ] `app/src-tauri/src/services/image_proxy.rs` ≥3 unit tests
- [ ] `app/src/utils/html.ts` 加 extractExternalImageUrls + prefetchImages
- [ ] `app/src/panels/MessagePanel.tsx` 改造 Show images (async fetch) + Always show checkbox + iframe script handler
- [ ] `app/src/services/backend.ts` 加 2 sender policy wrappers
- [ ] `app/src/services/backend.test.ts` 加 2 测试
- [ ] `cargo build` + `cargo test` 全绿
- [ ] `pnpm test` + `pnpm typecheck` 全绿
- [ ] `pnpm lint` 状态不变
- [ ] 1 个 conventional commit `feat(privacy): image proxy + per-sender always-show + tracking-pixel filter`
- [ ] 不写 `docs/PROGRESS.md`

## 7. 风险

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| reqwest 网络请求在 fetch_image 阻塞 UI 线程 | 中 | UX 卡顿 | async command;并行 prefetch;缓存命中不阻塞 |
| Cache 目录无写权限 | 低 | fetch 失败 | 用 `app.path().app_cache_dir()` Tauri 标准;权限错 fallback 返回错误 |
| tracking-pixel 检测被绕过 (大尺寸但仍是 tracker) | 中 | 部分 tracker 仍泄露 | size-based heuristic 已知弱;后续 ML 或 URL blocklist (Sub-G) |
| Cache 无限增长 | 中 | 磁盘占满 | 实现 cache size cap 100MB + LRU; 后续 audit |
| Sender email 在多账户场景下 namespace 不一致 | 低 | 偏好冲突 | sender_email 是 RFC 5322 From header, 通常含 `@domain` 唯一定位 |
| fetch_image 没通过 capability 鉴权 | 中 | Tauri runtime 拒绝 | 加 `opener:default` (已有) 不够; 需要 `core:default` + 显式 capability (Sub-G) |
| base64 data URL 嵌进 HTML, 大图会让 body 大膨胀 | 中 | 性能 | cache 后下次用 `<img src="sendpalm-cache://abc">` (future); 当前 base64 OK |

**回退**: 1 commit `git revert <sha>`。

## 8. References

- Audit report: `docs/superpowers/audit/2026-08-11-email-html-link-audit.md` §4, §5.2, §7
- Audit commit: `cb95452`
- Sub-C: `docs/superpowers/specs/2026-08-11-c-tracking-pixels-table-styles-design.md` §5.4 (Show images button + srcdoc CSS)
- AGENTS.md §3.4 (logic change → tests), §3.5 (conventional commits), §3.7 (verification-before-completion)