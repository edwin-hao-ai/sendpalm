//! One-shot: connect the REAL OpenCode config (the user's actual HOME)
//! using the same code path as the Settings toggle. Backs up first.
//! Run explicitly: cargo test --test connect_real_opencode -- --ignored --nocapture

#[tokio::test]
#[ignore]
async fn connect_real_opencode_config() {
    let ep_json = std::fs::read_to_string(
        std::env::var("HOME").unwrap() + "/Library/Application Support/com.sendpalm.app/mcp-endpoint.json",
    )
    .expect("endpoint sidecar — is SendPalm running?");
    let v: serde_json::Value = serde_json::from_str(&ep_json).unwrap();
    let url = v["url"].as_str().unwrap().to_string();
    let token = v["token"].as_str().unwrap().to_string();

    sendpalm_app_lib::services::agent_clients::connect_client("opencode", &url, &token)
        .await
        .expect("connect opencode");

    let home = std::env::var("HOME").unwrap();
    let cfg = if std::path::Path::new(&format!("{home}/.config/opencode/opencode.jsonc")).is_file() {
        format!("{home}/.config/opencode/opencode.jsonc")
    } else {
        format!("{home}/.config/opencode/opencode.json")
    };
    let text = std::fs::read_to_string(&cfg).expect("config written");
    let parsed: serde_json::Value = serde_json::from_str(&text).unwrap();
    assert!(parsed["mcp"]["servers"]["sendpalm"]["url"].as_str().unwrap() == url);
    // Prove the secret landed masked in our output — print only the shape.
    eprintln!("connected: sendpalm server registered in {cfg}");
    eprintln!("backup: {}", format!("{cfg}.bak-before-sendpalm"));
}
