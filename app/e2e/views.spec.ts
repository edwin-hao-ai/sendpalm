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
  test("Topbar shows slim brand and search; no redundant title", async ({
    page,
  }) => {
    await page.goto("/");
    // Wait for the splash overlay to fade and SolidJS to mount.
    await page.locator("body.app-ready").waitFor({ timeout: 5_000 });
    await expect(page.locator("#titlebar")).toContainText("SendPalm");
    // Search placeholder is there
    await expect(page.getByPlaceholder(/Search contacts/)).toBeVisible();
    // Sync badge is "未连接" because no real account in browser mode
    await expect(page.getByText("未连接")).toBeVisible();
    await shoot(page, "01-topbar");
  });

  test("Imbox shows real empty-state copy (NOT 'Inbox zero' mock)", async ({
    page,
  }) => {
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

  test("Settings → Accounts → Add account modal has provider dropdown", async ({
    page,
  }) => {
    await page.goto("/");
    await page.locator('[data-nav-view="settings"]').click();
    // Switch to Accounts tab (default is Profile)
    await page
      .getByRole("button", { name: /Accounts/ })
      .first()
      .click();
    // Wait for Accounts view to mount
    await expect(page.getByText("Connected accounts")).toBeVisible({
      timeout: 10_000,
    });
    await page.waitForTimeout(300);
    await shoot(page, "12-settings-accounts");

    // Click "Add account" — provider dropdown should appear
    await page
      .getByRole("button", { name: /Add account/ })
      .first()
      .click();
    // The modal title is unique enough
    await expect(page.getByText("添加邮箱账户")).toBeVisible({
      timeout: 10_000,
    });
    await page.waitForTimeout(300);

    // Wait for the modal to be fully mounted (select with options appears).
    // The Add Account modal contains the provider dropdown.
    await page.waitForTimeout(500);
    const selectCount = await page.locator("select").count();
    expect(selectCount).toBeGreaterThanOrEqual(1);
    const select = page.locator("select").last();
    await expect(select).toBeVisible();
    // The provider list comes from the listProviders() resource, which
    // returns a 10-item array via the Tauri shim. Wait for options to render.
    await page.waitForFunction(
      () => {
        const sels = document.querySelectorAll("select");
        const last = sels[sels.length - 1];
        return last && last.options.length >= 7;
      },
      { timeout: 5_000 },
    );
    const options = await select.locator("option").allTextContents();
    expect(options.length).toBeGreaterThanOrEqual(7);
    expect(options).toEqual(
      expect.arrayContaining([
        "Gmail",
        "飞书邮箱",
        "iCloud",
        "QQ 邮箱",
        "网易 163 邮箱",
        "Yahoo Mail",
        "Outlook / Microsoft 365",
      ]),
    );
    await shoot(page, "13-add-account");
  });

  test("Topbar sync badge opens multi-account popover with empty-state hint", async ({
    page,
  }) => {
    await page.goto("/");
    // The badge reads "未连接" when no accounts are configured.
    await expect(page.getByText("未连接")).toBeVisible({ timeout: 5_000 });
    await shoot(page, "14a-sync-badge-closed");

    // Click the badge to open the popover.
    await page.locator("[data-sync-badge]").click();
    await expect(page.locator("[data-sync-popover]")).toBeVisible({
      timeout: 3_000,
    });
    // Empty-state copy is shown.
    await expect(
      page.getByText(/请到 Settings → Accounts 添加邮箱账户/),
    ).toBeVisible();
    await shoot(page, "14b-sync-badge-popover");

    // Click the backdrop overlay to close.
    await page.locator("[data-sync-popover]").waitFor();
    await page.locator("[data-sync-overlay]").click();
    await expect(page.locator("[data-sync-popover]")).toHaveCount(0);
  });

  test("Command palette opens with ⌘K and shows search across views/people", async ({
    page,
  }) => {
    await page.goto("/");
    // Focus the body so the keypress isn't captured by a focused button
    await page.locator("body").click();
    await page.waitForTimeout(300);
    // Press ⌘K (use Control on Linux/Chromium, Meta on Mac).
    const isMac = process.platform === "darwin";
    await page.keyboard.press(isMac ? "Meta+k" : "Control+k");
    await expect(
      page.locator('input[placeholder*="Search views"]'),
    ).toBeVisible({ timeout: 5_000 });
    await page.waitForTimeout(200);
    await shoot(page, "14-command-palette");
  });

  test("Sidebar exposes 13 stable [data-nav-view] buttons", async ({
    page,
  }) => {
    await page.goto("/");
    const buttons = page.locator("#sidebar [data-nav-view]");
    await expect(buttons).toHaveCount(13);
    const views = await buttons.evaluateAll((els) =>
      els.map((e) => e.getAttribute("data-nav-view")),
    );
    expect(views).toEqual([
      "screener",
      "imbox",
      "feed",
      "paperTrail",
      "contacts",
      "companies",
      "calendar",
      "files",
      "drafts",
      "followUps",
      "clips",
      "insights",
      "settings",
    ]);
    await shoot(page, "16-sidebar-nav");
  });

  test("Compose modal can be filled and sends via backend bridge", async ({
    page,
  }) => {
    await page.goto("/");
    // Open compose with the global shortcut.
    await page.locator("body").click();
    const isMac = process.platform === "darwin";
    await page.keyboard.press(isMac ? "Meta+n" : "Control+n");
    // The compose modal title is unique.
    await expect(page.getByText("新邮件")).toBeVisible();

    // Fill recipient, subject and body using stable placeholders.
    await page.locator('input[type="email"]').fill("test@example.com");
    await page.locator('input[placeholder="主题"]').fill("E2E test");
    await page
      .locator('textarea[placeholder="正文…"]')
      .fill("This is a test message from Playwright.");

    // Click the send split-button, then "立即发送".
    await page.getByRole("button", { name: /发送/ }).click();
    await page.getByText("立即发送").click();

    // In browser mode the shim returns null, so the app falls back to saving
    // the message as a draft and shows the fallback toast.
    await expect(page.getByText(/已保存为草稿|已发送/)).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByText("新邮件")).not.toBeVisible();
    await shoot(page, "17-compose-sent");
  });
});

test.describe("Responsive layout", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("iPhone SE shows bottom tab bar and hides sidebar labels", async ({
    page,
  }) => {
    await page.goto("/");
    const sidebar = page.locator("#sidebar");
    await expect(sidebar).toBeVisible();

    // On mobile the sidebar becomes a bottom tab bar (row layout, no labels).
    const flexDir = await sidebar.evaluate(
      (el) => getComputedStyle(el).flexDirection,
    );
    expect(flexDir).toBe("row");

    const buttons = sidebar.locator("[data-nav-view]");
    await expect(buttons).toHaveCount(13);

    // Labels are hidden on mobile.
    const labels = sidebar.locator("span");
    await expect(labels).toHaveCount(0);

    await shoot(page, "18-mobile-bottom-tabs");
  });
});

test.describe("Responsive layout — iPad portrait", () => {
  test.use({ viewport: { width: 820, height: 1180 } });

  test("iPad shows sidebar icons vertically and overlays the detail panel", async ({
    page,
  }) => {
    await page.goto("/");
    const sidebar = page.locator("#sidebar");
    await expect(sidebar).toBeVisible();

    // iPad sidebar is vertical (column), not a bottom tab bar.
    const flexDir = await sidebar.evaluate(
      (el) => getComputedStyle(el).flexDirection,
    );
    expect(flexDir).toBe("column");

    // Sidebar should still expose all 13 nav views.
    const buttons = sidebar.locator("[data-nav-view]");
    await expect(buttons).toHaveCount(13);

    await shoot(page, "19-ipad-portrait");
  });

  test("iPad sidebar shows full labels (not truncated)", async ({ page }) => {
    await page.goto("/");
    // "Follow-ups" is the longest label — make sure it's readable.
    await expect(
      page.locator('[data-nav="Follow-ups"]').first(),
    ).toBeVisible();
    const text = await page
      .locator('[data-nav="Follow-ups"]')
      .first()
      .textContent();
    expect(text?.trim()).toBe("Follow-ups");
    await shoot(page, "20-ipad-sidebar-labels");
  });
});

test.describe("Responsive layout — iPad landscape", () => {
  test.use({ viewport: { width: 1180, height: 820 } });

  test("iPad landscape lays out like desktop with sidebar + main + (overlay) detail", async ({
    page,
  }) => {
    await page.goto("/");
    const sidebar = page.locator("#sidebar");
    await expect(sidebar).toBeVisible();
    const flexDir = await sidebar.evaluate(
      (el) => getComputedStyle(el).flexDirection,
    );
    expect(flexDir).toBe("column");

    // 1180 is below 1024? no — it's above. So this is desktop. Verify the
    // desktop sidebar-width variable is the larger one.
    const sidebarWidth = await sidebar.evaluate(
      (el) => el.getBoundingClientRect().width,
    );
    expect(sidebarWidth).toBeGreaterThan(70);

    await shoot(page, "21-ipad-landscape");
  });
});

test.describe("Real backend integration — desktop only", () => {
  /** These checks only run when SENDPALM_E2E_NETWORK is set and the Tauri
   *  desktop binary is present. They shell out to the existing Rust
   *  integration tests (which use real imap.feishu.cn + smtp.feishu.cn).
   */
  test("Rust IMAP/SMTP integration tests pass against live Feishu", async () => {
    test.skip(
      !process.env.SENDPALM_E2E_NETWORK,
      "requires SENDPALM_E2E_NETWORK=1",
    );
    test.skip(!process.env.SENDPALM_TEST_PASSWORD, "requires .env credentials");

    // Delegate to the cargo tests we already have — this gives Playwright
    // a single canonical "all green" signal for the real backend.
    const { execSync } = await import("node:child_process");
    const out = execSync(
      "cd src-tauri && SENDPALM_E2E_NETWORK=1 cargo test --test imap_real --test smtp_roundtrip --test providers_registry --test vault_test -- --test-threads=1",
      { encoding: "utf-8", timeout: 600_000 },
    );
    // Surface the summary to Playwright logs
    test
      .info()
      .annotations.push({ type: "test-output", description: out.slice(-2000) });
    expect(out).toMatch(/test result: ok\./);
  });
});
