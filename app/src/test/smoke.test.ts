/** Smoke test — ensure utils compile and produce expected values. */

import { describe, expect, it } from "vitest";
import { relativeTime, isToday } from "../utils/date";
import { STAGE_COLOR, STAGE_LABEL } from "../utils/labels";
import { initials, hashHue } from "../utils/test-helpers";

describe("date utils", () => {
  it("relativeTime returns empty for invalid input", () => {
    expect(relativeTime("not-a-date")).toBe("");
  });

  it("relativeTime handles now", () => {
    const now = new Date().toISOString();
    expect(relativeTime(now)).toMatch(/just now|ago/);
  });

  it("isToday", () => {
    expect(isToday(new Date().toISOString())).toBe(true);
    expect(isToday("2020-01-01T00:00:00Z")).toBe(false);
  });
});

describe("label maps", () => {
  it("STAGE_COLOR has every stage", () => {
    for (const stage of [
      "explore",
      "build",
      "active",
      "maintain",
      "cold",
      "rekindle",
    ] as const) {
      expect(STAGE_COLOR[stage]).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it("STAGE_LABEL has Chinese labels", () => {
    expect(STAGE_LABEL.active).toBe("活跃期");
  });
});

describe("avatar helpers", () => {
  it("initials from name", () => {
    expect(initials("Edwin Hao")).toBe("EH");
    expect(initials("Lisa")).toBe("LI");
    expect(initials("")).toBe("?");
  });

  it("hashHue is deterministic", () => {
    expect(hashHue("Alice")).toBe(hashHue("Alice"));
    expect(hashHue("Alice")).not.toBe(hashHue("Bob"));
  });
});
