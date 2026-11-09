/** Search query shaping — pure rules behind `searchIndex()`.
 *
 *  The bugs this pins down were measured on a real mailbox:
 *    `MATCH '拒付'`      → 0 rows (unicode61 made the whole Chinese run one token)
 *    `MATCH 'Re: 报价'`  → error: no such column: Re   (FTS5 column filter)
 *    `MATCH 'a-b'`       → error: no such column: b    (FTS5 NOT)
 */

import { describe, expect, it } from "vitest";
import { buildSearchPlan, escapeLike } from "./search";

describe("buildSearchPlan", () => {
  it("returns null for empty and whitespace-only input", () => {
    expect(buildSearchPlan("")).toBeNull();
    expect(buildSearchPlan("   ")).toBeNull();
  });

  it("quotes every term so FTS syntax characters are literal", () => {
    // Both terms are 3+ chars, so this goes through FTS — and the colon must
    // survive as part of the term instead of being read as a column filter.
    expect(buildSearchPlan("Re: invoice")).toEqual({
      kind: "fts",
      match: '"Re:" AND "invoice"',
    });
    expect(buildSearchPlan("a-b")).toEqual({
      kind: "fts",
      match: '"a-b"',
    });
  });

  it("routes a real Chinese query with a colon through LIKE", () => {
    // 「Re: 报价」 is what a user actually types — 报价 is 2 characters, so the
    // LIKE path handles it and the FTS parser never sees the colon.
    expect(buildSearchPlan("Re: 报价")).toEqual({
      kind: "like",
      terms: ["Re:", "报价"],
    });
  });

  it("escapes embedded double quotes", () => {
    expect(buildSearchPlan('say "hi" now')).toEqual({
      kind: "fts",
      match: '"say" AND """hi""" AND "now"',
    });
  });

  it("falls back to LIKE when any term is shorter than 3 characters", () => {
    // 「拒付」 is 2 characters — the most common Chinese query there is.
    expect(buildSearchPlan("拒付")).toEqual({ kind: "like", terms: ["拒付"] });
    expect(buildSearchPlan("Q3 报告")).toEqual({
      kind: "like",
      terms: ["Q3", "报告"],
    });
    expect(buildSearchPlan("a")).toEqual({ kind: "like", terms: ["a"] });
  });

  it("counts characters, not UTF-16 units", () => {
    // A surrogate pair (emoji) is one character; two of them are still < 3.
    expect(buildSearchPlan("📧📧")).toEqual({ kind: "like", terms: ["📧📧"] });
    expect(buildSearchPlan("📧📧📧")).toEqual({
      kind: "fts",
      match: '"📧📧📧"',
    });
  });

  it("uses FTS for three or more characters in any script", () => {
    expect(buildSearchPlan("拒付资料")).toEqual({
      kind: "fts",
      match: '"拒付资料"',
    });
    expect(buildSearchPlan("发")).toEqual({ kind: "like", terms: ["发"] });
  });

  it("keeps multiple long terms as an AND of substrings", () => {
    expect(buildSearchPlan("invoice march")).toEqual({
      kind: "fts",
      match: '"invoice" AND "march"',
    });
  });
});

describe("escapeLike", () => {
  it("escapes the LIKE wildcards and the escape character itself", () => {
    expect(escapeLike("100%")).toBe("100\\%");
    expect(escapeLike("a_b")).toBe("a\\_b");
    expect(escapeLike("c\\d")).toBe("c\\\\d");
  });
});
