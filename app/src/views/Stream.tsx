/** Stream view — newsletters, casual reads. Scannable list, no read/unread. */

import { For, Show, createMemo, createResource } from "solid-js";
import { listContacts, listMessages } from "../stores/data";
import type { Contact, Message } from "../types";
import { setDetailOpen, setSelectedMessageId } from "../stores/ui";
import { Avatar } from "../components/Avatar";
import { Empty } from "../components/Empty";
import { SkeletonList } from "../components/Skeleton";
import { useRefreshEffect, useViewport } from "../utils/gestures";
import { SwipeActions } from "../components/SwipeActions";
import { upsertMessage } from "../stores/data";
import { showToast } from "../stores/ui";

export function Stream() {
  const [contacts] = createResource(listContacts);
  const [messages, { refetch: refetchMessages }] = createResource(listMessages);
  const { isMobile } = useViewport();

  useRefreshEffect(() => {
    void refetchMessages();
  });

  const items = createMemo<Message[]>(() => {
    return (messages() ?? [])
      .filter((m) => m.bucket === "feed")
      .sort((a, b) => new Date(b.st).getTime() - new Date(a.st).getTime());
  });

  const contactById = (id: string): Contact | undefined =>
    contacts()?.find((c) => c.id === id);

  const open = (id: string) => {
    setSelectedMessageId(id);
    setDetailOpen(true);
  };

  const setAside = async (m: Message) => {
    await upsertMessage({ ...m, setAside: true });
    await refetchMessages();
    showToast({ message: "已 Set Aside", kind: "success" });
  };

  const replyLater = async (m: Message) => {
    await upsertMessage({ ...m, replyLater: true });
    await refetchMessages();
    showToast({ message: "已 Reply Later", kind: "success" });
  };

  return (
    <div style={{ animation: "view-enter 0.3s var(--ease-out) both" }}>
      <SectionHeader
        title="The Stream"
        subtitle="订阅邮件、长文慢慢看。没有已读/未读，光滑滚动。"
      />
      <Show
        when={messages.state !== "pending"}
        fallback={
          <div
            style={{
              "max-width": "720px",
              margin: "var(--space-4) auto",
              padding: "0 var(--space-5)",
            }}
          >
            <SkeletonList count={8} />
          </div>
        }
      >
        <Show when={items().length > 0} fallback={<EmptyState />}>
          <div
            style={{
              "max-width": "720px",
              margin: "0 auto",
              padding: "0 var(--space-5)",
            }}
          >
            <For each={items()}>
              {(m) => {
                const c = contactById(m.pid);
                return (
                  <SwipeActions
                    role="listitem"
                    style={{
                      "border-radius": "var(--radius-lg)",
                      "border-bottom": "0.5px solid var(--border)",
                    }}
                    leftAction={{
                      label: "Set Aside",
                      icon: "ph-push-pin",
                      color: "green",
                      onClick: () => void setAside(m),
                    }}
                    rightAction={{
                      label: "Reply Later",
                      icon: "ph-clock",
                      color: "yellow",
                      onClick: () => void replyLater(m),
                    }}
                    disabled={!isMobile()}
                  >
                    <article
                      onClick={() => open(m.id)}
                      style={{
                        padding: "var(--space-5) var(--space-4)",
                        cursor: "pointer",
                        transition:
                          "background var(--duration-fast) var(--ease-out)",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background = "var(--paper-mid)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = "transparent")
                      }
                    >
                      <div
                        style={{
                          display: "flex",
                          gap: "var(--space-3)",
                          "align-items": "center",
                          "margin-bottom": "var(--space-3)",
                        }}
                      >
                        <Avatar
                          name={c?.name ?? "Newsletter"}
                          src={c?.avatar}
                          size={40}
                        />
                        <div>
                          <strong style={{ "font-weight": "700" }}>
                            {c?.name ?? "Newsletter"}
                          </strong>
                          <div
                            style={{
                              "font-size": "var(--text-micro)",
                              color: "var(--text-muted)",
                            }}
                          >
                            {m.tm}
                          </div>
                        </div>
                      </div>
                      <h3
                        style={{
                          "font-family": "var(--font-display)",
                          "font-size": "var(--text-h4)",
                          "font-weight": "800",
                          margin: "0 0 var(--space-2)",
                        }}
                      >
                        {m.subj}
                      </h3>
                      <p
                        style={{
                          margin: 0,
                          color: "var(--text-secondary)",
                          "font-size": "var(--text-body-sm)",
                          "line-height": 1.5,
                        }}
                      >
                        {m.prev}
                      </p>
                    </article>
                  </SwipeActions>
                );
              }}
            </For>
          </div>
        </Show>
      </Show>
    </div>
  );
}

function SectionHeader(props: { title: string; subtitle?: string }) {
  return (
    <header
      style={{
        padding: "var(--space-6) var(--space-5) var(--space-3)",
        "text-align": "center",
      }}
    >
      <h2
        style={{
          "font-family": "var(--font-display)",
          "font-size": "var(--text-h3)",
          "font-weight": "800",
          margin: 0,
          "margin-bottom": "var(--space-1)",
        }}
      >
        {props.title}
      </h2>
      <Show when={props.subtitle}>
        <p
          style={{
            color: "var(--text-secondary)",
            margin: 0,
            "font-size": "var(--text-caption)",
          }}
        >
          {props.subtitle}
        </p>
      </Show>
    </header>
  );
}

function EmptyState() {
  return (
    <Empty
      icon="ph-newspaper"
      title="Stream 是空的"
      description="还没有订阅类邮件。等你的下一次签到。"
    />
  );
}
