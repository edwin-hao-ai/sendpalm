/** countGateCandidates helper — drives the Inbox empty-state copy. */

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../services/tauri-shim", () => ({ IS_BROWSER: () => true }));

import { countGateCandidates } from "../stores/data";
import { MockDb, resetMockDb } from "../services/mock-db";

const CONTACTS_INSERT = `INSERT INTO contacts (
  id, first_name, last_name, nickname, name, company, title,
  emails_json, phones_json, stage, labels_json, topics_json, notes,
  avatar, photo, health, sc, sc_c, sc_l, lc, grp, trd, pattern,
  accounts_json, stage_history_json, first_contact, milestones_json,
  merged, blocked, notify, first_seen, screened, default_bucket,
  auto_label_json, recycling, ch_json
) VALUES (
  $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
  $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36
)`;

function contactsRow(
  id: string,
  firstSeen: number,
  screened: number,
): unknown[] {
  return [
    id,
    "A",
    "",
    "",
    `${id}@x`,
    "",
    "",
    "[]",
    "[]",
    "explore",
    "[]",
    "[]",
    "",
    "",
    "",
    80,
    0,
    "",
    "",
    "",
    "",
    "",
    "stable",
    "[]",
    "[]",
    new Date().toISOString(),
    "[]",
    0,
    0,
    0,
    firstSeen,
    screened,
    "imbox",
    "[]",
    0,
    "[]",
  ];
}

describe("countGateCandidates", () => {
  beforeEach(() => {
    resetMockDb();
  });

  it("returns 0 when no contacts", async () => {
    expect(await countGateCandidates()).toBe(0);
  });

  it("counts only first_seen=1 AND screened=0 rows", async () => {
    // MockDb exposes only `select`/`execute` (see services/mock-db.ts header
    // — it mirrors the SQL emitted by stores/data.ts, not the typed wrappers
    // like upsertContact), so we insert contacts via the real INSERT SQL.
    const db = new MockDb();
    await db.execute(CONTACTS_INSERT, contactsRow("c_a", 1, 0));
    await db.execute(CONTACTS_INSERT, contactsRow("c_b", 0, 1));
    await db.execute(CONTACTS_INSERT, contactsRow("c_c", 0, 0));
    await db.execute(CONTACTS_INSERT, contactsRow("c_d", 1, 1));

    expect(await countGateCandidates()).toBe(1);
  });
});
