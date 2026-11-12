//! SendPalm Skill pack installer — drops a SKILL.md + thin `sendpalm` CLI
//! wrappers into an agent's skills directory so the agent learns *when*
//! and *how* to use the mailbox (the MCP layer provides the raw tools).
//!
//! v1 targets: claude (`~/.claude/skills/sendpalm/`), codex
//! (`~/.codex/skills/sendpalm/`).

use std::path::PathBuf;

pub const SKILL_MD: &str = r#"# SendPalm

Local email workspace (SendPalm desktop app). Use it when the user asks
about their email, contacts, tasks, follow-ups, or calendar — or asks you
to draft a reply.

## How to call

Everything goes through the `sendpalm` CLI (it talks to the running app):

- `sendpalm list [--unread] [--bucket imbox|feed|paperTrail|trash|spam] [--from addr] [--limit N]`
- `sendpalm read <message-id>`
- `sendpalm search <query>`
- `sendpalm contact <email>`
- `sendpalm events --since YYYY-MM-DD --until YYYY-MM-DD`
- `sendpalm tasks` / `sendpalm follow-ups`
- `sendpalm draft --to addr --subject "…" --body "…" [--reply-to <id>] [--cc addr]`
- `sendpalm send --to addr --subject "…" --body "…" [--cc addr] [--bcc addr] [--account id]` — **sends for real**
- `sendpalm reply <message-id> --body "…" [--all] [--cc addr]` — **sends for real** (Re:, In-Reply-To, quote)
- `sendpalm forward <message-id> --to addr [--note "…"] [--cc addr]` — **sends for real** (Fwd:, quote, no attachments)
- `sendpalm approve <email> [--bucket imbox|feed|paperTrail]` / `sendpalm block <email>`
- `sendpalm move <id…> --bucket <bucket>` (at most 50 ids)

Requires SendPalm to be running. If a call fails with connection refused,
tell the user to open SendPalm and try again.

## Etiquette (important)

1. **Sending is a real, irreversible send — earn it.** `sendpalm send` /
   `reply` / `forward` go out over SMTP immediately; there is no undo. Send
   only what the user asked for, in the words they gave, and never invent a
   recipient. `sendpalm draft` remains the right call when the user has not
   clearly said "send it" — draft, then say a draft is waiting for them.
   The user can disable all sending in Settings → Agent; if a call returns
   `SEND_DISABLED`, fall back to a draft instead of retrying.
2. **Respect the Gate.** Unscreened senders are visible so you can advise,
   but approving/blocking is the user's call unless they explicitly ask.
3. **Dates are the user's.** `timelineAt` is the real server receipt time
   in the user's timezone; prefer it over sender-declared dates.
4. **UI labels are Chinese.** Buckets: imbox=Inbox, feed=Stream,
   paperTrail=Records. Writes are audited and visible to the user.
"#;

pub const SCRIPT: &str = r#"#!/bin/sh
# Thin wrapper: find the bundled `sendpalm` CLI next to the app, or PATH.
if [ -x "$SENDPALM_CLI" ]; then exec "$SENDPALM_CLI" "$@"; fi
exec sendpalm "$@"
"#;

fn skills_dir(target: &str) -> Result<PathBuf, String> {
    let home = std::env::var_os("HOME").map(PathBuf::from);
    let home = home.ok_or_else(|| "no HOME".to_string())?;
    let dir = match target {
        "claude" => home.join(".claude/skills/sendpalm"),
        "codex" => home.join(".codex/skills/sendpalm"),
        other => return Err(format!("unknown skill target: {other}")),
    };
    Ok(dir)
}

pub fn skill_targets() -> [&'static str; 2] {
    ["claude", "codex"]
}

/// Idempotent install. Returns the installed directory.
pub fn install_skill(target: &str) -> Result<PathBuf, String> {
    let dir = skills_dir(target)?;
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("mkdir {}: {e}", dir.display()))?;
    std::fs::write(dir.join("SKILL.md"), SKILL_MD)
        .map_err(|e| format!("write SKILL.md: {e}"))?;
    let script_path = dir.join("sendpalm");
    std::fs::write(&script_path, SCRIPT)
        .map_err(|e| format!("write script: {e}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&script_path, std::fs::Permissions::from_mode(0o755));
    }
    Ok(dir)
}

pub fn uninstall_skill(target: &str) -> Result<(), String> {
    let dir = skills_dir(target)?;
    if dir.exists() {
        std::fs::remove_dir_all(&dir)
            .map_err(|e| format!("remove {}: {e}", dir.display()))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn with_home<T>(f: impl FnOnce() -> T) -> T {
        let _g = crate::services::HOME_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let dir = std::env::temp_dir().join(format!(
            "sendpalm-skill-test-{}",
            uuid::Uuid::new_v4().simple()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let prev = std::env::var_os("HOME");
        std::env::set_var("HOME", &dir);
        let out = f();
        match prev {
            Some(p) => std::env::set_var("HOME", p),
            None => std::env::remove_var("HOME"),
        }
        let _ = std::fs::remove_dir_all(&dir);
        out
    }

    #[test]
    fn install_creates_skill_files_idempotently() {
        with_home(|| {
            let dir = install_skill("claude").unwrap();
            assert!(dir.join("SKILL.md").is_file());
            assert!(dir.join("sendpalm").is_file());
            let md = std::fs::read_to_string(dir.join("SKILL.md")).unwrap();
            // The pack must teach the current send capability, not the old
            // "draft only" v1 rule — an agent following stale etiquette would
            // refuse to send after the tools started supporting it.
            assert!(md.contains("sendpalm draft"));
            assert!(md.contains("sendpalm send"));
            assert!(md.contains("sendpalm reply"));
            assert!(md.contains("sendpalm forward"));
            assert!(md.contains("SEND_DISABLED"));
            assert!(!md.contains("Draft, never send"));
            assert!(md.contains("paperTrail"));
            // Idempotent: second install doesn't fail.
            install_skill("claude").unwrap();
        });
    }

    #[test]
    fn uninstall_removes_only_our_dir() {
        with_home(|| {
            let dir = install_skill("codex").unwrap();
            assert!(dir.is_dir());
            uninstall_skill("codex").unwrap();
            assert!(!dir.exists());
            // Unknown target errors.
            assert!(uninstall_skill("workbuddy").is_err());
        });
    }
}
