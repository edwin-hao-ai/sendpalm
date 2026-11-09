/** Density and accent colour are CSS-only overrides on <html>. */

import { test, expect } from "@playwright/test";

async function openPreferences(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.locator("body.app-ready").waitFor({ timeout: 10_000 });
  await page.locator('#sidebar [data-nav-group="more"]').click();
  await page.locator('#sidebar [data-nav-view="settings"]').click();
  await page.getByRole("button", { name: "偏好", exact: true }).first().click();
}

test.describe("appearance", () => {
  test("density switches the html attribute", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openPreferences(page);

    await page.locator('[data-density-choice="compact"]').click();
    await expect(page.locator("html")).toHaveAttribute("data-density", "compact");

    await page.locator('[data-density-choice="standard"]').click();
    await expect(page.locator("html")).not.toHaveAttribute("data-density", /.*/);
  });

  test("accent colour re-points the brand token", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openPreferences(page);

    await page.getByRole("button", { name: "强调色：海蓝" }).click();
    const accent = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--palm").trim(),
    );
    expect(accent).toBe("#2f6feb");
  });
});
