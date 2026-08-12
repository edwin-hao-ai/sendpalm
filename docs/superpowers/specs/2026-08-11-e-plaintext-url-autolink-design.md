# E. SendPalm 纯文本 URL 自动链接 (plain-text view)

> Spec authored 2026-08-11. Status: Draft. Sub-project E of the 2026-08-11 email/HTML/link audit fix series (commit `cb95452`). 5 个独立 sub-project 之一 (A/B/C/D 各有独立 spec/plan/implementation)。

## 1. 背景与问题

`cb95452` §5.3 + §7:
- ❌ 纯文本视图 (`MessagePanel.tsx:1790-1798` `formatBodyParagraphs`) **不**自动识别 URL —— 长 URL 显示为纯文本,不可点击
- `plainTextToHtml` 已存在 (`app/src/utils/html.ts:77-88`),Compose (`Compose.tsx:108, 346`) 用来把外发邮件 body 转 HTML,但 incoming plain-text 视图没用

## 2. 目标

- 纯文本视图渲染时,自动识别 `https?://` + `mailto:` URL,转 `<a>` 可点
- 链接点击走 `@tauri-apps/plugin-opener` (与 Sub-B 一致),modifier-click 让浏览器处理

## 3. 非目标

- ❌ 不识别裸 domain (如 `example.com` 无 `http://` 前缀) —— false-positive 风险 (如 "the apple" 被链)
- ❌ 不识别 `tel:` / `ftp:` 等其他 scheme (后续 sub)
- ❌ 不动 HTML body 渲染 (Sub-B/C 范畴)

## 4. Architecture

### 4.1 扩展 `plainTextToHtml`

当前 regex:
```ts
/(https?:\/\/[^\s<]+)/g
```

扩展为同时匹配 `mailto:`:
```ts
/(https?:\/\/[^\s<]+|mailto:[^\s<]+)/g
```

保持其他 escape + `<br>` 行为不动。

### 4.2 MessagePanel 渲染 plain-text view

当前 (`MessagePanel.tsx:1024-1049`):

```tsx
<For each={formatBodyParagraphs(m.body)}>
  {(p) => (<p style={...}>{p}</p>)}
</For>
```

改为:
```tsx
{/* eslint-disable-next-line solid/no-innerhtml */}
<div
  class="sp-plaintext-body"
  style={{ ... }}
  // eslint-disable-next-line
  innerHTML={plainTextToHtml(m.body)}
/>
```

`plainTextToHtml` 已 escape `<>&`,所以 innerHTML 注入安全 (受限于 regex 不漏 boundary)。

### 4.3 父级 click handler (新)

Sub-B 的 `<a>` click 拦截只跑在 iframe 内;plain-text view 在主 DOM。需要父级 click delegation:

```tsx
const parentClickHandler = (e: MouseEvent) => {
  const target = e.target as HTMLElement | null;
  const a = target?.closest?.("a[href]");
  if (!a) return;
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  e.stopPropagation();
  openUrl(a.href).catch(() => {});
};

// 在 MessagePanel 顶层 (createMemo 区附近):
<div onClick={parentClickHandler}>
  {/* 整个 MessagePanel 内容 */}
</div>
```

或者用 SolidJS 的 `on:` 事件委托 — SolidJS event handlers naturally use event delegation by default for `onClick` (registered at the document root for SolidJS events). 实际写法:

```tsx
<div onClick={parentClickHandler}>
  ...
</div>
```

SolidJS 的 `onClick` 是 component-level delegation,与 DOM `addEventListener` 不同 — 自动只对 current component tree 起作用。

### 4.4 数据流

```
纯文本 m.body
  → plainTextToHtml(m.body) // escape + auto-link https + mailto
  → <div innerHTML={...}> in MessagePanel

用户点击 <a>
  → SolidJS onClick 委托 → parentClickHandler
  → openUrl(href) // 系统浏览器/mail 客户端
```

## 5. 改动清单

### 5.1 `app/src/utils/html.ts:84`

```diff
   const withLinks = withBreaks.replace(
-    /(https?:\/\/[^\s<]+)/g,
+    /(https?:\/\/[^\s<]+|mailto:[^\s<]+)/g,
     '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>',
   );
```

### 5.2 `app/src/panels/MessagePanel.tsx` 3 处

**(a)** 加 import: `import { plainTextToHtml } from "../utils/html";` (如未 import)。

**(b)** plain-text 视图 (line 1024-1049) 改用 `innerHTML`:

```tsx
<Show when={viewMode() !== "source"}>
  <Show
    when={viewMode() === "rendered" && m.bodyHtml}
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
  >
    <iframe ... />
  </Show>
</Show>
```

**(c)** 父级 click handler: 在 MessagePanel 函数体顶层加 handler + 在 JSX 顶层包 `<div onClick={handler}>` (或写到 SolidJS root JSX 已有 div 上)。

### 5.3 `app/src/test/html.test.ts` 加 2 测试

```ts
it("plainTextToHtml auto-links mailto URLs", () => {
  const out = plainTextToHtml("Contact me at mailto:a@b.com or a@b.com");
  expect(out).toContain('<a href="mailto:a@b.com"');
});

it("plainTextToHtml still escapes < > &", () => {
  const out = plainTextToHtml("a < b & c > d");
  expect(out).toContain("&lt;");
  expect(out).toContain("&amp;");
  expect(out).toContain("&gt;");
  expect(out).not.toContain("<b>");
});
```

## 6. Definition of Done

- [ ] `app/src/utils/html.ts` regex 扩含 `mailto:`
- [ ] `app/src/panels/MessagePanel.tsx` plain-text 视图用 `innerHTML={plainTextToHtml(...)}`
- [ ] `app/src/panels/MessagePanel.tsx` 父级 click handler 路由 plain-text `<a>` 到 `opener.openUrl`
- [ ] `app/src/test/html.test.ts` 加 2 测试 (mailto auto-link + escape preserved)
- [ ] `pnpm test` 全绿 (152 现有 + 2 新)
- [ ] `pnpm typecheck` 全绿
- [ ] `pnpm lint` 状态不变
- [ ] 1 个 conventional commit `feat(ui): auto-link plain-text view (mailto: + https://)`
- [ ] 不写 `docs/PROGRESS.md`

## 7. 风险

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| innerHTML XSS if `plainTextToHtml` 漏 escape | 低 | XSS | 函数已 escape `<>&`,URL 限定 `https?://` + `mailto:` scheme;测试覆盖 escape case |
| 父级 click handler 拦截到非 `<a>` 的 click | 极低 | 误开 | `e.target.closest("a[href]")` 限定;只处理匹配元素 |
| SolidJS onClick delegation 范围过宽 | 极低 | 影响其他组件 | handler 只在 MessagePanel root div 上注册 |
| `mailto:` URL 匹配包含 `<` 在 URL 里时 regex 漏 | 极低 | URL 截断 | regex `[^\s<]+` 限制到 `<` 之前 |

**回退**: 1 commit `git revert <sha>`。

## 8. References

- Audit report: `docs/superpowers/audit/2026-08-11-email-html-link-audit.md` §5.3, §7
- Audit commit: `cb95452`
- Sub-B opener integration: `docs/superpowers/specs/2026-08-11-b-link-click-mailto-design.md` §5.2 (parent listener pattern)
- AGENTS.md §3.4 (logic change → tests), §3.5 (conventional commits), §3.7 (verification-before-completion)