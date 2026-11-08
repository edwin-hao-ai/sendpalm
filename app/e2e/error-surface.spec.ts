/** A runtime error must not black out the app.
 *
 *  `index.html` used to render ANY window error as a full-screen
 *  `z-index:99999` black panel. That is the 黑屏 users hit: one bad
 *  component, and the whole window is gone. Once the shell is ready the app
 *  now shows a dismissible bar instead, and the UI keeps working.
 */

import { test, expect } from "@playwright/test";

test.describe("runtime error surface", () => {
  test("an error after boot shows a dismissible bar, not a black overlay", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.locator("body.app-ready").waitFor({ timeout: 10_000 });

    await page.evaluate(() => {
      window.dispatchEvent(
        new ErrorEvent("error", { message: "boom from the e2e test" }),
      );
    });

    const bar = page.locator("#sendpalm-runtime-errors");
    await expect(bar).toBeVisible();
    await expect(bar).toContainText("运行中遇到问题");
    // The old full-screen diagnostic panel must NOT be up.
    await expect(page.locator("#sendpalm-boot-errors")).toHaveCount(0);

    // The app must still be usable while the bar is showing.
    await page.locator('#sidebar [data-nav-view="feed"]').click();
    await expect(page.locator(".page-header-title")).toHaveText("报刊", {
      timeout: 10_000,
    });

    await bar.getByRole("button", { name: "关闭" }).click();
    await expect(bar).toHaveCount(0);
  });

  test("benign ResizeObserver warnings never surface at all", async ({
    page,
  }) => {
    await page.goto("/");
    await page.locator("body.app-ready").waitFor({ timeout: 10_000 });

    await page.evaluate(() => {
      window.dispatchEvent(
        new ErrorEvent("error", {
          message:
            "ResizeObserver loop completed with undelivered notifications.",
        }),
      );
    });

    await expect(page.locator("#sendpalm-runtime-errors")).toHaveCount(0);
    await expect(page.locator("#sendpalm-boot-errors")).toHaveCount(0);
  });
});
