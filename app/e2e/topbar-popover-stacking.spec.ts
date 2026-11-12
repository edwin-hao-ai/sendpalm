/** Topbar popover vs. side panels — stacking.
 *
 *  User report: with a mail open (detail panel visible), opening the
 *  "N 个账户" popover left it *underneath* the panel — the list/panel painted
 *  over it.
 *
 *  Root cause: `#topbar` is its own stacking context (`z-index: --z-sticky`),
 *  and the popover is a child of it. A child's z-index cannot escape its
 *  ancestor's context, so `--z-popover` (45) was still painted under
 *  `#detail-panel` (30) / `#agent-panel` (40).
 *
 *  A visibility assertion is not enough here ("it is in the DOM and has
 *  non-zero size" was true all along). The check is `elementFromPoint` at the
 *  centre of the popover: if anything else owns that pixel, the popover is
 *  covered, which is exactly the user's symptom.
 */
import { test, expect, type Page } from "@playwright/test";
import type { Account, Contact, Message } from "../src/types";

const ACCT = "acct_popover";

function makeAccount(): Account {
  return {
    id: ACCT,
    type: "email",
    provider: "custom",
    email: "edwin@sendpalm.com",
    label: "edwin@sendpalm.com",
    displayName: "edwin",
    status: "connected",
    synced: 3,
    total: 3,
    privacy: "unified",
    color: "#0a8f63",
    avatar: "",
    lastSync: new Date().toISOString(),
    settings: {
      aliases: [],
      signature: "",
      replyTo: "",
      defaultFrom: "edwin@sendpalm.com",
      syncFolders: [],
      syncFrequency: "manual",
      autoBcc: false,
      autoBccAddress: "",
      vacationResponder: { enabled: false, subject: "", body: "" },
    },
  };
}

function makeContact(): Contact {
  return {
    id: "c_pop",
    firstName: "Dylan",
    lastName: "Sullivan",
    nickname: "",
    name: "Dylan Sullivan",
    emails: [{ value: "dylan@example.com", label: "work" }],
    phone: "",
    company: "",
    role: "",
    notes: "",
    avatar: "",
    firstSeen: false,
    screened: true,
    blocked: false,
    defaultBucket: "imbox",
    sc: "#0a8f63",
    grp: "",
    pattern: "",
  } as Contact;
}

function makeMessage(): Message {
  const now = new Date().toISOString();
  return {
    id: "m_pop",
    pid: "c_pop",
    subj: "payments at SendPalm",
    prev: "Before deciding on a new payments setup",
    body: "Before deciding on a new payments setup, it helps to map the switch.",
    bodyHtml: null,
    tm: now,
    st: now,
    receivedAt: now,
    ac: ACCT,
    bucket: "imbox",
    direction: "in",
    unread: false,
    labels: [],
    attachments: [],
    trackers: [],
    replyLater: false,
    setAside: false,
    bubbleUpAt: null,
    remindAt: null,
    deletedAt: null,
  } as Message;
}

async function seed(page: Page) {
  await page.addInitScript(
    (data: { accounts: Account[]; contacts: Contact[]; messages: Message[] }) => {
      sessionStorage.setItem("__sendpalm_e2e_seed", JSON.stringify(data));
    },
    { accounts: [makeAccount()], contacts: [makeContact()], messages: [makeMessage()] },
  );
  await page.goto("/");
  await page.locator("body.app-ready").waitFor({ timeout: 10_000 });
  await page.evaluate(() => window.__sendpalmE2E?.__seedReady);
  await page.locator('[data-nav-view="imbox"]').first().click();
  await page.locator('[data-feed-card="message"]').first().waitFor();
  // The badge opens the popover only once it knows about an account; before
  // that it is an "添加邮箱账户 →" affordance that navigates to Settings.
  await expect(page.locator("[data-sync-badge]")).toContainText("1 个账户");
}

test("the sync popover paints above the detail panel", async ({ page }) => {
  await seed(page);

  // Open the mail so the panel is on screen — with no panel there is nothing
  // to be covered by, and the test would pass vacuously.
  await page.locator('[data-message-id="m_pop"]').first().click();
  await expect(page.locator("#detail-panel")).toBeVisible();

  await page.locator("[data-sync-badge]").click();
  const popover = page.locator("[data-sync-popover]");
  await expect(popover).toBeVisible();

  const ownsOwnPixels = await popover.evaluate((el) => {
    const r = el.getBoundingClientRect();
    // Sample the middle of the popover: the top-right corner of the panel
    // starts below the topbar, so the overlap region is exactly here.
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const hit = document.elementFromPoint(x, y);
    return {
      hitIsInside: hit ? el.contains(hit) : false,
      hitTag: hit?.tagName ?? null,
      hitId: (hit as HTMLElement | null)?.id ?? null,
    };
  });
  expect(ownsOwnPixels).toMatchObject({ hitIsInside: true });
});
