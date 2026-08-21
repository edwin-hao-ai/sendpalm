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

export function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export function plainTextToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const withBreaks = escaped.replace(/\r\n/g, "\n").replace(/\n/g, "<br>");
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
