import { describe, it, expect } from "vitest";
import { priorityScore } from "./priority";
import type { Contact, Message } from "../types";

function makeContact(overrides?: Partial<Contact>): Contact {
  return {
    id: "ct-1",
    firstName: "A",
    lastName: "B",
    nickname: "",
    name: "A B",
    company: "SendPalm",
    title: "",
    emails: [],
    phones: [],
    stage: "active",
    labels: [],
    topics: [],
    notes: "",
    avatar: "",
    photo: "",
    health: 80,
    sc: 50,
    scC: "",
    scL: "",
    lc: "",
    grp: "",
    trd: "stable",
    pattern: "",
    accounts: [],
    stageHistory: [],
    firstContact: new Date().toISOString(),
    milestones: [],
    merged: false,
    blocked: false,
    notify: false,
    firstSeen: true,
    screened: true,
    defaultBucket: "imbox",
    autoLabel: [],
    recycling: false,
    ch: [],
    ...overrides,
  };
}

function makeMessage(overrides?: Partial<Message>): Message {
  return {
    id: "msg-1",
    pid: "ct-1",
    subj: "Test",
    prev: "",
    body: "",
    bodyHtml: null,
    tm: "10:00",
    st: new Date().toISOString(),
    ac: "acct-1",
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
    to: "me@example.com",
    cc: [],
    bcc: [],
    ...overrides,
  };
}

describe("priorityScore", () => {
  it("ranks higher contact score above lower", () => {
    const high = makeContact({ sc: 90 });
    const low = makeContact({ sc: 10 });
    expect(priorityScore(makeMessage(), high)).toBeGreaterThan(
      priorityScore(makeMessage(), low),
    );
  });

  it("boosts risk group and penalizes cold group", () => {
    const base = makeContact({ sc: 50 });
    const risk = makeContact({ sc: 50, grp: "risk" });
    const cold = makeContact({ sc: 50, grp: "cold" });
    expect(priorityScore(makeMessage(), risk)).toBeGreaterThan(
      priorityScore(makeMessage(), base),
    );
    expect(priorityScore(makeMessage(), base)).toBeGreaterThan(
      priorityScore(makeMessage(), cold),
    );
  });

  it("prefers newer messages over older ones", () => {
    const now = Date.now();
    const recent = makeMessage({ st: new Date(now - 1000 * 60).toISOString() });
    const old = makeMessage({
      st: new Date(now - 1000 * 60 * 60 * 24 * 5).toISOString(),
    });
    expect(priorityScore(recent, undefined)).toBeGreaterThan(
      priorityScore(old, undefined),
    );
  });
});
