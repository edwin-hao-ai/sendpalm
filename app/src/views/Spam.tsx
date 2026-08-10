/** Spam view — filtered. */

import { For, Show, createMemo, createResource } from "solid-js";
import {
  listContacts,
  listMessages,
  moveMessageToBucket,
  deleteMessage,
} from "../stores/data";
import { Avatar } from "../components/Avatar";
import { Empty } from "../components/Empty";
import { Icon } from "../components/Icon";
import { showToast } from "../stores/ui";
import { addDays, daysUntil } from "../utils/date";
import { useRefreshEffect } from "../utils/gestures";

export function Spam() {
  const [contacts] = createResource(listContacts);
  const [messages, { refetch }] = createResource(listMessages);

  useRefreshEffect(() => {
    void refetch();
  });

  const items = createMemo(() => {
    return (messages() ?? [])
      .filter((m) => m.bucket === "spam")
      .sort((a, b) => new Date(b.st).getTime() - new Date(a.st).getTime());
  });

  const contactById = (id: string) => contacts()?.find((c) => c.id === id);

  const notSpam = async (id: string) => {
    await moveMessageToBucket(id, "imbox");
    await refetch();
    showToast({ message: "已恢复到 Imbox", kind: "success" });
  };

  const purge = async (id: string) => {
    await deleteMessage(id);
    await refetch();
    showToast({ message: "已删除", kind: "info" });
  };

  return (
    <div
      style={{
        padding: "var(--space-5)",
        animation: "view-enter 0.3s var(--ease-out) both",
      }}
    >
      <header
        style={{ "text-align": "center", "margin-bottom": "var(--space-5)" }}
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
          Spam
        </h2>
        <p
          style={{
            color: "var(--text-secondary)",
            margin: 0,
            "font-size": "var(--text-caption)",
          }}
        >
          系统识别的垃圾邮件。误判可恢复。
        </p>
      </header>

      <Show when={items().length > 0} fallback={<EmptyState />}>
        <div style={{ "max-width": "720px", margin: "0 auto" }}>
          <For each={items()}>
            {(m) => {
              const c = contactById(m.pid);
              return (
                <div
                  style={{
                    display: "flex",
                    gap: "var(--space-3)",
                    padding: "var(--space-3) 0",
                    "border-bottom": "0.5px solid var(--border)",
                    opacity: 0.7,
                  }}
                >
                  <Avatar name={c?.name ?? "?"} src={c?.avatar} size={32} />
                  <div style={{ flex: 1, "min-width": 0 }}>
                    <strong>{c?.name ?? "Unknown"}</strong>
                    <p
                      style={{
                        margin: "2px 0 0",
                        color: "var(--text-secondary)",
                        "font-size": "var(--text-caption)",
                      }}
                    >
                      {m.subj}
                    </p>
                    <Show when={m.deletedAt}>
                      <span
                        style={{
                          "font-size": "var(--text-micro)",
                          color: "var(--text-muted)",
                        }}
                      >
                        {daysUntil(
                          addDays(new Date(m.deletedAt!), 30).toISOString(),
                        )}{" "}
                        天后自动删除
                      </span>
                    </Show>
                  </div>
                  <button
                    onClick={() => notSpam(m.id)}
                    style={{
                      padding: "6px 12px",
                      "border-radius": "var(--radius-pill)",
                      background: "var(--palm-soft)",
                      color: "var(--palm)",
                      "font-size": "var(--text-micro)",
                      "font-weight": "700",
                    }}
                  >
                    Not spam
                  </button>
                  <button
                    onClick={() => purge(m.id)}
                    title="Delete forever"
                    aria-label="Delete forever"
                    style={{ color: "var(--text-muted)", padding: "6px" }}
                  >
                    <Icon name="ph-trash" size={16} />
                  </button>
                </div>
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  );
}

function EmptyState() {
  return (
    <Empty
      icon="ph-shield"
      title="Spam 是空的"
      description="目前没有标记为垃圾的邮件。"
    />
  );
}
