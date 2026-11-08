/** Cold start — a user with no mailbox must be told what to do.
 *
 *  The Imbox empty state used to read "新邮件到了会自动出现在这里" with no
 *  button: nothing was ever going to arrive, and there was no visible way to
 *  connect an account. That is the first screen a new user sees.
 */

import { test, expect } from "@playwright/test";

test.describe("first run", () => {
  test("an empty inbox points at connecting a mailbox", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.locator("body.app-ready").waitFor({ timeout: 10_000 });

    await expect(page.getByText("还没有连接邮箱")).toBeVisible();
    const cta = page.locator("[data-empty-add-account]");
    await expect(cta).toBeVisible();

    await cta.click();
    // Lands on Settings → 账户, where the provider list lives.
    await expect(page.locator(".page-header-title")).toHaveText("设置");
    await expect(
      page.getByRole("heading", { name: "邮箱账户" }),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("the topbar offers the same route when there is no account", async ({
    page,
  }) => {
    await page.goto("/");
    await page.locator("body.app-ready").waitFor({ timeout: 10_000 });
    await page.getByRole("button", { name: "邮箱同步状态" }).click();
    await expect(page.locator(".page-header-title")).toHaveText("设置");
  });
});
