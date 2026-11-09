/** Search over the local index — the SQL both paths emit must run. */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/tauri-shim", () => ({ IS_BROWSER: () => true }));

import { searchIndex, upsertContact, upsertMessage } from "./data";
import { resetMockDb } from "../services/mock-db";
import type { Contact, Message } from "../types";

function contact(id: string, name: string): Contact {
  return {
    id,
    firstName: name,
    lastName: "",
    nickname: "",
    name,
    company: "",
    title: "",
    emails: [{ value: `${id}@example.com`, label: "work" }],
    phones: [],
    stage: "active",
    labels: [],
    topics: [],
    notes: "",
    avatar: "",
    photo: "",
    health: 0,
    sc: 0,
    scC: "",
    scL: "",
    lc: "",
    grp: "",
    trd: "stable",
    pattern: "",
    accounts: [],
    stageHistory: [],
    firstContact: "",
    milestones: [],
    merged: false,
    blocked: false,
    notify: false,
    firstSeen: false,
    screened: true,
    defaultBucket: "imbox",
    autoLabel: [],
    recycling: false,
    ch: [],
  } as Contact;
}

function message(id: string, pid: string, subj: string, body: string): Message {
  return {
    id,
    pid,
    subj,
    prev: "",
    body,
    bodyHtml: null,
    tm: "10:00",
    st: "2026-11-01T00:00:00.000Z",
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
  } as Message;
}

beforeEach(async () => {
  resetMockDb();
  await upsertContact(contact("c1", "郝亚伟"));
  await upsertMessage(
    message("m1", "c1", "郝亚伟先生的拒付资料", "银行说这笔拒付需要补充材料"),
  );
});

describe("searchIndex", () => {
  it("finds a Chinese substring that is not a prefix of the run", async () => {
    const hits = await searchIndex("拒付资料");
    expect(hits.map((h) => h.id)).toContain("m1");
  });

  it("finds a two-character Chinese word through the LIKE path", async () => {
    const hits = await searchIndex("拒付");
    expect(hits.map((h) => h.id)).toContain("m1");
  });

  it("does not throw on a query containing a colon", async () => {
    // `Re: 报价` used to reach FTS5 as syntax and fail with
    // "no such column: Re".
    await expect(searchIndex("Re: 拒付资料")).resolves.toBeInstanceOf(Array);
  });

  it("does not throw on a query containing a dash", async () => {
    await expect(searchIndex("a-b")).resolves.toBeInstanceOf(Array);
  });

  it("returns nothing for an empty query instead of querying", async () => {
    expect(await searchIndex("   ")).toEqual([]);
  });

  it("treats LIKE wildcards as literal characters", async () => {
    // A user searching "100%" must not match every row.
    const hits = await searchIndex("100%");
    expect(hits).toEqual([]);
  });
});
