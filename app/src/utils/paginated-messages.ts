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
  type Resource,
} from "solid-js";
import {
  listMessagesPaged,
  type ListMessagesOptions,
  type ListMessagesPage,
} from "../stores/data";
import type { Message } from "../types";

const DEFAULT_PAGE_SIZE = 100;

export interface PaginatedMessagesHandle {
  items: Accessor<Message[]>;
  total: Accessor<number>;
  hasMore: Accessor<boolean>;
  loadingMore: Accessor<boolean>;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  resource: Resource<ListMessagesPage | undefined>;
}

export function usePaginatedMessages(
  options: Omit<ListMessagesOptions, "limit" | "offset">,
  pageSize: number = DEFAULT_PAGE_SIZE,
): PaginatedMessagesHandle {
  const [pages, setPages] = createSignal<Message[]>([]);
  const [offset, setOffset] = createSignal(0);
  const [total, setTotal] = createSignal(0);
  const [loadingMore, setLoadingMore] = createSignal(false);

  const [resource, { refetch }] = createResource<
    ListMessagesPage,
    Omit<ListMessagesOptions, "limit" | "offset">
  >(options, async (opts) => {
    const page = await listMessagesPaged({
      ...opts,
      limit: pageSize,
      offset: 0,
    });
    setPages(page.items);
    setOffset(page.items.length);
    setTotal(page.total);
    return page;
  });

  const items = createMemo(() => pages());
  const hasMore = createMemo(() => offset() < total());

  const loadMore = async () => {
    if (loadingMore() || !hasMore()) return;
    setLoadingMore(true);
    try {
      const next = await listMessagesPaged({
        ...options,
        limit: pageSize,
        offset: offset(),
      });
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

  return {
    items,
    total,
    hasMore,
    loadingMore,
    loadMore,
    refresh,
    resource,
  };
}