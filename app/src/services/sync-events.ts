/** Sync event bridge — listens for real-time backend events and refreshes
 *  the frontend data stores so the Imbox / Notifications reflect new mail
 *  as soon as the Rust IMAP IDLE loop fetches it.
 *
 *  In browser mode (no Tauri runtime) this is a no-op because there is no
 *  background sync loop.
 */
import { listen } from "@tauri-apps/api/event";
import { IS_BROWSER } from "./tauri-shim";
import { listMessages, listNotifications } from "../stores/data";

export interface SyncReport {
  account_id: string;
  mailbox: string;
  new_messages: number;
  skipped: number;
  uid_validity: number;
  last_uid: number;
  error?: string | null;
}

export function startSyncEventBridge(): () => void {
  if (IS_BROWSER()) {
    return () => {};
  }

  let unlisten: (() => void) | undefined;

  listen<SyncReport>("sync:new-messages", async (_event) => {
    await Promise.all([listMessages(), listNotifications()]);
  })
    .then((fn) => {
      unlisten = fn;
    })
    .catch((err) => {
      // If the runtime doesn't support events (e.g. very old Tauri builds),
      // fail silently — the UI still works via manual refresh.
      console.warn("[sync-events] failed to attach listener:", err);
    });

  return () => {
    unlisten?.();
  };
}
