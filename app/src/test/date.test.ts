/** Date utilities tests. */

import { describe, expect, it } from "vitest";
import {
  relativeTime,
  isToday,
  addDays,
  addHours,
  isoNow,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  daysInMonth,
  sameDate,
  timeToMinutes,
  formatMinutes,
  daysUntil,
} from "../utils/date";

describe("relativeTime", () => {
  it("returns empty for invalid input", () => {
    expect(relativeTime("not-a-date")).toBe("");
    expect(relativeTime("")).toBe("");
  });

  it("returns 'just now' for very recent", () => {
    const now = new Date().toISOString();
    expect(relativeTime(now)).toMatch(/just now|ago/);
  });

  it("handles hours ago", () => {
    const d = new Date(Date.now() - 3 * 3600_000);
    expect(relativeTime(d.toISOString())).toMatch(/h ago/);
  });

  it("handles days ago", () => {
    const d = new Date(Date.now() - 5 * 86400_000);
    expect(relativeTime(d.toISOString())).toMatch(/d ago/);
  });

  it("handles months ago", () => {
    const d = new Date(Date.now() - 90 * 86400_000);
    expect(relativeTime(d.toISOString())).toMatch(/mo ago/);
  });

  it("handles future dates", () => {
    const d = new Date(Date.now() + 3 * 3600_000);
    expect(relativeTime(d.toISOString())).toMatch(/from now/);
  });
});

describe("isToday", () => {
  it("returns true for today", () => {
    expect(isToday(new Date().toISOString())).toBe(true);
  });
  it("returns false for yesterday", () => {
    const y = new Date(Date.now() - 86400_000);
    expect(isToday(y.toISOString())).toBe(false);
  });
});

describe("date arithmetic", () => {
  it("addDays", () => {
    const base = new Date("2026-01-15T00:00:00Z");
    const next = addDays(base, 3);
    expect(next.getUTCDate()).toBe(18);
  });

  it("addHours", () => {
    const base = new Date("2026-01-15T10:00:00Z");
    const next = addHours(base, 5);
    expect(next.getUTCHours()).toBe(15);
  });

  it("startOfDay sets hours/min/sec to 0", () => {
    const d = startOfDay(new Date("2026-06-15T14:35:42"));
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
    expect(d.getSeconds()).toBe(0);
  });

  it("endOfDay sets hours/min to 23:59", () => {
    const d = endOfDay(new Date("2026-06-15T00:00:00"));
    expect(d.getHours()).toBe(23);
    expect(d.getMinutes()).toBe(59);
  });
});

describe("isoNow", () => {
  it("returns valid ISO string", () => {
    const now = isoNow();
    expect(now).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(Number.isNaN(new Date(now).getTime())).toBe(false);
  });
});

describe("calendar date helpers", () => {
  it("startOfWeek returns Monday 00:00", () => {
    const d = new Date("2026-06-17T14:30:00"); // Wednesday
    const s = startOfWeek(d);
    expect(s.getDay()).toBe(1);
    expect(s.getHours()).toBe(0);
    expect(s.getDate()).toBe(15);
  });

  it("endOfWeek returns Sunday 23:59:59", () => {
    const d = new Date("2026-06-17T14:30:00");
    const e = endOfWeek(d);
    expect(e.getDay()).toBe(0);
    expect(e.getHours()).toBe(23);
    expect(e.getMinutes()).toBe(59);
  });

  it("startOfMonth returns first of month", () => {
    const d = new Date("2026-06-17T14:30:00");
    const s = startOfMonth(d);
    expect(s.getDate()).toBe(1);
    expect(s.getMonth()).toBe(5);
  });

  it("daysInMonth returns correct counts", () => {
    expect(daysInMonth(new Date("2026-02-01"))).toBe(28);
    expect(daysInMonth(new Date("2026-06-01"))).toBe(30);
    expect(daysInMonth(new Date("2026-07-01"))).toBe(31);
  });

  it("sameDate ignores time", () => {
    expect(
      sameDate(
        new Date("2026-06-17T01:00:00"),
        new Date("2026-06-17T23:00:00"),
      ),
    ).toBe(true);
    expect(
      sameDate(
        new Date("2026-06-17T01:00:00"),
        new Date("2026-06-18T01:00:00"),
      ),
    ).toBe(false);
  });

  it("timeToMinutes parses HH:MM", () => {
    expect(timeToMinutes("09:30")).toBe(570);
    expect(timeToMinutes("23:45")).toBe(1425);
    expect(timeToMinutes("")).toBe(0);
  });

  it("formatMinutes pads correctly", () => {
    expect(formatMinutes(570)).toBe("09:30");
    expect(formatMinutes(1425)).toBe("23:45");
    expect(formatMinutes(0)).toBe("00:00");
  });
});

describe("daysUntil", () => {
  it("returns null for invalid input", () => {
    expect(daysUntil("not-a-date")).toBe(null);
    expect(daysUntil("")).toBe(null);
  });

  it("returns 0 for a date in the past", () => {
    const d = new Date(Date.now() - 86400_000).toISOString();
    expect(daysUntil(d)).toBe(0);
  });

  it("rounds up partial days", () => {
    const d = new Date(Date.now() + 12 * 3600_000).toISOString();
    expect(daysUntil(d)).toBe(1);
  });

  it("returns full days for future dates", () => {
    const d = new Date(Date.now() + 5 * 86400_000).toISOString();
    expect(daysUntil(d)).toBe(5);
  });
});
