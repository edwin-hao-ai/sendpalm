import { IS_BROWSER } from "./tauri-shim";
import { appSettings, setAppSettings } from "../stores/ui";

/** The persisted (JS-owned) notification preferences — the exact shape the
 *  Rust `notify_settings_changed` command takes. */
export interface NotificationPrefs {
  desktop: boolean;
  digest: boolean;
  sound: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
}

/** What the OS thinks of us. The plugin can only answer "granted or not", so
 *  `not-granted` covers both "never asked" and "denied" — and those need
 *  different copy: one is fixable with a click, the other needs the System
 *  Settings pane. `ensureNotificationPermission()` is what tells them apart. */
export type NotificationPermission = "granted" | "not-granted" | "unsupported";

/** Read the OS permission WITHOUT prompting. Safe to call on mount. */
export async function notificationPermission(): Promise<NotificationPermission> {
  if (IS_BROWSER()) return "unsupported";
  try {
    const { isPermissionGranted } = await import(
      "@tauri-apps/plugin-notification"
    );
    return (await isPermissionGranted()) ? "granted" : "not-granted";
  } catch {
    return "unsupported";
  }
}

/** Ask the OS for notification permission EXPLICITLY — called from the
 *  first-run prompt and from Settings, never silently at boot (an unexplained
 *  OS dialog on first launch trains users to hit "Don't Allow").
 *
 *  Returns the resulting permission instead of folding it into the `desktop`
 *  preference: those are two different things. The toggle is the user's
 *  intent ("I want banners"), the permission is the OS's answer, and when they
 *  disagree the UI has to say so — turning the toggle off silently was how
 *  "通知不弹" became invisible (no banner, no warning, toggle still on).
 *
 *  No-op in browser mode (Playwright / `pnpm dev`).
 */
export async function ensureNotificationPermission(): Promise<NotificationPermission> {
  if (IS_BROWSER()) return "unsupported";

  const intent = appSettings.preferences.notifications;
  if (!intent.desktop) {
    // The user turned notifications off — asking the OS for permission would
    // be a dialog for a feature they just disabled.
    await notifySettingsChanged({ ...intent, desktop: false });
    return notificationPermission();
  }

  const { isPermissionGranted, requestPermission } = await import(
    "@tauri-apps/plugin-notification"
  );

  let granted = await isPermissionGranted();
  // A denied app is not re-prompted by macOS, so `requestPermission` returns
  // "denied" immediately. Calling it is still correct: on a first run it is
  // the only way to get the dialog.
  if (!granted) {
    try {
      granted = (await requestPermission()) === "granted";
    } catch {
      granted = false;
    }
  }
  // Rust decides whether to ping; it must always know the user's intent. When
  // the OS refuses, disable the Rust-side ping too — an impossible banner is a
  // wasted IPC round-trip per new mail.
  await notifySettingsChanged({ ...intent, desktop: granted });
  return granted ? "granted" : "not-granted";
}

/** Open the macOS Notifications pane so the user can allow SendPalm after a
 *  denial. No-op elsewhere: the other platforms have no deep link we can
 *  rely on, and the Settings row already tells the user where to look. */
export async function openSystemNotificationSettings(): Promise<void> {
  if (IS_BROWSER()) return;
  if (typeof navigator === "undefined" || !navigator.userAgent.includes("Mac")) {
    return;
  }
  const { openUrl } = await import("@tauri-apps/plugin-opener");
  // `x-apple.systempreferences:` needs the scoped `opener:allow-open-url`
  // entry in capabilities/default.json.
  await openUrl(
    "x-apple.systempreferences:com.apple.preference.notifications",
  ).catch(() => {
    /* older macOS builds reject the anchor — the copy still tells the path */
  });
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

/** Push the persisted preferences into the Rust sync loop.
 *
 *  Called at boot (bootstrap.ts) as well as from every Settings toggle: the
 *  Rust side is the one deciding whether a new mail pings, and it keeps its own
 *  copy in memory. Writing that copy only on a toggle is why "关掉桌面通知"
 *  came back after a restart. */
export function syncNotificationPrefs(prefs: NotificationPrefs): Promise<void> {
  return notifySettingsChanged(prefs);
}

export async function notifySettingsChanged(
  prefs: NotificationPrefs,
): Promise<void> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("notify_settings_changed", {
      desktopEnabled: prefs.desktop,
      // Tauri 2 maps camelCase → snake_case on the way in; the Rust command
      // argument is `digest_enabled`.
      digestEnabled: prefs.digest,
      soundEnabled: prefs.sound,
      quietHoursEnabled: prefs.quietHoursEnabled,
      quietHoursStart: prefs.quietHoursStart,
      quietHoursEnd: prefs.quietHoursEnd,
    });
  } catch (err) {
    // Not fatal (the next toggle retries), but never silent: a swallowed IPC
    // error here means the Rust side keeps pinging with stale flags, which is
    // exactly the §11 "camelCase drift" bug class where the UI says one thing
    // and the backend does another.
    console.warn("[notifications] notify_settings_changed failed:", err);
  }
}
