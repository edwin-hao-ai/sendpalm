/** ShortcutHelp — the help modal derives its list from the same shortcut
 *  table the global handler uses, so it can never drift again. These tests
 *  pin the derivation against DEFAULT_SHORTCUTS. */

import { describe, it, expect } from "vitest";
import { buildShortcutGroups } from "./ShortcutHelp";
import { DEFAULT_SHORTCUTS } from "../utils/shortcut-defaults";

const groups = buildShortcutGroups(DEFAULT_SHORTCUTS);
const flat = () => groups.flatMap((g) => g.items);
const comboOf = (label: string) =>
  flat().find((i) => i.label === label)?.combo;

describe("buildShortcutGroups", () => {
  it("produces the expected groups in order", () => {
    expect(groups.map((g) => g.group)).toEqual([
      "全局",
      "视图",
      "列表导航",
      "邮件操作",
      "日历",
    ]);
  });

  it("uses the real combos (search is ⌘/, set-aside is a, bubble-up is z, trash is t)", () => {
    expect(comboOf("搜索")).toBe("⌘ /");
    expect(comboOf("搁置")).toBe("a");
    expect(comboOf("设为提醒（回到列表顶部）")).toBe("z");
    expect(comboOf("移到回收站")).toBe("t");
  });

  it("includes forward / move / label / ⌘9 / ⌘0 which the old hard-coded list missed", () => {
    const combos = flat().map((i) => i.combo);
    expect(combos).toContain("f");
    expect(combos).toContain("v");
    expect(combos).toContain("b");
    expect(combos).toContain("⌘ 9");
    expect(combos).toContain("⌘ 0");
  });

  it("appends the hard-wired Esc row to 全局", () => {
    const global = groups.find((g) => g.group === "全局")!;
    expect(global.items.some((i) => i.combo === "Esc")).toBe(true);
  });

  it("renders every row in Chinese (no raw English labels leak through)", () => {
    for (const item of flat()) {
      // Brand nouns (Imbox/Gate/Stream/Records/Clips/Agent) are allowed;
      // anything else ASCII-only is a leak of the English DEFAULT_SHORTCUTS label.
      if (/[A-Za-z]/.test(item.label)) {
        expect(item.label).toMatch(
          /Imbox|Gate|Stream|Records|Clips|Agent|Esc/,
        );
      }
    }
  });
});
