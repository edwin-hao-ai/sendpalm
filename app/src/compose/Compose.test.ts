/** Compose — pure helpers: address validation, schedule presets,
 *  and the custom date+time combiner. */

import { describe, it, expect } from "vitest";
import {
  EMAIL_RE,
  firstInvalidAddress,
  combineCustomSchedule,
  schedulePresets,
  MAX_ATTACHMENT_BYTES,
} from "./Compose";

describe("EMAIL_RE / firstInvalidAddress", () => {
  it("accepts plain addresses and rejects obvious junk", () => {
    expect(EMAIL_RE.test("a@b.co")).toBe(true);
    expect(EMAIL_RE.test("a b@c.co")).toBe(false);
    expect(EMAIL_RE.test("a@b")).toBe(false);
  });

  it("returns null when every comma-separated address is valid", () => {
    expect(firstInvalidAddress("a@b.co, c@d.io")).toBeNull();
    expect(firstInvalidAddress("")).toBeNull();
    expect(firstInvalidAddress("  , ,")).toBeNull();
  });

  it("returns the first invalid address", () => {
    expect(firstInvalidAddress("ok@a.co, bad, also-bad")).toBe("bad");
  });
});

describe("combineCustomSchedule", () => {
  const now = new Date("2026-09-22T10:00:00");

  it("returns null when either half is missing", () => {
    expect(combineCustomSchedule("", "10:00", now)).toBeNull();
    expect(combineCustomSchedule("2026-09-23", "", now)).toBeNull();
  });

  it("returns null for an unparseable combination", () => {
    expect(combineCustomSchedule("not-a-date", "99:99", now)).toBeNull();
  });

  it("returns null for a past time", () => {
    expect(combineCustomSchedule("2026-09-22", "09:00", now)).toBeNull();
    expect(combineCustomSchedule("2020-01-01", "12:00", now)).toBeNull();
  });

  it("combines a future date + time", () => {
    const d = combineCustomSchedule("2026-09-23", "08:30", now);
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(8);
    expect(d!.getDate()).toBe(23);
    expect(d!.getHours()).toBe(8);
    expect(d!.getMinutes()).toBe(30);
  });
});

describe("schedulePresets", () => {
  it("offers four Chinese presets, all in the future", () => {
    const now = new Date("2026-09-22T10:00:00"); // a Tuesday
    const presets = schedulePresets(now);
    expect(presets.map((p) => p.label)).toEqual([
      "今天稍后",
      "明天 9:00",
      "下周一 9:00",
      "下周五 9:00",
    ]);
    for (const p of presets) expect(p.at.getTime()).toBeGreaterThan(now.getTime());
  });

  it("schedules 明天 at 9:00 the next day", () => {
    const now = new Date("2026-09-22T10:00:00");
    const tomorrow = schedulePresets(now)[1]!.at;
    expect(tomorrow.getDate()).toBe(23);
    expect(tomorrow.getHours()).toBe(9);
    expect(tomorrow.getMinutes()).toBe(0);
  });
});

describe("MAX_ATTACHMENT_BYTES", () => {
  it("is the common 25MB SMTP ceiling", () => {
    expect(MAX_ATTACHMENT_BYTES).toBe(25 * 1024 * 1024);
  });
});
