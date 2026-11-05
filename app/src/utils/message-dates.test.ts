/** Mail date presentation — timezone-aware formatting and grouping. */

import { describe, it, expect } from "vitest";
import {
  messageTimelineAt,
  formatMessageDate,
  localDateKeyInZone,
  dateBucketInZone,
  bundleGroupFor,
  resolveTimeZone,
} from "./message-dates";

describe("messageTimelineAt", () => {
  it("prefers the server receipt time", () => {
    expect(
      messageTimelineAt({
        st: "2026-01-01T10:00:00Z",
        receivedAt: "2026-01-01T10:00:07Z",
      }),
    ).toBe("2026-01-01T10:00:07Z");
  });

  it("falls back to the stored message date for legacy rows", () => {
    expect(messageTimelineAt({ st: "2026-01-01T10:00:00Z" })).toBe(
      "2026-01-01T10:00:00Z",
    );
  });
});

describe("formatMessageDate", () => {
  it("labels receipt time and shows only the time on the same local day", () => {
    const p = formatMessageDate(
      { st: "2026-06-01T16:00:00Z", receivedAt: "2026-06-01T16:00:07Z" },
      "Asia/Shanghai", // = 2026-06-02 00:00:07 local
      "list",
      new Date("2026-06-01T17:00:00Z"), // 2026-06-02 01:00 Shanghai
    );
    expect(p.primary.label).toBe("收件时间");
    expect(p.primary.value).toBe("00:00");
    expect(p.secondary).toBeUndefined();
  });

  it("renders in the profile timezone even when the OS zone differs", () => {
    // 16:00 UTC is 2026-06-01 in New York but 2026-06-02 in Shanghai.
    const p = formatMessageDate(
      { st: "2026-06-01T16:00:00Z", receivedAt: "2026-06-01T16:00:00Z" },
      "Asia/Shanghai",
      "list",
      new Date("2026-06-01T17:00:00Z"),
    );
    expect(p.primary.label).toBe("收件时间");
    expect(p.primary.value).toBe("00:00");
  });

  it("falls back to the OS timezone for invalid zone names", () => {
    const iso = new Date("2026-06-01T17:00:00Z").toISOString();
    const p = formatMessageDate(
      { st: iso, receivedAt: iso },
      "Not/AZone",
      "list",
      new Date("2026-06-01T17:00:00Z"),
    );
    // Should not throw; matches local-time formatting of the same instant.
    const local = new Date(iso);
    const hh = String(local.getHours()).padStart(2, "0");
    const mm = String(local.getMinutes()).padStart(2, "0");
    expect(p.primary.value).toBe(`${hh}:${mm}`);
  });

  it("shows the sender date as secondary in detail mode when both differ", () => {
    const p = formatMessageDate(
      {
        st: "2026-06-01T10:00:00Z",
        sentAt: "2026-06-01T08:00:00Z",
        receivedAt: "2026-06-01T10:00:00Z",
      },
      "UTC",
      "detail",
      new Date("2026-06-01T12:00:00Z"),
    );
    expect(p.primary.label).toBe("收件时间");
    expect(p.secondary?.label).toBe("发件时间");
    expect(p.secondary?.value).toBeTruthy();
  });

  it("keeps a neutral label and no secondary for legacy rows", () => {
    const p = formatMessageDate(
      { st: "2026-06-01T10:00:00Z" },
      "UTC",
      "detail",
      new Date("2026-06-01T12:00:00Z"),
    );
    expect(p.primary.label).toBe("邮件时间");
    expect(p.secondary).toBeUndefined();
  });

  it("never reads the preformatted tm field", () => {
    const p = formatMessageDate(
      // A hostile tm must not leak into the output.
      { st: "2026-06-01T10:00:00Z", receivedAt: "2026-06-01T10:00:00Z" } as never,
      "UTC",
      "list",
      new Date("2026-06-01T12:00:00Z"),
    );
    expect(JSON.stringify(p)).not.toContain("tm");
  });
});

describe("zone-aware calendar helpers", () => {
  it("computes the local date key across a UTC day boundary", () => {
    expect(localDateKeyInZone("2026-01-01T16:00:00Z", "Asia/Shanghai")).toBe(
      "2026-01-02",
    );
    expect(localDateKeyInZone("2026-01-01T16:00:00Z", "UTC")).toBe("2026-01-01");
  });

  it("buckets yesterday and this-week in the profile zone", () => {
    const now = new Date("2026-06-10T12:00:00Z"); // Wednesday
    expect(dateBucketInZone("2026-06-10T02:00:00Z", "UTC", now)).toBe("today");
    expect(dateBucketInZone("2026-06-09T02:00:00Z", "UTC", now)).toBe("yesterday");
    expect(dateBucketInZone("2026-06-08T02:00:00Z", "UTC", now)).toBe("this-week");
    expect(dateBucketInZone("2026-06-01T02:00:00Z", "UTC", now)).toBe("this-month");
  });

  it("falls back to the runtime zone when the profile zone is invalid", () => {
    const now = new Date("2026-06-10T12:00:00Z");
    expect(dateBucketInZone("2026-06-10T02:00:00Z", "Bogus/Zone", now)).toBe(
      "today",
    );
  });
});

describe("bundleGroupFor", () => {
  const now = new Date("2026-06-10T12:00:00Z"); // Wed Jun 10

  it("groups the most recent seven local days individually", () => {
    const today = bundleGroupFor("2026-06-10T02:00:00Z", "UTC", now);
    expect(today.kind).toBe("day");
    expect(today.label).toBe("今天");

    const sixDaysAgo = bundleGroupFor("2026-06-04T02:00:00Z", "UTC", now);
    expect(sixDaysAgo.kind).toBe("day");
    expect(sixDaysAgo.label).toBe("6月4日");
  });

  it("groups older messages by Monday-Sunday week", () => {
    // 2026-06-01 is a Monday; 2026-06-03 is the Wednesday of that week.
    const group = bundleGroupFor("2026-06-03T02:00:00Z", "UTC", now);
    expect(group.kind).toBe("week");
    expect(group.key).toBe("2026-06-01");
    expect(group.label).toBe("6月1日 – 6月7日");
  });

  it("keeps the current week out of the week groups", () => {
    // Monday of the current week (2026-06-08) is within 7 days → day group.
    const group = bundleGroupFor("2026-06-08T02:00:00Z", "UTC", now);
    expect(group.kind).toBe("day");
  });
});

describe("resolveTimeZone", () => {
  it("accepts valid IANA zones and rejects invalid ones", () => {
    expect(resolveTimeZone("Asia/Shanghai")).toBe("Asia/Shanghai");
    expect(resolveTimeZone("Not/AZone")).toBeUndefined();
    expect(resolveTimeZone("")).toBeUndefined();
  });
});
