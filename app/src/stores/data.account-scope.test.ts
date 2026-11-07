/** Account scoping in the message queries.
 *
 *  These lock the two guarantees the multi-account UI depends on:
 *   • `listMessagesPaged({ accountIds })` really restricts by `messages.ac`
 *     and a `[]` selection returns an empty page instead of throwing on
 *     `IN ()`.
 *   • the tab badges come from bounded `COUNT(*)` queries, not from pulling
 *     the table across the IPC bridge (AGENTS §11.7).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/tauri-shim", () => ({ IS_BROWSER: () => true }));

import {
  countMessagesByAccount,
  listMessagesPaged,
  upsertMessage,
} from "./data";
import { resetMockDb } from "../services/mock-db";
import type { Message } from "../types";

function msg(
  id: string,
  ac: string,
  overrides: Partial<Message> = {},
): Message {
  return {
    id,
    pid: "c1",
    subj: `Subject ${id}`,
    prev: "",
    body: "Body",
    bodyHtml: null,
    tm: "10:00",
    st: "2026-11-01T10:00:00.000Z",
    ac,
    bucket: "imbox",
    direction: "in",
    unread: true,
    labels: [],
    attachments: [],
    trackers: [],
    replyLater: false,
    setAside: false,
    bubbleUpAt: null,
    remindAt: null,
    deletedAt: null,
    ...overrides,
  };
}

beforeEach(async () => {
  resetMockDb();
  await upsertMessage(msg("w1", "work"));
  await upsertMessage(msg("w2", "work", { unread: false }));
  await upsertMessage(msg("p1", "private"));
  await upsertMessage(msg("f1", "work", { bucket: "feed" }));
});

describe("listMessagesPaged — accountIds", () => {
  it("returns every account's rows when no filter is given (merged view)", async () => {
    const page = await listMessagesPaged({ bucket: "imbox" });
    expect(page.items.map((m) => m.id).sort()).toEqual(["p1", "w1", "w2"]);
    expect(page.total).toBe(3);
  });

  it("restricts to one mailbox", async () => {
    const page = await listMessagesPaged({
      bucket: "imbox",
      accountIds: ["work"],
    });
    expect(page.items.map((m) => m.id).sort()).toEqual(["w1", "w2"]);
    expect(page.total).toBe(2);
  });

  it("supports several mailboxes at once (the merged-with-isolation case)", async () => {
    const page = await listMessagesPaged({
      bucket: "imbox",
      accountIds: ["work", "private"],
    });
    expect(page.total).toBe(3);
  });

  it("returns an empty page for an empty account list instead of `IN ()`", async () => {
    const page = await listMessagesPaged({ bucket: "imbox", accountIds: [] });
    expect(page.items).toEqual([]);
    expect(page.total).toBe(0);
  });

  it("composes with the unread filter", async () => {
    const page = await listMessagesPaged({
      bucket: "imbox",
      unreadOnly: true,
      accountIds: ["work"],
    });
    expect(page.items.map((m) => m.id)).toEqual(["w1"]);
  });

  it("does not leak other buckets", async () => {
    const page = await listMessagesPaged({
      bucket: "feed",
      accountIds: ["work"],
    });
    expect(page.items.map((m) => m.id)).toEqual(["f1"]);
  });

  it("returns nothing for an unknown account id", async () => {
    const page = await listMessagesPaged({
      bucket: "imbox",
      accountIds: ["nope"],
    });
    expect(page.total).toBe(0);
  });
});

describe("countMessagesByAccount", () => {
  it("counts all rows per account for a bucket", async () => {
    const counts = await countMessagesByAccount("imbox", ["work", "private"]);
    expect(counts).toEqual({ work: 2, private: 1 });
  });

  it("counts unread only when asked", async () => {
    const counts = await countMessagesByAccount("imbox", ["work", "private"], {
      unreadOnly: true,
    });
    expect(counts).toEqual({ work: 1, private: 1 });
  });

  it("counts read only when asked (the 已读 tab badge)", async () => {
    const counts = await countMessagesByAccount("imbox", ["work", "private"], {
      readOnly: true,
    });
    expect(counts).toEqual({ work: 1, private: 0 });
  });

  it("returns {} for no accounts without querying", async () => {
    expect(await countMessagesByAccount("imbox", [])).toEqual({});
  });
});
