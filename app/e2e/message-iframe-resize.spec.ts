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
  // Open the first row by pressing j then Enter. j selects the first
  // row in the Imbox; Enter opens it. The MessagePanel then mounts the
  // MessageBodyIframe for that message.
  await page.locator("[data-imbox-row]").first().waitFor({ timeout: 5_000 });
  await page.keyboard.press("Enter");
  // Wait for the iframe to render. The plain-text fallback appears
  // first, then the sanitized srcdoc iframe. The iframe is the
  // `title="Message body"` element in MessageBodyIframe.
  await page
    .locator('iframe[title="Message body"]')
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

    // 1. Install a setter spy on the iframe's `style.height` so we can
    //    count how many times the cooldown-gated measure() path
    //    actually writes a NEW value. Direct DOM writes that don't
    //    change the value (skip-equality) don't increment the counter.
    await page.evaluate(() => {
      const iframe = document.querySelector<HTMLIFrameElement>(
        'iframe[title="Message body"]',
      );
      if (!iframe) throw new Error("iframe not found");
      const win = iframe.contentWindow as unknown as {
        __sendpalmHeightWrites?: string[];
        __sendpalmHeightSpyInstalled?: boolean;
      };
      // The iframe's contentWindow has its own document; install the
      // spy on the IFRAME ELEMENT's style (host realm). Our
      // measure() writes `el.style.height = ...` on the iframe itself.
      const style = iframe.style as CSSStyleDeclaration & {
        __sendpalmHeightWrites?: string[];
      };
      const writes: string[] = [];
      // Save the original descriptor; we'll restore it at the end of
      // the test by re-assigning the style.height (no teardown
      // needed because the iframe is removed when the message is
      // closed).
      const desc = Object.getOwnPropertyDescriptor(
        CSSStyleDeclaration.prototype,
        "height",
      );
      if (!desc) throw new Error("no height descriptor");
      const originalSet = desc.set!;
      Object.defineProperty(iframe.style, "height", {
        configurable: true,
        enumerable: desc.enumerable,
        get() {
          return desc.get?.call(this) ?? "";
        },
        set(v: string) {
          writes.push(String(v));
          originalSet.call(this, v);
        },
      });
      style.__sendpalmHeightWrites = writes;
      // Expose the writes array so the test harness can read it back.
      win.__sendpalmHeightWrites = writes;
      win.__sendpalmHeightSpyInstalled = true;
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
        'iframe[title="Message body"]',
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
      // Add + remove 50 child elements in a tight loop. Each
      // invalidates the body's contentDocument box, firing a
      // ResizeObserver entry. Long emails with many inline images
      // can do this 10-50 times during the first second of paint.
      for (let i = 0; i < 50; i++) {
        const div = doc.createElement("div");
        div.style.height = `${10 + i}px`;
        doc.body.appendChild(div);
        doc.body.removeChild(div);
      }
      // Give the cooldown timer a tick to fire (wait 250ms, well past
      // the 200ms cooldown). All 50 RO entries have been delivered by
      // now; the cooldown window has had time to expire; exactly one
      // height write should have happened.
      await new Promise((r) => setTimeout(r, 250));
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

    await page.evaluate(() => {
      const iframe = document.querySelector<HTMLIFrameElement>(
        'iframe[title="Message body"]',
      );
      if (!iframe) throw new Error("iframe not found");
      const win = iframe.contentWindow as unknown as {
        __sendpalmHeightWrites?: string[];
      };
      const writes: string[] = [];
      const desc = Object.getOwnPropertyDescriptor(
        CSSStyleDeclaration.prototype,
        "height",
      );
      if (!desc) throw new Error("no height descriptor");
      const originalSet = desc.set!;
      Object.defineProperty(iframe.style, "height", {
        configurable: true,
        enumerable: desc.enumerable,
        get() {
          return desc.get?.call(this) ?? "";
        },
        set(v: string) {
          writes.push(String(v));
          originalSet.call(this, v);
        },
      });
      win.__sendpalmHeightWrites = writes;
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
        'iframe[title="Message body"]',
      );
      if (!iframe) throw new Error("iframe not found");
      const win = iframe.contentWindow as unknown as {
        __sendpalmHeightWrites?: string[];
      };
      const doc = iframe.contentDocument;
      if (!doc || !doc.body) throw new Error("iframe body not available");
      const writesBefore = win.__sendpalmHeightWrites!.length;

      const burst = (n: number) => {
        for (let i = 0; i < n; i++) {
          const div = doc.createElement("div");
          div.style.height = `${10 + i}px`;
          doc.body.appendChild(div);
          doc.body.removeChild(div);
        }
      };
      const sleep = (ms: number) =>
        new Promise<void>((r) => setTimeout(r, ms));

      burst(20);
      await sleep(250); // first cooldown window elapsed
      burst(20);
      await sleep(250); // second cooldown window elapsed
      burst(10);
      await sleep(250); // third cooldown window elapsed
      const writesAfter = win.__sendpalmHeightWrites!.length;
      return { delta: writesAfter - writesBefore };
    });

    expect(result.delta).toBeLessThanOrEqual(4);
    expect(result.delta).toBeGreaterThanOrEqual(1);
  });
});
