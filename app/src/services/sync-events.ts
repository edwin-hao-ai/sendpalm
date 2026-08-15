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
 *  2. **refreshTick (only for non-paginated full-table resources).**
 *     Piles, contact maps, full-text search index, etc. use
 *     `createResource(listMessages)` and react to refreshTick via
 *     `useRefreshEffect`. They have to refetch — there's no incremental
 *     path for them. This tick fires every cycle.
 *
 *  The previous design refetched BOTH paths, which meant every 60s sync
 *  reloaded all 100 paginated rows even when only one or two new mails
 *  arrived. Now the paginated path uses prepend only.
 */
import { listen } from "@tauri-apps/api/event";
import { IS_BROWSER } from "./tauri-shim";
import { bumpRefreshTick } from "../stores/ui";

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

export function startSyncEventBridge(): () => void {
  if (IS_BROWSER()) {
    return () => {};
  }

  let unlisten: (() => void) | undefined;

  listen<SyncReport>("sync:new-messages", (event) => {
    const ids = event.payload.new_message_ids ?? [];
    // Bump the global refresh tick so any non-paginated resource (full
    // listMessages, contact map, pile slices) refetches. Views that opted
    // into the prepend path will get the IDs too, so they can update
    // without waiting for a LIMIT 100 round-trip.
    bumpRefreshTick();
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
