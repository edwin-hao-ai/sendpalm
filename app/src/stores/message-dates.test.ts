/** Mail date integrity — message date columns and timeline ordering. */

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../services/tauri-shim", () => ({ IS_BROWSER: () => true }));

import {
  getMessage,
  listMessagesPaged,
  upsertContact,
  upsertMessage,
} from "./data";
import { resetMockDb } from "../services/mock-db";
import type { Contact, Message } from "../types";

function makeContact(id: string): Contact {
  return {
    id,
    firstName: "First",
    lastName: "Last",
    nickname: "",
    name: `Contact ${id}`,
    company: "",
    title: "",
    emails: [{ value: `${id}@example.com`, label: "work" }],
    phones: [],
    stage: "explore",
    labels: [],
    topics: [],
    notes: "",
    avatar: "",
    photo: "",
    health: 80,
    sc: 0,
    scC: "",
    scL: "",
    lc: "",
    grp: "",
    trd: "stable",
    pattern: "",
    accounts: [],
    stageHistory: [],
    firstContact: "2026-01-01T00:00:00Z",
    milestones: [],
    merged: false,
    blocked: false,
    notify: false,
    firstSeen: true,
    screened: false,
    defaultBucket: "imbox",
    autoLabel: [],
    recycling: false,
    ch: [],
  };
}

function makeMessage(id: string, overrides?: Partial<Message>): Message {
  return {
    id,
    pid: "c1",
    subj: `Subject ${id}`,
    prev: "",
    body: `Body ${id}`,
    bodyHtml: null,
    tm: "2026-01-01 10:00",
    st: "2026-01-01T10:00:00Z",
    ac: "acct-1",
    bucket: "imbox",
    direction: "in",
    unread: false,
    labels: [],
    attachments: [],
    trackers: [],
    replyLater: false,
    setAside: false,
    bubbleUpAt: null,
    remindAt: null,
    deletedAt: null,
    to: "me@example.com",
    cc: [],
    bcc: [],
    threadId: undefined,
    calendarInvite: null,
    ...overrides,
  };
}

describe("message date columns", () => {
  beforeEach(async () => {
    resetMockDb();
    await upsertContact(makeContact("c1"));
  });

  it("round-trips sender and receipt dates", async () => {
    await upsertMessage(
      makeMessage("m1", {
        st: "2026-01-01T10:00:00Z",
        sentAt: "2026-01-01T10:00:00Z",
        receivedAt: "2026-01-01T10:00:07Z",
      }),
    );
    const m = await getMessage("m1");
    expect(m?.sentAt).toBe("2026-01-01T10:00:00Z");
    expect(m?.receivedAt).toBe("2026-01-01T10:00:07Z");
  });

  it("keeps legacy rows readable without inventing dates", async () => {
    await upsertMessage(makeMessage("legacy"));
    const m = await getMessage("legacy");
    expect(m?.sentAt ?? null).toBeNull();
    expect(m?.receivedAt ?? null).toBeNull();
    expect(m?.st).toBe("2026-01-01T10:00:00Z");
  });

  it("orders the inbox by receipt time, not sender time", async () => {
    // Sent in January but only reached the server in March.
    await upsertMessage(
      makeMessage("late-arrival", {
        st: "2026-01-01T10:00:00Z",
        sentAt: "2026-01-01T10:00:00Z",
        receivedAt: "2026-03-01T10:00:00Z",
      }),
    );
    // Ordinary February message with no receipt metadata yet (legacy row).
    await upsertMessage(
      makeMessage("february", {
        st: "2026-02-01T10:00:00Z",
        sentAt: "2026-02-01T10:00:00Z",
      }),
    );

    const page = await listMessagesPaged({ bucket: "imbox", limit: 10 });
    expect(page.items.map((m) => m.id)).toEqual(["late-arrival", "february"]);
  });

  it("exposes dates on the lightweight list projection used by Imbox", async () => {
    await upsertMessage(
      makeMessage("m1", {
        sentAt: "2026-01-01T10:00:00Z",
        receivedAt: "2026-01-01T10:00:07Z",
      }),
    );
    const page = await listMessagesPaged({
      bucket: "imbox",
      limit: 10,
      lightweight: true,
    });
    const row = page.items[0]!;
    expect(row.receivedAt).toBe("2026-01-01T10:00:07Z");
    expect(row.sentAt).toBe("2026-01-01T10:00:00Z");
    expect(row.body).toBe("");
  });
});
