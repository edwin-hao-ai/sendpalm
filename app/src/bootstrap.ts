/** Application bootstrap — runs once on mount.
 * - Loads app settings from tauri-plugin-store
 * - No mock data. UI starts empty until the background IMAP sync loop
 *   pulls real messages from the user's account.
 * - Wires up the reminder re-surfacing tick
 */

import { load } from "@tauri-apps/plugin-store";
import { IS_BROWSER } from "./services/tauri-shim";
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
    } else {
      try {
        const store = await load(STORE_PATH);

        const settings = await loadAppSettings(store);
        setAppSettings(settings);

        const memory = await loadAgentMemory(store);
        setAgentMemory(memory);

        const completed = await store.get<boolean>("onboarding_completed");
        if (completed) {
          setOnboardingCompleted(true);
          setOnboardingStep(null);
        } else {
          setOnboardingCompleted(false);
          setOnboardingStep(0);
        }
      } catch (storeErr) {
        // Don't block the whole app if tauri-plugin-store isn't available
        // (e.g. dev build flakiness). Fall back to in-memory defaults.
        console.warn("[bootstrap] store load failed, using defaults:", storeErr);
        setOnboardingCompleted(true);
        setOnboardingStep(null);
      }
    }

    // No mock seed. Data only comes from:
    //   - The background IMAP IDLE sync loop which pulls real messages
    //   - User actions (compose, add account, follow-up, snippet, etc.)
    // The first sync may take 1–2 min on a large mailbox; the UI shows
    // empty states everywhere until that completes.
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

    setLoading(false);
  } catch (e) {
    setError(String(e));
    setLoading(false);
    throw e;
  }
}