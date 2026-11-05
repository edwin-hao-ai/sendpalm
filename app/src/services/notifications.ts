import { IS_BROWSER } from "./tauri-shim";
import { appSettings, setAppSettings } from "../stores/ui";

/** Ask the OS for notification permission EXPLICITLY — called from the
 *  first-run prompt's action, never silently at boot (an unexplained OS
 *  dialog on first launch trains users to hit "Don't Allow"). Mirrors the
 *  outcome into the Rust sync loop via `notify_settings_changed`.
 *
 *  No-op in browser mode (Playwright / `pnpm dev`).
 */
export async function ensureNotificationPermission(): Promise<void> {
  if (IS_BROWSER()) return;

  const { isPermissionGranted, requestPermission } = await import(
    "@tauri-apps/plugin-notification"
  );

  const prefs = appSettings.preferences.notifications;
  if (!prefs.desktop) {
    // User has explicitly opted out — no prompt.
    await notifySettingsChanged(prefs);
    return;
  }

  let granted = await isPermissionGranted();
  if (!granted) {
    const perm = await requestPermission();
    granted = perm === "granted";
    setAppSettings("preferences", "notifications", {
      ...prefs,
      desktop: granted,
    });
  }
  await notifySettingsChanged(appSettings.preferences.notifications);
}

/** One-time first-run prompt: after init, offer notifications with the
 *  reason attached. Marks `permissionPrompted` so it never reappears. */
export function maybePromptNotificationPermission(): void {
  if (IS_BROWSER()) return;
  const prefs = appSettings.preferences.notifications;
  if (prefs.permissionPrompted || !prefs.desktop) return;
  setAppSettings("preferences", "notifications", {
    ...prefs,
    permissionPrompted: true,
  });
  void import("../stores/ui").then(({ showToast }) => {
    showToast({
      message:
        "开启通知后，重要邮件到达会弹提醒（订阅邮件不会打扰你）。",
      kind: "info",
      ttlMs: 15_000,
      action: {
        label: "开启通知",
        run: () => {
          void ensureNotificationPermission();
        },
      },
    });
  });
}

export async function notifySettingsChanged(prefs: {
  desktop: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
}): Promise<void> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("notify_settings_changed", {
      desktopEnabled: prefs.desktop,
      quietHoursEnabled: prefs.quietHoursEnabled,
      quietHoursStart: prefs.quietHoursStart,
      quietHoursEnd: prefs.quietHoursEnd,
    });
  } catch {
    // The Rust side will pick up the next store.set on app restart.
  }
}