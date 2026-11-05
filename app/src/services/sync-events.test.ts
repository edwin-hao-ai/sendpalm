import { describe, expect, it, vi } from "vitest";
vi.mock("./tauri-shim", () => ({ IS_BROWSER: () => true }));
import { notifyNewMessages, registerNewMessages } from "./sync-events";
it("delivers and deduplicates IDs received before extraction registers", () => {
  notifyNewMessages(["m1", "m1", "m2"]);
  const handler = vi.fn();
  const stop = registerNewMessages(handler);
  expect(handler).toHaveBeenCalledWith(["m1", "m2"]);
  stop();
});
describe("new mail bridge", () => {
  it("fans out only new IDs and respects cleanup", () => {
    const handler = vi.fn();
    const stop = registerNewMessages(handler);
    notifyNewMessages(["m3", "m3"]);
    expect(handler).toHaveBeenCalledWith(["m3"]);
    stop();
    notifyNewMessages(["m4"]);
    expect(handler).toHaveBeenCalledTimes(1);
    const next = vi.fn();
    registerNewMessages(next)();
    expect(next).toHaveBeenCalledWith(["m4"]);
  });
  it("bounds IDs buffered before the extractor registers", () => {
    notifyNewMessages(Array.from({ length: 200 }, (_, i) => `m${i}`));
    notifyNewMessages(["m200"]);
    const handler = vi.fn();
    registerNewMessages(handler)();
    const received = handler.mock.calls[0]?.[0] as string[];
    expect(received).toHaveLength(200);
    expect(received[0]).toBe("m1");
    expect(received[received.length - 1]).toBe("m200");
  });
});
