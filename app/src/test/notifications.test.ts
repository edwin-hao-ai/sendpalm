import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../services/tauri-shim", () => ({ IS_BROWSER: () => true }));

describe("ensureNotificationPermission", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("no-ops in browser mode without throwing", async () => {
    const { ensureNotificationPermission } = await import("../services/notifications");
    await expect(ensureNotificationPermission()).resolves.toBeUndefined();
  });

  it("skips the prompt when desktop notifications are disabled in settings", async () => {
    vi.doMock("@tauri-apps/plugin-notification", () => ({
      isPermissionGranted: vi.fn().mockResolvedValue(false),
      requestPermission: vi.fn(),
    }));
    vi.doMock("../stores/ui", () => ({
      appSettings: {
        preferences: { notifications: { desktop: false, quietHoursEnabled: false, quietHoursStart: "22:00", quietHoursEnd: "08:00" } },
      },
      setAppSettings: vi.fn(),
    }));
    const { ensureNotificationPermission } = await import("../services/notifications");
    await ensureNotificationPermission();
    const { requestPermission } = await import("@tauri-apps/plugin-notification");
    expect(requestPermission).not.toHaveBeenCalled();
  });
});