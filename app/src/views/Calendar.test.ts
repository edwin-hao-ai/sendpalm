import { describe, expect, it } from "vitest";
import { localDateKey } from "../utils/date";
import { formatMinutesCN, layoutTimeline } from "./Calendar";

describe("localDateKey (calendar windows)", () => {
  it("formats with zero padding", () => {
    expect(localDateKey(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(localDateKey(new Date(2026, 11, 31))).toBe("2026-12-31");
  });

  it("uses the local date, not the UTC slice", () => {
    // 00:30 local time: in any timezone ahead of UTC the UTC date is the
    // previous day, so toISOString().slice(0, 10) would be wrong there.
    const d = new Date(2026, 8, 22, 0, 30);
    expect(localDateKey(d)).toBe("2026-09-22");
  });
});

describe("formatMinutesCN", () => {
  it("formats sub-hour durations as minutes", () => {
    expect(formatMinutesCN(0)).toBe("0 分钟");
    expect(formatMinutesCN(45)).toBe("45 分钟");
  });

  it("formats whole hours without a minute part", () => {
    expect(formatMinutesCN(60)).toBe("1 小时");
    expect(formatMinutesCN(120)).toBe("2 小时");
  });

  it("formats mixed hours and minutes", () => {
    expect(formatMinutesCN(75)).toBe("1 小时 15 分");
  });

  it("clamps negative input to zero", () => {
    expect(formatMinutesCN(-10)).toBe("0 分钟");
  });
});

describe("layoutTimeline", () => {
  it("places non-overlapping items in a single column", () => {
    const placed = layoutTimeline([
      { item: "a", start: 0, end: 60 },
      { item: "b", start: 120, end: 180 },
    ]);
    expect(placed).toEqual([
      { item: "a", start: 0, end: 60, col: 0, cols: 1 },
      { item: "b", start: 120, end: 180, col: 0, cols: 1 },
    ]);
  });

  it("splits two overlapping items into two columns", () => {
    const placed = layoutTimeline([
      { item: "a", start: 0, end: 90 },
      { item: "b", start: 30, end: 60 },
    ]);
    expect(placed.find((p) => p.item === "a")).toMatchObject({
      col: 0,
      cols: 2,
    });
    expect(placed.find((p) => p.item === "b")).toMatchObject({
      col: 1,
      cols: 2,
    });
  });

  it("keeps transitively-overlapping items in one cluster and reuses freed columns", () => {
    const placed = layoutTimeline([
      { item: "a", start: 0, end: 100 },
      { item: "b", start: 50, end: 150 },
      { item: "c", start: 120, end: 200 },
    ]);
    // a and c don't directly overlap, but both overlap b → one cluster.
    for (const p of placed) expect(p.cols).toBe(2);
    expect(placed.find((p) => p.item === "a")!.col).toBe(0);
    expect(placed.find((p) => p.item === "b")!.col).toBe(1);
    // c starts after a ends, so it reuses a's column.
    expect(placed.find((p) => p.item === "c")!.col).toBe(0);
  });

  it("treats back-to-back items as non-overlapping", () => {
    const placed = layoutTimeline([
      { item: "a", start: 0, end: 60 },
      { item: "b", start: 60, end: 120 },
    ]);
    expect(placed.every((p) => p.cols === 1)).toBe(true);
  });

  it("does not mutate the input array", () => {
    const input = [
      { item: "b", start: 30, end: 60 },
      { item: "a", start: 0, end: 90 },
    ];
    layoutTimeline(input);
    expect(input[0]!.item).toBe("b");
  });
});
