/** Enter in the topbar belonged to nobody.
 *
 *  The dropdown closed and cleared the query on its way to the full view, so
 *  the results page always greeted the reader with 「输入关键词开始搜索」 even
 *  though the dropdown had just shown matches. The view now seeds itself from
 *  the topbar query, and Enter keeps it.
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
const contact = {
  id: "c-one", firstName: "Quentin", lastName: "Sender", nickname: "",
  name: "Quentin Sender", company: "", title: "",
  emails: [{ value: "quentin@example.com", label: "work" }], phones: [],
  stage: "active", labels: [], topics: [], notes: "", avatar: "", photo: "",
  health: 60, sc: 0, scC: "", scL: "", lc: "", grp: "", trd: "stable", pattern: "",
  accounts: [], stageHistory: [], firstContact: now, milestones: [], merged: false,
  blocked: false, notify: false, firstSeen: false, screened: true,
  defaultBucket: "imbox", autoLabel: [], recycling: false, ch: [],
} as unknown as Contact;
const message = {
  id: "m-one", pid: "c-one", subj: "kumquat quarterly report",
  prev: "the kumquat numbers are in", body: "the kumquat numbers are in",
  bodyHtml: null, tm: "10:00", st: now, ac: "acct-a", bucket: "imbox",
  direction: "in", unread: false, labels: [], attachments: [], trackers: [],
  replyLater: false, setAside: false, bubbleUpAt: null, remindAt: null,
  deletedAt: null, to: "me@example.com", cc: [], bcc: [], threadId: undefined,
  calendarInvite: null,
} as unknown as Message;

/** A task is not in the FTS index, so the dropdown has nothing to offer and
 *  Enter must take the reader to the full view — which searches it with Fuse.
 *  That is exactly the path that used to arrive empty. (The seed payload has no
 *  tasks, so it is written straight to the store.) */
async function seedTask(page: Page) {
  await page.evaluate(async () => {
    const db = await window.__sendpalmE2E!.__internals.getDb();
    await db.execute(
      `INSERT INTO tasks (id,title,due,status,priority,related_contact_id,
        related_event_id,notes,created_at,related_message_id,direction)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      ["t-one", "kumquat stocktake", null, "todo", "normal", null, null, "", new Date().toISOString(), null, "mine"],
    );
  });
}

async function seed(page: Page) {
  await page.goto("/");
  await page.locator("body.app-ready").waitFor({ timeout: 10_000 });
  await page.evaluate(async () => {
    await window.__sendpalmE2E?.resetData();
  });
  await page.addInitScript((s: string) => {
    sessionStorage.setItem("__sendpalm_e2e_seed", s);
  }, JSON.stringify({ accounts: [account], contacts: [contact], messages: [message] }));
  await page.goto("/");
  await page.locator("body.app-ready").waitFor({ timeout: 10_000 });
  await page.evaluate(() => window.__sendpalmE2E?.__seedReady);
}

test("Enter in the topbar search keeps the query and shows results", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page);
  await seedTask(page);

  const input = page.locator('[aria-label="搜索"]').first();
  await input.click();
  await input.fill("kumquat");
  // The dropdown owns the Enter key, so it has to be mounted before pressing.
  await expect(page.getByTestId("live-search-dropdown")).toBeVisible({ timeout: 5_000 });
  await input.press("Enter");

  // The full view, with the query still in its own input…
  await expect(page.locator(".page-header-title")).toHaveText("搜索");
  const viewInput = page.locator('input[placeholder="搜索整个工作区…"]');
  await expect(viewInput).toHaveValue("kumquat", { timeout: 5_000 });

  // …and the match, not the empty state.
  await expect(page.getByText("输入关键词开始搜索")).toHaveCount(0);
  await expect(page.getByText(/kumquat stocktake/i).first()).toBeVisible({
    timeout: 5_000,
  });
});
