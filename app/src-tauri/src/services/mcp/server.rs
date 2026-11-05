//! MCP server — auth gate, state persistence, and the rmcp service.

use sqlx::SqlitePool;
use std::sync::Arc;

use rmcp::ErrorData as McpError;
use rmcp::handler::server::ServerHandler;
use rmcp::model::*;
use rmcp::service::RequestContext;
use rmcp::transport::streamable_http_server::session::local::LocalSessionManager;
use rmcp::transport::streamable_http_server::{StreamableHttpServerConfig, StreamableHttpService};
use rmcp::RoleServer;

const APP_KV_KEY: &str = "mcp_server";

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpStatusDto {
    pub url: String,
    pub token_preview: String,
}

/// Bearer-token check for /mcp POSTs. Pure so the rules are unit-testable.
pub fn check_auth(header: Option<&http::HeaderValue>, token: &str) -> bool {
    let Some(hv) = header else { return false };
    let Ok(v) = hv.to_str() else { return false };
    let Some(got) = v.strip_prefix("Bearer ") else { return false };
    // Constant-shape compare would be nice; ring isn't in-tree. The token
    // is 256-bit random, so plain equality is acceptable for a loopback
    // pairing token (timing attacks against localhost are out of scope).
    got == token
}

/// Load-or-create the persisted (port, token) pair. Port 0 means "first
/// boot — pick an ephemeral port and persist whatever the OS assigns" so
/// already-written client configs keep working across restarts.
async fn load_or_create_state(pool: &SqlitePool) -> Result<(u16, String), String> {
    let row: Option<(String,)> = sqlx::query_as("SELECT value FROM app_kv WHERE key = $1")
        .bind(APP_KV_KEY)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("mcp state load: {e}"))?;
    if let Some((json,)) = row {
        let v: serde_json::Value = serde_json::from_str(&json).unwrap_or_default();
        let port = v.get("port").and_then(|p| p.as_u64()).unwrap_or(0) as u16;
        let token = v
            .get("token")
            .and_then(|t| t.as_str())
            .map(|s| s.to_string())
            .filter(|s| !s.is_empty());
        if let Some(token) = token {
            return Ok((port, token));
        }
    }
    let token = format!("sp_{}", uuid::Uuid::new_v4().simple());
    save_state(pool, 0, &token).await?;
    Ok((0, token))
}

async fn save_state(pool: &SqlitePool, port: u16, token: &str) -> Result<(), String> {
    let json = serde_json::json!({ "port": port, "token": token });
    sqlx::query(
        "INSERT INTO app_kv (key, value, updated_at) VALUES ($1, $2, datetime('now')) \
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    )
    .bind(APP_KV_KEY)
    .bind(json.to_string())
    .execute(pool)
    .await
    .map_err(|e| format!("mcp state save: {e}"))?;
    Ok(())
}

/// Current gateway status for the Settings panel. None when the DB has no
/// state yet (server not started).
pub async fn mcp_status(pool: &SqlitePool) -> Option<McpStatusDto> {
    let (port, token) = load_or_create_state(pool).await.ok()?;
    if port == 0 {
        return None;
    }
    Some(McpStatusDto {
        url: format!("http://127.0.0.1:{port}/mcp"),
        token_preview: format!("{}…", &token[..token.len().min(10)]),
    })
}


/// Full endpoint (URL + token) for internal use — the token never leaves
/// the app except when we write a client config the user asked for.
#[derive(Debug, Clone)]
pub struct McpEndpoint {
    pub url: String,
    pub token: String,
}

pub async fn mcp_endpoint(pool: &SqlitePool) -> Option<McpEndpoint> {
    let (port, token) = load_or_create_state(pool).await.ok()?;
    if port == 0 {
        return None;
    }
    Some(McpEndpoint {
        url: format!("http://127.0.0.1:{port}/mcp"),
        token,
    })
}

// ── Server handler ────────────────────────────────────────────────────

#[derive(Clone)]
pub struct SendPalmMcp {
    pool: SqlitePool,
}

impl SendPalmMcp {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub fn pool(&self) -> &SqlitePool {
        &self.pool
    }
}

impl ServerHandler for SendPalmMcp {
    fn get_info(&self) -> ServerConfig {
        ServerInfo::new(ServerCapabilities::builder().enable_tools().build())
            .with_server_info(Implementation::new("sendpalm", env!("CARGO_PKG_VERSION")))
            .with_instructions(
                "SendPalm 本地邮箱工作区工具：读取已整理的邮件、联系人、任务与日历；\
                 写入类操作只建草稿/任务，发送由用户在 SendPalm 中确认。",
            )
    }

    fn list_tools(
        &self,
        _request: Option<PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> impl std::future::Future<Output = Result<ListToolsResult, McpError>> + Send + '_ {
        let tools = crate::services::mcp::tools::tool_defs()
            .into_iter()
            .map(|t| {
                Tool::new(
                    t.name.to_string(),
                    t.description.to_string(),
                    serde_json::from_value::<JsonObject>(t.schema)
                        .unwrap_or_else(|_| JsonObject::default()),
                )
            })
            .collect();
        std::future::ready(Ok(ListToolsResult::with_all_items(tools)))
    }

    fn get_tool(&self, name: &str) -> Option<Tool> {
        crate::services::mcp::tools::tool_defs()
            .into_iter()
            .find(|t| t.name == name)
            .map(|t| {
                Tool::new(
                    t.name.to_string(),
                    t.description.to_string(),
                    serde_json::from_value::<JsonObject>(t.schema)
                        .unwrap_or_else(|_| JsonObject::default()),
                )
            })
    }

    fn call_tool(
        &self,
        request: CallToolRequestParams,
        _context: RequestContext<RoleServer>,
    ) -> impl std::future::Future<Output = Result<CallToolResponse, McpError>> + Send + '_ {
        let name = request.name.to_string();
        let args: serde_json::Value = request
            .arguments
            .map(|a| serde_json::to_value(a).unwrap_or(serde_json::Value::Null))
            .unwrap_or(serde_json::Value::Null);
        let pool = self.pool.clone();
        async move {
            match crate::services::mcp::tools::call_tool(&pool, &name, args).await {
                Ok(value) => Ok(CallToolResult::success(vec![ContentBlock::text(
                    serde_json::to_string_pretty(&value).unwrap_or_else(|_| value.to_string()),
                )])
                .into()),
                Err(message) => Ok(CallToolResult::error(vec![ContentBlock::text(message)]).into()),
            }
        }
    }
}

// ── HTTP wiring ───────────────────────────────────────────────────────

type BoxResponse = http::Response<http_body_util::combinators::BoxBody<bytes::Bytes, std::convert::Infallible>>;

/// Tower layer that rejects /mcp POSTs without the pairing token before
/// they reach the MCP service.
#[derive(Clone)]
struct AuthGate<S> {
    inner: S,
    token: Arc<String>,
}

/// hyper 1 defines its own `Service` trait (distinct from
/// `tower_service::Service` that StreamableHttpService implements), so
/// the gate exposes a hyper-level facade that delegates per-connection.
impl<S, B> hyper::service::Service<http::Request<B>> for AuthGate<S>
where
    S: tower_service::Service<http::Request<B>, Response = BoxResponse>
        + Clone
        + Send
        + 'static,
    S::Future: Send + 'static,
    S::Error: std::error::Error + Send + Sync + 'static,
    B: Send + 'static,
{
    type Response = BoxResponse;
    type Error = S::Error;
    type Future = std::pin::Pin<
        Box<dyn std::future::Future<Output = Result<BoxResponse, S::Error>> + Send>,
    >;

    fn call(&self, req: http::Request<B>) -> Self::Future {
        let is_mcp_post = req.method() == http::Method::POST;
        let authed = check_auth(req.headers().get(http::header::AUTHORIZATION), &self.token);
        let mut inner = self.inner.clone();
        Box::pin(async move {
            if is_mcp_post && !authed {
                let body = http_body_util::Full::new(bytes::Bytes::from(
                    r#"{"jsonrpc":"2.0","error":{"code":-32001,"message":"unauthorized"}}"#,
                ))
                .map_err(|never: std::convert::Infallible| match never {})
                .boxed();
                return Ok(http::Response::builder()
                    .status(http::StatusCode::UNAUTHORIZED)
                    .header("content-type", "application/json")
                    .body(body)
                    .expect("static response builds"));
            }
            inner.call(req).await
        })
    }
}

use http_body_util::BodyExt;

/// Start the loopback MCP server. Persists the chosen port so client
/// configs written earlier keep working across app restarts. Returns the
/// bound port.
pub async fn start_mcp_server(pool: SqlitePool) -> Result<u16, String> {
    let (want_port, token) = load_or_create_state(&pool).await?;

    let bind: std::net::SocketAddr = if want_port == 0 {
        "127.0.0.1:0".parse().unwrap()
    } else {
        format!("127.0.0.1:{want_port}").parse().unwrap()
    };
    let listener = tokio::net::TcpListener::bind(bind)
        .await
        .map_err(|e| format!("mcp bind {bind}: {e}"))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("mcp local_addr: {e}"))?
        .port();
    if want_port == 0 {
        save_state(&pool, port, &token).await?;
    }
    // Sidecar for the `sendpalm` CLI and Skill scripts: the endpoint in a
    // well-known file (0600) so external processes can find the gateway.
    if let Ok(dir) = crate::services::sync_loop::db_path().parent().map(|p| p.to_path_buf()).ok_or_else(|| "no db dir".to_string()) {
        let _ = std::fs::write(
            dir.join("mcp-endpoint.json"),
            serde_json::json!({ "url": format!("http://127.0.0.1:{port}/mcp"), "token": token }).to_string(),
        );
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(dir.join("mcp-endpoint.json"), std::fs::Permissions::from_mode(0o600));
        }
    }

    let token = Arc::new(token);

    // One session manager for the whole server: legacy-protocol clients
    // (OpenCode, Claude Code) hold a session id that must resolve on ANY
    // connection — a per-connection manager breaks reconnects and
    // connection pooling with "session expired".
    let sessions = Arc::new(LocalSessionManager::default());
    tokio::spawn(async move {
        loop {
            let Ok((stream, _)) = listener.accept().await else {
                continue;
            };
            let factory_pool = pool.clone();
            let svc = AuthGate {
                inner: StreamableHttpService::new(
                    move || Ok(SendPalmMcp::new(factory_pool.clone())),
                    sessions.clone(),
                    // Simple request/response tools answer with plain
                    // JSON instead of an SSE stream — far easier for the
                    // bundled CLI and curl-style probes.
                    StreamableHttpServerConfig::default().with_json_response(true),
                ),
                token: token.clone(),
            };
            tokio::spawn(async move {
                let _ = hyper_util::server::conn::auto::Builder::new(
                    hyper_util::rt::TokioExecutor::new(),
                )
                .serve_connection_with_upgrades(hyper_util::rt::TokioIo::new(stream), svc)
                .await;
            });
        }
    });

    Ok(port)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn auth_requires_bearer_token() {
        let token = "sp_testtoken123";
        let good = http::HeaderValue::from_str(&format!("Bearer {token}")).unwrap();
        let bad = http::HeaderValue::from_static("Bearer wrong");
        let not_bearer = http::HeaderValue::from_static(token);

        assert!(check_auth(Some(&good), token));
        assert!(!check_auth(Some(&bad), token));
        assert!(!check_auth(Some(&not_bearer), token));
        assert!(!check_auth(None, token));
    }

    #[tokio::test]
    async fn state_round_trips_and_generates_token_once() {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        sqlx::raw_sql(
            "CREATE TABLE app_kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT);",
        )
        .execute(&pool)
        .await
        .unwrap();

        let (port, token) = load_or_create_state(&pool).await.unwrap();
        assert_eq!(port, 0);
        assert!(token.starts_with("sp_"));

        // Simulate a restart: port assigned, token preserved.
        save_state(&pool, 43123, &token).await.unwrap();
        let (port2, token2) = load_or_create_state(&pool).await.unwrap();
        assert_eq!(port2, 43123);
        assert_eq!(token2, token);
    }
}
