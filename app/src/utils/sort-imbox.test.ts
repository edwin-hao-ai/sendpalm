import { describe, it, expect } from "vitest";
import { sortImboxMessages } from "./sort-imbox";
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

describe("sortImboxMessages", () => {
  const now = new Date("2026-08-01T12:00:00Z").getTime();
  const day = (n: number) => new Date(now - n * 86400000).toISOString();

  const vip = makeContact({ id: "vip", sc: 95 });
  const cold = makeContact({ id: "cold", sc: 10, grp: "cold" });

  const oldFromVip = makeMessage({
    id: "old-vip",
    pid: "vip",
    st: day(180), // 6 months ago — age term clamped to 0
  });
  const newFromCold = makeMessage({
    id: "new-cold",
    pid: "cold",
    st: day(0), // today — age term = 18
  });
  const middleFromCold = makeMessage({
    id: "mid-cold",
    pid: "cold",
    st: day(5),
  });

  it("does not mutate the input array", () => {
    const input = [oldFromVip, newFromCold];
    const before = input.slice();
    sortImboxMessages(input, "newest", []);
    expect(input).toEqual(before);
  });

  it("newest puts the freshest message first", () => {
    const out = sortImboxMessages(
      [oldFromVip, newFromCold, middleFromCold],
      "newest",
      [vip, cold],
    );
    expect(out.map((m) => m.id)).toEqual(["new-cold", "mid-cold", "old-vip"]);
  });

  it("newest breaks staleness — old VIP does NOT block new cold", () => {
    // Regression for the user-reported bug: prototype defaults to newest,
    // and the Imbox should never let an old unread hide a new unread just
    // because the old one is from a higher-scored contact.
    const out = sortImboxMessages([oldFromVip, newFromCold], "newest", [
      vip,
      cold,
    ]);
    expect(out[0]?.id).toBe("new-cold");
    expect(out[1]?.id).toBe("old-vip");
  });

  it("oldest reverses the date order", () => {
    const out = sortImboxMessages(
      [newFromCold, oldFromVip, middleFromCold],
      "oldest",
      [vip, cold],
    );
    expect(out.map((m) => m.id)).toEqual(["old-vip", "mid-cold", "new-cold"]);
  });

  it("most_relevant puts the higher-priority message first", () => {
    const out = sortImboxMessages(
      [newFromCold, oldFromVip],
      "most_relevant",
      [vip, cold],
    );
    // oldFromVip has contact score 95*0.45 = 42.75 + age 0 = 42.75
    // newFromCold has contact score 10*0.45 - 35 (cold) + 18 (age) = -12.5
    expect(out[0]?.id).toBe("old-vip");
    expect(out[1]?.id).toBe("new-cold");
  });

  it("treats missing contact as priority 0", () => {
    const orphan = makeMessage({ id: "orphan", pid: "ghost", st: day(0) });
    const out = sortImboxMessages([orphan], "most_relevant", []);
    expect(out[0]?.id).toBe("orphan");
  });
});
