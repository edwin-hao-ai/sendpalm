/** The browser-mode Tauri shim's answer contract.
 *
 *  Two classes of bug hid behind this shim before:
 *  - a command that returns `()` resolves to `null`, so `r !== null` read
 *    every success as a failure (`vaultSave` on the phone, §11.23);
 *  - the same shape in the *browser* read every unperformed action as a
 *    success, because the shim answered `null` for commands it did not know —
 *    the add-a-mailbox flow then claimed a connection it never attempted.
 *
 *  So the shim's contract is asserted here: reads answer with empty data,
 *  keychain writes reject (there is no keychain), and unknown commands still
 *  answer `null` so `safeInvoke` keeps its fallback shape.
 */

import { describe, it, expect, beforeAll } from "vitest";
import "./tauri-shim";

interface ShimWindow {
  __TAURI_INTERNALS__?: { invoke: (cmd: string, args?: unknown) => Promise<unknown> };
}

function invoke(cmd: string, args?: unknown): Promise<unknown> {
  const internals = (window as unknown as ShimWindow).__TAURI_INTERNALS__;
  if (!internals) throw new Error("shim did not install __TAURI_INTERNALS__");
  return internals.invoke(cmd, args);
}

describe("browser-mode shim", () => {
  beforeAll(() => {
    // setup.ts mocks `@tauri-apps/api/core` but never installs the window
    // global; importing the shim above does, once, at module evaluation.
    expect((window as unknown as ShimWindow).__TAURI_INTERNALS__).toBeTruthy();
  });

  it("rejects keychain writes, because a browser has no OS keychain", async () => {
    await expect(invoke("vault_save", { accountId: "a", password: "p" })).rejects.toThrow(
      /no OS keychain/,
    );
    await expect(invoke("vault_delete", { accountId: "a" })).rejects.toThrow(
      /no OS keychain/,
    );
    await expect(invoke("vault_set_secret", { key: "k", value: "v" })).rejects.toThrow(
      /no OS keychain/,
    );
  });

  it("answers reads with empty data rather than failing", async () => {
    await expect(invoke("list_messages")).resolves.toEqual([]);
    await expect(invoke("list_labels")).resolves.toEqual([]);
    // A read the shim does not know still answers null, which is what
    // `safeInvoke`'s fallback shape expects.
    await expect(invoke("some_future_read")).resolves.toBeNull();
  });

  it("echoes the rule id the screener writes, so 'saved' is not a lie", async () => {
    await expect(
      invoke("upsert_mail_rule", { rule: { id: "rule_42" } }),
    ).resolves.toBe("rule_42");
  });
});
