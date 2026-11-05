# BYOK Providers + Local Agent Gateway (MCP) + Skill Pack

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship BYOK provider catalog (gateways + direct + local), an in-app MCP gateway exposing the screened mailbox to AI agents, and one-click agent connection (auto-written client config + skill pack + CLI).

**Architecture:** Providers/models/keychain live in Rust (`services/llm.rs` extended; catalog is single source of truth, TS fetches it). The MCP server is an `rmcp` Streamable HTTP service in-app on 127.0.0.1 with Bearer pairing token; tools call the same store functions the UI uses and audit every write. Client config writer and skill installer are Rust commands driven by a Settings panel; per-agent shapes (claude/codex) are adapter modules with fixture tests.

**Tech Stack:** Existing Tauri 2 + SolidJS + rusqlite/sqlx; `rmcp` ≥ 1.4.0 (server + transport-streamable-http-server); reqwest (already present); vitest + Playwright. No other new deps.

**Spec:** `docs/superpowers/specs/2026-11-03-byok-and-local-agent-gateway-design.md` — including the six builder-check decisions (Anthropic chat adapter built; merged multi-account; legacy key self-migration; screening is positioning; app-must-run stated; skill targets claude+codex).

## Global Constraints

- rmcp pinned ≥ 1.4.0 (RUSTSEC-2026-0189).
- MCP spec revision 2026-07-28; server binds 127.0.0.1 only; Bearer token required for every tool call; token never logged.
- Provider catalog lives in Rust only; TS never hard-codes it (parity test enforces).
- API keys live in the OS keychain via `vault_set_secret`/`vault_get_secret` under `llm::<providerId>`; plaintext `agent.llm.apiKey` is migrated then always empty.
- Write tools: draft-first, no `send_email`, no physical delete; every write writes an `agent_audit` row with `session_id = "mcp"`.
- MCP tool DTOs are camelCase on the JS side; message content returned as plain text (no raw body_html).
- The user's test key (`vck_…`) only in gitignored `.env`; never committed/logged/copied into source.
- Tauri 2 JS↔Rust command args are camelCase on the wire.

## Review Focus

1. Malformed provider `/models` payloads (missing fields, wrong shape) — adapters must degrade to an empty list + error, never panic.
2. Anthropic chat payloads (system message folding, max_tokens required) — adapter tests pin the wire shape.
3. Ambiguous key prefixes (`sk-` → openai vs deepseek) — detection returns a disambiguation list, never silently picks.
4. Legacy plaintext key present at upgrade — migrated once, idempotent, test proves the settings field ends empty.
5. MCP client reconnect / app restart — persisted port keeps already-written client configs valid; probe re-checks after restart.
6. `move_messages` blast radius — 50-id cap and bucket whitelist are enforced server-side, tests pin both.

---

### Task 1: Provider catalog + key detection (Rust)

**Files:**
- Create: `app/src-tauri/src/services/provider_catalog.rs`
- Modify: `app/src-tauri/src/services/mod.rs`
- Test: inline `#[cfg(test)]` in `provider_catalog.rs`

**Interfaces:**
- Produces: `pub struct ProviderDescriptor { id: &'static str, name: &'static str, kind: ProviderKind, key_prefix: Option<&'static str>, tagline: &'static str, default_base_url: &'static str, list_path: &'static str, list_format: ListFormat }`; `pub enum ProviderKind { Gateway, Direct, Local }`; `pub enum ListFormat { OpenAi, Anthropic, OpenRouter, Ollama }` (all `Copy`); `ProviderCatalog::builtin() -> &'static [ProviderDescriptor]` (order = display order, exactly the 10 rows in the spec table); `detect_by_prefix(key: &str) -> PrefixMatch` where `pub enum PrefixMatch { Single(&'static ProviderDescriptor), Ambiguous(Vec<&'static ProviderDescriptor>), None }`.

- [ ] Add failing unit tests: all 10 providers present in order; `vck_`→vercel Single; `sk-or-`→openrouter; `sk-ant-`→anthropic; `gsk_`→groq; `xai-`→xai; `sk-`→Ambiguous [openai, deepseek]; `sk-nonexistent...`→None; empty key→None.
- [ ] Run `RUSTUP_TOOLCHAIN=stable cargo test --manifest-path src-tauri/Cargo.toml --lib provider_catalog` → fails (module missing).
- [ ] Implement the catalog exactly per spec table; `detect_by_prefix` longest-prefix match, ambiguous returns catalog-ordered candidates; locals (no prefix) never match detection.
- [ ] Run tests → green.

### Task 2: Model listing adapters + verify command (Rust)

**Files:**
- Modify: `app/src-tauri/src/services/llm.rs`
- Modify: `app/src-tauri/src/commands/mod.rs` (register `llm_list_models`)
- Test: inline tests in `llm.rs` with fixture JSON for all four list formats

**Interfaces:**
- Produces: `pub struct LlmModelInfo { id: String, display_name: String, context_window: Option<u32>, input_price_per_m: Option<f64> }`; `pub async fn list_models(config: &LlmConfig) -> Result<Vec<LlmModelInfo>, String>` — GET `{base_url}{list_path}`, provider from `config.base_url` matched against catalog (fallback OpenAI format); auth header `Authorization: Bearer` except Anthropic format → `x-api-key` + `anthropic-version: 2023-06-01`. Pure parse fns: `parse_openai_models(&str) -> Result<Vec<LlmModelInfo>, String>`, `parse_anthropic_models`, `parse_openrouter_models`, `parse_ollama_models`.
- Consumes: `LlmConfig` (existing), `ProviderCatalog` (Task 1).

- [ ] Failing tests: four parse fns against fixture JSON strings (openAI minimal `[{id,owned_by}]`; anthropic `[{id,display_name,max_input_tokens}]`; openRouter `[{id,name,context_length,pricing.prompt}]`; ollama `{models:[{name}]}`); malformed JSON → Err not panic; empty data → Ok(vec![]).
- [ ] Run tests → fail (fns missing).
- [ ] Implement parse fns (serde_json::Value; openRouter pricing.prompt is per-token string → ×1e6, non-numeric → None); implement `list_models` with a 15 s reqwest timeout; provider matched by comparing `config.base_url` host against catalog `default_base_url`, unknown host → OpenAI format.
- [ ] Add `#[tauri::command] llm_list_models(config: LlmConfig) -> Result<Vec<LlmModelInfo>, String>` in commands/mod.rs, register in lib.rs handler.
- [ ] Tests green + `cargo test --lib` green.

### Task 3: Anthropic chat adapter (Rust)

**Files:**
- Modify: `app/src-tauri/src/services/llm.rs`

**Interfaces:**
- Produces: `chat_complete` now dispatches: if `config.base_url` host matches anthropic catalog entry → `chat_complete_anthropic(req)` else existing OpenAI path. `pub fn wire_format(config: &LlmConfig) -> ListFormat` (shared with Task 2's dispatch).
- Consumes: `ChatRequest`/`ChatResponse` (existing shapes unchanged).

- [ ] Failing tests (pure fns): `anthropic_request_body(req)` — system messages folded into top-level `system` (concatenated, last wins order preserved); `max_tokens` always present; messages array excludes system; `anthropic_response_parse(body)` maps `content[0].text` → `ChatResponse.content`, `stop_reason` → `finish_reason`, usage fields. Provider without anthropic wire format untouched (existing chat tests keep passing).
- [ ] Run → fail.
- [ ] Implement request build + parse; dispatch in `chat_complete` via `wire_format`.
- [ ] Tests green.

### Task 4: Keychain storage + legacy migration (TS)

**Files:**
- Modify: `app/src/services/backend.ts` (typed wrappers)
- Create: `app/src/services/llm-config.ts`
- Create: `app/src/services/llm-config.test.ts`
- Modify: `app/src-tauri/src/services/vault.rs` (no change expected — `vault_set_secret`/`vault_get_secret` already generic; verify)

**Interfaces:**
- Produces (TS): `saveLlmKey(providerId: string, key: string): Promise<void>` → `vault_set_secret { key: "llm::<providerId>", value: key }`; `loadLlmKey(providerId: string): Promise<string | null>`; `deleteLlmKey(providerId)`. `maybeMigrateLegacyLlmKey(settings): Promise<void>` — if `settings.agent.llm.apiKey` non-empty: `saveLlmKey("custom", apiKey)`, set `agent.llm.apiKey = ""`, persist, save.
- Wire args camelCase (`providerId`); vault commands take `{ key, value }`.

- [ ] Failing vitest: with mocked backend invoke, migration moves key to `llm::custom`, wipes the field, persists once; second run is a no-op (idempotent); empty key is a no-op.
- [ ] Run → fail.
- [ ] Implement wrappers + migration.
- [ ] Tests green.

### Task 5: Settings → Agent provider UX (TS/Solid)

**Files:**
- Modify: `app/src/views/Settings.tsx` (replace the three hand-typed fields block ~1829-1990)
- Create: `app/src/components/LlmProviderSettings.tsx`
- Test: `app/src/components/LlmProviderSettings.test.tsx`

**Interfaces:**
- Consumes: `llm_list_models` via backend.ts `listLlmModels(config)`; `ProviderDescriptor` DTO fetched via new `list_llm_providers` command (Task 2 adds a thin `#[tauri::command] list_llm_providers() -> Vec<ProviderDescriptorDto>` returning catalog id/name/kind/keyPrefix/tagline/defaultBaseUrl — serialized camelCase by Tauri, DTO struct in Rust derives Serialize).
- Produces: UI flow — provider list grouped Gateway/Direct/Local → paste key (auto-detect → preselect, Ambiguous → show candidates) → 「验证并加载模型」→ model list (name, context window, price) → click sets `agent.llm.model` + `providerId` + `baseUrl`; key saved via Task 4. Default model row highlighted. Existing temperature/maxTokens/systemPrompt controls stay below. Privacy disclosure line per spec. `advanced` collapsed section: custom baseUrl + manual model (writes key under `llm::custom`).

- [ ] Failing component tests: paste `vck_…` → vercel preselected; paste `sk-…` → ambiguous picker shows OpenAI/DeepSeek; verify success renders model rows and click sets default model; verify failure shows error inline; local provider (Ollama) hides key field.
- [ ] Run → fail (component missing).
- [ ] Implement component; wire into Settings agent tab; remove old fields.
- [ ] Tests green; `pnpm typecheck` clean.

### Task 6: rmcp server scaffold + auth (Rust)

**Files:**
- Modify: `app/src-tauri/Cargo.toml` (rmcp ≥ 1.4.0, features `server`, `transport-streamable-http-server`)
- Create: `app/src-tauri/src/services/mcp/mod.rs`, `server.rs`
- Modify: `app/src-tauri/src/lib.rs` (start server in `run()`), `services/mod.rs`
- Test: `app/src-tauri/src/services/mcp/server.rs` inline tests

**Interfaces:**
- Produces: `pub async fn start_mcp_server(app: AppHandle, pool: SqlitePool) -> Result<u16, String>` — binds 127.0.0.1:0, returns chosen port; persists `{ port, token }` in app_kv under `mcp_server`; Bearer middleware rejects tool calls without stored token (initialize/capabilities exempt per MCP spec); `pub fn mcp_status() -> Option<McpStatus>` (`{ url, token_preview }`) for the settings UI.
- Consumes: app_kv helpers pattern from `date_backfill.rs`.

- [ ] Failing tests: token middleware — request without `Authorization` → 401; wrong token → 401; correct token → passes; persisted state round-trips (port survives "restart" via re-read).
- [ ] Run → fail.
- [ ] Implement scaffold with rmcp; tools registered empty in this task (handshake only); start in `run()` after DB init; log port at info level (never token).
- [ ] Tests green; `cargo build` green.

### Task 7: MCP read tools (Rust)

**Files:**
- Modify: `app/src-tauri/src/services/mcp/server.rs` (or `tools.rs`)
- Test: inline tests with in-memory SQLite pools seeded via sqlx

**Interfaces:**
- Produces: rmcp tools `list_messages`, `get_message`, `search_messages`, `get_contact`, `list_events`, `list_tasks`, `list_follow_ups` with camelCase args (rmcp `#[tool]` macros). DTOs serialized camelCase: `McpMessage { id, subject, fromEmail, fromName, bucket, unread, timelineAt, accountId }` (no body), `McpMessageDetail` (+ body plain text), etc. All reads go through the same SQL the frontend store uses (lightweight projections), reusing `sync_loop`/`db` helpers where practical.
- Consumes: sqlx pool injected at server start.

- [ ] Failing tests (in-memory DB, seeded rows): list_messages filters (bucket/unread/since/limit default 20 max 50); get_message returns body text, omits html unless requested; search finds by subject/body via FTS; get_contact by email; list_events date range; empty results return `[]` not error.
- [ ] Run → fail.
- [ ] Implement tools + SQL.
- [ ] Tests green.

### Task 8: MCP write tools + audit (Rust)

**Files:**
- Modify: `app/src-tauri/src/services/mcp/tools.rs`
- Test: inline tests

**Interfaces:**
- Produces: tools `create_draft`, `create_task`, `create_follow_up`, `create_clip`, `approve_sender`, `block_sender`, `move_messages`. Each validates args (email format for create_draft.to; move_messages ≤ 50 ids; bucket whitelist), executes via the store SQL, inserts `agent_audit` row (`session_id="mcp"`, kind=tool name, payload=json), returns created id JSON.
- Consumes: `drafts` table shape (`id, recipient, subject, body, last_edited, status, account_id`), tasks/follow_ups/contacts upsert SQL patterns from `commands/` and `sync_loop`.

- [ ] Failing tests: create_draft lands in drafts with status draft + audit row; invalid `to` → tool error, no row; move_messages 51 ids → error; bucket "sent" → error; approve_sender flips contact screened=1 default_bucket + audit; block_sender sets blocked=1 + audit.
- [ ] Run → fail.
- [ ] Implement.
- [ ] Tests green.

### Task 9: Client detection + config writer (Rust)

**Files:**
- Create: `app/src-tauri/src/services/agent_clients.rs` (or `mcp/clients.rs`)
- Test: inline tests with temp fixture dirs (env-var override for HOME in tests)

**Interfaces:**
- Produces: `pub struct AgentClient { id: &'static str, name: &'static str, installed: bool, connected: bool }`; `pub async fn detect_clients() -> Vec<AgentClient>` (checks: `~/.claude.json` or `claude` on PATH; `~/.codex/config.toml` or `codex` on PATH); `pub async fn connect_client(id: &str, url: &str, token: &str) -> Result<(), String>` / `disconnect_client(id: &str) -> Result<(), String>`. Writers edit the client config JSON/TOML, marking entries under a `"sendpalm"` key, creating `*.bak-before-sendpalm` on first edit; idempotent re-write; removal restores cleanliness (leaves backup).
- Consumes: `mcp_status()` (Task 6).

- [ ] Failing tests with fixture home dirs: detect finds claude+codex, not workbuddy; connect writes claude entry with url+Bearer header shape; codex TOML shape correct; second connect overwrites not duplicates; disconnect removes only sendpalm entries; backup created once.
- [ ] Run → fail.
- [ ] Implement detection (PATH check via `which`-style search in standard bins) + JSON/TOML writers (minimal hand-rolled editing — serde_json for claude; toml crate only if already in tree, else string-section writer with tests).
- [ ] Tests green.

### Task 10: Settings 「AI Agent 连接」panel + probe (TS)

**Files:**
- Create: `app/src/components/AgentConnectionPanel.tsx`
- Modify: `app/src/views/Settings.tsx` (new section under Agent tab)
- Test: `app/src/components/AgentConnectionPanel.test.tsx`

**Interfaces:**
- Consumes: new commands `detect_agent_clients() -> Vec<AgentClientDto>`, `connect_agent_client(id)`, `disconnect_agent_client(id)`, `mcp_status()`.
- Produces: panel lists detected clients with toggle; connected → green + 「已连接」/probe result; toggle on → connect (status refreshes); off → disconnect; collapsed manual section shows the one-line snippet with current URL+token (masked). Disclosure copy per spec. Note "SendPalm 需要保持运行" line.

- [ ] Failing tests: renders detected clients; toggle calls connect; connected state shows 已连接; manual section reveals snippet.
- [ ] Run → fail.
- [ ] Implement; register Rust commands.
- [ ] Tests green.

### Task 11: CLI + Skill pack installer (Rust)

**Files:**
- Create: `app/src-tauri/src/bin/sendpalm-mcp-cli.rs` (or a `cli` module + cargo bin target `sendpalm`)
- Create: `app/src-tauri/src/services/mcp/skill.rs` (skill assets as `include_str!`)
- Test: inline tests

**Interfaces:**
- Produces: `sendpalm` binary subcommands `mcp-url`, `search <q>`, `list [--unread] [--bucket <b>]`, `read <id>`, `draft --to --subject --body [--reply-to <id>]`, `tasks` — reads `<app_data>/mcp.json` (path via env `SENDPALM_APP_DATA` override for tests) for url+token, calls the MCP HTTP endpoint JSON-RPC directly (tiny hand-rolled client, no new deps). `pub fn install_skill(target: &str) -> Result<PathBuf, String>` writes SKILL.md + `scripts/sendpalm-*` wrappers into `~/.claude/skills/sendpalm/` (target `claude`) or codex skills dir; `uninstall_skill` removes. SKILL.md content: when to use, etiquette (draft-first, Gate, user timezone, Chinese labels), examples.
- [ ] Failing tests: CLI arg parsing; skill install creates files idempotently; uninstall removes; SKILL.md mentions draft-first and every v1 tool name.
- [ ] Run → fail.
- [ ] Implement CLI (clap only if already in tree — otherwise hand-rolled arg match) + skill installer + assets.
- [ ] Tests green.

### Task 12: One-click toggle installs skill too (wire-up)

**Files:**
- Modify: `app/src-tauri/src/services/agent_clients.rs` (connect also calls `install_skill`), Task 10 panel copy
- Test: connect_client test asserts skill dir populated; disconnect leaves skill (documented: removal is manual from the skill dir) — pin that.

### Task 13: E2E + live verification + final gates

**Files:**
- Create: `app/e2e/agent-gateway.spec.ts`
- Modify: `docs/PROGRESS.md`

- [ ] E2E (browser mode): settings agent tab — paste key flow against stubbed `llm_list_models`; provider list renders 10 entries grouped; agent connection panel lists a fixture client and toggle writes config (dev-mode shim writes into a temp dir); MCP endpoint handshake via `fetch` from the page context.
- [ ] Live check (local, gitignored .env): `llm_list_models` with the user's `vck_` key returns a non-empty model list from Vercel AI Gateway; record result in PROGRESS (no key value).
- [ ] Full gates: `cargo test`, `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `git diff --check`; Playwright suite.
- [ ] PROGRESS.md update with the three shipped capabilities and verification.
