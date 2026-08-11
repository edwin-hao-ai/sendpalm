# C. SendPalm 跟踪像素拦截 + table/blockquote 样式 + DOMPurify 升级

> Spec authored 2026-08-11. Status: Draft. Sub-project C of the 2026-08-11 email/HTML/link audit fix series (commit `cb95452`). 5 个独立 sub-project 之一 (A/B/D/E 各有独立 spec/plan/implementation)。

## 1. 背景与问题

`cb95452` §4 + §7:
- ❌ 跟踪像素裸跑 ——打开任一邮件 `<img src="https://tracker/...">` 直接命中第三方
- ❌ `<table>` / `<blockquote>` 零样式 —— HTML 邮件 layout 像 1990s
- 🟡 Sub-B regex sanitizer 漏 `<object>` / `<embed>` / `<link rel=stylesheet>` (Sub-B §8 known-acceptable-risk)

## 2. 目标

- 邮件默认隐藏所有 `https?://` 外链图; "Show images (N)" 按钮一键揭示 (HEY-style)
- `<table>` / `<blockquote>` HEY-grade 样式
- DOMPurify 替代 Sub-B regex sanitizer,顺手处理 `<object>` / `<embed>` / `<link>`

## 3. 非目标

- ❌ 不加图片本地 proxy (server-side fetch + cache; Sub-F 范畴)
- ❌ 不加 per-sender memory (默认 ask,per-email按钮)
- ❌ 不动 Sub-A / Sub-B 已 commit 代码 (除 `sanitizeEmailHtml` 函数体替换 + MessagePanel srcdoc 注入)

## 4. Architecture

### 4.1 Image policy

**默认**: 隐藏所有 `https?://` 外链图。`cid:` (parser 已 rewrite 成 `data:`) 不动。

**统计**: 每次渲染时 `analyzeImages(html)` 返回 `{safeHtml, externalImageCount, hasTrackingPixel}`,parent 据此决定按钮显示。

**揭示流程**:
1. MessagePanel 算出 count > 0 → 显示 "Show images (N)" 按钮
2. 用户点击 → `iframe.contentWindow.postMessage({type:'sendpalm:show-images'}, '*')`
3. iframe 内联 `<script>` (Sub-B 注入的) 收 message → `document.querySelectorAll('.sp-img-hidden').forEach(img => img.dataset.shown = 'true')`
4. CSS: `.sp-img-hidden { display: none !important } .sp-img-hidden[data-shown="true"] { display: inline !important }`

### 4.2 DOMPurify 集成

```ts
import DOMPurify from "dompurify";

DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.nodeName === "IMG") {
    const src = node.getAttribute("src");
    if (src && /^https?:\/\//i.test(src)) {
      node.setAttribute("data-original-src", src);
      node.setAttribute("src", PLACEHOLDER_DATA_URL); // 1x1 transparent svg
      node.classList.add("sp-img-hidden");
    }
  }
});

export function sanitizeEmailHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [/* long allowlist */],
    FORBID_TAGS: ["script", "object", "embed", "link", "meta", "base", "iframe", "frame", "frameset"],
    FORBID_ATTR: ["onload", "onerror", "onclick", /* event handlers via prefix matching */],
    ALLOW_DATA_ATTR: false,
  });
}
```

DOMPurify 是 string-level sanitizer,直接喂 srcdoc 字符串。

### 4.3 table/blockquote CSS

srcdoc `<style>` 块追加:

```css
table { border-collapse: collapse; max-width: 100%; }
td, th { padding: 6px 10px; vertical-align: top; }
blockquote { border-left: 3px solid #0A8F63; margin: 0; padding: 0 0 0 12px; color: #666; font-style: italic; }
.sp-img-hidden { display: none !important; }
.sp-img-hidden[data-shown="true"] { display: inline !important; }
```

## 5. 改动清单

### 5.1 `app/package.json` — 加 DOMPurify 依赖

```diff
   "dependencies": {
+    "dompurify": "^3.x",
     ...
   },
   "devDependencies": {
+    "@types/dompurify": "^3.x",
     ...
   }
```

(版本到 install 时 resolve latest 3.x)

### 5.2 `app/src/utils/html.ts` — 重写

```ts
import DOMPurify from "dompurify";

const PLACEHOLDER_DATA_URL =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E";

// Register hook once at module load (idempotent per module instance).
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.nodeName === "IMG") {
    const src = node.getAttribute("src");
    if (src && /^https?:\/\//i.test(src)) {
      node.setAttribute("data-original-src", src);
      node.setAttribute("src", PLACEHOLDER_DATA_URL);
      node.classList.add("sp-img-hidden");
    }
  }
});

const EMAIL_ALLOWED_TAGS = [
  "a", "abbr", "address", "article", "aside", "b", "blockquote", "br",
  "caption", "cite", "code", "col", "colgroup", "dd", "del", "details",
  "dfn", "div", "dl", "dt", "em", "figcaption", "figure", "footer",
  "h1", "h2", "h3", "h4", "h5", "h6", "header", "hgroup", "hr", "i",
  "img", "ins", "kbd", "li", "main", "mark", "nav", "ol", "p", "pre",
  "q", "samp", "section", "small", "span", "strong", "sub", "summary",
  "sup", "table", "tbody", "td", "tfoot", "th", "thead", "time",
  "tr", "u", "ul", "var",
];

export function sanitizeEmailHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: EMAIL_ALLOWED_TAGS,
    FORBID_TAGS: ["script", "object", "embed", "link", "meta", "base", "iframe", "frame", "frameset", "form", "input", "button", "textarea", "select"],
    FORBID_ATTR: ["onload", "onerror", "onclick", "onmouseover", "onmouseout", "onfocus", "onblur", "onkeydown", "onkeyup", "onkeypress", "onsubmit"],
    ALLOW_DATA_ATTR: false,
    KEEP_CONTENT: true, // keep text content when stripping disallowed tags
  });
}

export interface ImageAnalysis {
  safeHtml: string;
  externalImageCount: number;
  hasTrackingPixel: boolean;
}

const TRACKING_DIMENSIONS = /width\s*[:=]\s*["']?0|height\s*[:=]\s*["']?0|display\s*:\s*none|visibility\s*:\s*hidden/i;

export function analyzeImages(html: string): ImageAnalysis {
  const safeHtml = sanitizeEmailHtml(html);
  // Count <img src="https?://..."> in original (pre-sanitize) to track what was hidden.
  const externalMatches = html.match(/<img\b[^>]*\bsrc\s*=\s*["']?https?:\/\/[^"'>\s]+/gi) || [];
  const externalImageCount = externalMatches.length;
  // Tracking pixel heuristic: tiny dimensions or display:none
  const hasTrackingPixel = externalMatches.some((m) => TRACKING_DIMENSIONS.test(m));
  return { safeHtml, externalImageCount, hasTrackingPixel };
}
```

### 5.3 `app/src/utils/html.test.ts` — 改测试

DOMPurify 行为 vs Sub-B regex:
- 输出可能略有不同 (e.g. `<p>x</p>` 不变,但 attribute 顺序可能调整)
- `<script>` 块 strip (Sub-B §10 同)
- `javascript:` URL 替换 (DOMPurify 内置 `URI_SAFE_REGEX`)
- `<img src="https://...">` 添加 `data-original-src` + `class="sp-img-hidden"`

测试改写为 DOMPurify 行为:
1. strips `<script>` blocks
2. neutralizes `javascript:` URLs
3. adds `class="sp-img-hidden"` to external `<img>`
4. preserves cid: / data: images (no `sp-img-hidden`)
5. counts external images correctly
6. detects tracking pixels (width=0, height=0, display:none)
7. preserves `<table>` / `<tr>` / `<td>` / `<blockquote>` structure
8. strips `<object>` / `<embed>` / `<link>` (Sub-B 漏的)
9. strips event handler attributes
10. adds rel=noopener noreferrer to `<a target=_blank>`

### 5.4 `app/src/panels/MessagePanel.tsx` — 3 处改动

**(a)** srcdoc `<style>` 块加 table/blockquote + `.sp-img-hidden` CSS

**(b)** srcdoc `<script>` 块加 `sendpalm:show-images` handler:

```js
window.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'sendpalm:show-images') {
    var imgs = document.querySelectorAll('.sp-img-hidden');
    for (var i = 0; i < imgs.length; i++) imgs[i].setAttribute('data-shown', 'true');
  }
});
```

**(c)** 渲染逻辑: 调用 `analyzeImages(m.bodyHtml)` 拿 `externalImageCount` + `hasTrackingPixel`;若 count > 0 → MessagePanel 显示 "Show images (N)" 按钮;点击 → `iframe.contentWindow.postMessage({type:'sendpalm:show-images'}, '*')`。

**状态管理**: `externalImageCount` 来自 `analyzeImages(m.bodyHtml)` 调用。MessagePanel 在 bodyHtml 变化时 memo 化重算。

## 6. Definition of Done

- [ ] `app/package.json` 加 `dompurify` + `@types/dompurify`
- [ ] `app/src/utils/html.ts` 重写 `sanitizeEmailHtml` (DOMPurify-based) + 加 `analyzeImages` 函数
- [ ] `app/src/utils/html.test.ts` 改测试为 DOMPurify 行为断言,10 个 it-blocks 全绿
- [ ] `app/src/panels/MessagePanel.tsx` 3 处改动 (srcdoc CSS, srcdoc show-images script handler, parent "Show images" 按钮 + postMessage)
- [ ] `pnpm test` 全绿 (152 现有 + 新 N 个 DOMPurify-based 测试)
- [ ] `pnpm typecheck` 全绿
- [ ] `pnpm lint` 状态不变 (1 个 pre-existing error 不动)
- [ ] 1 个 conventional commit `feat(privacy): tracking pixel gate + table/blockquote styles via DOMPurify`
- [ ] 不写 `docs/PROGRESS.md`

## 7. 风险

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| DOMPurify 配置白名单漏真实邮件需要的 tag (e.g. `<center>` 旧邮件) | 中 | 邮件 layout 异常 | ALLOWED_TAGS 长白名单覆盖主流 HTML 邮件标签; 后续邮件 breakage 报告后再补 |
| DOMPurify hook 是全局的,可能影响其他地方用 DOMPurify | 低 | 未来冲突 | 本次只在 utils/html.ts 用 DOMPurify,别处不引入; 模块作用域 |
| iframe contentWindow 跨 context postMessage 行为差异 (iOS WKWebView / Android WebView) | 中 | iOS/Android 上"Show images" 不工作 | 已知 WKWebView 支持 postMessage; 需真机验证 |
| `pnpm install` 拉新依赖可能耗时 | 低 | 首次 install 30s | 接受 |
| analyzer 计数错 (regex 不全) | 中 | 按钮显示 "Show images (N)" 数字偏差 | 测试覆盖; 后续用 DOM 解析更准确 |
| 邮件 HTML 含 `<style>` 里 `url(javascript:)` | 极低 | 旧 IE 漏洞 | 现代浏览器全部忽略 |
| Sub-B regex sanitizer 测试可能 break (本次全替换) | 必然 | — | 重新写测试为 DOMPurify 断言 |

**回退**: 1 commit `git revert <sha>`。Sub-B 的 sanitizer 函数被改 body 但签名不变,所以 commit 前后 sanitizeEmailHtml(html: string): string 一致。

## 8. 与其他 4 个 sub-project 的依赖

- ✅ 不依赖 A (Sub-A 已 commit `23c6474`)
- 🔗 **依赖 B** (`sanitizeEmailHtml` 函数签名沿用,实现替换) — Sub-B 已 commit `22a601a`,函数存在
- ✅ 不阻塞 D / E (并行可开发)

## 9. References

- Audit report: `docs/superpowers/audit/2026-08-11-email-html-link-audit.md` §4, §5.2, §7
- Audit commit: `cb95452`
- Sub-B: `docs/superpowers/specs/2026-08-11-b-link-click-mailto-design.md` §5.1 (sanitizer signature)
- DOMPurify: https://github.com/cure53/DOMPurify
- AGENTS.md §3.4 (logic change → tests), §3.5 (conventional commits), §3.7 (verification-before-completion)