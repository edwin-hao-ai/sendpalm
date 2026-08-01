/** Avatar + label utils tests. */

import { describe, expect, it } from "vitest";
import { initials, hashHue } from "../utils/test-helpers";
import { STAGE_LABEL, STAGE_COLOR, STAGE_SUGGEST } from "../utils/labels";

describe("initials", () => {
  it("two-part name", () => {
    expect(initials("Edwin Hao")).toBe("EH");
  });
  it("single name uses first two letters", () => {
    expect(initials("Lisa")).toBe("LI");
  });
  it("three-part name uses first + last", () => {
    expect(initials("Zhang Wei Bo")).toBe("ZB");
  });
  it("empty string returns ?", () => {
    expect(initials("")).toBe("?");
  });
  it("whitespace-only returns ?", () => {
    expect(initials("   ")).toBe("?");
  });
});

describe("hashHue", () => {
  it("is deterministic", () => {
    expect(hashHue("Alice")).toBe(hashHue("Alice"));
  });
  it("different names give different hues (mostly)", () => {
    const a = hashHue("Alice");
    const b = hashHue("Bob");
    const c = hashHue("Carol");
    expect(new Set([a, b, c]).size).toBeGreaterThan(1);
  });
  it("stays in 0-359", () => {
    for (const name of ["A", "B", "C", "Alice", "Bob", "Carol", "12345"]) {
      const h = hashHue(name);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(360);
    }
  });
});

describe("STAGE_LABEL", () => {
  it("has all 6 stages", () => {
    const stages = ["explore", "build", "active", "maintain", "cold", "rekindle"];
    for (const s of stages) {
      expect(STAGE_LABEL[s as keyof typeof STAGE_LABEL]).toBeTruthy();
    }
  });

  it("all colors are hex strings", () => {
    const stages = ["explore", "build", "active", "maintain", "cold", "rekindle"];
    for (const s of stages) {
      expect(STAGE_COLOR[s as keyof typeof STAGE_COLOR]).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it("all suggestions are non-empty strings", () => {
    const stages = ["explore", "build", "active", "maintain", "cold", "rekindle"];
    for (const s of stages) {
      expect(STAGE_SUGGEST[s as keyof typeof STAGE_SUGGEST]).toBeTruthy();
      expect(typeof STAGE_SUGGEST[s as keyof typeof STAGE_SUGGEST]).toBe("string");
    }
  });
});