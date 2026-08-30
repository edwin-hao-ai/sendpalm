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
  listBundleConfigs,
  listLabels,
  listShortcuts,
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
import { refetchContacts } from "./stores/contacts";

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

        // P2: apply the persisted theme preference to <html data-theme>.
        // The dark-mode tokens in styles/tokens.css only activate when
        // this attribute is "dark" — without this, the toggle in
        // Settings has no visual effect.
        const t = settings.preferences?.theme ?? "light";
        document.documentElement.setAttribute(
          "data-theme",
          t === "dark" ? "dark" : "light",
        );

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
          // P0-6: on a true first run, actually run the 4-step wizard
          // instead of auto-completing it. The previous code auto-completed
          // for "iOS WKWebView hash doesn't survive" reasons, but on desktop
          // the user never saw step 3 (sync) or step 4 (done) at all.
          // We still keep the file marker so the wizard doesn't replay on
          // every cold start — the wizard is gated by `onboardingStep`
          // which is null until the user opens it via Settings → Profile.
          setOnboardingCompleted(false);
          setOnboardingStep(0);
          // P0-7: do NOT mark completed=true here. The wizard's last
          // step (or "Skip" button) writes the flag. Steps 1 and 2
          // (currently visible) need to play through; "Skip" lets
          // power users bypass without seeing steps 3/4.
          await store.set("onboarding_started_at", new Date().toISOString());
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

    // Only the small lookups the topbar + sidebar need at boot:
    //   - accounts (topbar sync badge)
    //   - labels (sidebar)
    //   - shortcuts (global keyboard handler)
    //   - bundle configs (per-sender Imbox bundling)
    // Every other list (messages, files, contacts, drafts, events, etc.)
    // is loaded lazily by the view that needs it via createResource. The
    // previous version of this Promise.all pulled 20+ full tables across
    // the IPC bridge in parallel, which pushed ~360 MB of message
    // body_html through the webview at boot and ballooned the V8 heap
    // to 8 GB before the user could click anything. See
    // `docs/lessons.md` (2026-08-20 entry).
    await Promise.all([
      listAccounts(),
      listLabels(),
      listShortcuts(),
      listBundleConfigs(),
    ]);

    // P2/ARCH-3: warm the shared contacts store. Without this,
    // the first view that subscribes to contactsList would pay
    // the SQLite roundtrip itself. Doing it here ensures
    // ContactPanel, MeetingPanel, Agent, and Compose all read
    // from an already-warm signal.
    void refetchContacts();

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
