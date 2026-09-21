import { describe, it, expect } from "vitest";
import { filterContacts, healthLabel } from "./Contacts";
import type { Contact } from "../types";

function contact(over: Partial<Contact>): Contact {
  return {
    id: over.id ?? "c1",
    firstName: "",
    lastName: "",
    nickname: "",
    name: "",
    company: "",
    title: "",
    emails: [],
    phones: [],
    stage: "explore",
    labels: [],
    topics: [],
    notes: "",
    avatar: "",
    photo: "",
    health: 75,
    sc: 50,
    scC: "#a09aae",
    scL: "",
    lc: "",
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
    ...over,
  };
}

const LIST = [
  contact({ id: "c1", name: "王雨晴", company: "蓝湖资本", grp: "active" }),
  contact({ id: "c2", name: "Sarah Miller", company: "Stripe", grp: "risk" }),
  contact({
    id: "c3",
    name: "陈晓",
    company: "澄光科技",
    grp: "cold",
    emails: [{ value: "chenxiao@example.com", label: "work" }],
  }),
];

describe("filterContacts", () => {
  it("returns the full list for the 'all' filter with no query", () => {
    expect(filterContacts(LIST, "all", "")).toHaveLength(3);
  });

  it("filters by health group", () => {
    expect(filterContacts(LIST, "risk", "").map((c) => c.id)).toEqual(["c2"]);
    expect(filterContacts(LIST, "cold", "").map((c) => c.id)).toEqual(["c3"]);
  });

  it("matches the query against name, company, and email", () => {
    expect(filterContacts(LIST, "all", "蓝湖").map((c) => c.id)).toEqual([
      "c1",
    ]);
    expect(filterContacts(LIST, "all", "sarah").map((c) => c.id)).toEqual([
      "c2",
    ]);
    expect(
      filterContacts(LIST, "all", "CHENXIAO@EXAMPLE").map((c) => c.id),
    ).toEqual(["c3"]);
  });

  it("combines filter and query", () => {
    expect(filterContacts(LIST, "cold", "澄光").map((c) => c.id)).toEqual([
      "c3",
    ]);
    expect(filterContacts(LIST, "cold", "蓝湖")).toHaveLength(0);
  });
});

describe("healthLabel", () => {
  it("maps the numeric score to a semantic Chinese label", () => {
    expect(healthLabel(80)).toBe("活跃");
    expect(healthLabel(50)).toBe("一般");
    expect(healthLabel(10)).toBe("冷淡");
  });
});
