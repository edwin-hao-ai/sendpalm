/** Sender rules written from a screener decision. */

import { describe, expect, it } from "vitest";
import { senderRule } from "./mail-rule";

describe("senderRule", () => {
  it("targets the sender address", () => {
    const rule = senderRule("Alice@Example.com", "imbox", 1, 0);
    expect(rule).toMatchObject({
      matchField: "from",
      matchPattern: "alice@example.com",
      actionBucket: "imbox",
      enabled: true,
    });
  });

  it("carries the requested bucket (block → spam)", () => {
    expect(senderRule("a@b.com", "spam", 1)?.actionBucket).toBe("spam");
  });

  it("refuses to write a catch-all rule", () => {
    // An empty pattern would match every sender — worse than no rule.
    expect(senderRule("   ", "imbox", 1)).toBeNull();
  });

  it("trims surrounding whitespace", () => {
    expect(senderRule("  a@b.com  ", "feed", 1)?.matchPattern).toBe("a@b.com");
  });
});
