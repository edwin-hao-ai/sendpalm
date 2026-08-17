/** Contact feature E2E tests — browser mode with in-memory MockDb.
 *
 * Covers: contact Timeline filter, Files grid, and Company People tab.
 */

import { test, expect, type Page } from "@playwright/test";
import type { Contact, Message, FileItem } from "../src/types";

const ACCOUNT_ID = "acct-contact-e2e";
const CONTACT_ID = "ct-contact-e2e";
const COMPANY_NAME = "SendPalm E2E";

function todayIso(): string {
  return new Date().toISOString();
}

function makeContact(overrides?: Partial<Contact>): Contact {
  return {
    id: CONTACT_ID,
    firstName: "E2E",
    lastName: "Contact",
    nickname: "",
    name: "E2E Contact",
    company: COMPANY_NAME,
    title: "QA",
    emails: [{ value: "contact@example.com", label: "work" }],
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
    firstContact: todayIso(),
    milestones: [],
    merged: false,
    blocked: false,
    notify: false,
    firstSeen: true,
    screened: true,
    defaultBucket: "imbox",
    autoLabel: [],
    recycling: false,
    ch: [],
    ...overrides,
  };
}

function makeMessage(overrides?: Partial<Message>): Message {
  return {
    id: "msg-contact-e2e-001",
    pid: CONTACT_ID,
    subj: "E2E contact test subject",
    prev: "Preview line for the contact test.",
    body: "Hello from the contact E2E test.",
    bodyHtml: null,
    tm: "10:00",
    st: todayIso(),
    ac: ACCOUNT_ID,
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
    to: "me@example.com",
    cc: [],
    bcc: [],
    threadId: undefined,
    calendarInvite: null,
    ...overrides,
  };
}

async function resetAndSeed(
  page: Page,
  payload: { contacts?: Contact[]; messages?: Message[]; files?: FileItem[] },
): Promise<void> {
  await page.goto("/");
  await page.locator("body.app-ready").waitFor({ timeout: 10_000 });
  await page.evaluate(async () => {
    await window.__sendpalmE2E?.resetData();
  });

  const seed = JSON.stringify(payload);
  await page.addInitScript((s: string) => {
    sessionStorage.setItem("__sendpalm_e2e_seed", s);
  }, seed);

  await page.goto("/");
  await page.locator("body.app-ready").waitFor({ timeout: 10_000 });
}

async function navigateTo(page: Page, view: string): Promise<void> {
  await page.locator(`[data-nav-view="${view}"]`).first().click();
  await page.waitForTimeout(200);
}

async function openContactFromContactsList(page: Page, contactId: string): Promise<void> {
  await navigateTo(page, "contacts");
  await page
    .locator(`[data-testid="contact-card"][data-contact-id="${contactId}"]`)
    .click();
  await expect(page.locator("#detail-panel")).toBeVisible({ timeout: 5_000 });
}

test.describe("Contact features", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.locator("body.app-ready").waitFor({ timeout: 10_000 });
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  test("Timeline filter shows only outgoing messages with To them filter", async ({
    page,
  }) => {
    const contact = makeContact();
    const incoming = makeMessage({
      id: "msg-contact-in",
      subj: "Incoming message",
      direction: "in",
    });
    const outgoing = makeMessage({
      id: "msg-contact-out",
      subj: "Outgoing message",
      direction: "out",
    });

    await resetAndSeed(page, {
      contacts: [contact],
      messages: [incoming, outgoing],
    });
    await openContactFromContactsList(page, CONTACT_ID);

    await page.getByTestId("contact-tab-timeline").click();
    await expect(
      page.locator("#detail-panel").getByText("Incoming message"),
    ).toBeVisible();
    await expect(
      page.locator("#detail-panel").getByText("Outgoing message"),
    ).toBeVisible();

    await page.getByRole("button", { name: "To them" }).click();

    await expect(
      page.locator("#detail-panel").getByText("Outgoing message"),
    ).toBeVisible();
    await expect(
      page.locator("#detail-panel").getByText("Incoming message"),
    ).toHaveCount(0);
  });

  test("Files grid shows contact file card and opens it on click", async ({
    page,
  }) => {
    const contact = makeContact();
    const file: FileItem = {
      id: "file-contact-e2e",
      pid: CONTACT_ID,
      name: "Contact document.pdf",
      type: "pdf",
      mime: "application/pdf",
      size: 12_345,
      st: todayIso(),
      sourceMessageIds: [],
    };

    await resetAndSeed(page, {
      contacts: [contact],
      files: [file],
    });
    await openContactFromContactsList(page, CONTACT_ID);

    await page.getByTestId("contact-tab-files").click();

    const fileCard = page.locator("#detail-panel").getByText("Contact document.pdf");
    await expect(fileCard).toBeVisible({ timeout: 5_000 });

    await fileCard.click();
    // Clicking the file card selects it; the contact panel closes and the file
    // panel opens in the detail panel.
    await expect(
      page.locator("#detail-panel").getByText("Contact document.pdf"),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("Company People tab shows contacts grouped by company", async ({
    page,
  }) => {
    const contactA = makeContact({
      id: "ct-company-a",
      firstName: "Company",
      lastName: "Alpha",
      name: "Company Alpha",
      company: COMPANY_NAME,
    });
    const contactB = makeContact({
      id: "ct-company-b",
      firstName: "Company",
      lastName: "Beta",
      name: "Company Beta",
      company: COMPANY_NAME,
    });

    await resetAndSeed(page, {
      contacts: [contactA, contactB],
      messages: [],
    });

    await navigateTo(page, "contacts");
    await page.getByRole("button", { name: "按公司分组" }).click();

    await page
      .locator(`[data-testid="company-group-header"][aria-label="Open company ${COMPANY_NAME}"]`)
      .click();
    await expect(page.locator("#detail-panel")).toBeVisible({ timeout: 5_000 });

    // The CompanyPanel defaults to the People tab.
    await expect(
      page.locator("#detail-panel").getByText("Company Alpha"),
    ).toBeVisible({ timeout: 5_000 });
    await expect(
      page.locator("#detail-panel").getByText("Company Beta"),
    ).toBeVisible();
  });
});
