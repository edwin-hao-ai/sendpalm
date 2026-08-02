// SendPalm — Tauri 2.x backend entry point.
// See docs/PRD-v1.md §9 and docs/STACK-DECISION.md for design rationale.

pub mod commands;
pub mod services;

use services::state::SyncStateStore;
use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![Migration {
        version: 1,
        description: "create_initial_tables",
        sql: include_str!("../migrations/0001_init.sql"),
        kind: MigrationKind::Up,
    }];

    tauri::Builder::default()
        .setup(|app| {
            app.manage(SyncStateStore::new());
            let disable = std::env::var("SENDPALM_DISABLE_BACKGROUND_SYNC")
                .ok()
                .map(|v| v == "1")
                .unwrap_or(false);
            if !disable {
                services::sync_loop::start(app.handle().clone());
            }
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
        .invoke_handler(tauri::generate_handler![
            commands::sync_now,
            commands::list_mailboxes,
            commands::send_message,
            commands::get_sync_state,
            commands::list_email_providers,
        ])
        .run(tauri::generate_context!())
        .expect("error while running SendPalm");
}