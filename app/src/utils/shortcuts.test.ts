/** Regression tests for the global shortcut router.
 *
 * The 2026-09-22 audit found that the six message-action handlers
 * (set-aside / bubble-up / archive / trash / spam / unread) fired from
 * BOTH the global handler here and the Imbox-local handler on the same
 * keypress — two DB writes racing, one via upsertMessage (no
 * deleted_at) and one via moveMessageToBucket (writes deleted_at),
 * flipping the bucket back and forth. These tests pin the gate:
 * while view === "imbox" the global handler must not touch the DB.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot } from "solid-js";

const dataMocks = vi.hoisted(() => ({
  getMessage: vi.fn(),
  listShortcuts: vi.fn(),
  markMessageUnread: vi.fn(),
  moveMessageToBucket: vi.fn(),
  setMessagePileFlags: vi.fn(),
}));

vi.mock("../stores/data", () => dataMocks);
vi.mock("../components/BulkActionMenu", () => ({
  openBulkActionMenu: vi.fn(),
}));

import { useGlobalShortcuts } from "./shortcuts";
import { setView, setSelectedMessageId } from "../stores/ui";

const flush = () => new Promise((r) => setTimeout(r, 0));

function pressKey(key: string) {
  document.dispatchEvent(new KeyboardEvent("keydown", { key }));
}

describe("useGlobalShortcuts message-action gates", () => {
  let dispose: () => void;

  beforeEach(async () => {
    vi.clearAllMocks();
    dataMocks.listShortcuts.mockResolvedValue([]);
    dataMocks.getMessage.mockResolvedValue({
      id: "m1",
      unread: true,
      bucket: "feed",
    });
    createRoot((d) => {
      dispose = d;
      useGlobalShortcuts();
    });
    // Let the shortcuts resource resolve before dispatching keys.
    await flush();
  });

  afterEach(() => {
    dispose();
    setView("imbox");
    setSelectedMessageId(null);
  });

  it("does not write the DB from the global handler while the Imbox view is active", async () => {
    setView("imbox");
    setSelectedMessageId("m1");

    for (const key of ["a", "z", "e", "t", "!", "u"]) {
      pressKey(key);
      await flush();
    }

    expect(dataMocks.moveMessageToBucket).not.toHaveBeenCalled();
    expect(dataMocks.setMessagePileFlags).not.toHaveBeenCalled();
    expect(dataMocks.markMessageUnread).not.toHaveBeenCalled();
    expect(dataMocks.getMessage).not.toHaveBeenCalled();
  });

  it("writes exactly once per keypress in non-Imbox list views (archive)", async () => {
    setView("feed");
    setSelectedMessageId("m1");

    pressKey("e");
    await flush();

    expect(dataMocks.moveMessageToBucket).toHaveBeenCalledTimes(1);
    expect(dataMocks.moveMessageToBucket).toHaveBeenCalledWith(
      "m1",
      "paperTrail",
    );
  });

  it("writes exactly once per keypress in non-Imbox list views (trash)", async () => {
    setView("feed");
    setSelectedMessageId("m1");

    pressKey("t");
    await flush();

    expect(dataMocks.moveMessageToBucket).toHaveBeenCalledTimes(1);
    expect(dataMocks.moveMessageToBucket).toHaveBeenCalledWith("m1", "trash");
  });

  it("writes exactly once per keypress in non-Imbox list views (bubble-up)", async () => {
    setView("feed");
    setSelectedMessageId("m1");

    pressKey("z");
    await flush();

    expect(dataMocks.setMessagePileFlags).toHaveBeenCalledTimes(1);
    const [id, flags] = dataMocks.setMessagePileFlags.mock.calls[0]!;
    expect(id).toBe("m1");
    expect(flags.replyLater).toBe(false);
    expect(flags.setAside).toBe(false);
    expect(typeof flags.bubbleUpAt).toBe("string");
  });

  it("writes exactly once per keypress in non-Imbox list views (unread toggle)", async () => {
    setView("feed");
    setSelectedMessageId("m1");

    pressKey("u");
    await flush();

    expect(dataMocks.markMessageUnread).toHaveBeenCalledTimes(1);
    expect(dataMocks.markMessageUnread).toHaveBeenCalledWith("m1", false);
  });

  it("does nothing on message keys when no message is selected", async () => {
    setView("feed");
    setSelectedMessageId(null);

    for (const key of ["a", "z", "e", "t", "!", "u"]) {
      pressKey(key);
      await flush();
    }

    expect(dataMocks.moveMessageToBucket).not.toHaveBeenCalled();
    expect(dataMocks.setMessagePileFlags).not.toHaveBeenCalled();
    expect(dataMocks.markMessageUnread).not.toHaveBeenCalled();
  });
});
