/** Sync event bridge — listens for real-time backend events and refreshes
 *  the frontend data stores so the Imbox / Notifications reflect new mail
 *  as soon as the Rust IMAP IDLE loop fetches it.
 *
 *  In browser mode (no Tauri runtime) this is a no-op because there is no
 *  background sync loop.
 *
 *  Two paths handle the data update:
 *
 *  1. **prependByIds (preferred for paginated lists).** The Rust sync
 *     loop ships `new_message_ids` on every cycle. Views register a
 *     handler per bucket (`registerPrepend("imbox", fn)`); we invoke
 *     each one and the view fetches just those few new rows and prepends
 *     them to its in-memory list. O(new_ids) IPC round-trips, no jank.
 *
 *  2. **softRefreshTick (only for lightweight non-paginated resources.)**
 *     Pile slices and contact counts refetch via
 *     `useSoftRefreshEffect`. This tick fires every cycle but does NOT
 *     clear the active list or reset scroll position.
 *
 *  The previous design refetched BOTH paths with `refreshTick`, which meant
 *  every 60s sync reloaded all 100 paginated rows even when only one or two
 *  new mails arrived. Now the paginated path uses prepend only and the
 *  lightweight path uses a soft tick.
 */
import { listen } from "@tauri-apps/api/event";
import { IS_BROWSER } from "./tauri-shim";
import { bumpSoftRefreshTick } from "../stores/ui";
import type { Message } from "../types";

export interface SyncReport {
  account_id: string;
  mailbox: string;
  new_messages: number;
  skipped: number;
  uid_validity: number;
  last_uid: number;
  /** IDs of messages newly inserted by this cycle (oldest first).
   *  Empty when new_messages == 0. Frontend prepends these to paginated
   *  lists instead of triggering a full LIMIT 100 refetch. */
  new_message_ids?: string[];
  error?: string | null;
}

/** Per-bucket prepend callback registry. The Imbox/Stream/Records/Trash/Spam
 *  views register a function that, given the new message IDs, fetches
 *  each row and prepends it to the in-memory list. Multiple views can be
 *  registered for the same bucket (e.g. Imbox + a future widget). */
export type PrependHandler = (ids: string[]) => void | Promise<void>;
const prependRegistry = new Map<string, Set<PrependHandler>>();

export function registerPrepend(bucket: string, handler: PrependHandler): () => void {
  let set = prependRegistry.get(bucket);
  if (!set) {
    set = new Set();
    prependRegistry.set(bucket, set);
  }
  set.add(handler);
  return () => {
    set?.delete(handler);
    if (set && set.size === 0) prependRegistry.delete(bucket);
  };
}

function notifyBucket(bucket: string, ids: string[]): void {
  const set = prependRegistry.get(bucket);
  if (!set) return;
  for (const h of set) {
    try {
      void h(ids);
    } catch (err) {
      console.warn(`[sync-events] prepend handler for ${bucket} threw`, err);
    }
  }
}

/**
 * In-place patch registry — the incremental counterpart to prependByIds.
 *
 * When a view mutates a single message (e.g. marking it read after the
 * DetailPanel opens) it must NOT bump the global refreshTick, because that
 * makes every paginated list re-fetch its whole page just to update one
 * row. Instead it calls notifyMessageUpdated(id, patch) and each owning
 * list patches just that row in memory. See usePaginatedMessages, which
 * auto-registers on mount.
 */
export type MessagePatchHandler = (id: string, patch: Partial<Message>) => void;
const messageUpdatedRegistry = new Set<MessagePatchHandler>();

export function registerMessageUpdated(
  handler: MessagePatchHandler,
): () => void {
  messageUpdatedRegistry.add(handler);
  return () => {
    messageUpdatedRegistry.delete(handler);
  };
}

export function notifyMessageUpdated(
  id: string,
  patch: Partial<Message>,
): void {
  for (const h of messageUpdatedRegistry) {
    try {
      h(id, patch);
    } catch (err) {
      console.warn("[sync-events] message-updated handler threw", err);
    }
  }
}

export function startSyncEventBridge(): () => void {
  if (IS_BROWSER()) {
    return () => {};
  }

  let unlisten: (() => void) | undefined;

  listen<SyncReport>("sync:new-messages", (event) => {
    const ids = event.payload.new_message_ids ?? [];
    // Bump the soft refresh tick so lightweight resources (pile slices,
    // contact counts) update. Paginated lists already get the new ids below.
    bumpSoftRefreshTick();
    if (ids.length > 0) {
      notifyBucket("imbox", ids);
      notifyBucket("feed", ids);
      notifyBucket("paperTrail", ids);
      notifyBucket("trash", ids);
      notifyBucket("spam", ids);
    }
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
