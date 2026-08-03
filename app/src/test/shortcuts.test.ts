import { describe, it, expect } from "vitest";
import { matches } from "../utils/shortcuts";

function key(
  key: string,
  modifiers: { metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean } = {},
): KeyboardEvent {
  return new KeyboardEvent("keydown", {
    key,
    metaKey: modifiers.metaKey ?? false,
    ctrlKey: modifiers.ctrlKey ?? false,
    shiftKey: modifiers.shiftKey ?? false,
  });
}

describe("shortcut matcher", () => {
  it("matches ⌘K written without explicit plus", () => {
    expect(matches(key("k", { metaKey: true }), "⌘k")).toBe(true);
  });

  it("matches Ctrl+K", () => {
    expect(matches(key("k", { ctrlKey: true }), "ctrl+k")).toBe(true);
  });

  it("matches ⇧A", () => {
    expect(matches(key("A", { shiftKey: true }), "⇧A")).toBe(true);
  });

  it("matches ⌘N", () => {
    expect(matches(key("n", { metaKey: true }), "⌘n")).toBe(true);
  });

  it("does not match without modifier", () => {
    expect(matches(key("k"), "⌘k")).toBe(false);
  });
});
