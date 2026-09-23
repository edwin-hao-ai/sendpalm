/** Spam view — filtered. */

import { Show, createResource, createSignal, onCleanup } from "solid-js";
import { VList, type VListHandle } from "virtua/solid";
import {
  listContacts,
  moveMessageToBucket,
  deleteMessage,
  upsertContact,
} from "../stores/data";
import { usePaginatedMessages } from "../utils/paginated-messages";
import { Avatar } from "../components/Avatar";
import { Empty, ErrorState } from "../components/Empty";
import { Icon } from "../components/Icon";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { SkeletonList } from "../components/Skeleton";
import { setDetailOpen, setSelectedMessageId, showToast } from "../stores/ui";
import { addDays, daysUntil } from "../utils/date";
import { useRefreshEffect } from "../utils/gestures";
import { registerPrepend } from "../services/sync-events";

function spamCountdown(deletedAt: string): string {
  const deleted = new Date(deletedAt);
  if (Number.isNaN(deleted.getTime())) return "";
  const days = daysUntil(addDays(deleted, 30).toISOString());
  if (days === null) return "";
  const clamped = Math.min(30, days);
  return clamped <= 0 ? "今天过后自动删除" : `${clamped} 天后自动删除`;
}

export function Spam() {
  const [contacts, { refetch: refetchContacts }] = createResource(listContacts);

  const paged = usePaginatedMessages({ bucket: "spam" });
  const items = paged.items;
  const refresh = paged.refresh;

  const [purgeTarget, setPurgeTarget] = createSignal<string | null>(null);
  const [restoringAll, setRestoringAll] = createSignal(false);

  onCleanup(
    registerPrepend("spam", (ids) => {
      void paged.prependByIds(ids);
    }),
  );

  useRefreshEffect(() => {
    void refresh();
  });

  const contactById = (id: string) => contacts()?.find((c) => c.id === id);

  /** Restore one message and hand the sender back to the Gate screener
   *  so the user can decide where their mail belongs. */
  const notSpam = async (id: string) => {
    const msg = items().find((m) => m.id === id);
    paged.removeByIds([id]);
    try {
      const sender = msg ? contactById(msg.pid) : undefined;
      if (sender) {
        await upsertContact({ ...sender, firstSeen: true, screened: false });
        void refetchContacts();
      }
      await moveMessageToBucket(id, "imbox");
      showToast({
        message: "已恢复，发件人已进入筛选台",
        kind: "success",
        action: {
          label: "撤销",
          run: async () => {
            await moveMessageToBucket(id, "spam");
            await refresh();
          },
        },
      });
    } catch (err) {
      await refresh();
      showToast({
        message: "恢复失败，请重试",
        kind: "error",
        source: "spam",
        detail: String(err),
      });
    }
  };

  const restoreAll = async () => {
    if (restoringAll()) return;
    setRestoringAll(true);
    const ids = items().map((m) => m.id);
    try {
      for (const id of ids) {
        const msg = items().find((m) => m.id === id);
        const sender = msg ? contactById(msg.pid) : undefined;
        if (sender) {
          await upsertContact({ ...sender, firstSeen: true, screened: false });
        }
        await moveMessageToBucket(id, "imbox");
      }
      void refetchContacts();
      await refresh();
      showToast({
        message: `已恢复 ${ids.length} 封邮件，发件人已进入筛选台`,
        kind: "success",
      });
    } catch (err) {
      await refresh();
      showToast({
        message: "批量恢复失败，请重试",
        kind: "error",
        source: "spam",
        detail: String(err),
      });
    } finally {
      setRestoringAll(false);
    }
  };

  const purge = async (id: string) => {
    paged.removeByIds([id]);
    try {
      await deleteMessage(id);
      showToast({ message: "已永久删除", kind: "info" });
    } catch (err) {
      await refresh();
      showToast({
        message: "删除失败，请重试",
        kind: "error",
        source: "spam",
        detail: String(err),
      });
    }
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
      <Show
        when={!paged.resource.error}
        fallback={
          <ErrorState
            title="垃圾邮件加载失败"
            message="请检查网络后重试。"
            retry={() => void paged.refresh()}
          />
        }
      >
        <header
          style={{
            display: "flex",
            "align-items": "flex-end",
            gap: "var(--space-4)",
            "flex-wrap": "wrap",
            "max-width": "720px",
            width: "100%",
            margin: "0 auto var(--space-5)",
          }}
        >
          <div style={{ flex: 1, "min-width": 0 }}>
            <h1
              style={{
                "font-family": "var(--font-display)",
                "font-size": "var(--text-h1)",
                "font-weight": "800",
                margin: 0,
                "margin-bottom": "var(--space-1)",
              }}
            >
              垃圾邮件
            </h1>
            <p
              style={{
                color: "var(--text-secondary)",
                margin: 0,
                "font-size": "var(--text-caption)",
              }}
            >
              误判的邮件可以恢复，恢复后该发件人将重新进入筛选台。
              {paged.hasMore() ? ` · ${items().length}/${paged.total()}` : ""}
            </p>
          </div>
          <Show when={items().length > 0}>
            <button
              onClick={() => void restoreAll()}
              disabled={restoringAll()}
              style={{
                padding: "8px 16px",
                "border-radius": "var(--radius-pill)",
                background: "var(--palm-soft)",
                color: "var(--palm)",
                "font-size": "var(--text-caption)",
                "font-weight": "700",
                border: "none",
                cursor: "pointer",
                opacity: restoringAll() ? 0.5 : 1,
              }}
            >
              {restoringAll()
                ? "正在恢复…"
                : `全部恢复（${paged.total()}）`}
            </button>
          </Show>
        </header>

        <Show
          when={paged.resource.state !== "pending"}
          fallback={
            <div
              style={{
                "max-width": "720px",
                width: "100%",
                margin: "0 auto",
              }}
            >
              <SkeletonList count={6} height={64} />
            </div>
          }
        >
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
                ref={(h) =>
                  (listRef = (h ?? undefined) as VListHandle | undefined)
                }
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
                        "align-items": "center",
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
                        <strong>{c?.name ?? "未知发件人"}</strong>
                        <p
                          style={{
                            margin: "2px 0 0",
                            color: "var(--text-muted)",
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
                            {spamCountdown(m.deletedAt!)}
                          </span>
                        </Show>
                      </div>
                      <button
                        onClick={() => void notSpam(m.id)}
                        style={{
                          padding: "6px 14px",
                          "border-radius": "var(--radius-pill)",
                          background: "var(--palm-soft)",
                          color: "var(--palm)",
                          "font-size": "var(--text-caption)",
                          "font-weight": "700",
                          cursor: "pointer",
                          "white-space": "nowrap",
                        }}
                      >
                        不是垃圾邮件
                      </button>
                      <button
                        onClick={() => setPurgeTarget(m.id)}
                        title="永久删除"
                        aria-label="永久删除"
                        style={{
                          color: "var(--text-muted)",
                          padding: "10px",
                          cursor: "pointer",
                        }}
                      >
                        <Icon name="ph-trash" size={16} />
                      </button>
                    </div>
                  );
                }}
              </VList>
            </div>
          </Show>
        </Show>
      </Show>

      <ConfirmDialog
        open={purgeTarget() !== null}
        title="永久删除这封邮件？"
        body="此操作无法撤销。"
        confirmLabel="永久删除"
        onConfirm={() => {
          const id = purgeTarget();
          if (id) void purge(id);
        }}
        onCancel={() => setPurgeTarget(null)}
      />
    </div>
  );
}

function EmptyState() {
  return (
    <Empty
      icon="ph-shield"
      title="垃圾邮件是空的"
      description="系统识别的垃圾邮件会放在这里，30 天后自动删除。"
    />
  );
}
