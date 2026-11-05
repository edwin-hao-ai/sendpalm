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
