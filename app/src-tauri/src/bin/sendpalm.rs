//! `sendpalm` — thin CLI for agents and power users. Talks to the running
//! app's MCP gateway over loopback HTTP using the endpoint sidecar
//! (`<app_data>/mcp-endpoint.json`, written 0600 by the app).

use std::path::PathBuf;

#[derive(Debug, serde::Deserialize)]
struct Endpoint {
    url: String,
    token: String,
}

fn app_data_dir() -> Result<PathBuf, String> {
    if let Some(d) = std::env::var_os("SENDPALM_APP_DATA") {
        return Ok(PathBuf::from(d));
    }
    let home =
        std::env::var_os("HOME").ok_or_else(|| "no HOME; set SENDPALM_APP_DATA".to_string())?;
    // Mirror tauri app_data_dir on macOS/Linux.
    if cfg!(target_os = "macos") {
        Ok(PathBuf::from(home)
            .join("Library/Application Support/com.sendpalm.app"))
    } else {
        Ok(PathBuf::from(home).join(".local/share/com.sendpalm.app"))
    }
}

fn load_endpoint() -> Result<Endpoint, String> {
    let path = app_data_dir()?.join("mcp-endpoint.json");
    let text = std::fs::read_to_string(&path).map_err(|_| {
        "找不到 mcp-endpoint.json——SendPalm 需要在运行中（先打开应用再试）".to_string()
    })?;
    serde_json::from_str(&text).map_err(|e| format!("endpoint parse: {e}"))
}

async fn call_tool(ep: &Endpoint, name: &str, arguments: serde_json::Value) -> Result<serde_json::Value, String> {
    let body = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {
            "name": name,
            "arguments": arguments,
            "_meta": {
                "io.modelcontextprotocol/protocolVersion": "2026-07-28",
                "io.modelcontextprotocol/clientInfo": { "name": "sendpalm-cli", "version": env!("CARGO_PKG_VERSION") },
                "io.modelcontextprotocol/clientCapabilities": {},
            },
        },
    });
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("http client: {e}"))?;
    let resp = client
        .post(&ep.url)
        .bearer_auth(&ep.token)
        .header("Accept", "application/json, text/event-stream")
        .header("MCP-Protocol-Version", "2026-07-28")
        .header("Mcp-Method", "tools/call")
        .header("Mcp-Name", name)
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            let mut msg = format!("http send: {e}");
            let mut cur = std::error::Error::source(&e);
            while let Some(src) = cur {
                msg = format!("{msg} <- {src}");
                cur = std::error::Error::source(src);
            }
            msg
        })?;
    let status = resp.status();
    let ct = resp
        .headers()
        .get("content-type")
        .and_then(|c| c.to_str().ok())
        .unwrap_or("")
        .to_string();
    let raw = resp.text().await.map_err(|e| format!("read body: {e}"))?;
    let v: serde_json::Value = if ct.contains("text/event-stream") {
        // Streamable HTTP may answer with SSE even for simple calls —
        // take the last non-empty `data:` frame.
        raw.lines()
            .filter(|l| l.starts_with("data: ") && l[6..].trim().len() > 0)
            .last()
            .and_then(|l| serde_json::from_str(l.trim_start_matches("data: ")).ok())
            .ok_or_else(|| format!("no JSON frame in SSE response: {}", &raw[..raw.len().min(200)]))?
    } else {
        serde_json::from_str(&raw).map_err(|e| format!("parse: {e}; body: {}", &raw[..raw.len().min(300)]))?
    };
    if !status.is_success() {
        return Err(format!("gateway {status}: {}", v["error"]["message"]));
    }
    if let Some(err) = v.get("error") {
        return Err(err["message"].as_str().unwrap_or("gateway error").to_string());
    }
    // Extract text content from the tool result.
    let content = &v["result"]["content"];
    let text = content
        .as_array()
        .and_then(|arr| arr.iter().find(|c| c["type"] == "text"))
        .and_then(|c| c["text"].as_str())
        .unwrap_or("null");
    serde_json::from_str(text).map_err(|_| text.to_string())
}

fn arg_value(args: &[String], flag: &str) -> Option<String> {
    args.iter()
        .position(|a| a == flag)
        .and_then(|i| args.get(i + 1))
        .cloned()
}

fn has_flag(args: &[String], flag: &str) -> bool {
    args.iter().any(|a| a == flag)
}

fn positional(args: &[String]) -> Vec<String> {
    args.iter()
        .enumerate()
        .filter(|(i, a)| !a.starts_with('-') && (i == &0 || args.get(i.wrapping_sub(1)).is_none_or(|p| !p.starts_with('-'))))
        .map(|(_, a)| a.clone())
        .collect()
}

#[tokio::main(flavor = "current_thread")]
async fn main() {
    let argv: Vec<String> = std::env::args().skip(1).collect();
    let Some(cmd) = argv.first().cloned() else {
        eprintln!("用法: sendpalm <list|read|search|contact|events|tasks|follow-ups|draft|approve|block|move|mcp-url> …");
        std::process::exit(2);
    };
    let rest = &argv[1..];

    let ep = match load_endpoint() {
        Ok(ep) => ep,
        Err(e) => {
            if cmd == "skill" {
                // Skill management doesn't need the gateway.
                skill_cmd(rest);
                return;
            }
            eprintln!("{e}");
            std::process::exit(1);
        }
    };

    let result = match cmd.as_str() {
        "mcp-url" => Ok(serde_json::Value::String(ep.url.clone())),
        "list" => {
            let mut args = serde_json::json!({});
            if let Some(b) = arg_value(rest, "--bucket") {
                args["bucket"] = b.into();
            }
            if has_flag(rest, "--unread") {
                args["unreadOnly"] = true.into();
            }
            if let Some(f) = arg_value(rest, "--from") {
                args["from"] = f.into();
            }
            if let Some(l) = arg_value(rest, "--limit") {
                args["limit"] = l.parse::<u64>().unwrap_or(20).into();
            }
            call_tool(&ep, "list_messages", args).await
        }
        "read" => match positional(rest).first() {
            Some(id) => call_tool(&ep, "get_message", serde_json::json!({ "id": id })).await,
            None => Err("用法: sendpalm read <id>".into()),
        },
        "search" => match positional(rest).first() {
            Some(q) => call_tool(&ep, "search_messages", serde_json::json!({ "query": q })).await,
            None => Err("用法: sendpalm search <query>".into()),
        },
        "contact" => match positional(rest).first() {
            Some(email) => call_tool(&ep, "get_contact", serde_json::json!({ "email": email })).await,
            None => Err("用法: sendpalm contact <email>".into()),
        },
        "events" => {
            let (Some(since), Some(until)) = (arg_value(rest, "--since"), arg_value(rest, "--until"))
            else {
                return fail("用法: sendpalm events --since YYYY-MM-DD --until YYYY-MM-DD");
            };
            call_tool(&ep, "list_events", serde_json::json!({ "since": since, "until": until })).await
        }
        "tasks" => call_tool(&ep, "list_tasks", serde_json::json!({})).await,
        "follow-ups" => call_tool(&ep, "list_follow_ups", serde_json::json!({})).await,
        "draft" => {
            let (Some(to), Some(subject), Some(body)) = (
                arg_value(rest, "--to"),
                arg_value(rest, "--subject"),
                arg_value(rest, "--body"),
            ) else {
                return fail("用法: sendpalm draft --to addr --subject \"…\" --body \"…\" [--reply-to id] [--cc addr]");
            };
            let mut args = serde_json::json!({ "to": to, "subject": subject, "body": body });
            if let Some(r) = arg_value(rest, "--reply-to") {
                args["inReplyTo"] = r.into();
            }
            if let Some(cc) = arg_value(rest, "--cc") {
                args["cc"] = serde_json::json!([cc]);
            }
            call_tool(&ep, "create_draft", args).await
        }
        "approve" => match positional(rest).first() {
            Some(email) => {
                let mut args = serde_json::json!({ "email": email });
                if let Some(b) = arg_value(rest, "--bucket") {
                    args["bucket"] = b.into();
                }
                call_tool(&ep, "approve_sender", args).await
            }
            None => fail("用法: sendpalm approve <email> [--bucket imbox|feed|paperTrail]"),
        },
        "block" => match positional(rest).first() {
            Some(email) => call_tool(&ep, "block_sender", serde_json::json!({ "email": email })).await,
            None => fail("用法: sendpalm block <email>"),
        },
        "move" => {
            let ids: Vec<String> = positional(rest);
            let Some(bucket) = arg_value(rest, "--bucket") else {
                return fail("用法: sendpalm move <id…> --bucket <bucket>");
            };
            call_tool(&ep, "move_messages", serde_json::json!({ "ids": ids, "bucket": bucket })).await
        }
        "skill" => {
            skill_cmd(rest);
            return;
        }
        other => Err(format!("未知命令: {other}")),
    };

    match result {
        Ok(v) => println!("{}", serde_json::to_string_pretty(&v).unwrap_or_else(|_| v.to_string())),
        Err(e) => fail(&e),
    }
}

fn fail(msg: &str) -> ! {
    eprintln!("{msg}");
    std::process::exit(1)
}

fn skill_cmd(rest: &[String]) {
    use sendpalm_app_lib::services::mcp::skill;
    let sub = rest.first().map(|s| s.as_str()).unwrap_or("");
    let target = rest.get(1).map(|s| s.as_str()).unwrap_or("claude");
    match sub {
        "install" => match skill::install_skill(target) {
            Ok(dir) => println!("已安装 SendPalm Skill → {}", dir.display()),
            Err(e) => fail(&e),
        },
        "uninstall" => match skill::uninstall_skill(target) {
            Ok(()) => println!("已卸载"),
            Err(e) => fail(&e),
        },
        _ => fail("用法: sendpalm skill <install|uninstall> [claude|codex]"),
    }
}
