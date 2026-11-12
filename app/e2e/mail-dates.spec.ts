/** Mail date integrity E2E — the user's mailbox must read like a normal
 *  person's mailbox:
 *
 *   1. Inbox groups by the REAL server receipt time (not the sender's
 *      Date header) in the profile timezone.
 *   2. List rows show a friendly local time, never the raw UTC string.
 *   3. Expanded sender bundles group recent days individually and older
 *      mail into Monday–Sunday weeks, with unread markers.
 *   4. The message detail distinguishes 收件时间 from 发件时间 when both
 *      are known.
 *   5. Opening an unread message moves it from 新邮件 to 已读 while the
 *      detail stays open — at phone, tablet, and desktop widths.
 */

import { test, expect, type Page } from "@playwright/test";

const FIXED_ACCT = "acct_e2e_dates";

function isoDaysAgo(days: number, hours = 10): string {
  const t = new Date(Date.now() - days * 86_400_000);
  t.setHours(hours, 0, 0, 0);
  return t.toISOString();
}

function seedContact(id: string, name: string) {
  return {
    id,
    name,
    firstName: name,
    lastName: "",
    emails: [{ value: `${id}@example.com`, label: "work" }],
    firstSeen: false,
    screened: true,
    blocked: false,
    defaultBucket: "imbox",
  };
}

function seedMessage(partial: Record<string, unknown>) {
  return {
    id: `m_${Math.random().toString(36).slice(2, 10)}`,
    pid: "c_sender",
    subj: "Hello",
    prev: "Preview",
    body: "Body",
    tm: "2026-01-01 10:00",
    ac: FIXED_ACCT,
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

async function boot(page: Page, messages: Record<string, unknown>[]) {
  const contacts = [
    seedContact("c_sender", "Date Sender"),
    seedContact("c_other", "Other Sender"),
  ];
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
}

test.describe("Mail date integrity", () => {
  test("inbox groups by server receipt time and shows a friendly local time", async ({
    page,
  }) => {
    await boot(page, [
      // Sender-declared date is a week old, but the server received it
      // today — the row must sit under 今天.
      seedMessage({
        id: "m_late",
        subj: "Late arrival",
        st: isoDaysAgo(7),
        sentAt: isoDaysAgo(7),
        receivedAt: isoDaysAgo(0, 8),
      }),
    ]);

    const group = page.locator('[data-imbox-date-group="today"]');
    await expect(group).toBeVisible();
    await expect(group).toContainText("Late arrival");

    // Same-day row shows HH:mm — never the raw "2026-…" UTC string.
    const time = group.locator(".feed-time").first();
    await expect(time).toHaveText(/^\d{1,2}:\d{2}$/);
  });

  test("bundle drawer groups recent days and older weeks with unread markers", async ({
    page,
  }) => {
    await boot(page, [
      seedMessage({ id: "m_today", subj: "Today mail", receivedAt: isoDaysAgo(0, 9) }),
      seedMessage({ id: "m_yesterday", subj: "Yesterday mail", receivedAt: isoDaysAgo(1, 9) }),
      seedMessage({ id: "m_old1", subj: "Old one", receivedAt: isoDaysAgo(12, 9) }),
      seedMessage({ id: "m_old2", subj: "Old two", receivedAt: isoDaysAgo(14, 9) }),
    ]);

    // 4 unread from one sender → bundle card.
    const bundle = page.locator('[data-feed-card="bundle"]');
    await expect(bundle).toBeVisible();
    await bundle.click();

    await expect(
      bundle.locator('[data-bundle-group]', { hasText: "今天" }),
    ).toBeVisible();
    await expect(
      bundle.locator('[data-bundle-group]', { hasText: "昨天" }),
    ).toBeVisible();
    // Older than 7 days → a Monday–Sunday week section (contains –).
    const weekGroup = bundle.locator(
      '[data-bundle-group]:has-text("–")',
    );
    await expect(weekGroup.first()).toBeVisible();

    // All four rows are unread → four visible unread dots.
    const unreadDots = bundle.locator(
      '.bundle-drawer-unread[data-unread="true"]',
    );
    await expect(unreadDots).toHaveCount(4);
  });

  test("message detail distinguishes receipt time from sender time", async ({
    page,
  }) => {
    await boot(page, [
      seedMessage({
        id: "m_detail",
        subj: "Dated mail",
        st: isoDaysAgo(1, 3),
        sentAt: isoDaysAgo(1, 3),
        receivedAt: isoDaysAgo(0, 6),
      }),
    ]);

    await page.locator('[data-feed-card="message"]').first().click();
    const panel = page.locator("#detail-panel");
    await expect(panel).toHaveClass(/open/);

    // The header time carries both labels in its title.
    const headerTime = panel.locator("span[title*='收件时间']").first();
    await expect(headerTime).toHaveAttribute("title", /收件时间:/);
    await expect(headerTime).toHaveAttribute("title", /发件时间:/);
  });

  for (const width of [375, 820, 1440]) {
    test(`opening unread keeps the row in place and drops the unread mark @ ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await boot(page, [
        seedMessage({ id: "m_read_me", subj: "Read me", receivedAt: isoDaysAgo(0, 7) }),
      ]);

      const card = page.locator('[data-feed-card="message"]').first();
      await expect(card).toContainText("Read me");
      await expect(card).toHaveClass(/unread/);
      await card.click();

      // Detail stays open.
      await expect(page.locator("#detail-panel")).toHaveClass(/open/);

      // The row stays where it was — only the unread mark is gone. Until the
      // 11/12 merge this asserted the row had jumped to the 已读 tab, which is
      // exactly the rearrangement that made reading feel destructive.
      await expect(card).toBeVisible();
      await expect(card).not.toHaveClass(/unread/);

      // And the unread chip agrees: nothing unread left.
      await expect(page.locator("[data-imbox-chip='unread']")).toContainText(
        "未读 0",
      );
    });
  }
});
