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
  upsertContact,
  markMessageUnread,
  setMessagePileFlags,
} from "../stores/data";
import { type PileMessage } from "../stores/data";
import { usePaginatedMessages } from "../utils/paginated-messages";
import type { Contact, Message, MessageBucket } from "../types";
import { startDrag, endDrag, type DragTarget } from "../utils/drag";
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
  commandPaletteOpen,
  searchOpen,
  notificationsOpen,
  composeOpen,
  helpOpen,
  detailOpen,
  agentPanelOpen,
  type ViewName,
} from "../stores/ui";
import { Avatar } from "../components/Avatar";
import { Icon } from "../components/Icon";
import { SkeletonList } from "../components/Skeleton";
import { Empty, ErrorState } from "../components/Empty";
import { SwipeActions } from "../components/SwipeActions";
import { priorityScore } from "../utils/priority";
import { SORT_LABELS, type SortMode } from "../utils/sort-imbox";
import { registerPrepend } from "../services/sync-events";
import { FilterPanel } from "../components/FilterPanel";
import { groupItemsByDate, isImboxListMessage } from "./Imbox-helpers";

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
  /** View name to navigate to from the drawer's "查看全部" button. */
  openBoardView: ViewName;
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

  // Bucket-changing actions (trash, archive, spam, …) call
  // bumpRefreshTick() in MessagePanel. The high-frequency sync ticks
  // are handled by softRefreshTick + prependByIds; the rare "user
  // moved a message to a different bucket" case needs a real refetch
  // so both tabs agree on which rows they own. Skip the initial mount
  // tick to avoid double-fetching right after the resource resolves.
  let _refreshSkipMount = true;
  createEffect(() => {
    // Touch the tick so this effect re-runs when it changes.
    refreshTick();
    if (_refreshSkipMount) {
      _refreshSkipMount = false;
      return;
    }
    void newPaged.refresh();
    void seenPaged.refresh();
  });

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
  // (Predicate lives in `isFirstTimeContact` below, next to MessageCard.)

  // Per-message priority score (matches prototype §priorityScore).
  const scoreFor = (m: Message) => {
    const c = contactMap().get(m.pid);
    return priorityScore(m, c);
  };

  // Group by sender for bundle detection. Sort honors the user's
  // selected sort mode (default = newest first — see utils/sort-imbox.ts).
  // Priority sort stays available as "most_relevant" for users who want
  // HEY-style ordering.
  //
  // Perf: pre-compute per-item sort keys (priority score, timestamp) ONCE
  // and decorate the array. The previous comparator called
  // `new Date(m.st).getTime()` and `priorityScore(m, contactMap().get(...))`
  // on every comparison — for 100 items that's 700+ Date allocations and
  // 700+ Map lookups per sort, every time `items()` or `contactMap()`
  // changes. WKWebView (real Tauri) is 2-3x more sensitive to this than
  // Chrome and the dominant cost during the "tab switch → scroll" window.
  const renderList = createMemo<ItemList>(() => {
    const list = items().filter(isImboxListMessage);
    const map = contactMap();

    const bySender = new Map<string, Message[]>();
    for (const m of list) {
      const arr = bySender.get(m.pid) ?? [];
      arr.push(m);
      bySender.set(m.pid, arr);
    }

    // Decorate each output row with pre-computed sort keys. Item is
    // { kind: "msg", m, _ts, _score } or { kind: "bundle", bundle,
    // contact, _ts, _score }. The comparator only reads the pre-computed
    // fields — no per-call Date/Map work.
    type Decorated =
      | { kind: "msg"; item: Item; m: Message; _ts: number; _score: number }
      | {
          kind: "bundle";
          item: Item;
          bundle: { contactId: string; contact: Contact; messages: Message[] };
          _ts: number;
          _score: number;
        };
    const decorated: Decorated[] = [];
    for (const [pid, msgs] of bySender) {
      if (msgs.length >= BUNDLE_THRESHOLD) {
        const c = map.get(pid);
        if (c) {
          const bundle = { contactId: pid, contact: c, messages: msgs };
          const item: Item = bundle;
          let maxTs = 0;
          let maxScore = -Infinity;
          for (const m of msgs) {
            const ts = Date.parse(m.st) || 0;
            const sc = priorityScore(m, c);
            if (ts > maxTs) maxTs = ts;
            if (sc > maxScore) maxScore = sc;
          }
          decorated.push({
            kind: "bundle",
            item,
            bundle,
            _ts: maxTs,
            _score: maxScore,
          });
          continue;
        }
      }
      for (const m of msgs) {
        const item: Item = m;
        decorated.push({
          kind: "msg",
          item,
          m,
          _ts: Date.parse(m.st) || 0,
          _score: priorityScore(m, map.get(m.pid)),
        });
      }
    }

    const mode = getSortMode("imbox");
    if (mode === "most_relevant") {
      decorated.sort((a, b) => {
        if (b._score !== a._score) return b._score - a._score;
        return b._ts - a._ts;
      });
    } else {
      const dir = mode === "oldest" ? 1 : -1;
      decorated.sort((a, b) => dir * (a._ts - b._ts));
    }
    return decorated.map((d) => d.item);
  });

  // With tabs, each section is its own paginated slice — both already
  // carry unread/read filtering server-side. So `newForYou` and
  // `previouslySeen` are just the current paged view, plus bundle
  // grouping applied to the active tab.
  //
  // No-op memo removed (was `createMemo(() => renderList())`). It
  // added a reactive layer that downstream `flatIds`, the
  // `<DateGroupedList items={activeList()}>` prop, and the bundle
  // drawer state all subscribed to, doubling the reactive update
  // fan-out on every `items()` change. Direct pass-through is
  // identical from a consumer's perspective.
  const activeList = renderList;

  /* ── Piles (Pending / Saved / Remind) ─────────────────────────────── */

  const piles = createMemo((): Pile[] => {
    const all = pileMessages() ?? [];
    const all_piles: Pile[] = [
      {
        id: "pending",
        icon: "ph-clock",
        title: "稍后回复",
        messages: all.filter((m) => m.replyLater),
        // The pile board for Pending is the plain list; the focused
        // reply flow lives on the standalone 专注回复 button next to
        // the piles row (see the render below).
        openBoardView: "replyLater",
      },
      {
        id: "saved",
        icon: "ph-push-pin",
        title: "已搁置",
        messages: all.filter((m) => m.setAside),
        openBoardView: "setAside",
      },
      {
        id: "remind",
        icon: "ph-arrow-fat-line-up",
        title: "提醒",
        messages: all.filter((m) => m.bubbleUpAt),
        openBoardView: "bubbleUp",
      },
    ];
    return all_piles.filter((p) => p.messages.length > 0);
  });

  // Count for the standalone 专注回复 button (shown when the Pending
  // pile is non-empty).
  const pendingCount = createMemo(
    () => (pileMessages() ?? []).filter((m) => m.replyLater).length,
  );

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

  /* ── Bulk actions (mouse-discoverable bar when selection exists) ── */

  const bulkMove = async (
    bucket: "paperTrail" | "trash",
    doneMsg: string,
  ) => {
    const ids = [...selectedIds()];
    if (ids.length === 0) return;
    clearSelection();
    for (const id of ids) removeFromBoth(id);
    try {
      for (const id of ids) await moveMessageToBucket(id, bucket);
      await refreshAll();
      showToast({
        message: `${doneMsg}（${ids.length} 封）`,
        kind: "success",
        action: {
          label: "撤销",
          run: async () => {
            for (const id of ids) await moveMessageToBucket(id, "imbox");
            await refreshAll();
            showToast({ message: "已撤销", kind: "success" });
          },
        },
      });
    } catch (err) {
      console.error("[imbox] bulk move failed:", err);
      await refreshAll();
      showToast({ message: "操作失败，请重试", kind: "error" });
    }
  };

  const bulkPending = async () => {
    const ids = [...selectedIds()];
    if (ids.length === 0) return;
    clearSelection();
    for (const id of ids) removeFromBoth(id);
    try {
      for (const id of ids) {
        await setMessagePileFlags(id, {
          replyLater: true,
          setAside: false,
          bubbleUpAt: null,
        });
      }
      await refreshAll();
      showToast({
        message: `已加入稍后回复（${ids.length} 封）`,
        kind: "success",
        action: {
          label: "撤销",
          run: async () => {
            for (const id of ids) {
              await setMessagePileFlags(id, {
                replyLater: false,
                setAside: false,
                bubbleUpAt: null,
              });
            }
            await refreshAll();
            showToast({ message: "已撤销", kind: "success" });
          },
        },
      });
    } catch (err) {
      console.error("[imbox] bulk pending failed:", err);
      await refreshAll();
      showToast({ message: "操作失败，请重试", kind: "error" });
    }
  };

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
      if (id) {
        setSelectedMessageId(id);
        // Keep the cursor row visible — without this, j/k walks the
        // highlight off-screen and the user loses track of position.
        document
          .querySelector(`[data-message-id="${CSS.escape(id)}"]`)
          ?.scrollIntoView({ block: "nearest" });
      }
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
      // Scoped flag update — `m` is a lightweight list row (no body);
      // upserting it would wipe the stored body (§11.7 projection).
      // Setting one pile flag clears the others (prototype
      // clearWorkflowFlags semantics).
      await setMessagePileFlags(m.id, {
        replyLater: true,
        setAside: false,
        bubbleUpAt: null,
      });
      await refetchPiles();
      showToast({
        message: "已加入稍后回复",
        kind: "success",
        action: {
          label: "撤销",
          run: async () => {
            await setMessagePileFlags(m.id, {
              replyLater: false,
              setAside: false,
              bubbleUpAt: null,
            });
            await refreshAll();
            showToast({ message: "已撤销", kind: "success" });
          },
        },
      });
    } catch (err) {
      console.error("[imbox] replyLater failed:", err);
      await refreshAll();
      showToast({ message: "操作失败，请重试", kind: "error" });
    }
  };

  const setAside = async (m: Message) => {
    removeFromBoth(m.id);
    try {
      await setMessagePileFlags(m.id, {
        replyLater: false,
        setAside: true,
        bubbleUpAt: null,
      });
      await refetchPiles();
      showToast({
        message: "已搁置",
        kind: "success",
        action: {
          label: "撤销",
          run: async () => {
            await setMessagePileFlags(m.id, {
              replyLater: false,
              setAside: false,
              bubbleUpAt: null,
            });
            await refreshAll();
            showToast({ message: "已撤销", kind: "success" });
          },
        },
      });
    } catch (err) {
      console.error("[imbox] setAside failed:", err);
      await refreshAll();
      showToast({ message: "操作失败，请重试", kind: "error" });
    }
  };

  /** Park a message in the Remind pile. Default time = tomorrow 9:00
   *  local, matching the `message:bubble-up` shortcut. */
  const remind = async (m: Message, whenIso: string, label: string) => {
    removeFromBoth(m.id);
    try {
      await setMessagePileFlags(m.id, {
        replyLater: false,
        setAside: false,
        bubbleUpAt: whenIso,
      });
      await refetchPiles();
      showToast({
        message: `已设为${label}提醒`,
        kind: "success",
        action: {
          label: "撤销",
          run: async () => {
            await setMessagePileFlags(m.id, {
              replyLater: false,
              setAside: false,
              bubbleUpAt: null,
            });
            await refreshAll();
            showToast({ message: "已撤销", kind: "success" });
          },
        },
      });
    } catch (err) {
      console.error("[imbox] remind failed:", err);
      await refreshAll();
      showToast({ message: "操作失败，请重试", kind: "error" });
    }
  };

  const remindTomorrow = (m: Message) => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    return remind(m, tomorrow.toISOString(), "明天 9:00");
  };

  const archive = async (m: Message) => {
    removeFromBoth(m.id);
    try {
      await moveMessageToBucket(m.id, "paperTrail");
      await refetchPiles();
      showToast({
        message: "已归档到 Records",
        kind: "success",
        action: {
          label: "撤销",
          run: async () => {
            await moveMessageToBucket(m.id, "imbox");
            await refreshAll();
            showToast({ message: "已撤销", kind: "success" });
          },
        },
      });
    } catch (err) {
      console.error("[imbox] archive failed:", err);
      await refreshAll();
      showToast({ message: "操作失败，请重试", kind: "error" });
    }
  };

  const trash = async (m: Message) => {
    removeFromBoth(m.id);
    try {
      await moveMessageToBucket(m.id, "trash");
      await refetchPiles();
      showToast({
        message: "已移到回收站",
        kind: "info",
        action: {
          label: "撤销",
          run: async () => {
            await moveMessageToBucket(m.id, "imbox");
            await refreshAll();
            showToast({ message: "已撤销", kind: "success" });
          },
        },
      });
    } catch (err) {
      console.error("[imbox] trash failed:", err);
      await refreshAll();
      showToast({ message: "操作失败，请重试", kind: "error" });
    }
  };

  const spam = async (m: Message) => {
    removeFromBoth(m.id);
    try {
      await moveMessageToBucket(m.id, "spam");
      await refetchPiles();
      showToast({
        message: "已移到垃圾邮件",
        kind: "info",
        action: {
          label: "撤销",
          run: async () => {
            await moveMessageToBucket(m.id, "imbox");
            await refreshAll();
            showToast({ message: "已撤销", kind: "success" });
          },
        },
      });
    } catch (err) {
      console.error("[imbox] spam failed:", err);
      await refreshAll();
      showToast({ message: "操作失败，请重试", kind: "error" });
    }
  };

  const toggleUnread = async (m: Message) => {
    try {
      // Scoped single-column update — `m` is a lightweight list row and
      // must never be round-tripped through upsertMessage.
      await markMessageUnread(m.id, !m.unread);
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
      console.error("[imbox] toggleUnread failed:", err);
      await refreshAll();
      showToast({ message: "操作失败，请重试", kind: "error" });
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
        message: `已批准到 ${bucket === "imbox" ? "Imbox" : bucket === "feed" ? "Stream" : "Records"}`,
        kind: "success",
      });
    } catch (err) {
      console.error("[imbox] approve failed:", err);
      await refreshAll();
      showToast({ message: "操作失败，请重试", kind: "error" });
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
      showToast({
        message: `已阻止 ${c?.name ?? m.pid}`,
        kind: "info",
        action: {
          label: "撤销",
          run: async () => {
            if (c) {
              await upsertContact({
                ...c,
                firstSeen: true,
                screened: false,
                blocked: false,
              });
            }
            await moveMessageToBucket(m.id, "imbox");
            await refreshAll();
            showToast({ message: "已撤销", kind: "success" });
          },
        },
      });
    } catch (err) {
      console.error("[imbox] block failed:", err);
      await refreshAll();
      showToast({ message: "操作失败，请重试", kind: "error" });
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
        // Scoped single-column update — the list row is lightweight
        // (no body / bodyHtml), so a full upsertMessage here would
        // wipe the body in the DB.
        await markMessageUnread(m.id, false);
      } catch {
        // Restore on failure — re-prepend to newPaged and refetch
        // seenPaged so we don't keep a phantom.
        await newPaged.refresh();
        await seenPaged.refresh();
      }
    }
  };

  /* ── Drag and drop (HTML5 DnD → DropBar) ───────────────────────────
   * Two parallel channels carry the drag:
   *   1. HTML5 native — dataTransfer.setData("text/plain", m.id) so
   *      a future native drop handler can read the id.
   *   2. Solid signal — startDrag lights up DropBar; the bar's commit
   *      callback handles the actual move (bucket or workflow flag).
   * Both must be set in onDragStart; both are cleared in onDragEnd.
   * The HTML5 channel alone used to leave the DropBar invisible
   * because nothing ever called startDrag — the bar's <Show when=
   * drag().active> was always false. Wiring both channels is what
   * makes the bar appear and lets the 8 drop targets actually fire.
   */

  const onDragStart = (m: Message, ev: DragEvent) => {
    ev.dataTransfer?.setData("text/plain", m.id);
    if (ev.dataTransfer) ev.dataTransfer.effectAllowed = "move";
    (ev.currentTarget as HTMLElement).classList.add("dragging");

    startDrag(m, async (target: DragTarget) => {
      // Workflow targets reuse the existing per-message actions
      // (which already do optimistic remove + DB write + toast).
      // Bucket targets go through moveMessageToBucket directly.
      switch (target) {
        case "pending":
          await replyLater(m);
          break;
        case "saved":
          await setAside(m);
          break;
        case "remind":
          // Default remind time = tomorrow 9am local, matching the
          // `message:bubble-up` shortcut behavior.
          await remindTomorrow(m);
          break;
        case "paperTrail":
          await archive(m);
          break;
        case "trash":
          await trash(m);
          break;
        case "spam":
          await spam(m);
          break;
        case "imbox":
        case "feed": {
          removeFromBoth(m.id);
          try {
            await moveMessageToBucket(m.id, target);
            await refetchPiles();
            const label = target === "imbox" ? "Imbox" : "Stream";
            showToast({ message: `已移到 ${label}`, kind: "info" });
          } catch (err) {
            console.error("[imbox] drag move failed:", err);
            await refreshAll();
            showToast({ message: "操作失败，请重试", kind: "error" });
          }
          break;
        }
      }
    });
  };
  const onDragEnd = (ev: DragEvent) => {
    (ev.currentTarget as HTMLElement).classList.remove("dragging");
    // DropBar also calls endDrag after the commit fires; we call it
    // here too so drops that miss every target (no commit fires)
    // also close the bar.
    endDrag();
  };

  /* ── Keyboard shortcuts (j/k/x/Enter/l/a/e/t/z/!/u) ──────────────
   * Key bindings mirror DEFAULT_SHORTCUTS (utils/shortcut-defaults.ts):
   *   l = 稍后回复 · a = 搁置 · e = 归档 · t = 删除 · ! = 垃圾邮件
   *   z = 提醒（明天 9:00）· u = 已读/未读
   * The global router (utils/shortcuts.ts) gates these six actions on
   * `view() !== "imbox"` so a keypress never double-writes the DB. */

  const isOverlayOpen = () =>
    commandPaletteOpen() ||
    searchOpen() ||
    notificationsOpen() ||
    composeOpen() ||
    helpOpen() ||
    detailOpen() ||
    agentPanelOpen();

  const handleKey = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
    if (tag === "input" || tag === "textarea") return;
    // Same overlay gate as the global handler: while Compose / the
    // command palette / a detail panel is open, list keys must not
    // move messages in the background.
    if (isOverlayOpen()) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "j") {
      e.preventDefault();
      moveCursor(1);
    } else if (e.key === "k") {
      e.preventDefault();
      moveCursor(-1);
    } else if (e.key === "Enter") {
      e.preventDefault();
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
      e.preventDefault();
      const cur = cursorIndex();
      const item = renderList()[cur];
      if (!item) return;
      if ("messages" in item) toggleBundleSelection(item);
      else toggleSelect(item.id);
    } else if (e.key === "l") {
      e.preventDefault();
      const cur = cursorIndex();
      const item = renderList()[cur];
      if (item && !("messages" in item)) void replyLater(item);
    } else if (e.key === "a") {
      e.preventDefault();
      const cur = cursorIndex();
      const item = renderList()[cur];
      if (item && !("messages" in item)) void setAside(item);
    } else if (e.key === "e") {
      e.preventDefault();
      const cur = cursorIndex();
      const item = renderList()[cur];
      if (item && !("messages" in item)) void archive(item);
    } else if (e.key === "t") {
      e.preventDefault();
      const cur = cursorIndex();
      const item = renderList()[cur];
      if (item && !("messages" in item)) void trash(item);
    } else if (e.key === "z") {
      e.preventDefault();
      // Remind = tomorrow 9:00 local (prototype `b` / bubble-up).
      const cur = cursorIndex();
      const item = renderList()[cur];
      if (item && !("messages" in item)) void remindTomorrow(item);
    } else if (e.key === "!") {
      e.preventDefault();
      const cur = cursorIndex();
      const item = renderList()[cur];
      if (item && !("messages" in item)) void spam(item as Message);
    } else if (e.key === "u") {
      e.preventDefault();
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

  // Sync-in-progress flag for the header button (spinner + disabled so
  // double-clicking doesn't fire duplicate refreshes).
  const [syncing, setSyncing] = createSignal(false);
  const syncNow = async () => {
    if (syncing()) return;
    setSyncing(true);
    try {
      await newPaged.refresh();
      await seenPaged.refresh();
      showToast({ message: "已刷新", kind: "info", ttlMs: 1500 });
    } finally {
      setSyncing(false);
    }
  };

  // Mobile layout (≤767px): the pile row becomes a compact fixed bar
  // above the bottom tab bar instead of three full-width cards sitting
  // mid-list. MessageCard has its own (wider, ≤1023px) query for
  // SwipeActions — this one is only for the piles/layout chrome.
  const [isMobileLayout, setIsMobileLayout] = createSignal(false);
  onMount(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    setIsMobileLayout(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobileLayout(e.matches);
    mq.addEventListener("change", handler);
    onCleanup(() => mq.removeEventListener("change", handler));
  });

  const showBulkBar = createMemo(() => selectedIds().size > 0);

  return (
    <div class="imbox-view">
      <ImboxHeader
        total={newPaged.total() + seenPaged.total()}
        newCount={newPaged.total()}
        previouslySeenCount={seenPaged.total()}
        syncing={syncing()}
        onSync={syncNow}
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
          tabIndex={0}
          aria-label="查看待提醒邮件"
          onClick={() => setView("bubbleUp")}
          onKeyDown={(ev) => {
            if (ev.key === "Enter" || ev.key === " ") {
              ev.preventDefault();
              setView("bubbleUp");
            }
          }}
        >
          <Icon name="ph-arrow-fat-line-up" size={20} />
          <div class="bubble-up-body">
            <div class="bubble-up-title">{remindedCount()} 封待提醒</div>
            <div class="bubble-up-subtitle">已回到列表顶部 · 点击查看</div>
          </div>
        </div>
      </Show>

      <Show
        when={!paged().resource.error}
        fallback={
          <ErrorState
            title="加载失败，请重试"
            retry={() => void paged().refresh()}
          />
        }
      >
        <Show
          when={!(paged().resource.loading && paged().items().length === 0)}
          fallback={<SkeletonBlock />}
        >
          <Show when={hasAny()} fallback={<EmptyState />}>
            <div
              class="feed-list"
              data-feed-list
              style={
                isMobileLayout() && (piles().length > 0 || showBulkBar())
                  ? { "padding-bottom": "120px" }
                  : undefined
              }
            >
              {/* 一起读 action for the unread tab; the tab bar already
                  names the section, so no duplicate section title. */}
              <Show when={activeTab() === "new" && activeList().length > 0}>
                <div
                  style={{
                    display: "flex",
                    "justify-content": "flex-end",
                    padding: "var(--space-1) 0 var(--space-2)",
                  }}
                >
                  <button
                    class="feed-section-action"
                    data-read-together
                    onClick={() => setView("readTogether")}
                  >
                    一起读
                  </button>
                </div>
              </Show>

              <Show
                when={
                  paged().total() > 0 &&
                  (paged().hasMore() || paged().loadingMore())
                }
              >
                <LoadedProgressBar
                  loaded={paged().items().length}
                  total={paged().total()}
                  loading={paged().loadingMore()}
                />
              </Show>

              <Show
                when={activeList().length > 0}
                fallback={
                  <TabEmpty
                    tab={activeTab()}
                    otherCount={
                      activeTab() === "new"
                        ? seenPaged.total()
                        : newPaged.total()
                    }
                    onSwitch={() =>
                      setActiveTab(activeTab() === "new" ? "seen" : "new")
                    }
                  />
                }
              >
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
              </Show>

              <div ref={(el) => (sentinel = el)} data-load-more-sentinel />
              <Show when={paged().hasMore()}>
                <ShowMoreButton
                  loading={paged().loadingMore()}
                  onClick={() => void paged().loadMore()}
                />
              </Show>
            </div>

            <Show when={piles().length > 0}>
              <div
                class="imbox-piles"
                data-imbox-piles
                data-testid="piles"
                style={
                  isMobileLayout()
                    ? {
                        position: "fixed",
                        left: "8px",
                        right: "8px",
                        bottom:
                          "calc(64px + env(safe-area-inset-bottom, 0px))",
                        width: "auto",
                        "max-width": "none",
                        margin: "0",
                        padding: "6px",
                        gap: "6px",
                        "flex-direction": "row",
                        background: "var(--glass-bg)",
                        "backdrop-filter": "var(--glass-blur)",
                        "-webkit-backdrop-filter": "var(--glass-blur)",
                        border: "0.5px solid var(--glass-border)",
                        "border-radius": "var(--radius-xl)",
                        "box-shadow": "var(--glass-shadow)",
                      }
                    : undefined
                }
              >
                <For each={piles()}>
                  {(p) => (
                    <PileCard
                      pile={p}
                      contacts={contacts() ?? []}
                      compact={isMobileLayout()}
                      onOpen={(id) => open(id)}
                    />
                  )}
                </For>
                {/* Standalone 专注回复 main button — pulled out of the
                    Pending pile card so the focused reply flow is one
                    tap away and reads as a primary action. */}
                <Show when={pendingCount() > 0}>
                  <button
                    type="button"
                    data-focus-reply-entry
                    title="专注回复：逐封处理待回复邮件"
                    onClick={() => setView("focusReply")}
                    style={{
                      display: "inline-flex",
                      "flex-direction": isMobileLayout()
                        ? "row"
                        : "column",
                      "align-items": "center",
                      "justify-content": "center",
                      gap: "4px",
                      padding: isMobileLayout() ? "0 12px" : "10px 16px",
                      "min-height": "44px",
                      background: "var(--palm)",
                      color: "white",
                      border: "none",
                      "border-radius": "var(--radius-lg)",
                      "font-size": "var(--text-caption)",
                      "font-weight": "700",
                      cursor: "pointer",
                      "white-space": "nowrap",
                      "box-shadow": "var(--shadow-md)",
                    }}
                  >
                    <Icon name="ph-target" size={14} color="white" />
                    <span>专注回复</span>
                  </button>
                </Show>
              </div>
            </Show>

            {/* Bulk action bar — floats in when the user has selected
                cards (x key or checkbox), making multi-select
                discoverable for mouse users. */}
            <Show when={showBulkBar()}>
              <div
                data-bulk-bar
                role="toolbar"
                aria-label="批量操作"
                style={{
                  position: "fixed",
                  bottom: isMobileLayout()
                    ? "calc(64px + env(safe-area-inset-bottom, 0px))"
                    : "var(--space-5)",
                  left: "50%",
                  transform: "translateX(-50%)",
                  display: "flex",
                  "align-items": "center",
                  gap: "var(--space-2)",
                  padding: "8px 12px",
                  background: "var(--glass-bg)",
                  "backdrop-filter": "var(--glass-blur)",
                  "-webkit-backdrop-filter": "var(--glass-blur)",
                  border: "0.5px solid var(--glass-border)",
                  "border-radius": "var(--radius-pill)",
                  "box-shadow": "var(--glass-shadow)",
                  "z-index": "var(--z-detail)",
                  animation: "toast-enter 0.2s var(--ease-out) both",
                }}
              >
                <span
                  style={{
                    "font-size": "var(--text-caption)",
                    "font-weight": "700",
                    color: "var(--text-secondary)",
                    "white-space": "nowrap",
                  }}
                >
                  已选 {selectedIds().size} 封
                </span>
                <BulkBarButton
                  label="稍后回复"
                  onClick={() => void bulkPending()}
                />
                <BulkBarButton
                  label="归档"
                  onClick={() => void bulkMove("paperTrail", "已归档到 Records")}
                />
                <BulkBarButton
                  label="删除"
                  danger
                  onClick={() => void bulkMove("trash", "已移到回收站")}
                />
                <BulkBarButton label="取消选择" onClick={clearSelection} />
              </div>
            </Show>
          </Show>
        </Show>
      </Show>
    </div>
  );
}

function BulkBarButton(props: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      style={{
        padding: "6px 12px",
        "min-height": "32px",
        "border-radius": "var(--radius-pill)",
        border: props.danger ? "0.5px solid var(--status-danger)" : "none",
        background: props.danger ? "transparent" : "var(--paper-mid)",
        color: props.danger ? "var(--status-danger)" : "var(--text-secondary)",
        "font-size": "var(--text-caption)",
        "font-weight": "600",
        cursor: "pointer",
        "white-space": "nowrap",
      }}
    >
      {props.label}
    </button>
  );
}

function TabEmpty(props: {
  tab: ImboxTabId;
  otherCount: number;
  onSwitch: () => void;
}) {
  return (
    <Empty
      icon={props.tab === "new" ? "ph-check-circle" : "ph-envelope-open"}
      title={props.tab === "new" ? "没有新邮件 🎉" : "还没有已读邮件"}
      description={
        props.tab === "new"
          ? "新邮件到了会出现在这里。"
          : "读过的邮件会收在这里。"
      }
      action={
        props.otherCount > 0
          ? {
              label: props.tab === "new" ? "查看已读" : "查看新邮件",
              onClick: props.onSwitch,
            }
          : undefined
      }
    />
  );
}

/* ── Sub-components ─────────────────────────────────────────────────── */

function ImboxHeader(props: {
  total: number;
  newCount: number;
  previouslySeenCount: number;
  syncing: boolean;
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
      {/* Scoped keyframes — animations.css is owned by the styles group;
          keep the sync spinner self-contained here. */}
      <style>{`@keyframes imbox-spin { to { transform: rotate(360deg); } }`}</style>
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
          "flex-wrap": "wrap",
          gap: "var(--space-2)",
          "margin-top": "var(--space-2)",
        }}
      >
        <span
          style={{
            "font-size": "var(--text-caption)",
            color: "var(--text-muted)",
            "min-width": "0",
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
            "white-space": "nowrap",
            "flex-shrink": 0,
          }}
          data-active-sort
        >
          {SORT_LABELS[props.activeSort]}
        </span>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => props.onOpenFilters()}
          data-open-filters
          title="更多筛选"
          aria-label="更多筛选"
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
            "white-space": "nowrap",
            "flex-shrink": 0,
          }}
        >
          <Icon name="ph-sliders-horizontal" size={12} /> 筛选
        </button>
        <button
          onClick={() => void props.onSync()}
          disabled={props.syncing}
          data-sync-now
          title="立即同步"
          aria-label="立即同步"
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
            cursor: props.syncing ? "default" : "pointer",
            "white-space": "nowrap",
            "flex-shrink": 0,
            opacity: props.syncing ? 0.7 : 1,
          }}
        >
          <span
            style={{
              display: "inline-flex",
              animation: props.syncing
                ? "imbox-spin 1s linear infinite"
                : undefined,
            }}
          >
            <Icon name="ph-arrows-clockwise" size={12} />
          </span>
          {props.syncing ? "同步中…" : "同步"}
        </button>
      </div>
    </header>
  );
}

function EmptyState() {
  return (
    <div class="imbox-empty">
      <Icon name="ph-tray" size={48} />
      <h2>Imbox 是给你的重要邮件</h2>
      <p>
        重要的、需要你来处理的对话会出现在这里。
        <br />
        新邮件到了会自动出现在这里。
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

function ShowMoreButton(props: { loading: boolean; onClick: () => void }) {
  return (
    <div
      style={{
        padding: "var(--space-5)",
        "text-align": "center",
      }}
    >
      <button
        onClick={() => props.onClick()}
        disabled={props.loading}
        data-load-more
        style={{
          padding: "8px 20px",
          "min-height": "36px",
          background: "var(--paper-mid)",
          color: "var(--text-secondary)",
          "border-radius": "var(--radius-pill)",
          "font-size": "var(--text-caption)",
          "font-weight": "700",
          border: "0.5px solid var(--border)",
          cursor: props.loading ? "default" : "pointer",
        }}
      >
        {props.loading ? "加载中…" : "加载更多"}
      </button>
    </div>
  );
}

/** A thin strip between the section header and the list that shows
 *  how many items have been loaded vs. the total in the bucket. Hidden
 *  when the list is complete. The bar fill animates with `transform:
 *  scaleX()` so it doesn't trigger reflow on every progress tick.
 *  Pairs with the IntersectionObserver loadMore to give the user a
 *  visible sense of progress while the next page IPC round-trip is
 *  in flight. */
function LoadedProgressBar(props: {
  loaded: number;
  total: number;
  loading: boolean;
}) {
  const pct = () => {
    if (props.total <= 0) return 0;
    return Math.min(100, Math.round((props.loaded / props.total) * 100));
  };
  return (
    <div
      data-loaded-progress
      style={{
        display: "flex",
        "align-items": "center",
        gap: "var(--space-3)",
        padding: "var(--space-2) var(--space-4)",
        "margin-bottom": "var(--space-2)",
        background: "var(--paper-mid)",
        "border-radius": "var(--radius-md)",
        "font-size": "var(--text-caption)",
        color: "var(--text-secondary)",
      }}
    >
      <div
        style={{
          flex: 1,
          height: "4px",
          background: "var(--paper-dark)",
          "border-radius": "var(--radius-pill)",
          overflow: "hidden",
          position: "relative",
        }}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct()}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            "border-radius": "var(--radius-pill)",
            background: "var(--palm)",
            "transform-origin": "left center",
            transform: `scaleX(${pct() / 100})`,
            transition:
              "transform 0.32s var(--ease-out), opacity 0.2s var(--ease-out)",
            opacity: props.loading ? 0.7 : 1,
          }}
        />
      </div>
      <span
        style={{
          "white-space": "nowrap",
          "font-weight": "600",
          "font-variant-numeric": "tabular-nums",
        }}
        data-loaded-progress-text
      >
        已加载 {props.loaded} / {props.total}
        {props.loading ? " · 加载中…" : ""}
      </span>
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
      draggable={true}
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
  // Memoize so the comparator-shaped reactive read doesn't recompute on
  // every signal tick. The card's class is the only consumer.
  const score = createMemo(() => props.scoreFor(props.m));
  const isSelected = () => props.selectedIds.has(props.m.id);
  const priorityClass = () =>
    score() >= 80 ? " priority-high" : "";
  const cursorClass = () => (props.isCursor() ? " cursor" : "");
  const selectedClass = () => (isSelected() ? " selected" : "");
  const unreadClass = () => (props.m.unread ? " unread" : "");
  const firstTimeClass = () =>
    props.firstTimeSender ? " first-time" : "";

  // Hover state for the action toolbar. The 5 action buttons are
  // rendered only while the user is hovering over the card (or the
  // card has keyboard focus via the cursor key). Off-screen cards and
  // non-hovered cards don't have the buttons in the DOM, which cuts
  // the row count from ~600 elements (100 rows × 5 buttons + avatar +
  // body) to ~500, and — more importantly — removes ~500 event
  // listeners. The 5 actions are wired via event delegation on the
  // article itself (`onAction`), so the toolbar's 5 buttons are
  // re-mounted on hover without needing to re-attach listeners.
  const [hovered, setHovered] = createSignal(false);

  const preview = createMemo(() => {
    const raw = props.m.body || props.m.prev || "";
    if (raw.length <= PREVIEW_CHARS) return raw;
    return raw.slice(0, PREVIEW_CHARS).trimEnd() + "…";
  });

  // Action dispatcher. The 5 buttons inside the toolbar carry a
  // `data-action` attribute; this single handler reads it and routes
  // to the matching prop callback. One listener per card instead of
  // 5 — and the listener is on the article, which exists for every
  // card regardless of hover state, so we don't pay any setup cost
  // when the toolbar mounts.
  //
  // Note: we do NOT call ev.stopPropagation() here. The article's
  // own onClick (the "open message" handler) calls this first,
  // bails out via `if (handled) return`, then runs the open path.
  // This way the action button never has its own listener, the
  // article always has exactly one, and the open handler still gets
  // to do its defensive `closest("button, a, input")` check.
  const onAction = (ev: MouseEvent): boolean => {
    const target = ev.target as HTMLElement;
    const btn = target.closest<HTMLElement>("[data-action]");
    if (!btn) return false;
    ev.preventDefault();
    const action = btn.dataset.action;
    switch (action) {
      case "reply-later":
        props.onReplyLater(props.m);
        break;
      case "set-aside":
        props.onSetAside(props.m);
        break;
      case "archive":
        props.onArchive(props.m);
        break;
      case "trash":
        props.onTrash(props.m);
        break;
      case "toggle-unread":
        props.onToggleUnread(props.m);
        break;
    }
    return true;
  };

  // P1-13: wrap the card in SwipeActions on touch layouts so the user
  // can trash / reply-later without opening the detail panel. The
  // SwipeActions component (used in Gate + Records) already has full
  // touch + mouse handling; we just need to gate it on the layout
  // breakpoint and pass the right callbacks.
  const card = (
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
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocusIn={() => setHovered(true)}
      onFocusOut={() => setHovered(false)}
      onClick={(ev) => {
        // Action delegation runs first. The toolbar's 5 buttons
        // bubble up here; if the click was on a [data-action]
        // button we return without opening the message.
        if (onAction(ev)) return;
        // Otherwise: open the message. Don't open when the user is
        // interacting with a checkbox, link, or first-time
        // approve/block pill (which have their own handlers and
        // are also <button>/<a> elements — `closest` catches
        // them too).
        const target = ev.target as HTMLElement;
        if (target.closest("button, a, input")) return;
        props.onOpen(props.m);
      }}
    >
      {/* Checkbox is always mounted so the avatar column doesn't shift
          when selection/hover state changes; it's only visible for
          first-time senders, selected cards, or on hover. */}
      <input
        type="checkbox"
        class="select-checkbox"
        checked={isSelected()}
        aria-label="选择这封邮件"
        style={{
          visibility:
            props.firstTimeSender || isSelected() || hovered()
              ? "visible"
              : "hidden",
        }}
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
          {/* Time hides on hover so it doesn't collide with the action
              toolbar that slides in from the right. */}
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
              class="first-time-btn danger"
              onClick={() => props.onBlockFirstTime?.(props.m)}
              data-block-sender
            >
              阻止
            </button>
          </div>
        </Show>
      </div>

      {/* Action toolbar — only mounted while the card is hovered or
          keyboard-focused. The 5 buttons below are re-mounted on every
          hover; event delegation on the article itself keeps the
          listener setup cost at zero. */}
      <Show when={hovered() || props.isCursor()}>
        <div class="feed-card-actions" data-feed-card-actions>
          <button
            class="feed-card-action-btn"
            data-action="reply-later"
            title="稍后回复 (l)"
            aria-label="稍后回复 (l)"
            type="button"
          >
            <Icon name="ph-clock" size={14} />
          </button>
          <button
            class="feed-card-action-btn"
            data-action="set-aside"
            title="搁置 (a)"
            aria-label="搁置 (a)"
            type="button"
          >
            <Icon name="ph-push-pin" size={14} />
          </button>
          <button
            class="feed-card-action-btn"
            data-action="archive"
            title="归档 (e)"
            aria-label="归档 (e)"
            type="button"
          >
            <Icon name="ph-archive" size={14} />
          </button>
          <button
            class="feed-card-action-btn"
            data-action="trash"
            title="删除 (t)"
            aria-label="删除 (t)"
            type="button"
          >
            <Icon name="ph-trash" size={14} />
          </button>
          <button
            class="feed-card-action-btn"
            data-action="toggle-unread"
            title={props.m.unread ? "标为已读 (u)" : "标为未读 (u)"}
            aria-label={props.m.unread ? "标为已读 (u)" : "标为未读 (u)"}
            type="button"
          >
            <Icon name={props.m.unread ? "ph-eye" : "ph-eye-slash"} size={14} />
          </button>
        </div>
      </Show>
    </article>
  );

  // P1-13: only wrap on touch layouts (mobile + tablet, ≤1023px). On
  // desktop the user has the hover toolbar + keyboard shortcuts; touch
  // users previously had no way to act on a message without opening
  // the detail panel (3 taps).
  const [isTouchLayout, setIsTouchLayout] = createSignal(false);
  onMount(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    setIsTouchLayout(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsTouchLayout(e.matches);
    mq.addEventListener("change", handler);
    onCleanup(() => mq.removeEventListener("change", handler));
  });
  return (
    <SwipeActions
      disabled={!isTouchLayout() || props.m.bucket !== "imbox"}
      leftAction={{
        label: "删除",
        icon: "ph-trash",
        color: "red",
        onClick: () => props.onTrash(props.m),
      }}
      rightAction={{
        label: "稍后回复",
        icon: "ph-clock",
        color: "yellow",
        onClick: () => props.onReplyLater(props.m),
      }}
    >
      {card}
    </SwipeActions>
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
        {/* Expand affordance — without a visible chevron the bundle
            drawer was only discoverable by accident. */}
        <span
          data-bundle-chevron
          aria-hidden="true"
          style={{
            display: "inline-flex",
            color: "var(--text-muted)",
            transform: expanded() ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s var(--ease-out)",
          }}
        >
          <Icon name="ph-caret-down" size={14} />
        </span>
      </div>
      <div class="bundle-drawer">
        <For each={props.bundle.messages}>
          {(m) => (
            <div
              class="bundle-drawer-row"
              data-bundle-row={m.id}
              data-message-id={m.id}
              data-feed-card="message"
              draggable="true"
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
  /** Compact mode (mobile): the pile row is a fixed bottom strip, so
      the header must stay within one 44px-tall tap target. */
  compact: boolean;
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
      class={
        "imbox-pile" +
        (expanded() ? " expanded" : "") +
        (props.compact ? " compact" : "")
      }
      data-pile={props.pile.id}
      data-pile-id={props.pile.id}
      data-testid={`pile-${props.pile.openBoardView}`}
      data-expanded={expanded() ? "true" : "false"}
      onClick={toggle}
    >
      <div class="imbox-pile-header">
        <Icon name={props.pile.icon} size={12} />
        <span class="imbox-pile-title">{props.pile.title}</span>
        <span class="imbox-pile-count">{props.pile.messages.length}</span>
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
                  data-pile-item={m.id}
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
              还有 {props.pile.messages.length - 5} 封
            </div>
          </Show>
          <div class="pile-drawer-actions">
            <button
              type="button"
              class="pile-drawer-action pile-board-btn"
              data-pile-open-board
              onClick={(ev) => {
                ev.stopPropagation();
                setView(props.pile.openBoardView);
              }}
            >
              查看全部
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
        label="新邮件"
        icon="ph-envelope-simple-open"
        active={props.active === "new"}
        count={props.newCount}
        highlight={props.newCount > 0}
        onClick={() => props.onChange("new")}
        dataTab="new"
      />
      <ImboxTabButton
        label="已读"
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
        "margin-bottom": "-0.5px",
        cursor: "pointer",
        display: "flex",
        "align-items": "center",
        "justify-content": "center",
        color: props.active ? "var(--text-primary)" : "var(--text-muted)",
        "font-weight": props.active ? "700" : "600",
        "font-size": "var(--text-body-sm)",
        transition: "color 0.15s var(--ease-out)",
      }}
    >
      {/* Inner span carries the active underline so the rule is exactly as
          wide as the content, not the full-width flex button. */}
      <span
        style={{
          display: "inline-flex",
          "align-items": "center",
          gap: "var(--space-2)",
          "padding-bottom": "10px",
          "margin-bottom": "-10px",
          "border-bottom": props.active
            ? "2px solid var(--palm)"
            : "2px solid transparent",
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
              background:
                props.highlight && !props.active
                  ? "var(--palm)"
                  : "var(--paper-mid)",
              color:
                props.highlight && !props.active
                  ? "white"
                  : "var(--text-secondary)",
              "font-size": "var(--text-micro)",
              "font-weight": "700",
              "line-height": "1",
            }}
          >
            {props.count > 999 ? "999+" : props.count}
          </span>
        </Show>
      </span>
    </button>
  );
}

/* ── DateGroupedList ─────────────────────────────────────────────── */

/** Render an ItemList with date-bucket anchors between groups. Anchors
 *  keep their DOM nodes when items within a bucket re-shuffle, so the
 *  browser doesn't lose scroll position. Each bucket header is clickable
 *  to set the cursor to its first item, so the user can jump to a date
 *  range without scrolling through 100s of unread.
 *
 *  Grouping is delegated to `groupItemsByDate` (see
 *  `./Imbox-helpers.ts`) so the bucketing logic is unit-testable in
 *  isolation. The previous inline version mutated the items via
 *  `Object.assign(item, { _flatIdx })` to attach a global index; that
 *  broke SolidJS reactivity downstream. The helper instead carries
 *  `startIdx` per group and the per-row <For> just adds the local
 *  offset — no mutation. */
function DateGroupedList(props: {
  items: Item[];
  children: (item: Item, i: number) => JSX.Element;
}) {
  const groups = createMemo(() => groupItemsByDate(props.items));

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
            style={{
              display: "flex",
              "align-items": "center",
              gap: "var(--space-2)",
            }}
          >
            <span class="imbox-date-header-label">{group.label}</span>
            <span
              class="imbox-date-header-count"
              style={{
                display: "inline-flex",
                "align-items": "center",
                "justify-content": "center",
                "min-width": "20px",
                height: "20px",
                padding: "0 6px",
                "border-radius": "var(--radius-pill)",
                background: "var(--paper-mid)",
                color: "var(--text-secondary)",
                "font-size": "var(--text-micro)",
                "font-weight": "700",
                "line-height": "1",
              }}
            >
              {group.items.length}
            </span>
          </header>
          <For each={group.items}>
            {(item, localIdx) => props.children(item, group.startIdx + localIdx())}
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
