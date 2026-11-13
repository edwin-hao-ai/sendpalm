//! macOS desktop notifications — the modern path.
//!
//! `tauri-plugin-notification` posts through `notify-rust` →
//! `mac-notification-sys` → `NSUserNotificationCenter`, which Apple deprecated
//! in macOS 11 and which is inert on current macOS: `show()` returns `Ok`,
//! nothing is delivered, and the app never registers with the notification
//! centre at all (so nothing can ever be "allowed" either — which is why
//! `isPermissionGranted()` used to answer "yes" for an app that had never been
//! registered). The debug build also redirects every notification to
//! `com.apple.Terminal`.
//!
//! This module posts through `UNUserNotificationCenter` instead, owns the
//! authorization request, and reports the real permission state. The banner
//! carries the in-app notification row id in its `userInfo`, so a click can be
//! resolved back to a mail by the same `notification_target` command the bell
//! dropdown uses.

#![cfg(target_os = "macos")]

use std::sync::atomic::{AtomicU8, Ordering};

use block2::RcBlock;
use objc2::rc::Retained;
use objc2::runtime::ProtocolObject;
use objc2::{define_class, msg_send, AllocAnyThread, DefinedClass};
use objc2_foundation::{NSBundle, NSError, NSObject, NSObjectProtocol, NSString};
use objc2_user_notifications::{
    UNAuthorizationOptions, UNMutableNotificationContent, UNNotification,
    UNNotificationPresentationOptions, UNNotificationRequest, UNNotificationResponse,
    UNNotificationSettings, UNUserNotificationCenter, UNUserNotificationCenterDelegate,
    UNAuthorizationStatus,
};
use tauri::{AppHandle, Emitter, Manager};

use super::desktop_notifier::NotificationPrefs;

/// 0 = unknown, 1 = granted, 2 = denied/not-determined-after-asking.
static AUTHORIZED: AtomicU8 = AtomicU8::new(0);

fn center() -> Retained<UNUserNotificationCenter> {
    UNUserNotificationCenter::currentNotificationCenter()
}

/// `UNUserNotificationCenter` is only usable from a bundled app: without a
/// bundle identifier `currentNotificationCenter()` raises. `pnpm tauri dev`
/// runs a bare binary, so every entry point asks this first.
fn has_bundle() -> bool {
    NSBundle::mainBundle().bundleIdentifier().is_some()
}

/// Public state for Settings. `unsupported` means "this build cannot register"
/// (no bundle), which is a different message from "the OS said no".
pub fn permission_state() -> &'static str {
    if !has_bundle() {
        return "unsupported";
    }
    match AUTHORIZED.load(Ordering::Relaxed) {
        1 => "granted",
        2 => "not-granted",
        _ => "not-determined",
    }
}

/// Ask the OS — this is what shows the "SendPalm wants to send you
/// notifications" dialog the first time. Blocks until the user answered so the
/// caller can report the outcome; the completion handler runs on a background
/// queue, so waiting here cannot deadlock the main thread.
pub fn request_authorization() -> bool {
    if !has_bundle() {
        return false;
    }
    let (tx, rx) = std::sync::mpsc::channel::<bool>();
    let tx = std::sync::Mutex::new(tx);
    let handler = RcBlock::new(move |granted: objc2::runtime::Bool, _err: *mut NSError| {
        let granted = granted.as_bool();
        if let Ok(tx) = tx.lock() {
            let _ = tx.send(granted);
        }
    });
    // Alert + Sound: a banner and a chime, the two things a mail client needs.
    let options = UNAuthorizationOptions::Alert | UNAuthorizationOptions::Sound;
    center().requestAuthorizationWithOptions_completionHandler(options, &handler);
    match rx.recv_timeout(std::time::Duration::from_secs(60)) {
        Ok(granted) => {
            AUTHORIZED.store(if granted { 1 } else { 2 }, Ordering::Relaxed);
            granted
        }
        // No answer in 60 s: the dialog is still on screen (or the user walked
        // away). Leaving the state untouched keeps the Settings row honest.
        Err(_) => false,
    }
}

/// Read the current state without prompting (on launch).
pub fn refresh_state() {
    if !has_bundle() {
        return;
    }
    let handler = RcBlock::new(|settings: std::ptr::NonNull<UNNotificationSettings>| {
        let settings = unsafe { settings.as_ref() };
        let status = settings.authorizationStatus();
        let granted = status == UNAuthorizationStatus::Authorized
            || status == UNAuthorizationStatus::Provisional
            || status == UNAuthorizationStatus::Ephemeral;
        AUTHORIZED.store(if granted { 1 } else { 2 }, Ordering::Relaxed);
    });
    center().getNotificationSettingsWithCompletionHandler(&handler);
}

/// Post one banner. `row` is the in-app `notifications` row id; a click on the
/// banner comes back with it.
pub fn post(title: &str, body: &str, row: Option<i64>) -> Result<(), String> {
    if !has_bundle() {
        return Err("no bundle identifier — notifications need the packaged app".into());
    }
    if AUTHORIZED.load(Ordering::Relaxed) != 1 {
        // Not authorized yet: ask once, then report the OS answer instead of
        // silently posting into the void.
        if !request_authorization() {
            return Err("系统没有允许 SendPalm 发送通知".into());
        }
    }
    unsafe {
        let content = UNMutableNotificationContent::new();
        content.setTitle(&NSString::from_str(title));
        content.setBody(&NSString::from_str(body));
        // The row id rides on the request *identifier* rather than in
        // `userInfo`: identifiers are plain strings, and the click handler can
        // parse it back without building an NSDictionary.
        let identifier = NSString::from_str(&match row {
            Some(row) => format!("sendpalm-{row}"),
            None => format!("sendpalm-none-{}", chrono::Local::now().timestamp_millis()),
        });
        let request = UNNotificationRequest::requestWithIdentifier_content_trigger(
            &identifier, &content, None,
        );
        let (tx, rx) = std::sync::mpsc::channel::<Option<String>>();
        let tx = std::sync::Mutex::new(Some(tx));
        let handler = RcBlock::new(move |err: *mut NSError| {
            let message = if err.is_null() {
                None
            } else {
                Some((*err).localizedDescription().to_string())
            };
            if let Some(tx) = tx.lock().ok().and_then(|mut g| g.take()) {
                let _ = tx.send(message);
            }
        });
        center().addNotificationRequest_withCompletionHandler(&request, Some(&handler));
        match rx.recv_timeout(std::time::Duration::from_secs(10)) {
            Ok(None) => Ok(()),
            Ok(Some(message)) => Err(message),
            Err(_) => Err("通知提交超时".into()),
        }
    }
}

/* ── Click handling ─────────────────────────────────────────────────── */

struct DelegateIvars {
    app: AppHandle,
}

define_class!(
    #[unsafe(super(NSObject))]
    #[name = "SendPalmNotificationDelegate"]
    #[ivars = DelegateIvars]
    struct NotificationDelegate;

    unsafe impl NSObjectProtocol for NotificationDelegate {}

    unsafe impl UNUserNotificationCenterDelegate for NotificationDelegate {
        /// Show the banner even while SendPalm is frontmost: mail can arrive
        /// while the user is in Calendar or Settings, and the point of a
        /// notification is that it is visible.
        #[unsafe(method(userNotificationCenter:willPresentNotification:withCompletionHandler:))]
        fn will_present(
            &self,
            _center: &UNUserNotificationCenter,
            _notification: &UNNotification,
            completion_handler: &block2::DynBlock<dyn Fn(UNNotificationPresentationOptions)>,
        ) {
            completion_handler.call((UNNotificationPresentationOptions::Banner
                | UNNotificationPresentationOptions::List,));
        }

        /// The user clicked the banner. Resolve it to the in-app notification
        /// row and hand it to the frontend, which owns the navigation (the
        /// same path the bell dropdown and the tray menu use).
        #[unsafe(method(userNotificationCenter:didReceiveNotificationResponse:withCompletionHandler:))]
        fn did_receive(
            &self,
            _center: &UNUserNotificationCenter,
            response: &UNNotificationResponse,
            completion_handler: &block2::DynBlock<dyn Fn()>,
        ) {
            let row = notification_row(response);
            if let Some(row) = row {
                let app = self.ivars().app.clone();
                crate::services::tray::show_main_window(&app);
                let _ = app.emit("notification:action", serde_json::json!({ "row": row }));
            }
            completion_handler.call(());
        }
    }
);

impl NotificationDelegate {
    fn new(app: AppHandle) -> Retained<Self> {
        let this = Self::alloc().set_ivars(DelegateIvars { app });
        unsafe { msg_send![super(this), init] }
    }
}

/// The in-app notification row carried by the clicked banner, if it is one of
/// ours (`sendpalm-<row>` identifiers).
fn notification_row(response: &UNNotificationResponse) -> Option<i64> {
    let notification = response.notification();
    let request = notification.request();
    let identifier = request.identifier().to_string();
    identifier
        .strip_prefix("sendpalm-")
        .filter(|rest| !rest.starts_with("none-"))
        .and_then(|rest| rest.parse::<i64>().ok())
}

/// Install the click delegate. Called once at startup, before any notification
/// is posted — `UNUserNotificationCenter` copies the delegate weakly, so it has
/// to be kept alive by the app (see `install`).
pub fn install(app: &AppHandle) {
    if !has_bundle() {
        return;
    }
    let delegate = NotificationDelegate::new(app.clone());
    let center = center();
    center.setDelegate(Some(ProtocolObject::from_ref(&*delegate)));
    // The centre holds the delegate weakly; park ours in managed state so it
    // lives as long as the app.
    app.manage(NotificationDelegateHandle(delegate));
    refresh_state();
}

struct NotificationDelegateHandle(#[allow(dead_code)] Retained<NotificationDelegate>);
unsafe impl Send for NotificationDelegateHandle {}
unsafe impl Sync for NotificationDelegateHandle {}

/// Reserved for a future "keep the banner quiet for N minutes" feature: the
/// current code only needs `post`.
#[allow(dead_code)]
pub fn post_mail(app: &AppHandle, prefs: &NotificationPrefs, title: &str, body: &str, row: Option<i64>) -> Result<(), String> {
    let _ = (app, prefs);
    post(title, body, row)
}
