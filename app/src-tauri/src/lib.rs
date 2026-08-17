// SendPalm — Tauri 2.x backend entry point.
// See docs/PRD-v1.md §9 and docs/STACK-DECISION.md for design rationale.

pub mod commands;
pub mod services;

use services::state::SyncStateStore;
use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // rustls 0.23 requires a process-level CryptoProvider before any TLS config
    // is built. We enable the `ring` feature everywhere (lettre, sqlx, reqwest);
    // install it once here so the IMAP DoH fallback and any other crate that
    // calls `rustls::ClientConfig::builder()` does not panic at runtime.
    if let Err(e) = rustls::crypto::ring::default_provider().install_default() {
        // AlreadySet is harmless (another dependency installed one first).
        eprintln!("[sendpalm] rustls crypto provider install returned: {:?}", e);
    }

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
                services::sync_loop::start(app.handle().clone());
                services::scheduled_send::start(app.handle().clone());
            }
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
        .invoke_handler(tauri::generate_handler![
            commands::sync_now,
            commands::list_mailboxes,
            commands::send_message,
            commands::get_sync_state,
            commands::list_email_providers,
            commands::vault_save,
            commands::vault_load,
            commands::vault_delete,
            commands::add_calendar_event,
            commands::get_attachment_content,
            commands::get_attachment_path,
            commands::notification_settings::notify_settings_changed,
            commands::image_proxy::fetch_image,
        ])
        .run(tauri::generate_context!());
    if let Err(e) = result {
        let msg = format!("[sendpalm] tauri run error: {:?}", e);
        let tmp = std::env::temp_dir().join("sendpalm-run-error.log");
        let _ = std::fs::write(&tmp, &msg);
        eprintln!("{}", msg);
        std::process::exit(1);
    }
    eprintln!("[sendpalm] tauri run returned");
}
