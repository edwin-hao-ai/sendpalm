// Quick debug test — what attributes does the sidebar button have?
import { test, expect } from "@playwright/test";

test("debug sidebar attributes", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(1000);
  const html = await page.locator("#sidebar").first().innerHTML();
  console.log("SIDEBAR HTML (first 2000 chars):", html.slice(0, 2000));
  // Look at all data-* attributes
  const attrs = await page.locator("#sidebar button").first().evaluate((el) => {
    const result: Array<{ tag: string; dataAttrs: Record<string, string> }> = [];
    result.push({
      tag: el.tagName,
      dataAttrs: Object.fromEntries(
        Array.from(el.attributes)
          .filter((a) => a.name.startsWith("data-"))
          .map((a) => [a.name, a.value])
      ),
    });
    return result;
  });
  console.log("FIRST BUTTON DATA ATTRS:", JSON.stringify(attrs, null, 2));
  // List all data-nav-view values
  const views = await page.locator("[data-nav-view]").evaluateAll((els) =>
    els.map((e) => e.getAttribute("data-nav-view"))
  );
  console.log("ALL data-nav-view VALUES:", JSON.stringify(views));
});
