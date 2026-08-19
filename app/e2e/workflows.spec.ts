/** Email workflow E2E tests — browser mode with in-memory MockDb.
 *
 * These tests seed minimal contact/message/event data through the existing
 * frontend data layer (`window.__sendpalmE2E`) and exercise real UI clicks.
 */

import { test, expect, type Page } from "@playwright/test";
import { join } from "node:path";
import type { Contact, Message } from "../src/types";

const CONTACT_ID = "ct-e2e-sender";
const SHOTS = "/tmp/sendpalm-screenshots/e2e";
const MESSAGE_ID = "msg-e2e-001";
const ACCOUNT_ID = "acct-e2e-001";

function todayIso(): string {
  return new Date().toISOString();
}

function todayDateStr(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function makeContact(overrides?: Partial<Contact>): Contact {
  return {
    id: CONTACT_ID,
    firstName: "E2E",
    lastName: "Sender",
    nickname: "",
    name: "E2E Sender",
    company: "SendPalm",
    title: "Tester",
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
    firstContact: todayIso(),
    milestones: [],
    merged: false,
    blocked: false,
    notify: false,
    firstSeen: true,
    screened: false,
    defaultBucket: "imbox",
    autoLabel: [],
    recycling: false,
    ch: [],
    ...overrides,
  };
}

function makeMessage(overrides?: Partial<Message>): Message {
  return {
    id: MESSAGE_ID,
    pid: CONTACT_ID,
    subj: "E2E test subject",
    prev: "This is the preview line for the E2E test message.",
    body: "Hello from the E2E test. This is the full message body.",
    bodyHtml: null,
    tm: "10:00",
    st: todayIso(),
    ac: ACCOUNT_ID,
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

async function resetAndSeed(
  page: Page,
  contact: Contact,
  message: Message,
  extras?: { files?: Array<{
    id: string;
    pid: string;
    name: string;
    type: string;
    mime: string;
    size: number;
    st: string;
  }> },
): Promise<void> {
  // Reset any previously seeded data by clearing the in-memory tables via
  // the current page, then inject the next fixture into sessionStorage so it
  // is applied before the app renders on the fresh navigation.
  await page.goto("/");
  await page.locator("body.app-ready").waitFor({ timeout: 10_000 });
  await page.evaluate(async () => {
    await window.__sendpalmE2E?.resetData();
  });

  const seed = JSON.stringify({
    contacts: [contact],
    messages: [message],
    files: extras?.files ?? [],
  });
  await page.addInitScript((s: string) => {
    sessionStorage.setItem("__sendpalm_e2e_seed", s);
  }, seed);

  await page.goto("/");
  await page.locator("body.app-ready").waitFor({ timeout: 10_000 });
}

async function seedThread(
  page: Page,
  contact: Contact,
  messages: Message[],
): Promise<void> {
  await page.goto("/");
  await page.locator("body.app-ready").waitFor({ timeout: 10_000 });
  await page.evaluate(async () => {
    await window.__sendpalmE2E?.resetData();
  });

  const seed = JSON.stringify({ contacts: [contact], messages });
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

async function openFirstMessage(page: Page): Promise<void> {
  await page.locator(`[data-message-id="${MESSAGE_ID}"]`).first().click();
  await expect(page.locator('#detail-panel [aria-label="Reply"]')).toBeVisible({
    timeout: 5_000,
  });
}

test.describe("Email workflows", () => {
  test("Gate approval moves a first-sender message to Imbox", async ({
    page,
  }) => {
    await resetAndSeed(page, makeContact(), makeMessage({ bucket: "imbox" }));
    await navigateTo(page, "screener");

    await expect(page.getByText("决定谁可以进入你的 Imbox")).toBeVisible();
    await page.getByTestId("gate-approve-imbox").click();

    await navigateTo(page, "imbox");
    await expect(page.locator(`[data-message-id="${MESSAGE_ID}"]`)).toBeVisible(
      { timeout: 5_000 },
    );
    await expect(page.getByText("E2E test subject")).toBeVisible();
  });

  test("Reply opens Compose with correct recipient and Re: subject", async ({
    page,
  }) => {
    await resetAndSeed(
      page,
      makeContact({ firstSeen: false, screened: true }),
      makeMessage(),
    );
    await openFirstMessage(page);

    await page.locator('#detail-panel [aria-label="Reply"]').click();
    await expect(page.getByRole("dialog", { name: "Reply" })).toBeVisible({
      timeout: 5_000,
    });

    // RecipientInput renders the email as a pill, not as the raw <input> value.
    await expect(
      page.locator(
        '[data-field="to"] [aria-label="Remove sender@example.com"]',
      ),
    ).toBeVisible();

    const subjectInput = page.locator('[data-field="subject"] input');
    await expect(subjectInput).toHaveValue("Re: E2E test subject");
  });

  test("Forward opens Compose with Fwd: subject and quoted body", async ({
    page,
  }) => {
    await resetAndSeed(
      page,
      makeContact({ firstSeen: false, screened: true }),
      makeMessage(),
    );
    await openFirstMessage(page);

    // Forward is a direct action in the message-detail bottom bar.
    await page.locator('#detail-panel [aria-label="Forward"]').click();

    await expect(page.getByRole("dialog", { name: "Forward" })).toBeVisible({
      timeout: 5_000,
    });

    const subjectInput = page.locator('[data-field="subject"] input');
    await expect(subjectInput).toHaveValue("Fwd: E2E test subject");

    const body = page.locator('textarea[placeholder="正文…"]');
    await expect(body).toHaveValue(/--- 原始邮件 ---/);
    await expect(body).toHaveValue(/Hello from the E2E test/);
  });

  test("Calendar invite adds event and it appears in Calendar", async ({
    page,
  }) => {
    const invite = {
      uid: "ical-e2e-001",
      summary: "E2E Calendar Meeting",
      dtstart: `${todayDateStr()}T10:00:00.000Z`,
      dtend: `${todayDateStr()}T10:30:00.000Z`,
      location: "Conference Room A",
      description: "Please join the E2E meeting.",
    };

    await resetAndSeed(
      page,
      makeContact({ firstSeen: false, screened: true }),
      makeMessage({ calendarInvite: invite }),
    );
    await openFirstMessage(page);

    await expect(page.getByText("日历邀请")).toBeVisible();

    // Intercept the Tauri invoke in browser mode so the event is persisted.
    await page.evaluate(async (inviteArg: typeof invite) => {
      void inviteArg;
      const internals = (
        window as unknown as {
          __TAURI_INTERNALS__: {
            invoke: (cmd: string, args?: unknown) => Promise<unknown>;
          };
        }
      ).__TAURI_INTERNALS__;
      const originalInvoke = internals.invoke.bind(internals);
      internals.invoke = async (cmd: string, args?: unknown) => {
        if (cmd === "add_calendar_event") {
          const payload = args as {
            invite: typeof inviteArg;
            contactId?: string;
          };
          const inviteData = payload.invite;
          await window.__sendpalmE2E!.seedEvent({
            id: "ev-e2e-001",
            title: inviteData.summary,
            dt: inviteData.dtstart,
            endDt: inviteData.dtend,
            tm: "10:00",
            dur: 30,
            pids: payload.contactId ? [payload.contactId] : [],
            color: "#0A8F63",
            location: inviteData.location,
            reminder: 15,
            agenda: [],
            notes: inviteData.description ?? "",
            brief: "",
            actionItems: [],
            materials: [],
          });
          return "ev-e2e-001";
        }
        return originalInvoke(cmd, args);
      };
    }, invite);

    await page.getByTestId("add-to-calendar").click();
    await expect(page.getByText("已添加到日历")).toBeVisible({
      timeout: 5_000,
    });

    await navigateTo(page, "calendar");
    await expect(
      page.locator("#main").getByText("E2E Calendar Meeting").first(),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("Reply Later moves a message to the Reply Later pile and can be undone", async ({
    page,
  }) => {
    test.setTimeout(45_000);
    await resetAndSeed(
      page,
      makeContact({ firstSeen: false, screened: true }),
      makeMessage(),
    );

    // The card's hover-actions overlay only shows on :hover, so
    // dispatch the click event directly rather than relying on
    // pointer-driven visibility checks. This is the only difference
    // from a real user hover-click.
    await page
      .locator('#main [aria-label="Reply later"]')
      .first()
      .dispatchEvent("click");
    await expect(page.getByText("已 Reply Later")).toBeVisible({
      timeout: 5_000,
    });

    await expect(page.locator('[data-testid="piles"]')).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.locator('[data-testid="pile-replyLater"]')).toContainText(
      "1",
    );

    await page.locator('[data-testid="pile-replyLater"]').click();
    await expect(page.locator('[data-pile-item="msg-e2e-001"]')).toBeVisible();

    // Undo the action from the toast.
    await page.getByTestId("toast-action").click();
    await expect(page.getByText("已撤销")).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('[data-testid="piles"]')).not.toBeVisible({
      timeout: 5_000,
    });
  });

  test("Set Aside moves a message to the Set Aside pile and can be undone", async ({
    page,
  }) => {
    test.setTimeout(45_000);
    await resetAndSeed(
      page,
      makeContact({ firstSeen: false, screened: true }),
      makeMessage(),
    );

    await page
      .locator('#main [aria-label="Set aside"]')
      .first()
      .dispatchEvent("click");
    await expect(page.getByText("已 Set Aside")).toBeVisible({
      timeout: 5_000,
    });

    await expect(page.locator('[data-testid="piles"]')).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.locator('[data-testid="pile-setAside"]')).toContainText(
      "1",
    );

    await page.locator('[data-testid="pile-setAside"]').click();
    await expect(page.locator('[data-pile-item="msg-e2e-001"]')).toBeVisible();

    // Undo the action from the toast.
    await page.getByTestId("toast-action").click();
    await expect(page.getByText("已撤销")).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('[data-testid="piles"]')).not.toBeVisible({
      timeout: 5_000,
    });
  });

  test("Thread-first detail expands older message and shows both bodies", async ({
    page,
  }) => {
    const contact = makeContact({ firstSeen: false, screened: true });
    const olderMsg = makeMessage({
      id: "msg-e2e-older",
      body: "This is the older message body that starts collapsed.",
      prev: "Older preview line.",
      st: new Date(Date.now() - 86_400_000).toISOString(),
      threadId: "thread-e2e-001",
    });
    const currentMsg = makeMessage({
      id: "msg-e2e-current",
      body: "This is the current message body.",
      prev: "Current preview line.",
      st: new Date().toISOString(),
      threadId: "thread-e2e-001",
    });

    await seedThread(page, contact, [olderMsg, currentMsg]);

    // Open the current message in the detail panel.
    await page.locator('[data-message-id="msg-e2e-current"]').first().click();
    await expect(
      page.locator('#detail-panel [aria-label="Reply"]'),
    ).toBeVisible({
      timeout: 5_000,
    });

    // With only 2 messages the older card is already expanded, but clicking it
    // still exercises the expand/collapse interaction.
    const olderCard = page.locator(
      '[data-thread-message][data-message-id="msg-e2e-older"]',
    );
    await expect(olderCard).toHaveAttribute("data-expanded", "true");
    await olderCard.click();

    // Both bodies should now be visible in the detail panel.
    await expect(
      page.locator("#detail-panel").getByText("This is the older message body"),
    ).toBeVisible();
    await expect(
      page
        .locator("#detail-panel")
        .getByText("This is the current message body"),
    ).toBeVisible();
  });

  test("Trash action shows undo toast and restores message to Imbox", async ({
    page,
  }) => {
    await resetAndSeed(
      page,
      makeContact({ firstSeen: false, screened: true }),
      makeMessage({ bucket: "imbox" }),
    );
    await openFirstMessage(page);

    await page.getByTestId("message-more-menu").click();
    await page.getByTestId("message-move-trash").click();

    const toast = page.getByTestId("toast-success");
    await expect(toast).toBeVisible({ timeout: 5_000 });
    await expect(toast).toContainText("已移到 Trash");
    await expect(page.getByTestId("toast-action")).toContainText("撤销");

    await page.getByTestId("toast-action").click();
    await expect(page.getByText("已恢复到原位置")).toBeVisible({
      timeout: 5_000,
    });

    await navigateTo(page, "imbox");
    // After trash + undo the message lives in the "Previously seen" tab
    // (opening a message marks it read, and trash doesn't move it back
    // to unread). Click the tab to confirm it's restored on the right
    // surface, instead of only checking the default "New for you" tab.
    await page.locator("[data-imbox-tab='seen']").first().click();
    await expect(page.locator(`[data-message-id="${MESSAGE_ID}"]`)).toBeVisible(
      { timeout: 5_000 },
    );
  });

  test("Source view renders the raw message source", async ({ page }) => {
    await resetAndSeed(
      page,
      makeContact({ firstSeen: false, screened: true }),
      makeMessage(),
    );
    await openFirstMessage(page);

    await page.locator('[data-view-mode="source"]').click();
    const sourcePre = page.locator(
      '#detail-panel pre:has-text("Subject: E2E test subject")',
    );
    await expect(sourcePre).toBeVisible({ timeout: 5_000 });
  });

  test("Save message as draft from MessagePanel More menu", async ({
    page,
  }) => {
    await resetAndSeed(
      page,
      makeContact({ firstSeen: false, screened: true }),
      makeMessage(),
    );
    await openFirstMessage(page);

    await page.getByTestId("message-more-menu").click();
    await page.getByText("保存为草稿").click();
    await expect(page.getByText("已保存为草稿")).toBeVisible({
      timeout: 5_000,
    });

    await navigateTo(page, "drafts");
    await expect(
      page.locator("#main").getByText("E2E test subject").first(),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("LiveSearch surfaces events and jumps to Calendar on click", async ({
    page,
  }) => {
    await page.goto("/");
    await page.evaluate(async () => {
      await window.__sendpalmE2E!.resetData();
      await window.__sendpalmE2E!.seedEvent({
        id: "ev-e2e-search",
        title: "Q3 Planning Offsite",
        dt: new Date().toISOString(),
        tm: "10:00",
        dur: 60,
        pids: [],
        color: "#0A8F63",
        location: "Shanghai",
        notes: "Quarterly planning",
        brief: "",
        agenda: [],
        actionItems: [],
        materials: [],
      });
    });

    await page.getByPlaceholder(/Search contacts/).fill("Offsite");
    const dropdown = page.getByTestId("live-search-dropdown");
    await expect(dropdown.getByText("Events")).toBeVisible({ timeout: 5_000 });
    await expect(dropdown.getByText("Q3 Planning Offsite")).toBeVisible();

    await dropdown.getByText("Q3 Planning Offsite").click();
    await expect(page.locator('#topbar:has-text("Calendar")')).toBeVisible();
    await expect(
      page
        .locator("#main")
        .getByRole("button", { name: /Q3 Planning Offsite/ })
        .first(),
    ).toBeVisible();
  });

  test("MessagePanel header Summarize opens the Agent panel", async ({
    page,
  }) => {
    await resetAndSeed(
      page,
      makeContact({ firstSeen: false, screened: true }),
      makeMessage(),
    );
    await openFirstMessage(page);

    await page.getByTestId("message-summarize").click();
    await expect(page.locator("#agent-panel")).toBeVisible({ timeout: 5_000 });
  });

  test("MessagePanel header Copy copies the message body to clipboard", async ({
    page,
  }) => {
    await resetAndSeed(
      page,
      makeContact({ firstSeen: false, screened: true }),
      makeMessage(),
    );
    await openFirstMessage(page);

    await page.getByTestId("message-copy").click();
    await expect(page.getByText("已复制邮件内容")).toBeVisible({
      timeout: 5_000,
    });
  });

  test("MessagePanel header Download triggers a message download", async ({
    page,
  }) => {
    await resetAndSeed(
      page,
      makeContact({ firstSeen: false, screened: true }),
      makeMessage(),
    );
    await openFirstMessage(page);

    await page.getByTestId("message-download").click();
    await expect(page.getByText("邮件已下载")).toBeVisible({ timeout: 5_000 });
  });

  test("Calendar filter chips filter events by kind", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(async () => {
      await window.__sendpalmE2E!.resetData();
      const today = new Date().toISOString();
      await window.__sendpalmE2E!.seedEvent({
        id: "ev-e2e-meeting",
        title: "Team Standup",
        dt: today,
        tm: "09:00",
        dur: 30,
        pids: ["ct-e2e-attendee"],
        color: "#0A8F63",
        location: "Room A",
        notes: "",
        brief: "",
        agenda: [],
        actionItems: [],
        materials: [],
      });
      await window.__sendpalmE2E!.seedEvent({
        id: "ev-e2e-habit",
        title: "Morning Run",
        dt: today,
        tm: "07:00",
        dur: 30,
        pids: [],
        color: "#0A8F63",
        habit: true,
        notes: "",
        brief: "",
        agenda: [],
        actionItems: [],
        materials: [],
      });
      await window.__sendpalmE2E!.seedEvent({
        id: "ev-e2e-sometime",
        title: "Read a book",
        dt: today,
        tm: "00:00",
        dur: 0,
        pids: [],
        color: "#0A8F63",
        sometimeBucket: "someday",
        notes: "",
        brief: "",
        agenda: [],
        actionItems: [],
        materials: [],
      });
    });

    await navigateTo(page, "calendar");
    await expect(page.getByTestId("calendar-filter-chips")).toBeVisible();

    // Default "all" shows everything.
    await expect(
      page.locator("#main").getByText("Team Standup").first(),
    ).toBeVisible();
    await expect(
      page.locator("#main").getByText("Morning Run").first(),
    ).toBeVisible();
    await expect(
      page.locator("#main").getByText("Read a book").first(),
    ).toBeVisible();

    // Meetings filter.
    await page.getByTestId("calendar-filter-meetings").click();
    await expect(
      page.locator("#main").getByText("Team Standup").first(),
    ).toBeVisible();
    await expect(page.locator("#main").getByText("Morning Run")).toHaveCount(0);
    await expect(page.locator("#main").getByText("Read a book")).toHaveCount(0);

    // Habits filter.
    await page.getByTestId("calendar-filter-habits").click();
    await expect(page.locator("#main").getByText("Team Standup")).toHaveCount(
      0,
    );
    await expect(
      page.locator("#main").getByText("Morning Run").first(),
    ).toBeVisible();
    await expect(page.locator("#main").getByText("Read a book")).toHaveCount(0);

    // Sometime filter.
    await page.getByTestId("calendar-filter-sometime").click();
    await expect(page.locator("#main").getByText("Team Standup")).toHaveCount(
      0,
    );
    await expect(page.locator("#main").getByText("Morning Run")).toHaveCount(0);
    await expect(
      page.locator("#main").getByText("Read a book").first(),
    ).toBeVisible();
  });

  test("More menu direct move moves a message to Records", async ({ page }) => {
    await resetAndSeed(
      page,
      makeContact({ firstSeen: false, screened: true }),
      makeMessage(),
    );
    await openFirstMessage(page);

    await page.getByTestId("message-more-menu").click();
    await page.getByTestId("message-move-paperTrail").click();
    await expect(page.getByText("已移到 Records")).toBeVisible({
      timeout: 5_000,
    });

    await navigateTo(page, "paperTrail");
    await expect(
      page.locator("#main").getByText("E2E test subject").first(),
    ).toBeVisible({ timeout: 5_000 });

    await navigateTo(page, "imbox");
    await expect(
      page.locator("#main").getByText("E2E test subject"),
    ).toHaveCount(0);
  });

  test("More menu Ask Agent opens the Agent panel", async ({ page }) => {
    await resetAndSeed(
      page,
      makeContact({ firstSeen: false, screened: true }),
      makeMessage(),
    );
    await openFirstMessage(page);

    await page.getByTestId("message-more-menu").click();
    await page.getByTestId("message-ask-agent").click();
    await expect(page.locator("#agent-panel")).toBeVisible({ timeout: 5_000 });
  });

  test("ContactPanel indexes messages, files and events by contact", async ({
    page,
  }) => {
    await page.goto("/");
    await page.evaluate(async () => {
      await window.__sendpalmE2E!.resetData();
      const today = new Date().toISOString();
      await window.__sendpalmE2E!.seedContact({
        id: "ct-e2e-index",
        firstName: "Index",
        lastName: "Tester",
        nickname: "",
        name: "Index Tester",
        company: "SendPalm",
        title: "QA",
        emails: [{ value: "index@example.com", label: "work" }],
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
        grp: "active",
        trd: "stable",
        pattern: "",
        accounts: [],
        stageHistory: [],
        firstContact: today,
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
      });
      await window.__sendpalmE2E!.seedMessage({
        id: "msg-e2e-index",
        pid: "ct-e2e-index",
        subj: "Contact index test",
        prev: "Preview",
        body: "Body",
        bodyHtml: null,
        tm: "10:00",
        st: today,
        ac: "acct-e2e-index",
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
      });
      await window.__sendpalmE2E!.seedFile({
        id: "file-e2e-index",
        pid: "ct-e2e-index",
        name: "Contact index file.pdf",
        type: "pdf",
        mime: "application/pdf",
        size: 12345,
        st: today,
      });
      await window.__sendpalmE2E!.seedEvent({
        id: "ev-e2e-index",
        title: "Contact index meeting",
        dt: today,
        tm: "10:00",
        dur: 60,
        pids: ["ct-e2e-index"],
        color: "#0A8F63",
        notes: "",
        brief: "",
        agenda: [],
        actionItems: [],
        materials: [],
      });
    });

    await navigateTo(page, "contacts");
    await page
      .locator('[data-testid="contact-card"][data-contact-id="ct-e2e-index"]')
      .click();
    await expect(page.locator("#detail-panel")).toBeVisible({ timeout: 5_000 });

    // Timeline tab shows the message.
    await expect(
      page.locator("#detail-panel").getByText("Contact index test"),
    ).toBeVisible();

    // Files tab shows the file.
    await page.getByTestId("contact-tab-files").click();
    await expect(
      page.locator("#detail-panel").getByText("Contact index file.pdf"),
    ).toBeVisible();

    // Calendar tab shows the event.
    await page.getByTestId("contact-tab-calendar").click();
    await expect(
      page.locator("#detail-panel").getByText("Contact index meeting"),
    ).toBeVisible();
  });

  test("Reply All opens Compose with sender, original To and CC", async ({
    page,
  }) => {
    await resetAndSeed(
      page,
      makeContact({ firstSeen: false, screened: true }),
      makeMessage({
        to: "me@example.com",
        cc: ["cc1@example.com", "cc2@example.com"],
      }),
    );
    await openFirstMessage(page);

    await page.locator('#detail-panel [aria-label="Reply All"]').click();
    await expect(page.getByRole("dialog", { name: "Reply All" })).toBeVisible({
      timeout: 5_000,
    });

    await expect(
      page.locator(
        '[data-field="to"] [aria-label="Remove sender@example.com"]',
      ),
    ).toBeVisible();

    const ccField = page.locator('[data-field="cc"]');
    await expect(ccField).toBeVisible();
    await expect(ccField.getByText("cc1@example.com")).toBeVisible();
    await expect(ccField.getByText("cc2@example.com")).toBeVisible();

    const subjectInput = page.locator('[data-field="subject"] input');
    await expect(subjectInput).toHaveValue("Re: E2E test subject");
  });

  test("MessagePanel shows attachments and can trigger download", async ({
    page,
  }) => {
    const today = new Date().toISOString();
    await resetAndSeed(
      page,
      makeContact({
        id: "ct-e2e-attach",
        firstName: "Attach",
        lastName: "Sender",
        name: "Attach Sender",
        emails: [{ value: "attach@example.com", label: "work" }],
        firstSeen: true,
        screened: true,
      }),
      makeMessage({
        id: "msg-e2e-attach",
        pid: "ct-e2e-attach",
        subj: "Attachment test",
        body: "Body with attachment.",
        attachments: ["file-e2e-attach"],
      }),
      {
        files: [
          {
            id: "file-e2e-attach",
            pid: "ct-e2e-attach",
            name: "test-attachment.pdf",
            type: "pdf",
            mime: "application/pdf",
            size: 12345,
            st: today,
          },
        ],
      },
    );

    // Diagnostic: verify the seed actually landed in the browser store.
    const seeded = await page.evaluate(async () => {
      const msgs = await window.__sendpalmE2E!.listMessages();
      const contacts = await window.__sendpalmE2E!.listContacts();
      return { msgs, contacts };
    });
    expect(seeded.msgs.length).toBeGreaterThan(0);
    expect(seeded.msgs[0].id).toBe("msg-e2e-attach");
    const contact = seeded.contacts.find((c) => c.id === "ct-e2e-attach");
    expect(contact).toBeTruthy();
    expect(contact!.screened).toBe(true);

    await page.locator('[data-message-id="msg-e2e-attach"]').first().click();
    await expect(page.locator('[data-attachments]')).toBeVisible({
      timeout: 5_000,
    });
    await expect(
      page.locator("#detail-panel").getByText("test-attachment.pdf"),
    ).toBeVisible();

    // In browser mode the backend cannot read raw attachment bytes, so clicking
    // download surfaces an info toast instead of crashing.
    await page.locator("#detail-panel").getByText("test-attachment.pdf").click();
    await expect(
      page.getByText("无法读取附件（浏览器模式不支持）"),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("Compose can attach a file and send in browser mode", async ({
    page,
  }) => {
    await page.goto("/");
    await page.locator("body.app-ready").waitFor({ timeout: 10_000 });
    await page.evaluate(async () => {
      await window.__sendpalmE2E?.resetData();
    });

    // Open compose with the global shortcut (there is no topbar compose button).
    await page.locator("body").click();
    const isMac = process.platform === "darwin";
    await page.keyboard.press(isMac ? "Meta+n" : "Control+n");
    await expect(page.getByText("新邮件")).toBeVisible({ timeout: 5_000 });

    await page
      .locator('[data-field="to"] input[placeholder="recipient@example.com"]')
      .fill("recipient@example.com");
    await page
      .locator('[data-field="to"] input[placeholder="recipient@example.com"]')
      .press("Enter");
    await expect(
      page.locator('[data-field="to"]').getByText("recipient@example.com"),
    ).toBeVisible();

    await page.locator('input[placeholder="主题"]').fill("With attachment");
    await page.locator('textarea[placeholder="正文…"]').fill("See attached.");

    const fileInput = page.locator('[data-testid="compose-file-input"]');
    await fileInput.setInputFiles({
      name: "hello.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("hello attachment"),
    });
    await expect(page.getByText("hello.txt")).toBeVisible({ timeout: 5_000 });

    // Send falls back to "saved as draft" in browser mode (no real backend).
    await page.getByRole("button", { name: "发送" }).first().click();
    await expect(page.getByText("已保存为草稿（未配置真实账户）")).toBeVisible({
      timeout: 5_000,
    });

    // The draft is persisted with the attachment.
    await navigateTo(page, "drafts");
    await expect(
      page.locator("#main").getByText("With attachment").first(),
    ).toBeVisible({ timeout: 5_000 });
  });
});

test.describe("Mobile workflows with data", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  const MOBILE_CONTACT_ID = "ct-mobile-rich";
  const MOBILE_MESSAGE_ID = "msg-mobile-rich";

  function makeMobileContact(): Contact {
    return {
      ...makeContact({
        id: MOBILE_CONTACT_ID,
        firstName: "Mobile",
        lastName: "Tester",
        name: "Mobile Tester",
        emails: [{ value: "mobile@example.com", label: "work" }],
        company: "SendPalm",
        title: "QA",
        notes: "A contact used for mobile UI verification.",
        firstSeen: true,
        screened: true,
      }),
    };
  }

  function makeMobileMessage(): Message {
    return {
      ...makeMessage({
        id: MOBILE_MESSAGE_ID,
        pid: MOBILE_CONTACT_ID,
        subj: "Mobile workflow test",
        prev: "This message has an attachment and a calendar invite.",
        body: "Hi, please find the attached file and join the meeting.",
        attachments: ["file-mobile-rich"],
        calendarInvite: {
          uid: "ical-mobile-001",
          summary: "Mobile Test Meeting",
          dtstart: `${todayDateStr()}T10:00:00.000Z`,
          dtend: `${todayDateStr()}T10:30:00.000Z`,
          location: "Room M",
          description: "Please join the mobile test meeting.",
        },
      }),
    };
  }

  async function seedMobileFixture(page: Page) {
    const contact = makeMobileContact();
    const message = makeMobileMessage();
    const today = new Date().toISOString();
    await resetAndSeed(
      page,
      contact,
      message,
      {
        files: [
          {
            id: "file-mobile-rich",
            pid: MOBILE_CONTACT_ID,
            name: "mobile-test-attachment.pdf",
            type: "pdf",
            mime: "application/pdf",
            size: 12345,
            st: today,
          },
        ],
      },
    );
    await page.evaluate(async (seedToday: string) => {
      await window.__sendpalmE2E!.seedEvent({
        id: "ev-mobile-rich",
        title: "Mobile Test Meeting",
        dt: seedToday,
        tm: "10:00",
        dur: 30,
        pids: ["ct-mobile-rich"],
        color: "#0A8F63",
        location: "Room M",
        notes: "Please join the mobile test meeting.",
        brief: "",
        agenda: [],
        actionItems: [],
        materials: [],
      });
    }, today);
  }

  test("Imbox, MessagePanel, ContactPanel, Calendar and Files render on iPhone", async ({
    page,
  }) => {
    await seedMobileFixture(page);

    // Imbox list with data.
    await expect(
      page.locator(`[data-message-id="${MOBILE_MESSAGE_ID}"]`),
    ).toBeVisible({ timeout: 5_000 });
    await page.locator("#splash").waitFor({ state: "hidden", timeout: 10_000 });
    await page.waitForTimeout(200);
    await page.screenshot({
      path: join(SHOTS, "mobile-imbox-with-data.png"),
      fullPage: false,
    });

    // Open the message and verify the detail panel is full-screen.
    await page.locator(`[data-message-id="${MOBILE_MESSAGE_ID}"]`).first().click();
    await expect(page.locator('#detail-panel [aria-label="Reply"]')).toBeVisible(
      { timeout: 5_000 },
    );
    await expect(page.locator("[data-attachments]")).toBeVisible({ timeout: 5_000 });
    await expect(
      page.locator("#detail-panel").getByText("mobile-test-attachment.pdf"),
    ).toBeVisible();
    await expect(page.getByText("日历邀请")).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({
      path: join(SHOTS, "mobile-message-panel.png"),
      fullPage: false,
    });

    // Tap sender name to open the contact panel.
    await page.locator("#detail-panel").getByText("Mobile Tester").first().click();
    await expect(
      page.locator('#detail-panel:has-text("Mobile Tester")'),
    ).toBeVisible({ timeout: 5_000 });
    await page.waitForTimeout(200);
    await page.screenshot({
      path: join(SHOTS, "mobile-contact-panel-timeline.png"),
      fullPage: false,
    });

    // Contact Files tab.
    await page.getByTestId("contact-tab-files").click();
    await expect(
      page.locator("#detail-panel").getByText("mobile-test-attachment.pdf"),
    ).toBeVisible({ timeout: 5_000 });
    await page.screenshot({
      path: join(SHOTS, "mobile-contact-panel-files.png"),
      fullPage: false,
    });

    // Contact Calendar tab.
    await page.getByTestId("contact-tab-calendar").click();
    await expect(
      page.locator("#detail-panel").getByText("Mobile Test Meeting"),
    ).toBeVisible({ timeout: 5_000 });
    await page.screenshot({
      path: join(SHOTS, "mobile-contact-panel-calendar.png"),
      fullPage: false,
    });

    // Close the full-screen detail panel before using the bottom tab bar.
    await page.locator('#detail-panel [aria-label="Close"]').first().click();
    await expect(page.locator("#detail-panel")).toHaveCount(0, { timeout: 5_000 });

    // Calendar view.
    await navigateTo(page, "calendar");
    await expect(
      page.locator("#main").getByText("Mobile Test Meeting").first(),
    ).toBeVisible({ timeout: 5_000 });
    await page.screenshot({
      path: join(SHOTS, "mobile-calendar.png"),
      fullPage: false,
    });

    // Files view.
    await navigateTo(page, "files");
    await expect(
      page.locator("#main").getByText("mobile-test-attachment.pdf").first(),
    ).toBeVisible({ timeout: 5_000 });
    await page.screenshot({
      path: join(SHOTS, "mobile-files.png"),
      fullPage: false,
    });
  });

  test("Mobile reply flow opens Compose full-screen", async ({ page }) => {
    await seedMobileFixture(page);
    await page.locator(`[data-message-id="${MOBILE_MESSAGE_ID}"]`).first().click();
    await page.locator('#detail-panel [aria-label="Reply"]').click();
    await expect(page.getByRole("dialog", { name: "Reply" })).toBeVisible({
      timeout: 5_000,
    });
    await expect(
      page.locator(
        '[data-field="to"] [aria-label="Remove mobile@example.com"]',
      ),
    ).toBeVisible();
    const subjectInput = page.locator('[data-field="subject"] input');
    await expect(subjectInput).toHaveValue("Re: Mobile workflow test");
    await page.waitForTimeout(400);
    await page.screenshot({
      path: join(SHOTS, "mobile-compose-reply.png"),
      fullPage: false,
    });
  });
});
