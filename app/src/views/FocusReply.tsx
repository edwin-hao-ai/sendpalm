/** Focus & Reply view — HEY-style distraction-free reply flow.
 * Lists every message marked Reply Later with an inline draft textarea.
 */

import {
  For,
  Show,
  createMemo,
  createResource,
  createSignal,
  onCleanup,
} from "solid-js";
import { listMessages, listContacts, upsertMessage } from "../stores/data";
import {
  setView,
  setComposeOpen,
  setComposeContext,
  showToast,
} from "../stores/ui";
import { Avatar } from "../components/Avatar";
import { Icon } from "../components/Icon";
import { sendEmailViaBackend } from "../services/backend";
import { generateAiDraft } from "../utils/draft";
import { getFocusReplyCandidates } from "../utils/triage";
import type { Contact, Message } from "../types";

export function FocusReply() {
  const [contacts] = createResource(listContacts);
  const [messages, { refetch: refetchMessages }] = createResource(listMessages);
  const [completedIds, setCompletedIds] = createSignal<Set<string>>(new Set());

  const contactMap = createMemo(() => {
    const map = new Map<string, Contact>();
    for (const c of contacts() ?? []) map.set(c.id, c);
    return map;
  });

  const replyLater = createMemo<Message[]>(() =>
    getFocusReplyCandidates(messages() ?? [], completedIds()),
  );

  const pendingCount = createMemo(() => replyLater().length);

  const close = () => {
    setCompletedIds(new Set<string>());
    setView("imbox");
  };

  const handleKey = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
    if (tag === "input" || tag === "textarea") return;
    if (e.key === "Escape") {
      e.preventDefault();
      close();
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
      <div
        style={{
          display: "flex",
          "align-items": "center",
          "justify-content": "space-between",
          padding: "var(--space-4) var(--space-5)",
          "border-bottom": "0.5px solid var(--border)",
        }}
      >
        <div>
          <h1
            style={{
              "font-family": "var(--font-display)",
              "font-size": "var(--text-h3)",
              "font-weight": "800",
              color: "var(--text-primary)",
              margin: 0,
            }}
          >
            Focus & Reply
          </h1>
          <p
            style={{
              margin: "2px 0 0",
              color: "var(--text-muted)",
              "font-size": "var(--text-caption)",
            }}
          >
            {pendingCount()} pending
          </p>
        </div>
        <button
          onClick={close}
          title="Close Focus & Reply"
          aria-label="Close Focus & Reply"
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

      <Show
        when={pendingCount() > 0}
        fallback={
          <DoneState
            onBack={() => {
              setCompletedIds(new Set<string>());
              setView("imbox");
            }}
          />
        }
      >
        <div
          style={{
            flex: 1,
            overflow: "auto",
            padding: "var(--space-4) var(--space-5)",
          }}
        >
          <div
            style={{
              display: "flex",
              "flex-direction": "column",
              gap: "var(--space-4)",
              "max-width": "720px",
              margin: "0 auto",
            }}
          >
            <For each={replyLater()}>
              {(m, i) => (
                <FocusReplyItem
                  m={m}
                  contact={contactMap().get(m.pid)}
                  index={i()}
                  onChange={async () => {
                    await refetchMessages();
                  }}
                  onComplete={(id) => {
                    setCompletedIds((prev) => new Set([...prev, id]));
                  }}
                />
              )}
            </For>
          </div>
        </div>
      </Show>
    </div>
  );
}

function FocusReplyItem(props: {
  m: Message;
  contact?: Contact;
  index: number;
  onChange: () => Promise<void>;
  onComplete: (id: string) => void;
}) {
  const fromEmail = () =>
    props.contact?.emails[0]?.value ?? props.contact?.name ?? "";
  const [draft, setDraft] = createSignal(
    generateAiDraft(props.m, props.contact, fromEmail()),
  );
  const [sending, setSending] = createSignal(false);

  const clearFlags = async () => {
    await upsertMessage({
      ...props.m,
      replyLater: false,
      setAside: false,
      bubbleUpAt: null,
    });
  };

  const send = async () => {
    const body = draft().trim();
    if (!body) {
      showToast({ message: "没有可发送的内容", kind: "warning" });
      return;
    }
    setSending(true);
    try {
      const to = fromEmail();
      const result = await sendEmailViaBackend(
        to,
        `Re: ${props.m.subj.replace(/^Re:\s*/i, "").trim()}`,
        body,
        props.m.ac,
      );
      if (result) {
        await clearFlags();
        props.onComplete(props.m.id);
        showToast({ message: "回复已发送", kind: "success" });
      } else {
        showToast({
          message: "未配置真实账户，回复未发送",
          kind: "info",
        });
      }
    } finally {
      setSending(false);
    }
    await props.onChange();
  };

  const regenerate = () => {
    setDraft(generateAiDraft(props.m, props.contact, fromEmail()));
  };

  const editInCompose = () => {
    setComposeContext({
      mode: "reply",
      originalMsg: props.m,
    });
    setComposeOpen(true);
  };

  const skip = () => {
    props.onComplete(props.m.id);
  };

  const done = async () => {
    await clearFlags();
    props.onComplete(props.m.id);
    await props.onChange();
    showToast({ message: "已标记为完成", kind: "success" });
  };

  return (
    <div
      style={{
        display: "flex",
        "flex-direction": "column",
        gap: "var(--space-3)",
        animation: "list-item-enter 0.35s var(--ease-out) both",
        "animation-delay": `${props.index * 60}ms`,
      }}
    >
      {/* Original message card */}
      <div
        style={{
          background: "var(--paper-light)",
          border: "0.5px solid var(--border)",
          "border-radius": "var(--radius-lg)",
          padding: "var(--space-4)",
        }}
      >
        <div
          style={{
            display: "flex",
            "align-items": "center",
            gap: "var(--space-3)",
            "margin-bottom": "var(--space-3)",
          }}
        >
          <Avatar
            name={props.contact?.name ?? "?"}
            src={props.contact?.avatar}
            size={40}
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
              {props.contact?.name ?? "Unknown"}
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
              {fromEmail() || "—"}
            </div>
          </div>
          <span
            style={{
              "font-size": "var(--text-caption)",
              color: "var(--text-muted)",
            }}
          >
            {props.m.tm}
          </span>
        </div>
        <h2
          style={{
            "font-family": "var(--font-display)",
            "font-size": "var(--text-h4)",
            "font-weight": "700",
            color: "var(--text-primary)",
            margin: "0 0 var(--space-3)",
          }}
        >
          {props.m.subj}
        </h2>
        <div
          style={{
            color: "var(--text-secondary)",
            "font-size": "var(--text-body)",
            "line-height": "1.6",
            "overflow-wrap": "anywhere",
          }}
        >
          <For each={props.m.body.split(/\n\s*\n/)}>
            {(p) =>
              p.trim() ? <p style={{ margin: "0 0 14px" }}>{p.trim()}</p> : null
            }
          </For>
        </div>
      </div>

      {/* Reply draft card */}
      <div
        style={{
          background: "var(--paper-light)",
          border: "0.5px solid var(--border)",
          "border-radius": "var(--radius-lg)",
          padding: "var(--space-4)",
        }}
      >
        <div
          style={{
            display: "flex",
            "align-items": "center",
            gap: "var(--space-2)",
            "margin-bottom": "var(--space-3)",
            color: "var(--agent)",
            "font-size": "var(--text-caption)",
            "font-weight": "700",
          }}
        >
          <Icon name="ph-sparkle" size={16} />
          <span>SendPalm draft</span>
        </div>
        <textarea
          value={draft()}
          onInput={(e) => setDraft(e.currentTarget.value)}
          placeholder="Write your reply, or edit the draft below..."
          style={{
            width: "100%",
            "min-height": "160px",
            padding: "var(--space-3)",
            "border-radius": "var(--radius-md)",
            border: "0.5px solid var(--border)",
            background: "var(--paper)",
            color: "var(--text-primary)",
            "font-family": "var(--font-body)",
            "font-size": "var(--text-body)",
            "line-height": "1.6",
            resize: "vertical",
            outline: "none",
          }}
        />
        <div
          style={{
            display: "flex",
            "flex-wrap": "wrap",
            gap: "var(--space-2)",
            "margin-top": "var(--space-3)",
          }}
        >
          <ActionBtn
            icon="ph-paper-plane-right"
            label={sending() ? "Sending…" : "Send"}
            primary
            onClick={send}
            disabled={sending()}
          />
          <ActionBtn
            icon="ph-arrows-clockwise"
            label="Regenerate"
            onClick={regenerate}
          />
          <ActionBtn
            icon="ph-pencil-simple"
            label="Edit"
            onClick={editInCompose}
          />
          <div style={{ flex: 1 }} />
          <ActionBtn icon="ph-check" label="Done" onClick={done} />
          <ActionBtn icon="ph-x" label="Skip" onClick={skip} />
        </div>
      </div>
    </div>
  );
}

function ActionBtn(props: {
  icon: string;
  label: string;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={props.onClick}
      disabled={props.disabled}
      style={{
        display: "inline-flex",
        "align-items": "center",
        gap: "6px",
        padding: "8px 14px",
        "border-radius": "var(--radius-md)",
        border: props.primary ? "none" : "0.5px solid var(--border)",
        background: props.primary ? "var(--palm)" : "var(--paper-mid)",
        color: props.primary ? "white" : "var(--text-secondary)",
        "font-size": "var(--text-caption)",
        "font-weight": "700",
        cursor: props.disabled ? "not-allowed" : "pointer",
        opacity: props.disabled ? 0.6 : 1,
      }}
    >
      <Icon name={props.icon} size={14} />
      {props.label}
    </button>
  );
}

function DoneState(props: { onBack: () => void }) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        "flex-direction": "column",
        "align-items": "center",
        "justify-content": "center",
        gap: "var(--space-4)",
        color: "var(--text-secondary)",
        "text-align": "center",
        padding: "var(--space-5)",
      }}
    >
      <Icon name="ph-check-circle" size={64} color="var(--palm)" />
      <h2
        style={{
          "font-family": "var(--font-display)",
          "font-size": "var(--text-h3)",
          "font-weight": "800",
          color: "var(--text-primary)",
          margin: 0,
        }}
      >
        All caught up
      </h2>
      <p style={{ margin: 0, color: "var(--text-muted)" }}>
        You've cleared your Pending replies.
      </p>
      <button
        onClick={props.onBack}
        style={{
          padding: "10px 20px",
          background: "var(--palm)",
          color: "white",
          "border-radius": "var(--radius-pill)",
          "font-weight": "700",
          border: "none",
          cursor: "pointer",
        }}
      >
        Back to Inbox
      </button>
    </div>
  );
}
