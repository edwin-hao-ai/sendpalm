/** Agent drafts — approving one must actually put it in 草稿箱.
 *
 *  Regression guard: `approveDraft` used to flip a status on `agent_drafts`
 *  and toast "可在草稿箱中发送", but 草稿箱 reads the separate `drafts` table,
 *  so the approved draft never appeared anywhere and could not be sent.
 */

import { test, expect, type Page } from "@playwright/test";
import type { AgentDraft, AgentSession } from "../src/types";

const SESSION_ID = "as-e2e";
const DRAFT_ID = "ad-e2e";
const SUBJECT = "E2E agent draft subject";

const session: AgentSession = {
  id: SESSION_ID,
  kind: "freeform",
  title: "E2E session",
  context: null,
  createdAt: "2026-11-08T00:00:00.000Z",
};

const draft: AgentDraft = {
  id: DRAFT_ID,
  sessionId: SESSION_ID,
  recipient: "someone@example.com",
  subject: SUBJECT,
  body: "Hello from the agent.",
  status: "pending",
  createdAt: "2026-11-08T00:00:00.000Z",
};

async function seed(page: Page) {
  await page.goto("/");
  await page.locator("body.app-ready").waitFor({ timeout: 10_000 });
  await page.evaluate(async () => {
    await window.__sendpalmE2E?.resetData();
  });
  const payload = JSON.stringify({
    accounts: [],
    contacts: [],
    messages: [],
    agentSessions: [session],
    agentDrafts: [draft],
  });
  await page.addInitScript((s: string) => {
    sessionStorage.setItem("__sendpalm_e2e_seed", s);
  }, payload);
  await page.goto("/");
  await page.locator("body.app-ready").waitFor({ timeout: 10_000 });
}

test.describe("Agent drafts", () => {
  test("approving an agent draft makes it a real draft in 草稿箱", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await seed(page);

    // Reach the Agent workspace the way a user would.
    await page.keyboard.press("Meta+k");
    await page.getByRole("textbox", { name: "搜索命令" }).fill("Agent");
    await page.getByText("打开 Agent", { exact: false }).first().click();

    await expect(page.getByText(SUBJECT)).toBeVisible({ timeout: 5_000 });
    // The seeded session is the only one, so it is the active session and
    // this is its only pending draft.
    await page.getByRole("button", { name: "批准" }).first().click();

    // The toast's promise: it is now in 草稿箱.
    await page.locator('#sidebar [data-nav-view="drafts"]').click();
    await expect(page.getByText(SUBJECT)).toBeVisible({ timeout: 5_000 });
  });
});
