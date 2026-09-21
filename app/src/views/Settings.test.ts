/** Settings view regression guards (2026-09-22 UX pass).
 *
 * Two layers:
 *  1. Pure-function tests for the exported helpers
 *     (`comboFromKeyEvent`, `shortcutActionLabel`).
 *  2. `?raw` source assertions — the audit found dead native
 *     `confirm()`/`prompt()` calls (broken under WKWebView), milestone
 *     markers ("M11") and internal action ids leaking into the UI.
 *     Those regressions are cheap to catch structurally.
 */

import { describe, expect, it } from "vitest";
import { comboFromKeyEvent, shortcutActionLabel } from "./Settings";
import source from "./Settings.tsx?raw";

describe("comboFromKeyEvent", () => {
  const ev = (
    key: string,
    mods: Partial<{ meta: boolean; ctrl: boolean; shift: boolean }> = {},
  ) => ({
    key,
    metaKey: mods.meta ?? false,
    ctrlKey: mods.ctrl ?? false,
    shiftKey: mods.shift ?? false,
  });

  it("captures plain letters", () => {
    expect(comboFromKeyEvent(ev("j"))).toBe("j");
  });
  it("captures ⌘ combos from metaKey or ctrlKey", () => {
    expect(comboFromKeyEvent(ev("1", { meta: true }))).toBe("⌘1");
    expect(comboFromKeyEvent(ev("k", { ctrl: true }))).toBe("⌘k");
  });
  it("captures ⇧ combos with uppercase letters", () => {
    expect(comboFromKeyEvent(ev("A", { shift: true }))).toBe("⇧A");
  });
  it("maps arrow keys to glyphs", () => {
    expect(comboFromKeyEvent(ev("ArrowLeft"))).toBe("←");
    expect(comboFromKeyEvent(ev("ArrowRight"))).toBe("→");
  });
  it("ignores pure modifier presses and Escape", () => {
    expect(comboFromKeyEvent(ev("Meta"))).toBeNull();
    expect(comboFromKeyEvent(ev("Shift"))).toBeNull();
    expect(comboFromKeyEvent(ev("Escape"))).toBeNull();
  });
});

describe("shortcutActionLabel", () => {
  it("maps internal action ids to Chinese names", () => {
    expect(shortcutActionLabel("nav:imbox", "Imbox")).toBe("Imbox（收件箱）");
    expect(shortcutActionLabel("message:reply-later", "Reply later")).toBe(
      "稍后回复",
    );
  });
  it("falls back to the stored label for unknown actions", () => {
    expect(shortcutActionLabel("custom:thing", "自定义")).toBe("自定义");
  });
});

describe("Settings.tsx source guards", () => {
  it("does not use native confirm()/prompt() (dead under WKWebView)", () => {
    expect(source).not.toMatch(/\bconfirm\(/);
    expect(source).not.toMatch(/\bprompt\(/);
    expect(source).toContain("ConfirmDialog");
  });

  it("has no milestone markers or dev-status wording in UI copy", () => {
    expect(source).not.toMatch(/M7|M10|M11/);
    expect(source).not.toContain("实装");
    expect(source).not.toContain("开发中");
  });

  it("does not render the internal shortcut action id column", () => {
    expect(source).not.toContain("{s.action}");
  });

  it("renders Chinese tab labels", () => {
    for (const label of [
      "个人资料",
      "账户",
      "偏好",
      "标签",
      "片段",
      "数据",
      "快捷键",
    ]) {
      expect(source).toContain(label);
    }
  });

  it("keeps the destructive data actions behind confirmations", () => {
    expect(source).toContain("清空回收站？");
    expect(source).toContain("清空所有数据");
    expect(source).toContain("ResetDataModal");
  });

  it("keeps the desktop two-column rail layout", () => {
    expect(source).toContain('"grid-template-columns": "280px minmax(0, 1fr)"');
  });
});
