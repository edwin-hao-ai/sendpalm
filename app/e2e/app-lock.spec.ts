/** App lock E2E — driven entirely through the real UI.
 *
 *  Deliberately no `page.evaluate(import(...))` store pokes: in dev the module
 *  graph can hand `import()` a different instance than the one the app
 *  mounted, which made store-driven setup silently do nothing. Everything
 *  here clicks what a user would click.
 */

import { test, expect, type Page } from "@playwright/test";

const PIN = "2468";

async function boot(page: Page) {
  await page.goto("/");
  await page.locator("body.app-ready").waitFor({ timeout: 10_000 });
}

async function openSecuritySettings(page: Page) {
  await page.getByRole("button", { name: "账户与设置" }).click();
  await page.locator('[role="menu"]').getByRole("button", { name: "设置" }).click();
  await page.getByRole("button", { name: "偏好" }).first().click();
  await expect(page.locator("[data-app-lock-enable]")).toBeVisible({
    timeout: 5_000,
  });
}

/** Enables the lock through Settings and returns the recovery code from the
 *  toast it shows (that toast is the only place the code ever exists). */
async function enableLockViaUi(page: Page, pin: string): Promise<string> {
  await openSecuritySettings(page);
  await page.locator("[data-app-lock-enable]").click();
  await page.locator("[data-pin-new]").fill(pin);
  await page.locator("[data-pin-confirm]").fill(pin);
  await page.locator("[data-pin-submit]").click();

  const toast = page.getByText(/恢复码：[A-Z0-9]{4}-[A-Z0-9]{4}/);
  await expect(toast).toBeVisible({ timeout: 5_000 });
  const text = (await toast.textContent()) ?? "";
  const match = text.match(/([A-Z0-9]{4}-[A-Z0-9]{4})/);
  if (!match) throw new Error(`no recovery code in toast: ${text}`);
  return match[1]!;
}

test.describe("App lock", () => {
  test("enabling from Settings, then the PIN opens it", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await boot(page);
    await enableLockViaUi(page, PIN);

    // The section now offers the locked-state actions.
    await page.locator("[data-app-lock-now]").click();
    const lock = page.locator("[data-lock-screen]");
    await expect(lock).toBeVisible();
    await expect(lock.getByRole("heading", { name: "已锁定" })).toBeVisible();

    await lock.locator("[data-lock-pin]").fill("0000");
    await lock.locator("[data-lock-submit]").click();
    await expect(lock.getByRole("alert")).toHaveText("PIN 不正确");
    await expect(lock).toBeVisible();

    await lock.locator("[data-lock-pin]").fill(PIN);
    await lock.locator("[data-lock-submit]").click();
    await expect(lock).toHaveCount(0);
  });

  test("a wrong recovery code does not unlock, the right one does", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await boot(page);
    const code = await enableLockViaUi(page, "1357");

    await page.locator("[data-app-lock-now]").click();
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
