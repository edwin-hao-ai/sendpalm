use sendpalm_app_lib::services::desktop_notifier::{should_notify, NotificationPrefs};

fn prefs(desktop: bool, quiet: bool, start: &str, end: &str) -> NotificationPrefs {
    NotificationPrefs {
        desktop_enabled: desktop,
        quiet_hours_enabled: quiet,
        quiet_hours_start: start.to_string(),
        quiet_hours_end: end.to_string(),
    }
}

#[test]
fn allows_when_desktop_enabled_and_no_quiet_hours() {
    assert!(should_notify(&prefs(true, false, "22:00", "08:00"), "14:30"));
}

#[test]
fn blocks_when_desktop_disabled() {
    assert!(!should_notify(&prefs(false, false, "22:00", "08:00"), "14:30"));
}

#[test]
fn blocks_during_quiet_hours_same_day() {
    // 14:00 is inside 13:00-15:00
    assert!(!should_notify(&prefs(true, true, "13:00", "15:00"), "14:00"));
}

#[test]
fn blocks_during_quiet_hours_overnight() {
    // 23:30 is inside 22:00-08:00 (wraps midnight)
    assert!(!should_notify(&prefs(true, true, "22:00", "08:00"), "23:30"));
    assert!(!should_notify(&prefs(true, true, "22:00", "08:00"), "02:00"));
}

#[test]
fn allows_outside_quiet_hours_overnight() {
    // 09:00 is outside 22:00-08:00
    assert!(should_notify(&prefs(true, true, "22:00", "08:00"), "09:00"));
}

#[test]
fn boundary_inclusive() {
    // 22:00 is the start, inclusive.
    assert!(!should_notify(&prefs(true, true, "22:00", "08:00"), "22:00"));
}