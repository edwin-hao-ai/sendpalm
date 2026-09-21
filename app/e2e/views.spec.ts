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
    await expect(page.locator("[data-testid='brand-mark']")).toContainText(
      "SendPalm",
    );
    // Search placeholder is there
    await expect(page.getByPlaceholder(/搜索邮件、联系人/)).toBeVisible();
    // Sync badge offers account setup because no real account in browser mode
    await expect(page.getByText("添加邮箱账户 →")).toBeVisible();
    await shoot(page, "01-topbar");
  });

  test("Imbox shows real empty-state copy (NOT 'Inbox zero' mock)", async ({
    page,
  }) => {
    await page.goto("/");
    await page.locator("body.app-ready").waitFor({ timeout: 10_000 });
    // The empty-state copy was rewritten in the 8/18 perf pass to make
    // the value proposition explicit ("重要邮件" rather than the
    // generic "空的") and to drop the "Settings → Accounts" pointer
    // (onboarding handles account creation in a dedicated view now).
    await expect(page.getByText(/Imbox 是给你的重要邮件/)).toBeVisible();
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
    await expect(page.getByText("这段时间还没有安排")).toBeVisible();
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
    await page.locator('[data-testid="settings-menu-item-accounts"]').click();
    // Wait for Accounts view to mount (no accounts → empty state)
    await expect(page.getByText("还没有连接邮箱")).toBeVisible({
      timeout: 10_000,
    });
    await page.waitForTimeout(300);
    await shoot(page, "12-settings-accounts");

    // Click "添加账户" — provider dropdown should appear
    await page
      .getByRole("button", { name: "添加账户" })
      .first()
      .click();
    // Scope to the dialog: the topbar sync badge also carries
    // "添加邮箱账户 →" copy and would trip strict mode.
    const dialog = page.getByRole("dialog", { name: "添加邮箱账户" });
    await expect(dialog).toBeVisible({
      timeout: 10_000,
    });
    await page.waitForTimeout(300);

    // Wait for the modal to be fully mounted (select with options appears).
    // The Add Account modal contains the provider dropdown.
    await page.waitForTimeout(500);
    const select = dialog.locator("select").last();
    await expect(select).toBeVisible();
    // The provider list comes from the listProviders() resource, which
    // returns a 10-item array via the Tauri shim. Wait for options to render.
    await page.waitForFunction(
      () => {
        const dlg = document.querySelector('[role="dialog"]');
        const sels = dlg?.querySelectorAll("select") ?? [];
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
    // With no accounts configured, the badge is a direct "add account" CTA
    // that jumps to Settings → Accounts instead of opening a popover.
    await expect(page.getByText("添加邮箱账户 →")).toBeVisible({
      timeout: 5_000,
    });
    await shoot(page, "14a-sync-badge-closed");

    await page.locator("[data-sync-badge]").click();
    await expect(page.locator("#topbar")).toContainText("设置", {
      timeout: 5_000,
    });
    await shoot(page, "14b-sync-badge-add-account");
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
      page.locator('input[placeholder*="搜索视图"]'),
    ).toBeVisible({ timeout: 5_000 });
    await page.waitForTimeout(200);
    await shoot(page, "14-command-palette");
  });

  test("Sidebar exposes 15 stable [data-nav-view] buttons", async ({
    page,
  }) => {
    await page.goto("/");
    const buttons = page.locator("#sidebar [data-nav-view]");
    await expect(buttons).toHaveCount(15);
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
      "trash",
      "spam",
      "settings",
    ]);
    await shoot(page, "16-sidebar-nav");
  });

  test("Compose modal can be filled and sends via backend bridge", async ({
    page,
  }) => {
    await page.goto("/");
    await page.locator("body.app-ready").waitFor({ timeout: 10_000 });
    // Seed one email account so the compose form renders (without an
    // account the dialog shows the "还没有绑定邮箱账户" empty state and
    // the send button is disabled).
    await page.evaluate(async () => {
      const helpers = (
        window as unknown as {
          __sendpalmE2E: {
            seedAccount: (a: unknown) => Promise<void>;
          };
        }
      ).__sendpalmE2E;
      await helpers.seedAccount({
        id: "acct-e2e-compose",
        type: "email",
        provider: "gmail",
        email: "edwinhao@sendpalm.com",
        label: "E2E 测试邮箱",
        displayName: "Edwin",
        status: "connected",
        synced: 0,
        total: 0,
        privacy: "unified",
        color: "#2f6f4f",
        avatar: "",
        lastSync: new Date().toISOString(),
        settings: {
          aliases: [],
          signature: "",
          replyTo: "",
          defaultFrom: "",
          syncFolders: [],
          syncFrequency: "manual",
          autoBcc: false,
          autoBccAddress: "",
          vacationResponder: { enabled: false, subject: "", body: "" },
        },
      });
    });
    // Open compose with the global shortcut.
    await page.locator("body").click();
    const isMac = process.platform === "darwin";
    await page.keyboard.press(isMac ? "Meta+n" : "Control+n");
    // Scope to the dialog: the Imbox "新邮件" tab and the empty-state
    // paragraph also contain the string and would trip strict mode.
    const dialog = page.getByRole("dialog", { name: "新邮件" });
    await expect(dialog).toBeVisible();

    // Fill recipient, subject and body using stable placeholders.
    const recipientInput = dialog.locator(
      '[data-field="to"] input[placeholder="recipient@example.com"]',
    );
    await recipientInput.fill("test@example.com");
    await recipientInput.press("Enter");
    await dialog.locator('input[placeholder="主题"]').fill("E2E test");
    await dialog
      .locator('textarea[placeholder="正文…"]')
      .fill("This is a test message from Playwright.");

    // Use Cmd/Ctrl+Enter to send (the prototype's keyboard shortcut).
    await dialog
      .locator('textarea[placeholder="正文…"]')
      .press(isMac ? "Meta+Enter" : "Control+Enter");

    // In browser mode the shim returns null for send_email_via_backend,
    // so the app falls back to saving the message as a draft and shows
    // the fallback toast.
    await expect(page.getByText(/已保存为草稿|草稿已保存|已发送/)).toBeVisible({
      timeout: 5_000,
    });
    await expect(dialog).toHaveCount(0);
    await shoot(page, "17-compose-sent");
  });
});

test.describe("Responsive layout", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("iPhone SE shows bottom tab bar with per-icon labels", async ({
    page,
  }) => {
    await page.goto("/");
    const sidebar = page.locator("#sidebar");
    await expect(sidebar).toBeVisible();

    // On mobile the sidebar becomes a bottom tab bar (row layout).
    const flexDir = await sidebar.evaluate(
      (el) => getComputedStyle(el).flexDirection,
    );
    expect(flexDir).toBe("row");

    const buttons = sidebar.locator("[data-nav-view]");
    // Mobile collapses 15 entries into 6 primary tabs + a "More" sheet.
    await expect(buttons).toHaveCount(7);

    // Mobile bottom-tab bar shows a label span under each icon (6 primary + "More").
    const labels = sidebar.locator("span");
    await expect(labels).toHaveCount(7);
    await expect(labels.first()).toBeVisible();

    await shoot(page, "18-mobile-bottom-tabs");

    // Open the "More" sheet and verify all remaining views are reachable.
    await sidebar.locator('[data-nav-view="more"]').click();
    const sheet = page.locator('[data-testid="mobile-more-sheet"]');
    await expect(sheet).toBeVisible();
    const overflowButtons = sheet.locator("[data-nav-view]");
    await expect(overflowButtons).toHaveCount(9);
    await sheet.locator('[data-nav-view="feed"]').click();
    await expect(sheet).not.toBeVisible();
    await expect(page.locator('#topbar:has-text("Stream")')).toBeVisible();
  });

  test("Settings page uses iOS-style menu on mobile", async ({ page }) => {
    await page.goto("/");
    await page.locator('#sidebar [data-nav-view="settings"]').click();
    await expect(page.locator('#topbar:has-text("设置")')).toBeVisible();

    const settingsRoot = page.locator('[data-testid="settings-view"]');
    await expect(settingsRoot).toBeVisible();

    // Mobile shows a vertical menu first, not the desktop two-pane layout.
    const menu = page.locator('[data-testid="settings-menu"]');
    await expect(menu).toBeVisible();

    // Tap into the Shortcuts tab.
    await page.locator('[data-testid="settings-menu-item-shortcuts"]').click();
    await expect(
      page.locator('[data-testid="settings-mobile-header"]'),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "键盘快捷键" }),
    ).toBeVisible();

    await shoot(page, "19-mobile-settings-shortcuts");

    // Back button returns to the menu.
    await page
      .locator('[data-testid="settings-mobile-header"] button')
      .first()
      .click();
    await expect(menu).toBeVisible();
    await expect(
      page.locator('[data-testid="settings-mobile-header"]'),
    ).not.toBeVisible();

    await shoot(page, "19-mobile-settings-menu");
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

    // Sidebar should still expose all 15 nav views.
    const buttons = sidebar.locator("[data-nav-view]");
    await expect(buttons).toHaveCount(15);

    await shoot(page, "19-ipad-portrait");
  });

  test("iPad portrait shows icon-only sidebar and tooltip on hover", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 820, height: 1180 });
    await page.goto("/");
    await page.locator("body.app-ready").waitFor();
    const nav = page.locator("[data-nav='Follow-ups']");
    await expect(nav).toBeVisible();
    await nav.hover();
    const tip = page.locator("[data-testid='sidebar-tooltip']");
    await expect(tip).toContainText("跟进");
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

    // iPad landscape uses the desktop 64 px rail per the prototype.
    expect(
      await page
        .locator("#sidebar")
        .evaluate((el) => el.getBoundingClientRect().width),
    ).toBe(64);

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
