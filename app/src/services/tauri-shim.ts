/** Browser-mode Tauri shim.
 * In `pnpm dev` (vite standalone), the frontend imports `@tauri-apps/api/core`
 * which throws if `__TAURI_INTERNALS__` is missing. We install a global
 * `window.__TAURI_INTERNALS__` shim that returns mock data, so the entire
 * frontend renders identically to the Tauri build but with empty SQL.
 *
 * Used by Playwright e2e to verify the UI without booting a real IMAP/SMTP.
 */

const IS_TAURI =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

if (!IS_TAURI && typeof window !== "undefined") {
  // Flag so other modules (e.g. bootstrap.ts, services/data.ts) can detect
  // they are running in browser mode and skip Tauri-specific paths.
  (
    window as unknown as { __SENDPALM_BROWSER_MODE__?: boolean }
  ).__SENDPALM_BROWSER_MODE__ = true;

  // Minimal mock for Tauri internals so src/services/backend.ts can render.
  // Each Tauri command gets a sensible default that lets the UI render its
  // empty states correctly. The real backend (Tauri) returns real data.
  // @ts-expect-error - we are intentionally setting a private Tauri global in browser mode
  window.__TAURI_INTERNALS__ = {
    metadata: {
      currentWindow: { label: "main" },
      currentWebview: { label: "main" },
    },
    invoke: (cmd: string, _args?: unknown): Promise<unknown> => {
      let result: unknown;
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
          result = [];
          break;
        case "list_email_providers":
          result = [
            {
              id: "feishu",
              label: "飞书邮箱",
              icon: "feather",
              credentials_hint: "Feishu Mail · 用 app-specific password",
              imap_host: "imap.feishu.cn",
              imap_port: 993,
              smtp_host: "smtp.feishu.cn",
              smtp_port: 465,
              auth_mode: "app-password",
              smtp_implicit_tls: true,
            },
            {
              id: "gmail",
              label: "Gmail",
              icon: "google-logo",
              credentials_hint:
                "Gmail · 需在 Google 账号启用 IMAP 并用 app password",
              imap_host: "imap.gmail.com",
              imap_port: 993,
              smtp_host: "smtp.gmail.com",
              smtp_port: 465,
              auth_mode: "app-password",
              smtp_implicit_tls: true,
            },
            {
              id: "outlook",
              label: "Outlook / Microsoft 365",
              icon: "microsoft-outlook-logo",
              credentials_hint:
                "Outlook · 用 Microsoft account password 或 app password",
              imap_host: "outlook.office365.com",
              imap_port: 993,
              smtp_host: "smtp.office365.com",
              smtp_port: 587,
              auth_mode: "app-password",
              smtp_implicit_tls: false,
            },
            {
              id: "icloud",
              label: "iCloud",
              icon: "apple-logo",
              credentials_hint:
                "iCloud · 需在 appleid.apple.com 生成 app-specific password",
              imap_host: "imap.mail.me.com",
              imap_port: 993,
              smtp_host: "smtp.mail.me.com",
              smtp_port: 587,
              auth_mode: "app-password",
              smtp_implicit_tls: false,
            },
            {
              id: "yahoo",
              label: "Yahoo Mail",
              icon: "yahoo-logo",
              credentials_hint: "Yahoo · 用 account password 或 app password",
              imap_host: "imap.mail.yahoo.com",
              imap_port: 993,
              smtp_host: "smtp.mail.yahoo.com",
              smtp_port: 465,
              auth_mode: "app-password",
              smtp_implicit_tls: true,
            },
            {
              id: "qq",
              label: "QQ 邮箱",
              icon: "chat-circle",
              credentials_hint:
                "QQ · 授权码 (不是 QQ 密码)；在网页版 QQ 邮箱设置 → 账户 → 开启 IMAP/SMTP",
              imap_host: "imap.qq.com",
              imap_port: 993,
              smtp_host: "smtp.qq.com",
              smtp_port: 465,
              auth_mode: "password-with-auth-code",
              smtp_implicit_tls: true,
            },
            {
              id: "netease-163",
              label: "网易 163 邮箱",
              icon: "envelope-simple",
              credentials_hint:
                "163 · 授权码；在 mail.163.com 设置 → POP3/SMTP/IMAP 开启",
              imap_host: "imap.163.com",
              imap_port: 993,
              smtp_host: "smtp.163.com",
              smtp_port: 465,
              auth_mode: "password-with-auth-code",
              smtp_implicit_tls: true,
            },
            {
              id: "netease-126",
              label: "网易 126 邮箱",
              icon: "envelope-simple",
              credentials_hint: "126 · 授权码",
              imap_host: "imap.126.com",
              imap_port: 993,
              smtp_host: "smtp.126.com",
              smtp_port: 465,
              auth_mode: "password-with-auth-code",
              smtp_implicit_tls: true,
            },
            {
              id: "fastmail",
              label: "Fastmail",
              icon: "envelope-open",
              credentials_hint:
                "Fastmail · app password 在 settings → passwords",
              imap_host: "imap.fastmail.com",
              imap_port: 993,
              smtp_host: "smtp.fastmail.com",
              smtp_port: 465,
              auth_mode: "app-password",
              smtp_implicit_tls: true,
            },
            {
              id: "custom",
              label: "自定义 IMAP/SMTP",
              icon: "wrench",
              credentials_hint: "填入任意 IMAP/SMTP host:port",
              imap_host: "",
              imap_port: 993,
              smtp_host: "",
              smtp_port: 465,
              auth_mode: "app-password",
              smtp_implicit_tls: true,
            },
          ];
          break;
        case "get_sync_state":
          result = {
            account_id: "",
            uid_validity: 0,
            last_uid: 0,
            last_synced_at: "未连接（浏览器模式）",
          };
          break;
        default:
          result = null;
      }
      return Promise.resolve(result);
    },
  };
}

/** Module-level helper to detect browser mode from any frontend file. */
export const IS_BROWSER = (): boolean =>
  typeof window !== "undefined" &&
  !!(window as unknown as { __SENDPALM_BROWSER_MODE__?: boolean })
    .__SENDPALM_BROWSER_MODE__;

export {};
