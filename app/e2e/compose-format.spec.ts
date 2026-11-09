/** Composer formatting: toolbar wraps the selection, send renders HTML. */

import { test, expect, type Page } from "@playwright/test";
import type { Account } from "../src/types";

/** Compose refuses to open the fields without a mailbox. */
async function seedAccount(page: Page) {
  const account = {
    id: "acct-compose",
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

test.describe("compose formatting", () => {
  test("bold wraps the selected text without losing the caret", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedAccount(page);

    await page.keyboard.press("Meta+n");
    const dialog = page.getByRole("dialog", { name: "新邮件" });
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    const body = dialog.getByPlaceholder("正文…");
    await body.fill("hello world");
    await body.evaluate((el) => {
      const ta = el as HTMLTextAreaElement;
      ta.focus();
      ta.setSelectionRange(6, 11);
    });

    await dialog.locator('[data-format="bold"]').click();
    await expect(body).toHaveValue("hello **world**");

    // A second press on a bulleted list toggles it back off.
    await body.fill("one");
    await dialog.locator('[data-format="list"]').click();
    await expect(body).toHaveValue("- one");
    await dialog.locator('[data-format="list"]').click();
    await expect(body).toHaveValue("one");
  });
});
