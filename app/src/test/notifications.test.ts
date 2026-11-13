import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../services/tauri-shim", () => ({ IS_BROWSER: () => true }));

describe("ensureNotificationPermission", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("reports `unsupported` in browser mode instead of throwing", async () => {
    const { ensureNotificationPermission } = await import(
      "../services/notifications"
    );
    await expect(ensureNotificationPermission()).resolves.toBe("unsupported");
  });

  it("skips the prompt when desktop notifications are disabled in settings", async () => {
    vi.doMock("@tauri-apps/plugin-notification", () => ({
      isPermissionGranted: vi.fn().mockResolvedValue(false),
      requestPermission: vi.fn(),
    }));
    vi.doMock("../stores/ui", () => ({
      appSettings: {
        preferences: {
          notifications: {
            desktop: false,
            quietHoursEnabled: false,
            quietHoursStart: "22:00",
            quietHoursEnd: "08:00",
          },
        },
      },
      setAppSettings: vi.fn(),
    }));
    const { ensureNotificationPermission } = await import(
      "../services/notifications"
    );
    await ensureNotificationPermission();
    const { requestPermission } = await import(
      "@tauri-apps/plugin-notification"
    );
    expect(requestPermission).not.toHaveBeenCalled();
  });
});

describe("notification permission vs. user intent", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("../services/tauri-shim");
  });

  /** The two are different things: `desktop` is what the user asked for, the
   *  permission is what the OS allows. The Rust ping flag must be the AND of
   *  them — pinging while the OS refuses produces a silent no-op per new mail,
   *  and the user has no way to find out why. */
  function mockEnv(granted: boolean) {
    // Rust owns the request now: `request_notification_permission` answers,
    // `notify_settings_changed` is fire-and-forget.
    const invoke = vi.fn((command: string) =>
      Promise.resolve(command === "request_notification_permission" ? granted : undefined),
    );
    const requestPermission = vi
      .fn()
      .mockResolvedValue(granted ? "granted" : "denied");
    vi.doMock("../services/tauri-shim", () => ({ IS_BROWSER: () => false }));
    vi.doMock("@tauri-apps/plugin-notification", () => ({
      isPermissionGranted: vi.fn().mockResolvedValue(granted),
      requestPermission,
    }));
    vi.doMock("@tauri-apps/api/core", () => ({ invoke }));
    vi.doMock("../stores/ui", () => ({
      appSettings: {
        preferences: {
          notifications: {
            desktop: true,
            digest: false,
            sound: true,
            quietHoursEnabled: false,
            quietHoursStart: "22:00",
            quietHoursEnd: "08:00",
          },
        },
      },
      setAppSettings: vi.fn(),
    }));
    return { invoke, requestPermission };
  }

  it("tells Rust to ping once the OS grants permission", async () => {
    const { invoke } = mockEnv(true);
    const { ensureNotificationPermission } = await import(
      "../services/notifications"
    );
    await expect(ensureNotificationPermission()).resolves.toBe("granted");
    expect(invoke).toHaveBeenCalledWith("notify_settings_changed", {
      desktopEnabled: true,
      digestEnabled: false,
      soundEnabled: true,
      quietHoursEnabled: false,
      quietHoursStart: "22:00",
      quietHoursEnd: "08:00",
    });
  });

  it("turns the Rust ping off when the OS refuses, without touching the user's toggle", async () => {
    const { invoke } = mockEnv(false);
    const { ensureNotificationPermission } = await import(
      "../services/notifications"
    );
    await expect(ensureNotificationPermission()).resolves.toBe("not-granted");
    expect(invoke).toHaveBeenCalledWith(
      "notify_settings_changed",
      expect.objectContaining({ desktopEnabled: false }),
    );
    // The intent stays in the JS store — the Settings switch must keep showing
    // what the user chose, with a separate warning about the OS.
    const { setAppSettings } = await import("../stores/ui");
    expect(setAppSettings).not.toHaveBeenCalled();
  });

  it("boot sync uses the persisted flags verbatim", async () => {
    const { invoke } = mockEnv(true);
    const { syncNotificationPrefs } = await import("../services/notifications");
    await syncNotificationPrefs({
      desktop: false,
      digest: true,
      sound: false,
      quietHoursEnabled: true,
      quietHoursStart: "21:30",
      quietHoursEnd: "07:00",
    });
    expect(invoke).toHaveBeenCalledWith(
      "notify_settings_changed",
      expect.objectContaining({
        desktopEnabled: false,
        digestEnabled: true,
        soundEnabled: false,
        quietHoursEnabled: true,
        quietHoursStart: "21:30",
        quietHoursEnd: "07:00",
      }),
    );
  });
});
