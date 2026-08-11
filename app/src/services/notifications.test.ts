import { describe, it, expect, beforeEach, vi } from "vitest";
import { notifySettingsChanged } from "./notifications";

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => {
    invokeMock(...args);
    return Promise.resolve(undefined);
  },
}));

describe("notifications IPC payload", () => {
  beforeEach(() => invokeMock.mockClear());

  it("notifySettingsChanged — sends camelCase keys", async () => {
    await notifySettingsChanged({
      desktop: true,
      quietHoursEnabled: false,
      quietHoursStart: "22:00",
      quietHoursEnd: "07:00",
    } as never);
    const [, args] = invokeMock.mock.calls[0]!;
    expect(args).toEqual({
      desktopEnabled: true,
      quietHoursEnabled: false,
      quietHoursStart: "22:00",
      quietHoursEnd: "07:00",
    });
    expect(args).not.toHaveProperty("desktop_enabled");
    expect(args).not.toHaveProperty("quiet_hours_enabled");
    expect(args).not.toHaveProperty("quiet_hours_start");
    expect(args).not.toHaveProperty("quiet_hours_end");
  });
});
