/** Trash — recoverable for 30 days. */

import { Show, createResource, createSignal, onCleanup } from "solid-js";
import { VList, type VListHandle } from "virtua/solid";
import {
  listContacts,
  moveMessageToBucket,
  deleteMessage,
  emptyTrash,
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

/** Policy: a trashed message is permanently purged 30 days after
 *  `deletedAt`. `daysUntil` ceilings partial days, so a message deleted
 *  minutes ago would otherwise read "31 天后" once the clock rolls past
 *  the deleted-at time-of-day — clamp to the policy window. */
export const TRASH_RETENTION_DAYS = 30;

export function purgeCountdown(
  deletedAt: string,
  now: Date = new Date(),
): string {
  const deleted = new Date(deletedAt);
  if (Number.isNaN(deleted.getTime())) return "即将自动永久删除";
  const days = daysUntil(
    addDays(deleted, TRASH_RETENTION_DAYS).toISOString(),
    now,
  );
  if (days === null) return "即将自动永久删除";
  const clamped = Math.min(TRASH_RETENTION_DAYS, days);
  return clamped <= 0 ? "今天过后永久删除" : `${clamped} 天后永久删除`;
}

export function Trash() {
  const [contacts] = createResource(listContacts);

  const paged = usePaginatedMessages({ bucket: "trash" });
  const items = paged.items;
  const refresh = paged.refresh;

  const [confirmEmpty, setConfirmEmpty] = createSignal(false);
  const [emptying, setEmptying] = createSignal(false);
  const [purgeTarget, setPurgeTarget] = createSignal<string | null>(null);

  onCleanup(
    registerPrepend("trash", (ids) => {
      void paged.prependByIds(ids);
    }),
  );

  useRefreshEffect(() => {
    void refresh();
  });

  const contactById = (id: string) => contacts()?.find((c) => c.id === id);

  const restore = async (id: string) => {
    paged.removeByIds([id]);
    try {
      await moveMessageToBucket(id, "imbox");
      showToast({
        message: "已恢复到 Imbox",
        kind: "success",
        action: {
          label: "撤销",
          run: async () => {
            await moveMessageToBucket(id, "trash");
            await refresh();
          },
        },
      });
    } catch (err) {
      await refresh();
      showToast({
        message: "恢复失败，请重试",
        kind: "error",
        source: "trash",
        detail: String(err),
      });
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
        source: "trash",
        detail: String(err),
      });
    }
  };

  const emptyAll = async () => {
    if (emptying()) return;
    setEmptying(true);
    try {
      const count = await emptyTrash();
      await refresh();
      showToast({
        message: `已清空回收站（${count} 封邮件）`,
        kind: "info",
      });
    } catch (err) {
      showToast({
        message: "清空失败，请重试",
        kind: "error",
        source: "trash",
        detail: String(err),
      });
    } finally {
      setEmptying(false);
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
            title="回收站加载失败"
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
            "margin-bottom": "var(--space-5)",
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
              回收站
            </h1>
            <p
              style={{
                color: "var(--text-secondary)",
                margin: 0,
                "font-size": "var(--text-caption)",
              }}
            >
              删除的邮件会保留 30 天，过期后自动清理。
              {paged.hasMore() ? ` · ${items().length}/${paged.total()}` : ""}
            </p>
          </div>
          <Show when={items().length > 0}>
            <button
              onClick={() => setConfirmEmpty(true)}
              disabled={emptying()}
              style={{
                padding: "8px 16px",
                "border-radius": "var(--radius-pill)",
                background: "transparent",
                border: "1px solid var(--status-danger)",
                color: "var(--status-danger)",
                "font-size": "var(--text-caption)",
                "font-weight": "700",
                cursor: "pointer",
                opacity: emptying() ? 0.5 : 1,
              }}
            >
              {emptying() ? "正在清空…" : "清空回收站"}
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
                            {purgeCountdown(m.deletedAt!)}
                          </span>
                        </Show>
                      </div>
                      <button
                        onClick={() => restore(m.id)}
                        style={{
                          padding: "6px 14px",
                          "border-radius": "var(--radius-pill)",
                          background: "var(--palm-soft)",
                          color: "var(--palm)",
                          "font-size": "var(--text-caption)",
                          "font-weight": "700",
                          cursor: "pointer",
                        }}
                      >
                        恢复
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
        open={confirmEmpty()}
        title="清空回收站？"
        body={`将永久删除 ${items().length} 封邮件，此操作无法撤销。`}
        confirmLabel="永久删除全部"
        onConfirm={() => void emptyAll()}
        onCancel={() => setConfirmEmpty(false)}
      />
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
      icon="ph-trash"
      title="回收站是空的"
      description="删除的邮件会在这里保留 30 天。"
    />
  );
}
