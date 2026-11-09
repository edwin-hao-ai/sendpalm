/** Search query shaping.
 *
 *  The index is FTS5 with the `trigram` tokenizer (migration 0032): every
 *  3-character substring is indexed, which is what makes Chinese search work
 *  at all. Two consequences shape the query:
 *
 *  1. **Terms must be quoted.** A raw query is parsed as FTS5 syntax, so
 *     `Re: 报价` dies with `no such column: Re` and `a-b` with `no such
 *     column: b` — real users type both. Quoting every term turns them into
 *     plain substrings.
 *  2. **Terms shorter than 3 characters cannot match** under trigram, and
 *     two-character Chinese words (「拒付」/「发票」/「合同」) are the most common
 *     query there is. Those queries fall back to LIKE.
 *
 *  Pure and unit-tested so the SQL layer stays dumb.
 */

export type SearchPlan =
  /** FTS5 matcher expression, e.g. `"invoice" AND "march"`. */
  | { kind: "fts"; match: string }
  /** One LIKE term per whitespace-separated word; all must match. */
  | { kind: "like"; terms: string[] }
  | null;

/** Characters, not UTF-16 units: 「拒付」 is 2 characters, not 2. */
function charLength(s: string): number {
  return Array.from(s).length;
}

/** Escape for an FTS5 quoted string: `"` becomes `""`. */
function quoteFts(term: string): string {
  return `"${term.replace(/"/g, '""')}"`;
}

/** Escape for LIKE: `%` and `_` are wildcards, `\` is our escape char. */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export function buildSearchPlan(raw: string): SearchPlan {
  const q = raw.trim();
  if (!q) return null;

  const terms = q.split(/\s+/).filter(Boolean);
  if (terms.length === 0) return null;

  // Any short term forces the LIKE path: trigram cannot index it, and
  // dropping it would silently narrow the search.
  if (terms.some((t) => charLength(t) < 3)) {
    return { kind: "like", terms };
  }
  return { kind: "fts", match: terms.map(quoteFts).join(" AND ") };
}
