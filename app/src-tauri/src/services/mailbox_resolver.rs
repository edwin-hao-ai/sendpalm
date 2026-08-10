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
        FolderKind::Drafts => &["Drafts", "Draft", "草稿箱", "&XfJ8T-"],
        FolderKind::Trash => &[
            "Trash",
            "Deleted",
            "Deleted Items",
            "Deleted Messages",
            "已删除",
            "[Gmail]/Trash",
        ],
        FolderKind::Spam => &[
            "Spam",
            "Junk",
            "Junk Mail",
            "Junk E-mail",
            "Bulk Mail",
            "垃圾邮件",
            "[Gmail]/Spam",
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

/// Resolve every folder kind in one call, skipping any that the server
/// doesn't expose. The first entry is always `Inbox`; if even that is
/// missing the caller should treat the account as mis-configured.
pub fn resolve_all(server_mailboxes: &[String]) -> Vec<String> {
    let kinds = [
        FolderKind::Inbox,
        FolderKind::Sent,
        FolderKind::Drafts,
        FolderKind::Trash,
        FolderKind::Spam,
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