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
  /** Ping for mail from a sender the Gate has not screened yet. */
  firstSenders?: boolean;
}

/** What the OS thinks of us. The plugin can only answer "granted or not", so
 *  `not-granted` covers both "never asked" and "denied" — and those need
 *  different copy: one is fixable with a click, the other needs the System
 *  Settings pane. `ensureNotificationPermission()` is what tells them apart. */
export type NotificationPermission = "granted" | "not-granted" | "unsupported";

/** Read the OS permission WITHOUT prompting. Safe to call on mount.
 *
 *  Asks Rust first: on macOS the plugin answers from the deprecated
 *  NSUserNotification world, where an app that never registered with the
 *  notification centre still reports "granted" — so the Settings row could
 *  never tell the user the truth. */
export async function notificationPermission(): Promise<NotificationPermission> {
  if (IS_BROWSER()) return "unsupported";
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const state = await invoke<string>("notification_permission_state");
    if (state === "granted") return "granted";
    if (state === "not-granted" || state === "not-determined") return "not-granted";
    if (state === "unsupported") return "unsupported";
  } catch {
    /* older backend: fall through to the plugin's answer */
  }
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

  // Rust owns the request on macOS: it talks to UNUserNotificationCenter,
  // which is the only API that can put the system dialog on screen (and the
  // only one that knows the answer afterwards).
  let granted: boolean;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    granted = await invoke<boolean>("request_notification_permission");
  } catch {
    const { isPermissionGranted, requestPermission } = await import(
      "@tauri-apps/plugin-notification"
    );
    granted = await isPermissionGranted();
    if (!granted) {
      try {
        granted = (await requestPermission()) === "granted";
      } catch {
        granted = false;
      }
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

/** Post one notification now, so the user (and support) can tell whether the
 *  OS will actually deliver one. Returns the OS error verbatim when it refuses
 *  — "系统拒绝了" is the answer the Settings row needs. */
export async function sendTestNotification(): Promise<void> {
  if (IS_BROWSER()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("send_test_notification");
}

/** Open the thing a clicked OS banner points at.
 *
 *  The banner only knows an integer id; the Rust side maps it back to the
 *  in-app notification row and returns its `{ type, id }` ref. Then it is the
 *  same navigation the bell dropdown does.
 *
 *  The window is shown first: the banner is most useful exactly when SendPalm
 *  is hidden in the tray, and a mail that opens into an invisible window is
 *  indistinguishable from nothing happening.
 */
export async function openNotificationTarget(notificationId: number): Promise<void> {
  if (IS_BROWSER()) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const ref = await invoke<{ type: string; id: string } | null>(
      "notification_target",
      { id: notificationId },
    );
    if (!ref?.id) return;
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    await win.show();
    await win.unminimize();
    await win.setFocus();
    const { openNotificationRef } = await import("./open-ref");
    openNotificationRef(ref);
  } catch (err) {
    // A dead click is worse than a logged one: this is the only trace that the
    // banner→mail path broke.
    console.warn("[notifications] opening the clicked banner failed:", err);
  }
}

/** Subscribe to OS banner clicks. Registering twice would open the mail twice
 *  (and the second `setSelectedMessageId` would fight the first), so this is
 *  guarded and the listener is kept for the lifetime of the app. */
export async function listenNotificationClicks(): Promise<void> {
  if (IS_BROWSER()) return;
  if (notificationClicksBound) return;
  notificationClicksBound = true;
  try {
    const { onAction } = await import("@tauri-apps/plugin-notification");
    await onAction((event) => {
      // `tap` is the notification body itself; custom action ids are not
      // registered yet, so anything else is not ours to handle.
      if (event.actionId !== "tap") return;
      const id = event.notification?.id;
      if (typeof id !== "number") return;
      void openNotificationTarget(id);
    });
    // macOS posts through UNUserNotificationCenter (see services/mac_notify.rs),
    // whose delegate emits the in-app notification row directly.
    const { listen } = await import("@tauri-apps/api/event");
    await listen<{ row: number }>("notification:action", (event) => {
      const row = event.payload?.row;
      if (typeof row === "number") void openNotificationTarget(row);
    });
  } catch (err) {
    notificationClicksBound = false;
    console.warn("[notifications] banner click listener unavailable:", err);
  }
}

let notificationClicksBound = false;

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
      // Tauri 2 maps camelCase → snake_case on the way in.
      pingFirstSenders: prefs.firstSenders,
    });
  } catch (err) {
    // Not fatal (the next toggle retries), but never silent: a swallowed IPC
    // error here means the Rust side keeps pinging with stale flags, which is
    // exactly the §11 "camelCase drift" bug class where the UI says one thing
    // and the backend does another.
    console.warn("[notifications] notify_settings_changed failed:", err);
  }
}
