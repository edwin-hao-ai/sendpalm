# B. SendPalm 邮件链接 + mailto: 修复

> Spec authored 2026-08-11. Status: Draft. Sub-project B of the 2026-08-11 email/HTML/link audit fix series (commit `cb95452`). 5 个独立 sub-project 之一 (A/C/D/E 各有独立 spec/plan/implementation)。

## 1. 背景与问题

`cb95452` §5.3 确认:
- iframe `sandbox="allow-same-origin"` 无 `allow-scripts`/`allow-popups`/`allow-top-navigation`,邮件 HTML 里 `<a>` 点击 = iframe 内导航 → 用户看到 iframe 区域被替换成目标页/404 错误
- `mailto:` 完全死路径 (`grep mailto: app/src/` → 0 命中)
- `@tauri-apps/plugin-opener` 已装 (`app/package.json` + `app/src-tauri/Cargo.toml`) + capability `opener:default` 已开 (覆盖 mailto/tel/https/http) 但**没有任何调用点**

## 2. 目标

邮件里 `<a>` 点击 → 系统浏览器打开 (http/https) / 系统邮件客户端打开 (mailto)。plain-text URL 自动链接 留 Sub-E。

## 3. 非目标

- ❌ 不引入 DOMPurify / sanitize-html 第三方 (Sub-C 跟踪像素拦截再说;本次用内置极简 sanitizer)
- ❌ 不动 Rust端 / 不动 capability (`opener:default` 已含所有需要的 URL scheme)
- ❌ 不修 `<table>` / `<blockquote>` 样式 (Sub-C 范畴)
- ❌ 不动 plain-text URL 自动识别 (Sub-E)
- ❌ 不重构 iframe → 主 DOM 渲染 (未来 follow-up;本次保留 iframe)
- ❌ 不加 fallback `target="_blank"` 走 `<base>` 的纯 HTML 方案 (mailto 可靠性差)

## 4. Architecture

iframe 内 `<a>` 点击 → `postMessage` 给父页 → 父页调 `@tauri-apps/plugin-opener.openUrl()`。需要:
1. iframe 加 `allow-scripts` 让我们的 click 拦截脚本能跑
2. 加 `allow-scripts` **前必须 strip 邮件 HTML 里的 `<script>` 标签** (否则邮件里的 XSS 直接执行)
3. 内置极简 sanitizer (~50 行) 做 strip + 给 `<a target="_blank">` 补 `rel="noopener noreferrer"`

**数据流**
```
邮件 HTML
  → sanitizeEmailHtml(html)             // strip <script>, on*=, javascript:; 补 rel
  → htmlEmailSrcdoc(safeHtml)           // 注入 srcdoc + 1 个内联 <script>
 // 内联 script: 事件委托 <a> 点击 → preventDefault + parent.postMessage({type, href}, '*')
  → iframe srcdoc={...} sandbox="allow-scripts allow-same-origin"

父页 MessagePanel onMount
  → window.addEventListener('message', handler)
 // handler: 校验 type+href → opener.openUrl(href) → 系统浏览器/邮件客户端

父页 onCleanup
  → removeEventListener
```

## 5. 改动清单

### 5.1 `app/src/utils/html.ts` 加 `sanitizeEmailHtml` 函数

该文件已存在 (`plainTextToHtml` / `htmlToPlainText`),文件末尾追加:

```ts
export function sanitizeEmailHtml(html: string): string {
  return html
    // Strip <script>...</script> blocks (multi-line aware, case-insensitive)
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, "")
    // Strip <meta http-equiv="refresh"> (redirect attack vector)
    .replace(/<meta\b[^>]*\bhttp-equiv\s*=\s*["']?refresh["']?[^>]*>/gi, "")
    // Strip <base> tags entirely (can hijack all relative URLs)
    .replace(/<base\b[^>]*>/gi, "")
    // Strip inline event handlers (onclick=, onload=, onerror=, etc.)
    // No leading-whitespace requirement → catches <svg/onload=...> bypass
    .replace(/\bon[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    // Neutralize javascript: URLs in href / src / action / formaction
    .replace(
      /(\s(?:href|src|action|formaction)\s*=\s*["']?)\s*javascript:[^"'>\s]*(["']?)/gi,
      "$1#$2",
    )
    // Add rel="noopener noreferrer" to <a target=_blank> (with or without quotes)
    .replace(
      /<a\b([^>]*?)\btarget\s*=\s*["']?_blank["']?([^>]*?)>/gi,
      (match, before, after) => {
        if (/\brel\s*=/i.test(match)) {
          return match.replace(
            /\brel\s*=\s*["']?([^"']*)["']?/i,
            (_r, rel) =>
              `rel="${rel.includes("noopener") ? rel : `${rel} noopener`.trim()} noreferrer"`,
          );
        }
        return `<a${before}target="_blank" rel="noopener noreferrer"${after}>`;
      },
    );
}
```

### 5.2 `app/src/panels/MessagePanel.tsx` 三处改动

**(a)** Import: 加 `import { onMount, onCleanup } from "solid-js"; import { openUrl } from "@tauri-apps/plugin-opener"; import { sanitizeEmailHtml } from "../utils/html";`

**(b)** `htmlEmailSrcdoc` (line 62) — 接入 sanitizer + 加 click handler `<script>`:

```diff
-function htmlEmailSrcdoc(html: string): string {
-  return `<!DOCTYPE html>
+function htmlEmailSrcdoc(html: string): string {
+  const safe = sanitizeEmailHtml(html);
+  return `<!DOCTYPE html>
<html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>html, body { … }; img { max-width: 100%; height: auto; } a { color: #0A8F63; } pre { white-space: pre-wrap; overflow-wrap: anywhere; }</style>
      <script>
        document.addEventListener('click', function(e) {
          var a = e.target && e.target.closest && e.target.closest('a[href]');
          if (!a) return;
          // Respect modifier-clicks (cmd/ctrl/shift/alt/middle) — let browser handle
          // (cmd-click → open in new tab; middle-click → same). Only intercept plain left-click.
          if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          e.stopPropagation();
          try { parent.postMessage({ type: 'sendpalm:open-url', href: a.href }, '*'); } catch (_) {}
        }, true);
      </script>
    </head>
    <body>${safe}</body>
    </html>`;
}
```

**(c)** iframe sandbox (line 1066):

```diff
 <iframe
    ref={(el) => { el.onload = ... }}
 srcdoc={htmlEmailSrcdoc(m.bodyHtml!)}
-   sandbox="allow-same-origin"
+   sandbox="allow-scripts allow-same-origin"
    style={...}
    title="Message body"
  />
```

**(d)** MessagePanel 主体 — 加 message listener (`createSignal` 区附近):

```ts
let currentIframe: HTMLIFrameElement | null = null;

onMount(() => {
  const handler = (e: MessageEvent) => {
    // Verify message source is our own iframe (defense in depth: postMessage '*'
    // would otherwise accept any iframe-injected message).
    if (currentIframe && e.source !== currentIframe.contentWindow) return;
    const data = e.data as { type?: string; href?: string } | null;
    if (!data || data.type !== "sendpalm:open-url" || typeof data.href !== "string") return;
    openUrl(data.href).catch(() => { /* opener may be unavailable in browser mode */ });
  };
  window.addEventListener("message", handler);
  onCleanup(() => window.removeEventListener("message", handler));
});
```

然后在 iframe JSX 处 `ref={el => { currentIframe = el; el.onload = ...; }}` 加上赋值。

### 5.3 不动 `app/src/services/backend.ts`

`openUrl` 是 plugin-opener 直调,不走 `safeInvoke`。直接 import 用即可,不加 IPC wrapper。

## 6. 测试 — `app/src/utils/html.test.ts` (新建)

8 个 Vitest 单测覆盖 sanitizer:

```ts
import { describe, it, expect } from "vitest";
import { sanitizeEmailHtml } from "./html";

describe("sanitizeEmailHtml", () => {
  it("strips <script> blocks", () => { /* ... */ });
  it("strips multi-line <script>", () => { /* ... */ });
  it("strips inline event handlers (onclick, onerror, onload)", () => { /* ... */ });
  it("strips event handlers with no space before (svg/onload bypass)", () => { /* ... */ });
  it("neutralizes javascript: URLs in href, src, action, formaction", () => { /* ... */ });
  it("strips <meta http-equiv=refresh>", () => { /* ... */ });
  it("strips <base> tags", () => { /* ... */ });
  it("adds rel=noopener noreferrer to <a target=_blank> (quoted or unquoted)", () => { /* ... */ });
  it("preserves existing rel, only adds missing tokens", () => { /* ... */ });
  it("preserves all other HTML (p, img cid:, table, blockquote)", () => { /* ... */ });
});
```

(完整测试代码同 `docs/superpowers/plans/2026-08-11-b-link-click-mailto.md` task step 1。)

## 7. Definition of Done

- [ ] `app/src/utils/html.ts` 加 `sanitizeEmailHtml` 函数
- [ ] `app/src/panels/MessagePanel.tsx` 4 处改动 (import, sanitizer 接入, sandbox, message listener)
- [ ] `app/src/utils/html.test.ts` 新建,8 测试全绿
- [ ] `pnpm test` 全绿 (142 现有 + 8 新)
- [ ] `pnpm typecheck` 全绿
- [ ] `pnpm lint` 状态不变 (1 个 pre-existing error 不动)
- [ ] 手工 verification (本会话无 .env,跳过; 你有 feishu 账号时跑):
  1. Compose 一封含 `<a href="https://example.com">` 的 HTML 邮件给自己
  2. 在 MessagePanel 里点链接 → 系统浏览器打开
  3. Compose 一封含 `<a href="mailto:a@b">` → 点击 → 系统邮件客户端打开
- [ ] 1 个 conventional commit `fix(links): wire email <a> clicks to system opener`
- [ ] 不写 `docs/PROGRESS.md`

## 8. 风险

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| `allow-scripts` 让邮件里 `<script>` 直接执行 | 高 (没 sanitizer 就成立) | XSS | sanitizer 第一条 strip `<script>`; on* 属性; javascript: URL; meta refresh; base tag |
| Sanitizer regex 不够强 (bypass 攻击) | 中 | 部分 XSS | 内置 sanitizer 已知弱点: 嵌套 `<scr<script>ipt>` 过度 strip 成 `<script>ipt>` (无害残 tag); `<object>` / `<embed>` / `<link rel="stylesheet">` 留给 Sub-C DOMPurify 兜底 |
| postMessage `'*'` 任意 origin 接收 | 中 | 任意 iframe 都能让 app 弹 URL | handler 里 `e.source === currentIframe.contentWindow` 校验 (本 spec §5.2 加) |
| opener 在浏览器模式 (`vite dev`) 不可用 | 中 | 控制台 error | handler 里 `.catch(() => {})` 吞掉 |
| WKWebView (iOS) iframe srcdoc postMessage 行为差异 | 低 | iOS 上链接不工作 | 已知 iOS WKWebView 支持 postMessage; 需真机验证 (本会话跳过) |
| cmd-click / middle-click 不再开新 tab | 中 | UX 降级 (power user) | handler 检查 `e.metaKey` / `e.ctrlKey` / `e.shiftKey` / `e.altKey` / `e.button !== 0` → 直接 return 让浏览器处理 |
| 后台噪音 (Vite watcher 忽略) | 已修 | — | Sub-A 已 commit `c83b5e4` |
| 邮件 HTML 含 `<style> url(javascript:)` | 极低 | 旧 IE 漏洞 | 现代浏览器全部忽略; 不修 |
| iframe 关闭后 `currentIframe` ref 仍持有 | 低 | 内存微漏 | SolidJS ref 在 unmount 时会清; 不修 |
| CSP 缺失 (`tauri.conf.json csp: null`) | 中 | 整体安全降级 | 与 Sub-C 一起加; 不在本次范围 |
| message handler 在 onMount 闭包前 iframe 已渲染 | 极低 | 漏掉首次点击 | SolidJS onMount 在 DOM 完成时跑; 接受 |
| 测试覆盖盲区 (sanitizer 是 regex 不是真 HTML parser) | 中 | 真实 XSS bypass 测试不充分 | Sub-C 升级 DOMPurify 后由其测试覆盖 |

**回退**: 1 commit,`git revert <sha>` 还原 sanitizer + MessagePanel 三处改动。

## 9. 与其他 4 个 sub-project 的依赖

- ✅ 不依赖 A (A 已 commit `23c6474`)
- 🔗 **与 C 共享 sanitizer**: 本次的极简 sanitizer 是 Sub-C 的基础;Sub-C 用 DOMPurify 替换或扩展
- ✅ 不阻塞 C/D/E (并行可开发)
- ⚠️ 如果 Sub-C 先实现并替换 sanitizer,Sub-B 的 8 个测试需要适配 (Sub-C 负责人协调)

## 10. References

- Audit report: `docs/superpowers/audit/2026-08-11-email-html-link-audit.md` §5, §7
- Audit commit: `cb95452`
- Tauri opener docs: https://v2.tauri.app/plugin/opener/
- Existing pattern (参考): `app/src/panels/FilePanel.tsx:11,152` 已用 `openPath` (本地文件路径),本次仿照接 `openUrl` (URL + mailto)
- AGENTS.md §3.4 (logic change → tests), §3.5 (conventional commits), §3.7 (verification-before-completion)