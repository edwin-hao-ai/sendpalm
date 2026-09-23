/** Pile board — generic full-page view for the 稍后回复 / 已搁置 / 提醒
 *  "boards" referenced from the Imbox pile cards (prototype-v11 §renderImboxPile
 *  line 3041: "Open <title> board" → setView(pileView)).
 *
 *  Single component handles all three piles via a `pileId` prop. Pile
 *  membership maps to one flag on the messages table (reply_later, set_aside,
 *  bubble_up_at) — we extend ListMessagesOptions with `replyLaterOnly`,
 *  `setAsideOnly`, `bubbleUpOnly` so the existing paginated loader picks
 *  the right slice with no new query.
 *
 *  All writes go through scoped setters (`setMessagePileFlags`,
 *  `moveMessageToBucket`) — the paginated rows are lightweight (no body /
 *  bodyHtml), so a full-row `upsertMessage` would wipe message bodies.
 */

import {
  For,
  Show,
  createMemo,
  createResource,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import { usePaginatedMessages } from "../utils/paginated-messages";
import type { Message } from "../types";
import {
  listContacts,
  moveMessageToBucket,
  setMessagePileFlags,
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
import { SwipeActions } from "../components/SwipeActions";
import { relativeTime } from "../utils/date";

export type PileId = "replyLater" | "setAside" | "bubbleUp";

const PILE_META: Record<
  PileId,
  {
    title: string;
    subtitle: string;
    icon: string;
    options: {
      replyLaterOnly: boolean;
      setAsideOnly: boolean;
      bubbleUpOnly: boolean;
    };
    /** Inverse action shown on rows of this board — "take it out of the
     *  pile and back to the plain Imbox list". */
    removeLabel: string;
    removeIcon: string;
  }
> = {
  replyLater: {
    title: "稍后回复",
    subtitle: "这些邮件等着你有空时回复",
    icon: "ph-clock",
    options: { replyLaterOnly: true, setAsideOnly: false, bubbleUpOnly: false },
    removeLabel: "移回 Imbox",
    removeIcon: "ph-tray",
  },
  setAside: {
    title: "已搁置",
    subtitle: "留作参考、稍后处理的邮件",
    icon: "ph-push-pin",
    options: { replyLaterOnly: false, setAsideOnly: true, bubbleUpOnly: false },
    removeLabel: "移回 Imbox",
    removeIcon: "ph-tray",
  },
  bubbleUp: {
    title: "提醒",
    subtitle: "到点会回到 Imbox 顶部的邮件",
    icon: "ph-arrow-fat-line-up",
    options: { replyLaterOnly: false, setAsideOnly: false, bubbleUpOnly: true },
    removeLabel: "取消提醒",
    removeIcon: "ph-arrow-fat-line-down",
  },
};

/** The three pile flags as a single record — `setMessagePileFlags` writes
 *  all three columns at once (a pile move clears the other two, matching
 *  the prototype's clearWorkflowFlags). */
function flagsFor(pile: PileId | null, bubbleUpAt: string | null = null) {
  return {
    replyLater: pile === "replyLater",
    setAside: pile === "setAside",
    bubbleUpAt: pile === "bubbleUp" ? bubbleUpAt : null,
  };
}

export function PileBoard(props: { pileId: PileId }) {
  const meta = () => PILE_META[props.pileId];
  const [contacts] = createResource(listContacts);

  const paged = usePaginatedMessages(
    {
      bucket: "imbox",
      direction: "in",
      ...meta().options,
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
    const map = new Map<string, { id: string; name: string; avatar: string }>();
    for (const c of contacts() ?? []) {
      map.set(c.id, { id: c.id, name: c.name, avatar: c.avatar });
    }
    return map;
  });

  const open = (id: string) => {
    setSelectedMessageId(id);
    setDetailOpen(true);
  };

  /** Take a message out of its current pile (or move it into another pile).
   *  Optimistic remove + scoped flag write + undoable toast. */
  const movePile = async (
    m: Message,
    target: PileId | null,
    bubbleUpAt: string | null,
    label: string,
  ) => {
    const prev = {
      replyLater: m.replyLater ?? false,
      setAside: m.setAside ?? false,
      bubbleUpAt: m.bubbleUpAt ?? null,
    };
    paged.removeByIds([m.id]);
    try {
      await setMessagePileFlags(m.id, flagsFor(target, bubbleUpAt));
      await refresh();
      showToast({
        message: label,
        kind: "success",
        action: {
          label: "撤销",
          run: () => {
            void (async () => {
              try {
                await setMessagePileFlags(m.id, prev);
                await refresh();
                showToast({ message: "已撤销", kind: "success" });
              } catch (err) {
                console.error("[pileboard] undo failed:", err);
                showToast({ message: "撤销失败，请重试", kind: "error" });
              }
            })();
          },
        },
      });
    } catch (err) {
      console.error("[pileboard] move pile failed:", err);
      await refresh();
      showToast({ message: "操作失败，请重试", kind: "error" });
    }
  };

  /** Inverse action for the current board — out of the pile, back to the
   *  plain Imbox list. */
  const removeFromPile = (m: Message) =>
    movePile(m, null, null, `已移出「${meta().title}」`);

  const archive = async (m: Message) => {
    const prev = {
      replyLater: m.replyLater ?? false,
      setAside: m.setAside ?? false,
      bubbleUpAt: m.bubbleUpAt ?? null,
    };
    paged.removeByIds([m.id]);
    try {
      await moveMessageToBucket(m.id, "paperTrail");
      await setMessagePileFlags(m.id, flagsFor(null));
      await refresh();
      showToast({
        message: "已归档到 Records",
        kind: "success",
        action: {
          label: "撤销",
          run: () => {
            void (async () => {
              try {
                await moveMessageToBucket(m.id, "imbox");
                await setMessagePileFlags(m.id, prev);
                await refresh();
                showToast({ message: "已撤销", kind: "success" });
              } catch (err) {
                console.error("[pileboard] undo archive failed:", err);
                showToast({ message: "撤销失败，请重试", kind: "error" });
              }
            })();
          },
        },
      });
    } catch (err) {
      console.error("[pileboard] archive failed:", err);
      await refresh();
      showToast({ message: "操作失败，请重试", kind: "error" });
    }
  };

  const trash = async (m: Message) => {
    paged.removeByIds([m.id]);
    try {
      await moveMessageToBucket(m.id, "trash");
      await refresh();
      showToast({
        message: "已移到回收站",
        kind: "info",
        action: {
          label: "撤销",
          run: () => {
            void (async () => {
              try {
                await moveMessageToBucket(m.id, "imbox");
                await refresh();
                showToast({ message: "已撤销", kind: "success" });
              } catch (err) {
                console.error("[pileboard] undo trash failed:", err);
                showToast({ message: "撤销失败，请重试", kind: "error" });
              }
            })();
          },
        },
      });
    } catch (err) {
      console.error("[pileboard] trash failed:", err);
      await refresh();
      showToast({ message: "操作失败，请重试", kind: "error" });
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
          padding: "var(--space-5) 0 var(--space-3)",
          "max-width": "720px",
          margin: "0 auto",
        }}
      >
        <button
          onClick={() => setView("imbox")}
          aria-label="返回 Imbox"
          title="返回 Imbox"
          style={{
            display: "inline-flex",
            "align-items": "center",
            gap: "6px",
            padding: "0 14px",
            "min-height": "44px",
            "border-radius": "var(--radius-pill)",
            background: "var(--paper-mid)",
            border: "0",
            color: "var(--text-secondary)",
            "font-size": "var(--text-caption)",
            "font-weight": "700",
            cursor: "pointer",
            "white-space": "nowrap",
          }}
        >
          <Icon name="ph-arrow-left" size={14} />
          返回 Imbox
        </button>
        <div style={{ flex: 1 }}>
          <h1
            style={{
              "font-family": "var(--font-display)",
              "font-size": "var(--text-h1)",
              "font-weight": "800",
              margin: 0,
              display: "flex",
              "align-items": "center",
              gap: "var(--space-2)",
            }}
          >
            <Icon name={meta().icon} size={20} />
            {meta().title}
            <span
              data-pile-total
              style={{
                display: "inline-flex",
                "align-items": "center",
                "justify-content": "center",
                "min-width": "24px",
                height: "24px",
                padding: "0 8px",
                "border-radius": "var(--radius-pill)",
                background: "var(--paper-mid)",
                color: "var(--text-secondary)",
                "font-size": "var(--text-caption)",
                "font-weight": "700",
              }}
            >
              {total()}
            </span>
          </h1>
          <p
            style={{
              margin: "2px 0 0",
              color: "var(--text-muted)",
              "font-size": "var(--text-caption)",
            }}
          >
            {meta().subtitle}
          </p>
        </div>
      </header>

      <Show
        when={!paged.resource.error}
        fallback={
          <ErrorState
            title="加载失败，请重试"
            retry={() => void paged.refresh()}
          />
        }
      >
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
                icon={meta().icon}
                title={`「${meta().title}」是空的`}
                description={`${meta().subtitle}。处理完了？回 Imbox 继续。`}
                action={{ label: "返回 Imbox", onClick: () => setView("imbox") }}
              />
            </Show>
          }
        >
          <div
            class="feed-list"
            data-pile-board-list
            style={{
              "max-width": "720px",
              margin: "0 auto",
              background: "var(--surface-elevated)",
              "border-radius": "var(--radius-xl)",
              border: "0.5px solid var(--border)",
              overflow: "hidden",
            }}
          >
            <For each={items()}>
              {(m, i) => (
                <PileBoardRow
                  m={m}
                  index={i()}
                  pileId={props.pileId}
                  contact={contactMap().get(m.pid)}
                  removeLabel={meta().removeLabel}
                  removeIcon={meta().removeIcon}
                  onOpen={() => open(m.id)}
                  onMovePile={(target) => {
                    // Moving to 提醒 without a time would immediately
                    // resurface the message; default to tomorrow 9am
                    // local, same as the drag-to-Remind path in Imbox.
                    let when: string | null = null;
                    if (target === "bubbleUp") {
                      const t = new Date();
                      t.setDate(t.getDate() + 1);
                      t.setHours(9, 0, 0, 0);
                      when = t.toISOString();
                    }
                    void movePile(
                      m,
                      target,
                      when,
                      target
                        ? `已移到「${PILE_META[target].title}」`
                        : `已移出「${meta().title}」`,
                    );
                  }}
                  onArchive={() => void archive(m)}
                  onTrash={() => void trash(m)}
                  onRemoveFromPile={() => void removeFromPile(m)}
                />
              )}
            </For>
          </div>
        </Show>
      </Show>
    </div>
  );
}

function PileBoardRow(props: {
  m: Message;
  index: number;
  pileId: PileId;
  contact?: { id: string; name: string; avatar: string };
  removeLabel: string;
  removeIcon: string;
  onOpen: () => void;
  onMovePile: (target: PileId | null) => void;
  onArchive: () => void;
  onTrash: () => void;
  onRemoveFromPile: () => void;
}) {
  const preview = () => {
    const raw = props.m.body || props.m.prev || "";
    return raw.length > 200 ? raw.slice(0, 200).trimEnd() + "…" : raw;
  };

  // Hover gate — same pattern as Imbox MessageCard: the action toolbar
  // only mounts while the row is hovered or focused, so a long board
  // doesn't pin hundreds of buttons + listeners in the DOM.
  const [hovered, setHovered] = createSignal(false);

  // Touch layouts (mobile + tablet) get swipe actions instead of the
  // hover toolbar — hover doesn't exist there, and the global
  // .feed-card-actions display:none rule on small screens would hide
  // the toolbar even if we mounted it.
  const [isTouchLayout, setIsTouchLayout] = createSignal(false);
  onMount(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    setIsTouchLayout(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsTouchLayout(e.matches);
    mq.addEventListener("change", handler);
    onCleanup(() => mq.removeEventListener("change", handler));
  });

  // The other two piles as move targets — e.g. on the 稍后回复 board
  // the row can move to 已搁置 or 提醒, plus the inverse "移回 Imbox".
  const otherPiles = () =>
    (Object.keys(PILE_META) as PileId[]).filter((p) => p !== props.pileId);

  const card = (
    <article
      class="feed-card"
      data-pile-row={props.m.id}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocusIn={() => setHovered(true)}
      onFocusOut={() => setHovered(false)}
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
          <span class="feed-name">{props.contact?.name ?? "未知发件人"}</span>
          <Show when={props.pileId === "bubbleUp" && props.m.bubbleUpAt}>
            <span
              data-bubble-up-badge
              style={{
                display: "inline-flex",
                "align-items": "center",
                gap: "4px",
                padding: "2px 8px",
                "border-radius": "var(--radius-pill)",
                background: "var(--palm-soft)",
                color: "var(--palm)",
                "font-size": "var(--text-micro)",
                "font-weight": "700",
              }}
            >
              <Icon name="ph-alarm" size={11} />
              {relativeTime(props.m.bubbleUpAt as string)}回浮
            </span>
          </Show>
          <span class="feed-spacer" />
          <span
            class="feed-time"
            style={{ visibility: hovered() ? "hidden" : "visible" }}
          >
            {props.m.tm}
          </span>
        </div>
        <div class="feed-bottom-row">
          <span class="feed-subject">{props.m.subj}</span>
        </div>
        <div class="feed-bottom-row">
          <span class="feed-preview">{preview()}</span>
        </div>
      </div>
      <Show when={hovered()}>
        <div class="feed-card-actions" data-feed-card-actions>
          <button
            class="feed-card-action-btn"
            data-action="remove-from-pile"
            title={props.removeLabel}
            aria-label={props.removeLabel}
            type="button"
            onClick={(ev) => {
              ev.stopPropagation();
              props.onRemoveFromPile();
            }}
          >
            <Icon name={props.removeIcon} size={14} />
          </button>
          <For each={otherPiles()}>
            {(p) => (
              <button
                class="feed-card-action-btn"
                data-action={`move-to-${p}`}
                title={`移到「${PILE_META[p].title}」`}
                aria-label={`移到「${PILE_META[p].title}」`}
                type="button"
                onClick={(ev) => {
                  ev.stopPropagation();
                  props.onMovePile(p);
                }}
              >
                <Icon name={PILE_META[p].icon} size={14} />
              </button>
            )}
          </For>
          <button
            class="feed-card-action-btn"
            data-action="archive"
            title="归档"
            aria-label="归档"
            type="button"
            onClick={(ev) => {
              ev.stopPropagation();
              props.onArchive();
            }}
          >
            <Icon name="ph-archive" size={14} />
          </button>
          <button
            class="feed-card-action-btn"
            data-action="trash"
            title="删除"
            aria-label="删除"
            type="button"
            onClick={(ev) => {
              ev.stopPropagation();
              props.onTrash();
            }}
          >
            <Icon name="ph-trash" size={14} />
          </button>
        </div>
      </Show>
    </article>
  );

  return (
    <SwipeActions
      disabled={!isTouchLayout()}
      leftAction={{
        label: "删除",
        icon: "ph-trash",
        color: "red",
        onClick: () => props.onTrash(),
      }}
      rightAction={{
        label: props.removeLabel,
        icon: props.removeIcon,
        color: "blue",
        onClick: () => props.onRemoveFromPile(),
      }}
    >
      {card}
    </SwipeActions>
  );
}
