/** Read Together view — triage unread emails one at a time.
 * Mirrors prototype-v11's read-together flow.
 */

import {
  For,
  Show,
  createMemo,
  createResource,
  createSignal,
  onCleanup,
} from "solid-js";
import {
  listMessages,
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
import { Empty } from "../components/Empty";
import { getReadTogetherCandidates } from "../utils/triage";
import type { Contact, Message } from "../types";

export function ReadTogether() {
  const [contacts] = createResource(listContacts);
  const [messages, { refetch: refetchMessages }] = createResource(listMessages);
  const [index, setIndex] = createSignal(0);

  const contactMap = createMemo(() => {
    const map = new Map<string, Contact>();
    for (const c of contacts() ?? []) map.set(c.id, c);
    return map;
  });

  const unread = createMemo<Message[]>(() =>
    getReadTogetherCandidates(messages() ?? [], contacts() ?? []),
  );

  const current = createMemo<Message | undefined>(() => {
    const list = unread();
    return list[index()];
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
    const next = index() + 1;
    if (next >= unread().length) {
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
    await refetchMessages();
    advance();
  };

  const replyLaterAndNext = async () => {
    const m = current();
    if (!m) return;
    await upsertMessage({ ...m, replyLater: true, unread: false });
    await refetchMessages();
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
    await refetchMessages();
    advance();
  };

  const trash = async () => {
    const m = current();
    if (!m) return;
    await moveMessageToBucket(m.id, "trash");
    await refetchMessages();
    advance();
  };

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

            <div
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
            </div>
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
