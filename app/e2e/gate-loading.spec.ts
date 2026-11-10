/** The screener must never render an empty page while it loads.
 *
 *  On a real mailbox (4,500 messages, 328 unscreened senders) the queue query
 *  used to pull every message from every unscreened sender — 3,810 rows /
 *  6.9 MB — and the view sat blank for 5-10 s: no skeleton, no header, nothing
 *  to click. Two separate causes are guarded here:
 *
 *  1. the payload (`listGateQueue`, see data.test.ts for the query shape),
 *  2. the loading state — a resource read from the component body registers
 *     with the shared Suspense boundary in `ViewSwitch`, so the screener was
 *     replaced by the *Imbox* skeleton, or by nothing at all.
 */

import { test, expect, type Page } from "@playwright/test";
import type { Account, Contact, Message } from "../src/types";

const now = new Date().toISOString();

async function seed(page: Page) {
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
  const contact = (id: string) => ({
    id, firstName: id, lastName: "", nickname: "", name: id, company: "", title: "",
    emails: [{ value: `${id}@example.com`, label: "work" }], phones: [],
    stage: "explore", labels: [], topics: [], notes: "", avatar: "", photo: "",
    health: 50, sc: 0, scC: "", scL: "", lc: "", grp: "", trd: "stable", pattern: "",
    accounts: [], stageHistory: [], firstContact: now, milestones: [], merged: false,
    blocked: false, notify: false, firstSeen: true, screened: false,
    defaultBucket: "imbox", autoLabel: [], recycling: false, ch: [],
  }) as unknown as Contact;
  const message = (id: string, pid: string) => ({
    id, pid, subj: `${pid} 第一次给你写信`, prev: "你好", body: "你好",
    bodyHtml: null, tm: "10:00", st: now, ac: "acct-a", bucket: "imbox",
    direction: "in", unread: true, labels: [], attachments: [], trackers: [],
    replyLater: false, setAside: false, bubbleUpAt: null, remindAt: null,
    deletedAt: null, to: "me@example.com", cc: [], bcc: [], threadId: undefined,
    calendarInvite: null,
  }) as unknown as Message;

  await page.goto("/");
  await page.locator("body.app-ready").waitFor({ timeout: 10_000 });
  await page.evaluate(async () => {
    await window.__sendpalmE2E?.resetData();
  });
  await page.addInitScript((s: string) => {
    sessionStorage.setItem("__sendpalm_e2e_seed", s);
  }, JSON.stringify({
    accounts: [account],
    contacts: [contact("c-one"), contact("c-two")],
    messages: [message("m-one", "c-one"), message("m-two", "c-two")],
  }));
  await page.goto("/");
  await page.locator("body.app-ready").waitFor({ timeout: 10_000 });
}

test("the screener paints its own header and skeleton while loading", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page);

  // Slow the store down to a real-mailbox speed. An in-memory double resolves
  // in a microtask, which hides exactly the state this test is about.
  await page.evaluate(() => window.__sendpalmE2E?.delayQueries(1200));

  await page.locator('#sidebar [data-nav-view="screener"]').click();

  // Own skeleton, not the previous view's rows.
  await expect(page.locator("[data-gate-skeleton]")).toBeVisible({ timeout: 3_000 });
  await expect(page.locator("[data-skeleton-row]")).toHaveCount(0);

  // The header is part of the view, not of the loaded data: it paints too.
  await expect(page.locator(".page-header-title")).toHaveText("筛选台");
  await expect(page.locator(".page-header")).toContainText("正在读取");

  // …and it gives way to the real card.
  await expect(page.getByTestId("gate-approve-imbox")).toBeVisible({ timeout: 10_000 });
  await expect(page.locator("[data-gate-skeleton]")).toHaveCount(0);
  await page.evaluate(() => window.__sendpalmE2E?.delayQueries(0));
});
