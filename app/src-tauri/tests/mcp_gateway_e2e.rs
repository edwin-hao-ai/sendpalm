//! End-to-end MCP gateway test — a real HTTP round trip over loopback:
//! token gate, initialize handshake, tools/list, tools/call.
//! No external network; runs in CI.

use sendpalm_app_lib::services::mcp;
use sendpalm_app_lib::services::sync_loop::open_pool_at;

async fn post(
    client: &reqwest::Client,
    url: &str,
    token: Option<&str>,
    body: serde_json::Value,
) -> (reqwest::StatusCode, serde_json::Value) {
    let method = body["method"].as_str().unwrap_or("").to_string();
    let name = body["params"]["name"].as_str().unwrap_or("").to_string();
    let mut req = client
        .post(url)
        .header("Accept", "application/json, text/event-stream")
        .header("MCP-Protocol-Version", "2026-07-28")
        .header("Mcp-Method", method);
    if !name.is_empty() {
        req = req.header("Mcp-Name", name);
    }
    let mut req = req.json(&body);
    if let Some(t) = token {
        req = req.bearer_auth(t);
    }
    let resp = req.send().await.expect("request sends");
    let status = resp.status();
    let ct = resp.headers().get("content-type").cloned();
    let raw = resp.text().await.unwrap_or_default();
    let v = if ct.as_ref().is_some_and(|c| c.to_str().unwrap_or("").contains("text/event-stream")) {
        // Pull the last `data:` frame out of the SSE stream.
        raw.lines()
            .filter(|l| l.starts_with("data: "))
            .last()
            .and_then(|l| serde_json::from_str(l.trim_start_matches("data: ")).ok())
            .unwrap_or(serde_json::Value::Null)
    } else {
        serde_json::from_str(&raw).unwrap_or(serde_json::Value::Null)
    };
    (status, v)
}

#[tokio::test]
async fn gateway_handshake_tools_and_auth() {
    // Temp app-data dir so the gateway state + sidecar stay isolated.
    let dir = std::env::temp_dir().join(format!(
        "sendpalm-mcp-e2e-{}",
        uuid::Uuid::new_v4().simple()
    ));
    std::fs::create_dir_all(&dir).unwrap();
    let db_path = dir.join("sendpalm.db");
    std::fs::File::create(&db_path).unwrap();

    let pool = open_pool_at(&db_path).await.expect("pool");
    sqlx::raw_sql(
        "CREATE TABLE IF NOT EXISTS app_kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT);
         CREATE TABLE IF NOT EXISTS messages (
           id TEXT PRIMARY KEY, pid TEXT, subj TEXT NOT NULL DEFAULT '', prev TEXT NOT NULL DEFAULT '',
           body TEXT NOT NULL DEFAULT '', bucket TEXT NOT NULL DEFAULT 'imbox', direction TEXT NOT NULL DEFAULT 'in',
           unread INTEGER NOT NULL DEFAULT 1, timeline_at TEXT NOT NULL, ac TEXT NOT NULL DEFAULT '',
           reply_later INTEGER NOT NULL DEFAULT 0, set_aside INTEGER NOT NULL DEFAULT 0, bubble_up_at TEXT, deleted_at TEXT
         );
         INSERT INTO messages (id, subj, timeline_at) VALUES ('m1','E2E hello','2026-11-03T10:00:00Z');",
    )
    .execute(&pool)
    .await
    .unwrap();

    mcp::start_mcp_server(pool.clone()).await.expect("server starts");
    let ep = mcp::mcp_endpoint(&pool).await.expect("endpoint");

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .unwrap();

    // Auth gate: no token -> 401.
    let (status, _) = post(
        &client,
        &ep.url,
        None,
        serde_json::json!({"jsonrpc":"2.0","id":1,"method":"initialize","params":{
            "protocolVersion":"2026-07-28",
            "capabilities":{},
            "clientInfo":{"name":"e2e","version":"0"}
        }}),
    )
    .await;
    assert_eq!(status, 401);

    // Wrong token -> 401.
    let (status, _) = post(
        &client,
        &ep.url,
        Some("sp_wrong"),
        serde_json::json!({"jsonrpc":"2.0","id":1,"method":"initialize","params":{
            "protocolVersion":"2026-07-28","capabilities":{},
            "clientInfo":{"name":"e2e","version":"0"}
        }}),
    )
    .await;
    assert_eq!(status, 401);

    // Real handshake with the pairing token.
    let (status, init) = post(
        &client,
        &ep.url,
        Some(&ep.token),
        serde_json::json!({"jsonrpc":"2.0","id":1,"method":"initialize","params":{
            "protocolVersion":"2026-07-28","capabilities":{},
            "clientInfo":{"name":"e2e","version":"0"}
        }}),
    )
    .await;
    assert_eq!(status, 200, "initialize: {init}");
    assert_eq!(init["result"]["serverInfo"]["name"], "sendpalm");

    // MCP lifecycle: the client must announce initialized before calls.
    post(
        &client,
        &ep.url,
        Some(&ep.token),
        serde_json::json!({"jsonrpc":"2.0","method":"notifications/initialized"}),
    )
    .await;

    // tools/list exposes the full surface.
    let (status, listed) = post(
        &client,
        &ep.url,
        Some(&ep.token),
        serde_json::json!({"jsonrpc":"2.0","id":2,"method":"tools/list","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientInfo":{"name":"e2e","version":"0"},"io.modelcontextprotocol/clientCapabilities":{}}}}),
    )
    .await;
    assert_eq!(status, 200, "tools/list body: {listed}");
    let names: Vec<&str> = listed["result"]["tools"]
        .as_array()
        .unwrap()
        .iter()
        .map(|t| t["name"].as_str().unwrap())
        .collect();
    for expected in [
        "list_messages", "get_message", "search_messages", "get_contact",
        "list_events", "list_tasks", "list_follow_ups",
        "create_draft", "create_task", "create_follow_up", "create_clip",
        "approve_sender", "block_sender", "move_messages",
    ] {
        assert!(names.contains(&expected), "missing tool {expected}");
    }

    // tools/call reads through to SQLite.
    let (status, called) = post(
        &client,
        &ep.url,
        Some(&ep.token),
        serde_json::json!({"jsonrpc":"2.0","id":3,"method":"tools/call","params":{
            "name":"list_messages","arguments":{},"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientInfo":{"name":"e2e","version":"0"},"io.modelcontextprotocol/clientCapabilities":{}}
        }}),
    )
    .await;
    assert_eq!(status, 200, "call: {called}");
    let text = called["result"]["content"][0]["text"].as_str().unwrap();
    let parsed: serde_json::Value = serde_json::from_str(text).unwrap();
    assert_eq!(parsed[0]["subject"], "E2E hello");

    let _ = std::fs::remove_dir_all(&dir);
}
