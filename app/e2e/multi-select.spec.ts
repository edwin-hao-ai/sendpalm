/** Multi-select outside Imbox: tick a row, get the shared bulk bar. */

import { test, expect, type Page } from "@playwright/test";
import type { Account, Contact, Message } from "../src/types";

const now = new Date().toISOString();

async function seed(page: Page) {
  const account = {
    id: "acct-ms", type: "email", provider: "custom", email: "me@example.com",
    label: "me@example.com", displayName: "me", status: "connected", synced: 0,
    total: 0, privacy: "unified", color: "#0a8f63", avatar: "", lastSync: now,
    settings: { aliases: [], signature: "", replyTo: "", defaultFrom: "me@example.com",
      syncFolders: [], syncFrequency: "manual", autoBcc: false, autoBccAddress: "",
      vacationResponder: { enabled: false, subject: "", body: "" } },
  } as Account;
  const contact = {
    id: "c-ms", firstName: "Alice", lastName: "W", nickname: "", name: "Alice W",
    company: "", title: "", emails: [{ value: "alice@example.com", label: "work" }],
    phones: [], stage: "active", labels: [], topics: [], notes: "", avatar: "",
    photo: "", health: 70, sc: 0, scC: "", scL: "", lc: "", grp: "", trd: "stable",
    pattern: "", accounts: [], stageHistory: [], firstContact: now, milestones: [],
    merged: false, blocked: false, notify: false, firstSeen: false, screened: true,
    defaultBucket: "imbox", autoLabel: [], recycling: false, ch: [],
  } as Contact;
  const msg = {
    id: "m-ms", pid: "c-ms", subj: "回收站里的信", prev: "preview", body: "body",
    bodyHtml: null, tm: "10:00", st: now, ac: "acct-ms", bucket: "trash",
    direction: "in", unread: false, labels: [], attachments: [], trackers: [],
    replyLater: false, setAside: false, bubbleUpAt: null, remindAt: null,
    deletedAt: now, to: "me@example.com", cc: [], bcc: [], threadId: undefined,
    calendarInvite: null,
  } as unknown as Message;

  await page.goto("/");
  await page.locator("body.app-ready").waitFor({ timeout: 10_000 });
  await page.evaluate(async () => {
    await window.__sendpalmE2E?.resetData();
  });
  await page.addInitScript((s: string) => {
    sessionStorage.setItem("__sendpalm_e2e_seed", s);
  }, JSON.stringify({ accounts: [account], contacts: [contact], messages: [msg] }));
  await page.goto("/");
  await page.locator("body.app-ready").waitFor({ timeout: 10_000 });
}

test.describe("multi-select", () => {
  test("a ticked row in Trash raises the shared bulk bar", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await seed(page);

    await page.locator('#sidebar [data-nav-view="trash"]').click();
    const box = page.locator('[data-row-select="m-ms"]');
    await box.waitFor({ timeout: 5_000 });
    await box.check();

    const bar = page.locator("[data-bulk-bar]");
    await expect(bar).toBeVisible();
    await expect(bar).toContainText("已选 1 封");

    await bar.getByRole("button", { name: "取消选择" }).click();
    await expect(bar).toHaveCount(0);
  });
});
