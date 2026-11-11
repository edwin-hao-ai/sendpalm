/** 返回 goes back one step, not all the way out.
 *
 *  Opening a mail from a contact's history replaced the contact in the panel,
 *  so 返回 closed everything and dropped the reader on the contacts list — the
 *  contact they were reading was gone. The panel keeps a small stack now, and
 *  the same applies to a task's 「来源邮件」.
 */

import { test, expect, type Page } from "@playwright/test";
import { navigateToView } from "./navigation";
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
  name: "Quentin Sender", company: "Acme", title: "Buyer",
  emails: [{ value: "quentin@example.com", label: "work" }], phones: [],
  stage: "active", labels: [], topics: [], notes: "", avatar: "", photo: "",
  health: 60, sc: 0, scC: "", scL: "", lc: "", grp: "", trd: "stable", pattern: "",
  accounts: [], stageHistory: [], firstContact: now, milestones: [], merged: false,
  blocked: false, notify: false, firstSeen: false, screened: true,
  defaultBucket: "imbox", autoLabel: [], recycling: false, ch: [],
} as unknown as Contact;
const message = {
  id: "m-one", pid: "c-one", subj: "quote for the spring order",
  prev: "attached", body: "attached", bodyHtml: null, tm: "10:00", st: now,
  ac: "acct-a", bucket: "imbox", direction: "in", unread: false, labels: [],
  attachments: [], trackers: [], replyLater: false, setAside: false,
  bubbleUpAt: null, remindAt: null, deletedAt: null, to: "me@example.com",
  cc: [], bcc: [], threadId: undefined, calendarInvite: null,
} as unknown as Message;

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

test("返回 from a contact's mail lands back on the contact", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page);

  await navigateToView(page, "contacts");
  await page.locator('[data-contact-id="c-one"]').first().click();

  const panel = page.locator("#detail-panel");
  await expect(panel).toContainText("Quentin Sender", { timeout: 5_000 });

  // Open one of that contact's mails from the timeline.
  await panel.getByText("quote for the spring order").first().click();
  await expect(panel.locator('[aria-label="返回列表"]')).toBeVisible({ timeout: 5_000 });

  await panel.locator('[aria-label="返回列表"]').click();

  // Back on the contact — not on the contacts list.
  await expect(panel).toContainText("Quentin Sender", { timeout: 5_000 });
  await expect(panel).toContainText("Buyer");
});
