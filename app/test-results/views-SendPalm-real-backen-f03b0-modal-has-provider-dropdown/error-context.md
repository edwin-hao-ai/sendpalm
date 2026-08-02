# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: views.spec.ts >> SendPalm real backend — empty states (no mock data) >> Settings → Accounts → Add account modal has provider dropdown
- Location: e2e/views.spec.ts:112:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('[data-nav-view="settings"]')

```

# Test source

```ts
  13  | import { test, expect, type Page } from "@playwright/test";
  14  | import { mkdir } from "node:fs/promises";
  15  | import { join } from "node:path";
  16  | 
  17  | const SHOTS = "/tmp/sendpalm-screenshots/e2e";
  18  | 
  19  | test.beforeAll(async () => {
  20  |   await mkdir(SHOTS, { recursive: true });
  21  | });
  22  | 
  23  | async function shoot(page: Page, name: string) {
  24  |   // Give animations a beat to settle.
  25  |   await page.waitForTimeout(300);
  26  |   await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: false });
  27  | }
  28  | 
  29  | test.describe("SendPalm real backend — empty states (no mock data)", () => {
  30  |   test("Topbar shows slim brand and search; no redundant title", async ({ page }) => {
  31  |     await page.goto("/");
  32  |     await expect(page.locator("text=SendPalm").first()).toBeVisible();
  33  |     // Search placeholder is there
  34  |     await expect(page.getByPlaceholder(/Search contacts/)).toBeVisible();
  35  |     // Sync badge is "未连接" because no real account in browser mode
  36  |     await expect(page.getByText("未连接")).toBeVisible();
  37  |     await shoot(page, "01-topbar");
  38  |   });
  39  | 
  40  |   test("Imbox shows real empty-state copy (NOT 'Inbox zero' mock)", async ({ page }) => {
  41  |     await page.goto("/");
  42  |     await expect(page.getByText(/Inbox 是空的/)).toBeVisible();
  43  |     await expect(page.getByText(/Settings → Accounts/)).toBeVisible();
  44  |     // 'Inbox zero' was the OLD mock-data copy — it must NOT appear.
  45  |     await expect(page.getByText("Inbox zero")).toHaveCount(0);
  46  |     await shoot(page, "02-imbox-empty");
  47  |   });
  48  | 
  49  |   test("Stream view empty state", async ({ page }) => {
  50  |     await page.goto("/");
  51  |     await page.locator('[data-nav-view="feed"]').click();
  52  |     await expect(page.getByText("Stream 是空的")).toBeVisible();
  53  |     await shoot(page, "03-stream");
  54  |   });
  55  | 
  56  |   test("Records view empty state", async ({ page }) => {
  57  |     await page.goto("/");
  58  |     await page.locator('[data-nav-view="paperTrail"]').click();
  59  |     await expect(page.getByText("Records 是空的")).toBeVisible();
  60  |     await shoot(page, "04-records");
  61  |   });
  62  | 
  63  |   test("Contacts view empty state", async ({ page }) => {
  64  |     await page.goto("/");
  65  |     await page.locator('[data-nav-view="contacts"]').click();
  66  |     await expect(page.getByText("没有联系人")).toBeVisible();
  67  |     await shoot(page, "05-contacts-empty");
  68  |   });
  69  | 
  70  |   test("Calendar view empty state", async ({ page }) => {
  71  |     await page.goto("/");
  72  |     await page.locator('[data-nav-view="calendar"]').click();
  73  |     await expect(page.getByText("这段时间没有会议")).toBeVisible();
  74  |     await shoot(page, "06-calendar");
  75  |   });
  76  | 
  77  |   test("Files view empty state", async ({ page }) => {
  78  |     await page.goto("/");
  79  |     await page.locator('[data-nav-view="files"]').click();
  80  |     await expect(page.getByText("没有文件")).toBeVisible();
  81  |     await shoot(page, "07-files");
  82  |   });
  83  | 
  84  |   test("Drafts view empty state", async ({ page }) => {
  85  |     await page.goto("/");
  86  |     await page.locator('[data-nav-view="drafts"]').click();
  87  |     await expect(page.getByText("还没有草稿")).toBeVisible();
  88  |     await shoot(page, "08-drafts");
  89  |   });
  90  | 
  91  |   test("Follow-ups view empty state", async ({ page }) => {
  92  |     await page.goto("/");
  93  |     await page.locator('[data-nav-view="followUps"]').click();
  94  |     await expect(page.getByText("没有跟进")).toBeVisible();
  95  |     await shoot(page, "09-followups");
  96  |   });
  97  | 
  98  |   test("Clips view empty state", async ({ page }) => {
  99  |     await page.goto("/");
  100 |     await page.locator('[data-nav-view="clips"]').click();
  101 |     await expect(page.getByText("还没有 Clip")).toBeVisible();
  102 |     await shoot(page, "10-clips");
  103 |   });
  104 | 
  105 |   test("Insights view empty state", async ({ page }) => {
  106 |     await page.goto("/");
  107 |     await page.locator('[data-nav-view="insights"]').click();
  108 |     await page.waitForTimeout(300);
  109 |     await shoot(page, "11-insights");
  110 |   });
  111 | 
  112 |   test("Settings → Accounts → Add account modal has provider dropdown", async ({ page }) => {
> 113 |     await page.locator('[data-nav-view="settings"]').click();
      |                                                      ^ Error: locator.click: Test timeout of 30000ms exceeded.
  114 |     await expect(page.getByText("Connected accounts")).toBeVisible();
  115 |     await shoot(page, "12-settings-accounts");
  116 | 
  117 |     // Click "Add account" — provider dropdown should appear
  118 |     await page.getByRole("button", { name: /Add account/ }).first().click();
  119 |     await expect(page.getByText("添加邮箱账户")).toBeVisible();
  120 | 
  121 |     // Provider options: at least Gmail, Feishu, iCloud, QQ
  122 |     const select = page.locator("select").first();
  123 |     await expect(select).toBeVisible();
  124 |     const options = await select.locator("option").allTextContents();
  125 |     expect(options).toEqual(
  126 |       expect.arrayContaining(["Gmail", "飞书邮箱", "iCloud", "QQ 邮箱", "网易 163 邮箱", "Yahoo Mail", "Outlook / Microsoft 365"])
  127 |     );
  128 |     await shoot(page, "13-add-account");
  129 |   });
  130 | 
  131 |   test("Command palette opens with ⌘K and shows search across views/people", async ({ page }) => {
  132 |     await page.keyboard.press("Meta+k");
  133 |     await expect(page.getByPlaceholder(/Search views, actions, contacts, messages, files/)).toBeVisible();
  134 |     await shoot(page, "14-command-palette");
  135 |   });
  136 | 
  137 |   test("Onboarding wizard shows real-backend copy", async ({ page }) => {
  138 |     // The wizard only shows when onboarding_completed is false in prefs.
  139 |     // In browser mode, bootstrap returns no Tauri store so the wizard
  140 |     // should NOT auto-dismiss. We may need to set localStorage to trigger.
  141 |     await page.evaluate(() => {
  142 |       // Force the wizard to show
  143 |       (window as unknown as { __forceOnboarding?: boolean }).__forceOnboarding = true;
  144 |     });
  145 |     await page.goto("/");
  146 |     // Wizard copy (when forced) should mention "real" or "Connect your real email"
  147 |     // We don't assert the wizard is visible (depends on bootstrap path), but
  148 |     // we screenshot the post-onboarding state.
  149 |     await shoot(page, "15-after-onboarding");
  150 |   });
  151 | });
  152 | 
  153 | test.describe("Real backend integration — desktop only", () => {
  154 |   /** These checks only run when SENDPALM_E2E_NETWORK is set and the Tauri
  155 |    *  desktop binary is present. They shell out to the existing Rust
  156 |    *  integration tests (which use real imap.feishu.cn + smtp.feishu.cn).
  157 |    */
  158 |   test("Rust IMAP/SMTP integration tests pass against live Feishu", async () => {
  159 |     test.skip(!process.env.SENDPALM_E2E_NETWORK, "requires SENDPALM_E2E_NETWORK=1");
  160 |     test.skip(!process.env.SENDPALM_TEST_PASSWORD, "requires .env credentials");
  161 | 
  162 |     // Delegate to the cargo tests we already have — this gives Playwright
  163 |     // a single canonical "all green" signal for the real backend.
  164 |     const { execSync } = await import("node:child_process");
  165 |     const out = execSync(
  166 |       "cd src-tauri && SENDPALM_E2E_NETWORK=1 cargo test --test imap_real --test smtp_roundtrip --test providers_registry --test vault_test -- --test-threads=1",
  167 |       { encoding: "utf-8", timeout: 600_000 }
  168 |     );
  169 |     // Surface the summary to Playwright logs
  170 |     test.info().annotations.push({ type: "test-output", description: out.slice(-2000) });
  171 |     expect(out).toMatch(/test result: ok\./);
  172 |   });
  173 | });
  174 | 
```