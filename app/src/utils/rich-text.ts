/** Lightweight rich text for the composer.
 *
 *  The composer stays a plain `<textarea>` — a contenteditable would have to
 *  re-implement selection, undo, IME and mobile keyboards, and would lose the
 *  calm text-first feel. Instead a four-button toolbar wraps the selection in
 *  a tiny markdown subset, and the send path renders that subset to HTML.
 *
 *  Two audiences come out of one source of truth:
 *    - HTML readers get `<strong>` / `<em>` / `<a>` / `<ul>`
 *    - text-only readers get the same words with the markers stripped, so
 *      nobody receives `**urgent**`
 *
 *  Everything here is pure so it can be unit-tested; the composer only wires
 *  the results back into its draft signal.
 */

import { linkifyEscaped } from "./html";

export interface Edit {
  text: string;
  /** Selection to restore after the edit, in the new text. */
  selStart: number;
  selEnd: number;
}

/** Wrap the selection with `marker` on both sides (bold / italic / code). */
export function wrapSelection(
  text: string,
  start: number,
  end: number,
  marker: string,
): Edit {
  const before = text.slice(0, start);
  const selected = text.slice(start, end);
  const after = text.slice(end);
  const next = `${before}${marker}${selected}${marker}${after}`;
  // With no selection, drop the caret between the markers so the user can
  // just type.
  const caret = selected.length === 0 ? start + marker.length : undefined;
  return {
    text: next,
    selStart: caret ?? start + marker.length,
    selEnd: caret ?? end + marker.length,
  };
}

/** Turn the selected lines into a bulleted list (idempotent per line). */
export function prefixLines(
  text: string,
  start: number,
  end: number,
  prefix = "- ",
): Edit {
  const lineStart = text.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const lineEndIdx = text.indexOf("\n", end);
  const lineEnd = lineEndIdx === -1 ? text.length : lineEndIdx;

  const block = text.slice(lineStart, lineEnd);
  const lines = block.split("\n");
  const allPrefixed = lines.every(
    (l) => l.trim() === "" || l.startsWith(prefix),
  );
  const next = lines
    .map((l) => {
      if (l.trim() === "") return l;
      if (allPrefixed) return l.slice(prefix.length);
      return l.startsWith(prefix) ? l : prefix + l;
    })
    .join("\n");

  return {
    text: text.slice(0, lineStart) + next + text.slice(lineEnd),
    selStart: lineStart,
    selEnd: lineStart + next.length,
  };
}

/** Insert a link around the selection: `[label](url)`. */
export function insertLink(
  text: string,
  start: number,
  end: number,
): Edit {
  const label = text.slice(start, end) || "链接文字";
  const url = "https://";
  const snippet = `[${label}](${url})`;
  const next = `${text.slice(0, start)}${snippet}${text.slice(end)}`;
  // Put the caret inside the URL so typing replaces the placeholder.
  const urlStart = start + label.length + 3;
  return { text: next, selStart: urlStart, selEnd: urlStart + url.length };
}

/* ── Rendering ─────────────────────────────────────────────── */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Inline markers → tags. Input must already be HTML-escaped.
 *
 *  Emphasis runs before linkification: `*` / `` ` `` never appear inside the
 *  generated `href`, so the later anchor pass cannot corrupt a tag.
 */
function renderInline(escaped: string): string {
  const emphasised = escaped
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/`([^`\n]+)`/g, "<code>$1</code>");
  return linkifyEscaped(emphasised);
}

const BULLET = /^\s*[-*]\s+/;

/** Composer text → HTML body.
 *
 *  Blank-line-separated blocks become paragraphs, `- `/`* ` runs become a
 *  `<ul>`, and bare URLs are linkified by the same helper the rest of the app
 *  uses. Anything already looking like a URL stays clickable because
 *  `plainTextToHtml` handles it per line.
 */
export function richTextToHtml(text: string): string {
  const normalised = text.replace(/\r\n/g, "\n");
  if (!normalised.trim()) return "";

  const lines = normalised.split("\n");
  const blocks: string[] = [];
  let list: string[] = [];

  const flushList = () => {
    if (list.length === 0) return;
    blocks.push(`<ul>${list.map((li) => `<li>${li}</li>`).join("")}</ul>`);
    list = [];
  };

  let paragraph: string[] = [];
  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    // Inline-format each physical line, then join with <br> — that keeps the
    // author's line breaks without letting a marker span two lines.
    const html = paragraph
      .map((line) => renderInline(escapeHtml(line)))
      .join("<br>");
    blocks.push(`<p>${html}</p>`);
    paragraph = [];
  };

  for (const line of lines) {
    if (BULLET.test(line)) {
      flushParagraph();
      const content = line.replace(BULLET, "");
      list.push(renderInline(escapeHtml(content)).replace(/\n/g, ""));
      continue;
    }
    flushList();
    if (line.trim() === "") {
      flushParagraph();
      continue;
    }
    paragraph.push(line);
  }
  flushList();
  flushParagraph();

  return blocks.join("\n");
}

/** Composer text → plain-text body (markers removed, bullets kept). */
export function richTextToPlain(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s<)]+|mailto:[^\s<)]+)\)/g, "$1 ($2)")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1$2")
    .replace(/`([^`\n]+)`/g, "$1");
}
