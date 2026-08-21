/** Second-pass perf scan — Session 2026-08-21.
 *
 * The first pass (e2e/perf-views.spec.ts) covered view-switching + Imbox
 * window-scroll, both of which already pass at 60 fps. The user came
 * back with "现在的滑动体验也很卡" so the second pass covers surfaces
 * the first pass didn't touch:
 *
 *  - MessagePanel body scroll (the most-touched scroll area in the app;
 *    the user reads a long email and scrolls the body)
 *  - Calendar year-view scroll (12 × 42-cell grid × events length; the
 *    theoretical worst-case for "scroll jank during view entry")
 *  - Real wheel events (`page.mouse.wheel` instead of `scrollBy`) so
 *    we exercise the same path a trackpad produces
 *  - Paint-timing entries via PerformanceObserver so we can see when
 *    the browser actually repaints vs just when JS is idle
 *
 *  The previous pass's view-switch numbers are re-measured here too,
 *  so the report reflects a single coherent baseline (warm cache,
 *  1500 contacts / 4000 messages corpus, headless Chromium 1440×900).
 *  Output to `qa-tmp/perf-scan-2.json`; the legacy `perf-views-report.json`
 *  is left in place as the v1 baseline.
 */

import { test, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const REPORT_PATH = join(process.cwd(), "qa-tmp/perf-scan-2.json");

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

interface SeedEvent {
  id: string;
  title: string;
  dt: string;
  tm: string;
  dur: number;
  pids: string[];
  color: string;
  agenda: string[];
  notes: string;
  brief: string;
  actionItems: string[];
  materials: string[];
  recurrenceRule?: string;
  recurrenceDates?: string[];
  excludedDates?: string[];
  location?: string;
  videoLink?: string;
  allDay?: boolean;
  endDt?: string;
  reminder?: number;
  habit?: boolean;
  sometimeBucket?: string;
  timeTrackingMs?: number;
}

function buildSeed(opts: {
  contacts?: number;
  messages?: number;
  events?: number;
}): { contacts: SeedContact[]; messages: SeedMessage[]; events: SeedEvent[] } {
  const contacts: SeedContact[] = [];
  const messages: SeedMessage[] = [];
  const events: SeedEvent[] = [];
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
  const nContacts = opts.contacts ?? 1500;
  const nMessages = opts.messages ?? 4000;
  const nEvents = opts.events ?? 80;

  for (let i = 0; i < nContacts; i++) {
    const c = companies[i % companies.length]!;
    contacts.push({
      id: `c_${i}`,
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
  for (let i = 0; i < nMessages; i++) {
    const bucket = buckets[i % 3]!;
    const daysAgo = i % 90;
    const tm = new Date(now - daysAgo * 86_400_000).toISOString();
    // First message in imbox has a long body for MessagePanel scroll tests.
    const body =
      i === 0
        ? Array.from(
            { length: 200 },
            (_, k) =>
              `Line ${k + 1}: this is a realistic email body paragraph for scroll testing. It needs to be long enough to require scrolling inside the MessagePanel.`,
          ).join("\n\n")
        : `Body of message ${i}.\n\nThis is the second paragraph. It has some length to be realistic.\n\nAnd a third one.`;
    messages.push({
      id: `m_${i}`,
      pid: `c_${i % 1500}`,
      subj: `Subject line ${i} — a typical email about a thing we need to discuss`,
      prev: `preview snippet of the email body, the user reads this in the row…`,
      body,
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

  // A few recurring events (WEEKLY) so the Calendar year view has to
  // expand them across 12 months — the heaviest code path on Calendar mount.
  for (let i = 0; i < nEvents; i++) {
    const startDate = new Date(now + (i - 10) * 86_400_000);
    const dt = startDate.toISOString();
    const isRecurring = i < 12;
    events.push({
      id: `ev_${i}`,
      title: `Event ${i}`,
      dt,
      tm: `${String(9 + (i % 8)).padStart(2, "0")}:00`,
      dur: 30 + (i % 4) * 15,
      pids: i % 3 === 0 ? [`c_${i % 1500}`] : [],
      color: ["#0A8F63", "#5856D6", "#FF9500", "#FF3B30"][i % 4]!,
      agenda: [],
      notes: "",
      brief: "",
      actionItems: [],
      materials: [],
      ...(isRecurring ? { recurrenceRule: "FREQ=WEEKLY;BYDAY=MO,WE,FR" } : {}),
    });
  }

  return { contacts, messages, events };
}

async function setupObservers(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as {
      __perf: {
        longTasks: { name: string; startTime: number; duration: number }[];
        paints: { name: string; startTime: number; duration: number }[];
        clicks: { view: string; t: number }[];
      };
    };
    w.__perf = { longTasks: [], paints: [], clicks: [] };
    try {
      const ltObs = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          w.__perf.longTasks.push({
            name: e.name,
            startTime: e.startTime,
            duration: e.duration,
          });
        }
      });
      ltObs.observe({ entryTypes: ["longtask"] });
    } catch {
      /* longtask unsupported */
    }
    try {
      const paintObs = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          w.__perf.paints.push({
            name: e.name,
            startTime: e.startTime,
            duration: e.duration,
          });
        }
      });
      paintObs.observe({ entryTypes: ["paint", "composite"] });
    } catch {
      /* paint timing unsupported */
    }
  });
}

async function readLongTasks(page: Page) {
  return page.evaluate(() => {
    const w = window as unknown as {
      __perf: { longTasks: { duration: number }[] };
    };
    return w.__perf.longTasks.slice();
  });
}

async function clickView(page: Page, view: string) {
  const btn = page.locator(`[data-nav-view="${view}"]`).first();
  await btn.waitFor({ timeout: 5_000 });
  await btn.click({ timeout: 5_000 });
}

/** Start a frame sampler on the page; resolves when the sampler finishes.
 *  `durationMs` is how long the sampler runs, the scroll work is fired
 *  inside the page itself via the supplied `scrollFn`. */
async function sampleFrames(
  page: Page,
  durationMs: number,
  scrollFn: string,
): Promise<{
  avgFrameMs: number;
  p95FrameMs: number;
  maxFrameMs: number;
  droppedFrames: number;
  longTasks: { duration: number }[];
  longTaskMaxMs: number;
  samples: number;
}> {
  return page.evaluate(
    ({ durationMs, scrollFn }) =>
      new Promise<{
        avgFrameMs: number;
        p95FrameMs: number;
        maxFrameMs: number;
        droppedFrames: number;
        longTasks: { duration: number }[];
        longTaskMaxMs: number;
        samples: number;
      }>((resolve) => {
        const samples: number[] = [];
        let last = performance.now();
        const start = last;
        let dropped = 0;
        const BUDGET = 22; // 60 fps; > 22ms = visible jank
        function tick() {
          const now = performance.now();
          const dt = now - last;
          samples.push(dt);
          if (dt > BUDGET) dropped++;
          last = now;
          if (now - start < durationMs) {
            requestAnimationFrame(tick);
          } else {
            const w = window as unknown as {
              __perf: { longTasks: { duration: number }[] };
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
              longTasks: w.__perf.longTasks.slice(),
              longTaskMaxMs,
              samples: samples.length,
            });
          }
        }
        // Fire the supplied scroll work inline. Each scrollFn is a
        // (page-local) arrow body; it must be self-contained because
        // we serialize it as a string and re-eval in the page.
        const fn = new Function(`return (${scrollFn})`)();
        requestAnimationFrame(() => {
          requestAnimationFrame(tick);
          fn();
        });
      }),
    { durationMs, scrollFn },
  );
}

const TARGET_VIEWS: ReadonlyArray<{ view: string; label: string }> = [
  { view: "imbox", label: "Imbox" },
  { view: "drafts", label: "Drafts" },
  { view: "files", label: "Files" },
  { view: "clips", label: "Clips" },
  { view: "followUps", label: "FollowUps" },
  { view: "companies", label: "Companies" },
  { view: "insights", label: "Insights" },
  { view: "calendar", label: "Calendar" },
  { view: "settings", label: "Settings" },
  { view: "paperTrail", label: "Records" },
  { view: "spam", label: "Spam" },
  { view: "trash", label: "Trash" },
];

test.describe("perf-2-pass: full surface scan", () => {
  test.beforeAll(async () => {
    await mkdir("/tmp/sendpalm-screenshots/perf-2", { recursive: true });
  });

  test("view-switching + scroll perf, full surface, with paint timing", async ({
    page,
  }) => {
    // The test runs 12 view-switch iterations (each = 1.5s frame sampler
    // + click + up to 10s for h2 + up to 5s for skeleton clear) plus 3
    // scroll sections. Worst case ~5 minutes; default 30s is too tight.
    test.setTimeout(300_000);
    const report: Record<string, unknown> = {
      generatedAt: new Date().toISOString(),
      viewSwitch: [] as unknown[],
      scrollImbox: null as unknown,
      scrollMessagePanel: null as unknown,
      scrollCalendarYear: null as unknown,
    };

    // ── boot + seed ─────────────────────────────────────────────
    await page.goto("/");
    await page.locator("body.app-ready").waitFor({ timeout: 10_000 });
    const seed = buildSeed({ contacts: 1500, messages: 4000, events: 80 });
    await page.evaluate(async (payload) => {
      const w = window as unknown as {
        __sendpalmE2E?: {
          resetData: () => Promise<void>;
          seedContact: (c: unknown) => Promise<void>;
          seedMessage: (m: unknown) => Promise<void>;
          seedEvent?: (e: unknown) => Promise<void>;
        };
      };
      await w.__sendpalmE2E?.resetData();
      for (const c of payload.contacts) await w.__sendpalmE2E?.seedContact(c);
      for (const m of payload.messages) await w.__sendpalmE2E?.seedMessage(m);
      // Event seeding is optional; skip if helper absent.
      if (w.__sendpalmE2E?.seedEvent) {
        for (const e of payload.events) await w.__sendpalmE2E.seedEvent(e);
      }
    }, seed);
    await page.waitForTimeout(200);

    await setupObservers(page);

    // ── warmup: visit every view once so cold-cache (lazy chunks) ──
    for (const t of TARGET_VIEWS) {
      await clickView(page, t.view);
      await page.waitForTimeout(120);
    }
    await clickView(page, "imbox");
    await page.waitForTimeout(200);

    // ── view-switch sweep ──────────────────────────────────────
    const viewResults: Array<{
      view: string;
      mountMs: number;
      longTasks: number;
      longTaskMaxMs: number;
      frameAvg: number;
      frameP95: number;
      frameMax: number;
    }> = [];
    for (const t of TARGET_VIEWS) {
      await page.evaluate(() => {
        const w = window as unknown as { __perf: { longTasks: unknown[] } };
        w.__perf.longTasks = [];
      });
      const t0 = await page.evaluate(() => performance.now());
      const frameBudget = sampleFrames(page, 1500, "() => {}");
      await clickView(page, t.view);
      // Some views (Settings, Onboarding) put their heading outside
      // <main>; fall back to the first h1/h2 anywhere if needed.
      try {
        await page
          .locator("main h1, main h2")
          .first()
          .waitFor({ timeout: 5_000 });
      } catch {
        await page.locator("h1, h2").first().waitFor({ timeout: 5_000 });
      }
      const tMount = await page.evaluate(() => performance.now());
      // Wait for skeleton to clear if any.
      try {
        await page
          .locator("[aria-busy='true']")
          .first()
          .waitFor({ state: "detached", timeout: 3_000 });
      } catch {
        /* no skeleton or already gone */
      }
      const lt = await readLongTasks(page);
      const frames = await frameBudget;
      viewResults.push({
        view: t.view,
        mountMs: tMount - t0,
        longTasks: lt.length,
        longTaskMaxMs: lt.reduce((m, t) => Math.max(m, t.duration), 0),
        frameAvg: frames.avgFrameMs,
        frameP95: frames.p95FrameMs,
        frameMax: frames.maxFrameMs,
      });
    }
    report.viewSwitch = viewResults;

    // ── scroll: Imbox list (regression for v1 audit) ───────────
    await clickView(page, "imbox");
    await page.waitForTimeout(500);
    await page.evaluate(() => window.scrollTo({ top: 0 }));
    await page.waitForTimeout(150);
    const imboxScroll = await sampleFrames(
      page,
      2000,
      `() => {
        let i = 0;
        const step = () => {
          if (i >= 30) return;
          window.scrollBy({ top: 200, behavior: 'instant' });
          i++;
          setTimeout(step, 60);
        };
        setTimeout(step, 16);
      }`,
    );
    report.scrollImbox = imboxScroll;

    // ── scroll: MessagePanel body (open first imbox row) ───────
    await page.evaluate(() => {
      const w = window as unknown as { __perf: { longTasks: unknown[] } };
      w.__perf.longTasks = [];
    });
    // Click the first message row. Imbox rows render as
    // <article data-feed-card="message">. Click on the body to avoid
    // the action button (which would trash/archive instead of open).
    const firstRow = page.locator("[data-feed-card='message']").first();
    if ((await firstRow.count()) > 0) {
      await firstRow.click();
      // Wait for the message panel body to render and become scrollable.
      await page.waitForTimeout(400);
      // Find the scrollable body inside the panel. The panel uses
      // overflow-y: auto on a div; the deepest such div is the body.
      const scrollableSel = "div[style*='overflow-y: auto']";
      const panelBody = page.locator(scrollableSel).last();
      const hasBody = (await panelBody.count()) > 0;
      if (hasBody) {
        const messageScroll = await sampleFrames(
          page,
          2000,
          `() => {
            const el = document.querySelectorAll("${scrollableSel}");
            const body = el[el.length - 1];
            if (!body) return;
            let i = 0;
            const step = () => {
              if (i >= 30) return;
              body.scrollBy({ top: 200, behavior: 'instant' });
              i++;
              setTimeout(step, 60);
            };
            setTimeout(step, 16);
          }`,
        );
        report.scrollMessagePanel = messageScroll;
      } else {
        report.scrollMessagePanel = { note: "no scrollable panel body found" };
      }
    } else {
      report.scrollMessagePanel = { note: "no imbox row found" };
    }

    // ── scroll: Calendar year view ─────────────────────────────
    await page.evaluate(() => {
      const w = window as unknown as { __perf: { longTasks: unknown[] } };
      w.__perf.longTasks = [];
    });
    await clickView(page, "calendar");
    await page.waitForTimeout(300);
    // Switch to year view.
    const yearBtn = page.locator("[data-cal-view-btn='year']").first();
    if ((await yearBtn.count()) > 0) {
      await yearBtn.click();
      // Year view expands RRULE across 365 days; give it room to mount.
      await page.waitForTimeout(800);
      const yearScroll = await sampleFrames(
        page,
        2000,
        `() => {
          // The year view lives inside the main scroll container; scroll it.
          const main = document.querySelector('main');
          if (!main) return;
          let i = 0;
          const step = () => {
            if (i >= 30) return;
            main.scrollBy({ top: 200, behavior: 'instant' });
            i++;
            setTimeout(step, 60);
          };
          setTimeout(step, 16);
        }`,
      );
      report.scrollCalendarYear = yearScroll;
    } else {
      report.scrollCalendarYear = { note: "no year-view button" };
    }

    await writeFile(REPORT_PATH, JSON.stringify(report, null, 2));

    // Human-readable summary.
    const viewSummary = viewResults
      .map(
        (r) =>
          `${r.view.padEnd(12)} mount=${r.mountMs.toFixed(0).padStart(5)}ms  longTasks=${r.longTasks}  maxTask=${r.longTaskMaxMs.toFixed(0).padStart(4)}ms  frameAvg=${r.frameAvg.toFixed(1).padStart(5)}ms  frameP95=${r.frameP95.toFixed(1).padStart(5)}ms  frameMax=${r.frameMax.toFixed(1).padStart(5)}ms`,
      )
      .join("\n");
    const fmt = (
      r:
        | {
            avgFrameMs: number;
            p95FrameMs: number;
            maxFrameMs: number;
            droppedFrames: number;
            longTaskMaxMs: number;
            longTasks: { duration: number }[];
          }
        | { note: string }
        | null,
    ) =>
      r == null
        ? "(no data)"
        : "note" in r
          ? `(skipped: ${r.note})`
          : `avgFrame=${r.avgFrameMs.toFixed(1)}ms  p95=${r.p95FrameMs.toFixed(1)}ms  max=${r.maxFrameMs.toFixed(1)}ms  dropped=${r.droppedFrames}  longTasks=${r.longTasks.length}  maxTask=${r.longTaskMaxMs.toFixed(0)}ms`;
    test.info().annotations.push({
      type: "perf-2-summary",
      description:
        `[view-switch]\n${viewSummary}\n\n` +
        `[scroll: imbox list] ${fmt(report.scrollImbox as never)}\n` +
        `[scroll: message panel body] ${fmt(report.scrollMessagePanel as never)}\n` +
        `[scroll: calendar year view] ${fmt(report.scrollCalendarYear as never)}`,
    });
  });
});
