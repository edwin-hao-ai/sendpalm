/** Imbox's contact map must stay a narrow projection.
 *
 *  Imbox re-reads contacts on every soft sync tick. A `SELECT *` there means
 *  the heavy columns (notes / pattern / stage history / topics) plus ~5
 *  JSON.parse per row cross the IPC bridge on each tick — the slow-burning
 *  version of the 8 GB boot OOM (AGENTS §11.7).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/tauri-shim", () => ({ IS_BROWSER: () => true }));

import { listContacts, listContactsForList, upsertContact } from "./data";
import { resetMockDb } from "../services/mock-db";
import type { Contact } from "../types";

function contact(id: string, overrides: Partial<Contact> = {}): Contact {
  return {
    id,
    firstName: "Alice",
    lastName: "Wang",
    nickname: "",
    name: `Contact ${id}`,
    company: "ABC",
    title: "采购",
    emails: [{ value: `${id}@example.com`, label: "work" }],
    phones: [],
    stage: "active",
    labels: ["vip"],
    topics: ["pricing"],
    notes: "x".repeat(4000),
    avatar: "https://example.com/a.png",
    photo: "https://example.com/p.png",
    health: 72,
    sc: 41,
    scC: "#fff",
    scL: "high",
    lc: "2026-01-01",
    grp: "risk",
    trd: "stable",
    pattern: JSON.stringify({ 最近: "报价" }),
    accounts: [],
    stageHistory: [{ at: "2026-01-01", stage: "active" }],
    firstContact: "2026-01-01",
    milestones: [],
    merged: false,
    blocked: false,
    notify: true,
    firstSeen: true,
    screened: true,
    defaultBucket: "imbox",
    autoLabel: [],
    recycling: false,
    ch: [],
    ...overrides,
  } as Contact;
}

beforeEach(async () => {
  resetMockDb();
  await upsertContact(contact("c1"));
});

describe("listContactsForList", () => {
  it("keeps the fields the list actually renders", async () => {
    const [c] = await listContactsForList();
    expect(c!.id).toBe("c1");
    expect(c!.name).toBe("Contact c1");
    expect(c!.avatar).toContain("a.png");
    expect(c!.screened).toBe(true);
    expect(c!.firstSeen).toBe(true);
    expect(c!.sc).toBe(41);
    expect(c!.grp).toBe("risk");
  });

  it("drops every heavy column", async () => {
    const [c] = await listContactsForList();
    expect(c!.notes).toBe("");
    expect(c!.pattern).toBe("");
    expect(c!.stageHistory).toEqual([]);
    expect(c!.topics).toEqual([]);
    expect(c!.labels).toEqual([]);
    expect(c!.photo).toBe("");
    expect(c!.emails).toEqual([]);
  });

  it("is materially lighter than the full row", async () => {
    const [full] = await listContacts();
    const [light] = await listContactsForList();
    expect(JSON.stringify(full).length).toBeGreaterThan(
      JSON.stringify(light).length * 3,
    );
  });
});
