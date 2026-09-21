/** CommandPalette — pure helpers. */

import { describe, it, expect } from "vitest";
import { formatEventDateZh } from "./CommandPalette";

describe("formatEventDateZh", () => {
  it("formats an ISO date in Chinese", () => {
    expect(formatEventDateZh("2026-09-21")).toBe("2026 年 9 月 21 日");
  });

  it("formats a Date instance", () => {
    expect(formatEventDateZh(new Date(2026, 0, 5))).toBe("2026 年 1 月 5 日");
  });

  it("returns an empty string for invalid input", () => {
    expect(formatEventDateZh("not-a-date")).toBe("");
  });
});
