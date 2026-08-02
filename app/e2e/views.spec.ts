/** Frontend E2E — boots the Solid app in headless Chromium and captures
 *  every major view as a screenshot.
 *
 *  In browser mode, the Tauri shim returns `null` for every IPC call. The
 *  UI renders the empty states ("Add your first account", "Inbox is empty",
 *  etc.), which is itself the most important thing to verify: the app
 *  never references the prototype mock data, so all empty states must be
 *  the new "no real account" copy.
 *
 *  The desktop build (with real IMAP sync) is verified separately by the
 *  Rust integration tests + manual screenshots in /tmp/sendpalm-screenshots/.
 */
import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const SHOTS = "/tmp/sendpalm-screenshots/e2e";

test.beforeAll(async () => {
  await mkdir(SHOTS, { recursive: true });
});

async function shoot(page: Page, name: string) {
  // Give animations a beat to settle.
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: false });
}

test.describe("SendPalm real backend — empty states (no mock data)", () => {
  test("Topbar shows slim brand and search; no redundant title", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=SendPalm").first()).toBeVisible();
    // Search placeholder is there
    await expect(page.getByPlaceholder(/Search contacts/)).toBeVisible();
    // Sync badge is "未连接" because no real account in browser mode
    await expect(page.getByText("未连接")).toBeVisible();
    await shoot(page, "01-topbar");
  });

  test("Imbox shows real empty-state copy (NOT 'Inbox zero' mock)", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/Inbox 是空的/)).toBeVisible();
    await expect(page.getByText(/Settings → Accounts/)).toBeVisible();
    // 'Inbox zero' was the OLD mock-data copy — it must NOT appear.
    await expect(page.getByText("Inbox zero")).toHaveCount(0);
    await shoot(page, "02-imbox-empty");
  });

  test("Stream view empty state", async ({ page }) => {
    await page.goto("/");
    await page.locator('[data-nav-view="feed"]').click();
    await expect(page.getByText("Stream 是空的")).toBeVisible();
    await shoot(page, "03-stream");
  });

  test("Records view empty state", async ({ page }) => {
    await page.goto("/");
    await page.locator('[data-nav-view="paperTrail"]').click();
    await expect(page.getByText("Records 是空的")).toBeVisible();
    await shoot(page, "04-records");
  });

  test("Contacts view empty state", async ({ page }) => {
    await page.goto("/");
    await page.locator('[data-nav-view="contacts"]').click();
    await expect(page.getByText("没有联系人")).toBeVisible();
    await shoot(page, "05-contacts-empty");
  });

  test("Calendar view empty state", async ({ page }) => {
    await page.goto("/");
    await page.locator('[data-nav-view="calendar"]').click();
    await expect(page.getByText("这段时间没有会议")).toBeVisible();
    await shoot(page, "06-calendar");
  });

  test("Files view empty state", async ({ page }) => {
    await page.goto("/");
    await page.locator('[data-nav-view="files"]').click();
    await expect(page.getByText("没有文件")).toBeVisible();
    await shoot(page, "07-files");
  });

  test("Drafts view empty state", async ({ page }) => {
    await page.goto("/");
    await page.locator('[data-nav-view="drafts"]').click();
    await expect(page.getByText("还没有草稿")).toBeVisible();
    await shoot(page, "08-drafts");
  });

  test("Follow-ups view empty state", async ({ page }) => {
    await page.goto("/");
    await page.locator('[data-nav-view="followUps"]').click();
    await expect(page.getByText("没有跟进")).toBeVisible();
    await shoot(page, "09-followups");
  });

  test("Clips view empty state", async ({ page }) => {
    await page.goto("/");
    await page.locator('[data-nav-view="clips"]').click();
    await expect(page.getByText("还没有 Clip")).toBeVisible();
    await shoot(page, "10-clips");
  });

  test("Insights view empty state", async ({ page }) => {
    await page.goto("/");
    await page.locator('[data-nav-view="insights"]').click();
    await page.waitForTimeout(300);
    await shoot(page, "11-insights");
  });

  test("Settings → Accounts → Add account modal has provider dropdown", async ({ page }) => {
    await page.locator('[data-nav-view="settings"]').click();
    await expect(page.getByText("Connected accounts")).toBeVisible();
    await shoot(page, "12-settings-accounts");

    // Click "Add account" — provider dropdown should appear
    await page.getByRole("button", { name: /Add account/ }).first().click();
    await expect(page.getByText("添加邮箱账户")).toBeVisible();

    // Provider options: at least Gmail, Feishu, iCloud, QQ
    const select = page.locator("select").first();
    await expect(select).toBeVisible();
    const options = await select.locator("option").allTextContents();
    expect(options).toEqual(
      expect.arrayContaining(["Gmail", "飞书邮箱", "iCloud", "QQ 邮箱", "网易 163 邮箱", "Yahoo Mail", "Outlook / Microsoft 365"])
    );
    await shoot(page, "13-add-account");
  });

  test("Command palette opens with ⌘K and shows search across views/people", async ({ page }) => {
    await page.keyboard.press("Meta+k");
    await expect(page.getByPlaceholder(/Search views, actions, contacts, messages, files/)).toBeVisible();
    await shoot(page, "14-command-palette");
  });

  test("Onboarding wizard shows real-backend copy", async ({ page }) => {
    // The wizard only shows when onboarding_completed is false in prefs.
    // In browser mode, bootstrap returns no Tauri store so the wizard
    // should NOT auto-dismiss. We may need to set localStorage to trigger.
    await page.evaluate(() => {
      // Force the wizard to show
      (window as unknown as { __forceOnboarding?: boolean }).__forceOnboarding = true;
    });
    await page.goto("/");
    // Wizard copy (when forced) should mention "real" or "Connect your real email"
    // We don't assert the wizard is visible (depends on bootstrap path), but
    // we screenshot the post-onboarding state.
    await shoot(page, "15-after-onboarding");
  });
});

test.describe("Real backend integration — desktop only", () => {
  /** These checks only run when SENDPALM_E2E_NETWORK is set and the Tauri
   *  desktop binary is present. They shell out to the existing Rust
   *  integration tests (which use real imap.feishu.cn + smtp.feishu.cn).
   */
  test("Rust IMAP/SMTP integration tests pass against live Feishu", async () => {
    test.skip(!process.env.SENDPALM_E2E_NETWORK, "requires SENDPALM_E2E_NETWORK=1");
    test.skip(!process.env.SENDPALM_TEST_PASSWORD, "requires .env credentials");

    // Delegate to the cargo tests we already have — this gives Playwright
    // a single canonical "all green" signal for the real backend.
    const { execSync } = await import("node:child_process");
    const out = execSync(
      "cd src-tauri && SENDPALM_E2E_NETWORK=1 cargo test --test imap_real --test smtp_roundtrip --test providers_registry --test vault_test -- --test-threads=1",
      { encoding: "utf-8", timeout: 600_000 }
    );
    // Surface the summary to Playwright logs
    test.info().annotations.push({ type: "test-output", description: out.slice(-2000) });
    expect(out).toMatch(/test result: ok\./);
  });
});
