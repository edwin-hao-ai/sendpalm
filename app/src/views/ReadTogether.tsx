/** Read Together view — triage unread emails one at a time.
 * Mirrors prototype-v11's read-together flow.
 *
 * Data shape: the unread list comes from `listMessagesPaged` with
 * `lightweight: true` so the IPC payload omits `body` and `body_html`
 * (the previous full `listMessages()` pulled ~80 KB/row of HTML into
 * the list even though only one card was on screen). The current
 * message's full body is fetched lazily via `getMessage(id)` and
 * rendered as a sanitized iframe when `body_html` is present, falling
 * back to the plain-text body otherwise.
 */

import {
  For,
  Show,
  createEffect,
  createMemo,
  createResource,
  createSignal,
  onCleanup,
} from "solid-js";
import {
  listMessagesPaged,
  getMessage,
  listContacts,
  upsertMessage,
  moveMessageToBucket,
} from "../stores/data";
import {
  setView,
  setComposeOpen,
  setComposeContext,
  showToast,
} from "../stores/ui";
import { Avatar } from "../components/Avatar";
import { Icon } from "../components/Icon";
import { Empty, ErrorState } from "../components/Empty";
import { getReadTogetherCandidates } from "../utils/triage";
import { htmlEmailSrcdoc } from "../utils/html";
import type { Contact, Message } from "../types";

const READ_TOGETHER_PAGE = 200;

export function ReadTogether() {
  const [contacts] = createResource(listContacts);
  // Lightweight list (no body) — fast page load even for a busy mailbox.
  const [unreadRaw, { refetch: refetchUnread }] = createResource(async () => {
    const page = await listMessagesPaged({
      bucket: "imbox",
      direction: "in",
      unreadOnly: true,
      lightweight: true,
      limit: READ_TOGETHER_PAGE,
      offset: 0,
    });
    return page.items;
  });
  const [index, setIndex] = createSignal(0);

  // Apply the same workflow / Gate filters the prototype uses so a
  // message the user has set aside, marked reply-later, or bubble-up'd
  // doesn't reappear here.
  const unread = createMemo<Message[]>(() => {
    const list = unreadRaw() ?? [];
    return getReadTogetherCandidates(list, contacts() ?? []);
  });

  // The current card. The lightweight row is enough for the index/cursor
  // + sender info; we re-fetch the full row (with body/body_html) so the
  // iframe can render the real content.
  const currentId = createMemo(() => unread()[index()]?.id);
  const [currentFull] = createResource(
    currentId,
    async (id) => (id ? await getMessage(id) : null),
  );

  const current = createMemo<Message | undefined>(
    () => currentFull() ?? unread()[index()],
  );

  const contactMap = createMemo(() => {
    const map = new Map<string, Contact>();
    for (const c of contacts() ?? []) map.set(c.id, c);
    return map;
  });

  const currentContact = createMemo<Contact | undefined>(() => {
    const m = current();
    return m ? contactMap().get(m.pid) : undefined;
  });

  const close = () => {
    setIndex(0);
    setView("imbox");
  };

  const advance = () => {
    const list = unread();
    const next = index() + 1;
    if (next >= list.length) {
      close();
      showToast({ message: "All caught up", kind: "success" });
    } else {
      setIndex(next);
    }
  };

  const markReadAndNext = async () => {
    const m = current();
    if (!m) return;
    await upsertMessage({ ...m, unread: false });
    await refetchUnread();
    advance();
  };

  const replyLaterAndNext = async () => {
    const m = current();
    if (!m) return;
    await upsertMessage({ ...m, replyLater: true, unread: false });
    await refetchUnread();
    advance();
  };

  const reply = () => {
    const m = current();
    if (!m) return;
    setComposeContext({ mode: "reply", originalMsg: m });
    setComposeOpen(true);
    close();
  };

  const archive = async () => {
    const m = current();
    if (!m) return;
    await moveMessageToBucket(m.id, "paperTrail");
    await refetchUnread();
    advance();
  };

  const trash = async () => {
    const m = current();
    if (!m) return;
    await moveMessageToBucket(m.id, "trash");
    await refetchUnread();
    advance();
  };

  // When the user advances past the current message, prefetch the next
  // one's full body in the background. Cuts the perceived wait for
  // body_html to appear on the next click.
  createEffect(() => {
    const list = unread();
    const nextIdx = index() + 1;
    const nextId = list[nextIdx]?.id;
    if (nextId) {
      void getMessage(nextId).catch(() => undefined);
    }
  });

  // Deferred iframe src: htmlEmailSrcdoc runs DOMPurify synchronously,
  // blocking the main thread for 200-600ms on an 80KB HTML body. Defer
  // the sanitize so the next-card click path (Next / n / space) doesn't
  // stall on the previous card's iframe. Stale-closure guard cancels a
  // slow sanitize from the previous card if the user advances again
  // before the first one finishes.
  const [iframeSrc, setIframeSrc] = createSignal("");
  let pendingSanitize = 0;
  createEffect(() => {
    const html = current()?.bodyHtml;
    if (!html || !html.trim()) {
      setIframeSrc("");
      return;
    }
    const myId = ++pendingSanitize;
    setTimeout(() => {
      if (myId !== pendingSanitize) return;
      setIframeSrc(htmlEmailSrcdoc(html));
    }, 0);
  });

  const handleKey = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
    if (tag === "input" || tag === "textarea") return;
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "n" || e.key === " ") {
      e.preventDefault();
      void markReadAndNext();
    } else if (e.key === "p") {
      e.preventDefault();
      void replyLaterAndNext();
    } else if (e.key === "r") {
      e.preventDefault();
      reply();
    }
  };

  document.addEventListener("keydown", handleKey);
  onCleanup(() => document.removeEventListener("keydown", handleKey));

  return (
    <div
      style={{
        padding: "0",
        animation: "view-enter 0.3s var(--ease-out) both",
        height: "100%",
        display: "flex",
        "flex-direction": "column",
      }}
    >
      <Show
        when={!unreadRaw.error}
        fallback={
          <ErrorState
            title="加载失败"
            message={String(unreadRaw.error ?? "")}
            retry={() => void refetchUnread()}
          />
        }
      >
        <></>
      </Show>

      <Show
        when={current()}
        fallback={
          <Empty
            icon="ph-tray"
            title="All caught up"
            description="没有未读邮件需要一起阅读。"
            action={{ label: "返回 Inbox", onClick: close }}
          />
        }
      >
        <div
          style={{
            display: "flex",
            "align-items": "center",
            "justify-content": "space-between",
            padding: "var(--space-4) var(--space-5)",
            "border-bottom": "0.5px solid var(--border)",
          }}
        >
          <div
            style={{
              "font-size": "var(--text-caption)",
              "font-weight": "700",
              color: "var(--text-muted)",
            }}
          >
            {index() + 1} of {unread().length}
          </div>
          <button
            onClick={close}
            title="Close Read Together"
            aria-label="Close Read Together"
            style={{
              display: "inline-flex",
              "align-items": "center",
              "justify-content": "center",
              width: "36px",
              height: "36px",
              "border-radius": "var(--radius-pill)",
              background: "var(--paper-mid)",
              color: "var(--text-secondary)",
              border: "none",
              cursor: "pointer",
            }}
          >
            <Icon name="ph-x" size={18} />
          </button>
        </div>

        <div
          style={{
            flex: 1,
            overflow: "auto",
            padding: "var(--space-5)",
          }}
        >
          <div
            style={{
              "max-width": "680px",
              margin: "0 auto",
              background: "var(--paper-light)",
              border: "0.5px solid var(--border)",
              "border-radius": "var(--radius-lg)",
              padding: "var(--space-5)",
            }}
          >
            <div
              style={{
                display: "flex",
                "align-items": "center",
                gap: "var(--space-3)",
                "margin-bottom": "var(--space-4)",
              }}
            >
              <Avatar
                name={currentContact()?.name ?? "?"}
                src={currentContact()?.avatar}
                size={48}
              />
              <div style={{ flex: 1, "min-width": 0 }}>
                <div
                  style={{
                    "font-weight": "700",
                    color: "var(--text-primary)",
                    "white-space": "nowrap",
                    overflow: "hidden",
                    "text-overflow": "ellipsis",
                  }}
                >
                  {currentContact()?.name ?? "Unknown"}
                </div>
                <div
                  style={{
                    "font-size": "var(--text-caption)",
                    color: "var(--text-muted)",
                    "white-space": "nowrap",
                    overflow: "hidden",
                    "text-overflow": "ellipsis",
                  }}
                >
                  {currentContact()?.emails[0]?.value ?? "—"}
                </div>
              </div>
              <span
                style={{
                  "font-size": "var(--text-caption)",
                  color: "var(--text-muted)",
                }}
              >
                {current()!.tm}
              </span>
            </div>

            <h2
              style={{
                "font-family": "var(--font-display)",
                "font-size": "var(--text-h3)",
                "font-weight": "800",
                color: "var(--text-primary)",
                margin: "0 0 var(--space-4)",
              }}
            >
              {current()!.subj}
            </h2>

            <Show
              when={current()!.bodyHtml && current()!.bodyHtml!.trim().length > 0}
              fallback={
                <div
                  data-render-mode="plain"
                  style={{
                    color: "var(--text-secondary)",
                    "font-size": "var(--text-body)",
                    "line-height": "1.7",
                    "overflow-wrap": "anywhere",
                  }}
                >
                  <For each={current()!.body.split(/\n\s*\n/)}>
                    {(p) =>
                      p.trim() ? (
                        <p style={{ margin: "0 0 14px" }}>{p.trim()}</p>
                      ) : null
                    }
                  </For>
                  <Show when={!current()!.body.trim()}>
                    <p style={{ color: "var(--text-muted)", "font-style": "italic" }}>
                      这封邮件没有纯文本正文。
                    </p>
                  </Show>
                </div>
              }
            >
              <iframe
                data-render-mode="html"
                title={`Message body: ${current()!.subj}`}
                srcdoc={iframeSrc()}
                sandbox=""
                referrerpolicy="no-referrer"
                loading="lazy"
                style={{
                  width: "100%",
                  border: "none",
                  "min-height": "240px",
                  background: "transparent",
                }}
                onLoad={(ev) => {
                  // Auto-size to the iframe body's scrollHeight so
                  // long emails don't need a scrollbar inside the card.
                  const el = ev.currentTarget;
                  try {
                    const doc = el.contentDocument;
                    if (doc?.body) {
                      el.style.height = `${doc.body.scrollHeight + 24}px`;
                    }
                  } catch {
                    // Cross-origin or sandboxed — leave min-height.
                  }
                }}
              />
            </Show>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            "align-items": "center",
            "justify-content": "center",
            gap: "var(--space-3)",
            padding: "var(--space-4) var(--space-5)",
            "border-top": "0.5px solid var(--border)",
            background: "var(--paper-light)",
          }}
        >
          <ActionBtn
            icon="ph-check"
            label="Next"
            primary
            onClick={() => void markReadAndNext()}
          />
          <ActionBtn icon="ph-arrow-u-up-left" label="Reply" onClick={reply} />
          <ActionBtn
            icon="ph-clock"
            label="Pending"
            onClick={() => void replyLaterAndNext()}
          />
          <ActionBtn
            icon="ph-tray"
            label="Archive"
            onClick={() => void archive()}
          />
          <ActionBtn
            icon="ph-trash"
            label="Trash"
            onClick={() => void trash()}
          />
        </div>
      </Show>
    </div>
  );
}

function ActionBtn(props: {
  icon: string;
  label: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      onClick={props.onClick}
      style={{
        display: "inline-flex",
        "align-items": "center",
        gap: "6px",
        padding: "10px 18px",
        "border-radius": "var(--radius-md)",
        border: props.primary ? "none" : "0.5px solid var(--border)",
        background: props.primary ? "var(--palm)" : "var(--paper-mid)",
        color: props.primary ? "white" : "var(--text-secondary)",
        "font-size": "var(--text-caption)",
        "font-weight": "700",
        cursor: "pointer",
      }}
    >
      <Icon name={props.icon} size={16} />
      {props.label}
    </button>
  );
}
