/** Settings → 账户 → 筛选台: review the senders auto-approved on import. */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/tauri-shim", () => ({ IS_BROWSER: () => true }));

import {
  countAutoApprovedContacts,
  countGateCandidates,
  reapproveContacts,
  reopenAutoApprovedContacts,
  upsertContact,
} from "./data";
import { resetMockDb } from "../services/mock-db";
import type { Contact } from "../types";

function contact(id: string, overrides: Partial<Contact> = {}): Contact {
  return {
    id,
    firstName: "S",
    lastName: id,
    nickname: "",
    name: `Sender ${id}`,
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
    ...overrides,
  } as Contact;
}

beforeEach(async () => {
  resetMockDb();
  // Auto-approved on import.
  await upsertContact(contact("auto1"));
  await upsertContact(contact("auto2"));
  // Already in the screener.
  await upsertContact(contact("gate1", { screened: false, firstSeen: true }));
  // Blocked: not part of the review.
  await upsertContact(
    contact("blocked", { screened: true, firstSeen: false, blocked: true }),
  );
});

describe("auto-approved senders", () => {
  it("counts only the ones approved without a decision, excluding blocked", async () => {
    expect(await countAutoApprovedContacts()).toBe(2);
  });

  it("moves them into the screener and reports their ids", async () => {
    const ids = await reopenAutoApprovedContacts();
    expect(ids.sort()).toEqual(["auto1", "auto2"]);
    expect(await countAutoApprovedContacts()).toBe(0);
    // They now count as Gate candidates.
    expect(await countGateCandidates()).toBe(3);
  });

  it("the undo puts them back", async () => {
    const ids = await reopenAutoApprovedContacts();
    await reapproveContacts(ids);
    expect(await countAutoApprovedContacts()).toBe(2);
    expect(await countGateCandidates()).toBe(1);
  });
});
