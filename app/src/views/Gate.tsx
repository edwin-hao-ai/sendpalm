/** Gate view — Tinder-style swipe cards for first-time senders.
 * Per prototype-v11 §3.1: every first-time sender lands here.
 * User approves (choose destination: imbox/feed/paperTrail) or blocks (screened=false, blocked=true).
 */

import { For, Show, createMemo, createResource, createSignal } from "solid-js";
import {
  listContacts,
  listGateQueue,
  upsertContact,
  updateMessagesBucketByContact,
} from "../stores/data";
import { openUrl } from "@tauri-apps/plugin-opener";
import { emailBodyPreview } from "../utils/html";

import { Avatar } from "../components/Avatar";
import { Icon } from "../components/Icon";
import { Empty, ErrorState } from "../components/Empty";
import type { Contact, Message, MessageBucket } from "../types";
import { showToast, setView } from "../stores/ui";
import { useRefreshEffect, useSoftRefreshEffect, useViewport } from "../utils/gestures";
import { SwipeActions } from "../components/SwipeActions";

const BUCKETS: { id: MessageBucket; label: string; icon: string }[] = [
  { id: "imbox", label: "Imbox", icon: "ph-tray" },
  { id: "feed", label: "Stream", icon: "ph-newspaper" },
  { id: "paperTrail", label: "Records", icon: "ph-receipt" },
];

export function Gate() {
  const [queueItems, { refetch: refetchQueue }] = createResource(listGateQueue);
  const { isMobile } = useViewport();

  const handleBodyClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement | null;
    const a = target?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (!a) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    e.stopPropagation();
    openUrl(a.href).catch(() => {});
  };

  let initialHardRefresh = true;
  useRefreshEffect(() => {
    if (initialHardRefresh) {
      initialHardRefresh = false;
      return;
    }
    void refetchQueue();
  });
  let initialSoftRefresh = true;
  useSoftRefreshEffect(() => {
    if (initialSoftRefresh) {
      initialSoftRefresh = false;
      return;
    }
    void refetchQueue();
  });

  const queue = createMemo<{ contact: Contact; message: Message }[]>(
    () => queueItems() ?? [],
  );

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
    await upsertContact(updatedContact);
    await updateMessagesBucketByContact(cur.contact.id, bucket);
    showToast({
      message: `已批准 → ${bucket === "imbox" ? "Imbox" : bucket === "feed" ? "Stream" : "Records"}`,
      kind: "success",
    });
    await refetchQueue();
    setCursor(0);
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
    await updateMessagesBucketByContact(cur.contact.id, "spam");
    showToast({ message: `已阻止 ${cur.contact.name}`, kind: "info" });
    await refetchQueue();
    setCursor(0);
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
      <Show
        when={!queueItems.error}
        fallback={
          <ErrorState
            title="Gate 加载失败"
            message={String(queueItems.error ?? "")}
            retry={() => void refetchQueue()}
          />
        }
      >
      <header
        style={{ "margin-bottom": "var(--space-5)", "text-align": "center" }}
      >
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
        <p
          style={{
            color: "var(--text-secondary)",
            "font-size": "var(--text-body-sm)",
            margin: 0,
          }}
        >
          第一次发件人需要你点头。批准后归入对应分类；拒绝后永久屏蔽。
        </p>
        <button
          onClick={() => setView("screenerHistory")}
          style={{
            "margin-top": "var(--space-3)",
            padding: "6px 14px",
            background: "transparent",
            border: "none",
            color: "var(--palm)",
            "font-weight": "700",
            "font-size": "var(--text-caption)",
            cursor: "pointer",
            display: "inline-flex",
            "align-items": "center",
            gap: "4px",
          }}
        >
          <Icon name="ph-clock-counter-clockwise" size={14} />
          查看 Gate 历史
        </button>
      </header>

      <Show when={current()} fallback={<DoneState count={queue().length} />}>
        {(pair) => {
          const c = () => pair().contact;
          const m = () => pair().message;
          return (
            <SwipeActions
              style={{ "border-radius": "var(--radius-xl)" }}
              leftAction={{
                label: "Block",
                icon: "ph-prohibit",
                color: "red",
                onClick: () => void block(),
              }}
              rightAction={{
                label: "Inbox",
                icon: "ph-check",
                color: "blue",
                onClick: () => void approve("imbox"),
              }}
              disabled={!isMobile()}
            >
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
                  <div
                    onClick={handleBodyClick}
                    style={{
                      "margin-top": "var(--space-2)",
                      "font-size": "var(--text-body-sm)",
                      color: "var(--text-secondary)",
                      "line-height": 1.5,
                      "overflow-wrap": "anywhere",
                      "word-break": "break-word",
                      "max-height": "240px",
                      "overflow-y": "auto",
                    }}
                    innerHTML={emailBodyPreview(m().body, m().bodyHtml)}
                  />
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
                        data-testid={`gate-approve-${b.id}`}
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
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.background = "var(--mint)")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.background =
                            "var(--paper-light)")
                        }
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
            </SwipeActions>
          );
        }}
      </Show>
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
        props.count === 0 ? "现在没有第一次发件人需要审。" : "Screener 已清空。"
      }
      action={{ label: "回到 Imbox", onClick: () => setView("imbox") }}
    />
  );
}

export function ScreenerHistory() {
  const [contacts, { refetch }] = createResource(listContacts);

  useRefreshEffect(() => {
    void refetch();
  });

  const screenedIn = createMemo(() =>
    (contacts() ?? []).filter((c) => c.screened && !c.firstSeen && !c.blocked),
  );
  const screenedOut = createMemo(() =>
    (contacts() ?? []).filter((c) => c.blocked),
  );

  const toggle = async (c: Contact, block: boolean) => {
    const updated: Contact = {
      ...c,
      blocked: block,
      screened: true,
      firstSeen: false,
    };
    await upsertContact(updated);
    await updateMessagesBucketByContact(c.id, block ? "spam" : c.defaultBucket);
    showToast({
      message: block ? `已将 ${c.name} 移入屏蔽` : `已将 ${c.name} 移入允许`,
      kind: "info",
    });
    refetch();
  };

  return (
    <div
      style={{
        "max-width": "880px",
        margin: "0 auto",
        padding: "var(--space-6) var(--space-5)",
        animation: "view-enter 0.3s var(--ease-out) both",
      }}
    >
      <Show
        when={!contacts.error}
        fallback={
          <ErrorState
            title="ScreenerHistory 加载失败"
            message={String(contacts.error ?? "")}
            retry={() => void refetch()}
          />
        }
      >
        <header
          style={{
            display: "flex",
            "align-items": "center",
            gap: "var(--space-3)",
            "margin-bottom": "var(--space-5)",
          }}
        >
        <button
          onClick={() => setView("screener")}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--text-muted)",
            cursor: "pointer",
            padding: "4px",
          }}
          aria-label="Back"
        >
          <Icon name="ph-arrow-left" size={20} />
        </button>
        <h2
          style={{
            "font-family": "var(--font-display)",
            "font-size": "var(--text-h3)",
            "font-weight": "800",
            margin: 0,
            flex: 1,
          }}
        >
          Gate 历史
        </h2>
      </header>

      <div
        style={{
          display: "grid",
          "grid-template-columns": "1fr 1fr",
          gap: "var(--space-4)",
        }}
      >
        <HistoryColumn
          title="允许的发件人"
          icon="ph-check-circle"
          color="var(--mint)"
          contacts={screenedIn()}
          actionLabel="屏蔽"
          onAction={(c) => toggle(c, true)}
        />
        <HistoryColumn
          title="屏蔽的发件人"
          icon="ph-prohibit"
          color="var(--coral)"
          contacts={screenedOut()}
          actionLabel="允许"
          onAction={(c) => toggle(c, false)}
        />
      </div>
      </Show>
    </div>
  );
}

function HistoryColumn(props: {
  title: string;
  icon: string;
  color: string;
  contacts: Contact[];
  actionLabel: string;
  onAction: (c: Contact) => void;
}) {
  const { isMobile } = useViewport();
  return (
    <div
      style={{
        background: "var(--paper-light)",
        border: "0.5px solid var(--border)",
        "border-radius": "var(--radius-xl)",
        padding: "var(--space-4)",
      }}
    >
      <div
        style={{
          display: "flex",
          "align-items": "center",
          gap: "var(--space-2)",
          "margin-bottom": "var(--space-4)",
          "font-weight": "800",
          "font-size": "var(--text-body)",
        }}
      >
        <Icon name={props.icon} size={18} style={{ color: props.color }} />
        {props.title}
        <span
          style={{
            "margin-left": "auto",
            "font-size": "var(--text-caption)",
            color: "var(--text-muted)",
            "font-weight": "600",
          }}
        >
          {props.contacts.length}
        </span>
      </div>

      <Show
        when={props.contacts.length > 0}
        fallback={
          <div
            style={{
              padding: "var(--space-6)",
              "text-align": "center",
              color: "var(--text-muted)",
              "font-size": "var(--text-caption)",
            }}
          >
            暂无记录
          </div>
        }
      >
        <div
          style={{ display: "flex", "flex-direction": "column", gap: "8px" }}
        >
          <For each={props.contacts}>
            {(c) => {
              const content = (
                <div
                  style={{
                    display: "flex",
                    "align-items": "center",
                    gap: "var(--space-3)",
                    padding: "var(--space-3)",
                    background: "var(--surface-elevated)",
                    "border-radius": "var(--radius-md)",
                  }}
                >
                  <Avatar name={c.name || "?"} src={c.avatar} size={40} />
                  <div style={{ flex: 1, "min-width": 0 }}>
                    <div
                      style={{
                        "font-weight": "700",
                        "font-size": "var(--text-body-sm)",
                        "white-space": "nowrap",
                        overflow: "hidden",
                        "text-overflow": "ellipsis",
                      }}
                    >
                      {c.name || "(unknown)"}
                    </div>
                    <div
                      style={{
                        "font-size": "var(--text-micro)",
                        color: "var(--text-secondary)",
                        "white-space": "nowrap",
                        overflow: "hidden",
                        "text-overflow": "ellipsis",
                      }}
                    >
                      {c.emails[0]?.value ?? "(no email)"}
                    </div>
                  </div>
                  <button
                    onClick={() => props.onAction(c)}
                    style={{
                      padding: "4px 10px",
                      background: "transparent",
                      border: `1px solid ${props.color}`,
                      color: props.color,
                      "border-radius": "var(--radius-md)",
                      "font-size": "var(--text-micro)",
                      "font-weight": "700",
                      cursor: "pointer",
                    }}
                  >
                    {props.actionLabel}
                  </button>
                </div>
              );
              const isBlockAction = props.actionLabel === "屏蔽";
              return (
                <SwipeActions
                  style={{ "border-radius": "var(--radius-md)" }}
                  leftAction={
                    isBlockAction
                      ? {
                          label: "Block",
                          icon: "ph-prohibit",
                          color: "red",
                          onClick: () => props.onAction(c),
                        }
                      : undefined
                  }
                  rightAction={
                    !isBlockAction
                      ? {
                          label: "Allow",
                          icon: "ph-check",
                          color: "blue",
                          onClick: () => props.onAction(c),
                        }
                      : undefined
                  }
                  disabled={!isMobile()}
                >
                  {content}
                </SwipeActions>
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  );
}
