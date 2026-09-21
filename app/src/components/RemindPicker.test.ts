/** RemindPicker — preset computation, aligned with the prototype's
 *  bubble-up choices (prototype-v11.js:10716). */

import { describe, it, expect } from "vitest";
import { remindPresets, formatRemindTime } from "./RemindPicker";

const NOW = new Date("2026-09-22T10:00:00"); // a Tuesday

describe("remindPresets", () => {
  it("offers the five prototype presets with Chinese labels", () => {
    const presets = remindPresets(NOW);
    expect(presets.map((p) => p.label)).toEqual([
      "立即",
      "今天稍后 18:00",
      "明天 9:00",
      "本周末 9:00",
      "下周一 9:00",
    ]);
  });

  it("明天 9:00 is 9 AM the next day", () => {
    const tomorrow = remindPresets(NOW)[2]!.time;
    expect(tomorrow.getDate()).toBe(23);
    expect(tomorrow.getHours()).toBe(9);
    expect(tomorrow.getMinutes()).toBe(0);
  });

  it("本周末 lands on the coming Saturday at 9:00", () => {
    const weekend = remindPresets(NOW)[3]!.time;
    expect(weekend.getDay()).toBe(6);
    expect(weekend.getTime()).toBeGreaterThan(NOW.getTime());
    expect(weekend.getHours()).toBe(9);
  });

  it("下周一 lands on the next Monday at 9:00, even on a Sunday", () => {
    const sunday = new Date("2026-09-27T10:00:00");
    const monday = remindPresets(sunday)[4]!.time;
    expect(monday.getDay()).toBe(1);
    expect(monday.getDate()).toBe(28);
    expect(monday.getHours()).toBe(9);
  });

  it("下周一 from a Monday rolls to the following week", () => {
    const monday = new Date("2026-09-21T10:00:00");
    const next = remindPresets(monday)[4]!.time;
    expect(next.getDay()).toBe(1);
    expect(next.getDate()).toBe(28);
  });
});

describe("formatRemindTime", () => {
  it("renders a zh-CN date-time string", () => {
    const s = formatRemindTime(new Date("2026-09-23T09:00:00"));
    expect(s).toContain("9");
    expect(s).toContain("23");
    expect(s).toMatch(/周/);
  });
});
