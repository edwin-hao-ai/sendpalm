/** Group an Imbox item list into date-bucket sections. Extracted from
 *  Imbox.tsx so the bucketing logic is testable in isolation.
 *
 *  Each group carries a `startIdx` so the caller can compute the
 *  global index of any item by adding the per-row `localIdx` (from
 *  the <For> callback) to `startIdx`. This replaces the previous
 *  `Object.assign(item, { _flatIdx })` pattern which mutated the
 *  SolidJS-tracked message references and broke reactivity downstream.
 *
 *  Returns groups in the order they were first seen in the input list.
 *  No deduplication; the caller is responsible for any filtering
 *  (e.g. setAside / replyLater excluded upstream). */

import type { Message } from "../types";
import { RECENT_UNREAD_CAP } from "../stores/data";
import { bucketLabel, type DateBucketKey } from "../utils/date";
import { dateBucketInZone, messageTimelineAt } from "../utils/message-dates";

export type Item = Message | Bundle;

export interface Bundle {
  contactId: string;
  contact: import("../types").Contact;
  messages: Message[];
}

export interface DateGroup {
  key: string;
  label: string;
  items: Item[];
  startIdx: number;
}

export function groupItemsByDate(
  items: Item[],
  timezone: string | undefined,
  now: Date = new Date(),
): DateGroup[] {
  const out: DateGroup[] = [];
  let flatIdx = 0;
  let currentKey: string | null = null;
  for (const item of items) {
    const firstMessage: Message =
      "messages" in item ? item.messages[0]! : item;
    // Buckets follow the real receipt time (receivedAt) in the user's
    // configured timezone — sender-declared dates and the host OS zone
    // both mislead here.
    const bucket: DateBucketKey = dateBucketInZone(
      messageTimelineAt(firstMessage),
      timezone,
      now,
    );
    const key =
      typeof bucket === "string"
        ? bucket
        : `${bucket.year}-${bucket.month}`;
    if (key !== currentKey) {
      out.push({ key, label: bucketLabel(bucket), items: [], startIdx: flatIdx });
      currentKey = key;
    }
    out[out.length - 1]!.items.push(item);
    flatIdx++;
  }
  return out;
}

/** Membership predicate for the Imbox list — mirrors the prototype's
 *  `isImboxMsg` (prototype-v11.js:3121): a message parked in a workflow
 *  pile (set aside / reply later / bubbled-up reminder) leaves the list
 *  until the flag clears. Without the `bubbleUpAt` check, pressing `z`
 *  or dragging to Remind looked like a no-op because the row stayed. */
export function isImboxListMessage(
  m: Pick<Message, "setAside" | "replyLater" | "bubbleUpAt">,
): boolean {
  return !m.setAside && !m.replyLater && !m.bubbleUpAt;
}

/** Unread mail outside the "recent" window the header leads with.
 *
 *  Returns 0 when either side is saturated. Both counts are `LIMIT`-capped
 *  (they share `RECENT_UNREAD_CAP`), so past the cap neither number is
 *  trustworthy and subtracting them produces a number that is precise to the
 *  digit and wrong by thousands. A 3,762-unread mailbox would otherwise read
 *  "更早 1995 封未读". */
export function olderUnread(recentUnread: number, unreadTotal: number): number {
  if (recentUnread >= RECENT_UNREAD_CAP) return 0;
  if (unreadTotal >= RECENT_UNREAD_CAP) return 0;
  return Math.max(0, unreadTotal - recentUnread);
}

/** Read mail in the Imbox = everything minus the unread rows. Clamped, because
 *  the two numbers come from separate queries and can disagree for a moment
 *  while a sync commits. */
export function readTotal(unreadTotal: number, total: number): number {
  return Math.max(0, total - unreadTotal);
}

/** Where a message lives in the rendered list.
 *
 *  `index` is the flat row index the cursor uses; `bundleId` is set when the
 *  message is folded into a sender bundle instead of owning a row. Such a row
 *  is not in the DOM until the bundle drawer opens, which is why the caller
 *  needs to know it has to expand one — a plain `querySelector` on
 *  `[data-message-id]` silently finds nothing there.
 *
 *  Returns `null` when the message is not in the loaded window (paginated
 *  list: only the first N rows exist client-side) or is filtered out by the
 *  active quick filter / account tab. */
export function rowAnchorForMessage(
  items: Item[],
  messageId: string,
): { index: number; bundleId?: string } | null {
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    if ("messages" in item) {
      if (item.messages.some((m) => m.id === messageId)) {
        return { index: i, bundleId: item.contactId };
      }
    } else if (item.id === messageId) {
      return { index: i };
    }
  }
  return null;
}
