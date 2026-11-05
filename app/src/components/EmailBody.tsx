/** EmailBody — the ONE place that renders a message's body.
 *
 *  Every surface that shows mail content (detail panel, Stream expand,
 *  Read Together, Focus Reply, previews) must use this component instead
 *  of hand-rolling iframe/plain-text handling — the scattered copies are
 *  how "this page doesn't render HTML" bugs keep shipping.
 *
 *  Behavior:
 *  - `bodyHtml` present → sandboxed iframe with DOMPurify-sanitized HTML
 *    (sanitize deferred via setTimeout so expanding never blocks the main
 *    thread), auto-sized to content on load.
 *  - otherwise → plain text, with the HTML-stuffed-text guard (senders
 *    that put markup in the text part get stripped, not shown as tag soup).
 *  - link clicks inside the iframe are intercepted by the srcdoc script
 *    and open in the OS browser (see utils/html.ts htmlEmailSrcdoc).
 */

import {
  Show,
  createEffect,
  createSignal,
  onCleanup,
  type JSX,
} from "solid-js";
import {
  htmlEmailSrcdoc,
  htmlToPlainText,
  looksLikeHtml,
  plainTextToHtml,
} from "../utils/html";
import type { Message } from "../types";

interface EmailBodyProps {
  message: Message;
  /** Iframe title (a11y). Defaults to the subject. */
  title?: string;
  /** Extra styles for the outer wrapper. */
  style?: JSX.CSSProperties;
  /** Test hook. */
  "data-testid"?: string;
}

export function EmailBody(props: EmailBodyProps) {
  const [srcdoc, setSrcdoc] = createSignal("");
  let stale = 0;

  createEffect(() => {
    const html = props.message.bodyHtml;
    const myId = ++stale;
    if (!html?.trim()) {
      setSrcdoc("");
      return;
    }
    // §11.6 defer: DOMPurify on large bodies blocks the main thread if it
    // runs inside the render expression.
    setTimeout(() => {
      if (myId !== stale) return;
      setSrcdoc(htmlEmailSrcdoc(html));
    }, 0);
  });

  onCleanup(() => {
    stale++;
  });

  const textFallback = () => {
    const raw = props.message.body ?? "";
    return looksLikeHtml(raw) ? htmlToPlainText(raw) : raw;
  };

  return (
    <Show
      when={srcdoc()}
      fallback={
        <div
          data-email-body-text
          class="sp-plaintext-body"
          style={{
            "font-size": "var(--text-body-sm)",
            color: "var(--text-primary)",
            "line-height": 1.7,
            "overflow-wrap": "anywhere",
            "word-break": "break-word",
            "white-space": "pre-wrap",
            ...props.style,
          }}
          innerHTML={plainTextToHtml(textFallback())}
        />
      }
    >
      {(doc) => (
        <iframe
          data-email-body-html
          srcdoc={doc()}
          sandbox=""
          title={props.title ?? props.message.subj ?? "邮件正文"}
          onLoad={(e) => {
            const el = e.currentTarget;
            try {
              const body = el.contentDocument?.body;
              if (body) {
                el.style.height = `${body.scrollHeight + 24}px`;
              }
            } catch {
              /* sandboxed — keep the default height */
            }
          }}
          style={{
            width: "100%",
            border: "0",
            display: "block",
            "min-height": "120px",
            ...props.style,
          }}
        />
      )}
    </Show>
  );
}

/** One-liner for list previews: clean plain text (HTML-stripped when the
 *  text part is secretly markup). List rows must NOT render HTML — this
 *  keeps previews cheap; full rendering is EmailBody's job on expand. */
export function emailPreviewText(m: Pick<Message, "body" | "prev">): string {
  const raw = m.body || m.prev || "";
  return looksLikeHtml(raw) ? htmlToPlainText(raw) : raw;
}
