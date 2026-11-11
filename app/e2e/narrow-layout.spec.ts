/** A side panel may not squeeze the list into a column of single characters.
 *
 *  `--detail-panel-width` is user-draggable up to 720px. On a ~1030px window
 *  (sidebar + 720) the main column was left ~130px wide, and the Gate header —
 *  a 720px reading column — wrapped to one glyph per line. The panel now yields
 *  width so the list always keeps a floor.
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
  id: "c-one", firstName: "Stranger", lastName: "Sender", nickname: "",
  name: "Stranger Sender", company: "", title: "",
  emails: [{ value: "stranger@example.com", label: "work" }], phones: [],
  stage: "explore", labels: [], topics: [], notes: "", avatar: "", photo: "",
  health: 50, sc: 0, scC: "", scL: "", lc: "", grp: "", trd: "stable", pattern: "",
  accounts: [], stageHistory: [], firstContact: now, milestones: [], merged: false,
  blocked: false, notify: false, firstSeen: true, screened: false,
  defaultBucket: "imbox", autoLabel: [], recycling: false, ch: [],
} as unknown as Contact;
const message = {
  id: "m-one", pid: "c-one", subj: "first contact", prev: "hi", body: "hi",
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
    // The widest the user can drag the panel to.
    localStorage.setItem(
      "sendpalm.panelWidths",
      JSON.stringify({ detail: 720, agent: 720 }),
    );
  });
  await page.addInitScript((s: string) => {
    sessionStorage.setItem("__sendpalm_e2e_seed", s);
    localStorage.setItem(
      "sendpalm.panelWidths",
      JSON.stringify({ detail: 720, agent: 720 }),
    );
  }, JSON.stringify({ accounts: [account], contacts: [contact], messages: [message] }));
  await page.goto("/");
  await page.locator("body.app-ready").waitFor({ timeout: 10_000 });
  await page.evaluate(() => window.__sendpalmE2E?.__seedReady);
}

test("a 720px panel on a 1030px window still leaves a readable list", async ({ page }) => {
  await page.setViewportSize({ width: 1030, height: 900 });
  await seed(page);

  await navigateToView(page, "screener");
  await expect(page.locator(".page-header-title")).toHaveText("筛选台");

  // Open the reading pane so the reserve kicks in.
  await page.locator("[data-nav-view=\"imbox\"]").first().click();
  await page.locator('[data-message-id="m-one"]').first().click();
  await expect(page.locator("#detail-panel")).toBeVisible({ timeout: 5_000 });
  await page.locator("[data-nav-view=\"screener\"]").first().click();

  const main = await page.evaluate(() => {
    const el = document.querySelector("#main") as HTMLElement;
    const reserve = getComputedStyle(el).marginRight;
    const title = document.querySelector(".page-header-title") as HTMLElement | null;
    return {
      width: el.getBoundingClientRect().width,
      reserve,
      titleW: title?.getBoundingClientRect().width ?? null,
      titleFont: title ? getComputedStyle(title).fontSize : null,
    };
  });
  expect(main.width, "the list column keeps a floor").toBeGreaterThan(300);

  // One glyph per line is the failure mode: a tall, narrow title.
  const title = page.locator(".page-header-title").first();
  const box = await title.boundingBox();
  expect(box!.height, "the title is not a vertical column of glyphs").toBeLessThan(90);
});
