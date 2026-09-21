import { describe, it, expect } from "vitest";
import { initials, hashHue } from "./Avatar";

describe("initials", () => {
  it("Latin two-word names take first letters of first/last word", () => {
    expect(initials("Edwin Hao")).toBe("EH");
    expect(initials("Mary Jane Watson")).toBe("MW");
  });

  it("Latin single word takes first two letters, uppercased", () => {
    expect(initials("Lisa")).toBe("LI");
  });

  it("CJK 3+ char name takes the given name (last 2 chars), not a surname+first-char slice", () => {
    expect(initials("李小明")).toBe("小明");
    expect(initials("王雨晴")).toBe("雨晴");
    expect(initials("欧阳娜娜")).toBe("娜娜");
  });

  it("CJK 1-2 char name is kept whole", () => {
    expect(initials("李")).toBe("李");
    expect(initials("王雨")).toBe("王雨");
  });

  it("spaced CJK names fall back to the word-based rule", () => {
    expect(initials("Li Ming")).toBe("LM");
  });

  it("empty name falls back to ?", () => {
    expect(initials("")).toBe("?");
    expect(initials("   ")).toBe("?");
  });
});

describe("hashHue", () => {
  it("is deterministic and within [0, 360)", () => {
    expect(hashHue("Alice")).toBe(hashHue("Alice"));
    const h = hashHue("王小明");
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(360);
  });
});
