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
import { dateBucket, bucketLabel, type DateBucketKey } from "../utils/date";

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
  now: Date = new Date(),
): DateGroup[] {
  const out: DateGroup[] = [];
  let flatIdx = 0;
  let currentKey: string | null = null;
  for (const item of items) {
    const firstMessage: Message =
      "messages" in item ? item.messages[0]! : item;
    const bucket: DateBucketKey = dateBucket(firstMessage.st, now);
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
