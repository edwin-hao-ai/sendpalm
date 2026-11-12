//! Local MCP gateway — lets AI agents (Claude Code, Codex, WorkBuddy)
//! work with the user's *organized* mailbox over a loopback HTTP server.
//!
//! Security model (spec 2026-11-03): 127.0.0.1 only, rmcp's built-in
//! loopback Host validation stays on, every /mcp POST requires
//! `Authorization: Bearer <pairing-token>`, the token is stored in app_kv
//! and never logged. Email credentials never leave the keychain — agents
//! get tool capability, not credentials.

pub mod compose;
pub mod server;
pub mod skill;
pub mod tools;

pub use server::{mcp_endpoint, mcp_status, start_mcp_server, McpEndpoint, McpStatusDto};

use std::sync::{Arc, Mutex};

/// In-memory gateway state managed by Tauri — the endpoint URL/token pair.
/// The token lives here (and in app_kv), never in logs or DTOs beyond a
/// masked preview.
#[derive(Debug, Clone, Default)]
pub struct McpGatewayState {
    endpoint: Arc<Mutex<Option<McpEndpoint>>>,
}

impl McpGatewayState {
    pub fn set(&self, ep: McpEndpoint) {
        *self.endpoint.lock().unwrap_or_else(|e| e.into_inner()) = Some(ep);
    }

    pub fn get(&self) -> Option<McpEndpoint> {
        self.endpoint.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }
}
