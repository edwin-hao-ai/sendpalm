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

test.describe("data robustness", () => {
  test("a calendar event with no colour does not take the view down", async ({
    page,
  }) => {
    // Regression: `textColorForBg(undefined)` → `hex.replace(...)` threw, and
    // one such row turned the whole Calendar into the error boundary. The
    // seed deliberately omits `color`.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.locator("body.app-ready").waitFor({ timeout: 10_000 });
    await page.evaluate(async () => {
      await window.__sendpalmE2E?.resetData();
    });
    const today = new Date();
    const payload = JSON.stringify({
      accounts: [],
      contacts: [],
      messages: [],
      events: [
        {
          id: "evt-nocolor",
          title: "没有颜色的日程",
          dt: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`,
          tm: "14:00",
          dur: 60,
          people: [],
          cal: "work",
          detail: "",
        },
      ],
    });
    await page.addInitScript((s: string) => {
      sessionStorage.setItem("__sendpalm_e2e_seed", s);
    }, payload);
    await page.goto("/");
    await page.locator("body.app-ready").waitFor({ timeout: 10_000 });

    await page.locator('#sidebar [data-nav-group="calendar"]').click();
    await expect(page.locator(".page-header-title")).toHaveText("日历", {
      timeout: 10_000,
    });
    await expect(page.locator("[data-error-boundary]")).toHaveCount(0);
  });
});
