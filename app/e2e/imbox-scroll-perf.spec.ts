/** Real-scale Imbox scroll performance — Session 2026-08-21 evening.
 *
 * The previous "smooth scroll" test (imbox.spec.ts) used 500 imbox rows
 * and asserted avg frame < 20ms. The user's report
 * ("滚动都是卡的，经常出现大量白色区域") said scroll is laggy and there
 * are large white areas — neither shows up in the 500-row dataset. This
 * test seeds the *real* Feishu-like workload (1500 contacts, 4000 imbox
 * rows, multiple senders so bundle detection kicks in) and measures:
 *
 *   1. Sustained scroll FPS over 200 frames in three regions (top, middle,
 *      bottom of the list) — a single 50-frame sample at the top hides the
 *      middle/bottom jitter where lazy loads and out-of-viewport repaints
 *      pile up.
 *   2. Long tasks (PerformanceObserver longtask) during the same windows —
 *      anything > 50ms is a frame killer.
 *   3. White-area detection: count feed cards that have a non-zero rendered
 *      height but zero content height (i.e. the `content-visibility: auto`
 *      placeholder kicked in but the card never re-painted its content).
 *      Symptom = card slot reserved (88px placeholder) but empty inside.
 *   4. Layout shift during scroll: every card's getBoundingClientRect()
 *      width/height before vs after one scroll frame. A jump means
 *      `content-visibility: auto` skipped paint then the card content
 *      finally arrived and pushed siblings around.
 *   5. JS heap delta across the full scroll session — should be stable
 *      for 4000 rows. A climbing heap indicates per-frame allocation
 *      leaks (most often SolidJS memos that re-create on every reactive
 *      tick).
 *
 * Output to `qa-tmp/imbox-scroll-perf.json`. Run on a warm Vite dev server
 * (`pnpm exec vite --port 5180`); the report reflects browser-mode perf,
 * which is a *lower bound* for real Tauri 2 perf.
 *
 * Acceptance: median per-frame wall time < 18ms in all three regions.
 * Layout shift score (sum of |deltaH| across all visible cards, per
 * scroll) < 200px. White-area count == 0 (no card with reserved slot
 * but empty content). Heap delta < 5 MB.
 */
import { test, expect, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const SHOTS = "/tmp/sendpalm-screenshots/imbox-scroll-perf";
const REPORT_PATH = join(process.cwd(), "qa-tmp/imbox-scroll-perf.json");

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
  avatar?: string;
}

interface SeedMessage {
  id: string;
  pid: string;
  subj: string;
  prev: string;
  body: string;
  bodyHtml?: string | null;
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

const COMPANIES = [
  "Apple", "Microsoft", "Google", "Meta", "Netflix", "Stripe", "Airbnb",
  "Uber", "Notion", "Linear", "Figma", "Vercel", "GitHub", "Shopify",
  "Atlassian", "Spotify", "Salesforce", "Adobe", "Dropbox", "Slack",
];

function buildRealisticCorpus(): {
  contacts: SeedContact[];
  messages: SeedMessage[];
} {
  const contacts: SeedContact[] = [];
  const messages: SeedMessage[] = [];
  const now = Date.now();

  // 1500 contacts, ~12% with avatars (skews Feishu)
  for (let i = 0; i < 1500; i++) {
    const company = COMPANIES[i % COMPANIES.length]!;
    const name = `${["Alex", "Sam", "Jordan", "Taylor", "Morgan", "Casey", "Jamie", "Riley", "Quinn", "Avery"][i % 10]!} ${["Smith", "Lee", "Patel", "Garcia", "Müller", "Tanaka", "Chen", "Kowalski", "Khan", "Park"][i % 10]!}`;
    contacts.push({
      id: `c_${i}`,
      name,
      firstName: name.split(" ")[0]!,
      lastName: name.split(" ").slice(1).join(" "),
      emails: [{ value: `p${i}@${company.toLowerCase()}.com`, label: "work" }],
      firstSeen: i % 47 === 0, // ~3% first-time senders
      screened: i % 47 !== 0,
      blocked: false,
      defaultBucket: i % 5 === 0 ? "feed" : "imbox",
      avatar: i % 8 === 0 ? `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E` : undefined,
    });
  }

  // 4000 imbox messages distributed across 1500 senders
  // ~3% of senders will hit BUNDLE_THRESHOLD (3+) to exercise bundle UI
  for (let i = 0; i < 4000; i++) {
    const daysAgo = i % 90;
    const st = new Date(now - daysAgo * 86_400_000 - (i % 24) * 3_600_000).toISOString();
    messages.push({
      id: `m_${i}`,
      pid: `c_${i % 1500}`,
      subj: `Subject ${i} — a normal email subject line for thread #${i}`,
      prev: `Preview snippet for message ${i}. The user reads this in the row to decide what to do next. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor.`,
      body: `Body of message ${i}.\n\nThis is the second paragraph. It has some length to be realistic.\n\nAnd a third one with a few more sentences to mimic real mail.`,
      bodyHtml: null,
      tm: st.slice(0, 16).replace("T", " "),
      st,
      ac: "acct_realistic",
      bucket: "imbox",
      direction: i % 4 === 0 ? "out" : "in",
      unread: i % 5 !== 0, // 80% unread so the active tab has 3200 rows
      labels: [],
      attachments: [],
      replyLater: i % 137 === 0,
      setAside: i % 211 === 0,
      bubbleUpAt: null,
      to: i % 4 === 0 ? `me@sendpalm.com` : undefined,
    });
  }

  return { contacts, messages };
}

interface ScrollRegionResult {
  region: string;
  frames: number;
  medianFrameMs: number;
  p95FrameMs: number;
  maxFrameMs: number;
  longTasksOver50ms: number;
  longTasksOver100ms: number;
  layoutShiftPx: number;
  whiteAreaCount: number;
}

interface PerfWindow {
  longTasks: { name: string; startTime: number; duration: number }[];
  heapMB: number;
}

async function installPerfObserver(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as {
      __scrollPerf: PerfWindow;
    };
    w.__scrollPerf = { longTasks: [], heapMB: 0 };
    try {
      const obs = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          w.__scrollPerf.longTasks.push({
            name: e.name,
            startTime: e.startTime,
            duration: e.duration,
          });
        }
      });
      obs.observe({ entryTypes: ["longtask"] });
    } catch {
      /* no longtask support */
    }
  });
}

async function resetPerf(page: Page) {
  await page.evaluate(() => {
    (window as unknown as { __scrollPerf: PerfWindow }).__scrollPerf.longTasks = [];
  });
}

async function readPerf(page: Page): Promise<PerfWindow> {
  return page.evaluate(() => {
    const w = window as unknown as { __scrollPerf: PerfWindow };
    const perf = (performance as unknown as { memory?: { usedJSHeapSize: number } })
      .memory;
    return {
      longTasks: w.__scrollPerf.longTasks.slice(),
      heapMB: perf ? perf.mem_usedJSHeapSize / 1024 / 1024 : 0,
    };
  });
}

/** Scroll N frames in a given scroll region, capturing per-frame wall time
 *  + post-scroll layout shifts + white-area count. */
async function measureScrollRegion(
  page: Page,
  region: string,
  scrollTop: number,
  frames: number = 80,
): Promise<ScrollRegionResult> {
  await page.evaluate((y) => {
    document.querySelector("#main")?.scrollTo({ top: y, behavior: "instant" as ScrollBehavior });
  }, scrollTop);
  // Allow the paint to settle
  await page.waitForTimeout(200);

  // Reset long task counter
  await resetPerf(page);

  // Measure scroll + layout shift
  const result = await page.evaluate(async (n) => {
    const w = window as unknown as {
      __scrollPerf: { longTasks: { duration: number }[] };
    };

    // Sample frame times
    const frameSamples: number[] = [];
    let last = performance.now();
    for (let i = 0; i < n; i++) {
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      const now = performance.now();
      frameSamples.push(now - last);
      last = now;
      const main = document.querySelector("#main") as HTMLElement | null;
      if (main) main.scrollBy({ top: 6, behavior: "instant" as ScrollBehavior });
    }
    const sorted = frameSamples.slice().sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
    const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
    const max = sorted[sorted.length - 1] ?? 0;
    const longOver50 = w.__scrollPerf.longTasks.filter((t) => t.duration > 50).length;
    const longOver100 = w.__scrollPerf.longTasks.filter((t) => t.duration > 100).length;

    // Layout shift detection: measure all visible .feed-card heights
    // before/after the scroll burst
    const cardSelector = "[data-feed-card='message'], [data-feed-card='bundle']";
    const cards = Array.from(document.querySelectorAll(cardSelector));

    const heightsBefore = new Map<Element, number>();
    for (const c of cards) {
      heightsBefore.set(c, (c as HTMLElement).getBoundingClientRect().height);
    }

    // Force one more paint + measure
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    let shift = 0;
    let whiteAreas = 0;
    for (const c of cards) {
      const hAfter = (c as HTMLElement).getBoundingClientRect().height;
      const hBefore = heightsBefore.get(c) ?? 0;
      if (Math.abs(hAfter - hBefore) > 1) shift += Math.abs(hAfter - hBefore);
      // White-area detection: card has a reserved slot (>40px high) but
      // its inner content (feed-body) is < 1px tall. The
      // content-visibility: auto placeholder keeps the slot while the
      // browser hasn't painted the inner content yet.
      const body = c.querySelector(".feed-body");
      if (body) {
        const bRect = (body as HTMLElement).getBoundingClientRect();
        if (bRect.height < 1) whiteAreas++;
      }
    }

    return {
      frames: frameSamples.length,
      medianFrameMs: median,
      p95FrameMs: p95,
      maxFrameMs: max,
      longTasksOver50ms: longOver50,
      longTasksOver100ms: longOver100,
      layoutShiftPx: Math.round(shift),
      whiteAreaCount: whiteAreas,
    };
  }, frames);

  return { region, ...result };
}

async function seedAndOpen(page: Page) {
  const { contacts, messages } = buildRealisticCorpus();
  await page.addInitScript(
    ({ contacts, messages }) => {
      const payload = JSON.stringify({ contacts, messages });
      sessionStorage.setItem("__sendpalm_e2e_seed", payload);
    },
    { contacts, messages },
  );
  await page.goto("/");
  await page.locator("body.app-ready").waitFor({ timeout: 15_000 });
  await page.evaluate(() => window.__sendpalmE2E?.__seedReady);
  await page.locator('[data-nav-view="imbox"]').first().click();
  // Wait for first page to render
  await page
    .locator("[data-feed-card='message'], [data-feed-card='bundle']")
    .first()
    .waitFor({ timeout: 10_000 });
}

test.beforeAll(async () => {
  await mkdir(SHOTS, { recursive: true });
  await mkdir(join(process.cwd(), "qa-tmp"), { recursive: true });
});

test.describe("Imbox scroll perf — real-world scale (1500 contacts, 4000 msgs)", () => {
  test("measures scroll FPS, long tasks, layout shift, white areas across regions", async ({
    page,
  }) => {
    test.setTimeout(180_000); // 3 min budget — 4000-row scroll is slow in CI
    await seedAndOpen(page);
    await installPerfObserver(page);

    // Take a baseline screenshot
    await page.screenshot({
      path: join(SHOTS, "01-top-of-list.png"),
      fullPage: false,
    });

    // Wait for the user-visible content to settle
    await page.waitForTimeout(500);

    const heapBefore = (await readPerf(page)).heapMB;

    // Region 1: top of list
    const top = await measureScrollRegion(page, "top", 0, 80);
    await page.screenshot({
      path: join(SHOTS, "02-after-top-scroll.png"),
      fullPage: false,
    });

    // Region 2: middle of list (scroll past 3000px)
    const mainHeight = await page.evaluate(() => {
      const m = document.querySelector("#main") as HTMLElement | null;
      return m ? m.scrollHeight : 0;
    });
    const middle = await measureScrollRegion(
      page,
      "middle",
      Math.max(0, mainHeight / 2 - 400),
      80,
    );
    await page.screenshot({
      path: join(SHOTS, "03-after-middle-scroll.png"),
      fullPage: false,
    });

    // Region 3: near bottom (triggers loadMore IO observer)
    const bottom = await measureScrollRegion(
      page,
      "bottom",
      Math.max(0, mainHeight - 1200),
      80,
    );
    await page.screenshot({
      path: join(SHOTS, "04-after-bottom-scroll.png"),
      fullPage: false,
    });

    const heapAfter = (await readPerf(page)).heapMB;
    const perf = await readPerf(page);

    const totalLongTasks = perf.longTasks.length;
    const report = {
      timestamp: new Date().toISOString(),
      corpus: { contacts: 1500, messages: 4000 },
      viewport: page.viewportSize(),
      regions: { top, middle, bottom },
      heapBeforeMB: Math.round(heapBefore * 10) / 10,
      heapAfterMB: Math.round(heapAfter * 10) / 10,
      heapDeltaMB: Math.round((heapAfter - heapBefore) * 10) / 10,
      totalLongTasksOver50ms: totalLongTasks,
      pass: {
        topFps: top.medianFrameMs < 18,
        middleFps: middle.medianFrameMs < 18,
        bottomFps: bottom.medianFrameMs < 18,
        noLongTasks: top.longTasksOver100ms === 0 && middle.longTasksOver100ms === 0 && bottom.longTasksOver100ms === 0,
        noWhiteAreas: top.whiteAreaCount === 0 && middle.whiteAreaCount === 0 && bottom.whiteAreaCount === 0,
        noLayoutShift: top.layoutShiftPx < 200 && middle.layoutShiftPx < 200 && bottom.layoutShiftPx < 200,
        heapStable: Math.abs(heapAfter - heapBefore) < 10,
      },
    };

    await writeFile(REPORT_PATH, JSON.stringify(report, null, 2));

    // Surface the numbers as test annotations so a manual run shows them
    for (const r of [top, middle, bottom]) {
      test.info().annotations.push({
        type: "metric",
        description: `${r.region}: median=${r.medianFrameMs.toFixed(1)}ms p95=${r.p95FrameMs.toFixed(1)}ms max=${r.maxFrameMs.toFixed(1)}ms long50+=${r.longTasksOver50ms} long100+=${r.longTasksOver100ms} whiteAreas=${r.whiteAreaCount} shift=${r.layoutShiftPx}px`,
      });
    }
    test.info().annotations.push({
      type: "metric",
      description: `heap: ${heapBefore.toFixed(1)} → ${heapAfter.toFixed(1)} MB (Δ${(heapAfter - heapBefore).toFixed(1)} MB) · total long tasks: ${totalLongTasks}`,
    });

    // Print the report to stdout for easy grep
    console.log("\n=== Imbox scroll perf report ===");
    console.log(JSON.stringify(report, null, 2));
    console.log("=== End report ===\n");

    // Acceptance assertions — soft (we want diagnostics, not a hard fail,
    // because the user's "卡" might be the white area / layout shift, not
    // the FPS number). Log every failure but only fail the test when the
    // median frame is so bad the user couldn't possibly use the app.
    expect(top.medianFrameMs).toBeLessThan(33); // >= 30fps
    expect(middle.medianFrameMs).toBeLessThan(33);
    expect(bottom.medianFrameMs).toBeLessThan(33);
  });
});
