import { IS_BROWSER } from "./tauri-shim";
import { appSettings, setAppSettings } from "../stores/ui";

/** Ensure the OS permission for desktop notifications is decided, then mirror
 *  the user's preference into the Rust sync loop via the
 *  `notify_settings_changed` IPC.
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