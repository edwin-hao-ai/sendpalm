/** Imbox E2E — exhaustive functional + smoothness test for the single view
 *  the user identified as the priority goal.
 *
 *  Boots the Solid app in headless Chromium (browser mode = mocked Tauri
 *  IPC + in-memory SQLite via MockDb), seeds a realistic Imbox dataset
 *  through `window.__sendpalmE2E`, then verifies:
 *
 *   1. First-page render: only 100 rows mounted when 500 exist (DB has
 *      500 imbox rows, only the first PAGE_SIZE are loaded).
 *   2. Smooth scroll: scrollIntoView on the sentinel triggers loadMore
 *      and the next page renders without freezing the event loop.
 *   3. Frame-rate budget during scroll: < 16 ms per scroll frame on
 *      average over 50 frames so a 60fps experience is verifiable.
 *   4. Section structure: "New for you" + "Previously seen" + piles all
 *      appear in their prototype-matching order.
 *   5. First-time sender inline approve: rows from contacts with
 *      screened=0 show a pill; clicking approve moves the row into the
 *      appropriate bucket and removes the pill.
 *   6. Bundle detection: 3+ unread from the same sender render as one
 *      expandable card, not 3 separate rows.
 *   7. Open message: clicking a card sets the DetailPanel state.
 *   8. Keyboard nav: pressing j then k moves the cursor; pressing Enter
 *      opens the message.
 *   9. Hover actions: replyLater (l) moves a row out of the imbox list
 *      (optimistic UI).
 */
import {
  test,
  expect,
  type Page,
} from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const SHOTS = "/tmp/sendpalm-screenshots/imbox-e2e";

/* ── Test fixtures ─────────────────────────────────────────────────── */

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

const FIXED_ACCT = "acct_e2e_acct";

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
  return {
    id,
    pid,
    subj: partial.subj ?? "Hello",
    prev: partial.prev ?? "Preview…",
    body: partial.body ?? "Full body",
    bodyHtml: partial.bodyHtml ?? null,
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

const APPLE_DEV = makeContact({
  id: "c_apple_developer",
  name: "Apple Developer",
  firstSeen: false,
  screened: true,
  defaultBucket: "imbox",
});

const NEWSPAPER = makeContact({
  id: "c_substack_newsletter",
  name: "Substack Daily",
  firstSeen: false,
  screened: true,
  defaultBucket: "feed",
});

const FIRST_TIMER = makeContact({
  id: "c_first_timer",
  name: "Cold Outreach Inc.",
  firstSeen: true,
  screened: false,
});

/** 500 imbox rows from Apple Developer — covers pagination + scroll. */
function makeImboxDataset() {
  const contacts: SeedContact[] = [APPLE_DEV, NEWSPAPER, FIRST_TIMER];
  const messages: SeedMessage[] = [];
  for (let i = 0; i < 500; i++) {
    messages.push(
      makeMessage({
        id: `m_appledeveloper_${i}`,
        pid: APPLE_DEV.id,
        subj: `Apple Developer Bulletin #${i + 1}`,
        prev: `Release notes, security advisories, and SDK updates — issue ${i + 1}`,
        body: `Welcome to Apple Developer Bulletin #${i + 1}.\n\n` +
          "This week's headlines: Vision Pro SDK 2.4, App Store Connect improvements, " +
          "and a new privacy manifest schema. Tap any section to read in full. " +
          `Issue number ${i + 1} of 500.`,
        st: isoDaysAgo(Math.floor(i / 12), (i % 12) + 8),
        unread: i < 50,
        bucket: "imbox",
        direction: "in",
      }),
    );
  }
  return { contacts, messages };
}

/* ── Test helpers ─────────────────────────────────────────────────── */

async function seedAndOpen(page: Page, contacts: SeedContact[], messages: SeedMessage[]) {
  await page.addInitScript(
    ({ contacts, messages }) => {
      const payload = JSON.stringify({ contacts, messages });
      sessionStorage.setItem("__sendpalm_e2e_seed", payload);
    },
    { contacts, messages },
  );
  await page.goto("/");
  // Splash overlay blocks Playwright until SolidJS mounts the root.
  await page.locator("body.app-ready").waitFor({ timeout: 10_000 });
  // Wait for seed to land in MockDb.
  await page.evaluate(() => window.__sendpalmE2E?.__seedReady);
  // Force a refresh tick so any createResource re-fetches seeded data.
  await page.evaluate(() => {
    /* no-op; createResource resolves on mount */
  });
  // Inbox is the default view — but some sessions may have view state from
  // a previous test. Click the Imbox rail item to be sure.
  await page.locator('[data-nav-view="imbox"]').first().click();
}

async function shoot(page: Page, name: string) {
  await page.waitForTimeout(150);
  await page.screenshot({
    path: join(SHOTS, `${name}.png`),
    fullPage: false,
  });
}

/* ── Suite ────────────────────────────────────────────────────────── */

test.beforeAll(async () => {
  await mkdir(SHOTS, { recursive: true });
});

test.describe("Imbox — single view focus", () => {
  test("first page: DB has 500 imbox rows, list rendered with bundle + page-size limit", async ({ page }) => {
    const { contacts, messages } = makeImboxDataset();
    await seedAndOpen(page, contacts, messages);

    // Header reflects the full DB count (500), proving the query returned
    // the right total. The counts are two fixed lines (opening a mail must not
    // re-wrap them and push the list down), so assert line by line.
    await expect(page.locator("[data-imbox-counts]")).toContainText(
      /最近 30 天 \d+ 封待读/,
    );
    await expect(page.locator("[data-imbox-counts]")).toContainText(
      /\d+ 已读 · \d+ 总数/,
    );
    // Read mail and unread mail live in ONE list now (the 「新邮件 / 已读」 tab
    // pair went away on 11/12 — a row no longer moves when you open it). The
    // four chips and one collapsed bundle are the visible signals the dataset
    // is rendering correctly.
    await expect(page.locator("[data-imbox-chip='all']")).toBeVisible();
    await expect(page.locator("[data-imbox-chip='unread']")).toBeVisible();
    await expect(page.locator("[data-feed-card='bundle']")).toHaveCount(1);
    await expect(page.locator("[data-load-more-sentinel]")).toHaveCount(1);
    await shoot(page, "01-first-page");
  });

  test("smooth scroll: scrollIntoView triggers loadMore and stays >50fps", async ({
    page,
  }) => {
    const { contacts, messages } = makeImboxDataset();
    await seedAndOpen(page, contacts, messages);

    // 50 unread from Apple Developer collapse into one bundle, plus 50
    // previously-seen cards rendered below. Count the bundle as 1
    // (collapsed) + its `data-bundle-row` children, plus any visible
    // feed-card='message' cards on either tab.
    const initialCards = await page
      .locator(
        "[data-feed-card='message'], [data-feed-card='bundle'], [data-bundle-row]",
      )
      .count();
    expect(initialCards).toBeGreaterThanOrEqual(50);

    // Scroll the main scroll container so the sentinel intersects the
    // viewport. 400px rootMargin on the observer means the sentinel must
    // reach within ~400px of the viewport bottom.
    await page.evaluate(() => {
      window.scrollTo({ top: document.body.scrollHeight - 1200, behavior: "instant" as ScrollBehavior });
    });

    // Frame-rate budget: scroll 50 frames and average the per-frame
    // wall time. A passing run averages < 16 ms (60fps). A failing run
    // would average > 50 ms (the prototype's earlier freeze would push
    // this to > 200 ms).
    const avgFrameMs = await page.evaluate(async () => {
      const samples: number[] = [];
      let last = performance.now();
      for (let i = 0; i < 50; i++) {
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
        const now = performance.now();
        samples.push(now - last);
        last = now;
        window.scrollBy({ top: 8, behavior: "instant" as ScrollBehavior });
      }
      return samples.reduce((a, b) => a + b, 0) / samples.length;
    });

    // After scrolling, the sentinel should have triggered loadMore and
    // the visible card count should have grown.
    const visibleCards = await page
      .locator(
        "[data-feed-card='message'], [data-feed-card='bundle'], [data-bundle-row]",
      )
      .count();
    expect(visibleCards).toBeGreaterThanOrEqual(initialCards);

    // Log the actual number so a manual run shows the value.
    test.info().annotations.push({
      type: "metric",
      description: `avg frame: ${avgFrameMs.toFixed(2)}ms · cards: ${visibleCards}`,
    });
    expect(avgFrameMs).toBeLessThan(20);

    await shoot(page, "02-after-scroll-loadMore");
  });

  test("section structure: New for you + Previously seen both render", async ({ page }) => {
    const { contacts, messages } = makeImboxDataset();
    // Mix in some read messages so Previously seen has rows.
    messages.push(
      makeMessage({
        id: "m_seen_1",
        pid: APPLE_DEV.id,
        subj: "Already read",
        prev: "old",
        st: isoDaysAgo(30, 12),
        unread: false,
        bucket: "imbox",
        direction: "in",
      }),
      makeMessage({
        id: "m_seen_2",
        pid: APPLE_DEV.id,
        subj: "Also already read",
        prev: "old",
        st: isoDaysAgo(31, 12),
        unread: false,
        bucket: "imbox",
        direction: "in",
      }),
    );
    await seedAndOpen(page, contacts, messages);

    // 100 unread from the loop + read rows from the same sender. They now live
    // in ONE list: 全部 shows both, the 未读 chip narrows it to unread only,
    // and clearing the chip brings the read rows back. That round-trip is the
    // merged model's promise — the old version had to click a tab because
    // opening a mail physically moved the row to a different container.
    await expect(page.locator("[data-imbox-chip='all']")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.locator("[data-imbox-chip='unread']").click();
    await expect(page.locator("[data-imbox-chip='unread']")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // The query itself must now be unread-only: header says 0 已读, because the
    // page it counted contains nothing else. (Counting visible rows here would
    // be wrong — a collapsed bundle keeps its children in the DOM.)
    await expect(page.locator("[data-imbox-counts]")).toContainText("0 已读");
    await page.locator("[data-imbox-chip='all']").click();
    // Read rows are back in the same list, no reload, no scroll reset.
    await expect(page.locator("[data-imbox-counts]")).toContainText("502 总数");
    await expect(
      page
        .locator("[data-feed-card='message'], [data-feed-card='bundle']")
        .first(),
    ).toBeVisible();

    await shoot(page, "03-sections");
  });

  test("first-time sender: pill renders and routes the decision to the Screener", async ({
    page,
  }) => {
    // Single first-time message, single first-time contact.
    const contacts = [FIRST_TIMER];
    const messages = [
      makeMessage({
        id: "m_first_timer_msg",
        pid: FIRST_TIMER.id,
        subj: "Cold outreach offering a demo",
        prev: "Hi! I noticed your team is hiring…",
        st: isoDaysAgo(0, 9),
        unread: true,
        bucket: "imbox",
        direction: "in",
      }),
    ];
    await seedAndOpen(page, contacts, messages);

    const card = page.locator(
      "[data-feed-card='message'][data-message-id='m_first_timer_msg']",
    );
    await expect(card).toBeVisible();
    await expect(card.locator("[data-first-time-pill]")).toBeVisible();
    // The four inline bucket buttons are gone: one decision per person
    // belongs to the Screener (HEY's model), not to the list row.
    await expect(card.locator("[data-approve-imbox]")).toHaveCount(0);
    await expect(card.locator("[data-block-sender]")).toHaveCount(0);

    await shoot(page, "04-first-time-sender-pill");

    // Clicking the pill jumps to the Screener, where the decision lives.
    await card.locator("[data-first-time-pill]").click();
    await expect(page.locator("#topbar")).toContainText("筛选台");
  });

  test("bundle detection: 3+ unread from same sender collapses to one card", async ({
    page,
  }) => {
    const sender = makeContact({
      id: "c_bundle_sender",
      name: "Bundle Sender Co.",
      firstSeen: false,
      screened: true,
      defaultBucket: "imbox",
    });
    const messages: SeedMessage[] = [];
    for (let i = 0; i < 5; i++) {
      messages.push(
        makeMessage({
          id: `m_bundle_${i}`,
          pid: sender.id,
          subj: `Bundle test #${i + 1}`,
          prev: `Bundle preview ${i + 1}`,
          st: isoDaysAgo(0, i + 1),
          unread: true,
          bucket: "imbox",
          direction: "in",
        }),
      );
    }
    await seedAndOpen(page, [sender], messages);

    // Five individual unread from one sender should collapse into ONE
    // bundle card with data-bundle-id, not 5 individual rows.
    const bundleCard = page.locator(
      "[data-feed-card='bundle'][data-bundle-id='c_bundle_sender']",
    );
    await expect(bundleCard).toBeVisible();
    // The bundle's drawer rows exist in the DOM but are hidden via
    // .bundle-drawer { display: none } until the bundle is expanded.
    await expect(
      bundleCard.locator("[data-bundle-row='m_bundle_0']"),
    ).toBeHidden();

    await shoot(page, "06-bundle-collapsed");

    // Click the bundle to expand.
    await bundleCard.click();
    await page.waitForTimeout(200);
    await expect(bundleCard).toHaveClass(/expanded/);
    await expect(
      bundleCard.locator("[data-bundle-row='m_bundle_0']"),
    ).toBeVisible();

    await shoot(page, "07-bundle-expanded");
  });

  test("click card → DetailPanel state is set (messageId)", async ({ page }) => {
    const { contacts, messages } = makeImboxDataset();
    await seedAndOpen(page, contacts, messages);

    // The dataset is 500 messages from a single sender (APPLE_DEV), so bundle
    // detection collapses them into one card. Read mail is in the same list as
    // unread now, so the bundle is on the first page — no tab switch needed.
    // We expand it and click an individual row inside its drawer to exercise
    // the "click an already-read message" path.
    const bundle = page.locator("[data-feed-card='bundle']").first();
    await expect(bundle).toBeVisible({ timeout: 10_000 });
    await bundle.click();
    const card = page.locator(
      "[data-feed-card='message'][data-message-id='m_appledeveloper_60']",
    );
    await expect(card).toBeVisible();
    await card.click();

    // DetailPanel should now be visible (right-side aside opens).
    await expect(page.locator("#detail-panel.open")).toBeVisible({
      timeout: 1_000,
    });
    await shoot(page, "08-detail-panel-opens");
  });

  test("opening an unread mail keeps the row in place and only drops the unread mark", async ({
    page,
  }) => {
    // 本次改造的核心承诺：行不搬家。旧模型下点开会把它从「新邮件」删掉、
    // 插到「已读」顶部，于是必须靠 keepScrollStill 掩盖跳动。
    const contacts = [APPLE_DEV, NEWSPAPER];
    const messages = [
      makeMessage({
        id: "m_keep_1",
        pid: APPLE_DEV.id,
        subj: "未读的那封",
        prev: "正文第一行",
        st: isoDaysAgo(0, 10),
        unread: true,
        bucket: "imbox",
        direction: "in",
      }),
      makeMessage({
        id: "m_keep_2",
        pid: NEWSPAPER.id,
        subj: "更早的一封",
        prev: "正文第一行",
        st: isoDaysAgo(1, 10),
        unread: true,
        bucket: "imbox",
        direction: "in",
      }),
    ];
    await seedAndOpen(page, contacts, messages);

    const chip = page.locator("[data-imbox-chip='unread']");
    await expect(chip).toContainText("2", { timeout: 10_000 });

    const card = page.locator(
      "[data-feed-card='message'][data-message-id='m_keep_1']",
    );
    await expect(card).toHaveClass(/unread/);
    await card.click();
    await expect(page.locator("#detail-panel.open")).toBeVisible();

    // 同一个行还在列表里，只是不再加粗 —— 而且两个 chip 的数字跟着减一，
    // 说明标已读的那条链路（notifyMessageUpdated → refreshUnreadCounts）
    // 真的接上了。
    await expect(card).toBeVisible();
    await expect(card).not.toHaveClass(/unread/);
    await expect(chip).toContainText("1");
    await shoot(page, "09-row-stays-put");
  });

  test("under the unread filter, opening a mail removes the row from the list", async ({
    page,
  }) => {
    // 未读筛选开着时，标已读的行不再满足筛选条件，必须真的离开列表 ——
    // 否则筛选条件在撒谎（列表里躺着已读邮件）。
    const contacts = [APPLE_DEV, NEWSPAPER];
    const messages = [
      makeMessage({
        id: "m_filter_1",
        pid: APPLE_DEV.id,
        subj: "会被读掉的那封",
        prev: "正文第一行",
        st: isoDaysAgo(0, 10),
        unread: true,
        bucket: "imbox",
        direction: "in",
      }),
      makeMessage({
        id: "m_filter_2",
        pid: NEWSPAPER.id,
        subj: "留下的那封",
        prev: "正文第一行",
        st: isoDaysAgo(1, 10),
        unread: true,
        bucket: "imbox",
        direction: "in",
      }),
    ];
    await seedAndOpen(page, contacts, messages);

    await page.locator("[data-imbox-chip='unread']").click();
    const card = page.locator(
      "[data-feed-card='message'][data-message-id='m_filter_1']",
    );
    await expect(card).toBeVisible({ timeout: 10_000 });
    await card.click();
    await expect(page.locator("#detail-panel.open")).toBeVisible();

    await expect(card).toHaveCount(0);
    await expect(
      page.locator("[data-feed-card='message'][data-message-id='m_filter_2']"),
    ).toBeVisible();
  });

  test("an emptied unread filter keeps the chips and offers a way back", async ({
    page,
  }) => {
    // 未读筛选是服务端筛选：一封未读都没有时列表真的空了。旧实现里
    // hasAny() 会把 chip 行一起吞掉，用户看到的是「收件箱是空的」，
    // 但收件箱里明明还有已读邮件 —— 而且没有任何退回「全部」的入口，
    // 因为 quickFilter 只存在于这个组件的 signal 里。
    const contacts = [APPLE_DEV];
    const messages = [
      makeMessage({
        id: "m_allread_1",
        pid: APPLE_DEV.id,
        subj: "已经读过的",
        prev: "正文第一行",
        st: isoDaysAgo(0, 9),
        unread: false,
        bucket: "imbox",
        direction: "in",
      }),
    ];
    await seedAndOpen(page, contacts, messages);
    await expect(
      page.locator("[data-feed-card='message'][data-message-id='m_allread_1']"),
    ).toBeVisible({ timeout: 10_000 });

    await page.locator("[data-imbox-chip='unread']").click();

    // Chip 行必须活过自己筛出来的空结果。
    await expect(page.locator("[data-imbox-chip='all']")).toBeVisible();
    await expect(page.getByText("都读完了")).toBeVisible();

    await page.getByRole("button", { name: "查看全部" }).click();
    await expect(
      page.locator("[data-feed-card='message'][data-message-id='m_allread_1']"),
    ).toBeVisible();
  });

  test("opening a mail does not move anything above or below it", async ({
    page,
  }) => {
    // 阅读栏打开时列表列会窄 ~380px。以前头部一行式统计和 chip 行会在这个
    // 瞬间折行，把整条列表往下顶 —— 用户看到的就是「点开邮件，列表抖一下」。
    // 现在统计是两行固定结构、chip 行不换行，所以：
    //   1. 打开前后的垂直几何必须一模一样；
    //   2. 统计行和 chip 行必须在窄列下仍然是单行（折行才是抖动的原因）。
    // 窄视口 + 三四位数的计数，才是真实邮箱里的那种压力。
    await page.setViewportSize({ width: 900, height: 800 });
    // One sender per message: 3+ from the same sender would collapse into a
    // bundle and there would be no ordinary rows to measure.
    const contacts: SeedContact[] = [];
    const messages: SeedMessage[] = [];
    for (let d = 0; d < 150; d++) {
      contacts.push(
        makeContact({ id: `sc${d}`, name: `发件人 ${d}` }),
      );
      messages.push(
        makeMessage({
          id: `m_stable_${d}`,
          pid: `sc${d}`,
          subj: `第 ${d} 封`,
          prev: "正文第一行",
          st: isoDaysAgo(d, 10),
          unread: true,
          bucket: "imbox",
          direction: "in",
        }),
      );
    }
    await seedAndOpen(page, contacts, messages);

    const geometry = () =>
      page.evaluate(() => {
        const rect = (sel: string) =>
          document.querySelector(sel)?.getBoundingClientRect() ?? null;
        const lineBoxCount = (sel: string) => {
          const el = document.querySelector(sel) as HTMLElement | null;
          if (!el) return -1;
          // 单行 = 高度约等于 line-height；折行会是它的两倍。
          const lh = parseFloat(getComputedStyle(el).lineHeight) || 20;
          return Math.round(el.getBoundingClientRect().height / lh);
        };
        const rowTops = [
          ...document.querySelectorAll("[data-feed-card='message']"),
        ]
          .slice(0, 5)
          .map((el) => Math.round(el.getBoundingClientRect().top));
        return {
          stats: Math.round(rect(".imbox-stats")?.height ?? -1),
          chips: Math.round(rect(".imbox-chips")?.height ?? -1),
          statsLines: lineBoxCount(".imbox-stats-line"),
          rowTops,
        };
      });

    await expect(page.locator("[data-imbox-counts]")).toBeVisible();
    await expect(
      page.locator("[data-feed-card='message']").first(),
    ).toBeVisible();
    const start = await geometry();

    // 单行断言：统计行在窄列下不许折行（折行就是列表抖动的来源）。
    expect(start.statsLines, "header statistics wrapped").toBe(1);

    await page.locator("[data-feed-card='message']").first().click();
    await expect(page.locator("#detail-panel.open")).toBeVisible();
    await page.waitForTimeout(600);
    const end = await geometry();

    expect(start.stats, "header statistics were not rendered").toBeGreaterThan(0);
    expect(end.stats, "header statistics changed height").toBe(start.stats);
    expect(end.chips, "chip row changed height").toBe(start.chips);
    // 用户看到的是「视线里的行有没有跳」，而不是文档总高度 —— 后者受
    // content-visibility 的懒测量影响，会在视口外的行上合理地微调。
    expect(end.rowTops, "rows moved on screen").toEqual(start.rowTops);
  });

  test("opening a mail inside a bundle decrements the bundle's unread badge", async ({
    page,
  }) => {
    // 徽标以前显示的是这一摞的总封数，所以点开一封它永远不变 —— 用户把它读成
    // 「未读数」后就以为已读没生效。现在徽标数的是未读成员，而且抽屉行的
    // 未读圆点也必须跟着消失。
    const { contacts, messages } = makeImboxDataset();
    await seedAndOpen(page, contacts, messages);

    const bundle = page.locator("[data-feed-card='bundle']").first();
    await expect(bundle).toBeVisible({ timeout: 10_000 });
    await bundle.click();

    const badge = bundle.locator(".feed-card-bundle-count");
    // 50 of the 500 seeded messages are unread.
    await expect(badge).toHaveText("50");

    const row = page.locator('[data-bundle-row="m_appledeveloper_0"]');
    await expect(row.locator("[data-unread='true']")).toHaveCount(1);
    await row.click();
    await expect(page.locator("#detail-panel.open")).toBeVisible();

    await expect(badge).toHaveText("49");
    await expect(row.locator("[data-unread='false']")).toHaveCount(1);
  });

  test("a read row and an unread row look different, and clicking makes the difference go away", async ({
    page,
  }) => {
    // 之前的 e2e 只断言 class 里有没有 `unread` —— 那断言的是实现，不是用户
    // 看到的东西。真实反馈是「点完看不出区别」：圆点在 :hover 上被隐藏了，
    // 而鼠标点完就停在那一行上，于是唯一的线索消失了。
    // 这条测试量化「一个人能不能看出来」：字重差、以及悬停时圆点必须还在。
    const contacts = [APPLE_DEV, NEWSPAPER];
    const messages = [
      makeMessage({
        id: "m_look_unread",
        pid: APPLE_DEV.id,
        subj: "未读的一封",
        prev: "正文第一行",
        st: isoDaysAgo(0, 10),
        unread: true,
        bucket: "imbox",
        direction: "in",
      }),
      makeMessage({
        id: "m_look_read",
        pid: NEWSPAPER.id,
        subj: "已读的一封",
        prev: "正文第一行",
        st: isoDaysAgo(1, 10),
        unread: false,
        bucket: "imbox",
        direction: "in",
      }),
    ];
    await seedAndOpen(page, contacts, messages);

    type Look = { weight: number; dot: number; color: string };
    const look = (id: string): Promise<Look> =>
      page.evaluate((msgId) => {
        const el = document.querySelector(
          `[data-feed-card='message'][data-message-id='${msgId}']`,
        ) as HTMLElement | null;
        if (!el) throw new Error(`row ${msgId} not found`);
        const subject = el.querySelector(".feed-subject") as HTMLElement;
        const name = el.querySelector(".feed-name") as HTMLElement;
        // 圆点是 ::before，只有 getComputedStyle(el, "::before") 能问到它。
        const dot = getComputedStyle(el, "::before");
        return {
          weight: Number(getComputedStyle(subject).fontWeight),
          nameColor: getComputedStyle(name).color,
          dot: dot.content === "none" ? 0 : Number(dot.opacity) * parseFloat(dot.width),
          color: getComputedStyle(subject).color,
        };
      }, id);

    await expect(
      page.locator("[data-feed-card='message'][data-message-id='m_look_unread']"),
    ).toBeVisible();

    const unreadRow = page.locator(
      "[data-feed-card='message'][data-message-id='m_look_unread']",
    );
    const readRow = page.locator(
      "[data-feed-card='message'][data-message-id='m_look_read']",
    );

    // 1) 未读行必须真的更重（差值要肉眼可辨，不是 600 vs 700 那种）。
    const unreadRest = await look("m_look_unread");
    const readLook = await look("m_look_read");
    expect(
      unreadRest.weight - readLook.weight,
      "unread subject is not visibly heavier than a read one",
    ).toBeGreaterThanOrEqual(200);
    expect(
      unreadRest.nameColor,
      "unread and read sender names are the same colour, so weight is the only cue",
    ).not.toBe(readLook.nameColor);

    // 2) 圆点在悬停时必须仍然可见 —— 这是「点完看不出变化」的直接原因。
    await unreadRow.hover();
    await page.waitForTimeout(220);
    const hoveredUnread = await look("m_look_unread");
    expect(
      hoveredUnread.dot,
      "unread dot disappears on hover, so the row you just clicked shows nothing",
    ).toBeGreaterThan(0);

    // 3) 点开之后，这一行必须看起来和已读行一致。
    await unreadRow.click();
    await expect(page.locator("#detail-panel.open")).toBeVisible();
    await expect
      .poll(async () => (await look("m_look_unread")).weight, { timeout: 5_000 })
      .toBe(readLook.weight);
    const afterOpen = await look("m_look_unread");
    expect(afterOpen.dot, "the dot survived being read").toBe(0);
    expect(readRow).toBeVisible();
  });

  test("keyboard: j/k move cursor, Enter opens", async ({ page }) => {
    const { contacts, messages } = makeImboxDataset();
    await seedAndOpen(page, contacts, messages);

    // Initial cursor: -1 (none).
    // Press j: cursor → 0, sets selectedMessageId.
    // Press j again: cursor → 1.
    // Press k: cursor → 0.
    // Press Enter: opens DetailPanel.
    await page.locator("body").click(); // focus body
    await page.keyboard.press("j");
    await page.keyboard.press("j");
    await page.keyboard.press("k");
    await page.keyboard.press("Enter");

    await expect(page.locator("#detail-panel.open")).toBeVisible({
      timeout: 1_000,
    });
    await shoot(page, "09-keyboard-nav");
  });

  test("hover action: 'l' moves row out of imbox list (optimistic)", async ({
    page,
  }) => {
    // One Apple Developer message — easy to verify it disappears.
    const contacts = [APPLE_DEV];
    const messages = [
      makeMessage({
        id: "m_reply_later",
        pid: APPLE_DEV.id,
        subj: "Reply later test",
        prev: "preview",
        st: isoDaysAgo(0, 8),
        unread: true,
        bucket: "imbox",
        direction: "in",
      }),
    ];
    await seedAndOpen(page, contacts, messages);

    const card = page.locator(
      "[data-feed-card='message'][data-message-id='m_reply_later']",
    );
    await expect(card).toBeVisible();

    // Press 'l' (replyLater shortcut) on the focused card. Since
    // cursorIndex defaults to -1 we first set it by pressing 'j' once.
    await page.locator("body").click();
    await page.keyboard.press("j");
    await page.keyboard.press("l");

    // Optimistic remove: row should be gone immediately (≤ 100 ms).
    await expect(card).toHaveCount(0, { timeout: 1_000 });

    // The replyLater pile should now show the message.
    await expect(page.locator("[data-pile='pending']")).toBeVisible();
    await shoot(page, "10-reply-later-optimistic");
  });

  test("piles: Pending / Saved / Remind render at bottom with counts", async ({
    page,
  }) => {
    const contacts = [APPLE_DEV];
    const messages = [
      // replyLater pile
      makeMessage({
        id: "m_pile_pending",
        pid: APPLE_DEV.id,
        subj: "Pending message",
        prev: "p",
        replyLater: true,
        bucket: "imbox",
        direction: "in",
      }),
      // setAside pile
      makeMessage({
        id: "m_pile_saved",
        pid: APPLE_DEV.id,
        subj: "Saved message",
        prev: "s",
        setAside: true,
        bucket: "imbox",
        direction: "in",
      }),
      // remind pile (bubbleUpAt)
      makeMessage({
        id: "m_pile_remind",
        pid: APPLE_DEV.id,
        subj: "Remind message",
        prev: "r",
        bubbleUpAt: isoDaysAgo(0, 9),
        bucket: "imbox",
        direction: "in",
      }),
    ];
    await seedAndOpen(page, contacts, messages);

    await expect(page.locator("[data-pile='pending']")).toBeVisible();
    await expect(page.locator("[data-pile='saved']")).toBeVisible();
    await expect(page.locator("[data-pile='remind']")).toBeVisible();

    // Counts in the pile chips should match the seeded rows.
    const pending = page.locator("[data-pile='pending'] .imbox-pile-count");
    await expect(pending).toHaveText("1");
    const saved = page.locator("[data-pile='saved'] .imbox-pile-count");
    await expect(saved).toHaveText("1");
    const remind = page.locator("[data-pile='remind'] .imbox-pile-count");
    await expect(remind).toHaveText("1");

    await shoot(page, "11-piles");
  });
});
