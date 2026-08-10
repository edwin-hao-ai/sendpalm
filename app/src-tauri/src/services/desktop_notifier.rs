//! OS-level desktop notifications. The Rust side mirrors the JS-side
//! preferences so a `sync:new-messages` event can show a notification
//! without round-tripping to the frontend.

use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NotificationPrefs {
    pub desktop_enabled: bool,
    pub quiet_hours_enabled: bool,
    pub quiet_hours_start: String, // "HH:MM" 24h
    pub quiet_hours_end: String,
}

impl Default for NotificationPrefs {
    fn default() -> Self {
        Self {
            desktop_enabled: true,
            quiet_hours_enabled: false,
            quiet_hours_start: "22:00".to_string(),
            quiet_hours_end: "08:00".to_string(),
        }
    }
}

/// Pure helper, used by tests and by the Rust notifier hook.
pub fn should_notify(prefs: &NotificationPrefs, now_local_hhmm: &str) -> bool {
    if !prefs.desktop_enabled {
        return false;
    }
    if !prefs.quiet_hours_enabled {
        return true;
    }
    let now = parse_hhmm(now_local_hhmm);
    let start = parse_hhmm(&prefs.quiet_hours_start);
    let end = parse_hhmm(&prefs.quiet_hours_end);
    let in_window = match (now, start, end) {
        (Some(n), Some(s), Some(e)) => {
            if s <= e {
                // Same-day window.
                n >= s && n < e
            } else {
                // Overnight window (e.g. 22:00–08:00).
                n >= s || n < e
            }
        }
        _ => false,
    };
    !in_window
}

fn parse_hhmm(s: &str) -> Option<u32> {
    let mut parts = s.split(':');
    let h: u32 = parts.next()?.parse().ok()?;
    let m: u32 = parts.next()?.parse().ok()?;
    if h > 23 || m > 59 {
        return None;
    }
    Some(h * 60 + m)
}

/// Show an OS-level notification for a single new mail. No-op if the
/// preferences say so. The frontend permission state is assumed to be
/// already resolved; the plugin surfaces any failure to the user.
pub async fn notify_new_mail(
    app: &AppHandle,
    prefs: &NotificationPrefs,
    account_id: &str,
    subject: &str,
    sender: &str,
) -> Result<(), String> {
    let now = chrono::Local::now().format("%H:%M").to_string();
    if !should_notify(prefs, &now) {
        return Ok(());
    }
    let title = if subject.is_empty() {
        format!("New message from {sender}")
    } else {
        subject.to_string()
    };
    let body = format!("From {sender}\n({account_id})");
    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .map_err(|e| format!("notification: {e}"))?;
    Ok(())
}