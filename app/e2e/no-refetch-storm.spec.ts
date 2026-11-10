/** Opening a message, or just sitting still, must not re-query the store.
 *
 *  `useRefreshEffect` ran its callback inside the effect's tracking scope, so
 *  whatever the callback read became a dependency. Topbar's sync badge
 *  refetched the account list and then walked it to fetch each account's sync
 *  state: every resolution re-ran the effect, which refetched again. From app
 *  start that was an unbounded IPC loop — ~28,000 `SELECT * FROM accounts` in
 *  half a second, one CPU core pinned for the whole session, and every list
 *  flickering while the user did nothing but open one mail.
 */

import { test, expect, type Page } from "@playwright/test";
import type { Account, Contact, Message } from "../src/types";

const now = new Date().toISOString();

const account = {
  id: "acct-a", type: "email", provider: "custom", email: "me@example.com",
  label: "me", displayName: "me", status: "connected", synced: 0, total: 0,
  privacy: "unified", color: "#0a8f63", avatar: "", lastSync: now,
  settings: {
    aliases: [], signature: "", replyTo: "", defaultFrom: "me@example.com",
    syncFolders: [], syncFrequency: "manual", autoBcc: false, autoBccAddress: "",
    vacationResponder: { enabled: false, subject: "", body: "" },
  },
} as Account;

/** One sender per message: three or more mails from the same sender collapse
 *  into a bundle drawer, and the test needs top-level rows. */
const contact = (i: number) =>
  ({
    id: `c${i}`, firstName: `Sam${i}`, lastName: "Sender", nickname: "", name: `Sam${i} Sender`,
    company: "", title: "", emails: [{ value: `sam${i}@example.com`, label: "work" }],
    phones: [], stage: "active", labels: [], topics: [], notes: "", avatar: "", photo: "",
    health: 60, sc: 0, scC: "", scL: "", lc: "", grp: "", trd: "stable", pattern: "",
    accounts: [], stageHistory: [], firstContact: now, milestones: [], merged: false,
    blocked: false, notify: false, firstSeen: false, screened: true,
    defaultBucket: "imbox", autoLabel: [], recycling: false, ch: [],
  }) as unknown as Contact;

const message = (i: number): Message => ({
  id: `m${i}`, pid: `c${i}`, subj: `Subject ${i}`, prev: `preview ${i}`,
  body: `body ${i}`, bodyHtml: null, tm: "10:00",
  st: new Date(Date.now() - i * 60_000).toISOString(), ac: "acct-a",
  bucket: "imbox", direction: "in", unread: true, labels: [], attachments: [],
  trackers: [], replyLater: false, setAside: false, bubbleUpAt: null,
  remindAt: null, deletedAt: null, to: "me@example.com", cc: [], bcc: [],
  threadId: undefined, calendarInvite: null,
}) as unknown as Message;

async function seed(page: Page) {
  await page.goto("/");
  await page.locator("body.app-ready").waitFor({ timeout: 10_000 });
  await page.evaluate(async () => {
    await window.__sendpalmE2E?.resetData();
  });
  await page.addInitScript((s: string) => {
    sessionStorage.setItem("__sendpalm_e2e_seed", s);
  }, JSON.stringify({
    accounts: [account],
    contacts: Array.from({ length: 6 }, (_, i) => contact(i)),
    messages: Array.from({ length: 6 }, (_, i) => message(i)),
  }));
  await page.goto("/");
  await page.locator("body.app-ready").waitFor({ timeout: 10_000 });
  await page.evaluate(() => window.__sendpalmE2E?.__seedReady);
  await expect(page.locator("[data-message-id]").first()).toBeVisible({ timeout: 10_000 });
}

const queries = (page: Page) =>
  page.evaluate(() => window.__sendpalmE2E!.queries());

/** Settle: resources resolve, then nothing should ask the store anything. */
async function quietWindow(page: Page): Promise<string[]> {
  await page.waitForTimeout(600);
  const before = (await queries(page)).length;
  await page.waitForTimeout(1_000);
  return (await queries(page)).slice(before);
}

test("an idle inbox does not re-query the store", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page);
  const issued = await quietWindow(page);
  // A 60s reminder tick is the only legitimate background query, and this
  // window is 1s wide.
  expect(issued, `idle queries:\n${issued.join("\n")}`).toHaveLength(0);
});

test("opening a message queries the detail, not the list", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page);
  await page.waitForTimeout(600);

  const before = (await queries(page)).length;
  await page.locator('[data-message-id="m1"]').first().click();
  await expect(page.locator("#detail-panel")).toBeVisible({ timeout: 5_000 });
  await page.waitForTimeout(1_200);

  const issued = (await queries(page)).slice(before);
  // Opening a message legitimately reads its own row, thread, contact,
  // attachments and notes — a bounded burst, not a stream.
  expect(issued.length, `queries issued:\n${issued.join("\n")}`).toBeLessThan(36);
  // The agent tables used to be pulled on every message open: the panel called
  // `useAgent()` just to run `newSession`, and that hook eagerly loads four
  // whole tables (AGENTS §11.7). It now receives an intent instead.
  expect(
    issued.filter((q) => /from agent_/i.test(q)),
    "opening a message must not load the agent history",
  ).toHaveLength(0);

  // The bug was that the burst never stopped: the list (and the account
  // list under it) kept being re-read for as long as the panel was open.
  // Once the panel has settled, the store must be quiet.
  const after = await quietWindow(page);
  expect(after, `queries issued after the panel settled:\n${after.join("\n")}`).toHaveLength(0);
});
