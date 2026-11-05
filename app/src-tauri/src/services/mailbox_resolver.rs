//! IMAP folder name resolution. Some servers (Feishu, Gmail, Outlook)
//! localize folder names. This module provides a case-insensitive candidate
//! table so the sync loop can pick the real mailbox name from a `LIST`
//! response.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FolderKind {
    Inbox,
    Sent,
    Drafts,
    Trash,
    Spam,
    /// Archive / "all other mail" folders. Feishu delivers its non-important
    /// stream ("其他邮件") to 已归档, so this is where the bulk of new mail
    /// actually lives for Feishu accounts.
    Archive,
}

/// Look up the server-side name for a desired folder, returning `None` if
/// none of the candidates is present in `server_mailboxes`. Matching is
/// case-insensitive and exact (no substring, no normalization beyond case
/// folding) so a stray `INBOX` never matches `INBOX/Subfolder`.
pub fn resolve_folder_name(
    server_mailboxes: &[String],
    desired: FolderKind,
) -> Option<String> {
    let candidates: &[&str] = match desired {
        FolderKind::Inbox => &["INBOX", "Inbox", "收件箱"],
        FolderKind::Sent => &[
            "Sent",
            "Sent Messages",
            "Sent Items",
            "已发送",
            "[Gmail]/Sent Mail",
            "&XfJT0ZAB-", // Feishu
        ],
        FolderKind::Drafts => &["Drafts", "Draft", "草稿箱", "&XfJ8T-", "&g0l6P3ux-"],
        FolderKind::Trash => &[
            "Trash",
            "Deleted",
            "Deleted Items",
            "Deleted Messages",
            "已删除",
            "[Gmail]/Trash",
            "&XfJSIJZk-", // Feishu 已删除
        ],
        FolderKind::Spam => &[
            "Spam",
            "Junk",
            "Junk Mail",
            "Junk E-mail",
            "Bulk Mail",
            "垃圾邮件",
            "[Gmail]/Spam",
            "&V4NXPpCuTvY-", // Feishu 垃圾邮件
        ],
        FolderKind::Archive => &[
            "Archive",
            "已归档",
            "&XfJfUmhj-", // Feishu 已归档（=「其他邮件」的实际存放处）
            "[Gmail]/All Mail",
        ],
    };
    let lower: Vec<String> = server_mailboxes.iter().map(|s| s.to_lowercase()).collect();
    for (i, mb) in lower.iter().enumerate() {
        if candidates.iter().any(|c| c.eq_ignore_ascii_case(mb)) {
            return server_mailboxes.get(i).cloned();
        }
    }
    None
}

/// Classify a folder name we already have (typically returned by
/// `list_mailboxes` or stored in `accounts.settings_json.syncFolders`).
/// Returns `None` for unrecognized names so the caller can fall back to the
/// safe default (`FolderKind::Inbox`-like behavior, i.e. treat as incoming).
///
/// Matching is case-insensitive against the static candidate tables used by
/// `resolve_folder_name` above. This does NOT consult the server — it only
/// asks "what kind does this name LOOK like?" — so it works on a single
/// string without needing the full mailbox list.
pub fn folder_kind_for_name(folder_name: &str) -> Option<FolderKind> {
    let kinds: &[(FolderKind, &[&str])] = &[
        (
            FolderKind::Inbox,
            &["INBOX", "Inbox", "收件箱"],
        ),
        (
            FolderKind::Sent,
            &[
                "Sent",
                "Sent Messages",
                "Sent Items",
                "已发送",
                "[Gmail]/Sent Mail",
                "&XfJT0ZAB-", // Feishu
            ],
        ),
        (
            FolderKind::Drafts,
            &["Drafts", "Draft", "草稿箱", "&XfJ8T-", "&g0l6P3ux-"],
        ),
        (
            FolderKind::Trash,
            &[
                "Trash",
                "Deleted",
                "Deleted Items",
                "Deleted Messages",
                "已删除",
                "[Gmail]/Trash",
                "&XfJSIJZk-",
            ],
        ),
        (
            FolderKind::Spam,
            &[
                "Spam",
                "Junk",
                "Junk Mail",
                "Junk E-mail",
                "Bulk Mail",
                "垃圾邮件",
                "[Gmail]/Spam",
                "&V4NXPpCuTvY-", // Feishu 垃圾邮件
            ],
        ),
        (
            FolderKind::Archive,
            &[
                "Archive",
                "已归档",
                "&XfJfUmhj-", // Feishu 已归档（=「其他邮件」的实际存放处）
                "[Gmail]/All Mail",
            ],
        ),
    ];
    for (kind, candidates) in kinds {
        if candidates
            .iter()
            .any(|c| c.eq_ignore_ascii_case(folder_name))
        {
            return Some(*kind);
        }
    }
    None
}

/// Resolve every folder kind in one call, skipping any that the server
/// doesn't expose. The first entry is always `Inbox`; if even that is
/// missing the caller should treat the account as mis-configured.
pub fn resolve_all(server_mailboxes: &[String]) -> Vec<String> {
    // Drafts are deliberately NOT synced: SendPalm's local Drafts box is
    // canonical, and importing the server-side drafts folder produced two
    // competing draft stores. Trash/Spam sync for server-state parity.
    let kinds = [
        FolderKind::Inbox,
        FolderKind::Sent,
        FolderKind::Trash,
        FolderKind::Spam,
        FolderKind::Archive,
    ];
    let mut out = Vec::with_capacity(kinds.len());
    for k in kinds {
        if let Some(name) = resolve_folder_name(server_mailboxes, k) {
            if !out.contains(&name) {
                out.push(name);
            }
        }
    }
    out
}
#[cfg(test)]
mod feishu_tests {
    use super::*;

    #[test]
    fn resolves_feishu_localized_names() {
        let server = vec![
            "INBOX".to_string(),
            "&XfJfUmhj-".to_string(),   // 已归档
            "&V4NXPpCuTvY-".to_string(), // 垃圾邮件
            "&XfJSIJZk-".to_string(),   // 已删除
            "&XfJT0ZAB-".to_string(),   // 已发送
            "&g0l6P3ux-".to_string(),   // 草稿箱
        ];
        assert_eq!(
            resolve_folder_name(&server, FolderKind::Archive).as_deref(),
            Some("&XfJfUmhj-")
        );
        assert_eq!(
            resolve_folder_name(&server, FolderKind::Trash).as_deref(),
            Some("&XfJSIJZk-")
        );
        assert_eq!(
            resolve_folder_name(&server, FolderKind::Spam).as_deref(),
            Some("&V4NXPpCuTvY-")
        );
        assert_eq!(
            folder_kind_for_name("&XfJfUmhj-"),
            Some(FolderKind::Archive)
        );
        // resolve_all now includes Archive — this is where Feishu's
        // "其他邮件" stream lives; without it, new mail never arrives.
        let all = resolve_all(&server);
        assert!(all.iter().any(|f| f == "&XfJfUmhj-"));
        assert_eq!(all.len(), 5);
    }
}
