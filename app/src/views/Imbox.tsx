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
  untrack,
  createEffect,
  onCleanup,
  onMount,
  type JSX,
} from "solid-js";
import {
  countGatePending,
  countImboxUnread,
  countRecentUnreadImbox,
  RECENT_UNREAD_CAP,
  countUnreadNewsletters,
  getMessage,
  listContactsForList,
  listPileMessages,
  moveMessageToBucket,
  markMessageUnread,
  setMessagePileFlags,
} from "../stores/data";
import { type PileMessage } from "../stores/data";
import { usePaginatedMessages } from "../utils/paginated-messages";
import { useViewport } from "../utils/gestures";
import type { Account, Contact, Message } from "../types";
import {
  accountById,
  accountInitial,
  ALL_ACCOUNTS,
  emailAccounts,
  resolveAccountFilter,
} from "../utils/accounts";
import { AccountTabs } from "../components/AccountTabs";
import { useAccountScope } from "../utils/use-account-scope";
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
  mailSyncIssue,
  setSettingsTab,
  activeAccountId,
  setActiveAccountId,
  selectedMessageId,
  bumpCountsTick,
  type MailSyncIssue,
  type ViewName,
} from "../stores/ui";
import { Avatar } from "../components/Avatar";
import { Icon } from "../components/Icon";
import { SkeletonList } from "../components/Skeleton";
import { Empty, ErrorState } from "../components/Empty";
import { SwipeActions } from "../components/SwipeActions";
import { priorityScore } from "../utils/priority";
import { SORT_LABELS, type SortMode } from "../utils/sort-imbox";
import { registerMessageUpdated, registerPrepend } from "../services/sync-events";
import { FilterPanel } from "../components/FilterPanel";
import {
  groupItemsByDate,
  isImboxListMessage,
  olderUnread,
  readTotal,
  rowAnchorForMessage,
} from "./Imbox-helpers";
import {
  bundleGroupFor,
  formatMessageDate,
  messageTimelineAt,
} from "../utils/message-dates";
import { PageHeader } from "../components/PageHeader";
import { appSettings } from "../stores/ui";
import { looksLikeHtml, htmlToPlainText, plainPreview } from "../utils/html";
import "./Imbox.css";

/** Profile timezone used for every mail date label/group in this view.
 *  Invalid values fall back to the OS zone inside the helpers. */
const profileTz = () => appSettings.profile.timezone;

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

/** Sync-issue banner copy per error code — a missing password, a changed
 *  password, and a dead network are different problems with different
 *  fixes, and the user should never have to guess which one they have. */
export function bannerCopy(issue: MailSyncIssue): string {
  switch (issue) {
    case "missing_credentials":
      return "邮件同步已暂停——输入邮箱密码后才能收取新邮件，当前只显示已同步的旧数据。";
    case "credentials_unreadable":
      return "系统钥匙串拒绝了本次访问——密码还在，重新输入一次即可（macOS 若弹窗询问，选择「始终允许」）。";
    case "auth_failed":
      return "邮箱密码验证失败——如果你最近修改过邮箱密码或撤销了专用密码，请重新输入。";
    case "network":
      return "网络异常，暂时连不上邮箱服务器——恢复后会自动重试。";
    default:
      return "邮件同步遇到问题，稍后会自动重试。";
  }
}

const BUNDLE_THRESHOLD = 3;
const PREVIEW_CHARS = 220;
const PAGE_SIZE = 100;

export function Imbox() {
  /* ── Account scope ────────────────────────────────────────────────
   *
   *  Every mailbox lands in one `messages` table, so the default view is
   *  already the merged one. Switching is a filter, not a second query
   *  shape: `resolveAccountFilter` turns the tab selection into the
   *  `accountIds` predicate (undefined = merged, no predicate at all).
   *
   *  The hook takes an accessor so flipping accounts re-pages in place
   *  instead of remounting the view — remounting would throw away the
   *  tab's scroll position and both resources' loaded windows.
   */
  const accountScope = useAccountScope();
  const accounts = accountScope.accounts;

  const accountFilter = () =>
    resolveAccountFilter(accounts(), activeAccountId());
  const queryScope = () => ({ accountIds: accountFilter() });

  /* ── 快筛 ──────────────────────────────────────────────────────────
   *
   *  互斥单选：点亮再点一次回到「全部」。两个独立开关会叠加成
   *  「既未读又订阅」这种用户猜不到的交集 —— §11.3 已经踩过这个坑。
   *
   *  「未读」是一个筛选条件，不是一块隔离区：列表只有一条，读过的邮件
   *  留在原地，只是不再加粗。（旧模型把已读当成第二个容器，于是打开一封
   *  邮件会把它从「新邮件」搬到「已读」，必须靠 keepScrollStill 掩盖跳动。）
   */
  const [quickFilter, setQuickFilter] = createSignal<
    "all" | "unread" | "newsletter" | "pending"
  >("all");
  const unreadOnly = () => quickFilter() === "unread";

  // 一条列表，两件事分开管：`unreadOnly` 决定服务端返回哪些行，
  // `quickFilter` 的另外两个值（订阅 / 新面孔）在 renderList 里过滤。
  // 两者都是 accessor，所以切 chip 会重查第 1 页，loadMore 也跟着换筛选
  // （见 utils/paginated-messages.ts 的 readOptions）。
  const paged = usePaginatedMessages(
    () => ({
      bucket: "imbox" as const,
      direction: "in" as const,
      lightweight: true,
      // false 也照传：源对象变了才会重查，传 undefined 会让「未读 → 全部」
      // 看起来没有任何变化。
      unreadOnly: unreadOnly(),
      ...queryScope(),
    }),
    PAGE_SIZE,
  );

  // The badge / red dot counts the last 30 days, not everything that is
  // technically unread. A first import leaves years of unread history behind;
  // putting that on the badge would give the user a number they can never
  // clear. Older unread mail stays in the list — the header states both
  // numbers so the difference is explicit rather than mysterious.
  // Refetched from the two existing refresh effects below (hard + soft), not
  // from an effect of its own: three tick handlers for one counter is how
  // this view grew duplicated refresh logic before.
  //
  // Both counters take the account scope: the header puts them in one
  // sentence ("最近 30 天 N 封待读 · 更早 M 封未读"), and a sentence whose
  // halves count different mailboxes contradicts itself the moment the user
  // switches accounts.
  const [recentUnread, { refetch: refetchRecentUnread }] = createResource(() =>
    countRecentUnreadImbox(new Date().toISOString(), {
      accountIds: accountFilter(),
    }),
  );

  /** Every unread Imbox row, any age. The list is merged now, so this is the
   *  only place the "unread" number comes from — `paged.total()` is the whole
   *  mailbox, not the unread slice. */
  const [unreadTotal, { refetch: refetchUnreadTotal }] = createResource(() =>
    countImboxUnread(accountFilter()),
  );

  // Bucket-changing actions (trash, archive, spam, …) call
  // bumpRefreshTick() in MessagePanel. The high-frequency sync ticks
  // are handled by softRefreshTick + prependByIds; the rare "user
  // moved a message to a different bucket" case needs a real refetch.
  // Skip the initial mount tick to avoid double-fetching right after the
  // resource resolves.
  let _refreshSkipMount = true;
  createEffect(() => {
    // Touch the tick so this effect re-runs when it changes.
    refreshTick();
    if (_refreshSkipMount) {
      _refreshSkipMount = false;
      return;
    }
    void paged.refresh();
  });

  const items = () => paged.items();

  // Pile slices: only the rows shown in the Pending / Saved / Remind piles.
  // We deliberately do NOT load the full messages table here — real mailboxes
  // have thousands of rows with large HTML bodies, and pulling them all on
  // every refresh tick or tab return is the main source of scroll jank.
  const [pileMessages, { refetch: refetchPiles }] = createResource(listPileMessages);
  // List-view projection: id/name/avatar/screened/firstSeen/sc/grp only.
  // The full contact row (notes, pattern, stage history…) is fetched by the
  // detail panel when a contact is actually opened, so this stays cheap
  // enough to re-read on every soft sync tick.
  const [contacts, { refetch: refetchContacts }] =
    createResource(listContactsForList);

  // Live-prepend on sync:new-messages — the event reports all UIDs, and new
  // mail is always unread, so it belongs in the merged list under every filter
  // except 「订阅 / 新面孔」(those are filtered in renderList).
  onCleanup(
    registerPrepend("imbox", (ids) => {
      void paged.prependByIds(ids);
    }),
  );

  // Leaving a row read is the one list mutation that used to move mail between
  // containers. Now it is a state change in place — except when the user is
  // looking at 「未读」, where a row that stops being unread no longer matches
  // the filter and has to leave the list.
  //
  // Only the paths that go through `notifyMessageUpdated` arrive here: opening
  // a mail (MessagePanel.markOpenedRead), Read Together, bulk mark-as-read.
  // `toggleUnread` calls `markMessageUnread` directly, which does not emit —
  // that path refreshes its own counts via `afterRowAction`.
  onCleanup(
    registerMessageUpdated((id, patch) => {
      if (patch.unread === undefined) return;
      if (patch.unread === false && unreadOnly()) paged.removeByIds([id]);
      refreshUnreadCounts();
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
    void paged.refresh();
    void refetchPiles();
    void refetchContacts();
    void refetchRecentUnread();
    void refetchUnreadTotal();
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
    // The 30-day window slides: a message that crossed out of it must stop
    // counting even when no new mail arrived.
    void refetchRecentUnread();
    void refetchUnreadTotal();
  });

  /* ── Contact map (for first-time badge + inline approve) ───────── */

  const contactMap = createMemo<Map<string, Contact>>(() => {
    const map = new Map<string, Contact>();
    for (const c of contacts.latest ?? []) map.set(c.id, c);
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
  // Chrome and the dominant cost during the "switch filter → scroll" window.
  // chip 上直接显示数量——用户点之前就知道里面有多少封（"只看订阅"
  // "只看待审"这种自造词对普通人没有意义，数量和大白话才是信息）。
  const [pendingSenderCount] = createResource(countGatePending);
  const [newsletterCount] = createResource(countUnreadNewsletters);

  const renderList = createMemo<ItemList>(() => {
    const map = contactMap();
    const list = items().filter(isImboxListMessage).filter((item: Item) => {
      if (quickFilter() === "pending") {
        const pid = "messages" in item ? item.messages[0]?.pid : item.pid;
        const c = pid ? map.get(pid) : undefined;
        return c ? !c.screened || c.firstSeen : true;
      }
      return true;
    }).filter((item: Item) => {
      if (quickFilter() !== "newsletter") return true;
      const first = "messages" in item ? item.messages[0] : item;
      return !!first?.isNewsletter;
    });

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
            const ts = Date.parse(messageTimelineAt(m)) || 0;
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
          _ts: Date.parse(messageTimelineAt(m)) || 0,
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

  // One list now: read and unread mail share `paged`, and bundle grouping
  // applies to the whole window. `unreadOnly` narrows the query server-side;
  // 订阅 / 新面孔 are filtered client-side inside `renderList`.
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
    // `.latest`: the pile slices refresh on every sync tick, and a pending read
    // here would make the whole list fall back to its skeleton (collapsing
    // `#main` and resetting the reader's scroll position).
    const all = pileMessages.latest ?? [];
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
    () => (pileMessages.latest ?? []).filter((m) => m.replyLater).length,
  );

  const remindedCount = createMemo(
    () => (pileMessages.latest ?? []).filter((m) => m.bubbleUpAt).length,
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

  /** Reveal bookkeeping — see the block below. Declared here because `open()`
   *  (an in-list click) sets the latch to "already visible". */
  let revealedId: string | null = null;
  let revealLoadingId: string | null = null;
  const revealGaveUp = new Set<string>();

  const open = (id: string) => {
    // Opened FROM the list: the row is on screen already, so the reveal below
    // must not re-centre the scroll or steal the keyboard cursor. Setting the
    // latch here is what tells the two entry points apart.
    revealedId = id;
    setSelectedMessageId(id);
    setDetailOpen(true);
  };

  /* ── Reveal a message that was opened from OUTSIDE the list ──────────
   *
   *  The tray menu, the tray's mail list and the bell dropdown all do the
   *  same two writes: `setSelectedMessageId(id)` + `setDetailOpen(true)`
   *  (bootstrap.ts, NotificationPanel.tsx). The list's highlight is
   *  `cursorIndex`, which only j/k used to move — so the panel opened a mail
   *  that the list neither highlighted nor scrolled to, and a mail older than
   *  the first page was not even rendered. That is the user report: "从托盘
   *  点进去，列表里没有选中/没有移动到对应位置".
   *
   *  Three cases, in order:
   *   1. The row is in the rendered list  → move the cursor, scroll to it,
   *      open the sender bundle if the mail is folded inside one.
   *   2. It is loaded but filtered out     → relax the filter and let the
   *      effect run again (account tab first: a tab is an explicit scope the
   *      user picked, a quick filter is a lens on the same mailbox).
   *   3. It is not in the loaded window    → fetch the row and prepend it.
   *      `prependByIds` re-sorts by receipt time, so an older mail lands in
   *      its real chronological place instead of being pinned to the top.
   */
  const scrollToRow = (messageId: string, bundleId?: string) => {
    // One frame later: on the first reveal the row is inserted by this same
    // update, and scrolling before layout would target the previous geometry.
    requestAnimationFrame(() => {
      const row =
        document.querySelector<HTMLElement>(
          `[data-message-id="${CSS.escape(messageId)}"]`,
        ) ??
        (bundleId
          ? document.querySelector<HTMLElement>(
              `[data-bundle-id="${CSS.escape(bundleId)}"]`,
            )
          : null);
      row?.scrollIntoView({ block: "nearest" });
    });
  };

  /** Move the cursor to `id` and scroll it into view. Returns false when the
   *  row is not in the rendered list yet (the caller decides whether to load
   *  it or leave it). */
  const revealNow = (id: string): boolean => {
    const anchor = rowAnchorForMessage(activeList(), id);
    if (!anchor) return false;
    revealedId = id;
    if (anchor.bundleId && !openBundles().has(anchor.bundleId)) {
      const next = new Set(openBundles());
      next.add(anchor.bundleId);
      setOpenBundles(next);
    }
    setCursorIndex(anchor.index);
    scrollToRow(id, anchor.bundleId);
    return true;
  };

  /** Fetch a message the paginated window does not hold, then reveal it.
   *  `prependByIds` re-sorts by receipt time, so an older mail lands in its
   *  real chronological place instead of being pinned to the top. */
  const loadAndReveal = async (id: string) => {
    if (revealGaveUp.has(id) || revealLoadingId === id) return;
    revealLoadingId = id;
    try {
      const m = await getMessage(id).catch(() => null);
      // Only the Imbox is paginated here; a bell row for a mail that lives in
      // another bucket (paper trail, drafts…) has no row to reveal at all, and
      // retrying on every sync tick would be a query per tick.
      if (!m || m.bucket !== "imbox" || !isImboxListMessage(m)) {
        revealGaveUp.add(id);
        return;
      }
      // A tab is an explicit scope the user picked; a quick filter is a lens
      // on the same mailbox. Relax the lens first, then the scope.
      const contact = contactMap().get(m.pid);
      const hiddenByFilter =
        (quickFilter() === "unread" && !m.unread) ||
        (quickFilter() === "newsletter" && !m.isNewsletter) ||
        (quickFilter() === "pending" && !isFirstTimeContact(contact));
      if (hiddenByFilter) {
        setQuickFilter("all");
        return;
      }
      if (
        activeAccountId() !== ALL_ACCOUNTS &&
        m.ac &&
        m.ac !== activeAccountId()
      ) {
        setActiveAccountId(ALL_ACCOUNTS);
        return;
      }
      await paged.prependByIds([id]);
      // The first page may have landed mid-flight and replaced the prepended
      // window; if so the effect re-runs when it does and tries again.
      revealNow(id);
    } finally {
      revealLoadingId = null;
    }
  };

  createEffect(() => {
    const id = selectedMessageId();
    // Track the list so a late page load / prepend re-runs this instead of
    // leaving the reveal lost.
    activeList();
    // Re-selecting the same mail later (tray again) must reveal it again, so
    // the one-shot latch resets when the selection clears.
    if (!id) {
      revealedId = null;
      return;
    }
    if (revealedId === id) return;
    if (revealNow(id)) return;
    void loadAndReveal(id);
  });

  /* ── Per-message optimistic actions ───────────────────────────────── */

  /** Drop a row from the list after an action that moves it out of the Imbox
   *  (archive / trash / spam / pile). `removeByIds` is a no-op when the id is
   *  not in the loaded window, so the caller never has to know whether it has
   *  been paged in yet. */
  const removeRow = (id: string) => {
    paged.removeByIds([id]);
  };

  /** Runs after an action that changed or removed a row: refetch the pile
   *  slices, and refresh the SQL counts behind the header and the chips.
   *
   *  The counts are not derivable from the list any more. Today `removeRow` only
   *  drops the row in memory, so without this archive/trash/spam/pile leave
   *  「未读 5」 above a list of 4 — and archiving an *unread* mail makes the
   *  已读 number go DOWN, because 已读 = 总数 − 未读 and 未读 shrinks. */
  const afterRowAction = async () => {
    await refetchPiles();
    refreshUnreadCounts();
  };

  const refreshAll = async () => {
    await paged.refresh();
    await afterRowAction();
  };

  /** Reading a message changes a row in memory, which our patches handle — but
   *  the header's counts (30-day unread, total unread, and therefore 已读) and
   *  the account-tab / sidebar badges are SQL counts that only refresh on a
   *  tick. Without this the header said "3 封待读" above a list of 2.
   *
   *  Deliberately the *counts* tick, not the soft one: a soft tick also
   *  refetches the pile slices, the contact map and the notification bell, so
   *  merely opening a message re-rendered the whole list behind it. */
  const refreshUnreadCounts = () => {
    void refetchRecentUnread();
    void refetchUnreadTotal();
    bumpCountsTick();
  };

  const replyLater = async (m: Message) => {
    removeRow(m.id);
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
      await afterRowAction();
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
    removeRow(m.id);
    try {
      await setMessagePileFlags(m.id, {
        replyLater: false,
        setAside: true,
        bubbleUpAt: null,
      });
      await afterRowAction();
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
    removeRow(m.id);
    try {
      await setMessagePileFlags(m.id, {
        replyLater: false,
        setAside: false,
        bubbleUpAt: whenIso,
      });
      await afterRowAction();
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
    removeRow(m.id);
    try {
      await moveMessageToBucket(m.id, "paperTrail");
      await afterRowAction();
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
    removeRow(m.id);
    try {
      await moveMessageToBucket(m.id, "trash");
      await afterRowAction();
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
    removeRow(m.id);
    try {
      await moveMessageToBucket(m.id, "spam");
      await afterRowAction();
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
      const next = !m.unread;
      await markMessageUnread(m.id, next);
      // 未读筛选开着时，刚变已读的行不再满足条件，必须真的移出列表；
      // 否则就地改写，行留在原位。
      if (!next && unreadOnly()) paged.removeByIds([m.id]);
      else paged.patchMessage(m.id, { unread: next });
      // `markMessageUnread` does NOT emit notifyMessageUpdated, so the
      // subscribe-once handler above never sees this path — refresh the counts
      // here or the chip keeps advertising the old unread number.
      await afterRowAction();
    } catch (err) {
      console.error("[imbox] toggleUnread failed:", err);
      await refreshAll();
      showToast({ message: "操作失败，请重试", kind: "error" });
    }
  };

  /* ── Open a message ───────────────────────────────────────────────── */

  /** Opening a mail no longer moves its row.
   *
   *  Marking it read (DB write + the in-place un-bold) is done by
   *  MessagePanel's own effect, which calls `notifyMessageUpdated`; the
   *  subscription above turns that into a `patchMessage`. So all this needs to
   *  do is open the panel — the old `keepScrollStill` dance (restore the
   *  scroll position within the frame, then again after layout settled) existed
   *  only because the row used to jump between tabs. */
  const openMessage = (m: Message) => {
    open(m.id);
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
          removeRow(m.id);
          try {
            await moveMessageToBucket(m.id, target);
            await afterRowAction();
            const label = target === "imbox" ? "Inbox" : "Stream";
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
            if (first) openMessage(first);
          } else {
            openMessage(item);
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
        if (paged.hasMore() && !paged.loadingMore()) {
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
    () => paged.total() > 0 || piles().length > 0,
  );

  // Sync-in-progress flag for the header button (spinner + disabled so
  // double-clicking doesn't fire duplicate refreshes).
  const [syncing, setSyncing] = createSignal(false);
  const syncNow = async () => {
    if (syncing()) return;
    setSyncing(true);
    try {
      await paged.refresh();
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

  /** 「全部」chip 上的数字。加载中显示省略号而不是 0 —— 第一帧就说「全部 0」
   *  会在资源落地后再跳成真实数字，用户会以为刚丢了邮件。 */
  const allCount = () =>
    paged.resource.loading && paged.total() === 0 ? "…" : paged.total();

  /** 「未读」chip 上的数字：同样先省略号后数字，并在计数被 LIMIT 截断时说
   *  `2000+`，而不是把一个上限当成精确值。 */
  const unreadChipCount = (total: { latest?: number }) =>
    total.latest === undefined
      ? "…"
      : total.latest >= RECENT_UNREAD_CAP
        ? `${RECENT_UNREAD_CAP}+`
        : total.latest;

  return (
    <div class="imbox-view">
      <ImboxHeader
        total={paged.total()}
        unreadTotal={unreadTotal.latest ?? 0}
        recentUnread={recentUnread.latest ?? 0}
        syncing={syncing()}
        onSync={syncNow}
        onOpenFilters={() => setFilterOpen(true)}
        activeSort={getSortMode("imbox")}
        activeFilterCount={quickFilter() === "all" ? 0 : 1}
      />

      {/* Account switcher. Hidden for single-mailbox setups; when several
          mailboxes merge into one list this is the only way to scope. */}
      <AccountTabs
        bucket="imbox"
        mode={unreadOnly() ? "unread" : "all"}
        total={() => paged.total()}
        accounts={accounts()}
      />

      <Show when={mailSyncIssue()}>
        <div
          data-sync-paused-banner
          role="alert"
          style={{
            display: "flex",
            "align-items": "center",
            gap: "var(--space-3)",
            margin: "0 var(--space-5) var(--space-2)",
            padding: "10px 14px",
            "border-radius": "var(--radius-md)",
            background:
              mailSyncIssue() === "network"
                ? "color-mix(in srgb, var(--text-muted) 10%, var(--paper-light))"
                : "color-mix(in srgb, var(--amber, #B7791F) 12%, var(--paper-light))",
            border: "0.5px solid color-mix(in srgb, var(--amber, #B7791F) 35%, transparent)",
            color: "var(--text-primary)",
            "font-size": "var(--text-body-sm)",
          }}
        >
          <Icon
            name={mailSyncIssue() === "network" ? "ph-wifi-slash" : "ph-warning-circle"}
            size={18}
          />
          <span style={{ flex: 1 }}>{bannerCopy(mailSyncIssue())}</span>
          <Show
            when={
              mailSyncIssue() === "missing_credentials" ||
              mailSyncIssue() === "credentials_unreadable" ||
              mailSyncIssue() === "auth_failed"
            }
          >
            <button
              data-open-accounts
              onClick={() => {
                setSettingsTab("accounts");
                setView("settings");
              }}
              style={{
                padding: "6px 14px",
                "border-radius": "var(--radius-pill)",
                background: "var(--amber, #B7791F)",
                color: "#fff",
                "font-size": "var(--text-caption)",
                "font-weight": 700,
                border: "none",
                cursor: "pointer",
                "white-space": "nowrap",
              }}
            >
              {mailSyncIssue() === "credentials_unreadable" ? "重新输入" : "去输入"}
            </button>
          </Show>
        </div>
      </Show>

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
        when={!paged.resource.error}
        fallback={
          <ErrorState
            title="加载失败，请重试"
            retry={() => void paged.refresh()}
          />
        }
      >
        <Show
          when={!(paged.resource.loading && paged.items().length === 0)}
          fallback={<SkeletonBlock />}
        >
          {/* `quickFilter() !== "all"` keeps the chip row alive when the user's
              own filter empties the list: the chips are the only way back out,
              and quickFilter is component-local, so losing them strands the
              reader until they leave the view. */}
          <Show
            when={hasAny() || quickFilter() !== "all"}
            fallback={<EmptyState hasAccount={emailAccounts(accounts()).length > 0} />}
          >
            <div
              class="feed-list"
              data-feed-list
              style={
                isMobileLayout() && (piles().length > 0 || showBulkBar())
                  ? { "padding-bottom": "120px" }
                  : undefined
              }
            >
              {/* 筛选控件必须常驻：挂在"列表非空"条件下会让筛空结果把
                  开关本身也吞掉——用户点"只看订阅"后列表空了、chip 也没了，
                  不知道怎能退回去（真实用户报告）。空列表时保留 chip 并由
                  FilterEmpty 提供"清除筛选"出口。 */}
              <div class="imbox-chips" data-imbox-chips>
                <ImboxChip
                  chip="all"
                  label="全部"
                  count={allCount()}
                  active={quickFilter() === "all"}
                  title="显示收件箱里的全部邮件"
                  onClick={() => setQuickFilter("all")}
                />
                <ImboxChip
                  chip="unread"
                  label="未读"
                  count={unreadChipCount(unreadTotal)}
                  active={quickFilter() === "unread"}
                  title="只显示未读邮件；再点一次回到全部"
                  onClick={() =>
                    setQuickFilter(quickFilter() === "unread" ? "all" : "unread")
                  }
                />
                <ImboxChip
                  chip="newsletter"
                  label="订阅"
                  count={newsletterCount() ?? "…"}
                  active={quickFilter() === "newsletter"}
                  title="只显示订阅邮件（newsletter、推广）；再点一次回到全部"
                  onClick={() =>
                    setQuickFilter(
                      quickFilter() === "newsletter" ? "all" : "newsletter",
                    )
                  }
                />
                <ImboxChip
                  chip="pending"
                  label="新面孔"
                  count={pendingSenderCount() ?? "…"}
                  active={quickFilter() === "pending"}
                  title="只显示还没在筛选台决定过的发件人的邮件；再点一次回到全部"
                  onClick={() =>
                    setQuickFilter(quickFilter() === "pending" ? "all" : "pending")
                  }
                />
                <button
                  class="feed-section-action"
                  data-read-together
                  disabled={activeList().length === 0}
                  style={activeList().length === 0 ? { opacity: 0.4 } : undefined}
                  onClick={() => setView("readTogether")}
                >
                  一起读
                </button>
              </div>

              <Show
                when={
                  paged.total() > 0 &&
                  (paged.hasMore() || paged.loadingMore())
                }
              >
                <LoadedProgressBar
                  loaded={paged.items().length}
                  total={paged.total()}
                  loading={paged.loadingMore()}
                />
              </Show>

              <Show
                when={activeList().length > 0}
                fallback={
                  <FilterEmpty
                    hasAccount={emailAccounts(accounts() ?? []).length > 0}
                    unreadOnly={unreadOnly()}
                    filterActive={quickFilter() !== "all"}
                    onClearFilters={() => setQuickFilter("all")}
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
                      onOpen={openMessage}
                      onToggleSelect={(id) => toggleSelect(id)}
                      onSelectRange={selectRange}
                      onReplyLater={(m) => void replyLater(m)}
                      onSetAside={(m) => void setAside(m)}
                      onArchive={(m) => void archive(m)}
                      onTrash={(m) => void trash(m)}
                      onSpam={(m) => void spam(m)}
                      onToggleUnread={(m) => void toggleUnread(m)}
                      onBundleSelect={(b) => toggleBundleSelection(b)}
                      onDragStart={onDragStart}
                      onDragEnd={onDragEnd}
                      itemKey={itemKey}
                      accountFor={
                        activeAccountId() === ALL_ACCOUNTS &&
                        emailAccounts(accounts() ?? []).length > 1
                          ? (m) => accountById(accounts() ?? [], m.ac)
                          : undefined
                      }
                    />
                  )}
                </DateGroupedList>
              </Show>

              <div ref={(el) => (sentinel = el)} data-load-more-sentinel />
              <Show when={paged.hasMore()}>
                <ShowMoreButton
                  loading={paged.loadingMore()}
                  onClick={() => void paged.loadMore()}
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
                      contacts={contacts.latest ?? []}
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
          </Show>
        </Show>
      </Show>
    </div>
  );
}


/* ── Filter chip ────────────────────────────────────────────────────── */

/** 一个快筛开关。四个 chip 是互斥单选，所以每个都要 `aria-pressed` 而不
 *  是 role=tab —— 它们过滤同一条列表，不切换列表。 */
function ImboxChip(props: {
  chip: "all" | "unread" | "newsletter" | "pending";
  label: string;
  count: number | string;
  active: boolean;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-imbox-chip={props.chip}
      aria-pressed={props.active}
      title={props.title}
      onClick={props.onClick}
      style={{
        padding: "2px 12px",
        "border-radius": "var(--radius-pill)",
        border: "0.5px solid var(--border)",
        background: props.active ? "var(--palm-soft)" : "transparent",
        color: props.active ? "var(--palm)" : "var(--text-secondary)",
        "font-size": "var(--text-micro)",
        "font-weight": 700,
        cursor: "pointer",
        "white-space": "nowrap",
      }}
    >
      {props.label} {props.count}
    </button>
  );
}

/* ── Empty states ───────────────────────────────────────────────────── */

/** 列表被筛空了。文案要看「为什么空」——是筛掉的，还是从来没来过信。
 *  筛选相关的空状态必须留着退出筛选的出口：chip 行虽然常驻，但用户已经在
 *  盯着一片空白，出口放在这里比放在上面更好找。 */
function FilterEmpty(props: {
  hasAccount: boolean;
  unreadOnly: boolean;
  filterActive: boolean;
  onClearFilters: () => void;
}) {
  // 筛选的解释优先于「没有连接邮箱」：一份导入/种子邮箱可以没有 account 行却
  // 有邮件，而列表空着的原因此刻是筛选，不是缺少账户。反过来讲，用户在筛选
  // 状态下看到的出口必须是「退出筛选」，不是「去添加账户」。
  if (props.unreadOnly) {
    return (
      <Empty
        icon="ph-check-circle"
        title="都读完了 🎉"
        description="已读的邮件仍在收件箱里。"
        action={{ label: "查看全部", onClick: props.onClearFilters }}
      />
    );
  }
  if (props.filterActive) {
    return (
      <Empty
        icon="ph-funnel"
        title="筛选条件下没有邮件"
        description="清除筛选即可看到全部。"
        action={{ label: "清除筛选", onClick: props.onClearFilters }}
      />
    );
  }
  if (!props.hasAccount) {
    return (
      <Empty
        icon="ph-tray"
        title="还没有连接邮箱"
        description="连接你的第一个邮箱后，新邮件会自动收进这里。"
      />
    );
  }
  return (
    <Empty
      icon="ph-tray"
      title="收件箱是空的"
      description="需要你处理的邮件会出现在这里。"
    />
  );
}

/* ── Sub-components ─────────────────────────────────────────────────── */

function ImboxHeader(props: {
  total: number;
  /** Everything unread in the Imbox, any age. */
  unreadTotal: number;
  /** Unread from the last 30 days — the number the badge means. */
  recentUnread: number;
  syncing: boolean;
  onSync: () => void | Promise<void>;
  onOpenFilters: () => void;
  activeSort: SortMode;
  /** How many quick filters are on (订阅 / 新面孔 / 一起读 …). */
  activeFilterCount: number;
}) {
  // On the phone the 专注回复 entry lives inside the 待处理 sheet — keeping
  // a third header button there squeezed the counts onto a second line.
  const { isMobile } = useViewport();

  /** `2000+` once the recent-unread query hit its cap — the query cannot
   *  vouch for a precise number past it, and printing one would be a guess
   *  dressed as a fact. */
  const recentLabel = () =>
    props.recentUnread >= RECENT_UNREAD_CAP
      ? `${RECENT_UNREAD_CAP}+`
      : String(props.recentUnread);

  /** Same rule for the whole-mailbox unread count. Past the cap both the
   *  unread figure and anything derived from it (已读 = 总数 − 未读) are
   *  unknowable, so the header names the cap instead of inventing a number. */
  const unreadCapped = () => props.unreadTotal >= RECENT_UNREAD_CAP;
  const unreadLabel = () => (unreadCapped() ? `${RECENT_UNREAD_CAP}+` : null);

  /** Unread mail older than the window — see `olderUnread` in Imbox-helpers
   *  for why a capped recent count makes the difference unknowable. */
  const older = () => olderUnread(props.recentUnread, props.unreadTotal);
  return (
    <>
      {/* Scoped keyframes — animations.css is owned by the styles group;
          keep the sync spinner self-contained here. */}
      <PageHeader
        title="收件箱"
        description={
          // 两行固定结构，不是「一行太长就换行」。
          //
          // 阅读栏打开时列表列要窄 ~380px，一行式描述会在那一刻折成两行，把
          // 下面整条列表往下顶 —— 用户看到的就是「点开邮件，列表抖一下」。两行
          // + 每行 nowrap 之后，列变窄不改变这段的高度，列表一颗像素都不动。
          <span class="imbox-stats" data-imbox-counts>
            <span class="imbox-stats-line">
              {/* Phone keeps only the numbers that need acting on. */}
              <Show
                when={!isMobile()}
                fallback={
                  <>
                    {recentLabel()} 封待读 · {props.unreadTotal} 封未读
                  </>
                }
              >
                最近 30 天 {recentLabel()} 封待读
                <Show when={older() > 0}>
                  <span data-imbox-older-unread>
                    {" "}· 更早 {older()} 封未读
                  </span>
                </Show>
              </Show>
            </span>
            <Show when={!isMobile()}>
              <span class="imbox-stats-line imbox-stats-muted">
                {unreadCapped() ? (
                  // 未读被 LIMIT 截断，「已读 = 总数 − 未读」就不成立了，
                  // 所以只说未读上限和总数，不给一个算不出来的已读数。
                  <>
                    {unreadLabel()} 封未读 · {props.total} 总数
                  </>
                ) : (
                  <>
                    {readTotal(props.unreadTotal, props.total)} 已读 ·{" "}
                    {props.total} 总数
                  </>
                )}
              </span>
              <span class="imbox-stats-pill" data-active-sort>
                {SORT_LABELS[props.activeSort]}
              </span>
            </Show>
          </span>
        }
        actions={
          <>
            {/* Icon-only: the header keeps one primary action + one status,
                everything else is a glyph (HEY ships two controls here). */}
            <button
              onClick={() => props.onOpenFilters()}
              data-open-filters
              title={props.activeFilterCount > 0 ? "更多筛选（已启用 1 项）" : "更多筛选"}
              aria-label="更多筛选"
              style={{
                display: "inline-flex",
                "align-items": "center",
                "justify-content": "center",
                position: "relative",
                width: "30px",
                height: "30px",
                background: props.activeFilterCount > 0 ? "var(--palm-soft)" : "transparent",
                color: props.activeFilterCount > 0 ? "var(--palm)" : "var(--text-secondary)",
                "border-radius": "var(--radius-pill)",
                border: "0.5px solid var(--border)",
                cursor: "pointer",
              }}
            >
              <Icon name="ph-sliders-horizontal" size={14} />
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
          </>
        }
      />
    </>
  );
}

/** Cold-start empty state.
 *
 *  This is the first thing a brand-new user sees, and it used to be a dead
 *  end: a passive "新邮件到了会自动出现在这里" with no way to make that
 *  happen. Nothing arrives until an account is connected, so with zero
 *  mailboxes the copy has to say that and offer the button.
 */
function EmptyState(props: { hasAccount: boolean }) {
  return (
    <div class="imbox-empty">
      <Icon name="ph-tray" size={48} />
      <h2>{props.hasAccount ? "收件箱是空的" : "还没有连接邮箱"}</h2>
      <p>
        {props.hasAccount
          ? "需要你处理的邮件会出现在这里。"
          : "连接你的第一个邮箱后，新邮件会自动收进这里。"}
      </p>
      <Show when={!props.hasAccount}>
        <button
          type="button"
          data-empty-add-account
          onClick={() => {
            setSettingsTab("accounts");
            setView("settings");
          }}
          style={{
            "margin-top": "var(--space-3)",
            "min-height": "40px",
            padding: "8px 20px",
            "border-radius": "var(--radius-pill)",
            border: "none",
            background: "var(--palm)",
            color: "#fff",
            "font-size": "var(--text-caption)",
            "font-weight": 700,
            cursor: "pointer",
          }}
        >
          添加邮箱账户
        </button>
      </Show>
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
  onBundleSelect: (b: Bundle) => void;
  onDragStart: (m: Message, ev: DragEvent) => void;
  onDragEnd: (ev: DragEvent) => void;
  itemKey: (item: Item) => string;
  /** Resolve the mailbox a message came from. Only passed when the list
   *  merges more than one mailbox — the dot is noise otherwise. */
  accountFor?: (m: Message) => Account | undefined;
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
      onDragStart={props.onDragStart}
      onDragEnd={props.onDragEnd}
      draggable={true}
      account={props.accountFor?.(props.item)}
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
  /** Mailbox the message came from, when the list merges several. */
  account?: Account;
  onOpen: (m: Message) => void;
  onToggleSelect: (id: string) => void;
  onSelectRange: (a: string, b: string) => void;
  onReplyLater: (m: Message) => void;
  onSetAside: (m: Message) => void;
  onArchive: (m: Message) => void;
  onTrash: (m: Message) => void;
  onSpam: (m: Message) => void;
  onToggleUnread: (m: Message) => void;
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
    // Senders that stuff markup into the text part (HTML-only mail) would
    // show `<!DOCTYPE html>` tag soup here — strip to readable text, same
    // treatment as the Gate card.
    const text = looksLikeHtml(raw) ? htmlToPlainText(raw) : plainPreview(raw);
    if (text.length <= PREVIEW_CHARS) return text;
    return text.slice(0, PREVIEW_CHARS).trimEnd() + "…";
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
            {/* One decision per person, and it belongs to the Screener
                (HEY's model). The row links there instead of stacking
                four bucket buttons inside the list. */}
            <button
              class="first-time-pill"
              data-first-time-pill
              title="首次发件人 · 去筛选台决定"
              onClick={(ev) => {
                ev.stopPropagation();
                setView("screener");
              }}
            >
              首次发件人 · 去决定
            </button>
          </Show>
          <span class="feed-spacer" />
          {/* Which mailbox this row came from. Coloured dot + initial,
              only rendered when the list actually merges several accounts
              (`account` is undefined otherwise). */}
          <Show when={props.account}>
            {(a) => (
              <span
                class="feed-account-dot"
                data-account-dot={a().id}
                title={`${a().label}${a().email ? ` · ${a().email}` : ""}`}
                aria-label={`来自 ${a().label}`}
                style={{
                  "flex-shrink": 0,
                  display: "inline-flex",
                  "align-items": "center",
                  "justify-content": "center",
                  width: "16px",
                  height: "16px",
                  "border-radius": "50%",
                  background: a().color,
                  color: "#fff",
                  "font-size": "9px",
                  "font-weight": "800",
                  "line-height": 1,
                  "margin-right": "2px",
                }}
              >
                {accountInitial(a())}
              </span>
            )}
          </Show>
          {/* The time stays put: the hover toolbar now parks to its left
              (imbox.css .feed-card-actions right:84px), so hiding it just
              removed the column users scan first. */}
          <span class="feed-time">
            {formatMessageDate(props.m, profileTz(), "list").primary.value}
          </span>
        </div>

        <div class="feed-bottom-row">
          <span class="feed-subject">{props.m.subj}</span>
        </div>
        <div class="feed-bottom-row">
          <span class="feed-preview">{preview()}</span>
        </div>

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

  /** Unread members of this bundle — what the badge shows. */
  const bundleUnread = () => props.bundle.messages.filter((m) => m.unread).length;

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
            <span class="feed-time">{props.bundle.messages[0] ? formatMessageDate(props.bundle.messages[0], profileTz(), "list").primary.value : ""}</span>
          </div>
          <div class="feed-bottom-row">
            <span class="feed-subject">
              {props.bundle.messages[0]?.subj ?? "(无主题)"}
            </span>
          </div>
        </div>
        {/* 未读数，不是这一摞的总封数。
            「· N 封邮件」已经把总数说过了，徽标再重复一遍总数，用户就会把它
            读成「N 封未读」—— 然后点开一封发现它纹丝不动，以为已读没生效。
            没有未读时干脆不显示，和侧栏徽标同一个道理。 */}
        <Show when={bundleUnread() > 0}>
          <span class="feed-card-bundle-count">{bundleUnread()}</span>
        </Show>
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
        <For each={bundleDrawerGroups(props.bundle.messages)}>
          {(group) => (
            <>
              <div class="bundle-drawer-group-label" data-bundle-group={group.key}>
                {group.label}
              </div>
              <For each={group.messages}>
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
                    <span
                      class="bundle-drawer-unread"
                      data-unread={m.unread ? "true" : "false"}
                      style={{ visibility: m.unread ? "visible" : "hidden" }}
                      title={m.unread ? "未读" : "已读"}
                    />
                    <div class="bundle-drawer-text">
                      <div class="bundle-drawer-line">{m.subj || "(无主题)"}</div>
                      <div class="bundle-drawer-meta">
                        {formatMessageDate(m, profileTz(), "list").primary.value}
                      </div>
                    </div>
                  </div>
                )}
              </For>
            </>
          )}
        </For>
      </div>
    </article>
  );
}

/** Group a bundle's messages for the expanded drawer: the most recent
 *  seven local days each get their own section; older messages collapse
 *  into Monday–Sunday weeks. */
function bundleDrawerGroups(messages: Message[]): {
  key: string;
  label: string;
  messages: Message[];
}[] {
  const tz = profileTz();
  const out: { key: string; label: string; messages: Message[] }[] = [];
  let currentKey: string | null = null;
  for (const m of messages) {
    const g = bundleGroupFor(messageTimelineAt(m), tz);
    if (g.key !== currentKey) {
      out.push({ key: g.key, label: g.label, messages: [] });
      currentKey = g.key;
    }
    out[out.length - 1]!.messages.push(m);
  }
  return out;
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
                  <span class="pile-drawer-time">
                    {formatMessageDate(m, profileTz(), "list").primary.value}
                  </span>
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
  const groups = createMemo(() =>
    groupItemsByDate(props.items, profileTz()),
  );

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
            {/* HEY uses a hairline to open a section instead of a chip or
                a tab: 今天 4 ───────────────────── */}
            <span class="imbox-date-rule" aria-hidden="true" />
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
    // Only the tick is a dependency — see utils/gestures.ts for why the
    // callback must not contribute its own (it caused a refetch loop).
    refreshTick();
    untrack(callback);
  });
}

function useSoftRefreshEffect(callback: () => void) {
  createEffect(() => {
    softRefreshTick();
    untrack(callback);
  });
}
