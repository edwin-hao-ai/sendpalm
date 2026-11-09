/** Screener: "以后这个发件人的邮件都这样处理" writes a mail rule. */

import { test, expect, type Page } from "@playwright/test";
import type { Account, Contact, Message } from "../src/types";

const now = new Date().toISOString();

async function seedUnscreened(page: Page) {
  const account = {
    id: "acct-gate", type: "email", provider: "custom", email: "me@example.com",
    label: "me@example.com", displayName: "me", status: "connected", synced: 0,
    total: 0, privacy: "unified", color: "#0a8f63", avatar: "", lastSync: now,
    settings: { aliases: [], signature: "", replyTo: "", defaultFrom: "me@example.com",
      syncFolders: [], syncFrequency: "manual", autoBcc: false, autoBccAddress: "",
      vacationResponder: { enabled: false, subject: "", body: "" } },
  } as Account;
  const contact = {
    id: "c-gate", firstName: "Stranger", lastName: "Sender", nickname: "",
    name: "Stranger Sender", company: "", title: "",
    emails: [{ value: "stranger@example.com", label: "work" }],
    phones: [], stage: "explore", labels: [], topics: [], notes: "", avatar: "",
    photo: "", health: 50, sc: 0, scC: "", scL: "", lc: "", grp: "", trd: "stable",
    pattern: "", accounts: [], stageHistory: [], firstContact: now, milestones: [],
    merged: false, blocked: false, notify: false,
    firstSeen: true, screened: false, defaultBucket: "imbox",
    autoLabel: [], recycling: false, ch: [],
  } as Contact;
  const msg = {
    id: "m-gate", pid: "c-gate", subj: "第一次给你写信", prev: "你好", body: "你好",
    bodyHtml: null, tm: "10:00", st: now, ac: "acct-gate", bucket: "imbox",
    direction: "in", unread: true, labels: [], attachments: [], trackers: [],
    replyLater: false, setAside: false, bubbleUpAt: null, remindAt: null,
    deletedAt: null, to: "me@example.com", cc: [], bcc: [], threadId: undefined,
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

test.describe("screener rules", () => {
  test("approving with the checkbox writes a sender rule", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedUnscreened(page);

    await page.locator('#sidebar [data-nav-view="screener"]').click();
    const remember = page.locator('[data-gate-remember] input[type="checkbox"]');
    await expect(remember).toBeVisible({ timeout: 5_000 });
    await remember.check();

    await page.getByTestId("gate-approve-imbox").click();
    await expect(
      page.getByText(/以后 Stranger Sender 的邮件直接进/),
    ).toBeVisible({ timeout: 5_000 });
  });
});
