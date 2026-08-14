/** Spam view — filtered. */

import { Show, createResource, onCleanup } from "solid-js";
import { VList, type VListHandle } from "virtua/solid";
import {
  listContacts,
  moveMessageToBucket,
  deleteMessage,
} from "../stores/data";
import { usePaginatedMessages } from "../utils/paginated-messages";
import { Avatar } from "../components/Avatar";
import { Empty } from "../components/Empty";
import { Icon } from "../components/Icon";
import { showToast } from "../stores/ui";
import { addDays, daysUntil } from "../utils/date";
import { useRefreshEffect } from "../utils/gestures";
import { registerPrepend } from "../services/sync-events";

export function Spam() {
  const [contacts] = createResource(listContacts);

  const paged = usePaginatedMessages({ bucket: "spam" });
  const items = paged.items;
  const refresh = paged.refresh;

  onCleanup(
    registerPrepend("spam", (ids) => {
      void paged.prependByIds(ids);
    }),
  );

  useRefreshEffect(() => {
    void refresh();
  });

  const contactById = (id: string) => contacts()?.find((c) => c.id === id);

  const notSpam = async (id: string) => {
    await moveMessageToBucket(id, "imbox");
    await refresh();
    showToast({ message: "已恢复到 Imbox", kind: "success" });
  };

  const purge = async (id: string) => {
    await deleteMessage(id);
    await refresh();
    showToast({ message: "已删除", kind: "info" });
  };

  let listRef: VListHandle | undefined;
  const loadMoreIfNearEnd = (offset: number) => {
    const handle = listRef;
    if (!handle || !paged.hasMore() || paged.loadingMore()) return;
    const remaining = handle.scrollSize - (offset + handle.viewportSize);
    if (remaining < 800) void paged.loadMore();
  };

  return (
    <div
      style={{
        padding: "var(--space-5)",
        animation: "view-enter 0.3s var(--ease-out) both",
        height: "100%",
        display: "flex",
        "flex-direction": "column",
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
          {paged.hasMore() ? ` · ${items().length}/${paged.total()}` : ""}
        </p>
      </header>

      <Show when={items().length > 0} fallback={<EmptyState />}>
        <div
          style={{
            "max-width": "720px",
            width: "100%",
            margin: "0 auto",
            flex: 1,
            "min-height": 0,
          }}
        >
          <VList
            ref={(h) => (listRef = (h ?? undefined) as VListHandle | undefined)}
            data={items()}
            onScroll={loadMoreIfNearEnd}
            style={{ height: "100%" }}
          >
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
          </VList>
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
