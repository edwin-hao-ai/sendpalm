/** Pure triage helpers for Focus & Reply and Read Together.
 * Keeps component logic small and testable.
 */

import type { Contact, Message } from "../types";

export function getFocusReplyCandidates(
  messages: Message[],
  completedIds: Set<string>,
): Message[] {
  return messages
    .filter((m) => m.replyLater && !completedIds.has(m.id))
    .sort((a, b) => new Date(b.st).getTime() - new Date(a.st).getTime());
}

export function getReadTogetherCandidates(
  messages: Message[],
  contacts: Contact[],
): Message[] {
  const contactMap = new Map(contacts.map((c) => [c.id, c]));
  return messages
    .filter(
      (m) =>
        m.bucket === "imbox" &&
        !m.replyLater &&
        !m.setAside &&
        !m.bubbleUpAt &&
        m.unread,
    )
    .filter((m) => {
      const c = contactMap.get(m.pid);
      return c && c.screened && !c.blocked;
    })
    .sort((a, b) => new Date(b.st).getTime() - new Date(a.st).getTime());
}
