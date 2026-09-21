import { describe, it, expect } from "vitest";
import { purgeCountdown, TRASH_RETENTION_DAYS } from "./Trash";

const NOW = new Date("2026-09-22T12:00:00");

function deletedDaysAgo(days: number, hour = 12): string {
  const d = new Date(NOW);
  d.setDate(d.getDate() - days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

describe("purgeCountdown", () => {
  it("never exceeds the 30-day retention policy", () => {
    // Deleted moments ago at a later time-of-day than `now`:
    // ceil(30d - epsilon) must clamp to 30, never render "31 天后".
    const justDeleted = new Date(NOW.getTime() - 60_000).toISOString();
    expect(purgeCountdown(justDeleted, NOW)).toBe(
      `${TRASH_RETENTION_DAYS} 天后永久删除`,
    );
  });

  it("counts down within the retention window", () => {
    expect(purgeCountdown(deletedDaysAgo(1), NOW)).toBe("29 天后永久删除");
    expect(purgeCountdown(deletedDaysAgo(29), NOW)).toBe("1 天后永久删除");
  });

  it("never renders a negative day count past the deadline", () => {
    expect(purgeCountdown(deletedDaysAgo(31), NOW)).toBe("今天过后永久删除");
    expect(purgeCountdown(deletedDaysAgo(90), NOW)).toBe("今天过后永久删除");
  });

  it("falls back to a neutral label for invalid timestamps", () => {
    expect(purgeCountdown("not-a-date", NOW)).toBe("即将自动永久删除");
  });
});
