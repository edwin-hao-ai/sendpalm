/** Calendar keyboard navigation — the view used to be mouse-only. */

import { test, expect, type Page } from "@playwright/test";

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

async function seedEventToday(page: Page) {
  const key = dateKey(new Date());
  const payload = JSON.stringify({
    accounts: [],
    contacts: [],
    messages: [],
    events: [
      {
        id: "evt-keys",
        title: "键盘可达的会议",
        dt: key,
        tm: "14:00",
        dur: 60,
        people: [],
        cal: "work",
        detail: "",
      },
    ],
  });
  await page.goto("/");
  await page.locator("body.app-ready").waitFor({ timeout: 10_000 });
  await page.evaluate(async () => {
    await window.__sendpalmE2E?.resetData();
  });
  await page.addInitScript((s: string) => {
    sessionStorage.setItem("__sendpalm_e2e_seed", s);
  }, payload);
  await page.goto("/");
  await page.locator("body.app-ready").waitFor({ timeout: 10_000 });
}

test.describe("calendar keyboard", () => {
  test("arrow keys move the selected day and Enter opens its event", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedEventToday(page);

    await page.locator('#sidebar [data-nav-group="calendar"]').click();
    await expect(page.locator(".page-header-title")).toHaveText("日历");
    await expect(page.getByText("键盘可达的会议").first()).toBeVisible({
      timeout: 5_000,
    });

    // Keyboard focus must not be inside a field for the handler to act.
    await page.locator(".page-header-title").click();

    // Moving a day forward hides today's meeting; coming back restores it.
    await page.keyboard.press("ArrowRight");
    await expect(page.getByText("键盘可达的会议")).toHaveCount(0, {
      timeout: 3_000,
    });
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByText("键盘可达的会议").first()).toBeVisible({
      timeout: 3_000,
    });

    await page.keyboard.press("Enter");
    await expect(page.locator("#detail-panel")).toBeVisible({ timeout: 5_000 });
    await expect(page.locator("#detail-panel")).toContainText("键盘可达的会议");
  });
});
