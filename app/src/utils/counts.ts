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

/** Thousands separators, locale-independent.
 *
 *  `toLocaleString()` follows the OS locale, so the same build would render
 *  `3,120` on one machine and `3120` on another. User-facing counts in this
 *  app are fixed to the comma form. */
export function formatThousands(n: number): string {
  const whole = Math.trunc(n);
  const sign = whole < 0 ? "-" : "";
  const digits = Math.abs(whole).toString();
  let out = "";
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ",";
    out += digits[i];
  }
  return sign + out;
}
