# Plan C: 跟踪像素拦截 + table/blockquote + DOMPurify

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 邮件默认隐藏外链 `<img src="https?://...">`; MessagePanel 显示 "Show images (N)" 按钮一键揭示; `<table>` / `<blockquote>` HEY-grade 样式; Sub-B regex sanitizer 升 DOMPurify。

**Architecture:** DOMPurify-based `sanitizeEmailHtml` + 新 `analyzeImages(html)` 返回 `{safeHtml, externalImageCount, hasTrackingPixel}`;DOMPurify hook `afterSanitizeAttributes` 自动给外链 `<img>` 加 `class="sp-img-hidden"` + `data-original-src`;iframe srcdoc CSS 加 `.sp-img-hidden { display: none !important } .sp-img-hidden[data-shown="true"] { display: inline !important }` + table/blockquote 样式;iframe 内联 `<script>` 收 `'sendpalm:show-images'` postMessage → 设 `data-shown="true"`;父页按钮 click → `iframe.contentWindow.postMessage(...)`。

**Tech Stack:** SolidJS (onMount), `@tauri-apps/plugin-opener` (already), DOMPurify 3.x (new dep), Vitest.

## Global Constraints

Verbatim from spec + AGENTS.md:
- AGENTS.md §3.1: web-search before non-trivial dep. DOMPurify is well-established HTML sanitizer for JS; verified via spec link.
- AGENTS.md §3.2: no `any` in TS, no magic strings.
- AGENTS.md §3.4: tests mandatory for logic — 10 Vitest unit tests added.
- AGENTS.md §3.5: conventional commits; one logical change per commit (1 commit at end of Task 5).
- AGENTS.md §3.7: PR-ready cadence; verification-before-completion.
- Spec §5: exact DOMPurify config (ALLOWED_TAGS long list, FORBID_TAGS, FORBID_ATTR, KEEP_CONTENT:true).
- Spec §7: DoD — tests pass, typecheck clean, lint baseline unchanged.
- No `.env` / passwords / secrets.
- No source modifications outside the 4 listed files.

---

## Task 1: 加 `dompurify` 依赖

**Files:**
- Modify: `app/package.json` (add 2 deps)
- Read first: `app/package.json` (确认 dependencies / devDependencies 结构)

**Interfaces:**
- Consumes: 现有 package.json。
- Produces: 加 `dompurify` (dependencies) + `@types/dompurify` (devDependencies)。

- [ ] **Step 1: 读 package.json 现有结构**

确认 dependencies / devDependencies 的位置和格式约定。

- [ ] **Step 2: 加 `dompurify` 到 dependencies**

```bash
cd app && pnpm add dompurify
```

自动 resolve latest 3.x;package.json 自动更新。

- [ ] **Step 3: 加 `@types/dompurify` 到 devDependencies**

```bash
cd app && pnpm add -D @types/dompurify
```

- [ ] **Step 4: 验证 install**

```bash
ls app/node_modules/dompurify/package.json 2>&1 | head -3
ls app/node_modules/@types/dompurify/index.d.ts 2>&1 | head -3
```

预期: 两个文件都存在。

- [ ] **Step 5: typecheck 不破坏**

```bash
cd app && pnpm typecheck 2>&1 | tee qa-tmp/audit-2026-08-11-fix-c-typecheck-after-deps.log
```

预期: 0 errors (DOMPurify 未使用前,TS 不应报告 unused import 错误,因为还没写 import)。

- [ ] **Step 6: 不 commit (pnpm-lock.yaml 会变,留到 Task 5)**

---

## Task 2: 重写 `app/src/utils/html.ts` 用 DOMPurify

**Files:**
- Modify: `app/src/utils/html.ts` (替换 `sanitizeEmailHtml` body + 加 `analyzeImages`)
- Read first: `app/src/utils/html.ts` 当前状态

**Interfaces:**
- Consumes: 邮件 HTML 字符串。
- Produces: `sanitizeEmailHtml(html): string` (DOMPurify-based) + `analyzeImages(html): {safeHtml, externalImageCount, hasTrackingPixel}`。

- [ ] **Step 1: 读现有 html.ts**

确认 sanitizeEmailHtml 的 export 名字和签名保留。

- [ ] **Step 2: 重写 sanitizeEmailHtml**

完整代码见 spec §5.2。关键:
- 顶部 `import DOMPurify from "dompurify";` + PLACEHOLDER_DATA_URL 常量
- 模块加载时 `DOMPurify.addHook("afterSanitizeAttributes", ...)` 注册 img 重写逻辑
- `EMAIL_ALLOWED_TAGS` 长白名单
- `sanitizeEmailHtml` 用 `DOMPurify.sanitize(html, {...})`
- 新增 `analyzeImages` 函数 (spec §5.2)

- [ ] **Step 3: typecheck**

```bash
cd app && pnpm typecheck 2>&1 | tee qa-tmp/audit-2026-08-11-fix-c-typecheck-after-rewrite.log
```

预期: 0 errors。`@types/dompurify` 提供 `DOMPurify.addHook` 的类型。

- [ ] **Step 4: 不 commit**

---

## Task 3: 改 `app/src/utils/html.test.ts` 测试

**Files:**
- Modify: `app/src/utils/html.test.ts` (重写所有测试为 DOMPurify 行为)
- Read first: 当前测试文件 (Sub-B 留下的 10 个 it-blocks)

**Interfaces:**
- Consumes: 重写后的 sanitizeEmailHtml + analyzeImages。
- Produces: 10 个测试适配 DOMPurify 输出。

- [ ] **Step 1: 读现有 html.test.ts**

确认测试结构和命名。

- [ ] **Step 2: 重写测试**

10 个 it-blocks (spec §5.3):
1. strips `<script>` blocks
2. neutralizes `javascript:` URLs
3. adds `class="sp-img-hidden"` to external `<img>`
4. preserves cid: / data: images (no class added)
5. counts external images correctly via analyzeImages
6. detects tracking pixels (width=0, height=0, display:none)
7. preserves `<table>` / `<tr>` / `<td>` / `<blockquote>` structure
8. strips `<object>` / `<embed>` / `<link>` (sub-B 漏的)
9. strips event handler attributes
10. adds rel=noopener noreferrer to `<a target=_blank>`

每个测试用 `expect(html).toContain(...)` / `not.toContain(...)` / `expect(result).toEqual({...})`。

- [ ] **Step 3: 跑测试**

```bash
cd app && pnpm test -- html.test 2>&1 | tee qa-tmp/audit-2026-08-11-fix-c-test-html.log
```

预期: 10/10 pass。如果失败,debug 看哪个 DOMPurify 输出与 assertion 不符。

- [ ] **Step 4: 不 commit**

---

## Task 4: 改 `app/src/panels/MessagePanel.tsx` 3 处

**Files:**
- Modify: `app/src/panels/MessagePanel.tsx` (srcdoc CSS, srcdoc show-images handler, 父页按钮)
- Read first: `app/src/panels/MessagePanel.tsx` 当前 (Sub-B 改后的状态)

**Interfaces:**
- Consumes: MessagePanel with Sub-B's iframe postMessage bridge。
- Produces: 3 处改动:
  1. srcdoc `<style>` 加 table/blockquote + `.sp-img-hidden` CSS
  2. srcdoc 内联 `<script>` 加 `'sendpalm:show-images'` handler
  3. 父页: 调 `analyzeImages(m.bodyHtml)` 拿 count;按钮渲染 + onClick postMessage

- [ ] **Step 1: 读 MessagePanel.tsx 当前状态**

读 line 60-100 (srcdoc), line 1080-1100 (iframe + sandbox), line 650-670 (onMount listener)。

- [ ] **Step 2: 改 srcdoc `<style>` 块**

追加:
```css
table { border-collapse: collapse; max-width: 100%; }
td, th { padding: 6px 10px; vertical-align: top; }
blockquote { border-left: 3px solid #0A8F63; margin: 0; padding: 0 0 0 12px; color: #666; font-style: italic; }
.sp-img-hidden { display: none !important; }
.sp-img-hidden[data-shown="true"] { display: inline !important; }
```

(Sub-B 注入的 click handler script 保留不动。)

- [ ] **Step 3: 改 srcdoc `<script>` 加 show-images handler**

在 Sub-B 的 click handler 之后追加:

```js
window.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'sendpalm:show-images') {
    var imgs = document.querySelectorAll('.sp-img-hidden');
    for (var i = 0; i < imgs.length; i++) imgs[i].setAttribute('data-shown', 'true');
  }
});
```

- [ ] **Step 4: 父页加 import + analyzeImages 调用**

```ts
import { analyzeImages } from "../utils/html";
```

在 MessagePanel 函数体内,加 memo:

```ts
const imageAnalysis = createMemo(() =>
  m.bodyHtml ? analyzeImages(m.bodyHtml) : null,
);
```

- [ ] **Step 5: 父页加 "Show images (N)" 按钮**

在 iframe 旁边 (或在 MessagePanel header 处) 加 SolidJS JSX:

```tsx
<Show when={(imageAnalysis()?.externalImageCount ?? 0) > 0}>
  <button
    type="button"
    onClick={() => {
      const iframe = currentIframe;
      if (iframe?.contentWindow) {
        iframe.contentWindow.postMessage({ type: "sendpalm:show-images" }, "*");
      }
    }}
  >
    Show images ({imageAnalysis()!.externalImageCount})
    {imageAnalysis()!.hasTrackingPixel ? " ⚠" : ""}
  </button>
</Show>
```

(把 currentIframe ref 已在 Sub-B 步骤 5 加过。)

- [ ] **Step 6: typecheck**

```bash
cd app && pnpm typecheck 2>&1 | tee qa-tmp/audit-2026-08-11-fix-c-typecheck-after-panel.log
```

预期: 0 errors。

- [ ] **Step 7: 不 commit**

---

## Task 5: 全套验证 + commit

**Files:**
- Stage: `app/package.json`, `app/pnpm-lock.yaml`, `app/src/utils/html.ts`, `app/src/utils/html.test.ts`, `app/src/panels/MessagePanel.tsx`

**Interfaces:**
- Produces: 1 conventional commit on `main`。

- [ ] **Step 1: 全套测试**

```bash
cd app && pnpm test 2>&1 | tee qa-tmp/audit-2026-08-11-fix-c-test-full.log
```

预期: 全绿 (152 现有 + 10 新 DOMPurify 测试 — 注意 Sub-B 的 10 个 regex 测试被改写为 DOMPurify 测试,数字不变或 +0)。

- [ ] **Step 2: typecheck + lint**

```bash
cd app && pnpm typecheck 2>&1 | tee qa-tmp/audit-2026-08-11-fix-c-typecheck-final.log
cd app && pnpm lint 2>&1 | tee qa-tmp/audit-2026-08-11-fix-c-lint-final.log
```

预期: typecheck 0 errors, lint 1 pre-existing error 不动。

- [ ] **Step 3: 无 secret**

```bash
git diff --cached --name-only | grep -E "\.env$|password|secret" || echo "ok no secrets"
```

- [ ] **Step 4: 仅 5 文件 staged**

```bash
git diff --cached --name-only
```

预期:
- `app/package.json` (deps 改)
- `app/pnpm-lock.yaml` (lockfile)
- `app/src/utils/html.ts` (重写)
- `app/src/utils/html.test.ts` (改)
- `app/src/panels/MessagePanel.tsx` (3 处改)

- [ ] **Step 5: 手工 verification**

跳过 (本会话无 .env)。要测就: 1) 发一封含 `<img src="https://tracker.example/1x1.gif">` 的 HTML 邮件给自己;2) MessagePanel 应显示 "Show images (1)" 按钮,iframe 内 img 隐藏;3) 点按钮 → img 可见。

- [ ] **Step 6: 1 commit**

```bash
cd /Users/edwinhao/sendpalm
git add app/package.json \
        app/pnpm-lock.yaml \
        app/src/utils/html.ts \
        app/src/utils/html.test.ts \
        app/src/panels/MessagePanel.tsx
git commit -m "feat(privacy): tracking pixel gate + table/blockquote styles via DOMPurify" \
  -m "Per audit report 2026-08-11 (commit cb95452) §4 + §5.2 +
§7 HIGH-risk #3: external <img src='https://...'> in HTML
emails leaked read receipts to third-party trackers on every
message open. Add a 'Show images (N)' button (HEY-style) that
reveals external images on demand; cid:/data: images stay
visible always.

Also addresses §7 HIGH-risk #4 (no <table>/<blockquote>
styles) by injecting HEY-grade CSS into the iframe srcdoc.

Bonus: replace Sub-B regex sanitizer with DOMPurify, which
adds protection against <object>, <embed>, and
<link rel=stylesheet> (Sub-B's regex sanitizer missed these;
documented as known-acceptable-risk in Sub-B §8).

How it works:
- DOMPurify.afterSanitizeAttributes hook rewrites external
  <img> to a 1x1 placeholder + data-original-src + class
  'sp-img-hidden' during sanitization.
- iframe srcdoc CSS: .sp-img-hidden { display: none } +
  .sp-img-hidden[data-shown=true] { display: inline }.
- Click 'Show images' → parent postMessages 'sendpalm:show-images'
  to iframe → iframe script sets data-shown=true on all
  .sp-img-hidden elements.
- analyzeImages() returns {safeHtml, externalImageCount,
  hasTrackingPixel} so the button can show count + ⚠ indicator.

Tests: 10 Vitest unit tests rewritten for DOMPurify behavior
covering script strip, javascript: URL neutralization, image
hiding, cid: preservation, external count, tracking pixel
detection, table/blockquote preservation, object/embed/link
strip, event handler strip, target=_blank rel.

Refs: docs/superpowers/specs/2026-08-11-c-tracking-pixels-table-styles-design.md
Refs: docs/superpowers/audit/2026-08-11-email-html-link-audit.md §4, §5.2, §7"
```

- [ ] **Step 7: 验证 commit**

```bash
git log --oneline -3
git show --stat HEAD | head -10
```

预期: 1 commit, 5 files changed.

---

## Self-Review (per writing-plans skill)

**1. Spec coverage:**
- Spec §1 (背景) → Task 1-2 rationale ✅
- Spec §2 (目标) → Tasks 1-4 deliverables ✅
- Spec §3 (非目标) → not adding proxy, not adding per-sender memory ✅
- Spec §4 (Architecture) → Tasks 1-5 implement postMessage bridge + DOMPurify + CSS ✅
- Spec §5.1 (deps) → Task 1 ✅
- Spec §5.2 (utils/html.ts) → Task 2 ✅
- Spec §5.3 (test rewrite) → Task 3 ✅
- Spec §5.4 (MessagePanel 3 changes) → Task 4 ✅
- Spec §6 (DoD) → Task 5 steps 1-7 ✅
- Spec §7 (risks) → Task 4 step 5 (iframe postMessage iOS), Task 5 step 5 (manual skipped) ✅
- Spec §8 (other sub-project deps) → depends on Sub-B (已 commit `22a601a`); Sub-A 不依赖 ✅
- Spec §9 (references) → Task 5 step 6 commit body ✅

**2. Placeholder scan:**
- "TBD" / "TODO" / "fill in" → 0
- All bash commands have explicit content

**3. Type/接口 一致性:**
- Task 1 adds `dompurify` + `@types/dompurify` ✅
- Task 2 `sanitizeEmailHtml` signature preserved (`(html: string): string`) — Sub-B callers still work ✅
- Task 2 new `analyzeImages` returns `ImageAnalysis` interface (defined in same file) ✅
- Task 3 tests cover both `sanitizeEmailHtml` and `analyzeImages` ✅
- Task 4 `imageAnalysis` createMemo + button JSX use correct signal pattern ✅
- Task 5 commit message references audit commit + spec path consistently ✅
- Log files use `fix-c-*` prefix distinct from audit + Sub-A + Sub-B ✅