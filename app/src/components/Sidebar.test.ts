/** Sidebar — nav display labels. Brand nouns stay English; everything
 *  else is Chinese; tooltips carry the Chinese annotation + shortcut. */

import { describe, it, expect } from "vitest";
import { navDisplayLabel, navTooltipLabel } from "./Sidebar";
import { NAV_SECTIONS } from "../utils/labels";

describe("navDisplayLabel", () => {
  it("keeps HEY brand nouns in English", () => {
    expect(navDisplayLabel("screener")).toBe("Gate");
    expect(navDisplayLabel("imbox")).toBe("Imbox");
    expect(navDisplayLabel("feed")).toBe("Stream");
    expect(navDisplayLabel("paperTrail")).toBe("Records");
    expect(navDisplayLabel("clips")).toBe("Clips");
  });

  it("renders non-brand views in Chinese", () => {
    expect(navDisplayLabel("contacts")).toBe("联系人");
    expect(navDisplayLabel("trash")).toBe("回收站");
    expect(navDisplayLabel("spam")).toBe("垃圾邮件");
    expect(navDisplayLabel("settings")).toBe("设置");
  });

  it("covers every NAV_SECTIONS view (no raw view id leaks to the UI)", () => {
    for (const s of NAV_SECTIONS) {
      expect(navDisplayLabel(s.view)).not.toBe(s.view);
    }
  });

  it("falls back to the input for unknown views", () => {
    expect(navDisplayLabel("nope")).toBe("nope");
  });
});

describe("navTooltipLabel", () => {
  it("annotates brand nouns with Chinese and appends the shortcut hint", () => {
    const imbox = NAV_SECTIONS.find((s) => s.view === "imbox")!;
    expect(navTooltipLabel(imbox)).toBe("Imbox · 收件箱 (⌘2)");
  });

  it("omits the parenthesised hint when there is none", () => {
    const drafts = NAV_SECTIONS.find((s) => s.view === "drafts")!;
    expect(navTooltipLabel(drafts)).toBe("草稿");
  });
});
