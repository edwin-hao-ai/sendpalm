/** Browser-mode Tauri shim.
 * In `pnpm dev` (vite standalone), the frontend imports `@tauri-apps/api/core`
 * which throws if `__TAURI_INTERNALS__` is missing. We install a global
 * `window.__TAURI_INTERNALS__` shim that returns mock data, so the entire
 * frontend renders identically to the Tauri build but with empty SQL.
 *
 * Used by Playwright e2e to verify the UI without booting a real IMAP/SMTP.
 */

const IS_TAURI = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

if (!IS_TAURI && typeof window !== "undefined") {
  // Flag so other modules (e.g. bootstrap.ts, services/data.ts) can detect
  // they are running in browser mode and skip Tauri-specific paths.
  (window as unknown as { __SENDPALM_BROWSER_MODE__?: boolean }).__SENDPALM_BROWSER_MODE__ = true;

  // Minimal mock for Tauri internals so src/services/backend.ts can render.
  // Each Tauri command gets a sensible default that lets the UI render its
  // empty states correctly. The real backend (Tauri) returns real data.
  // @ts-ignore - we are intentionally setting a private Tauri global
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
    invoke: async (cmd: string, _args?: unknown) => {
      switch (cmd) {
        case "list_accounts":
        case "list_contacts":
        case "list_messages":
        case "list_files":
        case "list_events":
        case "list_tasks":
        case "list_drafts":
        case "list_agent_sessions":
        case "list_agent_tasks":
        case "list_agent_drafts":
        case "list_agent_audit":
        case "list_notifications":
        case "list_snippets":
        case "list_stickies":
        case "list_contact_notes":
        case "list_clips":
        case "list_follow_ups":
        case "list_scheduled_sends":
        case "list_labels":
        case "list_shortcuts":
        case "list_bundle_configs":
        case "list_mailboxes":
        case "list_email_providers":
          return [];
        case "get_sync_state":
          return {
            account_id: "",
            uid_validity: 0,
            last_uid: 0,
            last_synced_at: "未连接（浏览器模式）",
          };
        default:
          return null;
      }
    },
  };
}

/** Module-level helper to detect browser mode from any frontend file. */
export const IS_BROWSER = (): boolean =>
  typeof window !== "undefined" &&
  !!(window as unknown as { __SENDPALM_BROWSER_MODE__?: boolean }).__SENDPALM_BROWSER_MODE__;

export {};

