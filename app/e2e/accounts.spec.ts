/** Multi-account E2E — merged view, account switching, isolated mailboxes.
 *
 *  The unit tests cover the scope rules and the SQL. These exercise the
 *  thing the user actually reported: two mailboxes land in one list, and
 *  there was no way to tell which mail came from where or to narrow to one.
 */

import { test, expect, type Page } from "@playwright/test";
import type { Account, Contact, Message } from "../src/types";

const CONTACT_ID = "ct-multi";
const WORK = "acct-work";
const PERSONAL = "acct-personal";
const SECRET = "acct-secret";

function isoNow(): string {
  return new Date().toISOString();
}

function makeAccount(
  id: string,
  email: string,
  overrides: Partial<Account> = {},
): Account {
  return {
    id,
    type: "email",
    provider: "custom",
    email,
    label: email,
    displayName: id,
    status: "connected",
    synced: 0,
    total: 0,
    privacy: "unified",
    color: "#0a8f63",
    avatar: "",
    lastSync: isoNow(),
    settings: {
      aliases: [],
      signature: "",
      replyTo: "",
      defaultFrom: email,
      syncFolders: [],
      syncFrequency: "manual",
      autoBcc: false,
      autoBccAddress: "",
      vacationResponder: { enabled: false, subject: "", body: "" },
    },
    ...overrides,
  };
}

function makeContact(): Contact {
  return {
    id: CONTACT_ID,
    firstName: "Multi",
    lastName: "Sender",
    nickname: "",
    name: "Multi Sender",
    company: "",
    title: "",
    emails: [{ value: "sender@example.com", label: "work" }],
    phones: [],
    stage: "explore",
    labels: [],
    topics: [],
    notes: "",
    avatar: "",
    photo: "",
    health: 80,
    sc: 0,
    scC: "",
    scL: "",
    lc: "",
    grp: "",
    trd: "stable",
    pattern: "",
    accounts: [],
    stageHistory: [],
    firstContact: isoNow(),
    milestones: [],
    merged: false,
    blocked: false,
    notify: false,
    firstSeen: false,
    screened: true,
    defaultBucket: "imbox",
    autoLabel: [],
    recycling: false,
    ch: [],
  };
}

function makeMessage(
  id: string,
  ac: string,
  subj: string,
  overrides: Partial<Message> = {},
): Message {
  return {
    id,
    pid: CONTACT_ID,
    subj,
    prev: "preview",
    body: "body",
    bodyHtml: null,
    tm: "10:00",
    st: isoNow(),
    ac,
    bucket: "imbox",
    direction: "in",
    unread: true,
    labels: [],
    attachments: [],
    trackers: [],
    replyLater: false,
    setAside: false,
    bubbleUpAt: null,
    remindAt: null,
    deletedAt: null,
    to: "me@example.com",
    cc: [],
    bcc: [],
    threadId: undefined,
    calendarInvite: null,
    ...overrides,
  };
}

async function seed(
  page: Page,
  accounts: Account[],
  messages: Message[],
): Promise<void> {
  await page.goto("/");
  await page.locator("body.app-ready").waitFor({ timeout: 10_000 });
  await page.evaluate(async () => {
    await window.__sendpalmE2E?.resetData();
  });
  const payload = JSON.stringify({
    accounts,
    contacts: [makeContact()],
    messages,
  });
  await page.addInitScript((s: string) => {
    sessionStorage.setItem("__sendpalm_e2e_seed", s);
  }, payload);
  await page.goto("/");
  await page.locator("body.app-ready").waitFor({ timeout: 10_000 });
}

test.describe("Multi-account", () => {
  test("merged view lists both mailboxes and the tabs scope to one", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await seed(
      page,
      [makeAccount(WORK, "work@example.com"), makeAccount(PERSONAL, "me@gmail.com")],
      [
        makeMessage("m-work", WORK, "工作邮件 A"),
        makeMessage("m-personal", PERSONAL, "私人邮件 B"),
      ],
    );

    const tabs = page.locator("[data-account-tabs]");
    await expect(tabs).toBeVisible();
    await expect(tabs.locator("[data-account-tab]")).toHaveCount(3);

    // Merged view = both mailboxes.
    await expect(page.locator('[data-message-id="m-work"]')).toBeVisible();
    await expect(page.locator('[data-message-id="m-personal"]')).toBeVisible();

    // Narrow to one mailbox.
    await page.locator(`[data-account-tab="${WORK}"]`).click();
    await expect(page.locator('[data-message-id="m-work"]')).toBeVisible();
    await expect(page.locator('[data-message-id="m-personal"]')).toHaveCount(0);

    // And back to the merged view.
    await page.locator('[data-account-tab="all"]').click();
    await expect(page.locator('[data-message-id="m-personal"]')).toBeVisible();
  });

  test("an isolated mailbox stays out of 全部账户 but is reachable from its tab", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await seed(
      page,
      [
        makeAccount(WORK, "work@example.com"),
        makeAccount(SECRET, "secret@example.com", { privacy: "isolated" }),
      ],
      [
        makeMessage("m-work", WORK, "工作邮件 A"),
        makeMessage("m-secret", SECRET, "隔离邮件 C"),
      ],
    );

    // Default is the merged view, which excludes the isolated mailbox.
    await expect(page.locator('[data-message-id="m-work"]')).toBeVisible();
    await expect(page.locator('[data-message-id="m-secret"]')).toHaveCount(0);

    await page.locator(`[data-account-tab="${SECRET}"]`).click();
    await expect(page.locator('[data-message-id="m-secret"]')).toBeVisible();
    await expect(page.locator('[data-message-id="m-work"]')).toHaveCount(0);
  });

  test("a single mailbox shows no account strip", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await seed(
      page,
      [makeAccount(WORK, "work@example.com")],
      [makeMessage("m-work", WORK, "工作邮件 A")],
    );
    await expect(page.locator("[data-account-tabs]")).toHaveCount(0);
  });

  test("the merged list marks each row with its mailbox", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await seed(
      page,
      [makeAccount(WORK, "work@example.com"), makeAccount(PERSONAL, "me@gmail.com")],
      [
        makeMessage("m-work", WORK, "工作邮件 A"),
        makeMessage("m-personal", PERSONAL, "私人邮件 B"),
      ],
    );
    await expect(
      page.locator(`[data-message-id="m-work"] [data-account-dot="${WORK}"]`),
    ).toBeVisible();
  });
});
