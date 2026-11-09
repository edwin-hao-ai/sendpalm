/** Build a mail rule from a screener decision.
 *
 *  The screener already decides one sender at a time, but the decision was
 *  never reused: the next message from the same person landed back in the
 *  Gate. "以后这个发件人都这样" writes a rule the sync engine applies to
 *  *new* mail, so the decision sticks.
 *
 *  Matching: `match_field: "from"` is compared against `"{email} {name}"` by
 *  the Rust rule engine, so the sender's address is a safe, specific pattern.
 */

export interface SenderRulePayload {
  id: string;
  name: string;
  enabled: boolean;
  matchField: "from";
  matchPattern: string;
  actionBucket: string;
  actionLabel: null;
  priority: number;
}

export function senderRule(
  email: string,
  bucket: string,
  priority: number,
  now: number = Date.now(),
): SenderRulePayload | null {
  const pattern = email.trim().toLowerCase();
  // A blank pattern would match every message — refuse rather than write a
  // catch-all rule.
  if (!pattern) return null;
  return {
    id: `rule_${now.toString(36)}`,
    name: pattern,
    enabled: true,
    matchField: "from",
    matchPattern: pattern,
    actionBucket: bucket,
    actionLabel: null,
    priority,
  };
}
