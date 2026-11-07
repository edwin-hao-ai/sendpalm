/** Paginated message list composable.
 *
 *  Loads the first page synchronously on mount, then surfaces a `loadMore`
 *  callback that appends the next page. Used by Imbox / Stream / Records /
 *  Trash / Spam so the frontend never blocks on a full-table SELECT while a
 *  user with thousands of messages is opening the app.
 *
 *  The returned signals are designed to plug straight into virtua's
 *  `<VList>` row count + render-prop API, and into the existing
 *  `createMemo`-based derived selectors (priority score, bundle detection,
 *  Gate contract filter) without rewriting them.
 */
import {
  type Accessor,
  createMemo,
  createResource,
  createSignal,
  onCleanup,
  type Resource,
} from "solid-js";
import {
  getMessage,
  listMessagesPaged,
  type ListMessagesOptions,
  type ListMessagesPage,
} from "../stores/data";
import { registerMessageUpdated } from "../services/sync-events";
import type { Message } from "../types";

const DEFAULT_PAGE_SIZE = 100;

export interface PaginatedMessagesHandle {
  items: Accessor<Message[]>;
  total: Accessor<number>;
  hasMore: Accessor<boolean>;
  loadingMore: Accessor<boolean>;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  /**
   * Prepend specific message ids to the loaded list, fetching each one
   * from the DB. Called by the sync:new-messages event handler so the
   * user sees new mail at the top of the list within one IPC round-trip
   * per id, instead of waiting for a full paginated refetch.
   * Already-loaded ids are skipped (idempotent). New total reflects the
   * ids we couldn't load as a no-op bump.
   */
  prependByIds: (ids: string[]) => Promise<void>;
  /**
   * Optimistically drop ids from the loaded list and total. Use right
   * after a move/delete so the row disappears instantly; if the backend
   * call later fails, call refresh() to resync truth from the DB.
   */
  removeByIds: (ids: string[]) => void;
  /**
   * Merge a partial patch into one loaded item in memory (no-op when the
   * id is not in the loaded window). Use for single-row state changes like
   * marking read — it moves the row between derived sections without a
   * full paginated refetch.
   */
  patchMessage: (id: string, patch: Partial<Message>) => void;
  resource: Resource<ListMessagesPage | undefined>;
}

export function usePaginatedMessages(
  options:
    | Omit<ListMessagesOptions, "limit" | "offset">
    | (() => Omit<ListMessagesOptions, "limit" | "offset">),
  pageSize: number = DEFAULT_PAGE_SIZE,
): PaginatedMessagesHandle {
  const [pages, setPages] = createSignal<Message[]>([]);
  const [offset, setOffset] = createSignal(0);
  const [total, setTotal] = createSignal(0);
  const [loadingMore, setLoadingMore] = createSignal(false);

  /* The options may be a plain object (most views) or an accessor (views
   * that scope by account, where the filter has to change without the
   * component remounting). Loading the accessor through one place keeps
   * `loadMore` and the resource source in agreement — the earlier shape
   * captured the object once, so a reactive filter would have re-queried
   * page 1 with the new scope but appended page 2 with the old one. */
  const readOptions = () =>
    typeof options === "function" ? options() : options;

  /* Monotonic request id. An account switch can leave two `listMessagesPaged`
   * calls in flight; without this guard the slower one wins and the list
   * shows the mailbox the user just left. */
  let requestSeq = 0;

  const [resource, { refetch }] = createResource<
    ListMessagesPage,
    Omit<ListMessagesOptions, "limit" | "offset">
  >(readOptions, async (opts) => {
    const seq = ++requestSeq;
    const page = await listMessagesPaged({
      ...opts,
      limit: pageSize,
      offset: 0,
    });
    if (seq !== requestSeq) return page;
    setPages(page.items);
    setOffset(page.items.length);
    setTotal(page.total);
    return page;
  });

  // NOTE: we deliberately do NOT auto-refetch on the global refreshTick
  // signal. sync:new-messages is the high-frequency source of ticks and
  // the prependByIds() path (called from the registered prepend handler
  // in sync-events.ts) handles it with O(new_ids) IPC round-trips.
  // Auto-refetch would reload all 100 rows of the current page just to
  // add a few new entries at the top — visible jank, no upside.

  const items = createMemo(() => pages());
  const hasMore = createMemo(() => offset() < total());

  const loadMore = async () => {
    if (loadingMore() || !hasMore()) return;
    setLoadingMore(true);
    const seq = requestSeq;
    try {
      const next = await listMessagesPaged({
        ...readOptions(),
        limit: pageSize,
        offset: offset(),
      });
      // The scope changed while page N+1 was in flight — dropping the
      // result is what stops two mailboxes being concatenated.
      if (seq !== requestSeq) return;
      setPages([...pages(), ...next.items]);
      setOffset(offset() + next.items.length);
      setTotal(next.total);
    } finally {
      setLoadingMore(false);
    }
  };

  const refresh = async () => {
    setPages([]);
    setOffset(0);
    await refetch();
  };

  const prependByIds = async (ids: string[]) => {
    if (ids.length === 0) return;
    const loaded = new Set(pages().map((m) => m.id));
    const fresh: Message[] = [];
    for (const id of ids) {
      if (loaded.has(id)) continue;
      try {
        const msg = await getMessage(id);
        if (msg) fresh.push(msg);
      } catch {
        // Ignore per-id fetch failures — the next paginated refetch will
        // pick them up. Better than blocking the prepend on one bad id.
      }
    }
    if (fresh.length === 0) return;
    // Re-sort the merged window by the real receipt timeline (newest
    // first). The sync loop reports new ids in UID (=oldest-first) order
    // during a backfill walk, and a naive prepend would leave the oldest
    // new message at the top of the list — users saw "first row jumped to
    // May" after clicking mail. Sorting the ≤300-item window is cheap and
    // makes the UI order immune to arrival order.
    const merged = [...fresh, ...pages()].sort((a, b) => {
      const ta = Date.parse(a.receivedAt ?? a.st) || 0;
      const tb = Date.parse(b.receivedAt ?? b.st) || 0;
      return tb - ta;
    });
    setPages(merged);
    setTotal(total() + fresh.length);
  };

  const removeByIds = (ids: string[]) => {
    if (ids.length === 0) return;
    const drop = new Set(ids);
    const next = pages().filter((m) => !drop.has(m.id));
    if (next.length === pages().length) return;
    setPages(next);
    setTotal(Math.max(0, total() - (pages().length - next.length)));
    // Cursor offset: only count removals that came from within the loaded
    // window. If we removed 2 of the 100 loaded rows the offset shrinks
    // by 2; if we removed a row beyond the cursor it doesn't matter.
    setOffset(Math.max(0, offset() - (pages().length - next.length)));
  };

  const patchMessage = (id: string, patch: Partial<Message>) => {
    setPages((prev) => {
      const idx = prev.findIndex((m) => m.id === id);
      if (idx < 0) return prev;
      const next = prev.slice();
      next[idx] = { ...next[idx]!, ...patch };
      return next;
    });
  };

  // React to in-place single-row updates (read/unread toggles, etc.)
  // without touching the global refreshTick — patching in memory avoids a
  // full LIMIT 100 refetch per row change.
  onCleanup(
    registerMessageUpdated((id, patch) => patchMessage(id, patch)),
  );

  return {
    items,
    total,
    hasMore,
    loadingMore,
    loadMore,
    refresh,
    prependByIds,
    removeByIds,
    patchMessage,
    resource,
  };
}