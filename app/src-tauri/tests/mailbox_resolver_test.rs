use sendpalm_app_lib::services::mailbox_resolver::{resolve_all, resolve_folder_name, FolderKind};

#[test]
fn feishu_sent_resolves_to_utf7_name() {
    let mailboxes = vec![
        "INBOX".to_string(),
        "&XfJT0ZAB-".to_string(),
        "&XfJ8T-".to_string(),
    ];
    assert_eq!(
        resolve_folder_name(&mailboxes, FolderKind::Sent),
        Some("&XfJT0ZAB-".to_string())
    );
}

#[test]
fn gmail_sent_resolves_to_gmail_label() {
    let mailboxes = vec!["INBOX".to_string(), "[Gmail]/Sent Mail".to_string()];
    assert_eq!(
        resolve_folder_name(&mailboxes, FolderKind::Sent),
        Some("[Gmail]/Sent Mail".to_string())
    );
}

#[test]
fn outlook_sent_resolves_to_sent_items() {
    let mailboxes = vec!["Inbox".to_string(), "Sent Items".to_string()];
    assert_eq!(
        resolve_folder_name(&mailboxes, FolderKind::Sent),
        Some("Sent Items".to_string())
    );
}

#[test]
fn chinese_inbox_resolves_to_zh_label() {
    let mailboxes = vec!["收件箱".to_string(), "已发送".to_string()];
    assert_eq!(
        resolve_folder_name(&mailboxes, FolderKind::Inbox),
        Some("收件箱".to_string())
    );
}

#[test]
fn unknown_provider_returns_none() {
    let mailboxes = vec!["Foo".to_string(), "Bar".to_string()];
    assert_eq!(resolve_folder_name(&mailboxes, FolderKind::Trash), None);
}

#[test]
fn case_insensitive_match_for_inbox() {
    let mailboxes = vec!["inbox".to_string()];
    assert_eq!(
        resolve_folder_name(&mailboxes, FolderKind::Inbox),
        Some("inbox".to_string())
    );
}

#[test]
fn resolve_all_returns_inbox_then_sent() {
    let mailboxes = vec![
        "&XfJT0ZAB-".to_string(),
        "INBOX".to_string(),
        "&XfJ8T-".to_string(),
    ];
    let resolved = resolve_all(&mailboxes);
    assert_eq!(
        resolved,
        vec![
            "INBOX".to_string(),
            "&XfJT0ZAB-".to_string(),
            "&XfJ8T-".to_string(),
        ]
    );
}

#[test]
fn resolve_all_skips_missing_kinds() {
    let mailboxes = vec!["INBOX".to_string(), "Sent".to_string()];
    let resolved = resolve_all(&mailboxes);
    assert_eq!(resolved, vec!["INBOX".to_string(), "Sent".to_string()]);
}