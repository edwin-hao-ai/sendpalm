# Plan E: Plain-text URL Auto-link

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 纯文本邮件视图 (`MessagePanel.tsx` plain-text fallback) 自动识别 `https?://` + `mailto:` URL,转可点击 `<a>`,点击路由到 `@tauri-apps/plugin-opener`。

**Architecture:** 扩展 `plainTextToHtml` regex 加 `mailto:`;MessagePanel plain-text 视图改用 `innerHTML={plainTextToHtml(m.body)}`;父级 onClick delegation 拦截 `<a>` 调 `openUrl`。

**Tech Stack:** SolidJS, plain-text regex, `@tauri-apps/plugin-opener` (already), Vitest. No new deps.

## Global Constraints

Verbatim from spec + AGENTS.md:
- AGENTS.md §3.2: no `any`, no magic strings.
- AGENTS.md §3.4: tests mandatory — 2 new tests in html.test.ts.
- AGENTS.md §3.5: conventional commits; 1 commit at end.
- AGENTS.md §3.7: PR-ready cadence.
- Spec §5: exact regex / exact code changes.
- No `.env` / passwords / secrets staged.
- No modifications outside 3 files.

---

## Task 1: `app/src/utils/html.ts` 扩展 regex

**Files:**
- Modify: `app/src/utils/html.ts:84` (1 line regex)
- Read first: `app/src/utils/html.ts:77-88`

- [ ] **Step 1: 读当前 plainTextToHtml**

确认 line 84 是 regex `(https?:\/\/[^\s<]+)/g`。

- [ ] **Step 2: 改 regex 加 mailto**

```diff
   const withLinks = withBreaks.replace(
-    /(https?:\/\/[^\s<]+)/g,
+    /(https?:\/\/[^\s<]+|mailto:[^\s<]+)/g,
     '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>',
   );
```

- [ ] **Step 3: typecheck**

```bash
cd app && pnpm typecheck 2>&1 | tee qa-tmp/audit-2026-08-11-fix-e-typecheck.log
```

预期: 0 errors.

- [ ] **Step 4: 不 commit**

---

## Task 2: 加 2 测试 `app/src/test/html.test.ts`

**Files:**
- Modify: `app/src/test/html.test.ts` (在 `describe("plainTextToHtml", ...)` 末尾加 2 it-blocks)
- Read first: `app/src/test/html.test.ts` (找 plainTextToHtml describe 块)

- [ ] **Step 1: 读现有 html.test.ts**

确认 plainTextToHtml describe 块结构和命名。

- [ ] **Step 2: 加 2 测试**

```ts
it("plainTextToHtml auto-links mailto URLs", () => {
  const out = plainTextToHtml("Contact me at mailto:a@b.com or a@b.com");
  expect(out).toContain('<a href="mailto:a@b.com"');
});

it("plainTextToHtml still escapes < > & after regex change", () => {
  const out = plainTextToHtml("a < b & c > d");
  expect(out).toContain("&lt;");
  expect(out).toContain("&amp;");
  expect(out).toContain("&gt;");
  expect(out).not.toContain("<b>"); // not interpreted as HTML tag
});
```

- [ ] **Step 3: 跑测试**

```bash
cd app && pnpm test -- html.test 2>&1 | tee qa-tmp/audit-2026-08-11-fix-e-test-html.log
```

预期: 全部 pass (现有 + 2 新)。

- [ ] **Step 4: 不 commit**

---

## Task 3: MessagePanel 改 plain-text 视图 + 父级 click handler

**Files:**
- Modify: `app/src/panels/MessagePanel.tsx` (3 处: import, fallback JSX, 父级 onClick)
- Read first: `app/src/panels/MessagePanel.tsx:58` (imports) + `:1024-1049` (plain-text view) + `:60-90` (srcdoc 已有的 click handler)

- [ ] **Step 1: 读 imports + plain-text 视图**

确认 `openUrl` 已 import (Sub-B 已加) 和 plainTextToHtml 是否已 import (大概率没有)。

- [ ] **Step 2: 加 plainTextToHtml import**

```ts
import { plainTextToHtml } from "../utils/html";
```

(Sub-C 已重写 html.ts 加 analyzeImages,但 plainTextToHtml 仍 export。)

- [ ] **Step 3: 改 plain-text fallback JSX**

替换原 `<For each={formatBodyParagraphs(m.body)}>` 循环为 `<div innerHTML={plainTextToHtml(m.body)}>`:

```tsx
fallback={
  <div
    class="sp-plaintext-body"
    style={{
      "font-size": "var(--text-body-sm)",
      color: "var(--text-secondary)",
      "line-height": 1.6,
      "overflow-wrap": "anywhere",
      "word-break": "break-word",
    }}
    // eslint-disable-next-line solid/no-innerhtml
    innerHTML={plainTextToHtml(m.body)}
  />
}
```

`formatBodyParagraphs` 不再需要 (该函数在 MessagePanel.tsx:1790-1798,本次不动,可留 unused;未来 cleanup)。

- [ ] **Step 4: 加父级 onClick handler**

在 MessagePanel 函数体顶层 (createSignal 区附近) 加:

```ts
const handlePlainTextLinkClick = (e: MouseEvent) => {
  const target = e.target as HTMLElement | null;
  const a = target?.closest?.("a[href]");
  if (!a) return;
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  e.stopPropagation();
  openUrl(a.href).catch(() => {});
};
```

然后把 handler 绑到 MessagePanel JSX 顶层 wrapper:

```tsx
<div class="message-panel-root" onClick={handlePlainTextLinkClick}>
  {/* existing JSX */}
</div>
```

(具体位置取决于现有结构。Task 3 implementer 读 MessagePanel.tsx 顶层 div/JSX 后选择合适位置。)

- [ ] **Step 5: typecheck**

```bash
cd app && pnpm typecheck 2>&1 | tee qa-tmp/audit-2026-08-11-fix-e-typecheck-after-panel.log
```

预期: 0 errors.

- [ ] **Step 6: 不 commit**

---

## Task 4: 全套验证 + commit

**Files:**
- Stage: `app/src/utils/html.ts`, `app/src/test/html.test.ts`, `app/src/panels/MessagePanel.tsx`

- [ ] **Step 1: 全套 test**

```bash
cd app && pnpm test 2>&1 | tee qa-tmp/audit-2026-08-11-fix-e-test-full.log
```

预期: 152 现有 + 2 新 = 154 全绿。

- [ ] **Step 2: typecheck + lint**

```bash
cd app && pnpm typecheck 2>&1 | tee qa-tmp/audit-2026-08-11-fix-e-typecheck-final.log
cd app && pnpm lint 2>&1 | tee qa-tmp/audit-2026-08-11-fix-e-lint-final.log
```

预期: typecheck 0 errors;lint 1 pre-existing error (views.spec.ts) 不动。

- [ ] **Step 3: 无 secret**

```bash
git diff --cached --name-only | grep -E "\.env$|password|secret" || echo "ok no secrets"
```

- [ ] **Step 4: 仅 3 文件 staged**

```bash
git diff --cached --name-only
```

预期: `app/src/utils/html.ts`, `app/src/test/html.test.ts`, `app/src/panels/MessagePanel.tsx`。

- [ ] **Step 5: 1 commit**

```bash
cd /Users/edwinhao/sendpalm
git add app/src/utils/html.ts \
        app/src/test/html.test.ts \
        app/src/panels/MessagePanel.tsx
git commit -m "feat(ui): auto-link plain-text view (mailto: + https://)" \
  -m "Per audit report 2026-08-11 (commit cb95452) §5.3 +
§7 HIGH-risk #6: plain-text email body (or HTML body with
no bodyHtml fallback) rendered as raw text — long URLs were
inert, users had to copy-paste. Switch the plain-text view
to plainTextToHtml (which now also auto-links mailto:) and
wire a parent-level click handler that routes plain-text
<a> clicks through @tauri-apps/plugin-opener.openUrl (same
mechanism as Sub-B for HTML body iframe). Modifier-click
preserved (cmd/ctrl/shift/middle → browser default).

plainTextToHtml regex extended from https?:// only to also
match mailto:. Bare domain linking deliberately skipped
(false-positive risk: 'the apple' would link apple.com).

Tests: 2 new Vitest tests in app/src/test/html.test.ts cover
mailto auto-linking and XSS escape preservation.

Refs: docs/superpowers/specs/2026-08-11-e-plaintext-url-autolink-design.md
Refs: docs/superpowers/audit/2026-08-11-email-html-link-audit.md §5.3, §7"
```

- [ ] **Step 6: 验证 commit**

```bash
git log --oneline -3
git show --stat HEAD | head -8
```

预期: 1 commit, 3 files changed.

---

## Self-Review

**1. Spec coverage:**
- Spec §2 (目标) → Tasks 1-3 ✅
- Spec §3 (非目标) → 裸 domain 跳过 (per §2 final 范围) ✅
- Spec §4 (Architecture) → Tasks 1-3 implement ✅
- Spec §5.1 (html.ts) → Task 1 ✅
- Spec §5.2 (MessagePanel 3 changes) → Task 3 ✅
- Spec §5.3 (2 tests) → Task 2 ✅
- Spec §6 (DoD) → Task 4 ✅
- Spec §7 (risks) → Task 4 step 5 (manual skipped) ✅

**2. Placeholder scan:**
- "TBD" / "TODO" → 0

**3. Type/接口 一致性:**
- Task 1 regex change preserved function signature ✅
- Task 2 tests use existing `plainTextToHtml` import ✅
- Task 3 `handlePlainTextLinkClick` uses already-imported `openUrl` ✅
- Log files use `fix-e-*` prefix distinct from audit + Sub-A/B/C/D ✅