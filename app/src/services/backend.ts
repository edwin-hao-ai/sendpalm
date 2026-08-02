/** Tauri backend bridge — calls real Rust commands when running in the
 * Tauri shell, falls back to local-only mode when running in the browser
 * (e.g. during `vite dev` standalone).
 *
 * Specifically for the new IMAP/SMTP backend (M10).
 */

import { invoke } from "@tauri-apps/api/core";

const IS_TAURI = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

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
): Promise<{ message_id: string }> {
  if (!IS_TAURI) throw new Error("send requires Tauri runtime");
  return invoke<{ message_id: string }>("send_message", { to, subject, body });
}

export async function fetchMailboxes(): Promise<string[]> {
  if (!IS_TAURI) return [];
  return invoke<string[]>("list_mailboxes");
}

export async function syncNow(
  accountId: string,
  mailbox: string = "INBOX"
): Promise<{ new_messages: number; last_uid: number }> {
  if (!IS_TAURI) throw new Error("sync requires Tauri runtime");
  return invoke("sync_now", { accountId, mailbox });
}

export async function getSyncState(
  accountId: string
): Promise<SyncStateDto> {
  if (!IS_TAURI) {
    return {
      account_id: accountId,
      uid_validity: 0,
      last_uid: 0,
      last_synced_at: "未配置（无 Tauri runtime）",
    };
  }
  return invoke<SyncStateDto>("get_sync_state", { accountId });
}

export async function listProviders(): Promise<EmailProvider[]> {
  if (!IS_TAURI) return [];
  return invoke<EmailProvider[]>("list_email_providers");
}

// ── OS Keychain vault ──

export async function vaultSave(
  accountId: string,
  password: string
): Promise<void> {
  if (!IS_TAURI) throw new Error("vault requires Tauri runtime");
  await invoke("vault_save", { accountId, password });
}

export async function vaultLoad(
  accountId: string
): Promise<string | null> {
  if (!IS_TAURI) return null;
  return invoke<string | null>("vault_load", { accountId });
}

export async function vaultDelete(accountId: string): Promise<void> {
  if (!IS_TAURI) return;
  await invoke("vault_delete", { accountId });
}