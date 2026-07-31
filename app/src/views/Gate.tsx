/** Gate view — Tinder-style swipe cards for first-time senders.
 * Per prototype-v11 §3.1: every first-time sender lands here.
 * User approves (choose destination: imbox/feed/paperTrail) or blocks (screened=false, blocked=true).
 */

import { For, Show, createMemo, createResource, createSignal } from "solid-js";
import {
  listContacts,
  listMessages,
  upsertContact,
  upsertMessage,
} from "../stores/data";
import { Avatar } from "../components/Avatar";
import { Icon } from "../components/Icon";
import { Empty } from "../components/Empty";
import type { Contact, Message, MessageBucket } from "../types";
import { showToast, setView } from "../stores/ui";

const BUCKETS: { id: MessageBucket; label: string; icon: string }[] = [
  { id: "imbox", label: "Imbox", icon: "ph-tray" },
  { id: "feed", label: "Stream", icon: "ph-newspaper" },
  { id: "paperTrail", label: "Records", icon: "ph-receipt" },
];

export function Gate() {
  const [contacts] = createResource(listContacts);
  const [messages] = createResource(listMessages);

  const queue = createMemo<{ contact: Contact; message: Message }[]>(() => {
    const cs = contacts() ?? [];
    const ms = messages() ?? [];
    return cs
      .filter((c) => c.firstSeen && !c.screened)
      .map((c) => {
        const msg = ms.find((m) => m.pid === c.id);
        return msg ? { contact: c, message: msg } : null;
      })
      .filter((x): x is { contact: Contact; message: Message } => x !== null);
  });

  const [cursor, setCursor] = createSignal(0);
  const current = (): { contact: Contact; message: Message } | undefined =>
    queue()[cursor()];

  const approve = async (bucket: MessageBucket) => {
    const cur = current();
    if (!cur) return;
    const updatedContact: Contact = {
      ...cur.contact,
      firstSeen: false,
      screened: true,
      defaultBucket: bucket,
    };
    const updatedMsg: Message = { ...cur.message, bucket };
    await upsertContact(updatedContact);
    await upsertMessage(updatedMsg);
    showToast({ message: `已批准 → ${bucket === "imbox" ? "Imbox" : bucket === "feed" ? "Stream" : "Records"}`, kind: "success" });
    advance();
  };

  const block = async () => {
    const cur = current();
    if (!cur) return;
    const updatedContact: Contact = {
      ...cur.contact,
      firstSeen: false,
      screened: true,
      blocked: true,
    };
    await upsertContact(updatedContact);
    showToast({ message: `已阻止 ${cur.contact.name}`, kind: "info" });
    advance();
  };

  const advance = () => {
    setCursor((c) => c + 1);
  };

  return (
    <div
      style={{
        "max-width": "560px",
        margin: "0 auto",
        padding: "var(--space-6) var(--space-5)",
        animation: "view-enter 0.3s var(--ease-out) both",
      }}
    >
      <header style={{ "margin-bottom": "var(--space-5)", "text-align": "center" }}>
        <div
          style={{
            display: "inline-flex",
            "align-items": "center",
            gap: "var(--space-2)",
            padding: "6px 14px",
            background: "var(--paper-mid)",
            "border-radius": "var(--radius-pill)",
            "font-size": "var(--text-caption)",
            color: "var(--text-secondary)",
            "font-weight": "600",
          }}
        >
          <Icon name="ph-shield-check" size={14} />
          Screener — {queue().length} 待审
        </div>
        <h2
          style={{
            "font-family": "var(--font-display)",
            "font-size": "var(--text-h3)",
            "font-weight": "800",
            margin: "var(--space-3) 0 var(--space-1)",
          }}
        >
          决定谁可以进入你的 Imbox
        </h2>
        <p style={{ color: "var(--text-secondary)", "font-size": "var(--text-body-sm)", margin: 0 }}>
          第一次发件人需要你点头。批准后归入对应分类；拒绝后永久屏蔽。
        </p>
      </header>

      <Show when={current()} fallback={<DoneState count={queue().length} />}>
        {(pair) => {
          const c = () => pair().contact;
          const m = () => pair().message;
          return (
            <div
              style={{
                background: "var(--paper-light)",
                border: "0.5px solid var(--border)",
                "border-radius": "var(--radius-xl)",
                padding: "var(--space-6)",
                "box-shadow": "var(--shadow-md)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  gap: "var(--space-4)",
                  "align-items": "center",
                  "margin-bottom": "var(--space-4)",
                }}
              >
                <Avatar name={c().name || "?"} src={c().avatar} size={56} />
                <div style={{ flex: 1, "min-width": 0 }}>
                  <h3
                    style={{
                      "font-family": "var(--font-display)",
                      "font-size": "var(--text-h4)",
                      "font-weight": "800",
                      margin: 0,
                    }}
                  >
                    {c().name || "(unknown)"}
                  </h3>
                  <p
                    style={{
                      margin: 0,
                      "font-size": "var(--text-caption)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    {c().emails[0]?.value ?? "(no email)"}
                  </p>
                  <Show when={c().company || c().title}>
                    <p
                      style={{
                        margin: 0,
                        "margin-top": "2px",
                        "font-size": "var(--text-micro)",
                        color: "var(--text-muted)",
                      }}
                    >
                      {[c().title, c().company].filter(Boolean).join(" · ")}
                    </p>
                  </Show>
                </div>
              </div>

              <div
                style={{
                  padding: "var(--space-4)",
                  background: "var(--paper-mid)",
                  "border-radius": "var(--radius-md)",
                  "margin-bottom": "var(--space-4)",
                }}
              >
                <strong
                  style={{
                    "font-size": "var(--text-body-sm)",
                    "font-weight": "700",
                  }}
                >
                  {m().subj}
                </strong>
                <p
                  style={{
                    "margin-top": "var(--space-2)",
                    "font-size": "var(--text-body-sm)",
                    color: "var(--text-secondary)",
                    "line-height": 1.5,
                    "white-space": "pre-wrap",
                  }}
                >
                  {m().body}
                </p>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: "var(--space-2)",
                  "margin-bottom": "var(--space-4)",
                }}
              >
                <For each={BUCKETS}>
                  {(b) => (
                    <button
                      onClick={() => approve(b.id)}
                      style={{
                        flex: 1,
                        display: "flex",
                        "flex-direction": "column",
                        "align-items": "center",
                        gap: "4px",
                        padding: "var(--space-3)",
                        background: "var(--paper-light)",
                        "border-radius": "var(--radius-md)",
                        border: "1px solid var(--border)",
                        "font-size": "var(--text-caption)",
                        "font-weight": "600",
                        color: "var(--text-primary)",
                        cursor: "pointer",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--mint)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "var(--paper-light)")}
                    >
                      <Icon name={b.icon} size={20} />
                      {b.label}
                    </button>
                  )}
                </For>
              </div>

              <button
                onClick={block}
                style={{
                  width: "100%",
                  padding: "var(--space-3)",
                  background: "transparent",
                  "border-radius": "var(--radius-md)",
                  border: "1px solid var(--coral)",
                  color: "var(--coral)",
                  "font-weight": "700",
                  "font-size": "var(--text-caption)",
                  display: "flex",
                  "align-items": "center",
                  "justify-content": "center",
                  gap: "var(--space-2)",
                }}
              >
                <Icon name="ph-prohibit" size={16} />
                永久屏蔽此发件人
              </button>
            </div>
          );
        }}
      </Show>
    </div>
  );
}

function DoneState(props: { count: number }) {
  return (
    <Empty
      icon="ph-check-circle"
      title={props.count === 0 ? "Inbox 清爽" : "全部审完"}
      description={
        props.count === 0
          ? "现在没有第一次发件人需要审。"
          : "Screener 已清空。"
      }
      action={{ label: "回到 Imbox", onClick: () => setView("imbox") }}
    />
  );
}