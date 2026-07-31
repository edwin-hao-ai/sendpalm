/** Stream view — newsletters, casual reads. Scannable list, no read/unread. */

import { For, Show, createMemo, createResource } from "solid-js";
import { listContacts, listMessages } from "../stores/data";
import type { Contact, Message } from "../types";
import { setDetailOpen, setSelectedMessageId } from "../stores/ui";
import { Avatar } from "../components/Avatar";
import { Empty } from "../components/Empty";

export function Stream() {
  const [contacts] = createResource(listContacts);
  const [messages] = createResource(listMessages);

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

  return (
    <div style={{ animation: "view-enter 0.3s var(--ease-out) both" }}>
      <SectionHeader
        title="The Stream"
        subtitle="订阅邮件、长文慢慢看。没有已读/未读，光滑滚动。"
      />
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
                <article
                  onClick={() => open(m.id)}
                  style={{
                    padding: "var(--space-5) var(--space-4)",
                    "border-bottom": "0.5px solid var(--border)",
                    cursor: "pointer",
                    "border-radius": "var(--radius-lg)",
                    transition: "background var(--duration-fast) var(--ease-out)",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--paper-mid)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <div style={{ display: "flex", gap: "var(--space-3)", "align-items": "center", "margin-bottom": "var(--space-3)" }}>
                    <Avatar name={c?.name ?? "Newsletter"} src={c?.avatar} size={40} />
                    <div>
                      <strong style={{ "font-weight": "700" }}>{c?.name ?? "Newsletter"}</strong>
                      <div style={{ "font-size": "var(--text-micro)", color: "var(--text-muted)" }}>
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
              );
            }}
          </For>
        </div>
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
        <p style={{ color: "var(--text-secondary)", margin: 0, "font-size": "var(--text-caption)" }}>
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