/** Tauri backend bridge — calls real Rust commands when running in the
 * Tauri shell, falls back to local-only mode when running in the browser
 * (e.g. during `vite dev` standalone).
 *
 * Specifically for the new IMAP/SMTP backend (M10).
 */

import { invoke } from "@tauri-apps/api/core";
// Importing the shim guarantees `window.__TAURI_INTERNALS__` is installed
// before this module evaluates, even in browser-only Playwright runs.
import "./tauri-shim";

// Call the Tauri invoke bridge. In the real Tauri shell this hits Rust
// commands; in browser mode the shim above answers known commands and the
// catch block turns any remaining failures (e.g. unknown commands or a missing
// runtime) into `null` so the UI can render its empty/fallback state.
async function safeInvoke<T>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T | null> {
  try {
    return await invoke<T>(cmd, args);
  } catch {
    return null;
  }
}

export interface SyncStateDto {
  account_id: string;
  uid_validity: number;
  last_uid: number;
  last_synced_at: string;
  busy: boolean;
}

export interface EmailProvider {
  id: string;
  label: string;
  icon: string;
  credentials_hint: string;
  imap_host: string;
  imap_port: number;
  smtp_host: string;
  smtp_port: number;
  auth_mode: "app-password" | "password-with-auth-code" | "oauth2-required";
  smtp_implicit_tls: boolean;
}

export async function sendEmailViaBackend(
  to: string,
  subject: string,
  body: string,
): Promise<{ message_id: string } | null> {
  return safeInvoke<{ message_id: string }>("send_message", {
    to,
    subject,
    body,
  });
}

export async function fetchMailboxes(): Promise<string[]> {
  const r = await safeInvoke<string[]>("list_mailboxes");
  return r ?? [];
}

export async function syncNow(
  accountId: string,
  mailbox: string = "INBOX",
): Promise<{ new_messages: number; last_uid: number } | null> {
  return safeInvoke("sync_now", { accountId, mailbox });
}

export async function getSyncState(accountId: string): Promise<SyncStateDto> {
  const r = await safeInvoke<SyncStateDto>("get_sync_state", { accountId });
  return (
    r ?? {
      account_id: accountId,
      uid_validity: 0,
      last_uid: 0,
      last_synced_at: "未配置（无 Tauri runtime）",
    }
  );
}

export async function listProviders(): Promise<EmailProvider[]> {
  const r = await safeInvoke<EmailProvider[]>("list_email_providers");
  return r ?? [];
}

// ── OS Keychain vault ──

export async function vaultSave(
  accountId: string,
  password: string,
): Promise<boolean> {
  const r = await safeInvoke<void>("vault_save", { accountId, password });
  return r !== null;
}

export async function vaultLoad(accountId: string): Promise<string | null> {
  return safeInvoke<string | null>("vault_load", { accountId });
}

export async function vaultDelete(accountId: string): Promise<boolean> {
  const r = await safeInvoke<void>("vault_delete", { accountId });
  return r !== null;
}
