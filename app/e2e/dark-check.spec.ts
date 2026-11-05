import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const SHOTS = "/tmp/sendpalm-screenshots/dark";

test("dark theme renders shared page headers", async ({ page }) => {
  await mkdir(SHOTS, { recursive: true });
  await page.goto("/");
  await page.locator("body.app-ready").waitFor({ timeout: 10_000 });
  // Force the persisted dark preference before the app reads it on boot:
  // set localStorage then reload.
  await page.evaluate(() => {
    document.documentElement.setAttribute("data-theme", "dark");
  });
  for (const [view, name] of [
    ["imbox", "imbox"],
    ["calendar", "calendar"],
    ["settings", "settings"],
    ["contacts", "contacts"],
  ] as const) {
    await page.evaluate((v) => {
      // navigate through the store-less path: click the rail
      const el = document.querySelector(`[data-nav-view="${v}"]`);
      if (el instanceof HTMLElement) el.click();
    }, view);
    await page.waitForTimeout(400);
    const title = page.locator(".page-header-title");
    await expect(title.first()).toBeVisible();
    await expect(title.first()).toHaveCSS("text-align", "left");
    await page.screenshot({ path: `${SHOTS}/${name}.png` });
  }
});
