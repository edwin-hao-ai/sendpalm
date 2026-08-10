/** Application bootstrap — runs once on mount.
 * - Loads app settings from tauri-plugin-store
 * - No mock data. UI starts empty until the background IMAP sync loop
 *   pulls real messages from the user's account.
 * - Wires up the reminder re-surfacing tick
 */

import { load } from "@tauri-apps/plugin-store";
import { IS_BROWSER } from "./services/tauri-shim";
import { ensureNotificationPermission } from "./services/notifications";
import {
  listAccounts,
  listAgentAudit,
  listAgentDrafts,
  listAgentSessions,
  listAgentTasks,
  listBundleConfigs,
  listClips,
  listContactNotes,
  listContacts,
  listDrafts,
  listEvents,
  listFiles,
  listFollowUps,
  listLabels,
  listMessages,
  listNotifications,
  listScheduledSends,
  listShortcuts,
  listSnippets,
  listStickies,
  listTasks,
  loadAgentMemory,
  loadAppSettings,
  ensureDefaultShortcuts,
  backfillSearchIndex,
} from "./stores/data";
import {
  setAppSettings,
  setAgentMemory,
  setLoading,
  setError,
  setOnboardingCompleted,
  setOnboardingStep,
} from "./stores/ui";

export const STORE_PATH = "sendpalm.prefs.json";
export { load } from "@tauri-apps/plugin-store";

export async function initApp() {
  setLoading(true);
  try {
    // The tauri-plugin-store throws if invoked outside the Tauri runtime or
    // if the store plugin isn't ready. In browser mode (or if the plugin
    // fails) we skip app-settings/onboarding loading — the UI will use the
    // in-memory defaults from stores/ui.ts.
    if (IS_BROWSER()) {
      setOnboardingCompleted(true);
      setOnboardingStep(null);
    } else if (
      typeof window !== "undefined" &&
      (window.location.hash.includes("onboard-skip") ||
        window.location.search.includes("onboard-skip") ||
        window.location.search.includes("sendpalm_dev_onboard_skip") ||
        localStorage.getItem("sendpalm_dev_onboard_skip") === "1")
    ) {
      // Dev-only URL hash override for end-to-end mobile verification.
      setOnboardingCompleted(true);
      setOnboardingStep(null);
    } else {
      try {
        const store = await load(STORE_PATH);

        const settings = await loadAppSettings(store);
        setAppSettings(settings);

        // Fire-and-forget: request OS permission and push prefs to Rust. Doesn't
        // block the initial paint.
        void ensureNotificationPermission();

        const memory = await loadAgentMemory(store);
        setAgentMemory(memory);

        const completed = await store.get<boolean>("onboarding_completed");
        if (completed) {
          setOnboardingCompleted(true);
          setOnboardingStep(null);
        } else {
          // Mark onboarding as completed on first successful store load so the
          // app is immediately usable (especially on iOS, where URL hash
          // overrides do not survive into the WKWebView). The user can still
          // replay onboarding from Settings → Profile.
          setOnboardingCompleted(true);
          setOnboardingStep(null);
          await store.set("onboarding_completed", true);
          await store.save();
        }
      } catch (storeErr) {
        // Don't block the whole app if tauri-plugin-store isn't available
        // (e.g. dev build flakiness). Fall back to in-memory defaults.
        console.warn(
          "[bootstrap] store load failed, using defaults:",
          storeErr,
        );
        setOnboardingCompleted(true);
        setOnboardingStep(null);
      }
    }

    // No mock seed. Data only comes from:
    //   - The background IMAP IDLE sync loop which pulls real messages
    //   - User actions (compose, add account, follow-up, snippet, etc.)
    // The first sync may take 1–2 min on a large mailbox; the UI shows
    // empty states everywhere until that completes.

    // Seed default keyboard shortcuts on first boot.
    await ensureDefaultShortcuts();

    await Promise.all([
      listAccounts(),
      listContacts(),
      listMessages(),
      listFiles(),
      listEvents(),
      listTasks(),
      listDrafts(),
      listAgentSessions(),
      listAgentTasks(),
      listAgentDrafts(),
      listAgentAudit(),
      listNotifications(),
      listSnippets(),
      listStickies(),
      listContactNotes(),
      listClips(),
      listFollowUps(),
      listScheduledSends(),
      listLabels(),
      listShortcuts(),
      listBundleConfigs(),
    ]);

    // Backfill the FTS index for contacts/files created before the index
    // existed. New messages are indexed by the Rust sync loop; existing
    // messages are backfilled via migration 0009.
    void backfillSearchIndex();

    setLoading(false);
  } catch (e) {
    setError(String(e));
    setLoading(false);
    throw e;
  }
}
