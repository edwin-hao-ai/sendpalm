//! System tray — close-to-tray, unread badge, quick actions.
//!
//! Design (docs/design/tray-mockup.html, approved 2026-11-03):
//! closing the window hides the app into the tray; mail sync,
//! notifications, and the local Agent gateway keep running. Quit only
//! happens from the tray menu (or ⌘Q while a window is visible).
//!
//! Settings (`preferences.background` in `sendpalm.prefs.json`) are the
//! single source of truth — Rust re-reads the small JSON file at each
//! decision point instead of mirroring state over IPC.

use sqlx::SqlitePool;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::menu::{CheckMenuItem, MenuBuilder, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager};

/// Set by the tray "quit" item so the ExitRequested handler allows the
/// process to die. Any other exit attempt (window close while a window
/// is the last one, Cmd+Q without a visible window) hides to tray instead.
pub static ALLOW_EXIT: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct BackgroundPrefs {
    pub close_to_tray: bool,
    pub launch_at_login: bool,
    pub show_unread_badge: bool,
    pub keep_gateway: bool,
}

impl Default for BackgroundPrefs {
    fn default() -> Self {
        Self {
            close_to_tray: true,
            launch_at_login: false,
            show_unread_badge: true,
            keep_gateway: true,
        }
    }
}

/// Read the background prefs from the store file. Defaults apply when the
/// file or field is missing; a corrupt file falls back to defaults rather
/// than blocking window close.
pub fn read_background_prefs(app: &AppHandle) -> BackgroundPrefs {
    let mut prefs = BackgroundPrefs::default();
    let Ok(dir) = app.path().app_data_dir() else {
        return prefs;
    };
    let Ok(text) = std::fs::read_to_string(dir.join("sendpalm.prefs.json")) else {
        return prefs;
    };
    let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) else {
        return prefs;
    };
    let b = &v["app_settings"]["preferences"]["background"];
    if let Some(x) = b["closeToTray"].as_bool() {
        prefs.close_to_tray = x;
    }
    if let Some(x) = b["launchAtLogin"].as_bool() {
        prefs.launch_at_login = x;
    }
    if let Some(x) = b["showUnreadBadge"].as_bool() {
        prefs.show_unread_badge = x;
    }
    if let Some(x) = b["keepGateway"].as_bool() {
        prefs.keep_gateway = x;
    }
    prefs
}

/// macOS tray title carrying the unread badge ("3" / "99+"). Other
/// platforms show the count in the menu header instead — pure fn, tested.
pub fn unread_badge_title(count: i64, enabled: bool) -> Option<String> {
    if !enabled || count <= 0 {
        None
    } else if count > 99 {
        Some("99+".to_string())
    } else {
        Some(count.to_string())
    }
}

struct TrayState {
    pool: SqlitePool,
    first_hide_announced: AtomicBool,
}

pub fn setup_tray(app: &AppHandle, pool: SqlitePool) -> Result<(), String> {
    // Menu-bar template icon: a black plate with the paper-plane knocked
    // out (tray-icon-template.png, rendered from logo-mark.svg). macOS
    // tints template images automatically — black on a light menu bar,
    // white on a dark one — matching the system icon style. The colored
    // variant (tray-icon.png) stays for platforms where template mode is
    // unsupported.
    let icon = tauri::image::Image::from_bytes(include_bytes!(
        "../../icons/tray-icon-template.png"
    ))
    .map_err(|e| format!("tray icon decode: {e}"))?;

    let state = Arc::new(TrayState {
        pool: pool.clone(),
        first_hide_announced: AtomicBool::new(false),
    });
    app.manage(TrayManaged(state.clone()));

    // macOS convention for tray apps: a click DROPS THE MENU, and a
    // double-click opens the window. The menu must exist AT BUILD TIME —
    // a `set_menu` after `build()` never wired to the NSStatusItem button
    // in practice (user report: clicking showed nothing), so we build an
    // initial snapshot here and let the refresh loop swap in live data.
    let initial_menu = build_menu(app, 0, &[], 0, "Agent 网关 · 启动中");
    let tray = TrayIconBuilder::with_id("sendpalm-tray")
        .icon(icon)
        .icon_as_template(true)
        .menu_on_left_click(true)
        .menu(&initial_menu)
        .on_tray_icon_event({
            let app = app.clone();
            move |_, event| {
                if let TrayIconEvent::DoubleClick {
                    button: MouseButton::Left,
                    ..
                } = event
                {
                    show_main_window(&app);
                }
            }
        })
        .on_menu_event(|app: &AppHandle, event| {
            let id = event.id().as_ref();
            if let Some(rest) = id.strip_prefix("open-message:") {
                let message_id = rest.to_string();
                show_main_window(app);
                let _ = app.emit("tray:open-message", serde_json::json!({ "id": message_id }));
                return;
            }
            match id {
                "show" => show_main_window(app),
                "compose" => {
                    show_main_window(app);
                    let _ = app.emit("tray:compose", ());
                }
                "gate" => {
                    show_main_window(app);
                    let _ = app.emit("tray:navigate", serde_json::json!({ "view": "screener" }));
                }
                "settings" => {
                    show_main_window(app);
                    let _ = app.emit("tray:navigate", serde_json::json!({ "view": "settings" }));
                }
                "autostart" => {
                    use tauri_plugin_autostart::ManagerExt;
                    let launcher = app.autolaunch();
                    let enabled = launcher.is_enabled().unwrap_or(false);
                    let _ = if enabled {
                        launcher.disable()
                    } else {
                        launcher.enable()
                    };
                    // Keep the prefs file in sync so the Settings toggle and
                    // the tray checkmark agree on next rebuild.
                    sync_autostart_pref(app, !enabled);
                }
                "quit" => {
                    ALLOW_EXIT.store(true, Ordering::SeqCst);
                    app.exit(0);
                }
                _ => {}
            }
        })
        .build(app)
        .map_err(|e| format!("tray build: {e}"))?;

    app.manage(TrayHandle(tray));
    refresh_tray_menu(app);
    start_refresh_loop(app.clone());
    Ok(())
}

#[derive(Clone)]
struct TrayHandle(tauri::tray::TrayIcon);

impl TrayHandle {
    fn set_badge(&self, title: Option<String>) {
        if let Some(t) = title {
            let _ = self.0.set_title(Some(&t));
        } else {
            let _ = self.0.set_title(None::<&str>);
        }
    }
}

#[derive(Clone)]
struct TrayManaged(Arc<TrayState>);

/// Patch `preferences.background.launchAtLogin` in the prefs file so the
/// Settings toggle reflects tray-driven changes. Best-effort: the file is
/// owned by the frontend store, which overwrites it on its next save.
fn sync_autostart_pref(app: &AppHandle, enabled: bool) {
    let Ok(dir) = app.path().app_data_dir() else { return };
    let path = dir.join("sendpalm.prefs.json");
    let Ok(text) = std::fs::read_to_string(&path) else { return };
    let Ok(mut v) = serde_json::from_str::<serde_json::Value>(&text) else { return };
    v["app_settings"]["preferences"]["background"]["launchAtLogin"] = enabled.into();
    if let Ok(text) = serde_json::to_string_pretty(&v) {
        let _ = std::fs::write(&path, text);
    }
}

fn show_main_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

fn hide_main_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.hide();
    }
}

/// Called from the window's CloseRequested handler. Returns true when the
/// close was converted into a hide (caller must NOT let the window close).
pub fn intercept_close(app: &AppHandle) -> bool {
    let prefs = read_background_prefs(app);
    let visible = app
        .get_webview_window("main")
        .is_some_and(|w| w.is_visible().unwrap_or(true));
    if prefs.close_to_tray && visible {
        hide_main_window(app);
        announce_first_hide(app);
        return true;
    }
    false
}

/// One-time native notification teaching the close-to-tray behavior.
fn announce_first_hide(app: &AppHandle) {
    use tauri_plugin_notification::NotificationExt;
    let Some(managed) = app.try_state::<TrayManaged>() else { return };
    if managed.0.first_hide_announced.swap(true, Ordering::SeqCst) {
        return;
    }
    let _ = app
        .notification()
        .builder()
        .title("SendPalm 已最小化到托盘")
        .body("邮件推送与 Agent 网关继续在后台运行。点击托盘图标唤回，托盘菜单可退出。")
        .show();
}

/// Rebuild the tray menu from live data (latest unread, Gate count,
/// agent state). Runs at startup, on a refresh loop, and after sync.
pub fn refresh_tray_menu(app: &AppHandle) {
    let Some(managed) = app.try_state::<TrayManaged>() else { return };
    let pool = managed.0.pool.clone();
    let prefs = read_background_prefs(app);
    let app = app.clone();

    tauri::async_runtime::spawn(async move {
        // Badge = Gate 待审数, not raw unread: at newsletter-scale volumes
        // (thousands) an unread badge is meaningless noise, while "people
        // waiting for your decision" is actionable.
        let pending: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM contacts WHERE screened = 0 OR first_seen = 1",
        )
        .fetch_one(&pool)
        .await
        .unwrap_or(0);

        if let Some(handle) = app.try_state::<TrayHandle>() {
            handle.set_badge(unread_badge_title(pending, prefs.show_unread_badge));
        }

        let mails: Vec<(String, String, String)> = sqlx::query_as(
            "SELECT id, subj, substr(prev, 1, 40) FROM messages \
             WHERE bucket = 'imbox' AND unread = 1 ORDER BY timeline_at DESC LIMIT 3",
        )
        .fetch_all(&pool)
        .await
        .unwrap_or_default();

        let gate: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM contacts WHERE screened = 0 OR first_seen = 1",
        )
        .fetch_one(&pool)
        .await
        .unwrap_or(0);

        let gateway = app
            .try_state::<crate::services::mcp::McpGatewayState>()
            .and_then(|s| s.get())
            .map(|ep| ep.url)
            .unwrap_or_default();
        let agent_label = if gateway.is_empty() {
            "Agent 网关 · 未运行"
        } else {
            "Agent 网关 · 运行中"
        };

        let menu = build_menu(&app, pending, &mails, gate, agent_label);
        if let Some(handle) = app.try_state::<TrayHandle>() {
            let _ = handle.0.set_menu(Some(menu));
        }
    });
}

fn build_menu(
    app: &AppHandle,
    pending: i64,
    mails: &[(String, String, String)],
    gate: i64,
    agent_label: &str,
) -> tauri::menu::Menu<tauri::Wry> {
    let prefs = read_background_prefs(app);
    let item = |id: &str, label: String, enabled: bool| {
        MenuItem::with_id(app, id, label, enabled, None::<&str>).expect("menu item")
    };

    let header = item("header", format!("SendPalm · {pending} 位待审"), false);
    let mut builder = MenuBuilder::new(app).item(&header);

    if mails.is_empty() {
        let none = item("no-mail", "没有新邮件".into(), false);
        builder = builder.item(&none);
    } else {
        for (id, subj, _) in mails {
            let label = if subj.is_empty() {
                "(无主题)".to_string()
            } else {
                subj.chars().take(28).collect()
            };
            let mi = item(&format!("open-message:{id}"), format!("✉ {label}"), true);
            builder = builder.item(&mi);
        }
    }

    let compose = item("compose", "写邮件".into(), true);
    let gate_item = item("gate", format!("处理 Gate 筛选 ({gate})"), true);
    let show = item("show", "打开 SendPalm".into(), true);
    let agent = item("agent", agent_label.to_string(), false);
    let settings = item("settings", "设置…".into(), true);
    let autostart = CheckMenuItem::with_id(
        app,
        "autostart",
        "登录时自动启动",
        true,
        prefs.launch_at_login,
        None::<&str>,
    )
    .expect("check menu item");
    let quit = PredefinedMenuItem::quit(app, Some("退出 SendPalm")).expect("quit item");

    builder
        .separator()
        .item(&compose)
        .item(&gate_item)
        .item(&show)
        .separator()
        .item(&agent)
        .item(&settings)
        .item(&autostart)
        .separator()
        .item(&quit)
        .build()
        .expect("tray menu builds")
}

fn start_refresh_loop(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut ticker = tokio::time::interval(std::time::Duration::from_secs(20));
        ticker.tick().await; // first tick is immediate
        loop {
            ticker.tick().await;
            refresh_tray_menu(&app);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn badge_shows_count_only_when_enabled_and_positive() {
        assert_eq!(unread_badge_title(3, true), Some("3".to_string()));
        assert_eq!(unread_badge_title(0, true), None);
        assert_eq!(unread_badge_title(-1, true), None);
        assert_eq!(unread_badge_title(120, true), Some("99+".to_string()));
        assert_eq!(unread_badge_title(3, false), None);
    }
}
