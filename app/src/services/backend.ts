/** Tauri backend bridge — calls real Rust commands when running in the
 * Tauri shell, falls back to local-only mode when running in the browser
 * (e.g. during `vite dev` standalone).
 *
 * Specifically for the new IMAP/SMTP backend (M10).
 */

import { invoke } from "@tauri-apps/api/core";

const IS_TAURI = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

// Wrap invoke in a try/catch so missing Tauri runtime doesn't crash the
// frontend in browser mode. In the Tauri build, IS_TAURI is true and the
// shim returns `null` for unknown commands, so we return that gracefully.
async function safeInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
  if (!IS_TAURI) return null;
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
  body: string
): Promise<{ message_id: string } | null> {
  return safeInvoke<{ message_id: string }>("send_message", { to, subject, body });
}

export async function fetchMailboxes(): Promise<string[]> {
  const r = await safeInvoke<string[]>("list_mailboxes");
  return r ?? [];
}

export async function syncNow(
  accountId: string,
  mailbox: string = "INBOX"
): Promise<{ new_messages: number; last_uid: number } | null> {
  return safeInvoke("sync_now", { accountId, mailbox });
}

export async function getSyncState(
  accountId: string
): Promise<SyncStateDto> {
  const r = await safeInvoke<SyncStateDto>("get_sync_state", { accountId });
  return r ?? {
    account_id: accountId,
    uid_validity: 0,
    last_uid: 0,
    last_synced_at: "未配置（无 Tauri runtime）",
  };
}

export async function listProviders(): Promise<EmailProvider[]> {
  const r = await safeInvoke<EmailProvider[]>("list_email_providers");
  return r ?? [];
}

// ── OS Keychain vault ──

export async function vaultSave(
  accountId: string,
  password: string
): Promise<boolean> {
  const r = await safeInvoke<void>("vault_save", { accountId, password });
  return r !== null;
}

export async function vaultLoad(
  accountId: string
): Promise<string | null> {
  return safeInvoke<string | null>("vault_load", { accountId });
}

export async function vaultDelete(accountId: string): Promise<boolean> {
  const r = await safeInvoke<void>("vault_delete", { accountId });
  return r !== null;
}