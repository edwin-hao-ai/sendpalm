/** Display formatting for capped / large user-facing counts. */

import { describe, expect, it } from "vitest";
import { GATE_COUNT_LIMIT, formatGateCount, formatThousands } from "./counts";

describe("formatGateCount", () => {
  it("passes a small count through verbatim", () => {
    expect(formatGateCount(0)).toBe("0");
    expect(formatGateCount(7)).toBe("7");
  });

  it("renders the cap as an open-ended range", () => {
    expect(formatGateCount(GATE_COUNT_LIMIT - 1)).toBe("499");
    expect(formatGateCount(GATE_COUNT_LIMIT)).toBe("500+");
    expect(formatGateCount(9000)).toBe("500+");
  });
});

describe("formatThousands", () => {
  it("groups digits by three", () => {
    expect(formatThousands(0)).toBe("0");
    expect(formatThousands(999)).toBe("999");
    expect(formatThousands(1000)).toBe("1,000");
    expect(formatThousands(3120)).toBe("3,120");
    expect(formatThousands(1234567)).toBe("1,234,567");
  });

  it("is locale-independent", () => {
    // `toLocaleString()` would render "3 120" or "3.120" depending on the
    // machine; the copy in the import toast must read the same everywhere.
    expect(formatThousands(3120)).not.toContain(" ");
    expect(formatThousands(3120)).not.toContain(".");
  });

  it("keeps a leading minus and ignores fractional input", () => {
    expect(formatThousands(-1234)).toBe("-1,234");
    expect(formatThousands(1234.9)).toBe("1,234");
  });
});
