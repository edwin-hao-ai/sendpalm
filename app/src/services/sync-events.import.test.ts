/** The first-import toast — what the user is told after SendPalm has
 *  reorganised their mailbox on their behalf.
 *
 *  The copy is the contract: it has to say the mail was imported *silently*
 *  and that those senders will never ask for a decision. A toast that only
 *  says "3120 封已导入" leaves the user wondering why their Screener is
 *  suddenly full — or worse, why it isn't.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  handler: { current: undefined as undefined | ((e: unknown) => void) },
  showToast: vi.fn(),
  setView: vi.fn(),
  bumpSoftRefreshTick: vi.fn(),
}));

vi.mock("./tauri-shim", () => ({ IS_BROWSER: () => false }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: (_name: string, cb: (e: unknown) => void) => {
    h.handler.current = cb;
    return Promise.resolve(() => {});
  },
}));
vi.mock("../stores/ui", () => ({
  showToast: h.showToast,
  setView: h.setView,
  bumpSoftRefreshTick: h.bumpSoftRefreshTick,
}));

import { startSyncEventBridge } from "./sync-events";

interface ReportOverrides {
  account_id?: string;
  new_messages?: number;
  new_message_ids?: string[];
  import_summary?: { messages: number; senders: number } | null;
}

function fire(overrides: ReportOverrides = {}): void {
  const handler = h.handler.current;
  if (!handler) throw new Error("bridge never registered a listener");
  handler({
    payload: {
      account_id: "acct_1",
      mailbox: "INBOX",
      skipped: 0,
      uid_validity: 1,
      last_uid: 10,
      new_message_ids: [],
      import_summary: null,
      ...overrides,
    },
  });
}

function messages(): string[] {
  return h.showToast.mock.calls.map((c) => String((c[0] as { message: string }).message));
}

describe("first-import toast", () => {
  beforeEach(() => {
    h.showToast.mockClear();
    h.setView.mockClear();
    startSyncEventBridge();
  });

  it("states the counts and that the senders skip the Screener", () => {
    fire({ import_summary: { messages: 3120, senders: 214 } });

    expect(messages()).toHaveLength(1);
    expect(messages()[0]).toBe(
      "已静默导入 3,120 封历史邮件 · 其中 214 位发件人已自动通过，不会进入筛选台",
    );
  });

  it("offers a way to see who was approved", () => {
    fire({ import_summary: { messages: 10, senders: 4 } });
    const opts = h.showToast.mock.calls[0]?.[0] as {
      action?: { label: string; run: () => void };
    };
    expect(opts.action?.label).toBe("查看历史发件人");
    opts.action?.run();
    expect(h.setView).toHaveBeenCalledWith("contacts");
  });

  it("omits the sender clause when the import only met the user themselves", () => {
    fire({ import_summary: { messages: 3, senders: 0 } });
    expect(messages()[0]).toBe("已静默导入 3 封历史邮件");
  });

  it("reports an import once per account, even when a resumed pass re-reports", () => {
    fire({ import_summary: { messages: 900, senders: 40 } });
    fire({ import_summary: { messages: 3120, senders: 214 } });
    expect(messages()).toHaveLength(1);
    expect(messages()[0]).toContain("900 封");
  });

  it("says nothing on an ordinary sync", () => {
    fire({ new_messages: 2, new_message_ids: ["m1", "m2"] });
    expect(messages() ?? []).toEqual([]);
  });

  it("does not also fire the catch-up surge toast during an import", () => {
    // The import toast says "none of these will ask you for a decision"; a
    // second "3,120 封新邮件 · 去批量整理" pointing at an empty Screener
    // contradicts it.
    fire({ new_messages: 3120, import_summary: { messages: 3120, senders: 214 } });
    expect(messages()).toHaveLength(1);
    expect(messages()[0]).toContain("已静默导入");
  });

  it("still fires the surge toast when a big batch is ordinary mail", () => {
    fire({ new_messages: 120, new_message_ids: ["a", "b"] });
    expect(messages()[0]).toContain("同步收到 120 封新邮件");
  });
});
