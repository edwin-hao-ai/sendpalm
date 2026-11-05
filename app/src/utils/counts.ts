/** Display formatting for counters whose source query is deliberately capped.
 *
 *  A bounded query can only tell the UI "at least this many" — rendering the
 *  cap as a precise number would be a lie. `formatGateCount(500)` must read
 *  `500+`, not `500`.
 */

/** Hard cap on the Gate counter query.
 *
 *  `countGateCandidates` runs on every soft-refresh tick (i.e. after each
 *  sync chunk), so it must never walk a 10,000-contact table. The badge only
 *  needs to answer "is anything waiting, and roughly how much": 500 ids is a
 *  bounded IPC payload, and above it the UI renders `500+` instead of
 *  pretending to know a precise number. */
export const GATE_COUNT_LIMIT = 500;

/** Render a Gate count for the UI: `500+` once the query hit its cap. */
export function formatGateCount(count: number): string {
  return count >= GATE_COUNT_LIMIT ? `${GATE_COUNT_LIMIT}+` : String(count);
}
