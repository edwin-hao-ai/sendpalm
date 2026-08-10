use tauri::{AppHandle, Manager};

use crate::services::desktop_notifier::NotificationPrefs;

#[tauri::command]
pub async fn notify_settings_changed(
    app: AppHandle,
    desktop_enabled: bool,
    quiet_hours_enabled: bool,
    quiet_hours_start: String,
    quiet_hours_end: String,
) -> Result<(), String> {
    let prefs = NotificationPrefs {
        desktop_enabled,
        quiet_hours_enabled,
        quiet_hours_start,
        quiet_hours_end,
    };
    let store = app.state::<crate::services::state::SyncStateStore>();
    store.set_notification_prefs(prefs);
    Ok(())
}
