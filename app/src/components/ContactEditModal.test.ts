import { describe, it, expect } from "vitest";
import { isContactDraftDirty } from "./ContactEditModal";
import type { Contact } from "../types";

function baseContact(): Contact {
  return {
    id: "c1",
    firstName: "雨晴",
    lastName: "王",
    nickname: "",
    name: "王雨晴",
    company: "蓝湖资本",
    title: "招聘专员",
    emails: [{ value: "wang@example.com", label: "work" }],
    phones: [],
    stage: "active",
    labels: [],
    topics: [],
    notes: "",
    avatar: "",
    photo: "",
    health: 80,
    sc: 50,
    scC: "#a09aae",
    scL: "",
    lc: "刚刚",
    grp: "active",
    trd: "stable",
    pattern: "",
    accounts: [],
    stageHistory: [],
    firstContact: "2026-01-01",
    milestones: [],
    merged: false,
    blocked: false,
    notify: true,
    firstSeen: false,
    screened: true,
    defaultBucket: "imbox",
    autoLabel: [],
    recycling: false,
    ch: [],
  };
}

describe("isContactDraftDirty", () => {
  it("is clean for a verbatim copy of the original", () => {
    const original = baseContact();
    const draft = JSON.parse(JSON.stringify(original)) as Contact;
    expect(isContactDraftDirty(original, draft)).toBe(false);
  });

  it("detects an edited field", () => {
    const original = baseContact();
    const draft = { ...baseContact(), notes: "线下活动认识" };
    expect(isContactDraftDirty(original, draft)).toBe(true);
  });

  it("detects added and removed emails", () => {
    const original = baseContact();
    const added = {
      ...baseContact(),
      emails: [
        ...baseContact().emails,
        { value: "w2@example.com", label: "personal" },
      ],
    };
    expect(isContactDraftDirty(original, added)).toBe(true);
    const removed = { ...baseContact(), emails: [] };
    expect(isContactDraftDirty(original, removed)).toBe(true);
  });
});
