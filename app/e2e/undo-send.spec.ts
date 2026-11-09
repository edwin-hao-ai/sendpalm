/** Undo send: the message is held for a few seconds and can be taken back. */

import { test, expect, type Page } from "@playwright/test";
import type { Account } from "../src/types";

async function seedAccount(page: Page) {
  const account = {
    id: "acct-undo",
    type: "email",
    provider: "custom",
    email: "me@example.com",
    label: "me@example.com",
    displayName: "me",
    status: "connected",
    synced: 0,
    total: 0,
    privacy: "unified",
    color: "#0a8f63",
    avatar: "",
    lastSync: new Date().toISOString(),
    settings: {
      aliases: [],
      signature: "",
      replyTo: "",
      defaultFrom: "me@example.com",
      syncFolders: [],
      syncFrequency: "manual",
      autoBcc: false,
      autoBccAddress: "",
      vacationResponder: { enabled: false, subject: "", body: "" },
    },
  } as Account;
  await page.goto("/");
  await page.locator("body.app-ready").waitFor({ timeout: 10_000 });
  await page.evaluate(async () => {
    await window.__sendpalmE2E?.resetData();
  });
  await page.addInitScript((s: string) => {
    sessionStorage.setItem("__sendpalm_e2e_seed", s);
  }, JSON.stringify({ accounts: [account], contacts: [], messages: [] }));
  await page.goto("/");
  await page.locator("body.app-ready").waitFor({ timeout: 10_000 });
}

test.describe("undo send", () => {
  test("撤销 reopens the composer with the message intact", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedAccount(page);
    await page.keyboard.press("Meta+n");

    const dialog = page.getByRole("dialog", { name: "新邮件" });
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await dialog.getByPlaceholder("recipient@example.com").fill("alice@example.com");
    await dialog.getByPlaceholder("主题").fill("撤销测试");
    await dialog.getByPlaceholder("正文…").fill("这封应该被撤销");

    await dialog.getByRole("button", { name: "发送", exact: true }).click();

    // The composer closes and the toast offers the undo.
    await expect(dialog).toHaveCount(0);
    const toast = page.getByText(/已发送给 alice@example\.com/);
    await expect(toast).toBeVisible({ timeout: 5_000 });
    await page.getByRole("button", { name: "撤销" }).click();

    await expect(page.getByText(/已撤销发送给/)).toBeVisible();
    const reopened = page.getByRole("dialog", { name: "新邮件" });
    await expect(reopened).toBeVisible({ timeout: 5_000 });
    await expect(reopened.getByPlaceholder("正文…")).toHaveValue("这封应该被撤销");
  });

  test("without undo the send goes out after the window", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedAccount(page);
    await page.keyboard.press("Meta+n");

    const dialog = page.getByRole("dialog", { name: "新邮件" });
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await dialog.getByPlaceholder("recipient@example.com").fill("bob@example.com");
    await dialog.getByPlaceholder("正文…").fill("这封会真的发出去");
    await dialog.getByRole("button", { name: "发送", exact: true }).click();

    // Browser preview has no SMTP: the deferred attempt reports that the
    // draft was kept rather than silently doing nothing.
    await expect(page.getByText(/发送没有完成，草稿已保留/)).toBeVisible({
      timeout: 10_000,
    });
  });
});
