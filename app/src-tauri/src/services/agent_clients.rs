//! AI-agent client detection + one-click MCP configuration writer.
//!
//! SendPalm edits the agent clients' config files directly (never shells
//! out), marking everything it writes under a `"sendpalm"` key so
//! `disconnect` removes exactly its own entries and nothing else. A
//! `.bak-before-sendpalm` backup is made before the first edit.

use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentClientDto {
    pub id: &'static str,
    pub name: &'static str,
    pub installed: bool,
    pub connected: bool,
}

fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}

fn on_path(bin: &str) -> bool {
    let Some(paths) = std::env::var_os("PATH") else { return false };
    std::env::split_paths(&paths).any(|dir| dir.join(bin).is_file())
}

fn claude_config_path(home: &Path) -> PathBuf {
    home.join(".claude.json")
}

fn codex_config_path(home: &Path) -> PathBuf {
    home.join(".codex/config.toml")
}

/// OpenCode V2 global config. When both `.jsonc` and `.json` exist,
/// OpenCode reads the `.jsonc` (verified: a server written only to `.json`
/// shows as "No MCP servers configured") — so we operate on whichever file
/// is authoritative: `.jsonc` if present, else `.json`.
fn opencode_config_path(home: &Path) -> PathBuf {
    let jsonc = home.join(".config/opencode/opencode.jsonc");
    if jsonc.is_file() {
        jsonc
    } else {
        home.join(".config/opencode/opencode.json")
    }
}

/// Strip `//` and `/* */` comments so JSONC parses as JSON. String
/// literals are respected (a `//` inside a quoted URL stays put).
pub(crate) fn strip_jsonc(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut chars = text.chars().peekable();
    let mut in_string = false;
    let mut escaped = false;
    while let Some(c) = chars.next() {
        if in_string {
            out.push(c);
            if escaped {
                escaped = false;
            } else if c == '\\' {
                escaped = true;
            } else if c == '"' {
                in_string = false;
            }
            continue;
        }
        match c {
            '"' => {
                in_string = true;
                out.push(c);
            }
            '/' => match chars.peek() {
                Some('/') => {
                    while let Some(n) = chars.next() {
                        if n == '\n' {
                            out.push('\n');
                            break;
                        }
                    }
                }
                Some('*') => {
                    chars.next();
                    let mut prev = ' ';
                    for n in chars.by_ref() {
                        if prev == '*' && n == '/' {
                            break;
                        }
                        prev = n;
                    }
                }
                _ => out.push(c),
            },
            _ => out.push(c),
        }
    }
    out
}

/// Which MCP server entries this tool manages, keyed by client id.
fn read_connected(id: &str, home: &Path, url: &str) -> bool {
    match id {
        "claude" => {
            let Ok(text) = std::fs::read_to_string(claude_config_path(home)) else {
                return false;
            };
            let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) else {
                return false;
            };
            v.pointer("/mcpServers/sendpalm").is_some()
                && v.pointer("/mcpServers/sendpalm/url")
                    .and_then(|u| u.as_str())
                    .is_some_and(|u| u == url)
        }
        "codex" => {
            let Ok(text) = std::fs::read_to_string(codex_config_path(home)) else {
                return false;
            };
            // TOML section we own: [mcp_servers.sendpalm]
            let marker = format!("url = \"{url}\"");
            text.contains("[mcp_servers.sendpalm]") && text.contains(&marker)
        }
        "opencode" => {
            let Ok(text) = std::fs::read_to_string(opencode_config_path(home)) else {
                return false;
            };
            let Ok(v) = serde_json::from_str::<serde_json::Value>(&strip_jsonc(&text)) else {
                return false;
            };
            v.pointer("/mcp/servers/sendpalm/url")
                .and_then(|u| u.as_str())
                .is_some_and(|u| u == url)
        }
        _ => false,
    }
}

pub async fn detect_clients(url: &str) -> Vec<AgentClientDto> {
    let home = home_dir().unwrap_or_default();
    let has_url = !url.is_empty();

    let claude_installed =
        claude_config_path(&home).is_file() || on_path("claude");
    let codex_installed = codex_config_path(&home).is_file() || on_path("codex");
    let opencode_installed = home.join(".config/opencode/opencode.jsonc").is_file()
        || home.join(".config/opencode/opencode.json").is_file()
        || on_path("opencode");

    vec![
        AgentClientDto {
            id: "opencode",
            name: "OpenCode",
            installed: opencode_installed,
            connected: has_url && read_connected("opencode", &home, &url),
        },
        AgentClientDto {
            id: "claude",
            name: "Claude Code",
            installed: claude_installed,
            connected: has_url && read_connected("claude", &home, &url),
        },
        AgentClientDto {
            id: "codex",
            name: "Codex",
            installed: codex_installed,
            connected: has_url && read_connected("codex", &home, &url),
        },
    ]
}

fn backup_once(path: &Path) -> Result<(), String> {
    let backup = PathBuf::from(format!("{}.bak-before-sendpalm", path.display()));
    if path.is_file() && !backup.exists() {
        std::fs::copy(path, &backup)
            .map_err(|e| format!("backup {}: {e}", backup.display()))?;
    }
    Ok(())
}

/// Connect a client: write our MCP server entry (URL + Bearer token) into
/// its config. Idempotent — a second call overwrites the same entry.
pub async fn connect_client(
    id: &str,
    url: &str,
    token: &str,
) -> Result<(), String> {
    let home = home_dir().ok_or_else(|| "no HOME".to_string())?;
    match id {
        "opencode" => {
            connect_opencode(&home, url, token)?;
            // OpenCode reads ~/.claude/skills as a global compatibility
            // source, so the claude skill install covers it.
            crate::services::mcp::skill::install_skill("claude")?;
            Ok(())
        }
        "claude" => {
            connect_claude(&home, url, token)?;
            // The Skill pack is the foolproof layer: it teaches the agent
            // when/how to use the mailbox and works even if the MCP
            // registration is later removed. Removal is manual (documented
            // in Settings) — uninstalling on toggle-off would silently
            // delete something the user may have customized.
            crate::services::mcp::skill::install_skill("claude")?;
            Ok(())
        }
        "codex" => {
            connect_codex(&home, url, token)?;
            crate::services::mcp::skill::install_skill("codex")?;
            Ok(())
        }
        other => Err(format!("unknown client: {other}")),
    }
}

/// Merge our server into the authoritative OpenCode config (`.jsonc`
/// when present, else `.json`; creating the file with the schema line if
/// absent). Idempotent; preserves everything else. Note: rewriting a
/// `.jsonc` drops its comments — a `.bak-before-sendpalm` copy is kept.
fn connect_opencode(home: &Path, url: &str, token: &str) -> Result<(), String> {
    let path = opencode_config_path(home);
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("mkdir {}: {e}", dir.display()))?;
    }
    let mut v: serde_json::Value = if path.is_file() {
        let text = std::fs::read_to_string(&path)
            .map_err(|e| format!("read {}: {e}", path.display()))?;
        serde_json::from_str(&strip_jsonc(&text))
            .map_err(|e| format!("parse {}: {e}", path.display()))?
    } else {
        serde_json::json!({ "$schema": "https://opencode.ai/config.json" })
    };
    backup_once(&path)?;
    let root = v.as_object_mut().expect("json object");
    let mcp = root
        .entry("mcp".to_string())
        .or_insert_with(|| serde_json::json!({}));
    let servers = mcp
        .as_object_mut()
        .expect("mcp object")
        .entry("servers".to_string())
        .or_insert_with(|| serde_json::json!({}));
    servers["sendpalm"] = serde_json::json!({
        "type": "remote",
        "url": url,
        "oauth": false,
        "headers": { "Authorization": format!("Bearer {token}") },
    });
    let text = serde_json::to_string_pretty(&v).map_err(|e| format!("serialize: {e}"))?;
    std::fs::write(&path, format!("{text}\n"))
        .map_err(|e| format!("write {}: {e}", path.display()))?;
    // If we earlier wrote to the sibling `.json` (before jsonc-priority was
    // understood), remove our stale entry so the two files can't disagree.
    if path.extension().is_some_and(|e| e == "jsonc") {
        let json_path = path.with_extension("json");
        if let Ok(text) = std::fs::read_to_string(&json_path) {
            if let Ok(mut jv) = serde_json::from_str::<serde_json::Value>(&text) {
                if let Some(servers) = jv
                    .pointer_mut("/mcp/servers")
                    .and_then(|s| s.as_object_mut())
                {
                    servers.remove("sendpalm");
                    if let Ok(text) = serde_json::to_string_pretty(&jv) {
                        let _ = std::fs::write(&json_path, format!("{text}\n"));
                    }
                }
            }
        }
    }
    Ok(())
}

fn connect_claude(home: &Path, url: &str, token: &str) -> Result<(), String> {
    let path = claude_config_path(home);
    let mut v: serde_json::Value = if path.is_file() {
        let text = std::fs::read_to_string(&path)
            .map_err(|e| format!("read {}: {e}", path.display()))?;
        serde_json::from_str(&text).unwrap_or_else(|_| serde_json::json!({}))
    } else {
        serde_json::json!({})
    };
    backup_once(&path)?;
    let servers = v
        .as_object_mut()
        .expect("json object")
        .entry("mcpServers".to_string())
        .or_insert_with(|| serde_json::json!({}));
    servers["sendpalm"] = serde_json::json!({
        "url": url,
        "headers": { "Authorization": format!("Bearer {token}") },
    });
    let text = serde_json::to_string_pretty(&v).map_err(|e| format!("serialize: {e}"))?;
    std::fs::write(&path, format!("{text}\n"))
        .map_err(|e| format!("write {}: {e}", path.display()))
}

fn connect_codex(home: &Path, url: &str, token: &str) -> Result<(), String> {
    let path = codex_config_path(home);
    let dir = path.parent().ok_or_else(|| "codex config has no dir".to_string())?;
    std::fs::create_dir_all(dir).map_err(|e| format!("mkdir {}: {e}", dir.display()))?;
    let mut text = if path.is_file() {
        std::fs::read_to_string(&path)
            .map_err(|e| format!("read {}: {e}", path.display()))?
    } else {
        String::new()
    };
    backup_once(&path)?;
    // Remove any previous sendpalm section (idempotent rewrite).
    if let Some(start) = text.find("[mcp_servers.sendpalm]") {
        let end = text[start..]
            .find("\n[")
            .map(|i| start + i)
            .unwrap_or(text.len());
        text.replace_range(start..end, "");
    }
    let section = format!(
        "[mcp_servers.sendpalm]\nurl = \"{url}\"\nheaders = {{ Authorization = \"Bearer {token}\" }}\n"
    );
    if !text.ends_with('\n') && !text.is_empty() {
        text.push('\n');
    }
    text.push_str(&section);
    std::fs::write(&path, text).map_err(|e| format!("write {}: {e}", path.display()))
}

/// Disconnect: remove exactly the entries we wrote. Leaves the backup.
pub async fn disconnect_client(id: &str) -> Result<(), String> {
    let home = home_dir().ok_or_else(|| "no HOME".to_string())?;
    match id {
        "claude" => {
            let path = claude_config_path(&home);
            let text = std::fs::read_to_string(&path)
                .map_err(|e| format!("read {}: {e}", path.display()))?;
            let mut v: serde_json::Value =
                serde_json::from_str(&text).map_err(|e| format!("parse: {e}"))?;
            if let Some(obj) = v.as_object_mut() {
                if let Some(servers) = obj.get_mut("mcpServers").and_then(|s| s.as_object_mut()) {
                    servers.remove("sendpalm");
                }
            }
            let text = serde_json::to_string_pretty(&v).map_err(|e| format!("serialize: {e}"))?;
            std::fs::write(&path, format!("{text}\n"))
                .map_err(|e| format!("write {}: {e}", path.display()))
        }
        "opencode" => {
            let path = opencode_config_path(&home);
            let Ok(text) = std::fs::read_to_string(&path) else {
                return Ok(());
            };
            let mut v: serde_json::Value =
                serde_json::from_str(&strip_jsonc(&text)).map_err(|e| format!("parse: {e}"))?;
            if let Some(servers) = v
                .pointer_mut("/mcp/servers")
                .and_then(|s| s.as_object_mut())
            {
                servers.remove("sendpalm");
            }
            let text = serde_json::to_string_pretty(&v).map_err(|e| format!("serialize: {e}"))?;
            std::fs::write(&path, format!("{text}\n"))
                .map_err(|e| format!("write {}: {e}", path.display()))
        }
        "codex" => {
            let path = codex_config_path(&home);
            let Ok(text) = std::fs::read_to_string(&path) else {
                return Ok(());
            };
            let mut text = text;
            if let Some(start) = text.find("[mcp_servers.sendpalm]") {
                let end = text[start..]
                    .find("\n[")
                    .map(|i| start + i)
                    .unwrap_or(text.len());
                text.replace_range(start..end, "");
                std::fs::write(&path, text)
                    .map_err(|e| format!("write {}: {e}", path.display()))?;
            }
            Ok(())
        }
        other => Err(format!("unknown client: {other}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Serializes tests that mutate HOME. Must be the process-wide
    // HOME_TEST_LOCK — per-module locks race each other (skill tests
    // flip HOME in parallel and the *live* env is read inside
    // connect/disconnect via home_dir()).
    pub(super) fn with_fixture_home<T>(f: impl FnOnce(&Path) -> T) -> T {
        let _guard = crate::services::HOME_TEST_LOCK.lock().unwrap();
        let dir = std::env::temp_dir().join(format!(
            "sendpalm-agent-clients-test-{}",
            uuid::Uuid::new_v4().simple()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let prev = std::env::var_os("HOME");
        std::env::set_var("HOME", &dir);
        let out = f(&dir);
        match prev {
            Some(p) => std::env::set_var("HOME", p),
            None => std::env::remove_var("HOME"),
        }
        let _ = std::fs::remove_dir_all(&dir);
        out
    }

    #[test]
    fn claude_connect_writes_marked_entry_and_disconnect_removes_only_it() {
        with_fixture_home(|home| {
            // Pre-existing unrelated server must survive.
            std::fs::write(
                home.join(".claude.json"),
                r#"{"mcpServers":{"other":{"url":"http://example/mcp"}}}"#,
            )
            .unwrap();

            let rt = tokio::runtime::Runtime::new().unwrap();
            rt.block_on(async {
                connect_client("claude", "http://127.0.0.1:43123/mcp", "sp_tok")
                    .await
                    .unwrap();
                connect_client("claude", "http://127.0.0.1:43123/mcp", "sp_tok")
                    .await
                    .unwrap(); // idempotent
            });

            let text = std::fs::read_to_string(home.join(".claude.json")).unwrap();
            let v: serde_json::Value = serde_json::from_str(&text).unwrap();
            let servers = &v["mcpServers"];
            assert!(servers["sendpalm"]["url"] == "http://127.0.0.1:43123/mcp");
            assert_eq!(
                servers["sendpalm"]["headers"]["Authorization"],
                "Bearer sp_tok"
            );
            assert!(servers["other"].is_object(), "unrelated entry survives");
            // Exactly one sendpalm entry after double connect.
            assert_eq!(servers.as_object().unwrap().keys().filter(|k| *k == "sendpalm").count(), 1);
            assert!(home.join(".claude.json.bak-before-sendpalm").is_file());

            rt.block_on(async { disconnect_client("claude").await.unwrap() });
            let v: serde_json::Value =
                serde_json::from_str(&std::fs::read_to_string(home.join(".claude.json")).unwrap())
                    .unwrap();
            assert!(v["mcpServers"]["sendpalm"].is_null());
            assert!(v["mcpServers"]["other"].is_object());
        });
    }

    #[test]
    fn codex_connect_writes_toml_section_and_disconnect_removes_it() {
        with_fixture_home(|home| {
            std::fs::create_dir_all(home.join(".codex")).unwrap();
            std::fs::write(
                home.join(".codex/config.toml"),
                "[mcp_servers.existing]\nurl = \"http://x/mcp\"\n",
            )
            .unwrap();

            let rt = tokio::runtime::Runtime::new().unwrap();
            rt.block_on(async {
                connect_client("codex", "http://127.0.0.1:43123/mcp", "sp_tok")
                    .await
                    .unwrap();
                connect_client("codex", "http://127.0.0.1:43123/mcp", "sp_tok")
                    .await
                    .unwrap();
            });

            let text = std::fs::read_to_string(home.join(".codex/config.toml")).unwrap();
            assert!(text.contains("[mcp_servers.sendpalm]"));
            assert_eq!(text.matches("[mcp_servers.sendpalm]").count(), 1);
            assert!(text.contains("url = \"http://127.0.0.1:43123/mcp\""));
            assert!(text.contains("[mcp_servers.existing]"));

            rt.block_on(async { disconnect_client("codex").await.unwrap() });
            let text = std::fs::read_to_string(home.join(".codex/config.toml")).unwrap();
            assert!(!text.contains("[mcp_servers.sendpalm]"));
            assert!(text.contains("[mcp_servers.existing]"));
        });
    }

    #[test]
    fn read_connected_matches_url() {
        with_fixture_home(|home| {
            std::fs::write(
                home.join(".claude.json"),
                r#"{"mcpServers":{"sendpalm":{"url":"http://127.0.0.1:9/mcp"}}}"#,
            )
            .unwrap();
            assert!(read_connected("claude", home, "http://127.0.0.1:9/mcp"));
            assert!(!read_connected("claude", home, "http://127.0.0.1:8/mcp"));
        });
    }

    use super::*;

    #[test]
    fn strip_jsonc_removes_comments_but_keeps_urls() {
        let src = r#"{
            // line comment
            "url": "http://x//not-a-comment",
            /* block */ "other": true
        }"#;
        let v: serde_json::Value =
            serde_json::from_str(&strip_jsonc(src)).expect("parses after strip");
        assert_eq!(v["url"], "http://x//not-a-comment");
        assert_eq!(v["other"], true);
    }

    #[test]
    fn connect_merges_into_existing_jsonc_and_preserves_unrelated() {
        with_fixture_home(|home| {
            let cfg_dir = home.join(".config/opencode");
            std::fs::create_dir_all(&cfg_dir).unwrap();
            std::fs::write(
                cfg_dir.join("opencode.json"),
                r#"{
                    // my provider
                    "provider": "anthropic",
                    "mcp": { "servers": { "context7": { "type": "remote", "url": "https://mcp.context7.com/mcp" } } }
                }"#,
            )
            .unwrap();

            let rt = tokio::runtime::Runtime::new().unwrap();
            rt.block_on(async {
                connect_client("opencode", "http://127.0.0.1:43123/mcp", "sp_tok")
                    .await
                    .unwrap();
            });

            // We always write the plain .json file.
            let text = std::fs::read_to_string(cfg_dir.join("opencode.json")).unwrap();
            let v: serde_json::Value = serde_json::from_str(&text).unwrap();
            assert_eq!(v["provider"], "anthropic", "unrelated config preserved");
            assert_eq!(
                v["mcp"]["servers"]["context7"]["url"],
                "https://mcp.context7.com/mcp",
                "existing MCP server preserved"
            );
            let sp = &v["mcp"]["servers"]["sendpalm"];
            assert_eq!(sp["type"], "remote");
            assert_eq!(sp["oauth"], false);
            assert_eq!(sp["headers"]["Authorization"], "Bearer sp_tok");
            assert!(read_connected("opencode", home, "http://127.0.0.1:43123/mcp"));

            rt.block_on(async { disconnect_client("opencode").await.unwrap() });
            let v: serde_json::Value =
                serde_json::from_str(&std::fs::read_to_string(cfg_dir.join("opencode.json")).unwrap())
                    .unwrap();
            assert!(v["mcp"]["servers"]["sendpalm"].is_null());
            assert!(v["mcp"]["servers"]["context7"].is_object());
            assert_eq!(v["provider"], "anthropic");
        });
    }

    #[test]
    fn connect_creates_config_with_schema_when_absent() {
        with_fixture_home(|home| {
            let rt = tokio::runtime::Runtime::new().unwrap();
            rt.block_on(async {
                connect_client("opencode", "http://127.0.0.1:9/mcp", "sp_t")
                    .await
                    .unwrap();
            });
            let text =
                std::fs::read_to_string(home.join(".config/opencode/opencode.json")).unwrap();
            let v: serde_json::Value = serde_json::from_str(&text).unwrap();
            assert_eq!(v["$schema"], "https://opencode.ai/config.json");
            assert_eq!(v["mcp"]["servers"]["sendpalm"]["url"], "http://127.0.0.1:9/mcp");
        });
    }}

#[cfg(test)]
mod opencode_jsonc_tests {
    use super::tests::with_fixture_home;
    use super::*;

    #[test]
    fn jsonc_takes_precedence_and_stale_json_entry_is_removed() {
        with_fixture_home(|home| {
            let dir = home.join(".config/opencode");
            std::fs::create_dir_all(&dir).unwrap();
            // The .jsonc is authoritative and has the user's real config.
            std::fs::write(dir.join("opencode.jsonc"), "{\n  // provider\n  \"provider\": \"anthropic\"\n}\n").unwrap();
            // A stale sendpalm entry from the pre-fix era sits in .json.
            std::fs::write(
                dir.join("opencode.json"),
                r#"{"mcp":{"servers":{"sendpalm":{"url":"http://old/mcp"}}}}"#,
            )
            .unwrap();

            let rt = tokio::runtime::Runtime::new().unwrap();
            rt.block_on(async {
                connect_client("opencode", "http://127.0.0.1:43123/mcp", "sp_tok")
                    .await
                    .unwrap();
            });

            // Entry lands in the jsonc, unrelated config preserved.
            let jsonc = std::fs::read_to_string(dir.join("opencode.jsonc")).unwrap();
            let v: serde_json::Value = serde_json::from_str(&jsonc).unwrap();
            assert_eq!(v["provider"], "anthropic");
            assert_eq!(v["mcp"]["servers"]["sendpalm"]["url"], "http://127.0.0.1:43123/mcp");
            // Stale .json entry cleaned.
            let j: serde_json::Value =
                serde_json::from_str(&std::fs::read_to_string(dir.join("opencode.json")).unwrap()).unwrap();
            assert!(j["mcp"]["servers"]["sendpalm"].is_null());
            assert!(read_connected("opencode", home, "http://127.0.0.1:43123/mcp"));
        });
    }
}
