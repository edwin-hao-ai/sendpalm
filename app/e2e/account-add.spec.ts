/** Adding a mailbox must not claim a connection it never attempted. */

import { test, expect } from "@playwright/test";

test.describe("add account", () => {
  test("says it could not verify in browser preview instead of claiming success", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.locator("body.app-ready").waitFor({ timeout: 10_000 });

    await page.locator('#sidebar [data-nav-group="more"]').click();
    await page.locator('#sidebar [data-nav-view="settings"]').click();
    await expect(page.locator(".page-header-title")).toHaveText("设置");
    await page.getByRole("button", { name: "账户", exact: true }).first().click();

    await page.getByRole("button", { name: /添加账户/ }).first().click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByPlaceholder("you@example.com").fill("me@example.com");
    await dialog
      .getByPlaceholder(/专用密码|授权码/)
      .fill("app-password-123");
    await dialog.getByRole("button", { name: "添加并连接" }).click();

    // Browser preview has no keychain and no IMAP: the copy must say so.
    await expect(page.getByText(/浏览器预览模式，未验证连接/)).toBeVisible({
      timeout: 5_000,
    });
  });
});
