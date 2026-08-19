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
  type JSX,
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
  setView,
  getSortMode,
  type ViewName,
} from "../stores/ui";
import { Avatar } from "../components/Avatar";
import { Icon } from "../components/Icon";
import { SkeletonList } from "../components/Skeleton";
import { priorityScore } from "../utils/priority";
import { SORT_LABELS, type SortMode } from "../utils/sort-imbox";
import { bucketLabel, dateBucket, type DateBucketKey } from "../utils/date";
import { registerPrepend } from "../services/sync-events";
import { FilterPanel } from "../components/FilterPanel";

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
  /** View name to navigate to from the drawer's "Open board" button.
   *  "focusReply" for Pending (it's the de facto Pending board), dedicated
   *  pile board views for Saved / Remind. */
  openBoardView: ViewName;
  /** True when the pile's destination view is the Focus & Reply flow
   *  (i.e. Pending) — we surface a "Focus & Reply" action button next
   *  to the title in addition to the regular "Open board" link. */
  hasFocusAction: boolean;
}

const BUNDLE_THRESHOLD = 3;
const PREVIEW_CHARS = 220;
const PAGE_SIZE = 100;

type ImboxTabId = "new" | "seen";

export function Imbox() {
  // Two separate paginated resources so "New for you" and "Previously
  // seen" each have their own scroll position and bundle window.
  // Previously this view used one paged query and split the loaded
  // rows client-side; with 1000+ imbox messages that meant read
  // messages older than the first 100 never showed up in the
  // "Previously seen" section, so users couldn't find what they'd
  // already read (the original bug report).
  const newPaged = usePaginatedMessages(
    {
      bucket: "imbox",
      direction: "in",
      unreadOnly: true,
      lightweight: true,
    },
    PAGE_SIZE,
  );
  const seenPaged = usePaginatedMessages(
    {
      bucket: "imbox",
      direction: "in",
      readOnly: true,
      lightweight: true,
    },
    PAGE_SIZE,
  );
  const [activeTab, setActiveTab] = createSignal<ImboxTabId>("new");

  /** The paginated resource for the currently-active tab. Most derived
   *  memos and handlers read through this so a tab switch re-derives
   *  against the right slice. */
  const paged = () => (activeTab() === "new" ? newPaged : seenPaged);
  const items = () => paged().items();

  // Pile slices: only the rows shown in the Pending / Saved / Remind piles.
  // We deliberately do NOT load the full messages table here — real mailboxes
  // have thousands of rows with large HTML bodies, and pulling them all on
  // every refresh tick or tab return is the main source of scroll jank.
  const [pileMessages, { refetch: refetchPiles }] = createResource(listPileMessages);
  const [contacts, { refetch: refetchContacts }] = createResource(listContacts);

  // Live-prepend on sync:new-messages — the event reports all UIDs, but
  // they always arrive unread so they only belong in newPaged. Filtering
  // on the server side via unreadOnly makes that cheap.
  onCleanup(
    registerPrepend("imbox", (ids) => {
      void newPaged.prependByIds(ids);
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
    void newPaged.refresh();
    void seenPaged.refresh();
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

  // Group by sender for bundle detection. Sort honors the user's
  // selected sort mode (default = newest first — see utils/sort-imbox.ts).
  // Priority sort stays available as "most_relevant" for users who want
  // HEY-style ordering.
  const renderList = createMemo<ItemList>(() => {
    const list = items().filter((m) => !m.setAside && !m.replyLater);

    const bySender = new Map<string, Message[]>();
    for (const m of list) {
      const arr = bySender.get(m.pid) ?? [];
      arr.push(m);
      bySender.set(m.pid, arr);
    }

    const out: Item[] = [];
    for (const [pid, msgs] of bySender) {
      if (msgs.length >= BUNDLE_THRESHOLD) {
        const c = contactMap().get(pid);
        if (c) {
          out.push({ contactId: pid, contact: c, messages: msgs });
          continue;
        }
      }
      for (const m of msgs) out.push(m);
    }

    const mode = getSortMode("imbox");
    if (mode === "most_relevant") {
      out.sort((a, b) => {
        const sa = "messages" in a
          ? Math.max(...a.messages.map(scoreFor))
          : scoreFor(a);
        const sb = "messages" in b
          ? Math.max(...b.messages.map(scoreFor))
          : scoreFor(b);
        if (sb !== sa) return sb - sa;
        const da = "messages" in a
          ? Math.max(...a.messages.map((m) => new Date(m.st).getTime()))
          : new Date(a.st).getTime();
        const db = "messages" in b
          ? Math.max(...b.messages.map((m) => new Date(m.st).getTime()))
          : new Date(b.st).getTime();
        return db - da;
      });
    } else {
      const timeOf = (it: Item) =>
        "messages" in it
          ? Math.max(...it.messages.map((m) => new Date(m.st).getTime()))
          : new Date(it.st).getTime();
      const dir = mode === "oldest" ? 1 : -1;
      out.sort((a, b) => dir * (timeOf(a) - timeOf(b)));
    }
    return out;
  });

  // With tabs, each section is its own paginated slice — both already
  // carry unread/read filtering server-side. So `newForYou` and
  // `previouslySeen` are just the current paged view, plus bundle
  // grouping applied to the active tab.
  const activeList = createMemo<ItemList>(() => renderList());

  /* ── Piles (Pending / Saved / Remind) ─────────────────────────────── */

  const piles = createMemo((): Pile[] => {
    const all = pileMessages() ?? [];
    const all_piles: Pile[] = [
      {
        id: "pending",
        icon: "ph-clock",
        title: "Pending",
        messages: all.filter((m) => m.replyLater),
        openBoardView: "focusReply",
        hasFocusAction: true,
      },
      {
        id: "saved",
        icon: "ph-push-pin",
        title: "Saved",
        messages: all.filter((m) => m.setAside),
        openBoardView: "setAside",
        hasFocusAction: false,
      },
      {
        id: "remind",
        icon: "ph-arrow-fat-line-up",
        title: "Remind",
        messages: all.filter((m) => m.bubbleUpAt),
        openBoardView: "bubbleUp",
        hasFocusAction: false,
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

  /* ── Filter modal state ──────────────────────────────────────────── */

  const [filterOpen, setFilterOpen] = createSignal(false);
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
    activeList().map((x) => ("messages" in x ? x.contactId : x.id)),
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
    const item = activeList()[next];
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

  /** Both paginated resources get the remove attempt — `removeByIds` is a
   *  no-op if the message isn't present in the loaded window, so calling
   *  it on both tabs is safe and we don't have to know which tab the user
   *  was looking at when the action fired. */
  const removeFromBoth = (id: string) => {
    newPaged.removeByIds([id]);
    seenPaged.removeByIds([id]);
  };

  const refreshAll = async () => {
    await newPaged.refresh();
    await seenPaged.refresh();
    await refetchPiles();
  };

  const replyLater = async (m: Message) => {
    removeFromBoth(m.id);
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
    removeFromBoth(m.id);
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
    removeFromBoth(m.id);
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
    removeFromBoth(m.id);
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
    removeFromBoth(m.id);
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
      // If the message just became unread, push it to the new tab; if it
      // just became read, push it to the seen tab. The opposite tab also
      // gets a remove to keep totals consistent.
      if (m.unread) {
        seenPaged.removeByIds([m.id]);
        await newPaged.prependByIds([m.id]);
      } else {
        newPaged.removeByIds([m.id]);
        await seenPaged.prependByIds([m.id]);
      }
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
      // Optimistic — remove from the unread tab and prepend to the
      // read tab so the user sees the message disappear immediately.
      // The DB write is the source of truth; MessagePanel also patches
      // on mount so this is idempotent.
      newPaged.removeByIds([m.id]);
      try {
        await seenPaged.prependByIds([m.id]);
        await upsertMessage({ ...m, unread: false });
      } catch {
        // Restore on failure — re-prepend to newPaged and refetch
        // seenPaged so we don't keep a phantom.
        await newPaged.refresh();
        await seenPaged.refresh();
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
        if (!entry?.isIntersecting) return;
        const cur = paged();
        if (cur.hasMore() && !cur.loadingMore()) {
          void cur.loadMore();
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
      newPaged.total() > 0 ||
      seenPaged.total() > 0 ||
      piles().length > 0,
  );

  return (
    <div class="imbox-view">
      <ImboxHeader
        total={newPaged.total() + seenPaged.total()}
        newCount={newPaged.total()}
        previouslySeenCount={seenPaged.total()}
        onSync={async () => {
          await newPaged.refresh();
          await seenPaged.refresh();
          showToast({ message: "已刷新", kind: "info", ttlMs: 1500 });
        }}
        onOpenFilters={() => setFilterOpen(true)}
        activeSort={getSortMode("imbox")}
      />

      <ImboxTabs
        active={activeTab()}
        newCount={newPaged.total()}
        seenCount={seenPaged.total()}
        onChange={setActiveTab}
      />

      <FilterPanel
        open={filterOpen()}
        viewName="imbox"
        onClose={() => setFilterOpen(false)}
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
            when={paged().loadingMore() || items().length === 0}
            fallback={<EmptyState />}
          >
            <SkeletonBlock />
          </Show>
        }
      >
        <div class="feed-list" data-feed-list>
          {/* "New for you" tab gets the unread SectionHeader + 一起读
              action; "Previously seen" doesn't. Each tab renders its own
              list below; date group anchors let the user jump by recency
              even when there are hundreds of unread messages. */}
          <Show when={activeTab() === "new" && activeList().length > 0}>
            <SectionHeader
              title="New for you"
              variant="new"
              action={{ label: "一起读", onClick: () => setView("readTogether") }}
            />
          </Show>

          <DateGroupedList items={activeList()}>
            {(item, i) => (
              <ItemRow
                item={item}
                index={i}
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
          </DateGroupedList>

          <div ref={(el) => (sentinel = el)} data-load-more-sentinel />
          <Show when={paged().hasMore()}>
            <ShowMoreButton loading={paged().loadingMore()} />
          </Show>
        </div>

        <Show when={piles().length > 0}>
          <div class="imbox-piles" data-imbox-piles>
            <For each={piles()}>
              {(p) => (
                <PileCard
                  pile={p}
                  contacts={contacts() ?? []}
                  onOpen={(id) => open(id)}
                />
              )}
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
  onOpenFilters: () => void;
  activeSort: SortMode;
}) {
  return (
    <header
      style={{
        padding: "var(--space-5) var(--space-5) var(--space-3)",
      }}
    >
      <h1
        style={{
          "font-family": "var(--font-display)",
          "font-size": "var(--text-h1)",
          "font-weight": "800",
          "letter-spacing": "-0.02em",
          "line-height": "1.1",
          margin: 0,
        }}
      >
        Imbox
      </h1>
      <div
        style={{
          display: "flex",
          "align-items": "center",
          gap: "var(--space-2)",
          "margin-top": "var(--space-2)",
        }}
      >
        <span
          style={{
            "font-size": "var(--text-caption)",
            color: "var(--text-muted)",
          }}
        >
          {props.newCount} 待读 · {props.previouslySeenCount} 已读 · {props.total} 总数
        </span>
        <span
          style={{
            "font-size": "var(--text-micro)",
            color: "var(--text-muted)",
            padding: "2px 8px",
            background: "var(--paper-mid)",
            "border-radius": "var(--radius-pill)",
            "font-weight": "700",
          }}
          data-active-sort
        >
          {SORT_LABELS[props.activeSort]}
        </span>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => props.onOpenFilters()}
          data-open-filters
          title="More filters"
          aria-label="More filters"
          style={{
            display: "inline-flex",
            "align-items": "center",
            gap: "4px",
            padding: "4px 10px",
            background: "transparent",
            color: "var(--text-secondary)",
            "border-radius": "var(--radius-pill)",
            "font-size": "var(--text-micro)",
            "font-weight": "700",
            border: "0.5px solid var(--border)",
            cursor: "pointer",
          }}
        >
          <Icon name="ph-sliders-horizontal" size={12} /> 筛选
        </button>
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
      </div>
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

function PileCard(props: {
  pile: Pile;
  contacts: Contact[];
  onOpen: (id: string) => void;
}) {
  // Default collapsed — matches prototype §renderImboxPile (line 2993:
  // `state.expandedPile === pileId` is false on first render).
  const [expanded, setExpanded] = createSignal(false);
  const toggle = (ev: MouseEvent) => {
    const target = ev.target as HTMLElement;
    if (target.closest(".pile-drawer-row, .pile-drawer-action, button")) return;
    setExpanded((v) => !v);
  };

  const contactMap = createMemo<Map<string, Contact>>(() => {
    const map = new Map<string, Contact>();
    for (const c of props.contacts) map.set(c.id, c);
    return map;
  });

  const previewRows = createMemo(() => props.pile.messages.slice(0, 5));

  return (
    <div
      class={"imbox-pile" + (expanded() ? " expanded" : "")}
      data-pile={props.pile.id}
      data-expanded={expanded() ? "true" : "false"}
      onClick={toggle}
    >
      <div class="imbox-pile-header">
        <Icon name={props.pile.icon} size={12} />
        <span class="imbox-pile-title">{props.pile.title}</span>
        <span class="imbox-pile-count">{props.pile.messages.length}</span>
        <Show when={props.pile.hasFocusAction}>
          <button
            type="button"
            class="imbox-pile-focus-btn"
            data-pile-focus-btn
            title="Focus & Reply (o)"
            onClick={(ev) => {
              ev.stopPropagation();
              setView(props.pile.openBoardView);
            }}
          >
            <Icon name="ph-target" size={12} />
            <span>Focus & Reply</span>
          </button>
        </Show>
      </div>

      <Show when={expanded()}>
        <div class="pile-drawer" data-pile-drawer>
          <For each={previewRows()}>
            {(m) => {
              const c = contactMap().get(m.pid);
              return (
                <div
                  class="pile-drawer-row"
                  data-pile-drawer-row={m.id}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    props.onOpen(m.id);
                  }}
                >
                  <div class="pile-drawer-avatar">
                    {(c?.name ?? "?").charAt(0).toUpperCase()}
                  </div>
                  <div class="pile-drawer-body">
                    <div class="pile-drawer-subj">
                      {m.subj || "(无主题)"}
                    </div>
                    <div class="pile-drawer-from">
                      {c?.name ?? m.pid}
                    </div>
                  </div>
                  <span class="pile-drawer-time">{m.tm}</span>
                </div>
              );
            }}
          </For>
          <Show when={props.pile.messages.length > 5}>
            <div
              class="pile-drawer-more"
              data-pile-drawer-more
            >
              + {props.pile.messages.length - 5} more
            </div>
          </Show>
          <div class="pile-drawer-actions">
            <Show when={props.pile.hasFocusAction}>
              <button
                type="button"
                class="pile-drawer-action pile-focus-btn"
                data-pile-focus-drawer
                onClick={(ev) => {
                  ev.stopPropagation();
                  setView(props.pile.openBoardView);
                }}
              >
                <Icon name="ph-target" size={12} />
                <span>Focus & Reply</span>
              </button>
            </Show>
            <button
              type="button"
              class="pile-drawer-action pile-board-btn"
              data-pile-open-board
              onClick={(ev) => {
                ev.stopPropagation();
                setView(props.pile.openBoardView);
              }}
            >
              Open {props.pile.title} board
            </button>
          </div>
        </div>
      </Show>
    </div>
  );
}

/* ── ImboxTabs ───────────────────────────────────────────────────── */

function ImboxTabs(props: {
  active: ImboxTabId;
  newCount: number;
  seenCount: number;
  onChange: (tab: ImboxTabId) => void;
}) {
  return (
    <nav
      class="imbox-tabs"
      data-imbox-tabs
      role="tablist"
      aria-label="Imbox sections"
      style={{
        display: "flex",
        gap: "0",
        "border-bottom": "0.5px solid var(--border)",
        "background-color": "var(--paper)",
        position: "sticky",
        top: "0",
        "z-index": "5",
      }}
    >
      <ImboxTabButton
        label="New for you"
        icon="ph-envelope-simple-open"
        active={props.active === "new"}
        count={props.newCount}
        highlight={props.newCount > 0}
        onClick={() => props.onChange("new")}
        dataTab="new"
      />
      <ImboxTabButton
        label="Previously seen"
        icon="ph-envelope-open"
        active={props.active === "seen"}
        count={props.seenCount}
        highlight={false}
        onClick={() => props.onChange("seen")}
        dataTab="seen"
      />
    </nav>
  );
}

function ImboxTabButton(props: {
  label: string;
  icon: string;
  active: boolean;
  count: number;
  highlight: boolean;
  onClick: () => void;
  dataTab: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={props.active}
      data-imbox-tab={props.dataTab}
      onClick={props.onClick}
      style={{
        flex: "1",
        padding: "12px 16px",
        background: "transparent",
        border: "0",
        "border-bottom": props.active
          ? "2px solid var(--palm)"
          : "2px solid transparent",
        "margin-bottom": "-0.5px",
        cursor: "pointer",
        display: "flex",
        "align-items": "center",
        "justify-content": "center",
        gap: "8px",
        color: props.active ? "var(--text-primary)" : "var(--text-muted)",
        "font-weight": props.active ? "700" : "600",
        "font-size": "var(--text-body-sm)",
        transition: "color 0.15s var(--ease-out)",
      }}
    >
      <Icon name={props.icon} size={14} />
      <span>{props.label}</span>
      <Show when={props.count > 0}>
        <span
          style={{
            display: "inline-flex",
            "align-items": "center",
            "justify-content": "center",
            "min-width": "20px",
            height: "20px",
            padding: "0 6px",
            "border-radius": "var(--radius-pill)",
            background: props.highlight && !props.active ? "var(--palm)" : "var(--paper-mid)",
            color: props.highlight && !props.active ? "white" : "var(--text-secondary)",
            "font-size": "var(--text-micro)",
            "font-weight": "700",
            "line-height": "1",
          }}
        >
          {props.count > 999 ? "999+" : props.count}
        </span>
      </Show>
    </button>
  );
}

/* ── DateGroupedList ─────────────────────────────────────────────── */

/** Render an ItemList with date-bucket anchors between groups. Anchors
 *  keep their DOM nodes when items within a bucket re-shuffle, so the
 *  browser doesn't lose scroll position. Each bucket header is clickable
 *  to set the cursor to its first item, so the user can jump to a date
 *  range without scrolling through 100s of unread. */
function DateGroupedList(props: {
  items: Item[];
  children: (item: Item, i: number) => JSX.Element;
}) {
  const groups = createMemo<
    Array<{ key: string; label: string; items: Array<Item & { _flatIdx: number }> }>
  >(() => {
    const all = props.items;
    const out: Array<{
      key: string;
      label: string;
      items: Array<Item & { _flatIdx: number }>;
    }> = [];
    let flatIdx = 0;
    let currentKey: string | null = null;
    for (const item of all) {
      const firstMessage: Message =
        "messages" in item ? item.messages[0]! : item;
      const bucket: DateBucketKey = dateBucket(firstMessage.st);
      const key =
        typeof bucket === "string"
          ? bucket
          : `${bucket.year}-${bucket.month}`;
      if (key !== currentKey) {
        out.push({ key, label: bucketLabel(bucket), items: [] });
        currentKey = key;
      }
      out[out.length - 1]!.items.push(
        Object.assign(item, { _flatIdx: flatIdx }) as Item & {
          _flatIdx: number;
        },
      );
      flatIdx++;
    }
    return out;
  });

  return (
    <For each={groups()}>
      {(group) => (
        <section
          class="imbox-date-group"
          data-imbox-date-group={group.key}
        >
          <header
            class="imbox-date-header"
            data-imbox-date-header
          >
            <span class="imbox-date-header-label">{group.label}</span>
            <span class="imbox-date-header-count">{group.items.length}</span>
          </header>
          <For each={group.items}>
            {(item) => props.children(item, item._flatIdx)}
          </For>
        </section>
      )}
    </For>
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