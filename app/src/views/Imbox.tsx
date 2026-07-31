/** Imbox view — main workhorse. M1 builds this out fully.
 * For now: a real, functional list rendering of the seed data so the app boots
 * with a usable Imbox. Subsequent milestones will add bundles, piles, full
 * keyboard nav, etc.
 */

import { For, Show, createMemo, createResource } from "solid-js";
import { listMessages, listContacts } from "../stores/data";
import type { Message } from "../types";
import {
  setDetailOpen,
  setSelectedMessageId,
  selectedMessageId,
  setComposeOpen,
  showToast,
} from "../stores/ui";
import { Avatar } from "../components/Avatar";
import { Icon } from "../components/Icon";
import { Empty } from "../components/Empty";

export function Imbox() {
  const [contacts] = createResource(listContacts);
  const [messages] = createResource(listMessages);

  const imboxMessages = createMemo(() => {
    return (messages() ?? [])
      .filter((m) => m.bucket === "imbox")
      .filter((m) => !m.setAside && !m.replyLater);
  });

  const newForYou = createMemo(() => imboxMessages().filter((m) => m.unread));
  const previouslySeen = createMemo(() => imboxMessages().filter((m) => !m.unread));

  const replyLater = createMemo(() => (messages() ?? []).filter((m) => m.replyLater));
  const setAside = createMemo(() => (messages() ?? []).filter((m) => m.setAside));
  const reminded = createMemo(() => (messages() ?? []).filter((m) => m.bubbleUpAt));

  const contactName = (id: string) =>
    contacts()?.find((c) => c.id === id)?.name ?? "Unknown";
  const contactAvatar = (id: string) =>
    contacts()?.find((c) => c.id === id)?.avatar ?? "";

  const open = (id: string) => {
    setSelectedMessageId(id);
    setDetailOpen(true);
  };

  const reply = (m: Message) => {
    const c = contacts()?.find((x) => x.id === m.pid);
    setComposeOpen(true);
    showToast({ message: `Reply to ${c?.name ?? m.pid}`, kind: "info" });
  };

  return (
    <div style={{ padding: "0", animation: "view-enter 0.3s var(--ease-out) both" }}>
      <SectionHeader title="New for you" count={newForYou().length} />
      <Show when={newForYou().length > 0} fallback={<EmptyState />}>
        <FeedList
          items={newForYou()}
          contactName={contactName}
          contactAvatar={contactAvatar}
          onOpen={open}
          onReply={reply}
        />
      </Show>

      <Show when={previouslySeen().length > 0}>
        <SectionHeader title="Previously seen" count={previouslySeen().length} />
        <FeedList
          items={previouslySeen()}
          contactName={contactName}
          contactAvatar={contactAvatar}
          onOpen={open}
          onReply={reply}
        />
      </Show>

      <Show when={replyLater().length + setAside().length + reminded().length > 0}>
        <SectionHeader title="Piles" />
        <Piles
          replyLater={replyLater().length}
          setAside={setAside().length}
          reminded={reminded().length}
        />
      </Show>
    </div>
  );
}

function SectionHeader(props: { title: string; count?: number }) {
  return (
    <div
      style={{
        display: "flex",
        "align-items": "baseline",
        gap: "var(--space-2)",
        padding: "var(--space-4) var(--space-5) var(--space-2)",
        "font-family": "var(--font-display)",
        "font-size": "var(--text-h4)",
        "font-weight": "800",
        color: "var(--text-primary)",
      }}
    >
      {props.title}
      {props.count !== undefined && (
        <span
          style={{
            "font-family": "var(--font-body)",
            "font-size": "var(--text-caption)",
            color: "var(--text-muted)",
            "font-weight": "500",
          }}
        >
          {props.count}
        </span>
      )}
    </div>
  );
}

function FeedList(props: {
  items: Message[];
  contactName: (id: string) => string;
  contactAvatar: (id: string) => string;
  onOpen: (id: string) => void;
  onReply: (m: Message) => void;
}) {
  return (
    <ul
      style={{
        "list-style": "none",
        margin: 0,
        padding: "0 var(--space-5)",
        "max-width": "var(--max-content, 720px)",
      }}
    >
      <For each={props.items}>
        {(m) => (
          <li
            onClick={() => props.onOpen(m.id)}
            style={{
              display: "flex",
              gap: "var(--space-3)",
              padding: "var(--space-3) var(--space-3)",
              "border-bottom": "0.5px solid var(--border)",
              cursor: "pointer",
              position: "relative",
              background:
                m.id === selectedMessageId() ? "var(--palm-soft)" : "transparent",
              transition: "background var(--duration-fast) var(--ease-out)",
            }}
            onMouseEnter={(e) => {
              if (m.id !== selectedMessageId())
                e.currentTarget.style.background = "rgba(35,28,51,0.03)";
            }}
            onMouseLeave={(e) => {
              if (m.id !== selectedMessageId())
                e.currentTarget.style.background = "transparent";
            }}
          >
            <Show when={m.unread}>
              <div
                aria-hidden="true"
                style={{
                  position: "absolute",
                  left: "var(--space-2)",
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: "6px",
                  height: "6px",
                  "border-radius": "50%",
                  background: "var(--palm)",
                }}
              />
            </Show>
            <div style={{ "margin-left": m.unread ? "var(--space-3)" : 0, "flex-shrink": 0 }}>
              <Avatar name={props.contactName(m.pid)} src={props.contactAvatar(m.pid)} size={36} />
            </div>
            <div style={{ flex: 1, "min-width": 0 }}>
              <div
                style={{
                  display: "flex",
                  "align-items": "baseline",
                  gap: "var(--space-2)",
                }}
              >
                <strong
                  style={{
                    "font-weight": m.unread ? "700" : "500",
                    color: "var(--text-primary)",
                    "white-space": "nowrap",
                    overflow: "hidden",
                    "text-overflow": "ellipsis",
                  }}
                >
                  {props.contactName(m.pid)}
                </strong>
                <span
                  style={{
                    "font-size": "var(--text-micro)",
                    color: "var(--text-muted)",
                    "margin-left": "auto",
                    "white-space": "nowrap",
                  }}
                >
                  {m.tm}
                </span>
              </div>
              <div
                style={{
                  "font-size": "var(--text-body-sm)",
                  color: m.unread ? "var(--text-primary)" : "var(--text-secondary)",
                  "white-space": "nowrap",
                  overflow: "hidden",
                  "text-overflow": "ellipsis",
                  "margin-top": "2px",
                }}
              >
                <strong style={{ "font-weight": m.unread ? "700" : "500" }}>{m.subj}</strong>
                <span style={{ color: "var(--text-muted)", "margin-left": "6px" }}>— {m.prev}</span>
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                props.onReply(m);
              }}
              title="Reply"
              aria-label="Reply"
              style={{
                "align-self": "center",
                color: "var(--text-muted)",
                padding: "6px",
                "border-radius": "var(--radius-pill)",
                opacity: 0,
              }}
              class="feed-card-actions"
            >
              <Icon name="ph-arrow-u-up-left" size={16} />
            </button>
          </li>
        )}
      </For>
    </ul>
  );
}

function EmptyState() {
  return (
    <Empty
      icon="ph-tray"
      title="Inbox zero"
      description="没有新消息。给自己倒杯咖啡，或者看看 Records。"
    />
  );
}

function Piles(props: { replyLater: number; setAside: number; reminded: number }) {
  return (
    <div
      style={{
        display: "flex",
        gap: "var(--space-3)",
        padding: "var(--space-4) var(--space-5)",
      }}
    >
      <Pile icon="ph-clock" label="Reply Later" count={props.replyLater} />
      <Pile icon="ph-push-pin" label="Set Aside" count={props.setAside} />
      <Pile icon="ph-arrow-fat-line-up" label="Remind" count={props.reminded} />
    </div>
  );
}

function Pile(props: { icon: string; label: string; count: number }) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        "align-items": "center",
        gap: "var(--space-3)",
        padding: "var(--space-3) var(--space-4)",
        background: "var(--paper-mid)",
        "border-radius": "var(--radius-lg)",
        border: "0.5px solid var(--border)",
      }}
    >
      <Icon name={props.icon} size={20} />
      <span style={{ flex: 1, "font-weight": "600" }}>{props.label}</span>
      <span style={{ color: "var(--text-muted)", "font-size": "var(--text-caption)" }}>
        {props.count}
      </span>
    </div>
  );
}