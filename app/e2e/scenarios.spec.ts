/** Scenario E2E — 模拟真实用户操作的核心流程。不是"点按钮断言存在"，
 * 而是"用户想干成一件事"的完整动线。每个场景失败都意味着一个真实
 * 用户会被卡住。
 *
 * 覆盖（对应审计缺口）：
 *  1. 邮件搜索全流程（唯一只有 LiveSearch 事件测试、缺主流程的模块）
 *  2. 一起读（进入 → 翻页 → 跳过订阅 → 操作）
 *  3. Gate 批量整理（积压清理动线）
 *  4. 文件夹（归档 → 文件夹视图 → 移出）
 *
 * 规则/AI 建议依赖 Tauri 运行时（sync_loop / agent_chat），浏览器模式
 * 无法端到端，保留为手工验收项（docs/TODOS.md）。 */

import { test, expect, type Page } from "@playwright/test";

/* ── Fixtures ─────────────────────────────────────────────────────── */

function seedContact(id: string, name: string, screened = true) {
  return {
    id,
    name,
    firstName: name,
    lastName: "",
    emails: [{ value: `${id}@example.com`, label: "work" }],
    firstSeen: !screened,
    screened,
    blocked: false,
    defaultBucket: "imbox",
  };
}

let seq = 0;
function seedMessage(partial: Record<string, unknown>) {
  seq += 1;
  return {
    id: `m_${partial.id ?? seq}`,
    pid: "c_alice",
    subj: "Hello",
    prev: "Preview",
    body: "Body",
    tm: "2026-01-01 10:00",
    ac: "acct_1",
    bucket: "imbox",
    direction: "in",
    unread: true,
    labels: [],
    attachments: [],
    replyLater: false,
    setAside: false,
    bubbleUpAt: null,
    ...partial,
  };
}

async function boot(page: Page, contacts: unknown[], messages: unknown[]) {
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
}

/* ── 1. 邮件搜索全流程 ─────────────────────────────────────────────── */

test("场景：用户搜索一封邮件并打开它", async ({ page }) => {
  await boot(
    page,
    [seedContact("c_alice", "Alice"), seedContact("c_bob", "Bob")],
    [
      seedMessage({ id: "m_contract", pid: "c_alice", subj: "Q4 合同草案", body: "请查收合同正文" }),
      seedMessage({ id: "m_lunch", pid: "c_bob", subj: "午饭去哪吃", body: "火锅还是日料" }),
    ],
  );

  // 用户在顶栏搜索框输入关键词。
  const search = page.getByPlaceholder(/搜索邮件、联系人、文件/);
  await search.click();
  await search.fill("合同");
  await page.waitForTimeout(600);

  // 搜索结果里出现目标邮件，点击直达详情。
  await expect(page.getByText("Q4 合同草案").first()).toBeVisible();
  await page.getByText("Q4 合同草案").first().click();
  await expect(page.locator("#detail-panel")).toHaveClass(/open/);
  await expect(page.locator("#detail-panel")).toContainText("合同正文");

  // 关闭详情回到列表（等滑入动画稳定再点）。
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "返回" }).first().click({ force: true });
  await expect(page.locator('[data-feed-card="message"]').first()).toBeVisible();
});

/* ── 2. 一起读 ────────────────────────────────────────────────────── */

test("场景：用户用一起读清空未读，并跳过订阅邮件", async ({ page }) => {
  await boot(
    page,
    [
      seedContact("c_boss", "王老板"),
      seedContact("c_nl", "Daily Digest"),
    ],
    [
      seedMessage({ id: "m_real", pid: "c_boss", subj: "明天客户来访", body: "请准备会议室", isNewsletter: false }),
      seedMessage({ id: "m_news", pid: "c_nl", subj: "本周行业动态", body: "newsletter body", isNewsletter: true }),
    ],
  );

  await page.getByRole("button", { name: "一起读" }).click();
  await expect(page.getByText("第 1 / 2 封")).toBeVisible();

  // 打开"跳过订阅邮件"——只剩真人邮件。
  await page.locator("[data-skip-newsletter]").click();
  await expect(page.getByText("第 1 / 1 封")).toBeVisible();
  await expect(page.getByText("明天客户来访")).toBeVisible();

  // 读掉它：点"下一封"→ 队列清空 → 庆祝态。
  await page.getByRole("button", { name: /下一封/ }).click();
  await expect(page.getByText(/全部读完了|没有未读/)).toBeVisible({
    timeout: 5000,
  });
});

/* ── 3. Gate 批量整理 ─────────────────────────────────────────────── */

test("场景：用户批量把订阅类发件人归到 Stream", async ({ page }) => {
  const strangers = ["c_s1", "c_s2", "c_s3"].map((id, i) =>
    seedContact(id, `Stranger ${i + 1}`, false),
  );
  await boot(page, strangers, [
    seedMessage({ id: "b1", pid: "c_s1", subj: "促销 A", isNewsletter: true }),
    seedMessage({ id: "b2", pid: "c_s2", subj: "促销 B", isNewsletter: true }),
    seedMessage({ id: "b3", pid: "c_s3", subj: "私人问候", isNewsletter: false }),
  ]);

  await page.locator('[data-nav-disclosure="mail"]').click();
  await page.locator('#workspace-mail [data-nav-view="screener"]').click();
  await page.getByRole("button", { name: "批量整理" }).click();

  // 全选 → 批量归到 Stream → 队列清空。
  await page.getByRole("button", { name: /全选/ }).click();
  await page.getByRole("button", { name: "到报刊" }).click();
  await expect(page.getByText("都审完了 🎉")).toBeVisible({ timeout: 5000 });
});

/* ── 4. 文件夹 ────────────────────────────────────────────────────── */

test("场景：用户把发票邮件归档进文件夹并查看", async ({ page }) => {
  await boot(
    page,
    [seedContact("c_alice", "Alice")],
    [
      seedMessage({
        id: "m_inv",
        subj: "十月发票",
        labels: ["lbl_fapiao"],
      }),
    ],
  );
  // 种子不带标签行——通过设置创建。
  await page.evaluate(() => window.__sendpalmE2E?.__seedReady);
  await page.evaluate(async () => {
    // 直接经 store 建标签（等同用户在 设置→标签 里新建）。
    const mod: any = await import("/src/stores/data.ts");
    await mod.upsertLabel({
      id: "lbl_fapiao",
      name: "发票",
      color: "#0A8F63",
      kind: "topic",
    });
  });

  await page.locator('[data-nav-view="files"]').first().click();
  // Library 默认进文件；从 flyout 进文件夹。
  await page.locator('[data-nav-disclosure="library"]').click();
  await page.locator('[data-nav-view="folders"]').click();

  await expect(page.getByRole("button", { name: "发票" })).toBeVisible();
  await page.getByRole("button", { name: "发票" }).click();
  await expect(page.getByText("十月发票")).toBeVisible();

  // 移出文件夹。
  await page.getByRole("button", { name: "移出文件夹" }).click();
  await expect(page.getByText("这个文件夹是空的。")).toBeVisible();
});

/* ── 5. Stream 展开渲染 ───────────────────────────────────────────── */

test("场景：用户在 Stream 展开订阅邮件看到富文本版面", async ({ page }) => {
  await boot(
    page,
    [seedContact("c_nl", "Daily Digest")],
    [
      seedMessage({
        id: "m_rich",
        pid: "c_nl",
        bucket: "feed",
        subj: "本周产品更新",
        body: "plain fallback",
        bodyHtml:
          "<html><body><h1>Big Update</h1><p>" +
          "A".repeat(600) +
          " TAILMARKER</p></body></html>",
      }),
    ],
  );

  await page.locator('[data-nav-disclosure="mail"]').click();
  await page.locator('#workspace-mail [data-nav-view="feed"]').click();

  const card = page.locator("[data-stream-card]").first();
  await expect(card).toContainText("本周产品更新");
  // 折叠态：预览被字符上限截断（不出现结尾标记，且以省略号收尾）。
  await expect(card).not.toContainText("TAILMARKER");
  await expect(card.getByText(/…/)).toBeVisible();
  // 展开 → 沙箱 iframe 渲染 HTML（而非纯文本兜底）。
  await card.click();
  await expect(card.locator("iframe")).toBeVisible({ timeout: 5000 });
  await expect(card.locator("iframe")).toHaveAttribute("srcdoc", /Big Update/);
});

/* ── 6. 首次导入过渡 ──────────────────────────────────────────────── */

/**
 * 用了五年 Gmail 的人第一次登录：邮箱里已经有 300 封历史邮件、40 位历史
 * 发件人，导入完成后他们全被静默通过；之后才来了 3 位陌生发件人。
 *
 * 筛选台必须只显示这 3 位。导入的历史发件人一个都不能露面——否则「导入
 * 即劝退」这个坑会以 UI 的形式重新长出来（Rust 侧的入队规则由
 * `src-tauri/tests/import_transition.rs` 锁定，这里锁的是「列表真的只显示
 * 未审的」）。
 */
test("场景：导入 300 封历史邮件后，筛选台只剩 3 位新发件人", async ({ page }) => {
  const historySenders = Array.from({ length: 40 }, (_, i) =>
    seedContact(`c_h${i}`, `历史发件人 ${i + 1}`, /* screened */ true),
  );
  const newcomers = ["c_new1", "c_new2", "c_new3"].map((id, i) =>
    seedContact(id, `新发件人 ${i + 1}`, /* screened */ false),
  );

  const historyMessages = Array.from({ length: 300 }, (_, i) =>
    seedMessage({
      id: `h${i}`,
      pid: `c_h${i % 40}`,
      subj: `历史邮件 ${i + 1}`,
      // 导入时订阅类被自动归到报刊，其余留在收件箱——两种都不该进筛选台。
      bucket: i % 5 === 0 ? "feed" : "imbox",
      isNewsletter: i % 5 === 0,
    }),
  );
  const newcomerMessages = newcomers.map((c, i) =>
    seedMessage({ id: `n${i}`, pid: c.id, subj: `新来信 ${i + 1}` }),
  );

  await boot(
    page,
    [...historySenders, ...newcomers],
    [...historyMessages, ...newcomerMessages],
  );

  await page.locator('[data-nav-disclosure="mail"]').click();
  await page.locator('#workspace-mail [data-nav-view="screener"]').click();

  // 队列里只有 3 位——不是 43 位。
  await expect(page.getByText(/3 位待审/).first()).toBeVisible({
    timeout: 10_000,
  });
  const card = page.locator("[data-gate-card]");
  await expect(card).toHaveAttribute("data-gate-card", /新发件人/);
  await expect(card).not.toContainText("历史发件人");

  // 处理掉一位之后，还剩 2 位（队列是真的，不是静态文案）。
  await page.getByTestId("gate-approve-imbox").click();
  await expect(page.getByText(/2 位待审/).first()).toBeVisible({
    timeout: 5000,
  });
});

/* ── 7. 导入后的未读口径 ──────────────────────────────────────────── */

/**
 * 导入 5 年的邮箱之后，本地库里躺着几千封「技术上未读」的历史邮件。红点
 * 必须只数最近 30 天，否则用户面对一个永远清不掉的数字——而那正是让人
 * 放弃一个新邮件客户端的理由。
 *
 * 更早的未读没有被藏起来：头部同时报出「更早 N 封未读」，列表照旧能翻到。
 */
test("场景：历史未读不计入红点，但仍可在列表里找到", async ({ page }) => {
  const daysAgo = (d: number) =>
    new Date(Date.now() - d * 86_400_000).toISOString();

  const contacts = [seedContact("c_pal", "老朋友")];
  const messages = [
    // 最近 30 天内的未读：这 5 封才是「待读」。
    ...[1, 3, 6, 12, 20].map((d, i) =>
      seedMessage({
        id: `recent${i}`,
        pid: "c_pal",
        subj: `最近的信 ${i + 1}`,
        sentAt: daysAgo(d),
        st: daysAgo(d),
      }),
    ),
    // 导入进来的历史未读：不进红点。
    ...[400, 600, 900].map((d, i) =>
      seedMessage({
        id: `old${i}`,
        pid: "c_pal",
        subj: `历史邮件 ${i + 1}`,
        sentAt: daysAgo(d),
        st: daysAgo(d),
      }),
    ),
  ];

  await boot(page, contacts, messages);

  const counts = page.locator("[data-imbox-counts]");
  await expect(counts).toContainText("最近 30 天 5 封待读", { timeout: 10_000 });
  await expect(counts).toContainText("更早 3 封未读");

  // 头部是「最近 30 天」的口径，标签页的数字必须说真话——它数的是这个
  // 标签底下真的有 8 封，不是 5 封（真实数据里最新邮件是两个月前，只数
  // 30 天会让标签显示 0 而列表里躺着 3,762 封）。
  await expect(page.locator("[data-imbox-tab='new']")).toContainText("8");

  // ……而历史未读并没有消失：同一位发件人的未读折叠成一张卡片，展开就能
  // 看到那封 400 天前的信，只是它不再催人。
  await page.locator("[data-feed-card='bundle']").click();
  await expect(page.getByText("历史邮件 1")).toBeVisible();
});

/* ── 8. 一起读的批量模式 ──────────────────────────────────────────── */

/**
 * 导入之后待读可能是几千封。逐封读在这种规模下不是功能，是跑步机：一次
 * 点一封要一个多小时。超过 500 封时一起读自动切成批量模式——同样是「标
 * 为已读」，一次一屏，带一次撤销。
 */
test("场景：待读超过 500 封时一起读自动进批量模式", async ({ page }) => {
  const messages = Array.from({ length: 520 }, (_, i) =>
    seedMessage({
      id: `bulk${i}`,
      pid: "c_pal",
      subj: `待读邮件 ${i + 1}`,
      sentAt: new Date(Date.now() - i * 60_000).toISOString(),
      st: new Date(Date.now() - i * 60_000).toISOString(),
    }),
  );
  await boot(page, [seedContact("c_pal", "老朋友")], messages);

  await page.getByRole("button", { name: "一起读" }).click();

  // 自动进入批量模式：不再有单封卡片和「下一封」。
  await expect(page.locator("[data-batch-triage]")).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.locator("[data-batch-copy]")).toContainText("一次一封读不完");
  await expect(
    page.getByRole("button", { name: /这 50 封标为已读/ }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /下一封/ })).toHaveCount(0);

  // 想一封一封读的人可以切回去（选择权在用户手里，不是我们替他决定）。
  await page.locator("[data-batch-single]").click();
  await expect(page.getByRole("button", { name: /下一封/ })).toBeVisible();
  await expect(page.locator("[data-batch-triage]")).toHaveCount(0);
});

/* ── 9. 筛选台：滑卡片 ───────────────────────────────────────────── */

/**
 * 原型里筛选台的核心是「一次一个人 + 滑」，不是「一张要填的表」。
 * 三条通道必须同一个结果：右滑 = 放进建议桶，左滑 = 拦下，键盘 ←/→ 等价。
 */
test("场景：在筛选台右滑放行一位发件人", async ({ page }) => {
  await boot(
    page,
    [
      seedContact("c_s1", "Stranger One", false),
      seedContact("c_s2", "Stranger Two", false),
    ],
    [
      seedMessage({ id: "s1", pid: "c_s1", subj: "合作邀约", isNewsletter: false }),
      seedMessage({ id: "s2", pid: "c_s2", subj: "另一个邀约", isNewsletter: false }),
    ],
  );

  await page.locator('[data-nav-disclosure="mail"]').click();
  await page.locator('#workspace-mail [data-nav-view="screener"]').click();

  const card = page.locator("[data-gate-card]");
  await expect(card).toContainText("Stranger One");

  // 右滑（鼠标也算）：跟手拖过阈值，松手 = 放进建议桶。
  // 从卡片抬头起手——正文是 iframe，指针事件在框内被它接走。
  const box = (await card.locator("h3").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 200, box.y + box.height / 2, {
    steps: 12,
  });
  await page.mouse.up();

  // 下一位上桌，第一位消失。
  await expect(card).toContainText("Stranger Two", { timeout: 5000 });
  await expect(page.getByText(/已批准/)).toBeVisible();

  // 键盘 ← 等价于左滑：拦下第二位。
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByText(/已屏蔽/)).toBeVisible({ timeout: 5000 });
});
