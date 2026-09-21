/** Records view — receipts, transactions. Quiet auto-file. */

import { For, Show, createResource, createSignal, onCleanup } from "solid-js";
import { VList, type VListHandle } from "virtua/solid";
import { listContacts, listFiles, upsertMessage } from "../stores/data";
import { usePaginatedMessages } from "../utils/paginated-messages";
import { Avatar } from "../components/Avatar";
import { Empty, ErrorState } from "../components/Empty";
import { Icon } from "../components/Icon";
import {
  setDetailOpen,
  setSelectedMessageId,
  setSelectedFileId,
  setView,
  showToast,
} from "../stores/ui";
import { relativeTime } from "../utils/date";
import { useRefreshEffect, useViewport } from "../utils/gestures";
import { SwipeActions } from "../components/SwipeActions";
import type { Message } from "../types";
import { registerPrepend } from "../services/sync-events";

export function Records() {
  const [contacts] = createResource(listContacts);
  const [files, { refetch: refetchFiles }] = createResource(listFiles);
  const { isMobile } = useViewport();

  const paged = usePaginatedMessages({ bucket: "paperTrail" });
  const items = paged.items;
  const refresh = paged.refresh;

  onCleanup(
    registerPrepend("paperTrail", (ids) => {
      void paged.prependByIds(ids);
    }),
  );

  useRefreshEffect(() => {
    void refresh();
    void refetchFiles();
  });

  // Flag changes do not change the bucket — the row stays in Records and
  // the toast offers a jump to the pile where the flag surfaces.
  const setAside = async (m: Message) => {
    try {
      await upsertMessage({ ...m, setAside: true });
      paged.patchMessage(m.id, { setAside: true });
      showToast({
        message: "已搁置，仍保留在 Records 中",
        kind: "success",
        action: { label: "查看搁置堆", run: () => {
            setView("setAside");
          } },
      });
    } catch (err) {
      showToast({
        message: "操作失败，请重试",
        kind: "error",
        source: "records",
        detail: String(err),
      });
    }
  };

  const replyLater = async (m: Message) => {
    try {
      await upsertMessage({ ...m, replyLater: true });
      paged.patchMessage(m.id, { replyLater: true });
      showToast({
        message: "已加入稍后回复，仍保留在 Records 中",
        kind: "success",
        action: { label: "查看稍后回复", run: () => {
            setView("replyLater");
          } },
      });
    } catch (err) {
      showToast({
        message: "操作失败，请重试",
        kind: "error",
        source: "records",
        detail: String(err),
      });
    }
  };

  const contactById = (id: string) => contacts()?.find((c) => c.id === id);
  const filesByMsg = (m: { attachments: string[] }) =>
    (files() ?? []).filter((f) => m.attachments.includes(f.id));

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
            title="Records 加载失败"
            message="请检查网络后重试。"
            retry={() => void paged.refresh()}
          />
        }
      >
        <header
          style={{
            padding: "var(--space-6) var(--space-5) var(--space-3)",
            "text-align": "center",
          }}
        >
          <h1
            style={{
              "font-family": "var(--font-display)",
              "font-size": "var(--text-h1)",
              "font-weight": "800",
              margin: 0,
              "margin-bottom": "var(--space-1)",
            }}
          >
            Records
          </h1>
          <p
            style={{
              color: "var(--text-secondary)",
              margin: 0,
              "font-size": "var(--text-caption)",
            }}
          >
            发票 / 物流 / 系统通知。安静躺着，需要时随时搜。
            {paged.hasMore() ? ` · ${items().length}/${paged.total()}` : ""}
          </p>
        </header>

        <Show
          when={paged.resource.state !== "pending"}
          fallback={
            <div
              style={{
                "max-width": "720px",
                margin: "var(--space-4) auto",
                padding: "0 var(--space-5)",
                flex: 1,
              }}
            >
              <SkeletonRows />
            </div>
          }
        >
          <Show when={items().length > 0} fallback={<EmptyState />}>
            <div
              style={{
                "max-width": "720px",
                width: "100%",
                margin: "0 auto",
                padding: "0 var(--space-5) var(--space-5)",
                flex: 1,
                "min-height": 0,
                display: "flex",
                "flex-direction": "column",
              }}
            >
              <VList
                ref={(h) =>
                  (listRef = (h ?? undefined) as VListHandle | undefined)
                }
                data={items()}
                onScroll={loadMoreIfNearEnd}
                style={{ flex: 1, "min-height": 0 }}
              >
                {(m: Message) => (
                  <RecordRow
                    m={m}
                    contact={contactById(m.pid)}
                    attachments={filesByMsg(m)}
                    isMobile={isMobile()}
                    onSetAside={() => void setAside(m)}
                    onReplyLater={() => void replyLater(m)}
                  />
                )}
              </VList>
              <Show when={!paged.hasMore()}>
                <p
                  style={{
                    margin: 0,
                    padding: "var(--space-4) 0",
                    "text-align": "center",
                    "font-size": "var(--text-micro)",
                    color: "var(--text-muted)",
                  }}
                >
                  全部加载完毕 · 共 {paged.total()} 条
                </p>
              </Show>
            </div>
          </Show>
        </Show>
      </Show>
    </div>
  );
}

function RecordRow(props: {
  m: {
    id: string;
    subj: string;
    tm: string;
    st: string;
    body: string;
    attachments: string[];
  };
  contact?: { name: string; avatar: string };
  attachments: { id: string; name: string; type: string }[];
  isMobile: boolean;
  onSetAside: () => void;
  onReplyLater: () => void;
}) {
  const [hovered, setHovered] = createSignal(false);

  const openMessage = () => {
    setSelectedMessageId(props.m.id);
    setDetailOpen(true);
  };

  const content = (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ position: "relative" }}
    >
      <div
        onClick={openMessage}
        style={{
          display: "flex",
          gap: "var(--space-3)",
          padding: "var(--space-3) 0",
          cursor: "pointer",
        }}
      >
        <Avatar
          name={props.contact?.name ?? "Receipt"}
          src={props.contact?.avatar}
          size={32}
        />
        <div style={{ flex: 1, "min-width": 0 }}>
          <div
            style={{
              display: "flex",
              "align-items": "baseline",
              gap: "var(--space-2)",
            }}
          >
            <strong style={{ "font-weight": "600" }}>{props.m.subj}</strong>
            <span
              style={{
                "font-size": "var(--text-micro)",
                color: "var(--text-muted)",
                "margin-left": "auto",
                visibility:
                  hovered() && !props.isMobile ? "hidden" : "visible",
                "white-space": "nowrap",
              }}
            >
              {relativeTime(props.m.st)}
            </span>
          </div>
          <p
            style={{
              margin: "2px 0 0",
              color: "var(--text-secondary)",
              "font-size": "var(--text-caption)",
              "white-space": "nowrap",
              overflow: "hidden",
              "text-overflow": "ellipsis",
            }}
          >
            {props.m.body}
          </p>
          <Show when={props.attachments.length > 0}>
            <div
              style={{
                display: "flex",
                gap: "var(--space-2)",
                "margin-top": "var(--space-2)",
                "flex-wrap": "wrap",
              }}
            >
              <For each={props.attachments}>
                {(f) => (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedFileId(f.id);
                      setDetailOpen(true);
                    }}
                    style={{
                      display: "inline-flex",
                      "align-items": "center",
                      gap: "4px",
                      padding: "3px 10px",
                      background: "var(--paper-mid)",
                      "border-radius": "var(--radius-pill)",
                      "font-size": "var(--text-micro)",
                      color: "var(--text-secondary)",
                      "font-weight": "600",
                    }}
                  >
                    <Icon name="ph-paperclip" size={11} />
                    {f.name}
                  </button>
                )}
              </For>
            </div>
          </Show>
        </div>
      </div>
      <Show when={hovered() && !props.isMobile}>
        <div
          style={{
            position: "absolute",
            top: "var(--space-3)",
            right: 0,
            display: "flex",
            gap: "var(--space-1)",
            background: "var(--paper-light)",
            "border-radius": "var(--radius-pill)",
            "box-shadow": "var(--shadow-md)",
            padding: "2px",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={props.onReplyLater}
            title="稍后回复"
            aria-label="稍后回复"
            style={hoverBtnStyle}
          >
            <Icon name="ph-clock" size={14} />
          </button>
          <button
            onClick={props.onSetAside}
            title="搁置"
            aria-label="搁置"
            style={hoverBtnStyle}
          >
            <Icon name="ph-push-pin" size={14} />
          </button>
        </div>
      </Show>
    </div>
  );

  return (
    <SwipeActions
      role="listitem"
      style={{ "border-bottom": "0.5px solid var(--border)" }}
      leftAction={{
        label: "搁置",
        icon: "ph-push-pin",
        color: "green",
        onClick: props.onSetAside,
      }}
      rightAction={{
        label: "稍后回复",
        icon: "ph-clock",
        color: "yellow",
        onClick: props.onReplyLater,
      }}
      disabled={!props.isMobile}
    >
      {content}
    </SwipeActions>
  );
}

const hoverBtnStyle = {
  width: "32px",
  height: "32px",
  display: "inline-flex",
  "align-items": "center",
  "justify-content": "center",
  "border-radius": "var(--radius-pill)",
  border: "none",
  background: "transparent",
  color: "var(--text-secondary)",
  cursor: "pointer",
} as const;

function EmptyState() {
  return (
    <Empty
      icon="ph-receipt"
      title="Records 是空的"
      description="发票、物流和系统通知会自动归档到这里。"
    />
  );
}

function SkeletonRows() {
  return (
    <div
      style={{
        display: "flex",
        "flex-direction": "column",
        gap: "var(--space-3)",
      }}
    >
      <For each={[0, 1, 2, 3, 4, 5]}>
        {() => (
          <div
            style={{
              display: "flex",
              gap: "var(--space-3)",
              padding: "var(--space-3) 0",
            }}
          >
            <div
              style={{
                width: "32px",
                height: "32px",
                "border-radius": "50%",
                background: "var(--paper-mid)",
              }}
            />
            <div style={{ flex: 1 }}>
              <div
                style={{
                  height: "12px",
                  width: "50%",
                  background: "var(--paper-mid)",
                  "border-radius": "4px",
                  "margin-bottom": "6px",
                }}
              />
              <div
                style={{
                  height: "10px",
                  width: "80%",
                  background: "var(--paper-mid)",
                  "border-radius": "4px",
                }}
              />
            </div>
          </div>
        )}
      </For>
    </div>
  );
}
