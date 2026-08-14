use sendpalm_app_lib::services::mailbox_resolver::{
    folder_kind_for_name, resolve_all, resolve_folder_name, FolderKind,
};

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

#[test]
fn folder_kind_for_name_recognizes_inbox_variants() {
    assert_eq!(folder_kind_for_name("INBOX"), Some(FolderKind::Inbox));
    assert_eq!(folder_kind_for_name("Inbox"), Some(FolderKind::Inbox));
    assert_eq!(folder_kind_for_name("inbox"), Some(FolderKind::Inbox));
    assert_eq!(folder_kind_for_name("收件箱"), Some(FolderKind::Inbox));
}

#[test]
fn folder_kind_for_name_recognizes_sent_variants() {
    assert_eq!(folder_kind_for_name("Sent"), Some(FolderKind::Sent));
    assert_eq!(folder_kind_for_name("Sent Items"), Some(FolderKind::Sent));
    assert_eq!(folder_kind_for_name("Sent Messages"), Some(FolderKind::Sent));
    assert_eq!(folder_kind_for_name("已发送"), Some(FolderKind::Sent));
    assert_eq!(
        folder_kind_for_name("[Gmail]/Sent Mail"),
        Some(FolderKind::Sent)
    );
    assert_eq!(
        folder_kind_for_name("&XfJT0ZAB-"),
        Some(FolderKind::Sent),
        "Feishu UTF-7 sent folder must be detected"
    );
}

#[test]
fn folder_kind_for_name_recognizes_drafts_trash_spam() {
    assert_eq!(folder_kind_for_name("Drafts"), Some(FolderKind::Drafts));
    assert_eq!(folder_kind_for_name("&XfJ8T-"), Some(FolderKind::Drafts));
    assert_eq!(folder_kind_for_name("Trash"), Some(FolderKind::Trash));
    assert_eq!(folder_kind_for_name("Deleted Items"), Some(FolderKind::Trash));
    assert_eq!(folder_kind_for_name("Spam"), Some(FolderKind::Spam));
    assert_eq!(folder_kind_for_name("Junk"), Some(FolderKind::Spam));
}

#[test]
fn folder_kind_for_name_returns_none_for_unknown() {
    assert_eq!(folder_kind_for_name("Foo"), None);
    assert_eq!(folder_kind_for_name(""), None);
    assert_eq!(folder_kind_for_name("CustomLabel"), None);
}

#[test]
fn folder_kind_for_name_is_case_insensitive() {
    assert_eq!(folder_kind_for_name("SENT"), Some(FolderKind::Sent));
    assert_eq!(folder_kind_for_name("sent"), Some(FolderKind::Sent));
    assert_eq!(folder_kind_for_name("INBOX"), Some(FolderKind::Inbox));
}