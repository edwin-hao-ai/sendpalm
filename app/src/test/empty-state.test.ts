/** countGateCandidates helper — drives the Inbox empty-state copy. */

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../services/tauri-shim", () => ({ IS_BROWSER: () => true }));

import { countGateCandidates, listAccounts } from "../stores/data";
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

/** InboxEmptyState branches — Defect D. The component picks one of three
 * copies based on (a) whether any email account exists and (b) whether any
 * contacts are still first_seen=1 AND screened=0 (the "Gate" candidates).
 *
 * We don't mount the SolidJS component here — that would need
 * `solid-testing-library` + a stubbed router. Instead we verify the two
 * underlying resources return what each branch needs:
 *
 *   - "add account"  → emailAccountCount() === 0  → listAccounts().filter(...)
 *                       returns [].
 *   - "open Gate"    → unscreened() > 0          → countGateCandidates() > 0.
 *   - "inbox empty"  → accounts exist, unscreened === 0.
 *
 * This keeps the test parallel to the existing countGateCandidates coverage
 * and avoids hauling in a renderer + the global App context.
 */

const ACCOUNTS_INSERT = `INSERT INTO accounts (
  id, type, provider, email, label, display_name, status, synced, total,
  privacy, color, avatar, last_sync, error, workspace, settings_json
) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`;

function emailAccountRow(id: string): unknown[] {
  return [
    id,
    "email",
    "feishu",
    `${id}@x`,
    id,
    id,
    "connected",
    0,
    0,
    "unified",
    "#0A8F63",
    id,
    "",
    null,
    null,
    null,
  ];
}

describe("InboxEmptyState branches", () => {
  beforeEach(() => {
    resetMockDb();
  });

  it("renders 'add account' when no email accounts", async () => {
    // Empty DB: listAccounts() should return [], so emailAccountCount() === 0.
    expect(await listAccounts()).toEqual([]);
    expect(await countGateCandidates()).toBe(0);
  });

  it("renders 'open Gate' when an email account exists with unscreened contacts", async () => {
    const db = new MockDb();
    await db.execute(ACCOUNTS_INSERT, emailAccountRow("acct_x"));
    await db.execute(CONTACTS_INSERT, contactsRow("c_a", 1, 0));

    expect(await listAccounts()).toHaveLength(1);
    expect(await countGateCandidates()).toBe(1);
  });

  it("renders 'inbox empty' when accounts exist and no unscreened contacts", async () => {
    const db = new MockDb();
    await db.execute(ACCOUNTS_INSERT, emailAccountRow("acct_x"));

    expect(await listAccounts()).toHaveLength(1);
    expect(await countGateCandidates()).toBe(0);
  });
});
