//! Reply / forward derivation for the MCP send tools.
//!
//! Everything here is pure: given the original message's fields, work out the
//! recipients, the subject prefix and the quoted body. Keeping it pure is what
//! makes it testable without a mailbox — and this is exactly the part that
//! silently produces a mail addressed to the wrong person.

/// `Re: ` unless the subject already carries one (any case, any spacing).
pub fn reply_subject(original: &str) -> String {
    let trimmed = original.trim();
    let lower = trimmed.to_ascii_lowercase();
    if lower.starts_with("re:") || lower.starts_with("re：") {
        trimmed.to_string()
    } else {
        format!("Re: {trimmed}")
    }
}

/// `Fwd: ` unless already forwarded.
pub fn forward_subject(original: &str) -> String {
    let trimmed = original.trim();
    let lower = trimmed.to_ascii_lowercase();
    if lower.starts_with("fwd:") || lower.starts_with("fw:") || lower.starts_with("fwd：") {
        trimmed.to_string()
    } else {
        format!("Fwd: {trimmed}")
    }
}

/// Recipients for a reply.
///
/// `to` is the original sender; with `reply_all` the original To and CC join it.
/// Anything that is one of `self_addrs` is dropped (you do not reply to
/// yourself), and duplicates are removed case-insensitively while keeping the
/// first spelling seen.
pub fn reply_recipients(
    sender: &str,
    original_to: &[String],
    original_cc: &[String],
    self_addrs: &[String],
    reply_all: bool,
) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut push = |addr: &str| {
        let addr = addr.trim();
        if addr.is_empty() {
            return;
        }
        if self_addrs
            .iter()
            .any(|s| s.eq_ignore_ascii_case(addr))
        {
            return;
        }
        if out.iter().any(|e| e.eq_ignore_ascii_case(addr)) {
            return;
        }
        out.push(addr.to_string());
    };

    push(sender);
    if reply_all {
        for a in original_to {
            push(a);
        }
        for a in original_cc {
            push(a);
        }
    }
    out
}

/// Quoted original for a reply or forward.
///
/// Plain text only: the tools hand `body` to the same SMTP path the compose
/// window uses, and a text quote cannot break the recipient's client. The
/// attribution line is what makes the quote legible.
pub fn quoted_body(note: &str, original_body: &str, sender: &str, sent_at: &str) -> String {
    let note = note.trim_end();
    let mut out = String::new();
    if !note.is_empty() {
        out.push_str(note);
        out.push_str("\n\n");
    }
    out.push_str(&format!(
        "On {}, {} wrote:\n",
        if sent_at.is_empty() { "(unknown date)" } else { sent_at },
        if sender.is_empty() { "(unknown sender)" } else { sender },
    ));
    for line in original_body.lines() {
        out.push_str("> ");
        out.push_str(line);
        out.push('\n');
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn v(items: &[&str]) -> Vec<String> {
        items.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn reply_subject_adds_prefix_once() {
        assert_eq!(reply_subject("Q3 budget"), "Re: Q3 budget");
        assert_eq!(reply_subject("Re: Q3 budget"), "Re: Q3 budget");
        assert_eq!(reply_subject("RE: Q3 budget"), "RE: Q3 budget");
        // 中文全角冒号也是常见写法，重复叠前缀比不叠更糟。
        assert_eq!(reply_subject("Re：Q3 budget"), "Re：Q3 budget");
    }

    #[test]
    fn forward_subject_adds_prefix_once() {
        assert_eq!(forward_subject("Q3 budget"), "Fwd: Q3 budget");
        assert_eq!(forward_subject("Fwd: Q3 budget"), "Fwd: Q3 budget");
        assert_eq!(forward_subject("FW: Q3 budget"), "FW: Q3 budget");
    }

    #[test]
    fn reply_goes_to_the_sender_only() {
        assert_eq!(
            reply_recipients(
                "them@x.com",
                &v(&["me@x.com", "other@x.com"]),
                &v(&["cc@x.com"]),
                &v(&["me@x.com"]),
                false
            ),
            v(&["them@x.com"])
        );
    }

    #[test]
    fn reply_all_adds_original_to_and_cc_without_duplicates_or_self() {
        assert_eq!(
            reply_recipients(
                "them@x.com",
                &v(&["me@x.com", "other@x.com"]),
                &v(&["cc@x.com", "THEM@x.com"]),
                &v(&["me@x.com"]),
                true
            ),
            v(&["them@x.com", "other@x.com", "cc@x.com"])
        );
    }

    #[test]
    fn reply_never_targets_your_own_address() {
        assert!(reply_recipients(
            "me@x.com",
            &v(&["me@x.com"]),
            &[],
            &v(&["me@x.com"]),
            true
        )
        .is_empty());
    }

    #[test]
    fn quote_prefixes_every_line_and_carries_the_note() {
        let q = quoted_body("see below", "line one\nline two", "Sarah", "2026-11-12");
        assert!(q.starts_with("see below\n\n"));
        assert!(q.contains("On 2026-11-12, Sarah wrote:"));
        assert!(q.contains("> line one\n> line two"));
    }

    #[test]
    fn quote_of_an_empty_note_starts_with_the_attribution() {
        let q = quoted_body("", "hi", "Sarah", "2026-11-12");
        assert!(q.starts_with("On 2026-11-12, Sarah wrote:"));
    }
}
