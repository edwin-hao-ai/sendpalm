//! Live check against Vercel AI Gateway — gated on
//! SENDPALM_VERCEL_TEST_KEY being present (local .env only, never CI).
//! Verifies the BYOK vercel provider end-to-end: /models returns a
//! non-empty list. The key is read from env and never printed.

use sendpalm_app_lib::services::llm::{list_models, LlmConfig};

#[tokio::test]
async fn vercel_gateway_lists_models() {
    let dotenv_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../.env");
    let _ = dotenvy::from_path(dotenv_path);
    let Ok(key) = std::env::var("SENDPALM_VERCEL_TEST_KEY") else {
        eprintln!("SENDPALM_VERCEL_TEST_KEY not set — skipping live check");
        return;
    };

    let config = LlmConfig {
        base_url: "https://ai-gateway.vercel.sh/v1".into(),
        api_key: key,
        model: String::new(),
        temperature: 0.2,
        max_tokens: 1,
    };
    let models = list_models(&config)
        .await
        .expect("vercel /models should succeed with a valid key");
    assert!(!models.is_empty(), "vercel returned an empty model list");
    eprintln!("vercel listed {} models; first id logged to stderr only", models.len());
}
