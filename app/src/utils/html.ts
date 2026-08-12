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
  } else if (node.nodeName === "A" && node.getAttribute("target") === "_blank") {
    const rel = node.getAttribute("rel") || "";
    const tokens = new Set(rel.split(/\s+/).filter(Boolean));
    tokens.add("noopener");
    tokens.add("noreferrer");
    node.setAttribute("rel", Array.from(tokens).join(" "));
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
    KEEP_CONTENT: true,
    ADD_ATTR: ["target", "rel"],
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
  const externalMatches = html.match(/<img\b[^>]*\bsrc\s*=\s*["']?https?:\/\/[^"'>\s]+/gi) || [];
  const externalImageCount = externalMatches.length;
  const hasTrackingPixel = externalMatches.some((m) => TRACKING_DIMENSIONS.test(m));
  return { safeHtml, externalImageCount, hasTrackingPixel };
}

export function extractExternalImageUrls(html: string): string[] {
  const matches = html.match(/<img\b[^>]*\bsrc\s*=\s*["']?https?:\/\/[^"'>\s]+/gi) || [];
  return matches
    .map((m) => {
      const srcMatch = m.match(/\bsrc\s*=\s*["']?([^"'>\s]+)/i);
      return srcMatch ? srcMatch[1]! : "";
    })
    .filter(Boolean);
}

export async function prefetchImages(urls: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  await Promise.all(urls.map(async (url) => {
    try {
      const dataUrl = await invoke<string>("fetch_image", { url });
      result.set(url, dataUrl);
    } catch {
      // Failed fetch — leave as placeholder.
    }
  }));
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
  const withLinks = withBreaks.replace(
    /(https?:\/\/[^\s<]+|mailto:[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>',
  );
  return withLinks;
}
