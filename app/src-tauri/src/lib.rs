// SendPalm — Tauri 2.x backend entry point.
// See docs/PRD-v1.md §9 and docs/STACK-DECISION.md for design rationale.

pub mod commands;
pub mod services;

use services::state::SyncStateStore;
use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
/// Install the process-level rustls CryptoProvider.
///
/// rustls 0.23 refuses to build a `ClientConfig` without one, so this must run
/// before ANY TLS handshake — in the app (from `run()`), and in every test that
/// talks to a real server. It used to live only inside `run()`, which meant the
/// gated real-IMAP tests could never pass: they panicked in rustls before
/// touching the network.
///
/// Idempotent: `AlreadySet` means something else won the race, which is fine.
pub fn install_crypto_provider() {
    if let Err(e) = rustls::crypto::ring::default_provider().install_default() {
        eprintln!("[sendpalm] rustls crypto provider install returned: {:?}", e);
    }
}

/// Autostart plugin — desktop only. iOS has no "open at login" concept, and
/// `tauri_plugin_autostart` does not even expose `MacosLauncher` there, so the
/// call has to disappear from the mobile build rather than be a no-op.
#[cfg(desktop)]
fn desktop_autostart() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri_plugin_autostart::init(
        tauri_plugin_autostart::MacosLauncher::LaunchAgent,
        Some(vec!["--tray"]),
    )
}

/// Mobile counterpart: iOS has no autostart, but the builder chain is shared,
/// so hand it a no-op plugin instead of branching the whole chain.
#[cfg(not(desktop))]
fn desktop_autostart() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri::plugin::Builder::new("sendpalm-no-autostart").build()
}

/// Is the MCP gateway allowed to run at boot?
///
/// The preference lives in the desktop tray module; on iOS there is no tray,
/// and the gateway is localhost tooling the phone never serves.
#[cfg(desktop)]
fn background_prefs_keep_gateway(app: &tauri::AppHandle) -> bool {
    crate::services::tray::read_background_prefs(app).keep_gateway
}

#[cfg(not(desktop))]
fn background_prefs_keep_gateway(_app: &tauri::AppHandle) -> bool {
    false
}

/// System tray + close-to-tray behaviour. Compiles out on mobile: `tauri`
/// omits `menu` and `tray` for iOS/Android targets.
#[cfg(desktop)]
fn setup_tray_for_desktop(app: &tauri::App) {
    use tauri::Manager;
    if let Some(window) = app.get_webview_window("main") {
        let handle = app.handle().clone();
        window.on_window_event(move |event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if crate::services::tray::intercept_close(&handle) {
                    api.prevent_close();
                }
            }
        });
    }
    tauri::async_runtime::spawn({
        let handle = app.handle().clone();
        async move {
            match crate::services::sync_loop::open_pool().await {
                Ok(pool) => {
                    if let Err(e) = crate::services::tray::setup_tray(&handle, pool) {
                        eprintln!("[tray] setup failed: {e}");
                    }
                }
                Err(e) => eprintln!("[tray] no db pool: {e}"),
            }
        }
    });
}

pub fn run() {
    install_crypto_provider();

    // iOS/Tauri swallows panics behind stop_unwind and aborts without a message.
    // Write any panic to a temp file so we can read it back after a crash.
    std::panic::set_hook(Box::new(|info| {
        let msg = format!("SendPalm panic: {}\n", info);
        let tmp = std::env::temp_dir().join("sendpalm-panic.log");
        let _ = std::fs::write(&tmp, &msg);
        eprintln!("{}", msg);
    }));

    let migrations = vec![
        Migration {
            version: 1,
            description: "create_initial_tables",
            sql: include_str!("../migrations/0001_init.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "add_calendar_invite_column",
            sql: include_str!("../migrations/0002_calendar.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "add_drafts_attachments_column",
            sql: include_str!("../migrations/0003_drafts_attachments.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "add_message_body_html_column",
            sql: include_str!("../migrations/0004_body_html.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "add_follow_up_surfaced_at_column",
            sql: include_str!("../migrations/0005_follow_up_surfaced.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "add_message_direction_column",
            sql: include_str!("../migrations/0006_message_direction.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "add_event_end_dt_column",
            sql: include_str!("../migrations/0007_event_end_dt.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "add_drafts_from_alias_column",
            sql: include_str!("../migrations/0008_drafts_from_alias.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 9,
            description: "add_full_text_search_index",
            sql: include_str!("../migrations/0009_search_index.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 10,
            description: "add_trash_spam_expiry",
            sql: include_str!("../migrations/0010_trash_expiry.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 11,
            description: "add_vacation_replies_table",
            sql: include_str!("../migrations/0011_vacation_replies.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 12,
            description: "fix_fts_tokenizer_for_cjk",
            sql: include_str!("../migrations/0012_fix_fts_tokenizer.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 13,
            description: "add_event_all_day_column",
            sql: include_str!("../migrations/0013_event_all_day.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 14,
            description: "normalize_gate_screened_state",
            sql: include_str!("../migrations/0014_gate_screened_backfill.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 15,
            description: "add_files_source_message_ids",
            sql: include_str!("../migrations/0015_file_source_message_ids.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 16,
            description: "backfill_sent_folder_direction_and_self_contact",
            sql: include_str!("../migrations/0016_sent_direction_backfill.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 17,
            description: "widen_follow_up_statuses",
            sql: include_str!("../migrations/0017_follow_up_statuses.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 18,
            description: "calendar_rsvp",
            sql: include_str!("../migrations/0018_calendar_rsvp.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 19,
            description: "attendee_responses_json",
            sql: include_str!("../migrations/0019_attendee_responses.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 20,
            description: "calendar_recurrence + timezones_json",
            sql: include_str!("../migrations/0020_calendar_recurrence.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 21,
            description: "events.account_id for iTip RSVP account resolution",
            sql: include_str!("../migrations/0021_events_account_id.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 22,
            description: "PERF-1 partial indexes for pile/bubble-up/Gate queries",
            sql: include_str!("../migrations/0022_messages_pile_indexes.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 23,
            description: "files.st backfill from source message date",
            sql: include_str!("../migrations/0023_files_st_backfill.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 24,
            description: "email task provenance and extraction review queue",
            sql: include_str!("../migrations/0024_email_task_extraction.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 30,
            description: "persist rfc message id for reply threading",
            sql: include_str!("../migrations/0030_rfc_message_id.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 31,
            description: "draft reply context for scheduled sends",
            sql: include_str!("../migrations/0031_draft_reply_context.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 29,
            description: "imap folder/uid identity for flag sync",
            sql: include_str!("../migrations/0029_imap_identity.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 28,
            description: "backfill newsletter flag for legacy mail",
            sql: include_str!("../migrations/0028_newsletter_backfill.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 27,
            description: "user mail automation rules",
            sql: include_str!("../migrations/0027_mail_rules.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 26,
            description: "newsletter flag for notification triage and gate hints",
            sql: include_str!("../migrations/0026_message_newsletter.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 25,
            description: "split sender date from server receipt date (sent_at/received_at/timeline_at)",
            sql: include_str!("../migrations/0025_message_dates.sql"),
            kind: MigrationKind::Up,
        },
    ];

    eprintln!("[sendpalm] starting tauri builder");
    let result = tauri::Builder::default()
        .setup(|app| {
            eprintln!("[sendpalm] setup begin");
            app.manage(SyncStateStore::new());
            let disable = std::env::var("SENDPALM_DISABLE_BACKGROUND_SYNC")
                .ok()
                .map(|v| v == "1")
                .unwrap_or(false);
            eprintln!("[sendpalm] background sync disabled={}", disable);
            if !disable {
                tauri::async_runtime::spawn({
                    let handle = app.handle().clone();
                    async move {
                        if let Ok(pool) = services::sync_loop::open_pool().await {
                            let _ = services::sync_loop::backfill_imap_identity(&pool).await;
                            let _ = pool;
                            let _ = handle;
                        }
                    }
                });
                services::sync_loop::start(app.handle().clone());
                services::scheduled_send::start(app.handle().clone());
            }
            // Local MCP gateway for AI agents (spec 2026-11-03). Runs
            // even when background sync is disabled — it is user-invoked
            // tooling, not background sync. Failure must never block boot.
            {
                let mcp_state = services::mcp::McpGatewayState::default();
                app.manage(mcp_state.clone());
                let gateway_enabled = background_prefs_keep_gateway(app.handle());
                if !gateway_enabled {
                    eprintln!("[mcp] gateway disabled by preferences.background.keepGateway");
                }
                tauri::async_runtime::spawn(async move {
                    if !gateway_enabled {
                        return;
                    }
                    match services::sync_loop::open_pool().await {
                        Ok(pool) => {
                            match services::mcp::start_mcp_server(pool.clone()).await {
                                Ok(port) => {
                                    eprintln!("[mcp] gateway listening on 127.0.0.1:{port}");
                                    if let Some(ep) = services::mcp::mcp_endpoint(&pool).await {
                                        mcp_state.set(ep);
                                    }
                                }
                                Err(e) => eprintln!("[mcp] gateway failed to start: {e}"),
                            }
                        }
                        Err(e) => eprintln!("[mcp] gateway: no db pool: {e}"),
                    }
                });
            }
            // System tray + close-to-tray (design: docs/design/tray-mockup.html).
            #[cfg(desktop)]
            setup_tray_for_desktop(&app);
            eprintln!("[sendpalm] setup done");
            Ok(())
        })
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:sendpalm.db", migrations)
                .build(),
        )
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_opener::init())
        // Desktop-only: iOS has no autostart concept and the plugin does not
        // expose `MacosLauncher` there.
        .plugin(desktop_autostart())
        .invoke_handler(tauri::generate_handler![
            commands::sync_now,
            commands::list_mailboxes,
            commands::send_message,
            commands::get_sync_state,
            commands::get_import_summary,
            commands::list_email_providers,
            commands::vault_save,
            commands::vault_load,
            commands::vault_delete,
            commands::vault_set_secret,
            commands::vault_get_secret,
            commands::add_calendar_event,
            commands::respond_to_calendar_invite,
            commands::get_attachment_content,
            commands::get_attachment_path,
            commands::notification_settings::notify_settings_changed,
            commands::image_proxy::fetch_image,
            commands::agent_chat,
            commands::llm_list_models,
            commands::list_llm_providers,
            commands::detect_agent_clients,
            commands::connect_agent_client,
            commands::disconnect_agent_client,
            commands::mcp_gateway_status,
            commands::list_mail_rules,
            commands::upsert_mail_rule,
            commands::delete_mail_rule,
            commands::imap_set_seen,
        ])
        .build(tauri::generate_context!());
    let app = match result {
        Ok(app) => app,
        Err(e) => {
            let msg = format!("[sendpalm] tauri run error: {:?}", e);
            let tmp = std::env::temp_dir().join("sendpalm-run-error.log");
            let _ = std::fs::write(&tmp, &msg);
            eprintln!("{}", msg);
            std::process::exit(1);
        }
    };
    // ExitRequested is left at the default: Cmd+Q / Dock-quit is an
    // explicit quit intent and must actually quit (design: 红灯关闭→托盘,
    // ⌘Q / 托盘菜单→退出). Hiding only happens on window CloseRequested.
    app.run(|_handle, _event| {});
    eprintln!("[sendpalm] tauri run returned");
    if false {
        let msg = "[sendpalm] tauri run error: unreachable".to_string();
        let tmp = std::env::temp_dir().join("sendpalm-run-error.log");
        let _ = std::fs::write(&tmp, &msg);
        eprintln!("{}", msg);
        std::process::exit(1);
    }
    eprintln!("[sendpalm] tauri run returned");
}
