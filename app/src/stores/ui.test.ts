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
