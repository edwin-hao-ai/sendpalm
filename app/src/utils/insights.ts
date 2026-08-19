/** Pure helpers for the Insights dashboard.
 *  All functions are deterministic, side-effect-free, and unit-testable
 *  without any Tauri / DB / IPC dependency.
 */

import type { Message } from "../types";

/** Pair an incoming message with its first outgoing reply and report the
 *  hours between them. Returns `null` if the incoming message has no
 *  outgoing reply that we can identify.
 *
 *  Pairing rules (in priority order):
 *  1. Same `threadId` and the reply `st` is strictly after the incoming `st`.
 *  2. Same `pid` (sender contact) and same fallback: reply `st > incoming.st`.
 *
 *  The `pid`-only fallback is the safety net for older messages and mock
 *  data where `threadId` may be null. It's slightly noisier (any of my
 *  replies to that contact count) but on a 30-day window it's still a
 *  usable proxy. */
function pairReply(
  incoming: Message,
  candidates: Message[],
): Message | null {
  const t = new Date(incoming.st).getTime();
  const sameThread = candidates.filter(
    (m) =>
      m.threadId !== undefined &&
      incoming.threadId !== undefined &&
      m.threadId === incoming.threadId &&
      new Date(m.st).getTime() > t,
  );
  const pool = sameThread.length > 0
    ? sameThread
    : candidates.filter(
        (m) =>
          m.pid === incoming.pid && new Date(m.st).getTime() > t,
      );
  if (pool.length === 0) return null;
  return pool.reduce((a, b) =>
    new Date(a.st).getTime() <= new Date(b.st).getTime() ? a : b,
  );
}

/** Summary the Insights "Replied" card consumes. */
export interface ReplyTimeStats {
  /** Median hours between an incoming imbox message and its first reply.
   *  `null` when there are no samples. */
  medianHours: number | null;
  /** Number of incoming messages that got a reply inside the window. */
  replied: number;
  /** Number of incoming messages still waiting for a reply (or paired to a
   *  reply outside the window). */
  noReply: number;
  /** Total incoming imbox messages in the window. */
  total: number;
}

/** Compute reply-time statistics for the last `windowDays` (default 30).
 *
 *  @param messages  every message we know about
 *  @param options.since / options.until  ISO timestamps that bound the
 *    *incoming* message window. Defaults to "last 30 days from now".
 *  @param options.now  injected clock for tests. */
export function computeReplyTimeStats(
  messages: readonly Message[],
  options: {
    since?: string;
    until?: string;
    now?: Date;
  } = {},
): ReplyTimeStats {
  const now = options.now ?? new Date();
  const since = options.since ?? new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const until = options.until ?? now.toISOString();
  const sinceMs = new Date(since).getTime();
  const untilMs = new Date(until).getTime();

  const incoming = messages.filter(
    (m) =>
      m.direction === "in" &&
      m.bucket === "imbox" &&
      new Date(m.st).getTime() >= sinceMs &&
      new Date(m.st).getTime() <= untilMs,
  );
  const outgoing = messages.filter((m) => m.direction === "out");

  const deltas: number[] = [];
  let noReply = 0;
  for (const inc of incoming) {
    const reply = pairReply(inc, outgoing);
    if (!reply) {
      noReply++;
      continue;
    }
    const hours =
      (new Date(reply.st).getTime() - new Date(inc.st).getTime()) / 3_600_000;
    if (hours >= 0) deltas.push(hours);
    else noReply++;
  }

  if (deltas.length === 0) {
    return { medianHours: null, replied: 0, noReply, total: incoming.length };
  }
  deltas.sort((a, b) => a - b);
  const mid = Math.floor(deltas.length / 2);
  const median =
    deltas.length % 2 === 0
      ? ((deltas[mid - 1] ?? 0) + (deltas[mid] ?? 0)) / 2
      : (deltas[mid] ?? 0);

  return {
    medianHours: median,
    replied: deltas.length,
    noReply,
    total: incoming.length,
  };
}

/** Format a number of hours as a human-friendly duration. */
export function formatDuration(hours: number): string {
  if (hours < 1) {
    const m = Math.max(1, Math.round(hours * 60));
    return `${m} 分钟`;
  }
  if (hours < 48) return `${Math.round(hours)} 小时`;
  const days = hours / 24;
  if (days < 14) return `${days.toFixed(1)} 天`;
  return `${Math.round(days)} 天`;
}
