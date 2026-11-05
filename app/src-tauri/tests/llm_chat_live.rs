//! Live BYOK chat through the app's own code path (chat_complete via
//! Vercel AI Gateway). Gated on SENDPALM_VERCEL_TEST_KEY.

use sendpalm_app_lib::services::llm::{chat_complete, ChatMessage, ChatRequest, LlmConfig};

#[tokio::test]
async fn vercel_gateway_chat_roundtrip() {
    let _ = dotenvy::dotenv();
    let Ok(key) = std::env::var("SENDPALM_VERCEL_TEST_KEY") else {
        eprintln!("SENDPALM_VERCEL_TEST_KEY not set — skipping");
        return;
    };
    let config = LlmConfig {
        base_url: "https://ai-gateway.vercel.sh/v1".into(),
        api_key: key,
        model: "gpt-4o-mini".into(),
        temperature: 0.0,
        max_tokens: 64,
    };
    let resp = chat_complete(&ChatRequest {
        config,
        messages: vec![ChatMessage {
            role: "user".into(),
            content: "用一句话回答：1+1等于几？".into(),
        }],
    })
    .await
    .expect("chat via vercel gateway");
    assert!(!resp.content.is_empty(), "empty reply");
    eprintln!("reply: {}", resp.content.trim());
}
