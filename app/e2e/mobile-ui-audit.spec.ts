/** Mobile UI audit — the checklist a phone UI has to pass, run on every view.
 *
 *  Written after the account popover was found hanging off the left edge and
 *  the topbar was crowded: those are viewport bugs, and they are far cheaper to
 *  catch in an emulated iPhone viewport than on a device where nobody remembers
 *  to look. Derived from the standard mobile checklists (Front-End Checklist,
 *  Chrome form-factor guidance, WCAG 2.5.5/2.5.8, Vercel web guidelines):
 *
 *   1. layout fits 375-390 px: no page-level horizontal scrolling, no element
 *      wider than the viewport, nothing clipped at the edges
 *   2. overlays (popovers, sheets, dropdowns) must sit fully inside the
 *      viewport and paint above the content underneath
 *   3. tap targets >= 44x44 (WCAG 2.5.5 for touch)
 *   4. form fields >= 16 px font (below that iOS Safari zooms and stays zoomed)
 *   5. bottom chrome must not cover the last row of the page
 */
import { test, expect, type Page } from "@playwright/test";

const ACCT = "acct_mobile_audit";

interface Seed {
  accounts: unknown[];
  contacts: unknown[];
  messages: unknown[];
  events: unknown[];
}

function iso(hoursAgo: number): string {
  return new Date(Date.now() - hoursAgo * 3600_000).toISOString();
}

function seed(): Seed {
  const account = {
    id: ACCT,
    type: "email",
    provider: "feishu",
    email: "edwin@sendpalm.com",
    label: "飞书邮箱",
    displayName: "edwin",
    status: "connected",
    synced: 12,
    total: 12,
    privacy: "unified",
    color: "#0a8f63",
    avatar: "",
    lastSync: new Date().toISOString(),
    settings: {
      aliases: [],
      signature: "Best,\nEdwin",
      replyTo: "",
      defaultFrom: "edwin@sendpalm.com",
      syncFolders: [{ name: "INBOX", enabled: true }],
      syncFrequency: "15min",
      autoBcc: false,
      autoBccAddress: "",
      vacationResponder: { enabled: false, subject: "", body: "" },
    },
  };
  const contacts = [
    {
      id: "c_audit",
      name: "Dylan Sullivan",
      firstName: "Dylan",
      lastName: "Sullivan",
      emails: [{ value: "dylan@example.com", label: "work" }],
      firstSeen: false,
      screened: true,
      blocked: false,
      defaultBucket: "imbox",
    },
  ];
  const messages = Array.from({ length: 12 }, (_, i) => ({
    id: `m_audit_${i}`,
    pid: "c_audit",
    subj:
      i === 0
        ? "A very long subject line that has to wrap or truncate cleanly on a narrow phone screen without pushing anything off the edge"
        : `Subject ${i}`,
    prev: "Preview text that is long enough to need truncation on a phone.",
    body: "Body",
    bodyHtml: null,
    tm: iso(i),
    st: iso(i),
    receivedAt: iso(i),
    ac: ACCT,
    bucket: "imbox",
    direction: "in",
    unread: i < 6,
    labels: [],
    attachments: [],
    trackers: [],
    replyLater: false,
    setAside: false,
    bubbleUpAt: null,
    remindAt: null,
    deletedAt: null,
  }));
  return { accounts: [account], contacts, messages, events: [] };
}

async function boot(page: Page): Promise<void> {
  await page.addInitScript((data) => {
    sessionStorage.setItem("__sendpalm_e2e_seed", JSON.stringify(data));
  }, seed());
  await page.goto("/");
  await page.locator("body.app-ready").waitFor({ timeout: 15_000 });
  await page.evaluate(() => window.__sendpalmE2E?.__seedReady);
}

/** Anything that pushes the page wider than the phone, or sticks out of it. */
async function overflowReport(page: Page) {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const docScroll = document.documentElement.scrollWidth;
    const offenders: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") continue;
      if (style.position === "fixed" && style.pointerEvents === "none") continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      // 1px tolerance for sub-pixel rounding.
      if (r.right > vw + 1 || r.left < -1) {
        const name = `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${
          el.dataset?.syncPopover !== undefined ? "[data-sync-popover]" : ""
        }`;
        offenders.push(`${name} left=${Math.round(r.left)} right=${Math.round(r.right)} vw=${vw}`);
        if (offenders.length > 5) break;
      }
    }
    return { vw, docScroll, offenders };
  });
}

const VIEWS = [
  "imbox",
  "feed",
  "paperTrail",
  "screener",
  "contacts",
  "companies",
  "calendar",
  "tasks",
  "files",
  "drafts",
  "insights",
  "settings",
];

test.describe("mobile UI audit (iPhone 13 · 390x844)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("every view fits the phone width", async ({ page }) => {
    await boot(page);
    for (const view of VIEWS) {
      const nav = page.locator(`[data-nav-view="${view}"]`).first();
      if ((await nav.count()) === 0) continue;
      await nav.click();
      await page.waitForTimeout(400);
      const report = await overflowReport(page);
      expect
        .soft(report.docScroll, `${view}: the page scrolls sideways`)
        .toBeLessThanOrEqual(report.vw + 1);
      expect
        .soft(report.offenders, `${view}: elements outside the viewport`).toEqual([]);
    }
  });

  test("overlays stay inside the viewport and above the content", async ({ page }) => {
    await boot(page);

    const overlays: [string, string][] = [
      ["[data-sync-badge]", "[data-sync-popover]"],
      ['button[aria-label="通知"]', "[data-notification-panel]"],
      ['button[aria-label="账户与设置"]', '[role="menu"]'],
    ];

    for (const [trigger, panel] of overlays) {
      const btn = page.locator(trigger).first();
      if ((await btn.count()) === 0) continue;
      await btn.click();
      const el = page.locator(panel).first();
      if ((await el.count()) === 0) continue;
      await expect(el).toBeVisible();
      const box = await el.boundingBox();
      expect(box, `${panel} has no box`).not.toBeNull();
      // Fully on screen: this is the bug that shipped (a 280px panel anchored
      // right:0 to a pill near the left edge ran off the screen).
      expect.soft(box!.x, `${panel} starts left of the viewport`).toBeGreaterThanOrEqual(-1);
      expect
        .soft(box!.x + box!.width, `${panel} runs past the right edge`)
        .toBeLessThanOrEqual(391);
      expect.soft(box!.y, `${panel} starts above the viewport`).toBeGreaterThanOrEqual(-1);
      // And it must own its pixels (not be painted under a panel).
      const owns = await el.evaluate((node) => {
        const r = node.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !!hit && node.contains(hit);
      });
      expect(owns, `${panel} is covered by something else`).toBe(true);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(200);
    }
  });

  test("tap targets are at least 44x44", async ({ page }) => {
    await boot(page);
    const small = await page.evaluate(() => {
      const out: string[] = [];
      for (const el of Array.from(
        document.querySelectorAll<HTMLElement>('button, [role="button"], a[href]'),
      )) {
        const style = getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        // Text links inside paragraphs are exempt (WCAG 2.5.8 exception).
        const isInlineLink = el.tagName === "A" && el.closest("p, li, span") !== null;
        if (isInlineLink) continue;
        if (r.width < 44 || r.height < 44) {
          out.push(
            `${el.tagName.toLowerCase()} "${(el.textContent ?? "").trim().slice(0, 18)}" ${Math.round(r.width)}x${Math.round(r.height)}`,
          );
        }
        if (out.length > 8) break;
      }
      return out;
    });
    expect.soft(small, "tap targets under 44px").toEqual([]);
  });

  test("form fields use at least 16px text (iOS zoom guard)", async ({ page }) => {
    await boot(page);
    await page.locator('[data-nav-view="settings"]').first().click();
    await page.waitForTimeout(400);
    const tooSmall = await page.evaluate(() => {
      const out: string[] = [];
      for (const el of Array.from(
        document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
          "input, textarea, select",
        ),
      )) {
        const style = getComputedStyle(el);
        if (style.display === "none") continue;
        const size = parseFloat(style.fontSize || "0");
        if (size > 0 && size < 16) {
          out.push(`${el.tagName.toLowerCase()} "${el.getAttribute("placeholder") ?? el.type}" ${size}px`);
        }
        if (out.length > 8) break;
      }
      return out;
    });
    expect.soft(tooSmall, "inputs under 16px zoom on iOS").toEqual([]);
  });

  test("no hover-only affordances on touch", async ({ page }) => {
    await boot(page);
    // A control that only exists behind :hover is unreachable on a phone.
    const hiddenByHover = await page.evaluate(() => {
      let count = 0;
      const sheets = Array.from(document.styleSheets);
      for (const sheet of sheets) {
        let rules: CSSRuleList;
        try {
          rules = sheet.cssRules;
        } catch {
          continue;
        }
        for (const rule of Array.from(rules)) {
          const text = rule.cssText ?? "";
          if (!text.includes(":hover")) continue;
          if (text.includes("@media") || text.includes("hover: hover")) continue;
          // A `display: none` inside a :hover block means touch users never see it.
          if (/display:\s*none/.test(text)) count += 1;
        }
      }
      return count;
    });
    expect.soft(hiddenByHover, "rules hiding controls behind :hover").toBe(0);
  });
});
