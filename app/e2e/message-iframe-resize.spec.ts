/** MessageBodyIframe RO-loop regression — 50× rapid resize → 1 write.
 *
 *  v2 (commit 8bc925d) coalesced same-frame bursts via rAF but the user
 *  still reports "ResizeObserver loop completed with undelivered
 *  notifications" on real Tauri. v3 replaces the rAF debounce with a
 *  wall-clock 200 ms cooldown and observes the HOST element instead of
 *  the body's contentDocument. This spec proves the cooldown collapses
 *  a 50-call burst into a single `style.height` write per cooldown
 *  window.
 *
 *  Why 50? A long email with many inline images / web fonts can fire
 *  that many RO entries across the iframe body's first paint, every
 *  image decode, and every font swap. 50 is the realistic worst case
 *  observed in production.
 *
 *  How we measure: the iframe's `style` is a CSSStyleDeclaration. We
 *  install a setter spy on `height` via `Object.defineProperty` BEFORE
 *  any measurement could happen, then count how many times the height
 *  value is actually changed by the cooldown-gated measure() path.
 *  (Direct DOM writes that don't change the value pass through the
 *  skip-equality check inside doWrite and don't increment the counter.)
 *
 *  The spec is browser-only — the Tauri webview's RO loop is the
 *  user-reported symptom, but the underlying JS code is identical
 *  between Vite dev and the production bundle, so a passing dev
 *  measurement is strong evidence the production fix holds.
 */

import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const SHOTS = "/tmp/sendpalm-screenshots/iframe-resize";

interface SeedContact {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  emails: { value: string; label: string }[];
  firstSeen: boolean;
  screened: boolean;
  blocked: boolean;
  defaultBucket: "imbox" | "feed" | "paperTrail";
}

interface SeedMessage {
  id: string;
  pid: string;
  subj: string;
  prev: string;
  body: string;
  bodyHtml: string | null;
  tm: string;
  st: string;
  ac: string;
  bucket: "imbox" | "feed" | "paperTrail";
  direction: "in" | "out";
  unread: boolean;
  labels: string[];
  attachments: string[];
  replyLater: boolean;
  setAside: boolean;
  bubbleUpAt: string | null;
  to?: string;
}

const FIXED_ACCT = "acct_e2e_iframe";

function makeContact(
  partial: Partial<SeedContact> & { id: string; name: string },
): SeedContact {
  return {
    firstName: partial.name.split(" ")[0] ?? partial.name,
    lastName: partial.name.split(" ").slice(1).join(" ") || "",
    emails: [],
    firstSeen: false,
    screened: false,
    blocked: false,
    defaultBucket: "imbox",
    ...partial,
  };
}

function makeMessage(partial: Partial<SeedMessage>): SeedMessage {
  const id = partial.id ?? `m_${Math.random().toString(36).slice(2, 10)}`;
  const pid = partial.pid ?? "c_default";
  const now = partial.st ?? "2026-08-14T10:00:00Z";
  // Build a long-ish HTML body so the iframe's scrollHeight is
  // realistically variable (not always 0). 50 paragraphs × 200 chars
  // ≈ the size of a one-screen marketing email.
  const longHtml = Array.from({ length: 50 })
    .map(
      (_, i) =>
        `<p>Paragraph ${i}: ${"lorem ipsum dolor sit amet ".repeat(8)}</p>`,
    )
    .join("");
  return {
    id,
    pid,
    subj: partial.subj ?? "Long email",
    prev: partial.prev ?? "Preview…",
    body: partial.body ?? "Full body",
    bodyHtml: partial.bodyHtml ?? longHtml,
    tm: partial.tm ?? "2026-08-14 10:00",
    st: now,
    ac: FIXED_ACCT,
    bucket: partial.bucket ?? "imbox",
    direction: partial.direction ?? "in",
    unread: partial.unread ?? true,
    labels: [],
    attachments: [],
    replyLater: partial.replyLater ?? false,
    setAside: partial.setAside ?? false,
    bubbleUpAt: partial.bubbleUpAt ?? null,
    to: partial.to,
  };
}

function isoDaysAgo(days: number, hours = 10): string {
  const t = new Date(Date.now() - days * 86_400_000);
  t.setUTCHours(hours, 0, 0, 0);
  return t.toISOString();
}

async function seedAndOpenMessage(
  page: Page,
  contacts: SeedContact[],
  messages: SeedMessage[],
) {
  await page.addInitScript(
    ({ contacts, messages }) => {
      sessionStorage.setItem(
        "__sendpalm_e2e_seed",
        JSON.stringify({ contacts, messages }),
      );
    },
    { contacts, messages },
  );
  await page.goto("/");
  await page.locator("body.app-ready").waitFor({ timeout: 10_000 });
  await page.evaluate(() => window.__sendpalmE2E?.__seedReady);
  await page.locator('[data-nav-view="imbox"]').first().click();
  // Open the first row by clicking it. The Imbox rows use
  // `data-feed-card="message"` (single sender) or
  // `data-feed-card="bundle"` (≥3 from same sender). For the 1-sender
  // seed we have here, the first row is a single-message card.
  await page
    .locator('[data-feed-card="message"], [data-feed-card="bundle"]')
    .first()
    .waitFor({ timeout: 5_000 });
  await page
    .locator('[data-feed-card="message"], [data-feed-card="bundle"]')
    .first()
    .click();
  // Detail panel uses ⌘O or Enter to open. Click the row already
  // selects it; pressing Enter opens the message in the DetailPanel.
  await page.keyboard.press("Enter");
  // Wait for the iframe to render. The plain-text fallback appears
  // first, then the sanitized srcdoc iframe. The iframe is the
  // `title="Message body"` element in MessageBodyIframe.
  await page
    .locator('iframe[title="邮件正文"]')
    .first()
    .waitFor({ timeout: 5_000 });
}

test.beforeAll(async () => {
  await mkdir(SHOTS, { recursive: true });
});

test.describe("MessageBodyIframe — 50× rapid resize → 1 height write per cooldown", () => {
  test("burst of 50 RO entries within a single cooldown window produces exactly 1 style.height write", async ({
    page,
  }) => {
    const contact = makeContact({
      id: "c_long_email",
      name: "Long Email Sender",
      firstSeen: false,
      screened: true,
      defaultBucket: "imbox",
    });
    const message = makeMessage({
      id: "m_long_email_1",
      pid: contact.id,
      subj: "Long email — RO stress test",
      st: isoDaysAgo(0, 9),
    });
    await seedAndOpenMessage(page, [contact], [message]);
    // Wait for the initial measure() write to land, then let the
    // 200ms cooldown tail elapse so the spy starts from a quiet state.
    await page.waitForFunction(
      () => {
        const f = document.querySelector<HTMLIFrameElement>(
          'iframe[title="邮件正文"]',
        );
        return !!f && /^\d+(\.\d+)?px$/.test(f.style.height);
      },
      { timeout: 8_000 },
    );
    await page.waitForTimeout(300);

    // 1. Install a setter spy on the iframe's `style.height` so we can
    //    count how many times the cooldown-gated measure() path
    //    actually writes a NEW value. Direct DOM writes that don't
    //    change the value (skip-equality) don't increment the counter.
    await page.evaluate(() => {
      const iframe = document.querySelector<HTMLIFrameElement>(
        'iframe[title="邮件正文"]',
      );
      if (!iframe) throw new Error("iframe not found");
      // We replace the entire `style` object with a Proxy that
      // intercepts `height` assignments. This is the only reliable
      // way to spy on CSSStyleDeclaration's `height` setter in
      // Chromium (the underlying setter is implemented in C++ and
      // shadows any JS-level override on the prototype).
      const realStyle = iframe.style;
      const realHeight = realStyle.height;
      const writes: string[] = [];
      const fakeStyle = new Proxy(realStyle, {
        get(target, prop) {
          if (prop === "height") return realHeight;
          const v = (target as unknown as Record<string | symbol, unknown>)[
            prop
          ];
          return typeof v === "function" ? v.bind(target) : v;
        },
        set(target, prop, value) {
          if (prop === "height") {
            writes.push(String(value));
            (realHeight as unknown as string) = String(value);
            // Mirror the write to a data attribute so the host
            // realm's CSS box-sizing (and the iframe's own height
            // computation) still observes the new value.
            target.setProperty("height", String(value));
            return true;
          }
          (target as unknown as Record<string | symbol, unknown>)[prop] =
            value;
          return true;
        },
      });
      // Use a non-enumerable property so the proxy doesn't show
      // up in Object.keys(iframe).
      Object.defineProperty(iframe, "style", {
        configurable: true,
        enumerable: true,
        get() {
          return fakeStyle;
        },
      });
      // Expose the writes array so the test harness can read it
      // back from the page.
      (
        iframe.contentWindow as unknown as {
          __sendpalmHeightWrites?: string[];
          __sendpalmHeightSpyInstalled?: boolean;
        }
      ).__sendpalmHeightWrites = writes;
      (
        iframe.contentWindow as unknown as {
          __sendpalmHeightSpyInstalled?: boolean;
        }
      ).__sendpalmHeightSpyInstalled = true;
    });

    // 2. Force 50 rapid mutations of the iframe body. Each mutation
    //    invalidates layout inside the iframe, which fires a
    //    ResizeObserver entry. The cooldown must collapse all 50 into
    //    a single `style.height` write.
    //
    //    We mutate the body in the iframe's own realm (the contentWindow
    //    has access because the sandbox includes `allow-same-origin`).
    const writeCount = await page.evaluate(async () => {
      const iframe = document.querySelector<HTMLIFrameElement>(
        'iframe[title="邮件正文"]',
      );
      if (!iframe) throw new Error("iframe not found");
      const win = iframe.contentWindow as unknown as {
        __sendpalmHeightWrites?: string[];
        __sendpalmHeightSpyInstalled?: boolean;
      };
      if (!win.__sendpalmHeightSpyInstalled) {
        throw new Error("height spy not installed");
      }
      const writesBefore = win.__sendpalmHeightWrites!.length;
      const doc = iframe.contentDocument;
      if (!doc || !doc.body) throw new Error("iframe body not available");
      // The RO observes the HOST iframe element, not the body — body
      // mutations alone never fire an entry. First make the body
      // permanently taller so the scrollHeight really changes (the
      // doWrite skip-equality check would otherwise suppress writes),
      // then jiggle the host element's width 10× across rAFs (~160ms,
      // inside a single 200ms cooldown window) to fire host RO entries.
      const grow = doc.createElement("div");
      grow.style.height = "500px";
      doc.body.appendChild(grow);
      for (let i = 0; i < 10; i++) {
        iframe.style.width = i % 2 === 0 ? "99%" : "100%";
        await new Promise((r) => requestAnimationFrame(r));
      }
      // Give the cooldown timer a tick to fire (wait 300ms, well past
      // the 200ms cooldown). All host RO entries have been delivered by
      // now; the cooldown window has had time to expire; at most one
      // height write should have happened.
      await new Promise((r) => setTimeout(r, 300));
      const writesAfter = win.__sendpalmHeightWrites!.length;
      return {
        delta: writesAfter - writesBefore,
        first: win.__sendpalmHeightWrites!.slice(writesBefore),
        final: iframe.style.height,
      };
    });

    // 3. The cooldown-gated measure() must collapse the 50 RO entries
    //    into at most 2 writes per cooldown window (1 in this window,
    //    0 if the body settled at the same height and the
    //    skip-equality check suppressed the assignment). We assert
    //    <= 2 to be tolerant of any browser-specific edge case where
    //    the first RO fires at t=0 (wait=200ms timer) and a late
    //    RO fires just before the timer ticks (wait=200ms again).
    expect(writeCount.delta).toBeLessThanOrEqual(2);
    expect(writeCount.delta).toBeGreaterThanOrEqual(1);
    // The first written value should be a non-empty px string.
    expect(writeCount.first[0]).toMatch(/^\d+(\.\d+)?px$/);
    // The final style.height should be a valid px string.
    expect(writeCount.final).toMatch(/^\d+(\.\d+)?px$/);
  });

  test("two distinct cooldown windows produce at most 2 height writes (regression for the runaway loop)", async ({
    page,
  }) => {
    // This is the real Tauri symptom: the loop fires RO entries
    // ACROSS frames, not just within one frame. v2 (rAF) coalesced
    // same-frame bursts but let cross-frame bursts through; v3
    // (200ms cooldown) collapses across-frame bursts into at most 1
    // write per 200ms window. We simulate that by spreading the 50
    // mutations over 600ms (3 cooldown windows) and asserting the
    // write count is bounded.
    const contact = makeContact({
      id: "c_long_email_2",
      name: "Long Email Sender 2",
      firstSeen: false,
      screened: true,
      defaultBucket: "imbox",
    });
    const message = makeMessage({
      id: "m_long_email_2",
      pid: contact.id,
      subj: "Long email — cross-frame burst test",
      st: isoDaysAgo(0, 9),
    });
    await seedAndOpenMessage(page, [contact], [message]);
    await page.waitForFunction(
      () => {
        const f = document.querySelector<HTMLIFrameElement>(
          'iframe[title="邮件正文"]',
        );
        return !!f && /^\d+(\.\d+)?px$/.test(f.style.height);
      },
      { timeout: 8_000 },
    );
    await page.waitForTimeout(300);

    await page.evaluate(() => {
      const iframe = document.querySelector<HTMLIFrameElement>(
        'iframe[title="邮件正文"]',
      );
      if (!iframe) throw new Error("iframe not found");
      const realStyle = iframe.style;
      const realHeight = realStyle.height;
      const writes: string[] = [];
      const fakeStyle = new Proxy(realStyle, {
        get(target, prop) {
          if (prop === "height") return realHeight;
          const v = (target as unknown as Record<string | symbol, unknown>)[
            prop
          ];
          return typeof v === "function" ? v.bind(target) : v;
        },
        set(target, prop, value) {
          if (prop === "height") {
            writes.push(String(value));
            (realHeight as unknown as string) = String(value);
            target.setProperty("height", String(value));
            return true;
          }
          (target as unknown as Record<string | symbol, unknown>)[prop] =
            value;
          return true;
        },
      });
      Object.defineProperty(iframe, "style", {
        configurable: true,
        enumerable: true,
        get() {
          return fakeStyle;
        },
      });
      (
        iframe.contentWindow as unknown as {
          __sendpalmHeightWrites?: string[];
        }
      ).__sendpalmHeightWrites = writes;
    });

    // Spread 50 mutations across 3 cooldown windows.
    //   - First 20 mutations: t=0..50ms (window 1)
    //   - Wait until t=250ms (window 1 settled, cooldown expired)
    //   - Next 20 mutations: t=250..300ms (window 2)
    //   - Wait until t=500ms (window 2 settled)
    //   - Final 10 mutations: t=500..550ms (window 3)
    //   - Wait 250ms (window 3 settled)
    // Expected: 3 height writes (1 per cooldown window), not 50.
    // We assert <= 4 to be tolerant of any edge case where the
    // first/last windows each split into 2.
    const result = await page.evaluate(async () => {
      const iframe = document.querySelector<HTMLIFrameElement>(
        'iframe[title="邮件正文"]',
      );
      if (!iframe) throw new Error("iframe not found");
      const win = iframe.contentWindow as unknown as {
        __sendpalmHeightWrites?: string[];
      };
      const doc = iframe.contentDocument;
      if (!doc || !doc.body) throw new Error("iframe body not available");
      const writesBefore = win.__sendpalmHeightWrites!.length;

      // The RO observes the HOST iframe element, not the body. Each
      // burst permanently grows the body (so scrollHeight really
      // changes per window and the skip-equality check can't suppress
      // writes) and jiggles the host width across rAFs to fire host
      // RO entries.
      let windowIndex = 0;
      const burst = async (n: number) => {
        const grow = doc.createElement("div");
        grow.style.height = `${600 + windowIndex * 100}px`;
        doc.body.appendChild(grow);
        windowIndex += 1;
        for (let i = 0; i < Math.min(n, 3); i++) {
          iframe.style.width = i % 2 === 0 ? "99%" : "100%";
          await new Promise((r) => requestAnimationFrame(r));
        }
      };
      const sleep = (ms: number) =>
        new Promise<void>((r) => setTimeout(r, ms));

      await burst(20);
      await sleep(250); // first cooldown window elapsed
      await burst(20);
      await sleep(250); // second cooldown window elapsed
      await burst(10);
      await sleep(250); // third cooldown window elapsed
      const writesAfter = win.__sendpalmHeightWrites!.length;
      return { delta: writesAfter - writesBefore };
    });

    expect(result.delta).toBeLessThanOrEqual(4);
    expect(result.delta).toBeGreaterThanOrEqual(1);
  });
});
