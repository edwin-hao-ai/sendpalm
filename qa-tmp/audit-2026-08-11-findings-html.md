# HTML 渲染链路审计 findings (草稿)

> Auditor: superpowers Task 6 of `2026-08-11-email-html-link-audit`.
> Scope: read-only audit of the HTML email body rendering path.
> Files inspected: `app/src/panels/MessagePanel.tsx` (68 K), `app/src/styles/base.css`, `app/src/stores/data.ts`, `app/src/types/index.ts`, `app/src/utils/html.ts`, `app/src-tauri/src/services/parser.rs` (HTML branch only), `app/package.json`.
> Verdict criteria: ✅ present and correct, 🟡 present but imperfect, ❌ missing.

---

## 1. 渲染入口 (`MessagePanel.tsx`)

### 1.1 渲染方式: `iframe srcdoc` — 不是 `innerHTML`

✅ SolidJS 端 **没有** `innerHTML` / `outerHTML` / `dangerouslySetInnerHTML` 任何一处,HTML body 渲染走的是 **`<iframe sandbox srcdoc>`** 隔离方案。

Evidence:

- `grep -rn "innerHTML\|outerHTML" app/src/` → **0 matches**.
- `grep -rn "srcdoc\|DOMPurify\|sanitize" app/src/` → 唯一一处 `srcdoc` 在 `MessagePanel.tsx:1066`。
- `MessagePanel.tsx:62-77` — `htmlEmailSrcdoc(html)`:
  ```ts
  return `<!DOCTYPE html>
  <html>
  <head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>html, body { … }; img { max-width: 100%; height: auto; } a { color: #0A8F63; } pre { white-space: pre-wrap; overflow-wrap: anywhere; }</style>
  </head>
  <body>${html}</body>
  </html>`;
  ```
  `${html}` 直接拼接,**不做转义也不做 sanitize** — 隔离完全依赖 iframe sandbox。
- `MessagePanel.tsx:1052-1075` — iframe 使用:
  ```tsx
  <iframe
    ref={(el) => { el.onload = () => { try { const doc = el.contentDocument; … } catch { /* sandboxed */ } }; }}
    srcdoc={htmlEmailSrcdoc(m.bodyHtml!)}
    sandbox="allow-same-origin"
    style={{ width: "100%", "min-height": "240px", border: "none", "background-color": "transparent" }}
    title="Message body"
  />
  ```
- `MessagePanel.tsx:1024-1051` — fallback 路径 (无 HTML body 或 view mode 不是 "rendered") 用纯文本 `<p>` 渲染,内容走 Solid 默认转义:
  ```tsx
  <For each={formatBodyParagraphs(m.body)}>
    {(p) => (<p style={{ "white-space": "pre-wrap" }}>{p}</p>)}
  </For>
  ```
  `formatBodyParagraphs` 定义在 `MessagePanel.tsx:1790-1798`,纯字符串切分,无 HTML 注入风险。

### 1.2 Sanitizer 库依赖

❌ **没有** DOMPurify 或任何 sanitizer 库在 `package.json` 里。

Evidence:

- `app/package.json:23-35` (dependencies) 完整列表: `@tauri-apps/api`, `@tauri-apps/plugin-*` (clipboard-manager, dialog, fs, notification, opener, os, sql, store), `fuse.js`, `solid-js` — **无 DOMPurify,无 sanitize-html,无 jsdom-as-browser**。
- `app/package.json:36-54` (devDependencies) 也无上述依赖。

Caveat: 当前靠 iframe sandbox 隔离已经覆盖了 `<script>` 执行风险 (见 §1.3)。但任何未来给 iframe 加 `allow-scripts`、把渲染迁出 iframe、或在 compose preview 里渲染用户输入的 HTML 时,都需要引入 sanitizer。

### 1.3 CSS / DOM 隔离 (iframe sandbox)

🟡 iframe sandbox 是 **隔离机制**,不是 sanitize。**没有 `allow-scripts`**,所以 `<script>` 不执行 ✅;但 `allow-same-origin` 在场,是个值得注意的取舍。

Evidence:

- `MessagePanel.tsx:1067` — `sandbox="allow-same-origin"`。
- 全仓 `grep -rn "allow-scripts\|allow-popups\|allow-forms"` → 0 matches。沙箱**只**授予 `allow-same-origin`,**没有** `allow-scripts` / `allow-popups` / `allow-forms` / `allow-top-navigation`。

实际生效的边界:
- ✅ `<script>` / `<iframe src="...">` 嵌套 / `javascript:` URL — **不执行** (无 `allow-scripts`)。
- ✅ `<form action="…">` 提交 — **被拦截** (无 `allow-forms`)。
- ✅ `window.open()` / 弹窗 — **被拦截** (无 `allow-popups`)。
- ✅ `top.location = ...` / `window.top.location = ...` 等顶层导航 — **被拦截** (无 `allow-top-navigation`)。`postMessage` 不属于导航,不在此 gating 范围;若邮件脚本(假设未来开启 `allow-scripts`)想通过 `parent.postMessage(…)` 与父页通信,理论仍可达,但当前没有 `allow-scripts` 允许脚本执行,所以本条目前不会发生。
- 🟡 `<a href="…">` — 不属于 sandbox 控制范围。点击后默认在 iframe 内导航(浏览器行为);因为这个 iframe 是 `srcdoc` 创建的且**没有 `name` 属性**,也不在顶层 window,链接的导航被**局限在 iframe 内部** — 即用户看到的是 iframe 区域被替换成目标页(邮件 layout 错位、甚至看不到返回)。HEY/Gmail 的做法是用 `target="_blank"` + 父页 `opener` 拦截/接管,SendPalm 还没接 — 这是 Task 7 要解决的。
- 🟡 `allow-same-origin` 的副作用 — iframe 与父页同源,因此父页的 `el.contentDocument` (line 1056) 能拿到 iframe DOM。这只是为了自动算 `scrollHeight` 设高度,但也意味着如果将来误加 `allow-scripts`,iframe 里的脚本就能读到父 origin 的 localStorage / cookies / Tauri APIs。

Caveat: 父页 `iframe.onload` (line 1054-1064) 用 `try/catch` 包裹了 `contentDocument` 访问,如果把 sandbox 改成空字符串 `""` (最严格),这个 catch 会兜住 (注释 line 1062: `sandboxed or cross-origin iframe — keep default height`),只是 `min-height: 240px` 写死,UX 略差。

### 1.4 `cid:` 内联图片是否解析

🟡 Parser 把 `cid:` 重写为 **`data:` base64 URL** (不是 brief 里猜的 `attachment://`),inline 图片能正确显示;但 brief 假设的 `attachment://` scheme **根本不存在**。

Evidence:

- `parser.rs:79` — `let body_html = extract_html(&parsed).map(|html| rewrite_inline_images(&html, &attachments));`
- `parser.rs:227-247` — `fn rewrite_inline_images`:
  ```rust
  let b64 = base64::engine::general_purpose::STANDARD.encode(bytes);
  let data_url = format!("data:{};base64,{}", att.mime, b64);
  let quoted = format!("cid:\"{}\"", cid);
  let plain = format!("cid:{}", cid);
  out = out.replace(&quoted, &data_url);
  out = out.replace(&plain, &data_url);
  ```
- 全仓 `grep -rn "attachment://" app/` → **0 matches**。
- 全仓 `grep -n "cid:" app/src/panels/MessagePanel.tsx` → 0 matches (前端不再处理 `cid:`,parser 已经处理完了)。

注意:
- ✅ 实现了 brief 关注的"内联 cid: 渲染"目标。
- 🟡 base64 嵌入到 HTML body 里,如果一张大图会让 `body_html` 列膨胀几 MB。SQLite TEXT 列默认能撑,但**没有显式限大小**,恶意邮件塞 10 MB 的 inline 图会让 messages 表臃肿。
- � `rewrite_inline_images` 只在 `att.content_id.is_some() && att.mime.starts_with("image/")` 时重写,纯文本 cid: 引用 (比如 CSS 里的 `background: url(cid:…)`) 不会处理 — 这是符合预期的。

### 1.5 外链 `<img>` 处理 (lazy / blocked / proxy)

❌ **在邮件 HTML 渲染路径上**没有任何外链图片拦截、proxy 或 lazy-load 策略。iframe 里的 `<img src="https://tracker.example/open.gif">` 会直接发请求,泄露"已读"信号。**注意**:本结论只覆盖 `MessagePanel.tsx` 的 `htmlEmailSrcdoc` + iframe 这条邮件渲染链路;全仓其它位置的 `loading="lazy"` (例如 `app/src/components/Avatar.tsx:54` 给头像 `<img>` 用的) 与邮件 HTML 渲染无关,不在本条 finding 范围。

Evidence:

- `MessagePanel.tsx:62-77` — `htmlEmailSrcdoc` 注入的 `<style>` 只对 `html/body/img/a/pre` 四个选择器生效,**没有**针对外链 `img` 的限制。
- 全仓 `grep -rn "tracking.*img\|img.*proxy\|img.*lazy\|tracking.*proxy"` → 无匹配。
- `app/src/utils/trackers.ts` (45 行) 只是**检测**追踪 URL (`detectTrackers`),用于 UI 提示 trackers 数量,不改 HTML:
  ```ts
  export function detectTrackers(text: string): Tracker[] { … }
  ```
  在 `MessagePanel.tsx:443-450` 用 `trackerSummary(m.body + " " + m.prev)` 在 thread 旁显示"3 trackers";但 plain text 里的 URL ≠ HTML body 里的 `<img src>`。
- ❌ 没有任何把 `<img src="http://…">` 改写为 `data:blank` / 拦截 / 走本地 proxy 的代码路径。

后果: 邮件里的跟踪像素 (1×1 GIF)、社交平台预览图、远程 logo 等都会在用户打开 MessagePanel 时**自动加载**,向第三方泄露:用户打开了此邮件、IP、User-Agent、阅读时间。HEY 客户端默认会显示 "Show images" 按钮要求用户手动开启 — SendPalm 完全没有这个开关。

---

## 2. 长 URL 折行 (`base.css`)

### 2.1 全局 `p { overflow-wrap: anywhere }`

✅ AGENTS §11 提醒过的 `overflow-wrap: anywhere` 已经在全局 `p` 规则里。

Evidence:

- `base.css:48-51`:
  ```css
  p {
    margin: 0;
    overflow-wrap: anywhere;
  }
  ```
- `MessagePanel.tsx:1033` — plain text 渲染的 `<div>` 也显式加了 `overflow-wrap: anywhere; word-break: break-word;` 双保险:
  ```tsx
  <div style={{
    "font-size": "var(--text-body-sm)",
    color: "var(--text-secondary)",
    "line-height": 1.6,
    "overflow-wrap": "anywhere",
    "word-break": "break-word",
  }}>
  ```
- `MessagePanel.tsx:1014-1018` — source mode 的 `<pre>` 也加了 `overflow-wrap: anywhere`:
  ```tsx
  style={{
    "white-space": "pre-wrap",
    "overflow-wrap": "anywhere",
    "max-height": "480px",
    "overflow-y": "auto",
  }}
  ```
- `MessagePanel.tsx:72` (srcdoc 内联 CSS) — `pre { white-space: pre-wrap; overflow-wrap: anywhere; }` 也覆盖了 HTML body 里的 `<pre>`。

结论: 折行在 plain text / pre / source mode / HTML srcdoc 四条路径都覆盖到了。 ✅

### 2.2 其他可能溢出的容器

🟡 `a` 元素没有显式 `overflow-wrap: anywhere`。但因为父级 `<p>` 已经声明,继承生效 — 实际不会溢出。**未必要修**。

Evidence:

- `base.css:53-57` — `a { color: var(--blurple); text-decoration: none; transition: … }` 无 `overflow-wrap`。
- `base.css:84-90` — `input, textarea, select` 无 `overflow-wrap`。textarea 用户可粘贴长 URL,理论上 textarea 不需要折行 (原生支持横向滚动),不修。

---

## 3. `<table>` / `<blockquote>` 样式

❌ **没有**为 HTML body 里的 `<table>` / `<th>` / `<td>` / `<blockquote>` 提供任何样式。HTML 邮件普遍用 `<table>` 布局,会渲染成浏览器默认 — 看起来非常 1990s (无 padding、无 border-collapse、cellpadding=0)。

Evidence:

- **Scoped to email-rendering-relevant code** (前端组件里 `table` / `blockquote` 多用于业务 UI,与邮件样式无关;以下只查渲染路径本身):
  - `grep -n "table\|blockquote" app/src/panels/MessagePanel.tsx` → **0 matches**。组件本身不渲染 `<table>` / `<blockquote>`,只在 iframe srcdoc 里透传 HTML body。
  - `grep -n "table\|blockquote" app/src/styles/` → `table` / `blockquote` 选择器 **0 matches** (`grid-template-columns` 等 CSS 关键字命中是误命中,已排除)。
  - 仓内其它 `<blockquote>` 实例 (如 `app/src/views/Clips.tsx:255-268` 的引用块样式) 属于 Clips 视图 UI,**不在邮件 HTML 渲染路径**上,不影响本结论。
- `MessagePanel.tsx:62-77` — `htmlEmailSrcdoc` 注入的 `<style>` 块只覆盖 `html, body, img, a, pre`,没有 `table, th, td, blockquote, h1-h6, ul, ol, li, hr`。

后果: HTML 邮件 layout `<table>` 没有 padding / border-spacing / 宽度自适应;引用 `<blockquote>` 没有左边框 / 缩进 — 比 HEY/Gmail 的默认邮件样式要简陋。

---

## 4. `Message` 类型 (`stores/data.ts` + `types/index.ts`)

### 4.1 `bodyHtml` 字段

✅ 前端 `Message` 类型有 `bodyHtml?: string | null`,`rowToMessage` 正确映射 `r.body_html` → `bodyHtml`。

Evidence:

- `app/src/types/index.ts:142-172` — `interface Message` 第 148 行:
  ```ts
  bodyHtml?: string | null;
  ```
- `app/src/stores/data.ts:147-177` — `rowToMessage`:
  ```ts
  body: r.body as string,
  bodyHtml: (r.body_html as string | null) ?? null,
  ```
- `app/src/stores/data.ts:708` — INSERT 时 `body_html` 列也在 columns 列表里,`data.ts:715` UPSERT `body_html=excluded.body_html`。
- `app/src/stores/data.ts:730` — `m.bodyHtml ?? null` 在某个 select 里用 (确认字段被读)。

### 4.2 序列化约定

✅ `r.body_html` (snake_case) → `bodyHtml` (camelCase) 的映射在 `rowToMessage` 里手动完成,不依赖 IPC macro 的 `rename_all`,因为这条路径走的是 `tauri-plugin-sql` 直接 SQL,不是 `#[tauri::command]`。

Evidence:

- `app/src/stores/data.ts:687-692` — `listMessages` 用 `db.select("SELECT * FROM messages ORDER BY st DESC")` (`tauri-plugin-sql`),不走 Rust command。
- `data.ts:147-177` — `rowToMessage` 逐字段映射,无 `rename_all` 依赖。

---

## 5. 渲染时机 / 视图状态

### 5.1 三种 view mode

✅ MessagePanel 提供 `rendered` / `plain` / `source` 三种模式,HTML 只在 `rendered` 模式下走 iframe。

Evidence:

- `MessagePanel.tsx:60` — `type ViewMode = "rendered" | "plain" | "source";`
- `MessagePanel.tsx:97` — `const [viewMode, setViewMode] = createSignal<ViewMode>("rendered");`
- `MessagePanel.tsx:1024-1026`:
  ```tsx
  <Show when={viewMode() !== "source"}>
    <Show
      when={viewMode() === "rendered" && m.bodyHtml}
      fallback={ /* plain text For loop */ }
    >
      <iframe … />
  ```
- `MessagePanel.tsx:993-1022` (前一段) — `viewMode() === "source"` 走 `<pre>{formatMessageSource(m, sender())}</pre>` 原始文本。

✅ Plain / Source 模式都不渲染 HTML,自动 fallback 到纯文本 — 这两个模式下没有 XSS 风险。

---

## 6. Summary table

| Area | Checks | ✅ | 🟡 | ❌ |
|---|---|---|---|---|
| `MessagePanel.tsx` render path | 5 | 4 (iframe srcdoc, view modes, plain fallback, long URL wrap) | 1 (cid: uses data: not attachment://) | 0 |
| XSS / sanitizer | 2 | 1 (no innerHTML anywhere; sandbox blocks scripts) | 1 (allow-same-origin present; no DOMPurify) | 0 |
| `cid:` inline images | 1 | 0 | 1 (parser rewrites to data: URL; works but brief's `attachment://` scheme does not exist) | 0 |
| External `<img>` policy | 1 | 0 | 0 | 1 (no blocking / proxy / "show images" gate) |
| Long URL wrap (`base.css`) | 1 | 1 (global `p { overflow-wrap: anywhere }`) | 0 | 0 |
| `<table>` / `<blockquote>` styling | 1 | 0 | 0 | 1 (no rules in base.css / srcdoc inline style) |
| `Message.bodyHtml` type + mapping | 2 | 2 (type field, rowToMessage mapping) | 0 | 0 |
| View mode gating | 1 | 1 (rendered/plain/source, only rendered renders HTML) | 0 | 0 |
| Test coverage | — | — | — | 🟡 no test for `htmlEmailSrcdoc` or `iframe srcdoc` rendering (`app/src/test/html.test.ts` only tests `htmlToPlainText` / `plainTextToHtml`; e2e only sets `bodyHtml: null`) |

---

## Top issues found (ranked)

1. **❌ 没有 "show images" 拦截开关 / 第三方图片 proxy。** `htmlEmailSrcdoc` (MessagePanel.tsx:62-77) 直接渲染邮件里的 `<img src="https://tracker/…">`,iframe 没有 `loading="lazy"` 之外的策略。tracker detector (utils/trackers.ts:1-45) 只展示计数、不改 HTML。打开任一含跟踪像素的邮件都会泄露"已读 + UA + IP"给第三方。

2. **🟡 iframe sandbox 用了 `allow-same-origin`,且 `htmlEmailSrcdoc` 不 sanitize 也不转义 HTML。** 当前没有 `allow-scripts` 所以脚本不执行,XSS 风险被 sandbox 拦住;但这是**单一防线**。如果将来有人给 iframe 加 `allow-scripts` (为了"展开折叠"或"渲染图表"),或者把 HTML 渲染迁移到主 DOM (compose preview、search 摘要、notification 卡片),就会出现真正的 XSS。**强烈建议**把 `htmlEmailSrcdoc` 改成 sanitize 路径 (DOMPurify 之类),哪怕现在 sandbox 已经够用 — defense-in-depth。

3. **� HTML body 没有 `<table>` / `<blockquote>` 样式。** srcdoc 内联 `<style>` 只覆盖 4 个选择器 (html/body/img/a/pre)。HTML 邮件 layout 用 `<table>`,渲染会非常简陋;引用块 `<blockquote>` 也没有左边框。

4. **� `cid:` inline 图片走 base64 data URL,** 不走 `attachment://` 路径。功能等价、且更省事 (不依赖前端 `getAttachmentContent`),但**没有显式大小限制**,恶意邮件可以塞超大 inline 图让 `body_html` 列膨胀。AGENTS §10.5 提到 `attachment://`,这条路径根本没实现 — 既然数据流已经定型,文档也应该更新成"data: URL"。

5. **🟡 没有针对 HTML body 渲染的单元 / e2e 测试。** `app/src/test/html.test.ts` 只测 `htmlToPlainText` / `plainTextToHtml`,跟 MessagePanel 的渲染无关;e2e 里所有 `bodyHtml: null` (workflows.spec.ts:77, 756)。新增"渲染含 cid: / 含 tracker / 含大 inline 图"三个 e2e 用例能避免未来回归。

---

## Fix round 1 (per `task-6-review.md` 2026-08-11)

Reviewer 提了 1 个错误证据 + 3 个不精确描述,本节说明逐条修复并给出修正后的复验证据。

### Fix 1 — Wrong evidence: `table|blockquote` repo-wide grep claim (原 §3 Evidence)

**Before (有错):** 原文写"`grep -rn "table\|blockquote" app/src/ --include="*.tsx"` → 0 命中",实际是错的 — 仓内有真实的 `<blockquote>` (例如 `app/src/views/Clips.tsx:255-268`)。`grep -rn "table\|blockquote" app/src/styles/` 也命中了 `grid-template-columns` / `tablet` 等无关 CSS 关键字。

**After:** §3 Evidence 改为显式作用域"email-rendering-relevant"代码:
- `grep -n "table\|blockquote" app/src/panels/MessagePanel.tsx` → **0 matches** (邮件渲染组件本身不写 `<table>` / `<blockquote>`)。
- `grep -n "table\|blockquote" app/src/styles/` → `table` / `blockquote` 选择器 **0 matches**;3 处误命中 (`grid-template-columns` × 2、`--sidebar-width-tablet` × 1) 显式排除。
- 仓内其它 `<blockquote>` 实例 (`Clips.tsx`) 明确标注为"Clips 视图 UI,不在邮件渲染路径",不影响本结论。
- 保留 `MessagePanel.tsx:62-77` 的 srcdoc 内联 `<style>` 块证据(只覆盖 4 个选择器)。

**Re-verify (本轮重新跑):**
```
$ grep -n "table\|blockquote" app/src/panels/MessagePanel.tsx
0 matches for 'table\|blockquote'

$ grep -n "table\|blockquote" app/src/styles/
3 matches in 2 files:
  app/src/styles/base.css:202:    grid-template-columns: var(--sidebar-width-tablet) 1fr;
  app/src/styles/base.css:209:    grid-template-columns: var(--sidebar-width-tablet) 1fr;
  app/src/styles/tokens.css:151:--sidebar-width-tablet: 64px;
```
✅ 修正后结论仍成立,且不再与仓内真实 `<blockquote>` 冲突。

### Fix 2 — Imprecise: `parent.postMessage` not gated by `allow-top-navigation` (原 §1.3 sandbox 边界第 4 条 bullet)

**Before:** "`top.location = ...` / `parent.postMessage` 导航 — **被拦截** (无 `allow-top-navigation`)" — `postMessage` 不是导航,不受 `allow-top-navigation` 控制。

**After:** 该 bullet 改为"`top.location = ...` / `window.top.location = ...` 等顶层导航 — **被拦截** (无 `allow-top-navigation`)",并补一段说明 `postMessage` 不在 gating 范围,以及"当前 `allow-scripts` 未授予 → 脚本不发,所以 `parent.postMessage` 目前也不会发生"。

### Fix 3 — Imprecise: 邮件链接"点了不响应"措辞过强 (原 §1.3 sandbox 边界第 5 条 bullet)

**Before:** "邮件里的链接实际上'点了不响应' (因为 iframe srcdoc 没有 `name` 也不是顶层 window)" — 这是个错误的浏览器行为描述;`<a href>` 点击**会**触发导航,只是被局限在 iframe 内。

**After:** 该 bullet 改为准确描述:"`<a href="…">` 不属于 sandbox 控制范围。点击后默认在 iframe 内导航(浏览器行为);因为这个 iframe 是 `srcdoc` 创建的且**没有 `name` 属性**,也不在顶层 window,链接的导航被**局限在 iframe 内部** — 即用户看到的是 iframe 区域被替换成目标页。" 并加注:HEY/Gmail 用 `target="_blank"` + 父页 `opener` 拦截/接管,SendPalm 还没接 — **Task 7 要解决的**。

### Fix 4 — Scope: "no external image policy" 需显式作用域 (原 §1.5)

**Before:** "❌ **没有**任何外链图片拦截、proxy 或 lazy-load 策略。" — 没说"在邮件渲染路径上",读者可能误以为全仓都没有 lazy load(其实 `app/src/components/Avatar.tsx:54` 头像 `<img>` 用 `loading="lazy"`)。

**After:** §1.5 改为"❌ **在邮件 HTML 渲染路径上**没有任何外链图片拦截、proxy 或 lazy-load 策略",并显式提及 `Avatar.tsx:54` 不在本 finding 范围、只覆盖 `htmlEmailSrcdoc` + iframe 这条邮件链路。

### Summary of source modifications
**无**。本次修正只动 `qa-tmp/audit-2026-08-11-findings-html.md` 一个文件;`app/src/**` / `AGENTS.md` / 任何 `.rs` / `package.json` 均未触碰。
