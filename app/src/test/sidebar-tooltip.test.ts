import { describe, it, expect } from "vitest";
import { tooltipPosition } from "../components/SidebarTooltip";

describe("tooltipPosition", () => {
  const anchor = () => ({ top: 10, left: 100, right: 130, bottom: 50, width: 30, height: 40 });

  it("places tooltip to the right of the anchor with 8px gap", () => {
    const p = tooltipPosition(anchor(), "right", 120, 24);
    expect(p.left).toBe(130 + 8);
    expect(p.top).toBe(10 + (40 - 24) / 2);
  });

  it("flips to below when the anchor is too close to the top", () => {
    const a = { top: 4, left: 0, right: 30, bottom: 30, width: 30, height: 26 };
    const p = tooltipPosition(a, "right", 120, 30);
    expect(p.top).toBe(30 + 8);
  });
});