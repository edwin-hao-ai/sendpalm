/** Trash — recoverable for 30 days. */

import { For, Show, createMemo, createResource } from "solid-js";
import {
  listContacts,
  listMessages,
  moveMessageToBucket,
  deleteMessage,
  emptyTrash,
} from "../stores/data";
import { Avatar } from "../components/Avatar";
import { Empty } from "../components/Empty";
import { Icon } from "../components/Icon";
import { setDetailOpen, setSelectedMessageId, showToast } from "../stores/ui";
import { addDays, daysUntil } from "../utils/date";
import { useRefreshEffect } from "../utils/gestures";

export function Trash() {
  const [contacts] = createResource(listContacts);
  const [messages, { refetch }] = createResource(listMessages);

  useRefreshEffect(() => {
    void refetch();
  });

  const items = createMemo(() => {
    return (messages() ?? [])
      .filter((m) => m.bucket === "trash")
      .sort((a, b) => new Date(b.st).getTime() - new Date(a.st).getTime());
  });

  const contactById = (id: string) => contacts()?.find((c) => c.id === id);

  const restore = async (id: string) => {
    await moveMessageToBucket(id, "imbox");
    await refetch();
    showToast({ message: "已恢复到 Imbox", kind: "success" });
  };

  const purge = async (id: string) => {
    await deleteMessage(id);
    await refetch();
    showToast({ message: "已永久删除", kind: "info" });
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
          Trash
        </h2>
        <p
          style={{
            color: "var(--text-secondary)",
            margin: 0,
            "font-size": "var(--text-caption)",
          }}
        >
          删除的邮件 30 天内可恢复。过期后自动清理。
        </p>
        <Show when={items().length > 0}>
          <button
            onClick={async () => {
              const count = await emptyTrash();
              await refetch();
              showToast({
                message: `已清空 Trash（${count} 封邮件）`,
                kind: "info",
              });
            }}
            style={{
              "margin-top": "var(--space-3)",
              padding: "8px 16px",
              "border-radius": "var(--radius-pill)",
              background: "var(--ruby-soft)",
              color: "var(--ruby)",
              "font-size": "var(--text-caption)",
              "font-weight": "700",
              border: "none",
              cursor: "pointer",
            }}
          >
            清空 Trash
          </button>
        </Show>
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
                  }}
                >
                  <Avatar name={c?.name ?? "?"} src={c?.avatar} size={32} />
                  <div
                    onClick={() => {
                      setSelectedMessageId(m.id);
                      setDetailOpen(true);
                    }}
                    style={{ flex: 1, "min-width": 0, cursor: "pointer" }}
                  >
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
                        天后永久删除
                      </span>
                    </Show>
                  </div>
                  <button
                    onClick={() => restore(m.id)}
                    style={{
                      padding: "6px 12px",
                      "border-radius": "var(--radius-pill)",
                      background: "var(--palm-soft)",
                      color: "var(--palm)",
                      "font-size": "var(--text-micro)",
                      "font-weight": "700",
                    }}
                  >
                    Restore
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
      icon="ph-trash"
      title="Trash 是空的"
      description="没有可恢复的邮件。"
    />
  );
}
