/** Application bootstrap — runs once on mount.
 * - Loads app settings from tauri-plugin-store
 * - Seeds demo data if DB is empty (first-run)
 * - Wires up the reminder re-surfacing tick
 */

import { load } from "@tauri-apps/plugin-store";
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
import { seedIfEmpty } from "./seed/seed";

export const STORE_PATH = "sendpalm.prefs.json";

export async function initApp() {
  setLoading(true);
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

    await seedIfEmpty();

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