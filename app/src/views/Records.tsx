/** Records view — receipts, transactions. Quiet auto-file. */

import { For, Show, createResource, onCleanup } from "solid-js";
import { VList, type VListHandle } from "virtua/solid";
import {
  listContacts,
  listFiles,
  upsertMessage,
} from "../stores/data";
import { usePaginatedMessages } from "../utils/paginated-messages";
import { Avatar } from "../components/Avatar";
import { Empty } from "../components/Empty";
import { Icon } from "../components/Icon";
import {
  setDetailOpen,
  setSelectedMessageId,
  setSelectedFileId,
  showToast,
} from "../stores/ui";
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

  const setAside = async (m: Message) => {
    await upsertMessage({ ...m, setAside: true });
    await refresh();
    showToast({ message: "已 Set Aside", kind: "success" });
  };

  const replyLater = async (m: Message) => {
    await upsertMessage({ ...m, replyLater: true });
    await refresh();
    showToast({ message: "已 Reply Later", kind: "success" });
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
          Records
        </h2>
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
            }}
          >
            <VList
              ref={(h) => (listRef = (h ?? undefined) as VListHandle | undefined)}
              data={items()}
              onScroll={loadMoreIfNearEnd}
              style={{ height: "100%" }}
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
          </div>
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
    body: string;
    attachments: string[];
  };
  contact?: { name: string; avatar: string };
  attachments: { id: string; name: string; type: string }[];
  isMobile: boolean;
  onSetAside: () => void;
  onReplyLater: () => void;
}) {
  const content = (
    <div
      onClick={() => setSelectedMessageId(props.m.id) && setDetailOpen(true)}
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
            }}
          >
            {props.m.tm}
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
  );

  return (
    <SwipeActions
      role="listitem"
      style={{ "border-bottom": "0.5px solid var(--border)" }}
      leftAction={{
        label: "Set Aside",
        icon: "ph-push-pin",
        color: "green",
        onClick: props.onSetAside,
      }}
      rightAction={{
        label: "Reply Later",
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

function EmptyState() {
  return (
    <Empty
      icon="ph-receipt"
      title="Records 是空的"
      description="还没有发票、物流或系统通知。"
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
