import type { Message } from "../types";

export interface ReplyTimeStats {
  averageHours: number | null;
  medianHours: number | null;
}

/** Pair each incoming message with the next outgoing message for the same
 * contact and summarize the reply lag in hours.
 */
export function computeReplyTimeStats(messages: Message[]): ReplyTimeStats {
  const sorted = [...messages].sort(
    (a, b) => new Date(a.st).getTime() - new Date(b.st).getTime(),
  );

  let lastIncomingAt: number | null = null;
  const hours: number[] = [];

  for (const m of sorted) {
    if (m.direction === "in") {
      lastIncomingAt = new Date(m.st).getTime();
    } else if (m.direction === "out" && lastIncomingAt != null) {
      const diffMs = new Date(m.st).getTime() - lastIncomingAt;
      hours.push(diffMs / (1000 * 60 * 60));
      lastIncomingAt = null;
    }
  }

  if (hours.length === 0) {
    return { averageHours: null, medianHours: null };
  }

  const average = hours.reduce((sum, h) => sum + h, 0) / hours.length;
  const sortedHours = [...hours].sort((a, b) => a - b);
  const median =
    sortedHours.length % 2 === 1
      ? sortedHours[Math.floor(sortedHours.length / 2)]!
      : (sortedHours[sortedHours.length / 2 - 1]! +
          sortedHours[sortedHours.length / 2]!) /
        2;

  return {
    averageHours: Math.round(average * 10) / 10,
    medianHours: Math.round(median * 10) / 10,
  };
}
