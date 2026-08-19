/** Settings → Data backup / restore e2e tests — verify the export
 *  buttons in browser mode actually write downloads that round-trip
 *  the seeded data. These cover the user-reported gap in M9: the
 *  buttons existed in the UI but had no end-to-end coverage, so
 *  silent regressions (wrong query, empty list, malformed JSON)
 *  would not surface until a user actually clicked them.
 *
 *  Playwright's `page.on('download')` is the only reliable way to
 *  assert on the in-memory blob the Settings page constructs via
 *  `URL.createObjectURL` + `a.click()` — there is no real file on
 *  disk in headless browser mode.
 *
 *  We duplicate the makeContact / makeMessage / resetAndSeed
 *  fixtures rather than extract them into a shared helper because
 *  workflows.spec.ts uses a different Contact shape (firstName /
 *  lastName fields) and the cost of a shared helper that has to
 *  reconcile both is higher than 50 lines of duplication for now. */

import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import type { Contact, Message } from "../src/types";

const SHOTS = "test-results/shots/backup-restore";
const CONTACT_ID = "ct-backup-test";
const MESSAGE_ID = "msg-backup-001";
const ACCOUNT_ID = "acc-backup";

function makeContact(overrides?: Partial<Contact>): Contact {
  return {
    id: CONTACT_ID,
    name: "Backup Test Sender",
    emails: [{ value: "backup@example.com", type: "work" }],
    company: "Backup Co",
    title: "QA",
    stage: "lead",
    firstSeen: false,
    screened: true,
    avatar: null,
    notes: "",
    labels: [],
    lastSeenAt: null,
    ...overrides,
  };
}

function makeMessage(overrides?: Partial<Message>): Message {
  return {
    id: MESSAGE_ID,
    pid: CONTACT_ID,
    subj: "Backup test subject",
    prev: "Backup preview line.",
    body: "Hello from the backup e2e test.",
    bodyHtml: null,
    tm: "10:00",
    st: new Date().toISOString(),
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
): Promise<void> {
  await page.goto("/");
  await page.locator("body.app-ready").waitFor({ timeout: 10_000 });
  await page.evaluate(async () => {
    await window.__sendpalmE2E?.resetData();
  });
  const seed = JSON.stringify({
    contacts: [contact],
    messages: [message],
    files: [],
  });
  await page.addInitScript((s: string) => {
    sessionStorage.setItem("__sendpalm_e2e_seed", s);
  }, seed);
  await page.goto("/");
  await page.locator("body.app-ready").waitFor({ timeout: 10_000 });
}

test.beforeAll(async () => {
  await mkdir(dirname(SHOTS), { recursive: true });
});

async function shoot(page: Page, name: string) {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
}

async function clickAndCaptureDownload(
  page: Page,
  selector: string,
): Promise<{ name: string; body: string }> {
  // Listen BEFORE the click so the download event is captured even
  // if Playwright processes it slightly out of order.
  const downloadPromise = page.waitForEvent("download");
  await page.locator(selector).first().click();
  const dl = await downloadPromise;
  return {
    name: dl.suggestedFilename(),
    body: await dl.createReadStream().then(
      (s) =>
        new Promise<string>((resolve, reject) => {
          const chunks: Buffer[] = [];
          s.on("data", (c: Buffer | string) =>
            chunks.push(typeof c === "string" ? Buffer.from(c) : c),
          );
          s.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
          s.on("error", reject);
        }),
    ),
  };
}

test.describe("Settings → Data backup / restore", () => {
  test("Mailbox backup download contains the seeded messages and files", async ({
    page,
  }) => {
    const contact = makeContact({ firstSeen: false, screened: true });
    const message = makeMessage({ bucket: "imbox" });
    await resetAndSeed(page, contact, message);

    // Navigate to Settings → Data.
    await page.locator('[data-nav-view="settings"]').click();
    await page.locator('[data-testid="settings-menu-item-data"]').click();
    await expect(
      page.getByRole("button", { name: /导出 Mailbox backup/ }),
    ).toBeVisible({ timeout: 5_000 });
    await shoot(page, "01-settings-data");

    const { name, body } = await clickAndCaptureDownload(
      page,
      "button:has-text('导出 Mailbox backup')",
    );

    expect(name).toBe("sendpalm-mailbox-backup.json");
    const data = JSON.parse(body) as {
      exportedAt: string;
      messages: Array<{ id: string }>;
      files: unknown[];
    };
    expect(typeof data.exportedAt).toBe("string");
    expect(data.messages.map((m) => m.id)).toContain(message.id);
    expect(Array.isArray(data.files)).toBe(true);
  });

  test("Contacts CSV download contains the seeded contact email", async ({
    page,
  }) => {
    const contact = makeContact({ firstSeen: false, screened: true });
    await resetAndSeed(page, contact, makeMessage({ bucket: "imbox" }));

    await page.locator('[data-nav-view="settings"]').click();
    await page.locator('[data-testid="settings-menu-item-data"]').click();
    await expect(
      page.getByRole("button", { name: /导出 Contacts CSV/ }),
    ).toBeVisible({ timeout: 5_000 });

    const { name, body } = await clickAndCaptureDownload(
      page,
      "button:has-text('导出 Contacts CSV')",
    );

    expect(name).toBe("sendpalm-contacts.csv");
    const lines = body.split(/\r?\n/).filter(Boolean);
    expect(lines[0]).toContain("id,name,email");
    expect(lines.length).toBeGreaterThan(1);
    expect(body).toContain(contact.emails[0]?.value ?? "");
  });

  test("Tasks JSON download returns a parseable JSON document", async ({
    page,
  }) => {
    await resetAndSeed(
      page,
      makeContact({ firstSeen: false, screened: true }),
      makeMessage({ bucket: "imbox" }),
    );

    await page.locator('[data-nav-view="settings"]').click();
    await page.locator('[data-testid="settings-menu-item-data"]').click();
    await expect(
      page.getByRole("button", { name: /导出 Tasks JSON/ }),
    ).toBeVisible({ timeout: 5_000 });

    const { name, body } = await clickAndCaptureDownload(
      page,
      "button:has-text('导出 Tasks JSON')",
    );

    expect(name).toBe("sendpalm-tasks.json");
    const data = JSON.parse(body) as { exportedAt: string; tasks: unknown[] };
    expect(typeof data.exportedAt).toBe("string");
    expect(Array.isArray(data.tasks)).toBe(true);
  });
});
