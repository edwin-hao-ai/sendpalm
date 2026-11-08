/** UI store — toast TTL semantics.
 *  Error toasts are persistent (manual dismiss only); other kinds
 *  auto-dismiss after the default 4s TTL. */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  showToast,
  dismissToast,
  toasts,
  errorLog,
  clearErrorLog,
} from "./ui";

describe("showToast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // drain any leftover toasts between tests
    for (const t of toasts()) dismissToast(t.id);
    clearErrorLog();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("auto-dismisses info toasts after the default TTL", () => {
    showToast({ message: "hi", kind: "info" });
    expect(toasts()).toHaveLength(1);
    vi.advanceTimersByTime(4100);
    expect(toasts()).toHaveLength(0);
  });

  it("keeps error toasts until manually dismissed", () => {
    const id = showToast({ message: "boom", kind: "error" });
    expect(toasts()).toHaveLength(1);
    vi.advanceTimersByTime(60_000);
    expect(toasts()).toHaveLength(1);
    dismissToast(id);
    expect(toasts()).toHaveLength(0);
  });

  it("honours an explicit ttlMs even for errors", () => {
    showToast({ message: "boom", kind: "error", ttlMs: 1500 });
    vi.advanceTimersByTime(1600);
    expect(toasts()).toHaveLength(0);
  });

  it("records error toasts in the error log", () => {
    showToast({ message: "sync broke", kind: "error", source: "sync" });
    expect(errorLog()).toHaveLength(1);
    expect(errorLog()[0]!.message).toBe("sync broke");
    expect(errorLog()[0]!.source).toBe("sync");
  });

  it("does not record non-error toasts in the error log", () => {
    showToast({ message: "ok", kind: "success" });
    expect(errorLog()).toHaveLength(0);
  });
});

describe("toast dedupe and cap", () => {
  beforeEach(() => {
    for (const t of toasts()) dismissToast(t.id);
    clearErrorLog();
  });

  it("collapses identical messages into one counted toast", () => {
    showToast({ message: "同步失败，请重试", kind: "error" });
    showToast({ message: "同步失败，请重试", kind: "error" });
    showToast({ message: "同步失败，请重试", kind: "error" });
    expect(toasts()).toHaveLength(1);
    expect(toasts()[0]!.repeat).toBe(3);
  });

  it("keeps different messages apart", () => {
    showToast({ message: "同步失败，请重试", kind: "error" });
    showToast({ message: "发送失败，请重试", kind: "error" });
    expect(toasts()).toHaveLength(2);
    expect(toasts().every((t) => t.repeat === 1)).toBe(true);
  });

  it("treats the same text in different kinds as different toasts", () => {
    showToast({ message: "已保存", kind: "success" });
    showToast({ message: "已保存", kind: "warning" });
    expect(toasts()).toHaveLength(2);
  });

  it("never stacks more than four toasts", () => {
    // A failing background loop used to add a permanent error card per tick
    // until the screen was covered.
    for (let i = 0; i < 10; i++) {
      showToast({ message: `失败 ${i}`, kind: "error" });
    }
    expect(toasts()).toHaveLength(4);
    // The newest message survives; the oldest entries are the ones dropped.
    expect(toasts()[toasts().length - 1]?.message).toBe("失败 9");
    expect(toasts().some((t) => t.message === "失败 0")).toBe(false);
  });
});
