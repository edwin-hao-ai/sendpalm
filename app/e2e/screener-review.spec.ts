/** Settings → 账户 → 筛选台: see and re-open the senders auto-approved on import. */

import { test, expect, type Page } from "@playwright/test";
import type { Contact } from "../src/types";

async function seedAutoApproved(page: Page) {
  const contact = (id: string, name: string) =>
    ({
      id,
      firstName: name,
      lastName: "",
      nickname: "",
      name,
      company: "",
      title: "",
      emails: [{ value: `${id}@example.com`, label: "work" }],
      phones: [],
      stage: "explore",
      labels: [],
      topics: [],
      notes: "",
      avatar: "",
      photo: "",
      health: 0,
      sc: 0,
      scC: "",
      scL: "",
      lc: "",
      grp: "",
      trd: "stable",
      pattern: "",
      accounts: [],
      stageHistory: [],
      firstContact: new Date().toISOString(),
      milestones: [],
      merged: false,
      blocked: false,
      notify: false,
      firstSeen: false,
      screened: true,
      defaultBucket: "imbox",
      autoLabel: [],
      recycling: false,
      ch: [],
    }) as Contact;

  await page.goto("/");
  await page.locator("body.app-ready").waitFor({ timeout: 10_000 });
  await page.evaluate(async () => {
    await window.__sendpalmE2E?.resetData();
  });
  await page.addInitScript((s: string) => {
    sessionStorage.setItem("__sendpalm_e2e_seed", s);
  }, JSON.stringify({
    accounts: [],
    contacts: [contact("auto-1", "Auto One"), contact("auto-2", "Auto Two")],
    messages: [],
  }));
  await page.goto("/");
  await page.locator("body.app-ready").waitFor({ timeout: 10_000 });
}

test.describe("screener import review", () => {
  test("shows the auto-approved count and can send them back to the screener", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedAutoApproved(page);

    await page.locator('#sidebar [data-nav-group="more"]').click();
    await page.locator('#sidebar [data-nav-view="settings"]').click();
    await page.getByRole("button", { name: "账户", exact: true }).first().click();

    const panel = page.locator("[data-screener-review]");
    await expect(panel).toBeVisible({ timeout: 5_000 });
    await expect(panel).toContainText("2 位发件人在导入时被自动放进收件箱");

    await page.locator("[data-screener-reopen]").click();
    await expect(page.getByText(/已把 2 位发件人送回筛选台/)).toBeVisible();
    await expect(panel).toContainText("没有。");
  });
});
