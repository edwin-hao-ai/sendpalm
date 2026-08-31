/** ARCH-1: i18n helper tests. */

import { describe, it, expect, beforeEach } from "vitest";
import { t, setLocale, defineTranslation, activeLocale } from "../i18n";

describe("i18n", () => {
  beforeEach(() => {
    setLocale("zh-CN");
  });

  it("returns the fallback when no translation is registered", () => {
    expect(t("unknown.key", "默认文本")).toBe("默认文本");
  });

  it("returns the registered translation in en-US", () => {
    setLocale("en-US");
    expect(t("imbox.tab.new", "新消息")).toBe("New for you");
  });

  it("falls back when the active locale is zh-CN and key is missing", () => {
    expect(activeLocale()).toBe("zh-CN");
    expect(t("imbox.tab.new", "新消息")).toBe("新消息");
  });

  it("interpolates {{var}} placeholders", () => {
    defineTranslation("en-US", {
      "test.greet": "Hello, {{name}}! You have {{count}} messages.",
    });
    setLocale("en-US");
    expect(t("test.greet", "你好，{{name}}！", { name: "Edwin", count: 3 })).toBe(
      "Hello, Edwin! You have 3 messages.",
    );
  });

  it("leaves unknown placeholders verbatim", () => {
    setLocale("en-US");
    // "{{nope}}" stays as "{{nope}}" when the variable is missing.
    // We use a key that has no registered translation, so the
    // fallback is what we get to inspect.
    expect(t("unregistered.key", "Hi, {{nope}}!")).toBe("Hi, {{nope}}!");
  });
});
