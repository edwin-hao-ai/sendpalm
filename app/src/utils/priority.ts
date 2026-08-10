/** Imbox priority score — mirrors prototype-v11 §3.1.
 *
 *  Higher score = closer to the top of "New for you".
 *  Combines contact score, contact group, and message age decay.
 */

import type { Contact, Message } from "../types";

export function priorityScore(
  m: Message,
  contact: Contact | undefined,
): number {
  let score = 0;

  if (contact) {
    score += contact.sc * 0.45;
    if (contact.grp === "risk") score += 25;
    if (contact.grp === "cold") score -= 35;
  }

  const now = Date.now();
  const eventTime = new Date(m.st).getTime() || now;
  const ageDays = (now - eventTime) / (1000 * 60 * 60 * 24);
  score += Math.max(0, 18 - ageDays * 0.25);

  return score;
}
