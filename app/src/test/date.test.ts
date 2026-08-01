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