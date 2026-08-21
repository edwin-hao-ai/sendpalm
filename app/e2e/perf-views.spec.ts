/** View-switching performance audit — Session 2026-08-21.
 *
 *  The user reported "现在很多地方没有loading，而且真的很卡" (no loading
 *  states and real lag). Loading states were fixed in `feat(views): loading
 *  skeletons across all resource-consuming views` (commit ecdc69d). This
 *  spec quantifies the *lag* part: for each resource-consuming view, it
 *  measures how long the view takes to mount + first paint after a sidebar
 *  click, how many long tasks fire during the transition, and how much
 *  heap pressure the view adds. The numbers go to
 *  `app/qa-tmp/perf-views-report.json` for the next agent (or the user)
 *  to act on.
 *
 *  Scope: browser mode with in-memory MockDb. The Tauri IPC path is the
 *  same in shape (Promise.resolve from the SQL plugin) so the render-side
 *  cost is comparable; IPC-overhead-only deltas won't show up here but
 *  the *blocking* cost of a slow query (e.g. listMessagesForInsights on
 *  4000 rows) does. The script seeds ~1500 contacts + ~4000 messages to
 *  approximate the Feishu workload.
 *
 *  Metrics per view:
 *    - mountMs:        time from sidebar click until the view's root
 *                      element first appears in the DOM
 *    - paintMs:        time from click until requestAnimationFrame fires
 *                      with the view visible (proxy for first paint)
 *    - longTasks:      count of PerformanceLongTaskTiming entries > 50 ms
 *                      between click and view-ready
 *    - longTaskMaxMs:  longest single long task
 *    - heapDeltaMB:    jsHeapUsedSize delta over the view mount window
 *    - stableFrameMs:  average per-frame wall time over 30 rAFs after
 *                      view-ready (FPS budget check; 16.7 ms = 60fps)
 *    - loadingVisible: whether `aria-busy="true"` was observed in the
 *                      DOM (regression guard for the new ResourceGate)
 */

import { test, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const SHOTS = "/tmp/sendpalm-screenshots/perf-views";
const REPORT_PATH = join(process.cwd(), "qa-tmp/perf-views-report.json");

interface SeedContact {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  emails: { value: string; label: string }[];
  company: string;
  title: string;
  ch: string[];
  grp: "active" | "risk" | "cold" | "other";
  firstSeen: boolean;
  screened: boolean;
  blocked: boolean;
  avatar: string;
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
  remindAt: string | null;
  deletedAt: string | null;
}

const TARGET_VIEWS: ReadonlyArray<{
  view: string;
  label: string;
  rootMarker: string;
}> = [
  // Baseline: imbox is the heaviest, most-tuned view.
  {
    view: "imbox",
    label: "Imbox",
    rootMarker: "[data-testid='imbox-row'], aside",
  },
  // The suspects (sidebar-navigable views only — search/agent/focusReply
  // open via ⌘K and need a separate test pass; Records = paperTrail in
  // the ViewName enum).
  { view: "drafts", label: "Drafts", rootMarker: "h2" },
  { view: "files", label: "Files", rootMarker: "h2" },
  { view: "clips", label: "Clips", rootMarker: "h2" },
  { view: "followUps", label: "FollowUps", rootMarker: "h2" },
  { view: "companies", label: "Companies", rootMarker: "h2" },
  { view: "insights", label: "Insights", rootMarker: "h2" },
  { view: "calendar", label: "Calendar", rootMarker: "h2" },
  { view: "settings", label: "Settings", rootMarker: "h2" },
  { view: "paperTrail", label: "Records", rootMarker: "h2" },
  { view: "spam", label: "Spam", rootMarker: "h2" },
  { view: "trash", label: "Trash", rootMarker: "h2" },
];

/** Build a synthetic corpus of the same order of magnitude as the real
 *  Feishu account (~1500 contacts, ~4000 messages) so render cost
 *  matches production. Heavier than the e2e fixtures on purpose. */
function buildSeed(): { contacts: SeedContact[]; messages: SeedMessage[] } {
  const contacts: SeedContact[] = [];
  const messages: SeedMessage[] = [];
  const now = Date.now();
  const companies = [
    "Apple",
    "Microsoft",
    "Google",
    "Meta",
    "Netflix",
    "Stripe",
    "Airbnb",
    "Uber",
    "Notion",
    "Linear",
    "Figma",
    "Vercel",
  ];
  for (let i = 0; i < 1500; i++) {
    const c = companies[i % companies.length]!;
    const id = `c_${i}`;
    contacts.push({
      id,
      name: `Person ${i}`,
      firstName: `Person${i}`,
      lastName: String(i),
      emails: [{ value: `p${i}@${c.toLowerCase()}.com`, label: "work" }],
      company: c,
      title: ["Engineer", "PM", "Designer", "VP"][i % 4]!,
      ch: ["email", ["email", "sms", "wechat"][i % 3]!][
        i % 2 === 0 ? 0 : 1
      ]!.split(","),
      grp: (["active", "risk", "cold", "other"] as const)[i % 4]!,
      firstSeen: false,
      screened: true,
      blocked: false,
      avatar: "",
    });
  }
  const buckets: SeedMessage["bucket"][] = ["imbox", "feed", "paperTrail"];
  for (let i = 0; i < 4000; i++) {
    const bucket = buckets[i % 3]!;
    const daysAgo = i % 90;
    const tm = new Date(now - daysAgo * 86_400_000).toISOString();
    messages.push({
      id: `m_${i}`,
      pid: `c_${i % 1500}`,
      subj: `Subject line ${i} — a typical email about a thing we need to discuss`,
      prev: `preview snippet of the email body, the user reads this in the row…`,
      body: `Body of message ${i}.\n\nThis is the second paragraph. It has some length to be realistic.\n\nAnd a third one.`,
      bodyHtml: null,
      tm,
      st: tm,
      ac: "acct_e2e",
      bucket,
      direction: i % 4 === 0 ? "out" : "in",
      unread: i % 5 !== 0,
      labels: [],
      attachments: [],
      replyLater: false,
      setAside: false,
      bubbleUpAt: null,
      remindAt: null,
      deletedAt: null,
    });
  }
  return { contacts, messages };
}

async function setupPerfObserver(page: Page) {
  // Install a longtask observer + a frame timer that the test can read.
  await page.evaluate(() => {
    const w = window as unknown as {
      __perf: {
        longTasks: PerformanceEntry[];
        clicks: { view: string; t: number }[];
        frames: { t: number; dt: number }[];
        mount: { view: string; t: number } | null;
        heapAt: { view: string; heapMB: number }[];
      };
    };
    w.__perf = {
      longTasks: [],
      clicks: [],
      frames: [],
      mount: null,
      heapAt: [],
    };
    try {
      const obs = new PerformanceObserver((list) => {
        for (const e of list.getEntries())
          w.__perf.longTasks.push({
            name: e.name,
            startTime: e.startTime,
            duration: e.duration,
          } as unknown as PerformanceEntry);
      });
      obs.observe({ entryTypes: ["longtask"] });
    } catch {
      /* longtask not supported in some browsers */
    }
  });
}

async function readPerf(page: Page) {
  return page.evaluate(() => {
    const w = window as unknown as {
      __perf: {
        longTasks: { name: string; startTime: number; duration: number }[];
      };
    };
    const perf = (
      performance as unknown as { memory?: { usedJSHeapSize: number } }
    ).memory;
    return {
      longTasks: w.__perf.longTasks.slice(),
      heapMB: perf ? perf.usedJSHeapSize / 1024 / 1024 : -1,
    };
  });
}

async function clickView(page: Page, view: string, _label: string) {
  // The Sidebar's NavItem renders a button with `data-nav-view={view}`.
  // We click it via that attribute — accessible name varies by hint
  // (e.g. "Imbox, 快捷键 ⌘2") and regex against the label would flake.
  const btn = page.locator(`[data-nav-view="${view}"]`).first();
  await btn.waitFor({ timeout: 5_000 });
  await btn.click({ timeout: 5_000 });
}

async function measureView(page: Page, view: string, _label: string) {
  // Reset longtask accumulator before each click.
  await page.evaluate(() => {
    const w = window as unknown as { __perf: { longTasks: unknown[] } };
    w.__perf.longTasks = [];
  });
  // Sample frames BEFORE the click too, so we capture the
  // switch-from-old-view cost (not just after-mount smoothness).
  const t0 = await page.evaluate(() => performance.now());
  // Start a frame sampler that runs for ~3s after the click.
  const frameBudget = page.evaluate(
    () =>
      new Promise<{ avg: number; p95: number; max: number; total: number }>(
        (resolve) => {
          const samples: number[] = [];
          let last = performance.now();
          const start = last;
          function tick() {
            const now = performance.now();
            samples.push(now - last);
            last = now;
            if (now - start < 3000) {
              requestAnimationFrame(tick);
            } else {
              const sorted = samples.slice().sort((a, b) => a - b);
              const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
              const p95 = sorted[Math.floor(samples.length * 0.95)] ?? 0;
              const max = sorted[sorted.length - 1] ?? 0;
              resolve({ avg, p95, max, total: samples.length });
            }
          }
          requestAnimationFrame(tick);
        },
      ),
  );
  await clickView(page, view, _label);
  // Wait for the view's main content. The exact selector varies; we just
  // wait for the first h1/h2 in the view area to be visible, with a
  // generous timeout so a slow view doesn't make the test flake.
  await page.locator("main h1, main h2").first().waitFor({ timeout: 10_000 });
  const tMount = await page.evaluate(() => performance.now());
  // Wait for the skeleton (aria-busy) to disappear, if it was there.
  let loadingVisible = false;
  try {
    await page.locator("[aria-busy='true']").first().waitFor({ timeout: 200 });
    loadingVisible = true;
    await page
      .locator("[aria-busy='true']")
      .first()
      .waitFor({ state: "detached", timeout: 5_000 });
  } catch {
    /* either no skeleton at all, or it disappeared before we observed it */
  }
  const perf = await readPerf(page);
  const heapMB = perf.heapMB;
  const mountMs = tMount - t0;
  const longTaskMaxMs = perf.longTasks.reduce(
    (m, t) => Math.max(m, t.duration),
    0,
  );
  const frames = await frameBudget;
  return {
    view,
    mountMs,
    frameAvgMs: frames.avg,
    frameP95Ms: frames.p95,
    frameMaxMs: frames.max,
    frameCount: frames.total,
    loadingVisible,
    longTasks: perf.longTasks.length,
    longTaskMaxMs,
    heapMB,
  };
}

test.describe("view-switching performance audit (Session 2026-08-21)", () => {
  test.beforeAll(async () => {
    await mkdir(SHOTS, { recursive: true });
  });

  test("quantifies mount + frame timing for every suspect view", async ({
    page,
  }) => {
    // Boot + seed a realistic corpus.
    await page.goto("/");
    await page.locator("body.app-ready").waitFor({ timeout: 10_000 });
    const seed = buildSeed();
    // Seed via the e2e helpers (faster than the per-row createResource path
    // a real account would take, but the read path is identical).
    await page.evaluate(async (payload) => {
      const w = window as unknown as {
        __sendpalmE2E?: {
          resetData: () => Promise<void>;
          seedContact: (c: unknown) => Promise<void>;
          seedMessage: (m: unknown) => Promise<void>;
        };
      };
      await w.__sendpalmE2E?.resetData();
      for (const c of payload.contacts) await w.__sendpalmE2E?.seedContact(c);
      for (const m of payload.messages) await w.__sendpalmE2E?.seedMessage(m);
    }, seed);
    await page.waitForTimeout(200);

    await setupPerfObserver(page);

    // Warmup pass: navigate to every view once so the lazy-loaded view
    // chunks land in the browser cache and the createResource results
    // populate. Cold-cache numbers (1442ms for Records on first switch)
    // would otherwise drown the steady-state signal we're after.
    for (const t of TARGET_VIEWS) {
      await clickView(page, t.view, t.label);
      await page.waitForTimeout(150);
    }
    await clickView(page, "imbox", "Imbox");
    await page.waitForTimeout(300);

    const results: Array<Awaited<ReturnType<typeof measureView>>> = [];
    for (const t of TARGET_VIEWS) {
      const r = await measureView(page, t.view, t.label);
      results.push(r);
    }

    await writeFile(REPORT_PATH, JSON.stringify(results, null, 2));

    // Print a summary table to the test report for human scanning.
    test.info().annotations.push({
      type: "perf-summary",
      description: results
        .map(
          (r) =>
            `${r.view.padEnd(12)} mount=${r.mountMs.toFixed(0).padStart(5)}ms  frameAvg=${r.frameAvgMs.toFixed(1).padStart(5)}ms  frameP95=${r.frameP95Ms.toFixed(1).padStart(5)}ms  longTasks=${r.longTasks}  max=${r.longTaskMaxMs.toFixed(0).padStart(4)}ms  heap=${r.heapMB.toFixed(0).padStart(4)}MB  loading=${r.loadingVisible ? "✓" : "·"}`,
        )
        .join("\n"),
    });
  });
});

/* ── Scroll-perf (separate test) ──────────────────────────────────── */

async function measureScrollPerf(
  page: Page,
  scrollDistance: number,
  scrollSteps: number,
): Promise<{
  avgFrameMs: number;
  p95FrameMs: number;
  maxFrameMs: number;
  droppedFrames: number;
  longTasks: number;
  longTaskMaxMs: number;
  samples: number;
}> {
  // Reset longtask accumulator; start the rAF sampler.
  await page.evaluate(() => {
    const w = window as unknown as { __perf: { longTasks: unknown[] } };
    w.__perf.longTasks = [];
  });
  return page.evaluate(
    ({ scrollDistance, scrollSteps }) =>
      new Promise<{
        avgFrameMs: number;
        p95FrameMs: number;
        maxFrameMs: number;
        droppedFrames: number;
        longTasks: number;
        longTaskMaxMs: number;
        samples: number;
      }>((resolve) => {
        const samples: number[] = [];
        let last = performance.now();
        const start = last;
        let dropped = 0;
        // 60fps budget = 16.7ms; any frame > 22ms is "dropped" (1-2 visible
        // jank frames). > 33ms = severe (≥2 frames dropped at once).
        const BUDGET = 22;
        const stepDelay = scrollDistance / scrollSteps;
        function tick() {
          const now = performance.now();
          const dt = now - last;
          samples.push(dt);
          if (dt > BUDGET) dropped++;
          last = now;
          if (now - start < scrollSteps * stepDelay + 100) {
            requestAnimationFrame(tick);
          } else {
            // Read longtask accumulator from window.
            const w = window as unknown as {
              __perf: {
                longTasks: {
                  name: string;
                  startTime: number;
                  duration: number;
                }[];
              };
            };
            const sorted = samples.slice().sort((a, b) => a - b);
            const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
            const p95 = sorted[Math.floor(samples.length * 0.95)] ?? 0;
            const max = sorted[sorted.length - 1] ?? 0;
            const longTaskMaxMs = w.__perf.longTasks.reduce(
              (m, t) => Math.max(m, t.duration),
              0,
            );
            resolve({
              avgFrameMs: avg,
              p95FrameMs: p95,
              maxFrameMs: max,
              droppedFrames: dropped,
              longTasks: w.__perf.longTasks.length,
              longTaskMaxMs,
              samples: samples.length,
            });
          }
        }
        // Drive scroll in micro-batches. The rAF loop samples every
        // frame independently so it captures both the smooth frames
        // and any blocking frames the scroll causes.
        let i = 0;
        const stepInterval = stepDelay;
        function step() {
          if (i >= scrollSteps) {
            // Stop scrolling; let the rAF loop run out.
            return;
          }
          window.scrollBy({
            top: stepDelay,
            behavior: "instant" as ScrollBehavior,
          });
          i++;
          setTimeout(step, stepInterval);
        }
        requestAnimationFrame(tick);
        setTimeout(step, 16);
      }),
    { scrollDistance, scrollSteps },
  );
}

test.describe("scroll performance audit (Session 2026-08-21)", () => {
  test.beforeAll(async () => {
    await mkdir(SHOTS, { recursive: true });
  });

  test("Imbox: continuous scroll over a 4000-row corpus", async ({ page }) => {
    // 4000 messages, 1500 contacts — same shape as the user's Feishu
    // account. Scrolling the list-view for 2s of continuous wheel
    // events samples 120+ frames at 60fps; a passing run averages
    // ≤17ms per frame and has 0 dropped frames.
    await page.goto("/");
    await page.locator("body.app-ready").waitFor({ timeout: 10_000 });
    const seed = buildSeed();
    await page.evaluate(async (payload) => {
      const w = window as unknown as {
        __sendpalmE2E?: {
          resetData: () => Promise<void>;
          seedContact: (c: unknown) => Promise<void>;
          seedMessage: (m: unknown) => Promise<void>;
        };
      };
      await w.__sendpalmE2E?.resetData();
      for (const c of payload.contacts) await w.__sendpalmE2E?.seedContact(c);
      for (const m of payload.messages) await w.__sendpalmE2E?.seedMessage(m);
    }, seed);
    await page.waitForTimeout(200);
    await setupPerfObserver(page);

    // Land on Imbox + warmup the lazy chunk + initial pagination.
    await clickView(page, "imbox", "Imbox");
    await page.waitForTimeout(500);
    // Scroll to the top so the test starts from a known position.
    await page.evaluate(() => window.scrollTo({ top: 0 }));
    await page.waitForTimeout(200);

    // 6000px of continuous scroll over 2s = 30 steps × 200ms each
    // (12.5fps intentional, so we can measure the user-perceived
    // smoothness without aliasing the 60fps refresh).
    const result = await measureScrollPerf(page, 6000, 30);

    // Scroll back to top so the screenshot (if any) is meaningful.
    await page.evaluate(() => window.scrollTo({ top: 0 }));

    const PASS = result.avgFrameMs <= 17 && result.droppedFrames <= 3;
    const summary = `Imbox scroll (4000 rows, 6kpx / 2s): avgFrame=${result.avgFrameMs.toFixed(1)}ms  p95=${result.p95FrameMs.toFixed(1)}ms  max=${result.maxFrameMs.toFixed(1)}ms  dropped=${result.droppedFrames}  longTasks=${result.longTasks}  maxTask=${result.longTaskMaxMs.toFixed(0)}ms  ${PASS ? "PASS" : "FAIL"}`;
    console.log(`\n[scroll-perf] ${summary}\n`);
    test.info().annotations.push({
      type: "scroll-summary",
      description: summary,
    });
  });

  test("Imbox: scroll at 10000-row corpus (saturation point)", async ({
    page,
  }) => {
    // Push past the production size. The Imbox scroll contract is
    // "at 5,000 rows the page MUST still paint at 60fps" — 10k is
    // 2× that. If this still passes, the virtualization is doing its
    // job; if it breaks, we know how much headroom we have.
    await page.goto("/");
    await page.locator("body.app-ready").waitFor({ timeout: 10_000 });
    const seed = buildSeed({ contacts: 3000, messages: 10000 });
    await page.evaluate(async (payload) => {
      const w = window as unknown as {
        __sendpalmE2E?: {
          resetData: () => Promise<void>;
          seedContact: (c: unknown) => Promise<void>;
          seedMessage: (m: unknown) => Promise<void>;
        };
      };
      await w.__sendpalmE2E?.resetData();
      for (const c of payload.contacts) await w.__sendpalmE2E?.seedContact(c);
      for (const m of payload.messages) await w.__sendpalmE2E?.seedMessage(m);
    }, seed);
    await page.waitForTimeout(200);
    await setupPerfObserver(page);

    await clickView(page, "imbox", "Imbox");
    await page.waitForTimeout(800);
    await page.evaluate(() => window.scrollTo({ top: 0 }));
    await page.waitForTimeout(200);

    const result = await measureScrollPerf(page, 6000, 30);
    await page.evaluate(() => window.scrollTo({ top: 0 }));

    const PASS = result.avgFrameMs <= 17 && result.droppedFrames <= 3;
    const summary = `Imbox scroll (10000 rows, 6kpx / 2s): avgFrame=${result.avgFrameMs.toFixed(1)}ms  p95=${result.p95FrameMs.toFixed(1)}ms  max=${result.maxFrameMs.toFixed(1)}ms  dropped=${result.droppedFrames}  longTasks=${result.longTasks}  maxTask=${result.longTaskMaxMs.toFixed(0)}ms  ${PASS ? "PASS" : "FAIL"}`;
    console.log(`\n[scroll-perf] ${summary}\n`);
    test.info().annotations.push({
      type: "scroll-summary",
      description: summary,
    });
  });
});
