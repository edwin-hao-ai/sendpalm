/** Automated device runs: add a mailbox without the form.
 *
 *  iOS has no scriptable way to type into a WKWebView — XCUITest's accessibility
 *  snapshot of the app times out on a real iPhone — and the two things that only
 *  fail on a phone are the keychain write (`SecItemAdd`, -34018 without the right
 *  entitlement) and the first IMAP sync. So a device run hands the account in
 *  through the environment and this module runs the **same** code path the form
 *  runs (`upsertAccount` → `vaultSave` → `syncNow` → `getSyncState`), skipping
 *  only the typing.
 *
 *  Activated by `SENDPALM_E2E_SEED_EMAIL` / `SENDPALM_E2E_SEED_PASSWORD`
 *  (optional `SENDPALM_E2E_SEED_PROVIDER`, default `feishu`). Everything it does
 *  is logged to the console, which `devicectl device process launch --console`
 *  shows on the Mac — that console IS the test output.
 */

import { IS_BROWSER } from "./tauri-shim";
import { deleteAccount, listAccounts, upsertAccount } from "../stores/data";
import { getSyncState, syncNow, vaultDelete, vaultSave } from "./backend";
import { nextAccountColor } from "../utils/accounts";
import type { Account } from "../types";

interface SeedAccount {
  email: string;
  password: string;
  provider: string;
}

const LOG = "[e2e-seed]";

const LINES: string[] = [];

function log(message: string): void {
  LINES.push(`${new Date().toISOString()} ${message}`);
  // eslint-disable-next-line no-console
  console.log(`${LOG} ${message}`);
  void flush();
}

/** The device has no console we can read from the Mac, so the verdict is also
 *  written next to the database — `devicectl device info mountpoint` exposes the
 *  app container on the host, so this file IS the test output. */
async function flush(): Promise<void> {
  try {
    const { writeTextFile, BaseDirectory } = await import("@tauri-apps/plugin-fs");
    await writeTextFile("e2e-seed.log", LINES.join("\n"), {
      baseDir: BaseDirectory.AppData,
    });
  } catch {
    /* fs plugin unavailable — console.log still happened */
  }
}

/** Mirrors the shape `AddAccountModal` builds, so the seeded account and a
 *  hand-added one are indistinguishable downstream. */
export function accountFromSeed(
  seed: SeedAccount,
  existing: Account[],
): Account {
  const id = `acct_${seed.email.replace(/[^a-z0-9]/gi, "_")}`;
  return {
    id,
    type: "email",
    provider: seed.provider,
    email: seed.email,
    label: seed.provider,
    displayName: seed.email.split("@")[0] ?? seed.email,
    status: "connected",
    synced: 0,
    total: 0,
    privacy: "unified",
    color: nextAccountColor(existing),
    avatar: seed.provider[0]?.toUpperCase() ?? "M",
    lastSync: "刚刚",
    settings: {
      aliases: [],
      signature: `Best,\n${seed.email.split("@")[0] ?? ""}`,
      replyTo: "",
      defaultFrom: seed.email,
      syncFolders: [
        { name: "INBOX", enabled: true },
        { name: "Sent", enabled: true },
      ],
      syncFrequency: "15min",
      autoBcc: false,
      autoBccAddress: "",
      vacationResponder: { enabled: false, subject: "", body: "" },
    },
  } as unknown as Account;
}

/** Runs the add-a-mailbox flow once per launch when the environment asks for it.
 *  Returns a one-line verdict, which is what the device script greps for. */
export async function maybeSeedAccount(): Promise<string | null> {
  if (IS_BROWSER()) return null;
  let seed: SeedAccount | null;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    seed = await invoke<SeedAccount | null>("e2e_seed_account");
  } catch (err) {
    log(`seed command unavailable: ${String(err)}`);
    return null;
  }
  if (!seed) return null;

  const account = accountFromSeed(seed, (await listAccounts()) ?? []);
  log(`adding ${seed.email} (provider ${seed.provider}, id ${account.id})`);
  await upsertAccount(account);

  const stored = await vaultSave(account.id, seed.password);
  if (!stored) {
    log("FAILED: password did not reach the keychain (vaultSave returned false)");
    return "FAILED keychain";
  }
  log("keychain write ok");

  try {
    const report = await syncNow(account.id);
    log(`syncNow reports ${report?.new_messages ?? 0} new message(s)`);
  } catch (err) {
    log(`syncNow threw: ${String(err)}`);
  }

  const state = await getSyncState(account.id);
  log(
    `sync state: status=${state?.status} error=${state?.error_code ?? "none"} last=${state?.last_synced_at ?? "-"}`,
  );
  if (state?.error_code) {
    // A mailbox that cannot authenticate is not a half-success: remove it so the
    // next run starts clean, exactly like the form does on a rejected password.
    await deleteAccount(account.id).catch(() => undefined);
    await vaultDelete(account.id).catch(() => undefined);
    log(`RESULT: FAILED ${state.error_code}`);
    return `FAILED ${state.error_code}`;
  }
  log("RESULT: OK");
  return "OK";
}
