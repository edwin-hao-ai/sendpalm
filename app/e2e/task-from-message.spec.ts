/** A task created out of a mail remembers the mail.
 *
 *  The AI path («提取任务») needs a configured model. This is the manual one:
 *  it must work with no model at all, prefill from the mail, and leave a link
 *  home — 「来源邮件」 in the task, and the task visible in the reading pane.
 */

import { test, expect, type Page } from "@playwright/test";
import { navigateToView } from "./navigation";
import type { Account, Contact, Message } from "../src/types";

const now = new Date().toISOString();
const SUBJECT = "请把报价单发我";

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
  id: "c-one", firstName: "Sam", lastName: "Sender", nickname: "", name: "Sam Sender",
  company: "", title: "", emails: [{ value: "sam@example.com", label: "work" }],
  phones: [], stage: "active", labels: [], topics: [], notes: "", avatar: "", photo: "",
  health: 60, sc: 0, scC: "", scL: "", lc: "", grp: "", trd: "stable", pattern: "",
  accounts: [], stageHistory: [], firstContact: now, milestones: [], merged: false,
  blocked: false, notify: false, firstSeen: false, screened: true,
  defaultBucket: "imbox", autoLabel: [], recycling: false, ch: [],
} as unknown as Contact;

const message = {
  id: "m-one", pid: "c-one", subj: SUBJECT, prev: "能今天给我吗？", body: "能今天给我吗？",
  bodyHtml: null, tm: "10:00", st: now, ac: "acct-a", bucket: "imbox",
  direction: "in", unread: true, labels: [], attachments: [], trackers: [],
  replyLater: false, setAside: false, bubbleUpAt: null, remindAt: null,
  deletedAt: null, to: "me@example.com", cc: [], bcc: [], threadId: undefined,
  calendarInvite: null,
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
  await expect(page.locator('[data-message-id="m-one"]')).toBeVisible({ timeout: 10_000 });
}

test("create a task from a mail, and find the mail from the task", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page);

  await page.locator('[data-message-id="m-one"]').first().click();
  await expect(page.locator('#detail-panel [aria-label="回复"]')).toBeVisible({ timeout: 5_000 });

  await page.getByTestId("message-more-menu").click();
  await page.getByTestId("message-new-task").click();

  // The task panel opens so a deadline can be set immediately. The title is
  // an <input>, so its value is not part of the panel's text.
  await expect(page.locator("#detail-panel input").first()).toHaveValue(SUBJECT, {
    timeout: 5_000,
  });

  // It is listed under 任务, marked as coming from a mail.
  await page.locator('#detail-panel [aria-label="返回"], #detail-panel [aria-label="返回列表"]').first().click().catch(() => {});
  await navigateToView(page, "tasks");
  const row = page.getByRole("button", { name: new RegExp(SUBJECT) });
  await expect(row).toBeVisible({ timeout: 5_000 });
  await expect(row.locator(".tasks-source-mark")).toHaveCount(1);

  // …and the task points back at the mail.
  await row.click();
  await expect(page.locator("#detail-panel input").first()).toHaveValue(SUBJECT);
  await page.locator("#detail-panel").getByRole("button", { name: "来源邮件" }).click();
  await expect(page.locator("#detail-panel")).toContainText(SUBJECT);

  // The reading pane shows the task, so "did I make one?" is answerable.
  await expect(page.locator("[data-message-tasks]")).toBeVisible({ timeout: 5_000 });
  await expect(page.locator("[data-message-task]").first()).toContainText(SUBJECT);
});
