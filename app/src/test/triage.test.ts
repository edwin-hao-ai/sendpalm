/** Tests for triage helpers. */

import { describe, expect, it } from "vitest";
import {
  getFocusReplyCandidates,
  getReadTogetherCandidates,
} from "../utils/triage";
import type { Contact, Message } from "../types";

const mkMsg = (
  id: string,
  pid: string,
  overrides: Partial<Message> = {},
): Message =>
  ({
    id,
    pid,
    subj: id,
    prev: "",
    body: "",
    tm: "",
    st: "2026-01-01T00:00:00Z",
    ac: "a",
    bucket: "imbox",
    unread: true,
    labels: [],
    attachments: [],
    replyLater: false,
    setAside: false,
    bubbleUpAt: null,
    ...overrides,
  }) as Message;

const mkContact = (id: string, overrides: Partial<Contact> = {}): Contact =>
  ({
    id,
    name: id,
    firstName: "",
    lastName: "",
    screened: true,
    blocked: false,
    ...overrides,
  }) as Contact;

describe("getFocusReplyCandidates", () => {
  it("returns messages marked replyLater excluding completed", () => {
    const msgs = [
      mkMsg("m1", "a", { replyLater: true }),
      mkMsg("m2", "a", { replyLater: true }),
      mkMsg("m3", "a", { replyLater: false }),
    ];
    expect(getFocusReplyCandidates(msgs, new Set())).toHaveLength(2);
    expect(getFocusReplyCandidates(msgs, new Set(["m1"]))).toHaveLength(1);
  });

  it("sorts newest first", () => {
    const msgs = [
      mkMsg("old", "a", { replyLater: true, st: "2026-01-01T00:00:00Z" }),
      mkMsg("new", "a", { replyLater: true, st: "2026-01-02T00:00:00Z" }),
    ];
    const out = getFocusReplyCandidates(msgs, new Set());
    expect(out[0]!.id).toBe("new");
  });
});

describe("getReadTogetherCandidates", () => {
  it("returns unread imbox messages not in piles", () => {
    const contacts = [mkContact("a")];
    const msgs = [
      mkMsg("m1", "a", { unread: true }),
      mkMsg("m2", "a", { unread: false }),
      mkMsg("m3", "a", { replyLater: true }),
      mkMsg("m4", "a", { setAside: true }),
      mkMsg("m5", "a", { bubbleUpAt: "2026-01-02T00:00:00Z" }),
    ];
    const out = getReadTogetherCandidates(msgs, contacts);
    expect(out.map((m) => m.id)).toEqual(["m1"]);
  });

  it("excludes unscreened or blocked contacts", () => {
    const contacts = [
      mkContact("a"),
      mkContact("b", { screened: false }),
      mkContact("c", { blocked: true }),
    ];
    const msgs = [
      mkMsg("m1", "a", { unread: true }),
      mkMsg("m2", "b", { unread: true }),
      mkMsg("m3", "c", { unread: true }),
    ];
    const out = getReadTogetherCandidates(msgs, contacts);
    expect(out.map((m) => m.id)).toEqual(["m1"]);
  });

  it("sorts newest first", () => {
    const contacts = [mkContact("a")];
    const msgs = [
      mkMsg("m1", "a", { unread: true, st: "2026-01-01T00:00:00Z" }),
      mkMsg("m2", "a", { unread: true, st: "2026-01-03T00:00:00Z" }),
    ];
    const out = getReadTogetherCandidates(msgs, contacts);
    expect(out[0]!.id).toBe("m2");
  });
});
