import { expect, type Page } from "@playwright/test";
import { NAV_GROUPS } from "../src/utils/labels";

/** Navigate via the same visible workspace controls as a user, including mobile. */
export async function navigateToView(page: Page, view: string): Promise<void> {
  await page.locator("body.app-ready").waitFor();
  const direct = page.locator(`#sidebar [data-nav-view="${view}"]`);
  if (await direct.isVisible()) {
    await direct.click();
    return;
  }
  const group = NAV_GROUPS.find((g) => g.views.some((v) => v === view));
  if (!group) throw new Error(`Unknown navigation route: ${view}`);
  const disclosure = page.locator(`[data-nav-disclosure="${group.id}"]`);
  if (await disclosure.isVisible()) {
    if ((await disclosure.getAttribute("aria-expanded")) !== "true")
      await disclosure.click();
    await page
      .locator(`#workspace-${group.id} [data-nav-view="${view}"]`)
      .click();
  } else {
    const sheet = page.getByTestId("mobile-more-sheet");
    if (!(await sheet.isVisible()))
      await page.locator('#sidebar [data-nav-view="more"]').click();
    await expect(sheet).toBeVisible();
    await sheet.locator(`[data-nav-view="${view}"]`).click();
  }
}
