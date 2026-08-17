/** Imbox view — main workhorse. M1: bundles, splits, piles, keyboard nav.
 *  Mirrors prototype-v11 §renderImbox + §renderFeedItem closely so the
 *  feel matches the HTML prototype the user can scroll through.
 *
 *  Scroll performance contract: at 5,000 rows the page MUST still paint
 *  at 60fps. We achieve that with browser-native virtualization
 *  (content-visibility: auto on every .feed-card in styles/imbox.css)
 *  + paginated loads of 100 rows at a time. No JS virtualization —
 *  WindowVirtualizer/VList break page-scroll layout in subtle ways and
 *  pull in extra state we don't need.
 *
 *  Every imbox bucket row shows in the list; first-time senders render
 *  with an inline approve/block pill so the user never has to jump to
 *  Gate for a single message. Bulk Gate approval remains in Gate for
 *  the 200+ queue case.
 */
import {
  For,
  Show,
  createMemo,
  createResource,
  createSignal,
  createEffect,
  onCleanup,
  onMount,
} from "solid-js";
import {
  listContacts,
  listPileMessages,
  moveMessageToBucket,
  upsertMessage,
  upsertContact,
  getMessage,
} from "../stores/data";
import type { PileMessage } from "../stores/data";
import { usePaginatedMessages } from "../utils/paginated-messages";
import type { Contact, Message, MessageBucket } from "../types";
import {
  setDetailOpen,
  setSelectedMessageId,
  cursorIndex,
  setCursorIndex,
  selectedIds,
  setSelectedIds,
  showToast,
  refreshTick,
  softRefreshTick,
} from "../stores/ui";
import { Avatar } from "../components/Avatar";
import { Icon } from "../components/Icon";
import { SkeletonList } from "../components/Skeleton";
import { priorityScore } from "../utils/priority";
import { registerPrepend } from "../services/sync-events";

interface Bundle {
  contactId: string;
  contact: Contact;
  messages: Message[];
}

type Item = Message | Bundle;
type ItemList = Item[];

interface Pile {
  id: "pending" | "saved" | "remind";
  icon: string;
  title: string;
  messages: PileMessage[];
}

const BUNDLE_THRESHOLD = 3;
const PREVIEW_CHARS = 220;
const PAGE_SIZE = 100;

export function Imbox() {
  // Hot list: first PAGE_SIZE rows of imbox+incoming. Scroll triggers
  // loadMore via the IntersectionObserver in the sentinel at the bottom.
  const paged = usePaginatedMessages(
    {
      bucket: "imbox",
      direction: "in",
    },
    PAGE_SIZE,
  );
  const items = paged.items;
  const refresh = paged.refresh;
  const total = paged.total;

  // Pile slices: only the rows shown in the Pending / Saved / Remind piles.
  // We deliberately do NOT load the full messages table here — real mailboxes
  // have thousands of rows with large HTML bodies, and pulling them all on
  // every refresh tick or tab return is the main source of scroll jank.
  const [pileMessages, { refetch: refetchPiles }] = createResource(listPileMessages);
  const [contacts, { refetch: refetchContacts }] = createResource(listContacts);

  // Live-prepend on sync:new-messages (O(new_ids) IPC round-trips).
  onCleanup(
    registerPrepend("imbox", (ids) => {
      void paged.prependByIds(ids);
    }),
  );

  // Hard refresh on the global tick: after seed, pull-to-refresh, or any
  // other explicit "reload everything" signal. We skip the initial mount run
  // because createResource already fetches page 1 on mount; without the skip
  // we would double-fetch the whole page.
  let initialHardRefresh = true;
  useRefreshEffect(() => {
    if (initialHardRefresh) {
      initialHardRefresh = false;
      return;
    }
    void refresh();
    void refetchPiles();
    void refetchContacts();
  });

  // Soft refresh: sync events and single-row actions only need counters and
  // pile slices to update — never clear the paged list or reset scroll position.
  let initialSoftRefresh = true;
  useSoftRefreshEffect(() => {
    if (initialSoftRefresh) {
      initialSoftRefresh = false;
      return;
    }
    void refetchPiles();
    void refetchContacts();
  });

  /* ── Contact map (for first-time badge + inline approve) ───────── */

  const contactMap = createMemo<Map<string, Contact>>(() => {
    const map = new Map<string, Contact>();
    for (const c of contacts() ?? []) map.set(c.id, c);
    return map;
  });

  /* ── Derived: split into new-for-you / previously-seen / bundles ── */

  // First-time senders = contacts where screened=0 OR firstSeen=1.
  // For these we show the row with an inline approve pill so the user
  // never has to leave Imbox for a single-message decision.
  const _isFirstTime = (c: Contact | undefined) =>
    !c || !!c.firstSeen || !c.screened;
  void _isFirstTime;

  // Per-message priority score (matches prototype §priorityScore).
  const scoreFor = (m: Message) => {
    const c = contactMap().get(m.pid);
    return priorityScore(m, c);
  };

  // Group unread by sender for bundle detection.
  const renderList = createMemo<ItemList>(() => {
    const list = items()
      .filter((m) => !m.setAside && !m.replyLater)
      .filter((m) => m.unread);

    const bySender = new Map<string, Message[]>();
    for (const m of list) {
      const arr = bySender.get(m.pid) ?? [];
      arr.push(m);
      bySender.set(m.pid, arr);
    }

    const out: Item[] = [];
    const standalone: Message[] = [];
    for (const [pid, msgs] of bySender) {
      if (msgs.length >= BUNDLE_THRESHOLD) {
        const c = contactMap().get(pid);
        if (c) {
          out.push({ contactId: pid, contact: c, messages: msgs });
          continue;
        }
      }
      for (const m of msgs) standalone.push(m);
    }
    // Standalone messages sort by priority desc, then date desc.
    standalone.sort(
      (a, b) =>
        scoreFor(b) - scoreFor(a) ||
        new Date(b.st).getTime() - new Date(a.st).getTime(),
    );
    // Bundle rows interleaved by highest member priority.
    const bundleItems = out.filter(
      (x): x is Bundle => "messages" in x,
    );
    bundleItems.sort((a, b) => {
      const sa = Math.max(...a.messages.map(scoreFor));
      const sb = Math.max(...b.messages.map(scoreFor));
      return sb - sa;
    });
    return [...bundleItems, ...standalone];
  });

  const newForYou = createMemo<ItemList>(() => renderList());

  const previouslySeen = createMemo<Message[]>(() => {
    return items()
      .filter((m) => !m.setAside && !m.replyLater)
      .filter((m) => !m.unread)
      .sort((a, b) => new Date(b.st).getTime() - new Date(a.st).getTime());
  });

  /* ── Piles (Pending / Saved / Remind) ─────────────────────────────── */

  const piles = createMemo((): Pile[] => {
    const all = pileMessages() ?? [];
    const all_piles: Pile[] = [
      {
        id: "pending",
        icon: "ph-clock",
        title: "Pending",
        messages: all.filter((m) => m.replyLater),
      },
      {
        id: "saved",
        icon: "ph-push-pin",
        title: "Saved",
        messages: all.filter((m) => m.setAside),
      },
      {
        id: "remind",
        icon: "ph-arrow-fat-line-up",
        title: "Remind",
        messages: all.filter((m) => m.bubbleUpAt),
      },
    ];
    return all_piles.filter((p) => p.messages.length > 0);
  });

  const remindedCount = createMemo(
    () => (pileMessages() ?? []).filter((m) => m.bubbleUpAt).length,
  );

  /* ── Bundle drawer state ─────────────────────────────────────────── */

  const [openBundles, setOpenBundles] = createSignal<Set<string>>(new Set());
  const toggleBundle = (id: string) => {
    const next = new Set(openBundles());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOpenBundles(next);
  };

  /* ── Selection (multi-select with x) ─────────────────────────────── */

  const [lastSelectedId, setLastSelectedId] = createSignal<string | null>(
    null,
  );

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
    setLastSelectedId(id);
  };

  const selectRange = (fromId: string, toId: string) => {
    const ids = flatIds();
    const fromIdx = ids.indexOf(fromId);
    const toIdx = ids.indexOf(toId);
    if (fromIdx === -1 || toIdx === -1) return;
    const start = Math.min(fromIdx, toIdx);
    const end = Math.max(fromIdx, toIdx);
    const next = new Set(selectedIds());
    for (let i = start; i <= end; i++) {
      const id = ids[i];
      if (id) next.add(id);
    }
    setSelectedIds(next);
    setLastSelectedId(toId);
  };

  const clearSelection = () => {
    setSelectedIds(new Set<string>());
    setLastSelectedId(null);
  };
  void clearSelection; // exposed for downstream bulk-action surfaces

  const bundleSelectedState = (b: Bundle): "none" | "partial" | "all" => {
    const ids = b.messages.map((m) => m.id);
    const selected = ids.filter((id) => selectedIds().has(id)).length;
    if (selected === 0) return "none";
    if (selected === ids.length) return "all";
    return "partial";
  };

  const toggleBundleSelection = (b: Bundle) => {
    const state = bundleSelectedState(b);
    const next = new Set(selectedIds());
    for (const m of b.messages) {
      if (state === "all") next.delete(m.id);
      else next.add(m.id);
    }
    setSelectedIds(next);
    setLastSelectedId(b.contactId);
  };

  /* ── Cursor (j/k navigation) ───────────────────────────────────────── */

  const flatIds = createMemo(() =>
    renderList().map((x) => ("messages" in x ? x.contactId : x.id)),
  );

  createEffect(() => {
    if (cursorIndex() >= flatIds().length) setCursorIndex(-1);
  });

  const moveCursor = (delta: number) => {
    const ids = flatIds();
    if (ids.length === 0) return;
    const cur = cursorIndex() < 0 ? 0 : cursorIndex();
    const next = (cur + delta + ids.length) % ids.length;
    setCursorIndex(next);
    const item = renderList()[next];
    if (item) {
      const id = "messages" in item ? item.messages[0]?.id : item.id;
      if (id) setSelectedMessageId(id);
    }
  };

  /* ── Open message in DetailPanel ──────────────────────────────────── */

  const open = (id: string) => {
    setSelectedMessageId(id);
    setDetailOpen(true);
  };

  /* ── Per-message optimistic actions ───────────────────────────────── */

  const refreshAll = async () => {
    await refresh();
    await refetchPiles();
  };

  const replyLater = async (m: Message) => {
    paged.removeByIds([m.id]);
    try {
      await upsertMessage({ ...m, replyLater: true });
      await refetchPiles();
      showToast({ message: "已 Reply Later", kind: "success" });
    } catch (err) {
      await refreshAll();
      showToast({ message: `Reply Later 失败：${String(err)}`, kind: "error" });
    }
  };

  const setAside = async (m: Message) => {
    paged.removeByIds([m.id]);
    try {
      await upsertMessage({ ...m, setAside: true });
      await refetchPiles();
      showToast({ message: "已 Set Aside", kind: "success" });
    } catch (err) {
      await refreshAll();
      showToast({ message: `Set Aside 失败：${String(err)}`, kind: "error" });
    }
  };

  const archive = async (m: Message) => {
    paged.removeByIds([m.id]);
    try {
      await moveMessageToBucket(m.id, "paperTrail");
      await refetchPiles();
      showToast({ message: "已归档", kind: "success" });
    } catch (err) {
      await refreshAll();
      showToast({ message: `归档失败：${String(err)}`, kind: "error" });
    }
  };

  const trash = async (m: Message) => {
    paged.removeByIds([m.id]);
    try {
      await moveMessageToBucket(m.id, "trash");
      await refetchPiles();
      showToast({ message: "已移到 Trash", kind: "info" });
    } catch (err) {
      await refreshAll();
      showToast({ message: `移到 Trash 失败：${String(err)}`, kind: "error" });
    }
  };

  const spam = async (m: Message) => {
    paged.removeByIds([m.id]);
    try {
      await moveMessageToBucket(m.id, "spam");
      await refetchPiles();
      showToast({ message: "已标为垃圾", kind: "info" });
    } catch (err) {
      await refreshAll();
      showToast({ message: `标垃圾失败：${String(err)}`, kind: "error" });
    }
  };

  const toggleUnread = async (m: Message) => {
    try {
      await upsertMessage({ ...m, unread: !m.unread });
      await refetchPiles();
    } catch (err) {
      await refreshAll();
      showToast({ message: `标记失败：${String(err)}`, kind: "error" });
    }
  };

  /* ── First-time sender inline approve/block ──────────────────────── */

  const approveFirstTime = async (m: Message, bucket: MessageBucket) => {
    try {
      const c = contactMap().get(m.pid);
      if (c) {
        await upsertContact({
          ...c,
          firstSeen: false,
          screened: true,
          defaultBucket: bucket,
        });
      }
      await moveMessageToBucket(m.id, bucket);
      await refreshAll();
      showToast({
        message: `已批准 → ${bucket === "imbox" ? "Imbox" : bucket === "feed" ? "Stream" : "Records"}`,
        kind: "success",
      });
    } catch (err) {
      await refreshAll();
      showToast({ message: `批准失败：${String(err)}`, kind: "error" });
    }
  };

  const blockFirstTime = async (m: Message) => {
    try {
      const c = contactMap().get(m.pid);
      if (c) {
        await upsertContact({
          ...c,
          firstSeen: false,
          screened: true,
          blocked: true,
        });
      }
      await moveMessageToBucket(m.id, "spam");
      await refreshAll();
      showToast({ message: `已阻止 ${c?.name ?? m.pid}`, kind: "info" });
    } catch (err) {
      await refreshAll();
      showToast({ message: `阻止失败：${String(err)}`, kind: "error" });
    }
  };

  /* ── Mark a message read when opened ─────────────────────────────── */

  const openAndMarkRead = async (m: Message) => {
    open(m.id);
    if (m.unread) {
      // Optimistic — move the card to the read section instantly. The DB
      // write is the source of truth; MessagePanel also patches on mount
      // so this is idempotent. No refreshTick: patching one row in memory
      // is all the list needs to re-derive its sections.
      paged.patchMessage(m.id, { unread: false });
      try {
        await upsertMessage({ ...m, unread: false });
      } catch {
        // Restore on failure so the list never lies about read state.
        paged.patchMessage(m.id, { unread: true });
      }
    }
  };

  /* ── Drag and drop (HTMl5 DnD → DropBar) ──────────────────────────── */

  const onDragStart = (m: Message, ev: DragEvent) => {
    ev.dataTransfer?.setData("text/plain", m.id);
    if (ev.dataTransfer) ev.dataTransfer.effectAllowed = "move";
    (ev.currentTarget as HTMLElement).classList.add("dragging");
  };
  const onDragEnd = (ev: DragEvent) => {
    (ev.currentTarget as HTMLElement).classList.remove("dragging");
  };

  /* ── Keyboard shortcuts (j/k/x/Enter/l/s/a/r/t/b/o/u) ─────────────── */

  const handleKey = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
    if (tag === "input" || tag === "textarea") return;
    if (e.key === "j") {
      e.preventDefault();
      moveCursor(1);
    } else if (e.key === "k") {
      e.preventDefault();
      moveCursor(-1);
    } else if (e.key === "Enter") {
      const cur = cursorIndex();
      if (cur >= 0) {
        const item = renderList()[cur];
        if (item) {
          if ("messages" in item) {
            const first = item.messages[0];
            if (first) openAndMarkRead(first);
          } else {
            openAndMarkRead(item);
          }
        }
      }
    } else if (e.key === "x") {
      const cur = cursorIndex();
      const item = renderList()[cur];
      if (!item) return;
      if ("messages" in item) toggleBundleSelection(item);
      else toggleSelect(item.id);
    } else if (e.key === "l") {
      const cur = cursorIndex();
      const item = renderList()[cur];
      if (item && !("messages" in item)) void replyLater(item);
    } else if (e.key === "s") {
      const cur = cursorIndex();
      const item = renderList()[cur];
      if (item && !("messages" in item)) void setAside(item);
    } else if (e.key === "e") {
      const cur = cursorIndex();
      const item = renderList()[cur];
      if (item && !("messages" in item)) void archive(item);
    } else if (e.key === "t" || e.key === "#") {
      const cur = cursorIndex();
      const item = renderList()[cur];
      if (item && !("messages" in item)) void trash(item);
    } else if (e.key === "b") {
      const cur = cursorIndex();
      const item = renderList()[cur];
      if (item && !("messages" in item)) void spam(item);
    } else if (e.key === "u") {
      const cur = cursorIndex();
      const item = renderList()[cur];
      if (item && !("messages" in item)) void toggleUnread(item);
    }
  };

  onMount(() => {
    document.addEventListener("keydown", handleKey);
  });
  onCleanup(() => {
    document.removeEventListener("keydown", handleKey);
  });

  /* ── IntersectionObserver for infinite scroll ──────────────────── */

  let sentinel: HTMLDivElement | undefined;
  let observer: IntersectionObserver | undefined;
  onMount(() => {
    if (!sentinel) return;
    observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry && entry.isIntersecting && paged.hasMore() && !paged.loadingMore()) {
          void paged.loadMore();
        }
      },
      { rootMargin: "400px" },
    );
    observer.observe(sentinel);
  });
  onCleanup(() => observer?.disconnect());

  /* ── Render ──────────────────────────────────────────────────────── */

  const itemKey = (item: Item) =>
    "messages" in item ? `bundle:${item.contactId}` : `msg:${item.id}`;

  const hasAny = createMemo(
    () =>
      newForYou().length > 0 ||
      previouslySeen().length > 0 ||
      piles().length > 0 ||
      total() > 0,
  );

  return (
    <div class="imbox-view">
      <ImboxHeader
        total={total()}
        newCount={newForYou().length}
        previouslySeenCount={previouslySeen().length}
        onSync={async () => {
          await refresh();
          showToast({ message: "已刷新", kind: "info", ttlMs: 1500 });
        }}
      />

      <Show when={remindedCount() > 0}>
        <div
          class="bubble-up-banner"
          role="button"
          onClick={() => {
            /* navigate to first remind — same UX as prototype */
            const first = (pileMessages() ?? []).find((m) => m.bubbleUpAt);
            if (first) open(first.id);
          }}
        >
          <Icon name="ph-arrow-fat-line-up" size={20} />
          <div class="bubble-up-body">
            <div class="bubble-up-title">{remindedCount()} reminded</div>
            <div class="bubble-up-subtitle">
              Back at the top of your Inbox
            </div>
          </div>
        </div>
      </Show>

      <Show
        when={hasAny}
        fallback={
          <Show
            when={paged.loadingMore() || items().length === 0}
            fallback={<EmptyState />}
          >
            <SkeletonBlock />
          </Show>
        }
      >
        <div class="feed-list" data-feed-list>
          <Show when={newForYou().length > 0}>
            <SectionHeader
              title="New for you"
              variant="new"
              action={{ label: "一起读", onClick: () => undefined }}
            />
            <For each={newForYou()}>
              {(item, i) => (
                <ItemRow
                  item={item}
                  index={i()}
                  isCursor={(idx) => cursorIndex() === idx}
                  selectedIds={selectedIds()}
                  lastSelectedId={lastSelectedId()}
                  contactMap={contactMap}
                  scoreFor={scoreFor}
                  bundleOpen={(id) => openBundles().has(id)}
                  onToggleBundle={(id) => toggleBundle(id)}
                  onOpen={openAndMarkRead}
                  onToggleSelect={(id) => toggleSelect(id)}
                  onSelectRange={selectRange}
                  onReplyLater={(m) => void replyLater(m)}
                  onSetAside={(m) => void setAside(m)}
                  onArchive={(m) => void archive(m)}
                  onTrash={(m) => void trash(m)}
                  onSpam={(m) => void spam(m)}
                  onToggleUnread={(m) => void toggleUnread(m)}
                  onApproveFirstTime={(m, b) => void approveFirstTime(m, b)}
                  onBlockFirstTime={(m) => void blockFirstTime(m)}
                  onBundleSelect={(b) => toggleBundleSelection(b)}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                  itemKey={itemKey}
                />
              )}
            </For>
          </Show>

          <Show when={previouslySeen().length > 0}>
            <SectionHeader title="Previously seen" variant="seen" />
            <For each={previouslySeen()}>
              {(m, i) => (
                <MessageCard
                  m={m}
                  index={newForYou().length + i()}
                  isCursor={() => false}
                  selectedIds={selectedIds()}
                  lastSelectedId={lastSelectedId()}
                  contact={contactMap().get(m.pid)}
                  scoreFor={scoreFor}
                  onOpen={openAndMarkRead}
                  onToggleSelect={(id) => toggleSelect(id)}
                  onSelectRange={selectRange}
                  onReplyLater={(msg) => void replyLater(msg)}
                  onSetAside={(msg) => void setAside(msg)}
                  onArchive={(msg) => void archive(msg)}
                  onTrash={(msg) => void trash(msg)}
                  onSpam={(msg) => void spam(msg)}
                  onToggleUnread={(msg) => void toggleUnread(msg)}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                  draggable
                />
              )}
            </For>
          </Show>

          <div ref={(el) => (sentinel = el)} data-load-more-sentinel />
          <Show when={paged.hasMore()}>
            <ShowMoreButton loading={paged.loadingMore()} />
          </Show>
        </div>

        <Show when={piles().length > 0}>
          <div class="imbox-piles" data-imbox-piles>
            <For each={piles()}>
              {(p) => <PileCard pile={p} onOpen={(id) => open(id)} />}
            </For>
          </div>
        </Show>
      </Show>
    </div>
  );
}

/* ── Sub-components ─────────────────────────────────────────────────── */

function ImboxHeader(props: {
  total: number;
  newCount: number;
  previouslySeenCount: number;
  onSync: () => void | Promise<void>;
}) {
  return (
    <header
      style={{
        display: "flex",
        "align-items": "center",
        gap: "var(--space-2)",
        padding: "var(--space-4) var(--space-5) var(--space-2)",
      }}
    >
      <h1
        style={{
          "font-family": "var(--font-display)",
          "font-size": "var(--text-h3)",
          "font-weight": "800",
          margin: 0,
        }}
      >
        Imbox
      </h1>
      <span
        style={{
          "font-size": "var(--text-caption)",
          color: "var(--text-muted)",
        }}
      >
        {props.newCount} 待读 · {props.previouslySeenCount} 已读 · {props.total} 总数
      </span>
      <div style={{ flex: 1 }} />
      <button
        onClick={() => void props.onSync()}
        data-sync-now
        style={{
          display: "inline-flex",
          "align-items": "center",
          gap: "4px",
          padding: "4px 10px",
          background: "var(--palm-soft)",
          color: "var(--palm)",
          "border-radius": "var(--radius-pill)",
          "font-size": "var(--text-micro)",
          "font-weight": "700",
          border: "0",
          cursor: "pointer",
        }}
      >
        <Icon name="arrows-clockwise" size={12} /> 同步
      </button>
    </header>
  );
}

function SectionHeader(props: {
  title: string;
  variant: "new" | "seen";
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div
      class={
        "feed-section-header" +
        (props.variant === "new" ? " feed-section-new" : " feed-section-seen")
      }
      data-feed-section={props.variant}
    >
      <span class="feed-section-title">{props.title}</span>
      <Show when={props.action}>
        {(a) => (
          <button class="feed-section-action" onClick={a().onClick}>
            {a().label}
          </button>
        )}
      </Show>
    </div>
  );
}

function EmptyState() {
  return (
    <div class="imbox-empty">
      <Icon name="ph-tray" size={48} />
      <h2>Inbox 是给你的重要邮件</h2>
      <p>
        重要的、需要你来处理的对话会出现在这里。
        <br />
        还没有？等你的下一次签到。
      </p>
    </div>
  );
}

function SkeletonBlock() {
  return (
    <div
      style={{
        "max-width": "720px",
        margin: "var(--space-4) auto",
        padding: "0 var(--space-5)",
      }}
    >
      <SkeletonList count={8} />
    </div>
  );
}

function ShowMoreButton(props: { loading: boolean }) {
  return (
    <div
      style={{
        padding: "var(--space-5)",
        "text-align": "center",
        color: "var(--text-muted)",
        "font-size": "var(--text-caption)",
      }}
    >
      {props.loading ? "加载中…" : "继续滚动加载更多"}
    </div>
  );
}

/* ── Per-item row renderer ─────────────────────────────────────────── */

interface RowProps {
  item: Item;
  index: number;
  isCursor: (i: number) => boolean;
  selectedIds: Set<string>;
  lastSelectedId: string | null;
  contactMap: () => Map<string, Contact>;
  scoreFor: (m: Message) => number;
  bundleOpen: (id: string) => boolean;
  onToggleBundle: (id: string) => void;
  onOpen: (m: Message) => void;
  onToggleSelect: (id: string) => void;
  onSelectRange: (a: string, b: string) => void;
  onReplyLater: (m: Message) => void;
  onSetAside: (m: Message) => void;
  onArchive: (m: Message) => void;
  onTrash: (m: Message) => void;
  onSpam: (m: Message) => void;
  onToggleUnread: (m: Message) => void;
  onApproveFirstTime: (m: Message, b: MessageBucket) => void;
  onBlockFirstTime: (m: Message) => void;
  onBundleSelect: (b: Bundle) => void;
  onDragStart: (m: Message, ev: DragEvent) => void;
  onDragEnd: (ev: DragEvent) => void;
  itemKey: (item: Item) => string;
}

function ItemRow(props: RowProps) {
  if ("messages" in props.item) {
    const bundle = props.item;
    return (
      <BundleCard
        bundle={bundle}
        isCursor={() => props.isCursor(props.index)}
        selectedIds={props.selectedIds}
        contactMap={props.contactMap}
        scoreFor={props.scoreFor}
        isOpen={props.bundleOpen(bundle.contactId)}
        onToggle={() => props.onToggleBundle(bundle.contactId)}
        onOpenFirst={(m) => props.onOpen(m)}
        onSelect={() => props.onBundleSelect(bundle)}
        onSelectRange={props.onSelectRange}
        onDragStart={(m, ev) => props.onDragStart(m, ev)}
        onDragEnd={props.onDragEnd}
      />
    );
  }
  return (
    <MessageCard
      m={props.item}
      index={props.index}
      isCursor={() => props.isCursor(props.index)}
      selectedIds={props.selectedIds}
      lastSelectedId={props.lastSelectedId}
      contact={props.contactMap().get(props.item.pid)}
      scoreFor={props.scoreFor}
      firstTimeSender={isFirstTimeContact(props.contactMap().get(props.item.pid))}
      onOpen={props.onOpen}
      onToggleSelect={props.onToggleSelect}
      onSelectRange={props.onSelectRange}
      onReplyLater={props.onReplyLater}
      onSetAside={props.onSetAside}
      onArchive={props.onArchive}
      onTrash={props.onTrash}
      onSpam={props.onSpam}
      onToggleUnread={props.onToggleUnread}
      onApproveFirstTime={props.onApproveFirstTime}
      onBlockFirstTime={props.onBlockFirstTime}
      onDragStart={props.onDragStart}
      onDragEnd={props.onDragEnd}
      draggable
    />
  );
}

function isFirstTimeContact(c: Contact | undefined) {
  return !c || !!c.firstSeen || !c.screened;
}

/* ── Single message card ───────────────────────────────────────────── */

interface MessageCardProps {
  m: Message;
  index: number;
  isCursor: () => boolean;
  selectedIds: Set<string>;
  lastSelectedId: string | null;
  contact: Contact | undefined;
  scoreFor: (m: Message) => number;
  firstTimeSender?: boolean;
  onOpen: (m: Message) => void;
  onToggleSelect: (id: string) => void;
  onSelectRange: (a: string, b: string) => void;
  onReplyLater: (m: Message) => void;
  onSetAside: (m: Message) => void;
  onArchive: (m: Message) => void;
  onTrash: (m: Message) => void;
  onSpam: (m: Message) => void;
  onToggleUnread: (m: Message) => void;
  onApproveFirstTime?: (m: Message, b: MessageBucket) => void;
  onBlockFirstTime?: (m: Message) => void;
  onDragStart?: (m: Message, ev: DragEvent) => void;
  onDragEnd?: (ev: DragEvent) => void;
  draggable?: boolean;
}

function MessageCard(props: MessageCardProps) {
  const score = () => props.scoreFor(props.m);
  const isSelected = () => props.selectedIds.has(props.m.id);
  const priorityClass = () =>
    score() >= 80 ? " priority-high" : "";
  const cursorClass = () => (props.isCursor() ? " cursor" : "");
  const selectedClass = () => (isSelected() ? " selected" : "");
  const unreadClass = () => (props.m.unread ? " unread" : "");
  const firstTimeClass = () =>
    props.firstTimeSender ? " first-time" : "";

  const preview = () => {
    const raw = props.m.body || props.m.prev || "";
    if (raw.length <= PREVIEW_CHARS) return raw;
    return raw.slice(0, PREVIEW_CHARS).trimEnd() + "…";
  };

  return (
    <article
      class={
        "feed-card" +
        priorityClass() +
        cursorClass() +
        selectedClass() +
        unreadClass() +
        firstTimeClass()
      }
      data-message-id={props.m.id}
      data-feed-card="message"
      draggable={props.draggable}
      onDragStart={(ev) => props.onDragStart?.(props.m, ev)}
      onDragEnd={(ev) => props.onDragEnd?.(ev)}
      onClick={(ev) => {
        // Don't open when the user is interacting with a checkbox, button, or link.
        const target = ev.target as HTMLElement;
        if (target.closest("button, a, input")) return;
        props.onOpen(props.m);
      }}
    >
      <Show when={props.firstTimeSender}>
        <input
          type="checkbox"
          class="select-checkbox"
          checked={isSelected()}
          onClick={(ev) => {
            ev.stopPropagation();
            const id = props.m.id;
            if (ev.shiftKey && props.lastSelectedId) {
              props.onSelectRange(props.lastSelectedId, id);
            } else {
              props.onToggleSelect(id);
            }
          }}
        />
      </Show>

      <Avatar
        name={props.contact?.name ?? "Newsletter"}
        src={props.contact?.avatar}
        size={40}
      />

      <div class="feed-body">
        <div class="feed-top-row">
          <span
            class="feed-name"
            data-feed-name={props.m.pid}
            onClick={(ev) => {
              ev.stopPropagation();
              if (props.contact) {
                props.onOpen(props.m); // detail panel opens; user can switch to ContactPanel from there
              }
            }}
          >
            {props.contact?.name ?? "Unknown"}
          </span>
          <Show when={props.firstTimeSender}>
            <span class="first-time-pill" data-first-time-pill>
              首次发件人
            </span>
          </Show>
          <span class="feed-spacer" />
          <span class="feed-time">{props.m.tm}</span>
        </div>

        <div class="feed-bottom-row">
          <span class="feed-subject">{props.m.subj}</span>
        </div>
        <div class="feed-bottom-row">
          <span class="feed-preview">{preview()}</span>
        </div>

        <Show when={props.firstTimeSender}>
          <div
            class="first-time-actions"
            data-first-time-actions
            onClick={(ev) => ev.stopPropagation()}
          >
            <button
              class="first-time-btn primary"
              onClick={() => props.onApproveFirstTime?.(props.m, "imbox")}
              data-approve-imbox
            >
              批准到 Imbox
            </button>
            <button
              class="first-time-btn"
              onClick={() => props.onApproveFirstTime?.(props.m, "feed")}
              data-approve-feed
            >
              Stream
            </button>
            <button
              class="first-time-btn"
              onClick={() => props.onApproveFirstTime?.(props.m, "paperTrail")}
              data-approve-paper
            >
              Records
            </button>
            <button
              class="first-time-btn"
              onClick={() => props.onBlockFirstTime?.(props.m)}
              data-block-sender
            >
              阻止
            </button>
          </div>
        </Show>
      </div>

      <div class="feed-card-actions" data-feed-card-actions>
        <button
          class="feed-card-action-btn"
          title="Pending (l)"
          onClick={(ev) => {
            ev.stopPropagation();
            props.onReplyLater(props.m);
          }}
        >
          <Icon name="ph-clock" size={14} />
        </button>
        <button
          class="feed-card-action-btn"
          title="Saved (s)"
          onClick={(ev) => {
            ev.stopPropagation();
            props.onSetAside(props.m);
          }}
        >
          <Icon name="ph-push-pin" size={14} />
        </button>
        <button
          class="feed-card-action-btn"
          title="Archive (e)"
          onClick={(ev) => {
            ev.stopPropagation();
            props.onArchive(props.m);
          }}
        >
          <Icon name="ph-archive" size={14} />
        </button>
        <button
          class="feed-card-action-btn"
          title="Trash (#)"
          onClick={(ev) => {
            ev.stopPropagation();
            props.onTrash(props.m);
          }}
        >
          <Icon name="ph-trash" size={14} />
        </button>
        <button
          class="feed-card-action-btn"
          title={props.m.unread ? "Mark as Read" : "Mark as Unread"}
          onClick={(ev) => {
            ev.stopPropagation();
            props.onToggleUnread(props.m);
          }}
        >
          <Icon name={props.m.unread ? "ph-eye" : "ph-eye-slash"} size={14} />
        </button>
      </div>
    </article>
  );
}

/* ── Bundle card (3+ unread from same sender) ─────────────────────── */

interface BundleCardProps {
  bundle: Bundle;
  isCursor: () => boolean;
  selectedIds: Set<string>;
  contactMap: () => Map<string, Contact>;
  scoreFor: (m: Message) => number;
  isOpen: boolean;
  onToggle: () => void;
  onOpenFirst: (m: Message) => void;
  onSelect: () => void;
  onSelectRange: (a: string, b: string) => void;
  onDragStart: (m: Message, ev: DragEvent) => void;
  onDragEnd: (ev: DragEvent) => void;
}

function BundleCard(props: BundleCardProps) {
  const selCount = () =>
    props.bundle.messages.filter((m) => props.selectedIds.has(m.id)).length;
  const allSelected = () =>
    selCount() === props.bundle.messages.length;
  const someSelected = () => selCount() > 0 && !allSelected();
  const stateClass = () =>
    allSelected() ? "selected" : someSelected() ? "indeterminate" : "";

  const expanded = () => props.isOpen;

  return (
    <article
      class={
        "feed-card feed-card-bundle" +
        (props.isCursor() ? " cursor" : "") +
        (expanded() ? " expanded" : "")
      }
      data-feed-card="bundle"
      data-bundle-id={props.bundle.contactId}
      onClick={(ev) => {
        const target = ev.target as HTMLElement;
        if (target.closest(".bundle-drawer-row, button, input")) return;
        props.onToggle();
      }}
    >
      <div class="feed-card-top">
        <input
          type="checkbox"
          class={
            "select-checkbox" +
            (someSelected() || allSelected() ? " " + stateClass() : "")
          }
          checked={allSelected()}
          onClick={(ev) => {
            ev.stopPropagation();
            props.onSelect();
          }}
        />
        <Avatar
          name={props.bundle.contact.name}
          src={props.bundle.contact.avatar}
          size={40}
        />
        <div class="feed-body">
          <div class="feed-top-row">
            <span class="feed-name">
              {props.bundle.contact.name} · {props.bundle.messages.length} 封邮件
            </span>
            <span class="feed-spacer" />
            <span class="feed-time">{props.bundle.messages[0]?.tm ?? ""}</span>
          </div>
          <div class="feed-bottom-row">
            <span class="feed-subject">
              {props.bundle.messages[0]?.subj ?? "(无主题)"}
            </span>
          </div>
        </div>
        <span class="feed-card-bundle-count">{props.bundle.messages.length}</span>
      </div>
      <div class="bundle-drawer">
        <For each={props.bundle.messages}>
          {(m) => (
            <div
              class="bundle-drawer-row"
              data-bundle-row={m.id}
              draggable
              onDragStart={(ev) => props.onDragStart(m, ev)}
              onDragEnd={(ev) => props.onDragEnd(ev)}
              onClick={() => props.onOpenFirst(m)}
            >
              <div class="bundle-drawer-line">{m.subj || "(无主题)"}</div>
              <div class="bundle-drawer-meta">{m.tm}</div>
            </div>
          )}
        </For>
      </div>
    </article>
  );
}

/* ── Pile card ──────────────────────────────────────────────────────── */

function PileCard(props: { pile: Pile; onOpen: (id: string) => void }) {
  return (
    <div
      class="imbox-pile"
      data-pile={props.pile.id}
      onClick={(ev) => {
        const target = ev.target as HTMLElement;
        if (target.closest(".imbox-pile-row")) return;
        // No-op: clicking the pile header itself shouldn't navigate anywhere.
      }}
    >
      <div class="imbox-pile-header">
        <Icon name={props.pile.icon} size={12} />
        <span>{props.pile.title}</span>
        <span class="imbox-pile-count">{props.pile.messages.length}</span>
      </div>
      <div class="imbox-pile-list">
        <For each={props.pile.messages.slice(0, 3)}>
          {(m) => (
            <div
              class="imbox-pile-row"
              data-pile-row={m.id}
              onClick={() => props.onOpen(m.id)}
            >
              {m.subj || "(无主题)"}
            </div>
          )}
        </For>
        <Show when={props.pile.messages.length > 3}>
          <div
            class="imbox-pile-row"
            style={{
              color: "var(--text-muted)",
              "font-style": "italic",
            }}
          >
            + {props.pile.messages.length - 3} 更多…
          </div>
        </Show>
      </div>
    </div>
  );
}

/* ── useRefreshEffect helpers (kept inline so we don't pull gestures.ts) ──── */

function useRefreshEffect(callback: () => void) {
  createEffect(() => {
    const _ = refreshTick();
    void _;
    callback();
  });
}

function useSoftRefreshEffect(callback: () => void) {
  createEffect(() => {
    const _ = softRefreshTick();
    void _;
    callback();
  });
}

const _placeholder = getMessage; // keep import used
void _placeholder;