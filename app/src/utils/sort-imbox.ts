/** Imbox sort modes — mirrors prototype-v11 §renderFilterPanelBody (line 384).
 *
 *  Default is "newest" because that is what real mail clients do and what
 *  the prototype defaults to (`const sort = f.sort || 'newest'` in
 *  prototype-v11.js:442). "most_relevant" stays available for users who
 *  want HEY-style priority sort.
 *
 *  Pure function. UI calls it once per derived list — no caching needed.
 */

import { priorityScore } from "./priority";
import type { Contact, Message } from "../types";

export type SortMode = "newest" | "oldest" | "most_relevant";

export const SORT_LABELS: Record<SortMode, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  most_relevant: "Most relevant",
};

export const DEFAULT_SORT: SortMode = "newest";

export function sortImboxMessages(
  messages: Message[],
  mode: SortMode,
  contacts: Contact[],
): Message[] {
  const map = new Map(contacts.map((c) => [c.id, c]));
  const out = messages.slice();
  if (mode === "newest") {
    out.sort((a, b) => new Date(b.st).getTime() - new Date(a.st).getTime());
  } else if (mode === "oldest") {
    out.sort((a, b) => new Date(a.st).getTime() - new Date(b.st).getTime());
  } else {
    out.sort(
      (a, b) =>
        priorityScore(b, map.get(b.pid)) -
        priorityScore(a, map.get(a.pid)),
    );
  }
  return out;
}
