# 链接可点击链路审计 findings (草稿)

> Auditor: superpowers Task 7 of `2026-08-11-email-html-link-audit`.
> Scope: read-only audit of link clickability across the email message rendering path. Focus: `<a>` rendering, click interception, mailto handling, javascript: filtering, target=_blank / rel security, plain-text URL auto-linking.
> Files inspected: `app/src/panels/MessagePanel.tsx` (2096 lines), `app/src/ipc/commands.ts` (13 lines), `app/src/services/backend.ts` (163 lines), `app/src/utils/html.ts` (32 lines), `app/src/utils/trackers.ts` (45 lines), `app/src/panels/FilePanel.tsx` (383 lines, opener reference), `app/src-tauri/src/services/parser.rs` (519 lines), `app/package.json`.
> Verdict criteria: ✅ present and correct, 🟡 present but imperfect, ❌ missing.
> **`tracker.rs` does not exist** — `find app -name tracker.rs` returns 0 matches. Step 3 of the brief is therefore a no-op; link rewriting does not happen in Rust at all.

---

## 0. 沙箱与底层渲染回顾 (来自 Task 6)

为方便定位 Task 7 的判定,先把 Task 6 已经定下的渲染边界列出来:

- HTML body 走 `<iframe srcdoc sandbox="allow-same-origin">` (`MessagePanel.tsx:1052-1075`)。
- sandbox **只**授予 `allow-same-origin`,**没有** `allow-scripts` / `allow-popups` / `allow-forms` / `allow-top-navigation` (`grep -rn "allow-popups\|allow-top-navigation\|allow-scripts\|allow-forms" app/src/` → 0 matches)。
- iframe **没有 `name` 属性**,也不是顶层 window (`srcdoc` 创建)。
- srcdoc 拼接 (`htmlEmailSrcdoc`, `MessagePanel.tsx:62-77`) 直接 `${html}` 注入,**不转义、不 sanitize**。

这一组前提决定了下文所有"点击会发生什么"的判定。

---

## 1. `<a href>` 渲染是否保留

✅ HTML body 里的 `<a href>` 标签 **被原样保留**,没有被前端或 Rust 改写。

Evidence:

- `MessagePanel.tsx:62-77` — `htmlEmailSrcdoc(html)` 把 email HTML 直接拼到 `<body>${html}</body>`,**不**对 `<a>` 做任何重写 (无 DOMPurify,见 §2)。
- `parser.rs:79` — `let body_html = extract_html(&parsed).map(|html| rewrite_inline_images(&html, &attachments));` — 整个 HTML 写入 `body_html` 列之前**只**过一次 `rewrite_inline_images`。
- `parser.rs:227-247` — `rewrite_inline_images` **只**替换 `cid:` 为 `data:` URL,不动 `<a href>`:
  ```rust
  let quoted = format!("cid:\"{}\"", cid);
  let plain = format!("cid:{}", cid);
  out = out.replace(&quoted, &data_url);
  out = out.replace(&plain, &data_url);
  ```
- 全仓 `grep -rn 'href\|<a\|target=\|rel=\|noopener\|noreferrer\|javascript:' app/src-tauri/src/services/parser.rs` → **0 matches** (除测试 fixture 中邮件地址字面量如 `Alice <alice@example.com>`)。即 parser **没有**任何对 `<a>` 属性的清洗/重写逻辑。
- 全仓 `grep -rn 'href' app/src/panels/MessagePanel.tsx` → 0 matches for `<a href>` (除了用于 download 的 `a.href = dataUrl;` / `a.href = url;` 在 lines 403 / 1131 — 那是附件下载按钮自己造的临时 `<a>`,与邮件 HTML 无关)。

后果: 邮件 HTML 里的 `<a href="https://evil.com/?utm_…">` 原样进 iframe,**任何**属性 (`target`, `rel`, `onclick=…`, `style=…`, 等) 也都原样保留。

---

## 2. 点击是否被拦截 (`onClick` / `preventDefault` / 路由到 opener)

❌ **没有任何代码拦截 iframe 内 `<a>` 的点击**。`<a href>` 点击走浏览器默认行为,**不**路由到 `@tauri-apps/plugin-opener`。

Evidence:

- `MessagePanel.tsx:1052-1075` — iframe 的 `ref={(el) => { el.onload = () => { try { const doc = el.contentDocument; if (doc) { el.style.height = ${doc.body.scrollHeight + 16}px; } } catch { /* sandboxed or cross-origin iframe — keep default height */ } } }}` — **`onload` 回调只读 `scrollHeight` 设 iframe 自身高度**,**不**注册 click 监听、不调 `opener.openUrl`。
- 全仓 `grep -rn "opener\|openUrl\|open_url\|plugin-opener" app/src/ app/src-tauri/src/` → **仅 `app/src/panels/FilePanel.tsx:11` 一处**:
  ```ts
  import { openPath } from "@tauri-apps/plugin-opener";
  ```
  且 `openPath` 是用来**打开本地附件路径**,不是 URL。**MessagePanel.tsx 没有 import opener 任何 API** (`grep -n "opener" app/src/panels/MessagePanel.tsx` → 0 matches)。
- `app/src/ipc/commands.ts` 全文 13 行,**只有 `pingGreet` 一个 IPC 包装**,没有 `openUrl` / `openExternal` / `revealItemInDir` 等。
- `app/src/services/backend.ts` (`safeInvoke`) 调用的命令列表:`send_message`, `list_mailboxes`, `sync_now`, `get_sync_state`, `list_email_providers`, `vault_save/load/delete`, `add_calendar_event`, `get_attachment_content`, `get_attachment_path` — **没有任何 URL-opening 命令**。
- 全仓 `grep -rn 'addEventListener.*click\|onclick.*prevent' app/src/` → 命中在 `components/SwipeActions.tsx:151` / `views/Imbox.tsx:1286` / `notifications/NotificationPanel.tsx:69`,都是**主页面** dismiss/outside-click,不是 iframe 内链接处理。

后果 (跟 Task 6 §1.3 第 5 条 bullet 结论一致):

- iframe 沙箱**没有** `allow-popups`,所以 `<a target="_blank">` **不会**真的开新窗口,只是 **iframe 内**导航到一个空白页或外部页(显示在 iframe 矩形里)。
- iframe 沙箱**没有** `allow-top-navigation`,所以 `<a target="_top">` 也**不会**替换整个 Tauri webview,只是 iframe 内导航。
- 用户点了邮件里的链接,iframe 区域会被替换成目标站 (或 404 错误页),邮件 layout 错位;**没有** `window.history.back()` 把用户带回,只能手动点 sidebar 重选邮件。
- `@tauri-apps/plugin-opener` 已经装在 `app/package.json:23-35` (Task 6 evidence 中已确认),但**没有接入路径**。

---

## 3. `mailto:` 链接

❌ 没有任何代码识别/路由 `mailto:` 链接。

Evidence:

- 全仓 `grep -rn "mailto:" app/src/` → **0 matches**。前端**不**对 `mailto:` 做任何特殊处理。
- `parser.rs` 不识别 `mailto:` (`grep` → 0 matches),所以 `<a href="mailto:foo@bar.com">` 走的是 §1 的"原样保留"路径 — 进入 iframe 后是字面 `<a>` 元素。
- iframe 沙箱**没有** `allow-popups`,所以即使没有拦截,浏览器默认行为下 `mailto:` 在 iframe 里**也不会**唤起系统邮件客户端 (mailto 在顶层页面才会触发 OS handler;iframe 内浏览器默认忽略它或弹一个被 sandbox 阻止的 dialog)。**用户点 mailto 没有响应**。
- 同时没有 `mailto:` 落库 → contact 创建的路径。HEY/Gmail 的做法是:点了 mailto 后弹 "Add to contacts" 或 "Compose to …" UI。SendPalm 没接。
- **`@tauri-apps/plugin-opener` 也没被用来 `openUrl("mailto:…")`**。

后果: 邮件里有 "Contact me at foo@bar.com" 这种 `<a href="mailto:foo@bar.com">`,用户点击**没有任何效果** (iframe 沙箱拦截,前端不拦截/接管)。这是 HEY/Gmail 都覆盖、SendPalm 完全缺失的功能。

---

## 4. `href="javascript:..."` 过滤

❌ 前端/Rust **没有**显式过滤 `javascript:` URL。**但**因为 sandbox 没有 `allow-scripts`,目前 `javascript:` 实际**不执行**,所以 **🟡 — 防御深度不足,但当前不构成漏洞**。

Evidence:

- 全仓 `grep -rn 'javascript:' app/src/` → 0 matches。前端不识别/不替换 `javascript:` scheme。
- `parser.rs` 不清洗 `javascript:` (`grep` → 0 matches)。
- iframe sandbox 不授予 `allow-scripts` (Task 6 §1.3 已证),所以 `<a href="javascript:alert(1)">` 点击后浏览器**不会**执行 JS — 浏览器对 `javascript:` 在无 `allow-scripts` 的 srcdoc iframe 中是 no-op。

但是 (defense-in-depth 警告):
- 邮件里如果嵌入 `<a href="javascript:...">` 配合 `onclick` 属性,理论上 `<a>` 的 `onclick` 是 HTML event handler attribute,需要脚本执行才能触发;同样被 `allow-scripts` 缺席阻断。
- **真正的风险**:如果未来有人**给 iframe 加 `allow-scripts`** (例如为了"展开折叠"或"渲染图表"),未清洗的 `javascript:` 会立刻变成 XSS sink。同样的,如果未来把 HTML 渲染迁移到主 DOM (compose preview、search snippet、notification card),`javascript:` 会执行。
- 当前如果加一道显式过滤 (e.g. `out = out.replace(/(href|src)="javascript:[^"]*"/gi, '$1="#"')`),几乎零成本,但能堵住未来迁移时的隐患。

---

## 5. `target="_blank"` 安全 (`rel="noopener noreferrer"`)

❌ 邮件 HTML 里现成的 `<a target="_blank">` **不会**被自动补 `rel="noopener noreferrer"`。**但**因为 iframe 沙箱**没有** `allow-popups`,`target="_blank"` **不会**真的开新窗口 (见 §2),所以 **🟡 — 当前没有 tabnabbing 漏洞,但入口防御缺失**。

Evidence:

- 全仓 `grep -rn 'noopener\|noreferrer' app/src/` → **仅 2 处**:
  - `app/src/utils/html.ts:29` — `plainTextToHtml` 给**外发邮件**的 URL 自动加 `target="_blank" rel="noopener noreferrer"`:
    ```ts
    const withLinks = withBreaks.replace(
      /(https?:\/\/[^\s<]+)/g,
      '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>',
    );
    ```
    注意:此函数**只**被 Compose 路径用 (`grep "plainTextToHtml" app/` → `Compose.tsx:108, 346`、`test/html.test.ts:2, 4, 18, 20, 25, 30`),**不**被 incoming 邮件渲染路径用。
  - `app/src/test/html.test.ts:32` — 测试断言。
- `MessagePanel.tsx` **不**对 incoming `<a>` 做任何重写,所以邮件里**已存在的** `<a target="_blank">` 维持原样进入 iframe,且 iframe 里 `target="_blank"` 因为沙箱无 `allow-popups` 而**不会**真的弹新窗。
- 同样,`MessagePanel.tsx` **不**给 `<a>` 加 `target="_blank"` + `rel="noopener noreferrer"` 的"代理 `<a>`"层(像某些客户端做的那样,把邮件里所有链接替换为 `<a href="#" data-orig-href="…">`,再在父页拦截 click → `opener.openUrl(orig)`)。

后果:
- 当前**没有** `window.opener` 攻击面 (无 `allow-popups` → 邮件里的 `target="_blank"` 不开新窗 → 没有父页 → 没有 `opener` 反向控制)。
- 但**未来**一旦改成"父页接管 click → opener.openUrl" 的设计 (Task 7 的预期修法),就必须**在重写阶段**统一加 `rel="noopener noreferrer"`,否则新开的浏览器 tab 可以反向 `window.opener.location = …` 篡改 opener 的 URL。**现在提前定好规则,改起来零成本;改完再加就来不及。**

---

## 6. 纯文本 URL 自动识别

❌ 纯文本视图**不**自动识别 bare URL — 长 URL 显示为纯文本,**不可点击**,只能复制粘贴。

Evidence:

- `MessagePanel.tsx:1024-1049` — 纯文本视图:
  ```tsx
  <Show when={viewMode() !== "source"}>
    <Show
      when={viewMode() === "rendered" && m.bodyHtml}
      fallback={
        <div …>
          <For each={formatBodyParagraphs(m.body)}>
            {(p) => (<p …>{p}</p>)}
          </For>
        </div>
      }
    >
      <iframe … />  {/* rendered mode */}
    </Show>
  </Show>
  ```
  注意:fallback 是 `viewMode() !== "rendered"` 或者 `bodyHtml` 为空。**纯文本 fallback 用 `<p>{p}</p>` 直接插字符串,没有 URL → `<a>` 的转换**。
- `MessagePanel.tsx:1790-1798` — `formatBodyParagraphs`:
  ```ts
  function formatBodyParagraphs(body: string): string[] {
    const text = body.trim();
    if (!text) return [];
    const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim());
    if (paragraphs.length <= 1) {
      return text.split("\n").map((p) => p.trim());
    }
    return paragraphs.map((p) => p.trim());
  }
  ```
  **只**按空行/换行切分,不识别 URL。
- `app/src/utils/html.ts:21-32` — `plainTextToHtml` **有**自动链接逻辑,但**仅被 Compose (外发) 使用**:`grep "plainTextToHtml" app/` → `Compose.tsx:108, 346`、`test/html.test.ts`。**incoming 渲染路径不调用此函数**。
- 即使 `plainTextToHtml` 被调用,它也只匹配 `https?://` 前缀 — `mailto:` / `tel:` / bare domain (如 `example.com`) 都不识别。

后果:
- 用户收到的"纯文本邮件"或 "无 `bodyHtml` 的邮件",长 URL 显示成 `https://docs.example.com/path?q=very_long_token` 一整行,**用户复制粘贴不到** (iPad 上 select 体验差,长 URL 还会触发 touch 误操作)。
- HTML 邮件也有同样的 fallback(无 bodyHtml 时走纯文本),影响同样。

---

## 7. `opener.open_url` 整合

❌ 没有 `@tauri-apps/plugin-opener` 的 `openUrl()` 调用 (只 `openPath`)。

Evidence:

- `grep -rn "openUrl\|open_url" app/src/ app/src-tauri/src/` → **0 matches**。
- `grep -rn "plugin-opener" app/src/` → 仅 `app/src/panels/FilePanel.tsx:11` 一处,导入 `openPath`,用于打开**本地文件路径** (`FilePanel.tsx` 调用处见下文):
  - `FilePanel.tsx:11` — `import { openPath } from "@tauri-apps/plugin-opener";`
  - 调用 `openPath(…)` 的位置(本地附件"Show in folder"按钮)虽然不在本次 grep 输出,但 `openPath` 不是 `openUrl`。
- `app/src/ipc/commands.ts` 全文 13 行,只有 `pingGreet`。
- `app/src/services/backend.ts` `safeInvoke` 调用列表里没有 URL 打开相关命令。
- `app/src-tauri/src/commands/` **没有** `opener.rs` / `link.rs` / 类似模块 (`ls app/src-tauri/src/commands/` 目录里也没有对应文件;但本审计 scope 是前端调用,Rust 命令侧不是关键 — 关键在 frontend integration layer 完全空白)。

后果: SendPalm 的 Tauri 后端已经具备 opener plugin,但前端**没有任何路径**调用 `opener.openUrl(http_url)` 或 `opener.openUrl(mailto:…)`。HEY/Gmail/Outlook 全都默认行为是点邮件里的链接 → 系统浏览器打开,SendPalm 完全缺失。

---

## 8. `cursor: pointer` / `<a>:visited` 样式

🟡 srcdoc 内联 `<style>` **没**显式给 `<a>` 加 `cursor: pointer` 或 `:visited` 样式。功能性上浏览器默认会给 `<a href>` 加 `pointer` cursor,但 `:visited` 默认浏览器紫对识别钓鱼/已访问站点帮助大。

Evidence:

- `MessagePanel.tsx:68-73` — srcdoc 内联 `<style>`:
  ```css
  html, body { margin: 0; padding: 0; font-family: system-ui, …; font-size: 14px; line-height: 1.6; color: #333; }
  img { max-width: 100%; height: auto; }
  a { color: #0A8F63; }
  pre { white-space: pre-wrap; overflow-wrap: anywhere; }
  ```
  - 有 `a { color: … }`,**没有** `a:visited` / `a:hover` / `cursor: pointer`。
- 浏览器默认会:
  - 给 `<a href>` 加 `cursor: pointer` (user agent stylesheet),所以鼠标光标没问题。
  - 给 `:visited` 上紫色 (`#551A8B`),但因为上面 `a { color: #0A8F63 }` 不分状态,所有 `<a>` 都是同一个绿色 — **已访问链接无视觉区分**,对识别"我之前点过这个钓鱼站"无帮助。
- 主应用全局 (`app/src/styles/base.css:59-66`):
  ```css
  a { color: var(--blurple); text-decoration: none; transition: color 0.18s ease; }
  a:hover { color: var(--blurple-hover); }
  ```
  同样没有 `a:visited`,但这是**主应用** `<a>` 的样式,不进入 iframe srcdoc (iframe 是独立文档)。

后果:
- 邮件里所有 `<a>` 看起来都一样,用户分不清"已访问过"和"还没访问"。这是个 UX 细节,不是安全/功能 bug。
- 提一下,因为这跟 Task 7 的"链接变可见/可点击"主题相关。

---

## 9. Summary table

| Area | Check | Status | Evidence |
|---|---|---|---|
| 1 | `<a href>` 渲染保留 | ✅ | `parser.rs:79, 227-247` 只重写 `cid:`,不动 `<a>`; `MessagePanel.tsx:62-77` 直接 `${html}` |
| 2 | 点击拦截 (`onClick` / 路由到 opener) | ❌ | `MessagePanel.tsx:1052-1075` iframe onload 只读 scrollHeight; 全仓无 `addEventListener("click")` 给 iframe; `opener.openUrl` 0 matches |
| 3 | `mailto:` 识别/路由 | ❌ | 全仓 `mailto:` 0 matches; iframe 无 `allow-popups`,浏览器默认行为在 iframe 内不触发 mailto handler |
| 4 | `href="javascript:..."` 过滤 | ❌ (前端/Rust 不清洗) / 🟡 (当前 sandbox 无 `allow-scripts`,不执行) | `grep "javascript:" app/src/` 0 matches; `parser.rs` 不清洗; sandbox 无 `allow-scripts` |
| 5 | `target="_blank"` + `rel="noopener noreferrer"` | ❌ (外发 ✅,入站 ❌) / 🟡 (当前 sandbox 无 `allow-popups`,无 tabnabbing 攻击面) | `html.ts:29` 只给 Compose 用; `MessagePanel.tsx` 不重写入站 `<a>` |
| 6 | 纯文本 URL 自动识别 | ❌ | `MessagePanel.tsx:1024-1049, 1790-1798` fallback 用裸 `<p>{p}</p>`; `plainTextToHtml` 仅 Compose 用 |
| 7 | `@tauri-apps/plugin-opener` `openUrl()` 整合 | ❌ | 全仓 `openUrl` / `open_url` 0 matches; 仅 `FilePanel.tsx:11` `openPath` |
| 8 | `cursor: pointer` / `:visited` 样式 | 🟡 | `MessagePanel.tsx:71` `a { color: #0A8F63 }` 无 `:visited` / `:hover`; 浏览器默认给 `<a href>` `cursor: pointer` |

---

## Top issues found (ranked)

1. **❌ 邮件里的链接点了没反应 (核心问题)。** `<a href>` 原样进入 iframe,iframe 没有 `allow-popups` → `<a target="_blank">` 不会开新窗;没有 `allow-top-navigation` → `<a target="_top">` 也不会替换 webview;**没有任何 JS 拦截** → 没有 `opener.openUrl` 接管。用户点的结果是 iframe 区域内被替换成目标页/404 错误页,layout 错位、无法返回。SendPalm 装了 `@tauri-apps/plugin-opener` 但没接入邮件链接路径 (`grep "openUrl\|open_url" app/` → 0 matches; 仅 `FilePanel.tsx:11` `openPath` 用于附件)。
2. **❌ `mailto:` 完全不识别。** 全仓 `mailto:` 0 matches;iframe 内 mailto 默认不触发 OS handler;**用户无法从邮件里"发邮件给某人"或"加入联系人"**,这是 HEY/Gmail 都覆盖的基本功能。
3. **❌ 纯文本视图不自动链接 URL。** `MessagePanel.tsx:1790-1798` `formatBodyParagraphs` 只切行不识别 URL;`plainTextToHtml` (`app/src/utils/html.ts:21-32`) 存在但**仅 Compose 用**,incoming 路径不用。
4. **❌ `target="_blank"` 不补 `rel="noopener noreferrer"`** (入站邮件)。出站邮件 Compose 在 `app/src/utils/html.ts:29` 已经做了;入站邮件没有重写层。当前 sandbox 无 `allow-popups` → 无 tabnabbing 攻击面,**但**未来一旦接 "父页接管 click → opener.openUrl",必须提前定规则,否则反向 `window.opener.location = …` 可篡改 opener URL。建议在重写层统一加,改起来零成本,改完再补就晚。
5. **❌ `javascript:` 没有显式过滤。** parser/前端都不清洗;目前 sandbox 无 `allow-scripts` 所以 `javascript:` 不执行 (no-op),**但**是 defense-in-depth 缺口:未来给 iframe 加 `allow-scripts` 或迁移到主 DOM 时,立刻变 XSS sink。建议在 parser 或 `htmlEmailSrcdoc` 里加一行 `replace(/(href|src)\s*=\s*"\s*javascript:[^"]*"/gi, '$1="#"')` 之类的显式清洗。
6. **🟡 `<a>:visited` 没有样式。** `MessagePanel.tsx:71` `a { color: #0A8F63 }` 不分状态,所有 `<a>` 一种颜色;用户分不清"已访问"和"未访问",对识别钓鱼站无视觉帮助。UX 细节。
7. **🟡 没有 HTML email 链接相关的单元/e2e 测试。** `app/src/test/html.test.ts` 只测 `plainTextToHtml` / `htmlToPlainText` 的 compose 路径。**incoming 邮件的链接渲染/点击行为 0 测试覆盖**。新增"邮件含链接 → 点击触发 opener"端到端用例能锁住未来的修复。

---

## 关于 Step 3 (`tracker.rs`)

**不存在 `app/src-tauri/src/services/tracker.rs`**。

Evidence:
- `find app -name "tracker.rs"` → 0 matches。
- `ls app/src-tauri/src/services/` → `db.rs`, `desktop_notifier.rs`, `ical.rs`, `imap.rs`, `mailbox_resolver.rs`, `mod.rs`, `parser.rs`, `providers.rs`, `scheduled_send.rs`, `smtp.rs`, `state.rs`, `sync_loop.rs`, `vault.rs` — **无 tracker.rs**。
- `grep "tracker" app/src-tauri/src/` → 仅 `sync_loop.rs:783, 1046` 中的 `trackers_json` 列名引用,无 link rewriter。

link 重写在 Rust 侧**完全不存在**。如果 brief 假设有"链接被 Rust 改写后再下发前端"的逻辑 — 没有。所有 link 重写/过滤/补 `rel` 的责任都在前端 `MessagePanel.tsx` (目前**零**实现)。