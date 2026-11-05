/** SyncBadge — the topbar sync status must tell the truth about the
 *  mailbox: never claim "recently synced" from a failed attempt, never
 *  render the Unix epoch as a plausible time, and make the fix for a
 *  missing password one click away. */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@solidjs/testing-library";

const getSyncStateMock = vi.fn();

vi.mock("../services/backend", () => ({
  getSyncState: (...args: unknown[]) => getSyncStateMock(...args),
  syncNow: vi.fn(),
}));

vi.mock("../stores/data", () => ({
  listAccounts: () =>
    Promise.resolve([
      {
        id: "acct_1",
        type: "email",
        label: "me@example.com",
        email: "me@example.com",
      },
    ]),
  countUnreadNotifications: () => Promise.resolve(0),
}));

import { SyncBadge } from "./Topbar";
import { view, settingsTab } from "../stores/ui";

function syncState(overrides: Record<string, unknown>) {
  return {
    account_id: "acct_1",
    uid_validity: 0,
    last_uid: 0,
    last_synced_at: "1970-01-01T00:00:00+00:00",
    busy: false,
    status: "never_synced",
    error_code: null,
    ...overrides,
  };
}

async function openPopover() {
  render(() => <SyncBadge />);
  // Wait until the account list has loaded — before that the badge
  // button navigates to settings instead of toggling the popover.
  await screen.findByText("1 个账户");
  fireEvent.click(screen.getByLabelText("邮箱同步状态"));
  await screen.findByText("me@example.com");
}

describe("SyncBadge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("explains missing credentials and links to account settings", async () => {
    getSyncStateMock.mockResolvedValue(
      syncState({ status: "needs_credentials", error_code: "missing_credentials" }),
    );
    await openPopover();

    expect(screen.getByText("需要输入密码")).toBeTruthy();
    fireEvent.click(screen.getByText("去设置"));
    expect(view()).toBe("settings");
    expect(settingsTab()).toBe("accounts");
  });

  it("shows 尚未同步 instead of the Unix epoch when nothing synced yet", async () => {
    getSyncStateMock.mockResolvedValue(syncState({ status: "never_synced" }));
    await openPopover();

    expect(screen.getByText("尚未同步")).toBeTruthy();
    expect(screen.queryByText(/1970/)).toBeNull();
  });

  it("shows the last successful sync time when connected", async () => {
    getSyncStateMock.mockResolvedValue(
      syncState({
        status: "connected",
        last_synced_at: new Date().toISOString(),
      }),
    );
    await openPopover();

    expect(screen.getByText(/最近同步/)).toBeTruthy();
  });

  it("reports a failed sync without leaking credential details", async () => {
    getSyncStateMock.mockResolvedValue(
      syncState({ status: "error", error_code: "sync_failed" }),
    );
    await openPopover();

    expect(screen.getByText("同步失败")).toBeTruthy();
    const popover = document.querySelector("[data-sync-popover]")!;
    expect(popover.textContent).not.toContain("password");
    expect(popover.textContent).not.toContain("keyring");
  });
});
