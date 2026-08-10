/** Records view — receipts, transactions. Quiet auto-file. */

import { For, Show, createMemo, createResource } from "solid-js";
import {
  listContacts,
  listMessages,
  listFiles,
  upsertMessage,
} from "../stores/data";
import { Avatar } from "../components/Avatar";
import { Empty } from "../components/Empty";
import { Icon } from "../components/Icon";
import { SkeletonList } from "../components/Skeleton";
import {
  setDetailOpen,
  setSelectedMessageId,
  setSelectedFileId,
  showToast,
} from "../stores/ui";
import { useRefreshEffect, useViewport } from "../utils/gestures";
import { SwipeActions } from "../components/SwipeActions";
import type { Message } from "../types";

export function Records() {
  const [contacts] = createResource(listContacts);
  const [messages, { refetch: refetchMessages }] = createResource(listMessages);
  const [files, { refetch: refetchFiles }] = createResource(listFiles);
  const { isMobile } = useViewport();

  useRefreshEffect(() => {
    void refetchMessages();
    void refetchFiles();
  });

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

  const items = createMemo(() => {
    return (messages() ?? [])
      .filter((m) => m.bucket === "paperTrail")
      .sort((a, b) => new Date(b.st).getTime() - new Date(a.st).getTime());
  });

  const grouped = createMemo(() => {
    const today: typeof items extends () => infer T ? T : never = [];
    const earlier: typeof today = [];
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    for (const m of items()) {
      const d = new Date(m.st);
      if (d.toDateString() === now.toDateString()) today.push(m);
      else if (d.toDateString() === yesterday.toDateString()) earlier.push(m);
      else earlier.push(m);
    }
    return { today, earlier };
  });

  const contactById = (id: string) => contacts()?.find((c) => c.id === id);
  const filesByMsg = (m: { attachments: string[] }) =>
    (files() ?? []).filter((f) => m.attachments.includes(f.id));

  return (
    <div style={{ animation: "view-enter 0.3s var(--ease-out) both" }}>
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
        </p>
      </header>

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
            <Show when={grouped().today.length > 0}>
              <GroupHeader title="Today" />
              <For each={grouped().today}>
                {(m) => (
                  <RecordRow
                    m={m}
                    contact={contactById(m.pid)}
                    attachments={filesByMsg(m)}
                    isMobile={isMobile()}
                    onSetAside={() => void setAside(m)}
                    onReplyLater={() => void replyLater(m)}
                  />
                )}
              </For>
            </Show>
            <Show when={grouped().earlier.length > 0}>
              <GroupHeader title="Earlier" />
              <For each={grouped().earlier}>
                {(m) => (
                  <RecordRow
                    m={m}
                    contact={contactById(m.pid)}
                    attachments={filesByMsg(m)}
                    isMobile={isMobile()}
                    onSetAside={() => void setAside(m)}
                    onReplyLater={() => void replyLater(m)}
                  />
                )}
              </For>
            </Show>
          </div>
        </Show>
      </Show>
    </div>
  );
}

function GroupHeader(props: { title: string }) {
  return (
    <div
      style={{
        "font-size": "var(--text-micro)",
        color: "var(--text-muted)",
        "font-weight": "700",
        "letter-spacing": "0.06em",
        "text-transform": "uppercase",
        padding: "var(--space-4) 0 var(--space-2)",
      }}
    >
      {props.title}
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
      <button
        onClick={(e) => {
          e.stopPropagation();
          showToast({ message: "导出为 CSV（M7 实装）", kind: "info" });
        }}
        title="Quick action"
        style={{ color: "var(--text-muted)", "align-self": "center" }}
      >
        <Icon name="ph-download-simple" size={16} />
      </button>
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
