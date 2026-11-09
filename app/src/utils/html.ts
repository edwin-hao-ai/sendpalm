/** HTML <-> plain text helpers used by Compose and message rendering. */

import DOMPurify from "dompurify";
import { invoke } from "@tauri-apps/api/core";

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
  } else if (
    node.nodeName === "A" &&
    node.getAttribute("target") === "_blank"
  ) {
    const rel = node.getAttribute("rel") || "";
    const tokens = new Set(rel.split(/\s+/).filter(Boolean));
    tokens.add("noopener");
    tokens.add("noreferrer");
    node.setAttribute("rel", Array.from(tokens).join(" "));
  }
});

const EMAIL_ALLOWED_TAGS = [
  "a",
  "abbr",
  "address",
  "article",
  "aside",
  "b",
  "blockquote",
  "br",
  "caption",
  "cite",
  "code",
  "col",
  "colgroup",
  "dd",
  "del",
  "details",
  "dfn",
  "div",
  "dl",
  "dt",
  "em",
  "figcaption",
  "figure",
  "footer",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hgroup",
  "hr",
  "i",
  "img",
  "ins",
  "kbd",
  "li",
  "main",
  "mark",
  "nav",
  "ol",
  "p",
  "pre",
  "q",
  "samp",
  "section",
  "small",
  "span",
  "strong",
  "sub",
  "summary",
  "sup",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "time",
  "tr",
  "u",
  "ul",
  "var",
];

export function sanitizeEmailHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: EMAIL_ALLOWED_TAGS,
    FORBID_TAGS: [
      "script",
      "object",
      "embed",
      "link",
      "meta",
      "base",
      "iframe",
      "frame",
      "frameset",
      "form",
      "input",
      "button",
      "textarea",
      "select",
    ],
    FORBID_ATTR: [
      "onload",
      "onerror",
      "onclick",
      "onmouseover",
      "onmouseout",
      "onfocus",
      "onblur",
      "onkeydown",
      "onkeyup",
      "onkeypress",
      "onsubmit",
    ],
    ALLOW_DATA_ATTR: false,
    KEEP_CONTENT: true,
    ADD_ATTR: ["target", "rel"],
  });
}

export interface ImageAnalysis {
  /** Sanitized HTML, ready to be embedded as iframe srcdoc or preview.
   *  Only populated when the caller passes `includeSafeHtml: true`. The
   *  default omits it because the DOMPurify sanitize pass is the
   *  single most expensive step in opening a message, and most
   *  callers (the Show-images toolbar, the Gate card count, etc.)
   *  only need the image count + tracking-pixel flag. Callers that
   *  actually embed the HTML call `sanitizeEmailHtml` (or
   *  `htmlEmailSrcdoc`, which wraps it) explicitly. */
  safeHtml?: string;
  externalImageCount: number;
  hasTrackingPixel: boolean;
}

const TRACKING_DIMENSIONS =
  /width\s*[:=]\s*["']?0|height\s*[:=]\s*["']?0|display\s*:\s*none|visibility\s*:\s*hidden/i;

export function analyzeImages(
  html: string,
  options: { includeSafeHtml?: boolean } = {},
): ImageAnalysis {
  // DOMPurify sanitize is a 1-3 ms pass on a typical email body
  // (longer on messages with many inline images / nested tables).
  // It was previously always-on inside analyzeImages, but every
  // production caller of analyzeImages only reads
  // `externalImageCount` (for the Show-images toolbar visibility
  // and the Gate card count) — `safeHtml` was being computed and
  // thrown away. Callers that DO need sanitized HTML go through
  // `htmlEmailSrcdoc` (iframe) or `emailBodyPreview` (short
  // previews), which sanitize at the point of use.
  const externalMatches =
    html.match(/<img\b[^>]*\bsrc\s*=\s*["']?https?:\/\/[^"'>\s]+/gi) || [];
  const externalImageCount = externalMatches.length;
  const hasTrackingPixel = externalMatches.some((m) =>
    TRACKING_DIMENSIONS.test(m),
  );
  const out: ImageAnalysis = { externalImageCount, hasTrackingPixel };
  if (options.includeSafeHtml) {
    out.safeHtml = sanitizeEmailHtml(html);
  }
  return out;
}

export function extractExternalImageUrls(html: string): string[] {
  const matches =
    html.match(/<img\b[^>]*\bsrc\s*=\s*["']?https?:\/\/[^"'>\s]+/gi) || [];
  return matches
    .map((m) => {
      const srcMatch = m.match(/\bsrc\s*=\s*["']?([^"'>\s]+)/i);
      return srcMatch ? srcMatch[1]! : "";
    })
    .filter(Boolean);
}

export async function prefetchImages(
  urls: string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  await Promise.all(
    urls.map(async (url) => {
      try {
        const dataUrl = await invoke<string>("fetch_image", { url });
        result.set(url, dataUrl);
      } catch {
        // Failed fetch — leave as placeholder.
      }
    }),
  );
  return result;
}

/** Named entities that actually appear in mail. Anything else is left
 *  literal so a stray `&foo;` in prose never turns into a mystery glyph. */
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ensp: " ",
  emsp: " ",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  copy: "©",
  reg: "®",
  trade: "™",
  middot: "·",
  bull: "•",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  laquo: "«",
  raquo: "»",
  times: "×",
  divide: "÷",
  euro: "€",
  pound: "£",
  yen: "¥",
  deg: "°",
  plusmn: "±",
};

/**
 * Decode HTML entities.
 *
 * Numeric entities are the important case: Chinese newsletters encode every
 * CJK character (`&#38543;`), so without this a preview is a wall of
 * `&#38543;&#30528;…` — unreadable, and exactly what Stream was showing.
 */
export function decodeHtmlEntities(text: string): string {
  return text.replace(
    /&(#[0-9]+|#x[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]{1,31});/g,
    (match, body: string) => {
      if (body.startsWith("#")) {
        const hex = body.startsWith("#x") || body.startsWith("#X");
        const code = parseInt(hex ? body.slice(2) : body.slice(1), hex ? 16 : 10);
        if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return match;
        // Surrogate halves are not valid code points on their own.
        if (code >= 0xd800 && code <= 0xdfff) return match;
        try {
          return String.fromCodePoint(code);
        } catch {
          return match;
        }
      }
      return NAMED_ENTITIES[body.toLowerCase()] ?? match;
    },
  );
}

export function htmlToPlainText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      // Tags first, entities second: decoding `&lt;` before stripping would
      // invent markup that was only ever text.
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

export function plainTextToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const withBreaks = escaped.replace(/\r\n/g, "\n").replace(/\n/g, "<br>");
  return linkifyEscaped(withBreaks);
}

/** Turn URLs and `[label](url)` / `[label][url]` into anchors.
 *
 *  Input must already be HTML-escaped. Split out of `plainTextToHtml` so the
 *  composer's rich-text renderer can linkify AFTER applying emphasis — it
 *  builds its own paragraphs and does not want the `\n` → `<br>` pass.
 */
export function linkifyEscaped(withBreaks: string): string {
  // Linkify in a single pass via alternation. Three shapes, in priority order:
  //   1) Reference-style `[label][https://url]` — common in plain-text
  //      alternatives generated by Mailchimp / SendGrid / Stripe, where each
  //      visible link is followed by its bare URL in brackets so a text-only
  //      reader still sees the destination.
  //   2) Inline-style `[label](https://url)` for hand-written markdown.
  //   3) Bare URLs / mailto: as a fallback.
  // Single pass avoids the bug where a sequential `href="..."` rewrite gets
  // re-matched by a later bare-URL regex pass.
  return withBreaks.replace(
    /\[([^\]\n]+)\]\[(https?:\/\/[^\s<\]]+|mailto:[^\s<\]]+)\]|\[([^\]\n]+)\]\((https?:\/\/[^\s<)]+|mailto:[^\s<)]+)\)|(https?:\/\/[^\s<]+|mailto:[^\s<]+)/g,
    (_m, l1, u1, l2, u2, u3) => {
      if (l1 !== undefined) {
        // Trim the surrounding whitespace that screen-reader plain-text
        // emails tend to leave inside the brackets (`[ Stripe ]`).
        const label = l1.trim();
        return `<a href="${u1}" target="_blank" rel="noopener noreferrer">${label}</a>`;
      }
      if (l2 !== undefined) {
        const label = l2.trim();
        return `<a href="${u2}" target="_blank" rel="noopener noreferrer">${label}</a>`;
      }
      return `<a href="${u3}" target="_blank" rel="noopener noreferrer">${u3}</a>`;
    },
  );
}

/** True when a plain-text field actually contains raw HTML (some senders
 *  put markup in the text/plain part, and our Gate projection deliberately
 *  does not fetch `body_html`). */
export function looksLikeHtml(text: string): boolean {
  const head = text.slice(0, 2000).toLowerCase();
  return (
    head.includes("<!doctype html") ||
    head.includes("<html") ||
    (head.includes("<div") && head.includes("</")) ||
    (head.includes("<table") && head.includes("</")) ||
    head.includes("<body")
  );
}

/** Gate-card preview: the bounded query never fetches `body_html`, so a
 *  body that is secretly markup gets stripped to text instead of showing
 *  raw tags. */
export function gateBodyPreview(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return "";
  if (looksLikeHtml(trimmed)) {
    return plainTextToHtml(htmlToPlainText(trimmed));
  }
  return plainTextToHtml(trimmed);
}

/** Render a message body for short-form previews (Gate card, list rows, etc.).
 *  Prefers the sanitized HTML body; falls back to escaped, linkified plain text.
 */
export function emailBodyPreview(
  body: string,
  bodyHtml?: string | null,
): string {
  if (bodyHtml?.trim()) {
    return sanitizeEmailHtml(bodyHtml);
  }
  return plainTextToHtml(body);
}

/** Build a self-contained srcdoc for an isolated iframe rendering a sanitized
 *  email body. Used by MessagePanel (right-side detail) and Stream (inline
 *  card expand). The click interceptor posts a message up to the parent so
 *  links open in the OS browser instead of navigating inside the iframe.
 */
export function htmlEmailSrcdoc(html: string): string {
  const safe = sanitizeEmailHtml(html);
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
html, body { margin: 0; padding: 0; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 14px; line-height: 1.6; color: #333; }
img { max-width: 100%; height: auto; }
a { color: #0A8F63; }
pre { white-space: pre-wrap; overflow-wrap: anywhere; }
table { border-collapse: collapse; max-width: 100%; }
td, th { padding: 6px 10px; vertical-align: top; }
blockquote { border-left: 3px solid #0A8F63; margin: 0; padding: 0 0 0 12px; color: #666; font-style: italic; }
.sp-img-hidden { display: none !important; }
.sp-img-hidden[data-shown="true"] { display: inline !important; }
</style>
<script>
// Report text selections up to the host so "save as Clip" can read what
// the user highlighted inside this sandboxed frame (the parent cannot
// reach in — no allow-same-origin — but postMessage is allowed).
document.addEventListener('mouseup', function() {
  var sel = window.getSelection();
  if (sel && sel.toString().trim()) {
    try { parent.postMessage({ type: 'sendpalm:selection', text: sel.toString() }, '*'); } catch (_) {}
  }
});
document.addEventListener('click', function(e) {
  var a = e.target && e.target.closest && e.target.closest('a[href]');
  if (!a) return;
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  e.stopPropagation();
  try { parent.postMessage({ type: 'sendpalm:open-url', href: a.href }, '*'); } catch (_) {}
}, true);
window.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'sendpalm:show-images') {
    var srcMap = e.data.srcMap || {};
    var imgs = document.querySelectorAll('.sp-img-hidden');
    for (var i = 0; i < imgs.length; i++) {
      var orig = imgs[i].getAttribute('data-original-src');
      if (orig && srcMap[orig]) {
        imgs[i].setAttribute('src', srcMap[orig]);
        imgs[i].setAttribute('data-shown', 'true');
      }
    }
  }
});
</script>
</head>
<body>${safe}</body>
</html>`;
}
