import { test, expect, type Page } from "@playwright/test";
import type { Account, Contact, Message } from "../src/types";

const now = Date.now();
const iso = (m: number) => new Date(now - m * 60_000).toISOString();
const ACC = { id: "a1", type: "email", provider: "custom", email: "me@x.com", label: "me", displayName: "me",
  status: "connected", synced: 0, total: 0, privacy: "unified", color: "#0a8f63", avatar: "", lastSync: iso(0),
  settings: { aliases: [], signature: "", replyTo: "", defaultFrom: "me@x.com", syncFolders: [],
    syncFrequency: "manual", autoBcc: false, autoBccAddress: "", vacationResponder: { enabled: false, subject: "", body: "" } } } as Account;
const contact = (i: number) => ({ id: `c${i}`, firstName: `S${i}`, lastName: "", nickname: "", name: `Sender ${i}`,
  company: "", title: "", emails: [{ value: `s${i}@x.com`, label: "work" }], phones: [], stage: "active",
  labels: [], topics: [], notes: "", avatar: "", photo: "", health: 60, sc: 0, scC: "", scL: "", lc: "",
  grp: "", trd: "stable", pattern: "", accounts: [], stageHistory: [], firstContact: iso(0), milestones: [],
  merged: false, blocked: false, notify: false, firstSeen: false, screened: true, defaultBucket: "imbox",
  autoLabel: [], recycling: false, ch: [] }) as unknown as Contact;
const msg = (id: string, pid: string, m: number) => ({ id, pid, subj: `Subject ${id}`, prev: `p ${id}`,
  body: `b ${id}`, bodyHtml: `<p>body ${id}</p>`, tm: "10:00", st: iso(m), ac: "a1", bucket: "imbox",
  direction: "in", unread: true, labels: [], attachments: [], trackers: [], replyLater: false,
  setAside: false, bubbleUpAt: null, remindAt: null, deletedAt: null, to: "me@x.com", cc: [], bcc: [],
  threadId: undefined, calendarInvite: null }) as unknown as Message;

const top = (p: Page) => p.evaluate(() => ({
  top: (document.querySelector("#main") as HTMLElement).scrollTop,
  max: (document.querySelector("#main") as HTMLElement).scrollHeight - (document.querySelector("#main") as HTMLElement).clientHeight,
}));

/** Reading from an expanded bundle must not move the list.
 *
 *  Every click marks a mail read. Before the 11/12 merge that moved the row to
 *  the other tab, so the browser clamped `scrollTop` (content above shrank) and
 *  WebKit might scroll to keep the removed *focused* row in view — the reported
 *  symptom was the list landing at the bottom after a few clicks. Rows no longer
 *  move at all, and this pins the invariant that they don't start again. */
test("clicking messages in an expanded bundle keeps the list still", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.locator("body.app-ready").waitFor({ timeout: 10_000 });
  await page.evaluate(async () => { await window.__sendpalmE2E?.resetData(); });

  const contacts = [contact(0)];
  const messages: Message[] = [];
  // A bundle the size of a real one (the App Store Connect group had 191).
  for (let i = 0; i < 60; i++) messages.push(msg(`b${i}`, "c0", 900 + i * 7));
  for (let i = 1; i <= 30; i++) { contacts.push(contact(i)); messages.push(msg(`m${i}`, `c${i}`, i * 3)); }

  await page.addInitScript((s: string) => sessionStorage.setItem("__sendpalm_e2e_seed", s),
    JSON.stringify({ accounts: [ACC], contacts, messages }));
  await page.goto("/");
  await page.locator("body.app-ready").waitFor({ timeout: 10_000 });
  await page.evaluate(() => window.__sendpalmE2E?.__seedReady);
  await page.waitForTimeout(700);

  // Scroll so the bundle is visible in the middle of the list.
  await page.evaluate(() => {
    const el = document.querySelector("#main") as HTMLElement;
    el.scrollTop = el.scrollHeight * 0.30;
  });
  await page.waitForTimeout(400);
  const start = (await top(page)).top;

  const chevron = page.locator('[data-bundle-id="c0"] [data-bundle-chevron]').first();
  // A real mouse click at the element's own position, not `.click()`: Playwright
  // scrolls the target into view first, which is the movement being measured.
  const chevBox = await chevron.boundingBox();
  if (chevBox) {
    await page.mouse.click(chevBox.x + chevBox.width / 2, chevBox.y + chevBox.height / 2);
  }
  await page.waitForTimeout(300);
  expect(
    Math.abs((await top(page)).top - start),
    "expanding the bundle must not move the list",
  ).toBeLessThan(4);

  for (const round of [0, 1, 2, 3]) {
    const rows = page.locator('[data-bundle-row]');
    const n = await rows.count();
    if (n === 0) break;
    const b = await rows.nth(0).boundingBox();
    if (b) await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
    await page.waitForTimeout(900);
    const afterOpen = (await top(page)).top;
    expect(
      Math.abs(afterOpen - start),
      `list moved ${start} → ${afterOpen} on click ${round + 1}`,
    ).toBeLessThan(80);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
  }
});
