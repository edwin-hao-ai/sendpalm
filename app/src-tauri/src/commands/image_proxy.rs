use base64::Engine;
use tauri::{AppHandle, Manager};

#[tauri::command]
pub async fn fetch_image(url: String, app: AppHandle) -> Result<String, String> {
    let cache_dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| format!("cache dir: {e}"))?
        .join("images");
    tokio::fs::create_dir_all(&cache_dir)
        .await
        .map_err(|e| format!("create cache dir: {e}"))?;
    let (bytes, mime) =
        crate::services::image_proxy::fetch_and_cache(&url, &cache_dir).await?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{};base64,{}", mime, b64))
}