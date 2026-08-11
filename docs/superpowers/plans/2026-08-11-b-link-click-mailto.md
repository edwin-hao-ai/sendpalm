# Plan B: 邮件链接 + mailto: 修复

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 邮件里 `<a>` 点击 → `@tauri-apps/plugin-opener.openUrl()`（http/https → 系统浏览器，mailto → 系统邮件客户端）。通过 iframe 内 `<a>` click 拦截 + `postMessage` 桥接 + 父页调用 opener。

**Architecture:** iframe `srcdoc` 内联 1 个 `<script>` 用事件委托拦截 `<a>` 点击（modifier-click 让浏览器处理）；`postMessage` 给父页；父页 `onMount` 注册 message listener + 校验 `e.source` 后调 `openUrl`。iframe 加 `allow-scripts` 前用内置 `sanitizeEmailHtml` strip `<script>`、`<meta http-equiv=refresh>`、`<base>`、on* 属性、`javascript:` URLs、给 `target=_blank` 补 `rel`。

**Tech Stack:** SolidJS (onMount / onCleanup), `@tauri-apps/plugin-opener` (already installed), Vitest, regex-based sanitizer (no new deps).

## Global Constraints

Verbatim from spec + AGENTS.md:
- AGENTS.md §3.2: no `any` in TS, no magic strings.
- AGENTS.md §3.4: IPC / cross-module change requires integration test — sanitizer covered by 10 Vitest unit tests.
- AGENTS.md §3.5: conventional commits; one logical change per commit (1 commit at end of Task 4).
- AGENTS.md §3.7: PR-ready cadence; verification-before-completion; no "we'll fix it later" markers.
- Spec §5.1: sanitizer regex (10 transforms).
- Spec §5.2: MessagePanel 4 处改动 (import, sanitizer 接入, sandbox 加 allow-scripts, message listener + ref tracking).
- Spec §7: DoD — lint/typecheck/test all green.
- Spec §8: 8 真 bug fix (svg/onload, form action, meta refresh, base, target=_blank 无引号, modifier-click, postMessage source).
- Spec §10: 不动 capability / Rust / iframe → 主 DOM 迁移。
- No `.env` / passwords / secrets.
- No source modifications outside the 3 listed files (utils/html.ts, panels/MessagePanel.tsx, utils/html.test.ts).

---

## Task 1: 加 `sanitizeEmailHtml` 到 `app/src/utils/html.ts`

**Files:**
- Modify: `app/src/utils/html.ts`（追加 export，不改现有函数）
- Read first: `app/src/utils/html.ts` (32 lines)

**Interfaces:**
- Consumes: 邮件 HTML 字符串。
- Produces: 5 步 sanitize 后的字符串 (strip `<script>`, `<meta http-equiv=refresh>`, `<base>`, on* attrs, javascript: URLs in href/src/action/formaction, 补 rel on target=_blank)。

- [ ] **Step 1: 读 `app/src/utils/html.ts` 现有内容**

确认现有的 `plainTextToHtml` 和 `htmlToPlainText` 函数结构，追加新函数不影响现有 export。

- [ ] **Step 2: 文件末尾追加 `sanitizeEmailHtml`**

完整代码见 spec §5.1（10 行 regex 替换）。注意：
- 第 1 步：`<script\b[\s\S]*?<\/script\s*>` — multi-line aware, case-insensitive
- 第 2 步：`<meta\b[^>]*\bhttp-equiv\s*=\s*["']?refresh["']?[^>]*>` — 整 strip meta refresh tag
- 第 3 步：`<base\b[^>]*>` — strip 整个 base tag
- 第 4 步：`/\bon[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi` — 无 `\s+` 前置要求，捕 `<svg/onload=...>`
- 第 5 步：javascript: URL 处理，覆盖 `href` / `src` / `action` / `formaction` 4 个属性
- 第 6 步：`<a target="_blank">` (quoted 或 unquoted) 补 `rel="noopener noreferrer"`

- [ ] **Step 3: 跑 typecheck 验证**

```bash
cd app && pnpm typecheck 2>&1 | tee qa-tmp/audit-2026-08-11-fix-b-typecheck.log
```

预期: 0 errors.

- [ ] **Step 4: 不 commit**

Task 4 commit。

---

## Task 2: 加 Vitest 单测 `app/src/utils/html.test.ts`

**Files:**
- Create: `app/src/utils/html.test.ts`
- Read first: `app/src/utils/html.ts` (确认 sanitizeEmailHtml 导出名)

**Interfaces:**
- Consumes: `sanitizeEmailHtml` from `./html`.
- Produces: 10 个 Vitest tests。

- [ ] **Step 1: 写测试文件**

10 个 it-blocks (spec §6):
1. strips `<script>` blocks
2. strips multi-line `<script>`
3. strips inline event handlers (onclick, onerror, onload)
4. **strips event handlers with no space before (svg/onload bypass)** ← spec §8 bug fix #1
5. neutralizes javascript: URLs in href, src, action, formaction
6. **strips `<meta http-equiv=refresh>`** ← bug fix #3
7. **strips `<base>` tags** ← bug fix #4
8. **adds rel=noopener noreferrer to `<a target=_blank>` (quoted or unquoted)** ← bug fix #5
9. preserves existing rel, only adds missing tokens
10. preserves all other HTML (p, img cid:, table, blockquote)

每个 test 用 `expect()` 断言关键字符串。完整测试代码实现详见 brief。

- [ ] **Step 2: 跑测试**

```bash
cd app && pnpm test -- html.test 2>&1 | tee qa-tmp/audit-2026-08-11-fix-b-test-html.log
```

预期: 10/10 通过。

- [ ] **Step 3: 如果失败, debug**

最可能的失败: regex 不匹配 edge case (e.g. multiline `<script>`)。调整 regex 后重跑。

---

## Task 3: 改 `app/src/panels/MessagePanel.tsx` 4 处

**Files:**
- Modify: `app/src/panels/MessagePanel.tsx` (import, htmlEmailSrcdoc, iframe sandbox, message listener + onMount)
- Read first: `app/src/panels/MessagePanel.tsx` line 1-30 (imports), line 62-77 (htmlEmailSrcdoc), line 1052-1075 (iframe JSX)

**Interfaces:**
- Consumes: 当前 MessagePanel with iframe `sandbox="allow-same-origin"` and no click handling.
- Produces: MessagePanel with: (a) sanitizer in srcdoc, (b) click handler script in srcdoc, (c) `allow-scripts` added to sandbox, (d) message listener in onMount + cleanup, (e) `currentIframe` ref for source verification.

- [ ] **Step 1: 读现有 MessagePanel 头部**

读 line 1-30 (imports + 类型) + line 62-77 (htmlEmailSrcdoc) + line 1052-1075 (iframe JSX) + createSignal 区 (找 onMount 注入点)。

- [ ] **Step 2: 加 imports**

在文件顶部 import 区追加:

```ts
import { onMount, onCleanup } from "solid-js";
import { openUrl } from "@tauri-apps/plugin-opener";
import { sanitizeEmailHtml } from "../utils/html";
```

- [ ] **Step 3: 改 `htmlEmailSrcdoc` (line 62)**

完整改动见 spec §5.2 (b): 接 `sanitizeEmailHtml`, 在 `<style>` 后面加 `<script>` 块（click 拦截 + modifier-click 让浏览器处理）, body 用 `${safe}` 替 `${html}`。

- [ ] **Step 4: 改 iframe sandbox (line 1066)**

```diff
-sandbox="allow-same-origin"
+sandbox="allow-scripts allow-same-origin"
```

- [ ] **Step 5: 加 iframe ref 跟踪**

在 iframe JSX 处加 ref 回调:

```tsx
ref={(el) => {
  currentIframe = el;
  el.onload = () => { /* existing scrollHeight logic, preserve verbatim */ };
}}
```

把原本的 `el.onload = () => { ... }` 移到 ref 回调里并保留 scrollHeight 逻辑。在 component 顶层加:

```ts
let currentIframe: HTMLIFrameElement | null = null;
```

- [ ] **Step 6: 加 message listener**

在 `createSignal` 区附近加:

```ts
onMount(() => {
  const handler = (e: MessageEvent) => {
    if (currentIframe && e.source !== currentIframe.contentWindow) return;
    const data = e.data as { type?: string; href?: string } | null;
    if (!data || data.type !== "sendpalm:open-url" || typeof data.href !== "string") return;
    openUrl(data.href).catch(() => {});
  };
  window.addEventListener("message", handler);
  onCleanup(() => window.removeEventListener("message", handler));
});
```

- [ ] **Step 7: 跑 typecheck**

```bash
cd app && pnpm typecheck 2>&1 | tee qa-tmp/audit-2026-08-11-fix-b-typecheck.log
```

预期: 0 errors. 注意 `openUrl` import 在浏览器模式 (vite dev / Playwright) 可能 throw — TS 不报错 (静态类型存在), runtime 才 fail。

- [ ] **Step 8: 不 commit**

---

## Task 4: 全套验证 + commit

**Files:**
- Stage: `app/src/utils/html.ts`, `app/src/utils/html.test.ts`, `app/src/panels/MessagePanel.tsx`

**Interfaces:**
- Produces: 1 conventional commit on `main`。

- [ ] **Step 1: 全套测试**

```bash
cd app && pnpm test 2>&1 | tee qa-tmp/audit-2026-08-11-fix-b-test-full.log
```

预期: 152/152 (142 现有 + 10 新)。

- [ ] **Step 2: typecheck + lint**

```bash
cd app && pnpm typecheck 2>&1 | tee qa-tmp/audit-2026-08-11-fix-b-typecheck-final.log
cd app && pnpm lint 2>&1 | tee qa-tmp/audit-2026-08-11-fix-b-lint-final.log
```

预期: typecheck 0 errors, lint 1 pre-existing error (views.spec.ts) 不动。

- [ ] **Step 3: 无 secret**

```bash
git diff --cached --name-only | grep -E "\.env$|password|secret" || echo "ok no secrets"
```

- [ ] **Step 4: 仅 3 文件 modified/added**

```bash
git diff --cached --name-only
```

预期: `app/src/utils/html.ts`, `app/src/utils/html.test.ts`, `app/src/panels/MessagePanel.tsx` — 3 文件。

- [ ] **Step 5: 手工 verification**

跳过 (本会话无 .env)。commit body 注明 "manual SMTP + mailto verification skipped — no .env in this session"。

- [ ] **Step 6: 1 commit**

```bash
cd /Users/edwinhao/sendpalm
git add app/src/utils/html.ts \
        app/src/utils/html.test.ts \
        app/src/panels/MessagePanel.tsx
git commit -m "fix(links): wire email <a> clicks to system opener (http/mailto)" \
  -m "Per audit report 2026-08-11 (commit cb95452) §5.3 + §7
HIGH-risk #2: email <a> clicks were inert (iframe sandbox had
no allow-popups/allow-scripts, no JS interception) and mailto:
was a dead path. Wire iframe srcdoc with a small inline
<script> that intercepts <a> clicks (cmd/ctrl/shift/middle-click
falls through to browser default), postMessages to parent,
which calls @tauri-apps/plugin-opener.openUrl(). openUrl with
mailto: opens the system mail client; with https/http opens
the system browser.

Trade-off: iframe gains allow-scripts. Mitigated by
sanitizeEmailHtml (added to utils/html.ts) which strips:
- <script>...</script> blocks
- <meta http-equiv=refresh> (redirect attack)
- <base> tags (URL hijacking)
- on*= event handler attributes (incl. <svg/onload=...> bypass)
- javascript: URLs in href/src/action/formaction
- Adds rel='noopener noreferrer' to <a target=_blank>

Known-acceptable-risks (Sub-C will harden with DOMPurify):
nested bypass over-strips; <object>/<embed>/<link rel=stylesheet>
load external resources; CSS url(javascript:) — modern browsers
ignore.

postMessage security: handler verifies e.source ===
currentIframe.contentWindow (defense in depth for '*' origin).

Tests: 10 Vitest unit tests in utils/html.test.ts covering all
sanitize transforms including the 4 bypass cases caught in
adversarial design review (svg/onload, meta refresh, base,
unquoted target=_blank).

Manual verification skipped (no .env in this session). To
verify: open an email with <a href='https://...'> and <a
href='mailto:...'>; click each; confirm system browser /
default mail client opens respectively.

Refs: docs/superpowers/specs/2026-08-11-b-link-click-mailto-design.md
Refs: docs/superpowers/audit/2026-08-11-email-html-link-audit.md §5, §7"
```

- [ ] **Step 7: 验证 commit**

```bash
git log --oneline -3
git show --stat HEAD | head -10
```

预期: 1 commit `fix(links): wire email <a> clicks to system opener (http/mailto)`, 3 files changed.

---

## Self-Review (per writing-plans skill)

**1. Spec coverage:**
- Spec §1 (背景) → Task 3 step 1-3 rationale ✅
- Spec §2 (目标) → Tasks 1+3 deliverables ✅
- Spec §3 (非目标) → not introduced DOMPurify (Task 1 uses regex); no Rust/cap changes; Sub-C/D/E untouched ✅
- Spec §4 (Architecture) → Tasks 1+3 implement postMessage bridge + opener ✅
- Spec §5.1 (sanitizer) → Task 1 step 2 ✅
- Spec §5.2 (MessagePanel 4 changes) → Task 3 steps 2-6 (import, sanitizer接入, sandbox, ref tracking, listener) ✅
- Spec §5.3 (no backend wrapper) → confirmed in Task 3 step 2 (no backend.ts change) ✅
- Spec §6 (10 unit tests) → Task 2 step 1 ✅
- Spec §7 (DoD) → Task 4 steps 1-7 ✅
- Spec §8 (risks) → Task 4 step 5 (manual skipped), Task 3 step 6 (postMessage source verification) ✅
- Spec §9 (other sub-project dependencies) → confirmed no A-block, sanitzer shared with C ✅
- Spec §10 (references) → Task 4 step 6 commit body ✅

**2. Placeholder scan:**
- "TBD" / "TODO" / "fill in" → 0
- "Similar to Task N" → 0
- All bash commands have explicit content.

**3. Type/接口 一致性:**
- Task 1 step 2 sanitizer export name `sanitizeEmailHtml` → Task 3 step 2 import ✅
- Task 2 step 1 test imports from `./html` (correct relative path)
- Task 3 step 2 imports `onMount, onCleanup` from `"solid-js"`, `openUrl` from `"@tauri-apps/plugin-opener"`, `sanitizeEmailHtml` from `"../utils/html"` ✅
- Task 3 step 6 `currentIframe` declared at component level, used in iframe ref + message handler ✅
- Task 4 step 6 commit message references audit commit + spec path consistently ✅
- Log files use `fix-b-*` prefix distinct from audit `audit-2026-08-11-*` and Sub-A `fix-a-*` ✅