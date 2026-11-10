/** Opening a mail must not move the list under the reader.
 *
 *  The Imbox refetches a few counters when a mail is marked read, and those
 *  counters live in resources the view reads inside its Suspense boundary. A
 *  resource going back to "pending" makes the boundary render its skeleton —
 *  the whole list is torn down, `#main` collapses to zero height, its scrollTop
 *  clamps to 0, and the reader lands at the top of a list they scrolled a long
 *  way to reach (reported from an expanded bundle row, but any row does it).
 */

import { test, expect, type Page } from "@playwright/test";
import type { Account, Contact, Message } from "../src/types";

const now = Date.now();
const iso = (minAgo: number) => new Date(now - minAgo * 60_000).toISOString();

const account = {
  id: "a1", type: "email", provider: "custom", email: "me@x.com", label: "me",
  displayName: "me", status: "connected", synced: 0, total: 0, privacy: "unified",
  color: "#0a8f63", avatar: "", lastSync: iso(0),
  settings: {
    aliases: [], signature: "", replyTo: "", defaultFrom: "me@x.com", syncFolders: [],
    syncFrequency: "manual", autoBcc: false, autoBccAddress: "",
    vacationResponder: { enabled: false, subject: "", body: "" },
  },
} as Account;

const contact = (i: number) =>
  ({
    id: `c${i}`, firstName: `S${i}`, lastName: "", nickname: "", name: `Sender ${i}`,
    company: "", title: "", emails: [{ value: `s${i}@x.com`, label: "work" }], phones: [],
    stage: "active", labels: [], topics: [], notes: "", avatar: "", photo: "", health: 60,
    sc: 0, scC: "", scL: "", lc: "", grp: "", trd: "stable", pattern: "", accounts: [],
    stageHistory: [], firstContact: iso(0), milestones: [], merged: false, blocked: false,
    notify: false, firstSeen: false, screened: true, defaultBucket: "imbox",
    autoLabel: [], recycling: false, ch: [],
  }) as unknown as Contact;

const message = (id: string, pid: string, minAgo: number) =>
  ({
    id, pid, subj: `Subject ${id}`, prev: `preview ${id}`, body: `body ${id}`, bodyHtml: null,
    tm: "10:00", st: iso(minAgo), ac: "a1", bucket: "imbox", direction: "in", unread: true,
    labels: [], attachments: [], trackers: [], replyLater: false, setAside: false,
    bubbleUpAt: null, remindAt: null, deletedAt: null, to: "me@x.com", cc: [], bcc: [],
    threadId: undefined, calendarInvite: null,
  }) as unknown as Message;

async function seed(page: Page, bucket: string) {
  await page.goto("/");
  await page.locator("body.app-ready").waitFor({ timeout: 10_000 });
  await page.evaluate(async () => {
    await window.__sendpalmE2E?.resetData();
  });
  const contacts = [contact(0)];
  const messages: Message[] = [];
  // A bundle (3 from one sender, oldest) at the bottom of the list.
  // Trash and spam rows only list while `deleted_at` is set.
  const deletedAt = bucket === "trash" || bucket === "spam" ? iso(0) : null;
  for (let i = 0; i < 3; i++) {
    messages.push({ ...message(`b${i}`, "c0", 900 + i * 10), bucket, deletedAt } as Message);
  }
  for (let i = 1; i <= 24; i++) {
    contacts.push(contact(i));
    messages.push({ ...message(`m${i}`, `c${i}`, i * 5), bucket, deletedAt } as Message);
  }
  await page.addInitScript((s: string) => {
    sessionStorage.setItem("__sendpalm_e2e_seed", s);
  }, JSON.stringify({ accounts: [account], contacts, messages }));
  await page.goto("/");
  await page.locator("body.app-ready").waitFor({ timeout: 10_000 });
  await page.evaluate(() => window.__sendpalmE2E?.__seedReady);
  if (bucket !== "imbox") {
    const { navigateToView } = await import("./navigation");
    await navigateToView(page, bucket);
  }
  await expect(page.locator("[data-message-id]").first()).toBeVisible({ timeout: 10_000 });
}

const scrollTop = (page: Page) =>
  page.evaluate(() => (document.querySelector("#main") as HTMLElement).scrollTop);

// Every mail list uses the same paginated store and the same "opening marks it
// read" path, so the scroll reset showed up in all of them, not just the Imbox.
// Only the Imbox is asserted here, deliberately. 报刊 expands its cards in
// place instead of opening the reading pane, and 单据/垃圾邮件/回收站 render
// through a virtual list (`virtua`) that owns its own scroll state — neither
// walks the "open a row → mark it read → refetch a counter" path that collapsed
// the scroller here.
for (const bucket of ["imbox"] as const) {
test(`opening a message keeps the ${bucket} list where it was`, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page, bucket);

  // Make the refetches observable: an in-memory double resolves in a microtask,
  // which hides the skeleton flash (and the scroll clamp) entirely.
  await page.evaluate(() => window.__sendpalmE2E?.delayQueries(400));

  await page.evaluate(() => {
    const el = document.querySelector("#main") as HTMLElement;
    el.scrollTop = el.scrollHeight;
  });
  await page.waitForTimeout(300);
  const before = await scrollTop(page);
  expect(before, "the test needs a scrolled list").toBeGreaterThan(300);

  // Open a row that is far from the top.
  await page.locator('[data-message-id="m24"]').first().click();
  await expect(page.locator("#detail-panel")).toBeVisible({ timeout: 5_000 });
  await page.waitForTimeout(1_200);

  const after = await scrollTop(page);
  expect(after, `list jumped from ${before} to ${after}`).toBeGreaterThan(before - 80);
  await page.evaluate(() => window.__sendpalmE2E?.delayQueries(0));
});
}
