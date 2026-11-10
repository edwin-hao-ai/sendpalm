/** 「显示图片」 must reveal background images too, not just `<img>` tags.
 *
 *  A CSS `url()` is a tracking pixel with a paint job, so the sender's sheet is
 *  shipped twice: a blocked copy renders first, and the untouched copy sits in
 *  a sheet switched off with `media="not all"`. The button flips that sheet on,
 *  which restores the designed layout at the original urls — no second network
 *  pass and nothing fetched before the user asks.
 */

import { test, expect } from "@playwright/test";

const EMAIL = `<!DOCTYPE html><html><head>
<style>
  .hero { background-image: url('https://cdn.example.com/hero.png'); height: 40px; }
  a { color: #123456; }
</style></head><body>
  <div class="hero">hero</div>
  <p>body text <a href="https://example.com/x">a link</a></p>
</body></html>`;

test("background images stay blocked until the user asks", async ({ page }) => {
  await page.goto("/");
  await page.locator("body.app-ready").waitFor({ timeout: 10_000 });

  const { doc, counts } = await page.evaluate(async (html: string) => {
    const mod = (await import("/src/utils/html.ts")) as {
      htmlEmailSrcdoc: (h: string) => string;
      analyzeImages: (h: string) => { cssBackgroundCount: number };
    };
    return { doc: mod.htmlEmailSrcdoc(html), counts: mod.analyzeImages(html) };
  }, EMAIL);

  // The count the button shows includes CSS backgrounds, or the user would have
  // no way to know there is anything to reveal.
  expect(counts.cssBackgroundCount).toBe(1);

  await page.setContent(
    `<html><body style="margin:0"><iframe id="f" style="width:600px;height:400px;border:0"></iframe></body></html>`,
  );
  await page.evaluate((d: string) => {
    (document.getElementById("f") as HTMLIFrameElement).srcdoc = d;
  }, doc);
  await page.waitForTimeout(400);

  const read = () =>
    page.evaluate(() => {
      const frame = (document.getElementById("f") as HTMLIFrameElement).contentDocument!;
      const hero = frame.querySelector(".hero") as HTMLElement;
      const full = frame.getElementById("sp-css-full");
      return {
        sheet: full?.getAttribute("media") ?? "absent",
        background: getComputedStyle(hero).backgroundImage,
        linkColor: getComputedStyle(frame.querySelector("a")!).color,
      };
    });

  const before = await read();
  expect(before.sheet).toBe("not all");
  expect(before.background, "the remote background is blocked at first").toContain(
    "about:blank",
  );

  await page.evaluate(() => {
    const f = document.getElementById("f") as HTMLIFrameElement;
    f.contentWindow!.postMessage({ type: "sendpalm:show-images", srcMap: {} }, "*");
  });
  await page.waitForTimeout(300);

  const after = await read();
  expect(after.sheet).toBe("all");
  expect(after.background).toContain("cdn.example.com/hero.png");
  // The sender's own colours were never blocked — only remote fetches were.
  expect(after.linkColor).toBe("rgb(18, 52, 86)");
});
