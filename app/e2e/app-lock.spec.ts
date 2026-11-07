/** App lock E2E — the lock actually covers the app and the PIN opens it. */

import { test, expect, type Page } from "@playwright/test";

async function boot(page: Page) {
  await page.goto("/");
  await page.locator("body.app-ready").waitFor({ timeout: 10_000 });
}

async function enableAndLock(page: Page, pin: string) {
  await page.evaluate(async (p) => {
    const mod = await import("/src/services/app-lock.ts");
    mod.enableLock(p);
    mod.lockNow();
  }, pin);
}

test.describe("App lock", () => {
  test("covers the shell and unlocks with the right PIN", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await boot(page);
    await enableAndLock(page, "2468");

    const lock = page.locator("[data-lock-screen]");
    await expect(lock).toBeVisible();
    // The shell is behind it, not interactive.
    await expect(lock.getByRole("heading", { name: "已锁定" })).toBeVisible();

    await lock.locator("[data-lock-pin]").fill("0000");
    await lock.locator("[data-lock-submit]").click();
    await expect(lock.getByRole("alert")).toHaveText("PIN 不正确");
    await expect(lock).toBeVisible();

    await lock.locator("[data-lock-pin]").fill("2468");
    await lock.locator("[data-lock-submit]").click();
    await expect(lock).toHaveCount(0);
  });

  test("a wrong recovery code does not unlock, the right one does", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await boot(page);
    const code = await page.evaluate(async () => {
      const mod = await import("/src/services/app-lock.ts");
      const { recoveryCode } = mod.enableLock("1357");
      mod.lockNow();
      return recoveryCode;
    });

    const lock = page.locator("[data-lock-screen]");
    await expect(lock).toBeVisible();

    await lock.locator("[data-lock-use-recovery]").click();
    await lock.locator("[data-lock-recovery]").fill("ZZZZ-ZZZZ");
    await lock.locator("[data-lock-new-pin]").fill("8642");
    await lock.locator("[data-lock-recovery-submit]").click();
    await expect(lock.getByRole("alert")).toHaveText("恢复码不正确");
    await expect(lock).toBeVisible();

    await lock.locator("[data-lock-recovery]").fill(code);
    await lock.locator("[data-lock-new-pin]").fill("8642");
    await lock.locator("[data-lock-recovery-submit]").click();
    await expect(lock).toHaveCount(0);
  });

  test("no lock screen when the lock is off", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await boot(page);
    await expect(page.locator("[data-lock-screen]")).toHaveCount(0);
  });
});
