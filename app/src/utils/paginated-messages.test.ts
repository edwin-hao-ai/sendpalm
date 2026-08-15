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