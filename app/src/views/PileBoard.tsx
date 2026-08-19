/** Pile board — generic full-page view for the Pending / Saved / Remind
 *  "boards" referenced from the Imbox pile cards (prototype-v11 §renderImboxPile
 *  line 3041: "Open <title> board" → setView(pileView)).
 *
 *  Single component handles all three piles via a `pileId` prop. Pile
 *  membership maps to one bit on the messages table (reply_later, set_aside,
 *  bubble_up_at) — we extend ListMessagesOptions with `replyLaterOnly`,
 *  `setAsideOnly`, `bubbleUpOnly` so the existing paginated loader picks
 *  the right slice with no new query.
 */

import {
  For,
  Show,
  createMemo,
  createResource,
} from "solid-js";
import { usePaginatedMessages } from "../utils/paginated-messages";
import type { Message, MessageBucket } from "../types";
import {
  listContacts,
  moveMessageToBucket,
  upsertMessage,
} from "../stores/data";
import {
  showToast,
  setSelectedMessageId,
  setDetailOpen,
  setView,
} from "../stores/ui";
import { Avatar } from "../components/Avatar";
import { Icon } from "../components/Icon";
import { Empty, ErrorState } from "../components/Empty";
import { SkeletonList } from "../components/Skeleton";

export type PileId = "replyLater" | "setAside" | "bubbleUp";

const PILE_META: Record<
  PileId,
  {
    title: string;
    subtitle: string;
    icon: string;
    options: { replyLaterOnly: boolean; setAsideOnly: boolean; bubbleUpOnly: boolean };
    openBoardLabel: string;
  }
> = {
  replyLater: {
    title: "Pending",
    subtitle: "需要回复但暂时没空的邮件",
    icon: "ph-clock",
    options: { replyLaterOnly: true, setAsideOnly: false, bubbleUpOnly: false },
    openBoardLabel: "Open Pending board",
  },
  setAside: {
    title: "Saved",
    subtitle: "想留作参考或稍后处理的邮件",
    icon: "ph-push-pin",
    options: { replyLaterOnly: false, setAsideOnly: true, bubbleUpOnly: false },
    openBoardLabel: "Open Saved board",
  },
  bubbleUp: {
    title: "Remind",
    subtitle: "回来后浮到 Inbox 顶部的邮件",
    icon: "ph-arrow-fat-line-up",
    options: { replyLaterOnly: false, setAsideOnly: false, bubbleUpOnly: true },
    openBoardLabel: "Open Remind board",
  },
};

export function PileBoard(props: { pileId: PileId }) {
  const meta = PILE_META[props.pileId];
  const [contacts] = createResource(listContacts);

  const paged = usePaginatedMessages(
    {
      bucket: "imbox",
      direction: "in",
      ...meta.options,
      lightweight: true,
    },
    100,
  );
  const items = paged.items;
  const refresh = paged.refresh;
  const total = paged.total;

  const contactMap = createMemo<
    Map<string, { id: string; name: string; avatar: string }>
  >(() => {
    const map = new Map<
      string,
      { id: string; name: string; avatar: string }
    >();
    for (const c of contacts() ?? []) {
      map.set(c.id, { id: c.id, name: c.name, avatar: c.avatar });
    }
    return map;
  });

  const open = (id: string) => {
    setSelectedMessageId(id);
    setDetailOpen(true);
  };

  const replyLater = async (m: Message) => {
    paged.removeByIds([m.id]);
    try {
      await upsertMessage({ ...m, replyLater: true });
      await refresh();
      showToast({ message: "已 Reply Later", kind: "success" });
    } catch (err) {
      await refresh();
      showToast({ message: `Reply Later 失败：${String(err)}`, kind: "error" });
    }
  };

  const setAside = async (m: Message) => {
    paged.removeByIds([m.id]);
    try {
      await upsertMessage({ ...m, setAside: true });
      await refresh();
      showToast({ message: "已 Set Aside", kind: "success" });
    } catch (err) {
      await refresh();
      showToast({ message: `Set Aside 失败：${String(err)}`, kind: "error" });
    }
  };

  const archive = async (m: Message) => {
    paged.removeByIds([m.id]);
    try {
      await moveMessageToBucket(m.id, "paperTrail" as MessageBucket);
      await refresh();
      showToast({ message: "已归档", kind: "success" });
    } catch (err) {
      await refresh();
      showToast({ message: `归档失败：${String(err)}`, kind: "error" });
    }
  };

  const trash = async (m: Message) => {
    paged.removeByIds([m.id]);
    try {
      await moveMessageToBucket(m.id, "trash");
      await refresh();
      showToast({ message: "已移到 Trash", kind: "info" });
    } catch (err) {
      await refresh();
      showToast({ message: `移到 Trash 失败：${String(err)}`, kind: "error" });
    }
  };

  return (
    <div
      class="imbox-view"
      style={{ padding: "0 var(--space-5) var(--space-5)" }}
    >
      <header
        style={{
          display: "flex",
          "align-items": "center",
          gap: "var(--space-3)",
          padding: "var(--space-4) 0 var(--space-3)",
        }}
      >
        <button
          onClick={() => setView("imbox")}
          aria-label="Back to Imbox"
          style={{
            display: "inline-flex",
            "align-items": "center",
            "justify-content": "center",
            width: "36px",
            height: "36px",
            "border-radius": "var(--radius-pill)",
            background: "var(--paper-mid)",
            border: "0",
            color: "var(--text-secondary)",
            cursor: "pointer",
          }}
        >
          <Icon name="ph-arrow-left" size={16} />
        </button>
        <div style={{ flex: 1 }}>
          <h1
            style={{
              "font-family": "var(--font-display)",
              "font-size": "var(--text-h3)",
              "font-weight": "800",
              margin: 0,
              display: "flex",
              "align-items": "center",
              gap: "var(--space-2)",
            }}
          >
            <Icon name={meta.icon} size={20} />
            {meta.title}
          </h1>
          <p
            style={{
              margin: "2px 0 0",
              color: "var(--text-muted)",
              "font-size": "var(--text-caption)",
            }}
          >
            {total()} {meta.subtitle}
          </p>
        </div>
      </header>

      <Show
        when={!paged.resource.error}
        fallback={
          <ErrorState
            title="PileBoard 加载失败"
            message={String(paged.resource.error ?? "")}
            retry={() => void paged.refresh()}
          />
        }
      >
        <></>
      </Show>
      <Show
        when={items().length > 0}
        fallback={
          <Show
            when={items().length === 0 && !paged.loadingMore()}
            fallback={
              <div style={{ "max-width": "720px", margin: "0 auto" }}>
                <SkeletonList count={6} />
              </div>
            }
          >
            <Empty
              icon={meta.icon}
              title={`${meta.title} 为空`}
              description={meta.subtitle}
              action={
                props.pileId === "replyLater"
                  ? {
                      label: "去 Imbox 阅读",
                      onClick: () => setView("imbox"),
                    }
                  : { label: "返回 Imbox", onClick: () => setView("imbox") }
              }
            />
          </Show>
        }
      >
        <div
          class="feed-list"
          data-pile-board-list
          style={{ "max-width": "720px", margin: "0 auto" }}
        >
          <For each={items()}>
            {(m, i) => (
              <PileBoardRow
                m={m}
                index={i()}
                contact={contactMap().get(m.pid)}
                onOpen={() => open(m.id)}
                onReplyLater={() => void replyLater(m)}
                onSetAside={() => void setAside(m)}
                onArchive={() => void archive(m)}
                onTrash={() => void trash(m)}
              />
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

function PileBoardRow(props: {
  m: Message;
  index: number;
  contact?: { id: string; name: string; avatar: string };
  onOpen: () => void;
  onReplyLater: () => void;
  onSetAside: () => void;
  onArchive: () => void;
  onTrash: () => void;
}) {
  const preview = () => {
    const raw = props.m.body || props.m.prev || "";
    return raw.length > 200 ? raw.slice(0, 200).trimEnd() + "…" : raw;
  };

  return (
    <article
      class="feed-card"
      data-pile-row={props.m.id}
      onClick={(ev) => {
        const target = ev.target as HTMLElement;
        if (target.closest("button")) return;
        props.onOpen();
      }}
    >
      <Avatar
        name={props.contact?.name ?? "?"}
        src={props.contact?.avatar}
        size={40}
      />
      <div class="feed-body">
        <div class="feed-top-row">
          <span class="feed-name">
            {props.contact?.name ?? "Unknown"}
          </span>
          <span class="feed-spacer" />
          <span class="feed-time">{props.m.tm}</span>
        </div>
        <div class="feed-bottom-row">
          <span class="feed-subject">{props.m.subj}</span>
        </div>
        <div class="feed-bottom-row">
          <span class="feed-preview">{preview()}</span>
        </div>
      </div>
      <div class="feed-card-actions" data-feed-card-actions>
        <button
          class="feed-card-action-btn"
          title="Pending (l)"
          onClick={(ev) => {
            ev.stopPropagation();
            props.onReplyLater();
          }}
        >
          <Icon name="ph-clock" size={14} />
        </button>
        <button
          class="feed-card-action-btn"
          title="Saved (s)"
          onClick={(ev) => {
            ev.stopPropagation();
            props.onSetAside();
          }}
        >
          <Icon name="ph-push-pin" size={14} />
        </button>
        <button
          class="feed-card-action-btn"
          title="Archive (e)"
          onClick={(ev) => {
            ev.stopPropagation();
            props.onArchive();
          }}
        >
          <Icon name="ph-archive" size={14} />
        </button>
        <button
          class="feed-card-action-btn"
          title="Trash (#)"
          onClick={(ev) => {
            ev.stopPropagation();
            props.onTrash();
          }}
        >
          <Icon name="ph-trash" size={14} />
        </button>
      </div>
    </article>
  );
}
