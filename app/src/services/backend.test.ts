import { describe, it, expect, beforeEach, vi } from "vitest";
import * as backend from "./backend";

// `vi.mock` factories are hoisted to the top of the file before imports, so
// any spy the factory references must itself be hoisted. `vi.hoisted` is the
// official way to allocate hoisting-safe state for use inside `vi.mock`.
const { invokeMock, storeGet, storeSet, storeSave } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  storeGet: vi.fn(),
  storeSet: vi.fn(),
  storeSave: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => {
    invokeMock(...args);
    return Promise.resolve(null);
  },
}));

vi.mock("@tauri-apps/plugin-store", () => ({
  load: () =>
    Promise.resolve({
      get: (...args: unknown[]) => {
        storeGet(...args);
        return Promise.resolve(undefined);
      },
      set: (...args: unknown[]) => {
        storeSet(...args);
        return Promise.resolve();
      },
      save: () => {
        storeSave();
        return Promise.resolve();
      },
    }),
}));

describe("IPC payload keys (Tauri 2 default = camelCase)", () => {
  beforeEach(() => invokeMock.mockClear());

  it("sendEmailViaBackend — sends camelCase keys (no html_body / account_id / from_override)", async () => {
    await backend.sendEmailViaBackend(
      "a@b",
      "s",
      "b",
      "acc-1",
      [],
      "",
      "",
      "me@x",
      "<p>x</p>",
    );
    const [, args] = invokeMock.mock.calls[0]!;
    expect(args).toEqual({
      to: "a@b",
      subject: "s",
      body: "b",
      htmlBody: "<p>x</p>",
      accountId: "acc-1",
      attachments: [],
      cc: "",
      bcc: "",
      fromOverride: "me@x",
    });
    expect(args).not.toHaveProperty("html_body");
    expect(args).not.toHaveProperty("account_id");
    expect(args).not.toHaveProperty("from_override");
  });

  it("fetchMailboxes — sends { accountId }", async () => {
    await backend.fetchMailboxes("acc-1");
    const [, args] = invokeMock.mock.calls[0]!;
    expect(args).toEqual({ accountId: "acc-1" });
    expect(args).not.toHaveProperty("account_id");
  });

  it("syncNow — sends { accountId, mailbox }", async () => {
    await backend.syncNow("acc-1", "INBOX");
    const [, args] = invokeMock.mock.calls[0]!;
    expect(args).toEqual({ accountId: "acc-1", mailbox: "INBOX" });
    expect(args).not.toHaveProperty("account_id");
  });

  it("regression guard: 7 already-correct commands still camelCase", async () => {
    for (const [name, call] of [
      ["getSyncState", () => backend.getSyncState("acc-1")],
      ["listProviders", () => backend.listProviders()],
      ["vaultSave", () => backend.vaultSave("acc-1", "pw")],
      ["vaultLoad", () => backend.vaultLoad("acc-1")],
      ["vaultDelete", () => backend.vaultDelete("acc-1")],
      ["getAttachmentContent", () => backend.getAttachmentContent("f-1")],
      ["getAttachmentPath", () => backend.getAttachmentPath("f-1")],
    ] as const) {
      invokeMock.mockClear();
      await call();
      const args = (invokeMock.mock.calls[0]?.[1] ?? {}) as Record<
        string,
        unknown
      >;
      expect(
        JSON.stringify(args),
        `command "${name}" payload has snake_case key`,
      ).not.toMatch(/_/);
    }
  });
});

describe("image sender policy (per-sender ask/always)", () => {
  beforeEach(() => {
    storeGet.mockReset();
    storeSet.mockReset();
    storeSave.mockReset();
    storeGet.mockResolvedValue(undefined);
    storeSet.mockResolvedValue(undefined);
    storeSave.mockResolvedValue(undefined);
  });

  it("getImageSenderPolicy returns 'ask' when no policy stored for sender", async () => {
    const policy = await backend.getImageSenderPolicy("alice@example.com");
    expect(policy).toBe("ask");
    expect(storeGet).toHaveBeenCalledWith("email-image-policy");
  });

  it("setImageSenderPolicy persists the policy and saves the store", async () => {
    await backend.setImageSenderPolicy("alice@example.com", "always");
    expect(storeGet).toHaveBeenCalledWith("email-image-policy");
    expect(storeSet).toHaveBeenCalledWith("email-image-policy", {
      "alice@example.com": "always",
    });
    expect(storeSave).toHaveBeenCalledTimes(1);
  });
});