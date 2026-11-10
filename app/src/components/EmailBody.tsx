/** EmailBody — the ONE place that renders a message body.
 *
 *  Every surface that shows mail content (thread panel, Stream expand,
 *  一起读, 专注回复, the Screener card) renders through this component. Four
 *  hand-rolled copies — each with its own sanitize timing, link handling and
 *  auto-size — are why "this page doesn't render HTML" kept shipping in a
 *  different view every week. One component, one fix.
 *
 *  Owns:
 *  * DOMPurify sanitize deferred to the next task with a stale-closure guard
 *    (synchronous sanitize of an 80 KB body froze the thread for 200-600 ms);
 *  * plain-text streaming fallback while that sanitize is in flight, so words
 *    appear in <50 ms and the user is not staring at an empty sheet;
 *  * a per-message iframe ref and a window `message` listener filtered by
 *    `e.source === contentWindow`, so a 3-message thread never routes one
 *    body's link click to a sibling's;
 *  * link clicks → OS browser (the iframe is sandboxed; window.open dies);
 *  * 「显示图片」 + per-sender "always", because tracking pixels are why images
 *    start hidden;
 *  * height auto-sizing through a host-only ResizeObserver with a 200 ms
 *    cooldown — see the ref callback for the loop that avoids.
 *
 *  `emailPreviewText` below is the OTHER half of the contract: list rows must
 *  stay cheap and never render HTML.
 */

import {
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  type JSX,
} from "solid-js";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Icon } from "./Icon";
import { showToast } from "../stores/ui";
import {
  getImageSenderPolicy,
  setImageSenderPolicy,
} from "../services/backend";
import {
  analyzeImages,
  extractExternalImageUrls,
  htmlEmailSrcdoc,
  htmlToPlainText,
  looksLikeHtml,
  plainPreview,
  plainTextToHtml,
  prefetchImages,
} from "../utils/html";
import type { Message } from "../types";

/** Click handler for links in the plain-text fallback. Routed through the OS
 *  browser so it uses the user's default browser. */
export function handlePlainTextLinkClick(e: MouseEvent) {
  const target = e.target as HTMLElement | null;
  const a = target?.closest?.("a[href]") as HTMLAnchorElement | null;
  if (!a) return;
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
    return;
  e.preventDefault();
  e.stopPropagation();
  openUrl(a.href).catch(() => {});
}

/** Selection inside the last-focused body iframe. The frame is sandboxed, so
 *  the host cannot read its selection; the srcdoc posts it up on mouseup
 *  ("save as Clip" consumes it). */
let lastIframeSelection = "";
export function getIframeSelection(): string {
  return lastIframeSelection;
}
export function clearIframeSelection(): void {
  lastIframeSelection = "";
}

export interface EmailBodyProps {
  message: Message;
  /** Enables the per-sender "always show images" policy. Omit when unknown. */
  senderEmail?: string;
  /** Iframe title (a11y). Defaults to the subject. */
  title?: string;
  /** Extra styles forwarded to the body surfaces. */
  style?: JSX.CSSProperties;
  /** Minimum iframe height before content is measured. */
  minHeight?: number;
  /** Hide the 「显示图片」 bar (compact cards). */
  showImagesBar?: boolean;
  /** Test hook. */
  "data-testid"?: string;
}

/** Per-message iframe with plain-text streaming fallback, Show
 *  images button, and per-sender "always show images" toggle.
 *  Extracted from MessagePanel so each thread message has its own
 *  iframe state — the previous single-`iframeSrc()` signal made
 *  every iframe in the thread show the current message's body, not
 *  its own. Owns its own `currentIframe` ref so the postMessage
 *  handlers (sendpalm:open-url, sendpalm:show-images) target only
 *  this message's iframe and not a sibling's. */
export function EmailBody(props: EmailBodyProps) {
  const m = () => props.message;
  const [iframeSrc, setIframeSrc] = createSignal("");
  const [iframeReady, setIframeReady] = createSignal(false);
  const [showBusy, setShowBusy] = createSignal(false);
  const [alwaysShow, setAlwaysShow] = createSignal(false);
  let pendingSanitize = 0;
  let currentIframe: HTMLIFrameElement | null = null;
  let currentIframeResizeObserver: ResizeObserver | null = null;
  // 200ms cooldown timer + last-write timestamp. See the ref callback
  // below for the full reasoning. Exposed so onShowImages can re-trigger
  // a measurement after the prefetched image map is delivered to the
  // iframe (which causes the body to grow, but the body's contentWindow
  // is cross-realm so we can't observe it from the host realm).
  let currentMeasure: (() => void) | null = null;
  let currentMeasureTimer: ReturnType<typeof setTimeout> | null = null;

  // Image analysis is cheap (regex over bodyHtml) but we still memo
  // it so the Show images button only re-evaluates when the message
  // actually changes. Hidden messages (externalImageCount = 0)
  // collapse the toolbar via the outer <Show when={...}>.
  const imageAnalysis = createMemo(() => {
    const html = m().bodyHtml;
    if (!html) return null;
    return analyzeImages(html);
  });

  // Hydrate alwaysShow from the per-sender image policy on mount
  // and whenever the sender prop changes. The async load races
  // with the parent's own update via onToggleAlwaysShow, so a
  // `cancelled` guard prevents stale writes.
  createEffect(() => {
    const sender = props.senderEmail;
    if (!sender) {
      setAlwaysShow(false);
      return;
    }
    let cancelled = false;
    void getImageSenderPolicy(sender).then((p) => {
      if (!cancelled) setAlwaysShow(p === "always");
    });
    onCleanup(() => {
      cancelled = true;
    });
  });

  createEffect(() => {
    const html = m().bodyHtml;
    if (!html || !html.trim()) {
      setIframeSrc("");
      return;
    }
    // Reset the ready flag when the message changes so the
    // plain-text fallback shows for the new message too.
    setIframeReady(false);
    const myId = ++pendingSanitize;
    setTimeout(() => {
      if (myId !== pendingSanitize) return; // stale
      setIframeSrc(htmlEmailSrcdoc(html));
      setIframeReady(true);
    }, 0);
  });

  // Window-level message handler — bound to the component's own
  // iframe via the `e.source === currentIframe?.contentWindow`
  // check, so we never accidentally receive a sibling thread
  // message's link click. The `sendpalm:open-url` postMessage is
  // emitted by the click interceptor injected in `htmlEmailSrcdoc`.
  const onIframeMessage = (e: MessageEvent) => {
    if (!e.data || typeof e.data !== "object") return;
    const iframeWin = currentIframe?.contentWindow;
    if (!iframeWin || e.source !== iframeWin) return;
    if (
      e.data.type === "sendpalm:open-url" &&
      typeof e.data.href === "string"
    ) {
      e.preventDefault?.();
      openUrl(e.data.href).catch(() => {});
    } else if (
      e.data.type === "sendpalm:selection" &&
      typeof e.data.text === "string"
    ) {
      // The sandboxed iframe's selection, posted up on mouseup — the
      // parent cannot read it cross-origin. Consumed by "save as Clip".
      lastIframeSelection = e.data.text;
    }
  };

  onMount(() => {
    window.addEventListener("message", onIframeMessage);
  });

  // Per-component cleanup for the message listener + the
  // ResizeObserver + the cooldown timer (see commit 58b9df0 for the
  // original leak; see commit a6ebd81 / this change for the loop).
  onCleanup(() => {
    window.removeEventListener("message", onIframeMessage);
    try {
      currentIframeResizeObserver?.disconnect();
    } catch {
      /* already torn down */
    }
    currentIframeResizeObserver = null;
    if (currentMeasureTimer !== null) {
      clearTimeout(currentMeasureTimer);
      currentMeasureTimer = null;
    }
    currentMeasure = null;
    if (currentIframe) {
      currentIframe.onload = null;
      currentIframe.dataset.roAttached = "";
    }
  });

  /** Everything 「显示图片」 would reveal: `<img>` tags plus CSS backgrounds.
   *  Both are blocked until the user asks, so both belong in the count. */
  const hiddenImageCount = () =>
    (imageAnalysis()?.externalImageCount ?? 0) +
    (imageAnalysis()?.cssBackgroundCount ?? 0);

  const onShowImages = async () => {
    const html = m().bodyHtml;
    if (!html) return;
    setShowBusy(true);
    try {
      const urls = extractExternalImageUrls(html);
      if (urls.length === 0 && (imageAnalysis()?.cssBackgroundCount ?? 0) === 0) {
        showToast({ kind: "info", message: "此邮件没有外部图片" });
        return;
      }
      // `<img>` sources go through the image proxy; CSS backgrounds cannot be
      // rewritten per-declaration, so they are restored at their original
      // urls by switching the sender's sheet back on inside the iframe.
      const map = urls.length > 0 ? await prefetchImages(urls) : new Map();
      const win = currentIframe?.contentWindow;
      if (win) {
        win.postMessage(
          {
            type: "sendpalm:show-images",
            srcMap: Object.fromEntries(map),
          },
          "*",
        );
        // Re-measure once the image map is delivered to the iframe.
        // The postMessage is dispatched immediately; the iframe's
        // image swap + layout pass happens in the next animation
        // frame. We schedule a measurement in that frame so the
        // body.scrollHeight is read AFTER the new images have
        // actually contributed to layout (otherwise we'd capture
        // the pre-image height and need a second tick).
        requestAnimationFrame(() => {
          currentMeasure?.();
        });
      }
    } catch {
      showToast({ kind: "error", message: "加载图片失败" });
    } finally {
      setShowBusy(false);
    }
  };

  const onToggleAlwaysShow = async (val: boolean) => {
    const sender = props.senderEmail;
    if (!sender) return;
    setAlwaysShow(val);
    try {
      await setImageSenderPolicy(sender, val ? "always" : "ask");
    } catch {
      showToast({ kind: "error", message: "保存图片策略失败" });
    }
  };

  return (
    <>
      {/* Plain-text fallback while DOMPurify sanitize is in flight. */}
      <Show when={!iframeReady() || !iframeSrc()}>
        <div
          class="sp-plaintext-body"
          data-email-body-text
          data-plaintext-fallback
          onClick={handlePlainTextLinkClick}
          style={{
            "font-size": "var(--text-body-sm)",
            color: "var(--text-primary)",
            "line-height": 1.7,
            "overflow-wrap": "anywhere",
            "word-break": "break-word",
            "margin-bottom": "var(--space-2)",
            ...props.style,
          }}
          innerHTML={plainTextToHtml(
            looksLikeHtml(m().body) ? htmlToPlainText(m().body) : m().body,
          )}
        />
        {/* Only while there IS a rich body being sanitized. A plain-text
            message used to sit here forever saying "loading the full layout"
            with no layout coming. */}
        <Show when={props.message.bodyHtml?.trim()}>
          <div
            style={{
              "font-size": "var(--text-micro)",
              color: "var(--text-muted)",
              "margin-bottom": "var(--space-3)",
              "font-style": "italic",
            }}
          >
            <Icon name="ph-arrow-fat-line-up" size={11} /> 正在加载完整版式…
          </div>
        </Show>
      </Show>
      <iframe
        data-email-body-html
        ref={(el) => {
          // ResizeObserver leak fix — see commit 58b9df0.
          if (el === null) {
            if (currentIframe?.dataset.roAttached === "1") {
              try {
                currentIframeResizeObserver?.disconnect();
              } catch {
                /* already torn down */
              }
              currentIframeResizeObserver = null;
              if (currentIframe) {
                currentIframe.dataset.roAttached = "";
                currentIframe.onload = null;
              }
            }
            return;
          }
          currentIframe = el;
          // 200ms cooldown: every height write bumps `lastWrite`;
          // subsequent measure() calls within the cooldown window
          // collapse to the next cooldown boundary. This is the
          // physical guarantee that a 50-burst (e.g. onload + N
          // image loads) produces at most ceil(bursts / cooldown)
          // height writes — usually exactly 1, and never more than
          // the number of distinct cooldown windows the burst spans.
          //
          // Why not ResizeObserver on the iframe body's contentDocument?
          //   - It was the source of the "ResizeObserver loop completed
          //     with undelivered notifications" error.
          //   - The iframe body is cross-realm; the host document's
          //     ResizeObserver can observe the BODY node (same window),
          //     but writing `el.style.height` from that callback
          //     triggers the host iframe's own layout, which fires
          //     another RO entry on the body, which the browser
          //     suppresses AND the Tauri webview logs as a
          //     frame-stalling warning. With long emails (many inline
          //     images, web fonts, CSS animations), the body's scroll
          //     height changes across many frames and the loop can
          //     compound until the webview is unresponsive.
          //   - The previous rAF-debounce (commit 8bc925d) coalesced
          //     same-frame bursts but did NOT prevent cross-frame
          //     burst compounding, and the user still reports the
          //     loop on real Tauri.
          //
          // Why is observing the HOST element safe?
          //   - The host iframe's size is driven by the OUTER layout
          //     (window resize, panel toggle, sidebar toggle). None of
          //     those happen synchronously from inside this callback,
          //     so writing `el.style.height` here is a one-way trip —
          //     it does not cause the host to resize again within the
          //     same frame. The W3C spec
          //     (https://www.w3.org/TR/resize-observer/#deliver-resize-errors)
          //     only suppresses notifications when callback → DOM
          //     write → DOM mutation → callback is synchronous within
          //     one frame. We break that chain by (a) writing the
          //     iframe's own height, not the host's, and (b) gating
          //     the write with a 200ms cooldown so a runaway outer
          //     resize cannot drive us into a tight loop.
          //
          // What about content changes (Show images, etc.)?
          //   - onShowImages explicitly calls `currentMeasure()` after
          //     the postMessage delivery, so the image-reveal path
          //     gets a fresh height write.
          //   - Other body mutations (font load, CSS animation) are
          //     not directly observable from the host realm. They
          //     typically settle within 200ms of onload, which the
          //     cooldown covers.
          const COOLDOWN_MS = 200;
          let lastWrite = 0;
          const doWrite = () => {
            currentMeasureTimer = null;
            lastWrite = performance.now();
            try {
              const doc = el.contentDocument;
              if (doc && doc.body) {
                const height = doc.body.scrollHeight + 24;
                // Skip the DOM write if the height is unchanged. This
                // breaks the only remaining feedback edge: a RO entry
                // that fires when the host hasn't actually changed
                // size would otherwise write the same `style.height`
                // and look identical to a no-op, but the assignment
                // still forces a style invalidation. Skipping the
                // assignment when the value matches removes that
                // micro-cost AND guarantees the next layout pass
                // produces zero host-geometry change.
                if (el.style.height !== `${height}px`) {
                  el.style.height = `${height}px`;
                }
              }
            } catch {
              /* sandboxed — keep default height */
            }
          };
          const measure = () => {
            if (currentMeasureTimer !== null) {
              clearTimeout(currentMeasureTimer);
            }
            const now = performance.now();
            const wait = Math.max(0, COOLDOWN_MS - (now - lastWrite));
            currentMeasureTimer = setTimeout(doWrite, wait);
          };
          currentMeasure = measure;
          el.onload = measure;
          try {
            // Observe the HOST (the iframe element itself), not the
            // body's contentDocument. See the long comment above.
            const ro = new ResizeObserver(measure);
            currentIframeResizeObserver = ro;
            el.dataset.roAttached = "1";
            ro.observe(el);
          } catch {
            /* sandbox denies */
          }
        }}
        srcdoc={iframeSrc()}
        sandbox="allow-scripts allow-same-origin"
        style={{
          width: "100%",
          "min-height": `${props.minHeight ?? 240}px`,
          border: "none",
          "background-color": "transparent",
          ...props.style,
        }}
        title={props.title ?? props.message.subj ?? "邮件正文"}
      />
      {/* Show images + per-sender "always show" — only mount when the
          sanitized HTML actually contains external <img> tags. The
          button is per-message because the prefetch map must target
          this message's iframe, and the checkbox policy is per-sender
          so the same sender in another thread inherits it. */}
      <Show
        when={
          props.showImagesBar !== false &&
          imageAnalysis() &&
          hiddenImageCount() > 0
        }
      >
        <div
          data-show-images-bar
          style={{
            display: "flex",
            "align-items": "center",
            "flex-wrap": "wrap",
            gap: "var(--space-3)",
            "margin-top": "var(--space-2)",
            "font-size": "var(--text-caption)",
            color: "var(--text-secondary)",
          }}
        >
          <button
            type="button"
            onClick={() => void onShowImages()}
            disabled={showBusy()}
            data-show-images
            style={{
              display: "inline-flex",
              "align-items": "center",
              gap: "var(--space-1)",
              padding: "4px 10px",
              "border-radius": "var(--radius-pill, 999px)",
              border: "0.5px solid var(--border)",
              background: "var(--paper-light)",
              color: "var(--text-primary)",
              cursor: showBusy() ? "wait" : "pointer",
              "font-size": "var(--text-caption)",
              opacity: showBusy() ? 0.6 : 1,
            }}
          >
            <Show
              when={showBusy()}
              fallback={<Icon name="ph-image" size={12} />}
            >
              <Icon name="ph-spinner" size={12} />
            </Show>
            显示图片（{hiddenImageCount()}）
          </button>
          <Show when={props.senderEmail}>
            <label
              style={{
                display: "inline-flex",
                "align-items": "center",
                gap: "var(--space-1)",
                cursor: "pointer",
                "user-select": "none",
              }}
            >
              <input
                type="checkbox"
                checked={alwaysShow()}
                onChange={(e) =>
                  void onToggleAlwaysShow(e.currentTarget.checked)
                }
                data-always-show-images
                style={{ margin: 0 }}
              />
              <span>始终显示此发件人的图片</span>
            </label>
          </Show>
        </div>
      </Show>
    </>
  );
}

/** One-liner for list previews: clean plain text (HTML-stripped when the text
 *  part is secretly markup). List rows must NOT render HTML — this keeps
 *  previews cheap; full rendering is EmailBody's job on expand. */
export function emailPreviewText(m: Pick<Message, "body" | "prev">): string {
  const raw = m.body || m.prev || "";
  return looksLikeHtml(raw) ? htmlToPlainText(raw) : plainPreview(raw);
}
