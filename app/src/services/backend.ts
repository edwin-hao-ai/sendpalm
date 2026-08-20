/** Tauri backend bridge — calls real Rust commands when running in the
 * Tauri shell, falls back to local-only mode when running in the browser
 * (e.g. during `vite dev` standalone).
 *
 * Specifically for the new IMAP/SMTP backend (M10).
 */

import { invoke } from "@tauri-apps/api/core";
import { load } from "@tauri-apps/plugin-store";
// Importing the shim guarantees `window.__TAURI_INTERNALS__` is installed
// before this module evaluates, even in browser-only Playwright runs.
import "./tauri-shim";

const STORE_PATH = "sendpalm.prefs.json";
const IMAGE_POLICY_KEY = "email-image-policy";
export type ImageSenderPolicy = "always" | "ask";
type ImageSenderPolicyMap = Record<string, ImageSenderPolicy>;

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

export interface OutgoingAttachment {
  filename: string;
  mime: string;
  dataBase64: string;
}

export async function sendEmailViaBackend(
  to: string,
  subject: string,
  body: string,
  accountId?: string,
  attachments: OutgoingAttachment[] = [],
  cc?: string,
  bcc?: string,
  fromOverride?: string,
  htmlBody?: string,
): Promise<{ message_id: string; local_message_id?: string } | null> {
  return safeInvoke<{ message_id: string; local_message_id?: string }>(
    "send_message",
    {
      to,
      subject,
      body,
      htmlBody,
      accountId,
      attachments,
      cc,
      bcc,
      fromOverride,
    },
  );
}

export async function fetchMailboxes(accountId: string): Promise<string[]> {
  const r = await safeInvoke<string[]>("list_mailboxes", {
    accountId,
  });
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
      busy: false,
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

// ── Calendar invites ──

export interface IcalEvent {
  uid?: string;
  summary: string;
  dtstart?: string;
  dtstart_tzid?: string;
  dtend?: string;
  dtend_tzid?: string;
  location?: string;
  description?: string;
}

export async function addCalendarEvent(
  invite: IcalEvent,
  contactId?: string,
): Promise<string | null> {
  return safeInvoke<string>("add_calendar_event", { invite, contactId });
}

export type RsvpResponse = "ACCEPTED" | "DECLINED" | "TENTATIVE";

export async function respondToCalendarInvite(
  eventId: string,
  response: RsvpResponse,
): Promise<string | null> {
  return safeInvoke<string>("respond_to_calendar_invite", {
    eventId,
    response,
  });
}

export async function getAttachmentContent(
  fileId: string,
): Promise<string | null> {
  return safeInvoke<string>("get_attachment_content", { fileId });
}

export async function getAttachmentPath(
  fileId: string,
): Promise<string | null> {
  return safeInvoke<string>("get_attachment_path", { fileId });
}

// ── Image sender policy (per-sender always/ask) ──

export async function getImageSenderPolicy(
  sender: string,
): Promise<ImageSenderPolicy> {
  const store = await load(STORE_PATH);
  const map = (await store.get<ImageSenderPolicyMap>(IMAGE_POLICY_KEY)) ?? {};
  return map[sender] ?? "ask";
}

export async function setImageSenderPolicy(
  sender: string,
  policy: ImageSenderPolicy,
): Promise<void> {
  const store = await load(STORE_PATH);
  const map = (await store.get<ImageSenderPolicyMap>(IMAGE_POLICY_KEY)) ?? {};
  map[sender] = policy;
  await store.set(IMAGE_POLICY_KEY, map);
  await store.save();
}

// ── M11 — OpenAI-compatible LLM chat (drives the Agent panel) ─────

export interface LlmConfigWire {
  base_url: string;
  api_key: string;
  model: string;
  temperature: number;
  max_tokens: number;
}

export interface ChatMessageWire {
  role: string;
  content: string;
}

export interface ChatResponseWire {
  content: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  finish_reason?: string;
}

export async function agentChat(
  config: LlmConfigWire,
  messages: ChatMessageWire[],
): Promise<ChatResponseWire | null> {
  return safeInvoke<ChatResponseWire | null>("agent_chat", { config, messages });
}
