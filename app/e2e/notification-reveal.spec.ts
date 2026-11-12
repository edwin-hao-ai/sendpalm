/** Tray / bell → list reveal.
 *
 *  User report: clicking a mail in the tray menu (or in the bell dropdown)
 *  opened the detail panel, but the list on the left neither highlighted nor
 *  scrolled to that mail — the two entry points write `selectedMessageId`
 *  while the list's highlight is its own `cursorIndex`.
 *
 *  This spec drives the same code path the tray uses (a bell row calls
 *  `setView` + `setSelectedMessageId` + `setDetailOpen`, exactly like
 *  `bootstrap.ts`'s `tray:open-message` listener) on a mail that is NOT the
 *  first row, and asserts the row got the cursor highlight *and* is inside the
 *  scroll viewport — the second half is what a class-name-only assertion
 *  cannot tell you (AGENTS §11.20).
 */
import { test, expect, type Page } from "@playwright/test";

const ACCT = "acct_reveal";

function isoMinutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

function contact(id: string, name: string) {
  return {
    id,
    name,
    firstName: name.split(" ")[0] ?? name,
    lastName: name.split(" ").slice(1).join(" "),
    emails: [{ value: `${id}@example.com`, label: "work" }],
    firstSeen: false,
    screened: true,
    blocked: false,
    defaultBucket: "imbox",
  };
}

function message(
  id: string,
  pid: string,
  minutesAgo: number,
  subject: string,
) {
  return {
    id,
    pid,
    subj: subject,
    prev: `Preview of ${subject}`,
    body: `Body of ${subject}`,
    bodyHtml: null,
    tm: isoMinutesAgo(minutesAgo),
    st: isoMinutesAgo(minutesAgo),
    ac: ACCT,
    bucket: "imbox",
    direction: "in",
    unread: true,
    labels: [],
    attachments: [],
    replyLater: false,
    setAside: false,
    bubbleUpAt: null,
  };
}

/** 40 rows from 40 different senders — no sender reaches the bundle threshold,
 *  so every mail owns a visible row (newest first: m_00 on top). */
function flatDataset() {
  const contacts = [];
  const messages = [];
  for (let i = 0; i < 40; i++) {
    const pid = `c_${i}`;
    contacts.push(contact(pid, `Sender ${i}`));
    messages.push(message(`m_${String(i).padStart(2, "0")}`, pid, i * 30, `Subject ${i}`));
  }
  return { contacts, messages };
}

/** One chatty sender whose mail is folded into a bundle card, plus a few plain
 *  rows above it so the bundle is not the first row either. */
function bundleDataset() {
  const contacts = [contact("c_noise", "Noise Sender"), contact("c_chatty", "Chatty Colleague")];
  const messages: ReturnType<typeof message>[] = [];
  for (let i = 0; i < 6; i++) {
    messages.push(message(`n_${i}`, "c_noise", 10 + i * 30, `Noise ${i}`));
  }
  for (let i = 0; i < 4; i++) {
    messages.push(message(`b_${i}`, "c_chatty", 200 + i * 30, `Chatty ${i}`));
  }
  return { contacts, messages };
}

async function seed(page: Page, data: { contacts: unknown[]; messages: unknown[] }) {
  await page.addInitScript(
    ({ contacts, messages }) => {
      sessionStorage.setItem(
        "__sendpalm_e2e_seed",
        JSON.stringify({ contacts, messages }),
      );
    },
    data,
  );
  await page.goto("/");
  await page.locator("body.app-ready").waitFor({ timeout: 10_000 });
  await page.evaluate(() => window.__sendpalmE2E?.__seedReady);
  await page.locator('[data-nav-view="imbox"]').first().click();
  await page.locator('[data-feed-card]').first().waitFor();
}

/** Ask the app to open `id` the way a tray click does. The bell dropdown is
 *  the in-app surface that owns the identical three writes, and unlike poking
 *  a signal from Playwright it exercises the real wiring (AGENTS §11.13: a
 *  dynamic `import()` of a store in dev may resolve to another module
 *  instance and silently do nothing). */
async function openFromBell(page: Page, opts: { id: string; title: string }) {
  await page.evaluate(async (n) => {
    await window.__sendpalmE2E!.seedNotification(n);
  }, {
    id: `nt_${opts.id}`,
    type: "mail",
    title: opts.title,
    body: "From a sender",
    ref: { type: "message", id: opts.id },
    read: false,
    createdAt: new Date().toISOString(),
  });
  await page.locator('button[aria-label="通知"]').click();
  await page.locator("[data-notifications-loading]").waitFor({ state: "detached" });
  // Scope to the dropdown: the same subject is also rendered in the list
  // below it, and `.first()` would click the LIST row — which takes the
  // in-list path (`open()`), i.e. the one that already worked.
  await page
    .locator("[data-notification-panel] [data-notification-row]")
    .filter({ hasText: opts.title })
    .first()
    .click();
}

async function expectRowRevealed(page: Page, selector: string) {
  const row = page.locator(selector).first();
  await expect(row).toHaveClass(/cursor/);
  const main = await page.locator("#main").boundingBox();
  const box = await row.boundingBox();
  expect(main).not.toBeNull();
  expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(main!.y - 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(main!.y + main!.height + 1);
  // A class assertion alone is not a user-visible assertion: assert the paint.
  const bg = await row.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg).not.toBe("rgba(0, 0, 0, 0)");
}

test("a mail opened from outside the list gets selected and scrolled into view", async ({
  page,
}) => {
  await seed(page, flatDataset());

  // Neither the first nor the last loaded row: this is purely about the
  // highlight + scroll, not about paging.
  const target = "m_24";
  const row = page.locator(`[data-message-id="${target}"]`).first();
  await expect
    .poll(async () => (await row.boundingBox())?.y ?? 0)
    .toBeGreaterThan(600);

  await openFromBell(page, { id: target, title: "Subject 24" });

  await expect(page.locator("#detail-panel")).toContainText("Subject 24");
  await expectRowRevealed(page, `[data-message-id="${target}"]`);

  // The reveal must survive the opens' own side effects: the mail is marked
  // read and patched in place, which rebuilds the date groups. If that reset
  // the list's scroll the user would watch the row vanish again one frame
  // later — assert it is still where the reveal put it.
  await page.waitForTimeout(1500);
  await expectRowRevealed(page, `[data-message-id="${target}"]`);
});

test("a mail folded inside a sender bundle opens the bundle and reveals the row", async ({
  page,
}) => {
  await seed(page, bundleDataset());

  // b_3 lives in the collapsed "Chatty Colleague" bundle: its row is not in the
  // DOM at all until the drawer opens, so a plain `[data-message-id]` lookup
  // finds nothing — the case that made "点进去列表没反应" reproducible.
  const target = "b_3";
  await openFromBell(page, { id: target, title: "Chatty 3" });

  await expect(page.locator("#detail-panel")).toContainText("Chatty 3");
  // The cursor sits on the bundle row (that IS the row for that sender)…
  await expectRowRevealed(page, '[data-bundle-id="c_chatty"]');
  // …and the mail itself is on screen, not left below the fold of a long
  // drawer: "scrolled to the bundle header" is not what the user asked for.
  // Scoped to #main: the same id also appears on the thread entry inside the
  // detail panel.
  const drawerRow = page.locator(`#main [data-message-id="${target}"]`);
  await expect(drawerRow).toBeVisible();
  const main = await page.locator("#main").boundingBox();
  const row = await drawerRow.boundingBox();
  expect(main).not.toBeNull();
  expect(row).not.toBeNull();
  expect(row!.y + row!.height).toBeLessThanOrEqual(main!.y + main!.height + 1);
});
