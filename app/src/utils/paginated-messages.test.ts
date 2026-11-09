import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRoot } from "solid-js";
import { notifyMessageUpdated } from "../services/sync-events";
import type { Message } from "../types";

vi.mock("../stores/data", () => ({
  listMessagesPaged: vi.fn(),
  getMessage: vi.fn(),
}));

import {
  usePaginatedMessages,
  type PaginatedMessagesHandle,
} from "./paginated-messages";
import { listMessagesPaged, getMessage } from "../stores/data";

const makeMessage = (id: string, unread = true): Message => ({
  id,
  pid: "ct-1",
  subj: `subj-${id}`,
  prev: "preview",
  body: "body",
  bodyHtml: null,
  tm: "10:00",
  st: "2026-01-01T00:00:00.000Z",
  timelineAt: "2026-01-01T00:00:00.000Z",
  ac: "acct-1",
  bucket: "imbox",
  direction: "in",
  unread,
  labels: [],
  attachments: [],
  trackers: [],
  replyLater: false,
  setAside: false,
  bubbleUpAt: null,
  remindAt: null,
  to: undefined,
  cc: [],
  bcc: [],
  threadId: undefined,
  calendarInvite: null,
});

function mount(rows: Message[]): PaginatedMessagesHandle {
  vi.mocked(listMessagesPaged).mockResolvedValue({
    items: rows,
    total: rows.length,
    limit: 100,
    offset: 0,
  });
  let handle!: PaginatedMessagesHandle;
  createRoot((fn) => {
    handle = usePaginatedMessages({ bucket: "imbox", direction: "in" }, 100);
    rootDispose = fn;
  });
  return handle;
}

let rootDispose: (() => void) | null = null;

beforeEach(() => {
  rootDispose = null;
  vi.mocked(listMessagesPaged).mockReset();
  vi.mocked(getMessage).mockReset();
});

describe("usePaginatedMessages patches a single row in memory", () => {
  it("merges the patch into the matching loaded item", async () => {
    const handle = mount([makeMessage("m1"), makeMessage("m2")]);
    await vi.waitFor(() => expect(handle.items().length).toBe(2));

    handle.patchMessage("m1", { unread: false });

    const items = handle.items();
    expect(items[0]!.id).toBe("m1");
    expect(items[0]!.unread).toBe(false);
    expect(items[0]!.subj).toBe("subj-m1");
    // untouched item keeps its state
    expect(items[1]!.unread).toBe(true);
    // no IPC round-trip happened for the patch
    expect(listMessagesPaged).toHaveBeenCalledTimes(1);
  });

  it("is a no-op for ids not in the loaded list", async () => {
    const handle = mount([makeMessage("m1")]);
    await vi.waitFor(() => expect(handle.items().length).toBe(1));

    handle.patchMessage("missing", { unread: false });

    expect(handle.items().length).toBe(1);
    expect(handle.items()[0]!.unread).toBe(true);
  });

  it("reacts to notifyMessageUpdated via the auto-registered handler", async () => {
    const handle = mount([makeMessage("m1", true), makeMessage("m2", true)]);
    await vi.waitFor(() => expect(handle.items().length).toBe(2));

    // This is the path MessagePanel now uses instead of bumpRefreshTick.
    notifyMessageUpdated("m1", { unread: false });

    const items = handle.items();
    expect(items.find((x) => x.id === "m1")!.unread).toBe(false);
    expect(items.find((x) => x.id === "m2")!.unread).toBe(true);
  });

  it("unregisters its handler on dispose", async () => {
    const handle = mount([makeMessage("m1")]);
    await vi.waitFor(() => expect(handle.items().length).toBe(1));

    rootDispose?.();

    notifyMessageUpdated("m1", { unread: false });
    expect(handle.items()[0]!.unread).toBe(true);
  });
});

describe("prependByIds ordering", () => {
  it("merges prepended ids sorted by receipt timeline, not arrival order", async () => {
    // Sync delivers new ids oldest-first during a backfill walk; the
    // merged window must still read newest-first, or the first row
    // visibly "jumps to May" (regression: month-scrambled Inbox).
    const oct1 = {
      ...makeMessage("new-oct-1"),
      st: "2026-10-24T02:06:03Z",
      receivedAt: "2026-10-24T02:06:03Z",
    };
    const oct2 = {
      ...makeMessage("new-oct-2"),
      st: "2026-10-30T00:01:48Z",
      receivedAt: "2026-10-30T00:01:48Z",
    };
    const may = {
      ...makeMessage("old-page"),
      st: "2026-05-20T20:08:37Z",
      receivedAt: "2026-05-20T20:08:37Z",
    };
    vi.mocked(listMessagesPaged).mockResolvedValue({
      items: [may],
      total: 3,
      limit: 100,
      offset: 0,
    });
    vi.mocked(getMessage).mockImplementation((id: string) =>
      Promise.resolve(
        id === "new-oct-1" ? oct1 : id === "new-oct-2" ? oct2 : null,
      ),
    );

    let handle!: PaginatedMessagesHandle;
    const root = createRoot((dispose) => {
      handle = usePaginatedMessages({ bucket: "imbox", unreadOnly: true });
      return dispose;
    });
    try {
      await handle.resource.latest;
      expect(handle.items().map((m) => m.id)).toEqual(["old-page"]);
      // Arrival order is oldest-first (uid order), like the sync walk.
      await handle.prependByIds(["new-oct-1", "new-oct-2"]);
      expect(handle.items().map((m) => m.id)).toEqual([
        "new-oct-2",
        "new-oct-1",
        "old-page",
      ]);
    } finally {
      root();
    }
  });
});

describe("removeByIds keeps total and offset honest", () => {
  it("decrements total by the number of loaded rows removed", async () => {
    const handle = mount([makeMessage("m1"), makeMessage("m2")]);
    await vi.waitFor(() => expect(handle.items().length).toBe(2));
    expect(handle.total()).toBe(2);

    handle.removeByIds(["m1"]);

    // Regression: the old code read `pages()` after `setPages()`, so the
    // subtraction was always zero and the header total drifted upward with
    // every archive/trash.
    expect(handle.items().map((m) => m.id)).toEqual(["m2"]);
    expect(handle.total()).toBe(1);
  });

  it("never re-reads rows that are already loaded", async () => {
    // 100 loaded of 200 total; removing one loaded row must leave offset 99,
    // not 100 — otherwise the next page starts one row too far and that
    // message is never shown.
    const rows = Array.from({ length: 100 }, (_, i) => makeMessage(`m${i}`));
    vi.mocked(listMessagesPaged).mockResolvedValueOnce({
      items: rows,
      total: 200,
      limit: 100,
      offset: 0,
    });
    let handle!: PaginatedMessagesHandle;
    createRoot((fn) => {
      handle = usePaginatedMessages({ bucket: "imbox", direction: "in" }, 100);
      rootDispose = fn;
    });
    await vi.waitFor(() => expect(handle.items().length).toBe(100));
    expect(handle.total()).toBe(200);

    handle.removeByIds(["m0"]);
    expect(handle.total()).toBe(199);

    vi.mocked(listMessagesPaged).mockResolvedValueOnce({
      items: [makeMessage("tail")],
      total: 199,
      limit: 100,
      offset: 99,
    });
    await handle.loadMore();

    // The page is addressed by cursor, so a removed row cannot shift the
    // window and make the next page skip a message.
    expect(
      vi.mocked(listMessagesPaged).mock.calls[
        vi.mocked(listMessagesPaged).mock.calls.length - 1
      ]?.[0],
    ).toMatchObject({ before: { id: "m99" }, offset: 0 });
    expect(handle.items()[handle.items().length - 1]?.id).toBe("tail");
  });

  it("ignores ids that are not in the loaded window", async () => {
    const handle = mount([makeMessage("m1")]);
    await vi.waitFor(() => expect(handle.items().length).toBe(1));

    handle.removeByIds(["not-loaded"]);

    expect(handle.items()).toHaveLength(1);
    expect(handle.total()).toBe(1);
  });
});

describe("keyset pagination", () => {
  it("asks the next page for rows after the last loaded one, not an offset", async () => {
    const rows = Array.from({ length: 100 }, (_, i) => makeMessage(`k${i}`));
    vi.mocked(listMessagesPaged).mockResolvedValueOnce({
      items: rows,
      total: 200,
      limit: 100,
      offset: 0,
    });
    let handle!: PaginatedMessagesHandle;
    createRoot((fn) => {
      handle = usePaginatedMessages({ bucket: "imbox", direction: "in" }, 100);
      rootDispose = fn;
    });
    await vi.waitFor(() => expect(handle.items().length).toBe(100));

    vi.mocked(listMessagesPaged).mockResolvedValueOnce({
      items: [makeMessage("tail")],
      total: 200,
      limit: 100,
      offset: 0,
    });
    await handle.loadMore();

    // `OFFSET n` is O(n) — 17 s at 50 000 rows on a 100k mailbox. The cursor
    // must be the last loaded row and the offset pinned to 0.
    expect(
      vi.mocked(listMessagesPaged).mock.calls[
        vi.mocked(listMessagesPaged).mock.calls.length - 1
      ]?.[0],
    ).toMatchObject({
      before: { timelineAt: "2026-01-01T00:00:00.000Z", id: "k99" },
      offset: 0,
    });
    expect(handle.items()[handle.items().length - 1]?.id).toBe("tail");
  });

  it("falls back to offset when a row carries no timeline value", async () => {
    const legacy = { ...makeMessage("old"), timelineAt: undefined, st: "" };
    vi.mocked(listMessagesPaged).mockResolvedValueOnce({
      items: [legacy],
      total: 2,
      limit: 100,
      offset: 0,
    });
    let handle!: PaginatedMessagesHandle;
    createRoot((fn) => {
      handle = usePaginatedMessages({ bucket: "imbox" }, 100);
      rootDispose = fn;
    });
    await vi.waitFor(() => expect(handle.items().length).toBe(1));

    vi.mocked(listMessagesPaged).mockResolvedValueOnce({
      items: [makeMessage("next")],
      total: 2,
      limit: 100,
      offset: 1,
    });
    await handle.loadMore();

    expect(
      vi.mocked(listMessagesPaged).mock.calls[
        vi.mocked(listMessagesPaged).mock.calls.length - 1
      ]?.[0],
    ).toMatchObject({ before: undefined, offset: 0 });
  });
});
