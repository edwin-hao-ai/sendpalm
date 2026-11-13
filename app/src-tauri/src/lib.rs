// SendPalm — Tauri 2.x backend entry point.
// See docs/PRD-v1.md §9 and docs/STACK-DECISION.md for design rationale.

pub mod commands;
pub mod services;

use services::state::SyncStateStore;
use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};

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

/// The full migration set, **sorted by version**.
///
/// Split out of `run()` so it is testable. sqlx applies migrations in
/// iterator order, not by version, and this list had grown with 30/31/29/28/
/// 27/26/25 appended after 24 — on a fresh database 28 (newsletter backfill)
/// ran before 26 (which adds `is_newsletter`) and the very first launch died
/// with `no such column: is_newsletter`. Existing installs never noticed
/// because applied migrations are skipped. Sorting makes append order
/// irrelevant.
pub fn migrations() -> Vec<Migration> {
    let mut out = vec![
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
            version: 32,
            description: "rebuild search index with the trigram tokenizer",
            sql: include_str!("../migrations/0032_search_trigram.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 33,
            description: "list and count indexes for 100k-message mailboxes",
            sql: include_str!("../migrations/0033_message_list_indexes.sql"),
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
    out.sort_by_key(|m| m.version);
    out
}

/// Debug builds only: load `app/.env` so the test mailbox works without a
/// keychain round-trip.
///
/// The app reads mail passwords from the OS keychain. macOS ties that access to
/// the binary's identity, and every debug rebuild is re-signed — so the entry
/// written by the previous build is no longer readable and the app greets the
/// developer with 「邮件同步已暂停——输入邮箱密码」. `resolve_credentials` already
/// knows how to fall back to `SENDPALM_TEST_*`, but only when those variables
/// exist, and a bundle launched from Finder has no environment.
///
/// `CARGO_MANIFEST_DIR` is baked in at compile time, so this finds the repo's
/// `.env` from a bundle in `~/.cargo/shared-target/...` or `/Applications`.
/// Release builds never read a file for credentials.
#[cfg(debug_assertions)]
fn load_dev_credentials() {
    let candidates = [
        Some(std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../.env")),
        std::env::current_dir().ok().map(|dir| dir.join(".env")),
    ];
    for path in candidates.into_iter().flatten() {
        if path.is_file() {
            match dotenvy::from_path(&path) {
                Ok(_) => eprintln!("[sendpalm] dev credentials loaded from {}", path.display()),
                Err(e) => eprintln!("[sendpalm] dev credentials unreadable: {e}"),
            }
            return;
        }
    }
}

/// Mobile entry point.
///
/// This attribute MUST sit directly above `run`, with nothing — not even a doc
/// comment — between them. It has now drifted twice (2026-11-09 onto
/// `install_crypto_provider`, 2026-11-12 onto `load_dev_credentials`), and both
/// times iOS's `ffi::start_app()` called the wrong function and the process
/// exited voluntarily seconds after launch: the "black first frame" that looks
/// like a webview failure. Desktop never noticed because `main.rs` calls
/// `run()` directly. `mobile_entry_point_stands_directly_above_run` fails the
/// build if it drifts again.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    install_crypto_provider();
    #[cfg(debug_assertions)]
    load_dev_credentials();

    // iOS/Tauri swallows panics behind stop_unwind and aborts without a message.
    // Write any panic to a temp file so we can read it back after a crash.
    std::panic::set_hook(Box::new(|info| {
        let msg = format!("SendPalm panic: {}\n", info);
        let tmp = std::env::temp_dir().join("sendpalm-panic.log");
        let _ = std::fs::write(&tmp, &msg);
        eprintln!("{}", msg);
    }));

    let migrations = migrations();

    eprintln!("[sendpalm] starting tauri builder");
    let result = tauri::Builder::default()
        .setup(|app| {
            eprintln!("[sendpalm] setup begin");
            app.manage(SyncStateStore::new());
            // macOS: install the notification click delegate before any banner
            // is posted (the centre holds it weakly, so it is parked in
            // managed state right there).
            #[cfg(target_os = "macos")]
            services::mac_notify::install(app.handle());
            // Diagnostic entry point, same shape as SENDPALM_DISABLE_BACKGROUND_SYNC
            // and SENDPALM_E2E_NETWORK: request notification permission and post
            // one banner at boot. The Settings 「发送测试通知」 button is the
            // normal path; this exists because the system permission dialog can
            // only be observed (and accepted) by a human, and an automated
            // check needs the request to fire without a click.
            #[cfg(target_os = "macos")]
            if std::env::var("SENDPALM_NOTIFY_SELFTEST").as_deref() == Ok("1") {
                eprintln!("[sendpalm] notify self-test: requesting authorization");
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    let granted = services::mac_notify::request_authorization();
                    eprintln!("[sendpalm] notify self-test: authorized={granted}");
                    match services::mac_notify::post(
                        "SendPalm 通知自检",
                        "看到这条说明系统通知链路是通的。",
                        None,
                    ) {
                        Ok(()) => eprintln!("[sendpalm] notify self-test: posted"),
                        Err(e) => eprintln!("[sendpalm] notify self-test: post failed: {e}"),
                    }
                    let _ = &handle;
                });
            }
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
                            // One-time index builds run BEFORE the sync loop
                            // starts: `CREATE INDEX` holds SQLite's write lock
                            // for its whole duration, and racing it against the
                            // first sync chunk fails both. This task is
                            // detached, so the window is already up — the user
                            // never waits on it.
                            if services::sync_loop::wait_for_schema(
                                &pool,
                                std::time::Duration::from_secs(30),
                            )
                            .await
                            {
                                services::schema_maint::ensure_gate_queue_index(&pool).await;
                            }
                            let _ = services::sync_loop::backfill_imap_identity(&pool).await;
                        }
                        services::sync_loop::start(handle.clone());
                        services::scheduled_send::start(handle);
                    }
                });
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
                            // The schema is created by the SQL plugin when the
                            // webview opens the DB, which happens after this
                            // task starts. Without the wait, a fresh install
                            // logged `[mcp] gateway failed to start: … no such
                            // table: app_kv`.
                            if !services::sync_loop::wait_for_schema(
                                &pool,
                                std::time::Duration::from_secs(20),
                            )
                            .await
                            {
                                eprintln!("[mcp] schema never appeared; gateway not started");
                                return;
                            }
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
            commands::notification_settings::notification_target,
            commands::notification_settings::send_test_notification,
            commands::notification_settings::notification_permission_state,
            commands::notification_settings::request_notification_permission,
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

#[cfg(test)]
mod entry_point_tests {
    /// The `#[cfg_attr(mobile, tauri::mobile_entry_point)]` attribute must sit
    /// directly above `pub fn run()` — no doc comment, no other item between
    /// them. iOS's `ffi::start_app()` calls whatever the attribute is attached
    /// to; when it drifted onto a helper, that helper ran, returned, and the
    /// process exited voluntarily seconds after launch ("black first frame").
    ///
    /// A source-level check is the only kind that catches this: it compiles and
    /// passes every test on desktop either way, because `main.rs` calls `run()`
    /// directly.
    #[test]
    fn mobile_entry_point_stands_directly_above_run() {
        let source = include_str!("lib.rs");
        let lines: Vec<&str> = source.lines().collect();
        let attr = lines
            .iter()
            .position(|l| l.contains("tauri::mobile_entry_point"))
            .expect("the mobile entry point attribute is missing entirely");
        let next = lines[attr + 1..]
            .iter()
            .find(|l| {
                let t = l.trim();
                !t.is_empty() && !t.starts_with("//") && !t.starts_with('}')
            })
            .map(|l| l.trim())
            .unwrap_or("");
        assert!(
            next == "pub fn run() {",
            "the attribute must be immediately followed by `pub fn run()`, found `{next}`"
        );
    }
}

#[cfg(test)]
mod migration_tests {
    use super::migrations;

    /// A brand-new install must be able to create its database.
    ///
    /// Regression guard for the 2026-11-09 iOS black screen: the migration
    /// list was appended out of order, sqlx runs them in iterator order, and
    /// on a fresh database migration 28 (`UPDATE … is_newsletter`) executed
    /// before 26 (`ALTER TABLE … ADD COLUMN is_newsletter`) — every first
    /// launch failed with `no such column: is_newsletter`. Existing databases
    /// skipped everything and never noticed.
    #[tokio::test]
    async fn fresh_database_applies_every_migration_in_order() {
        let pool = sqlx::SqlitePool::connect("sqlite::memory:")
            .await
            .expect("open in-memory sqlite");

        let mut previous = 0i64;
        for m in migrations() {
            assert!(
                m.version > previous,
                "migrations must be strictly ascending: {} came after {}",
                m.version,
                previous
            );
            previous = m.version;
            sqlx::raw_sql(&m.sql)
                .execute(&pool)
                .await
                .unwrap_or_else(|e| {
                    panic!(
                        "migration {} ({}) failed on a fresh database: {e}",
                        m.version, m.description
                    )
                });
        }

        // Columns that later migrations depend on.
        sqlx::query("SELECT is_newsletter, rfc_message_id, imap_uid FROM messages LIMIT 0")
        .execute(&pool)
        .await
        .expect("columns added by migrations 26/29/30 must exist");
        sqlx::query("SELECT html_body, in_reply_to FROM drafts LIMIT 0")
            .execute(&pool)
            .await
            .expect("draft reply-context columns from migration 31 must exist");
    }

    /// The list itself must stay complete — a migration file on disk that is
    /// never registered would only surface on a fresh install.
    #[test]
    fn every_migration_file_is_registered() {
        let registered: Vec<i64> = migrations().iter().map(|m| m.version).collect();
        for v in 1..=33 {
            assert!(
                registered.contains(&v),
                "migration {v} is missing from migrations()"
            );
        }
    }
}
