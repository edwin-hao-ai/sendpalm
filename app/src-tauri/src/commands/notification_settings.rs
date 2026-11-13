use tauri::{AppHandle, Manager};

use crate::services::desktop_notifier::NotificationPrefs;

#[tauri::command]
pub async fn notify_settings_changed(
    app: AppHandle,
    desktop_enabled: bool,
    digest_enabled: bool,
    sound_enabled: bool,
    quiet_hours_enabled: bool,
    quiet_hours_start: String,
    quiet_hours_end: String,
) -> Result<(), String> {
    let prefs = NotificationPrefs {
        desktop_enabled,
        digest: digest_enabled,
        sound: sound_enabled,
        quiet_hours_enabled,
        quiet_hours_start,
        quiet_hours_end,
    };
    let store = app.state::<crate::services::state::SyncStateStore>();
    store.set_notification_prefs(prefs);
    Ok(())
}

/// Real macOS authorization state ("granted" / "not-granted" /
/// "not-determined" / "unsupported"). The notification plugin answers from the
/// deprecated NSUserNotification world, where an app that never registered
/// still reports "granted" — which is why the Settings row could never show the
/// truth.
#[tauri::command]
pub async fn notification_permission_state() -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        return Ok(crate::services::mac_notify::permission_state().to_string());
    }
    #[cfg(not(target_os = "macos"))]
    {
        Ok("unsupported".to_string())
    }
}

/// Ask the OS for permission (macOS shows the system dialog the first time).
#[tauri::command]
pub async fn request_notification_permission() -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        return Ok(crate::services::mac_notify::request_authorization());
    }
    #[cfg(not(target_os = "macos"))]
    {
        Ok(false)
    }
}

/// Post one notification immediately, using the same builder as a real mail.
///
/// Two reasons this is a product feature rather than a debug hook:
///  - macOS registers an app with the notification centre the first time it
///    actually posts (and only then can it show the "allow" prompt), so without
///    a way to post on demand, "为什么没弹" can only be answered by waiting for
///    a stranger to send you mail.
///  - It is the only honest way to tell "the OS refused" from "the noise gate
///    suppressed it" — the error comes back to Settings and is shown.
#[tauri::command]
pub async fn send_test_notification(app: AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let _ = app; // macOS posts natively; the plugin handle is unused here
        return crate::services::mac_notify::post(
            "SendPalm 通知测试",
            "看到这条说明系统通知是通的。点一下会切回 SendPalm。",
            None,
        );
    }
    #[cfg(not(target_os = "macos"))]
    {
    use tauri_plugin_notification::NotificationExt;
    let store = app.state::<crate::services::state::SyncStateStore>();
    let prefs = store.notification_prefs();
    let mut builder = app
        .notification()
        .builder()
        .title("SendPalm 通知测试")
        .body("看到这条说明系统通知是通的。点一下应该会切回 SendPalm。");
    if prefs.sound {
        builder = builder.sound("default");
    }
    builder
        .show()
        .map_err(|e| format!("系统拒绝了这条通知：{e}"))
    }
}

/// Where a clicked desktop notification should take the user.
///
/// The OS only hands back a 32-bit integer id, so the id we give it is the
/// `notifications.rowid` of the in-app record written for that mail. Resolving
/// it here keeps the mapping in the table the notification centre already
/// renders instead of a process-local map that a rebuild would lose (and that
/// a second process would not see).
#[tauri::command]
pub async fn notification_target(id: i64) -> Result<Option<serde_json::Value>, String> {
    let pool = crate::services::sync_loop::open_pool().await?;
    let row: Option<(Option<String>,)> =
        sqlx::query_as("SELECT ref_json FROM notifications WHERE rowid = $1")
            .bind(id)
            .fetch_optional(&pool)
            .await
            .map_err(|e| format!("lookup notification {id}: {e}"))?;
    let Some((Some(json),)) = row else {
        return Ok(None);
    };
    Ok(parse_ref_json(&json))
}

/// Narrow a stored `ref_json` to the two fields a click needs.
///
/// `ref_json` is written by several callers, so a malformed value must make the
/// click a no-op rather than an error the user sees. Pure, so the shapes can be
/// tested without a database.
pub fn parse_ref_json(json: &str) -> Option<serde_json::Value> {
    let value: serde_json::Value = serde_json::from_str(json).ok()?;
    let kind = value.get("type")?.as_str()?;
    let id = value.get("id")?.as_str()?;
    if kind.is_empty() || id.is_empty() {
        return None;
    }
    Some(serde_json::json!({ "type": kind, "id": id }))
}

#[cfg(test)]
mod tests {
    use super::parse_ref_json;

    #[test]
    fn ref_json_round_trips_the_two_fields_a_click_needs() {
        let parsed = parse_ref_json(r#"{"type":"message","id":"m_1"}"#).expect("parsed");
        assert_eq!(parsed["type"], "message");
        assert_eq!(parsed["id"], "m_1");
    }

    #[test]
    fn extra_keys_are_dropped_not_forwarded() {
        // The renderer only needs type+id; forwarding the whole blob would let
        // a stale `type: "message"` row hand the frontend junk fields.
        let parsed =
            parse_ref_json(r#"{"type":"file","id":"f_9","bucket":"imbox"}"#).expect("parsed");
        assert_eq!(parsed.as_object().map(|o| o.len()), Some(2));
    }

    #[test]
    fn malformed_ref_json_is_a_no_op() {
        assert!(parse_ref_json("not json").is_none());
        assert!(parse_ref_json("{}").is_none());
        assert!(parse_ref_json(r#"{"type":"message"}"#).is_none());
        assert!(parse_ref_json(r#"{"type":"","id":"m_1"}"#).is_none());
        assert!(parse_ref_json(r#"{"type":"message","id":""}"#).is_none());
    }
}
