//! OS-level desktop notifications. The Rust side mirrors the JS-side
//! preferences so a `sync:new-messages` event can show a notification
//! without round-tripping to the frontend.

use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;
use std::sync::atomic::{AtomicUsize, Ordering};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NotificationPrefs {
    pub desktop_enabled: bool,
    /// Coalesce per-message notifications into one summary per sync pass.
    pub digest: bool,
    /// Play the OS notification sound. Off for "quiet but visible".
    pub sound: bool,
    pub quiet_hours_enabled: bool,
    pub quiet_hours_start: String, // "HH:MM" 24h
    pub quiet_hours_end: String,
}

impl Default for NotificationPrefs {
    fn default() -> Self {
        Self {
            desktop_enabled: true,
            // Default off: one banner per message is the behaviour every
            // other client has, and digest is the opt-in noise reduction.
            digest: false,
            sound: true,
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
    notification_row: Option<i64>,
) -> Result<(), String> {
    let now = chrono::Local::now().format("%H:%M").to_string();
    if !should_notify(prefs, &now) {
        return Ok(());
    }
    if prefs.digest {
        // Hold the ping until the sync pass ends; `flush_digest` turns the
        // batch into one banner. Without this, "摘要" would be identical to
        // the default behaviour.
        DIGEST_PENDING.fetch_add(1, Ordering::Relaxed);
        return Ok(());
    }
    let title = if subject.is_empty() {
        format!("New message from {sender}")
    } else {
        subject.to_string()
    };
    let body = format!("From {sender}\n({account_id})");
    // macOS: the plugin's backend (notify-rust → NSUserNotificationCenter) is
    // inert on current macOS, so post through UNUserNotificationCenter and
    // carry the in-app notification row so a click can open that mail.
    #[cfg(target_os = "macos")]
    {
        let _ = app; // the plugin handle is only used by the non-macOS path
        crate::services::mac_notify::post(&title, &body, notification_row).map_err(|e| {
            let reason = e.clone();
            if record_failure_once(&reason) {
                eprintln!("[sendpalm] desktop notification failed: {reason}");
            }
            format!("notification: {reason}")
        })?;
        return Ok(());
    }
    #[cfg(not(target_os = "macos"))]
    {
        let mut builder = app.notification().builder().title(title).body(body);
        // The click handler gets this integer back, not the message id — hand
        // it the `notifications.rowid` so `notification_target` can resolve it.
        if let Some(row) = notification_row.filter(|r| *r > 0 && *r <= i32::MAX as i64) {
            builder = builder.id(row as i32);
        }
        if prefs.sound {
            builder = builder.sound("default");
        }
        builder.show().map_err(|e| {
            // The caller used to swallow this (`let _ =`), so an OS-level
            // refusal turned into "新邮件没有任何提示" with nothing anywhere to
            // explain it. Log once per distinct reason: a denial fails on
            // EVERY new mail, and printing that per message is how a log
            // becomes noise.
            let reason = e.to_string();
            if record_failure_once(&reason) {
                eprintln!("[sendpalm] desktop notification failed: {reason}");
            }
            format!("notification: {reason}")
        })?;
        Ok(())
    }
}

/// One log line per distinct failure reason per process. Returns true the
/// first time a reason is seen. Pure so it can be tested without an OS.
pub fn record_failure_once(reason: &str) -> bool {
    static SEEN: std::sync::Mutex<Vec<String>> = std::sync::Mutex::new(Vec::new());
    let mut seen = SEEN.lock().unwrap_or_else(|e| e.into_inner());
    if seen.iter().any(|r| r == reason) {
        return false;
    }
    seen.push(reason.to_string());
    true
}

/// Mail held back during the current sync pass while digest mode is on.
static DIGEST_PENDING: AtomicUsize = AtomicUsize::new(0);

/// Wording for the coalesced banner. Pure so the copy can be tested without
/// an `AppHandle`.
pub fn digest_copy(n: usize) -> (String, String) {
    let title = format!("{n} 封新邮件");
    let body = format!("有 {n} 封新的邮件（摘要模式，不逐封提醒）");
    (title, body)
}

/// Emit the coalesced banner for the sync pass that just finished and reset
/// the counter. Called from `sync_and_notify` after every account pass, so a
/// pass that found no notifiable mail is a cheap no-op.
pub fn flush_digest(app: &AppHandle, prefs: &NotificationPrefs) {
    let n = DIGEST_PENDING.swap(0, Ordering::Relaxed);
    if n == 0 || !prefs.digest {
        return;
    }
    let now = chrono::Local::now().format("%H:%M").to_string();
    if !should_notify(prefs, &now) {
        // Quiet hours swallowed the batch too — held mail is simply dropped;
        // the in-app notification centre still has every row.
        return;
    }
    let (title, body) = digest_copy(n);
    if let Err(e) = app.notification().builder().title(title).body(body).show() {
        let reason = e.to_string();
        if record_failure_once(&reason) {
            eprintln!("[sendpalm] digest notification failed: {reason}");
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;

    fn prefs(digest: bool) -> NotificationPrefs {
        NotificationPrefs {
            digest,
            ..NotificationPrefs::default()
        }
    }

    #[test]
    fn digest_copy_reports_the_batch_size() {
        assert_eq!(digest_copy(1).0, "1 封新邮件");
        let (title, body) = digest_copy(7);
        assert_eq!(title, "7 封新邮件");
        assert!(body.contains('7'));
    }

    #[test]
    fn digest_is_off_by_default() {
        assert!(!NotificationPrefs::default().digest);
        assert!(prefs(true).digest);
    }

    #[test]
    fn sound_is_on_by_default() {
        // The default should look and sound like a normal mail client; the
        // toggle exists to silence the banner without hiding it.
        assert!(NotificationPrefs::default().sound);
    }

    #[test]
    fn quiet_hours_still_gate_the_digest() {
        let mut p = prefs(true);
        p.quiet_hours_enabled = true;
        p.quiet_hours_start = "22:00".into();
        p.quiet_hours_end = "08:00".into();
        assert!(!should_notify(&p, "23:30"));
        assert!(should_notify(&p, "12:00"));
    }

    #[test]
    fn a_repeated_notification_failure_is_logged_once() {
        // A denied OS permission fails on every new mail. The first line is
        // the useful one; the next thousand hide it.
        let reason = "test-reason: not authorized (dedupe fixture)";
        assert!(record_failure_once(reason));
        assert!(!record_failure_once(reason));
        // A DIFFERENT reason is still news, even after one was logged.
        assert!(record_failure_once("test-reason: something else"));
    }
}
