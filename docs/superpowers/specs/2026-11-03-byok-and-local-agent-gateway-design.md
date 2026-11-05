# SendPalm BYOK Providers + Local Agent Gateway (MCP) + Skill Pack

Date: 2026-11-03 · Status: approved by user ("开工吧，以你推荐的为准")

## Intent

Two workstreams that turn SendPalm from "an email client with AI" into "the
local email workspace that any AI agent can work with":

1. **BYOK provider catalog** — Settings → Agent gains a mainstream-provider
   picker (gateways + direct vendors + local) with paste-key detection,
   verify-and-load-models, and keychain storage. Port of the design already
   shipped in the sibling product iBridge (`ProviderCatalog.swift`), adapted
   to SendPalm's stack.
2. **Local Agent Gateway** — an MCP server embedded in the SendPalm app
   (Streamable HTTP on 127.0.0.1) exposing the user's *screened* mailbox to
   AI agents (Claude Code, Codex, WorkBuddy), plus one-click client
   configuration and a SendPalm Skill pack (SKILL.md + thin scripts + a
   `sendpalm` CLI) so that even agents without MCP still work.

The differentiator: agents connecting through SendPalm see the user's
*triaged* mailbox (Gate-screened, bucketed, task-extracted), not raw IMAP.

## Current state (verified in code)

- `AppSettings.agent.llm`: `{ baseUrl, apiKey, model, temperature, maxTokens,
  systemPrompt }` — three hand-typed fields; apiKey is plaintext in the
  tauri-plugin-store JSON. Settings UI at `src/views/Settings.tsx` (~line 1829).
- `src-tauri/src/services/llm.rs` — OpenAI-compatible chat completion
  (`chat_complete`), single-shot, no model listing.
- `src-tauri/src/services/vault.rs` — OS-keychain get/set/delete keyed by
  account id; already used for email passwords. Reused for the LLM key.
- `agent_audit` table exists (AgentAudit subsystem) — write operations from
  the gateway are recorded there.
- No MCP/gateway/skill/CLI code exists.

## Workstream 1 — BYOK provider catalog

**Provider catalog (hard-coded; models always fetched live):**

| id | name | kind | keyPrefix | defaultBaseURL | listPath | listFormat |
|---|---|---|---|---|---|---|
| openrouter | OpenRouter | gateway | `sk-or-` | https://openrouter.ai/api/v1 | /models | openRouter |
| vercel | Vercel AI Gateway | gateway | `vck_` | https://ai-gateway.vercel.sh/v1 | /models | openAI |
| openai | OpenAI | direct | `sk-` | https://api.openai.com/v1 | /models | openAI |
| anthropic | Anthropic | direct | `sk-ant-` | https://api.anthropic.com/v1 | /models | anthropic |
| groq | Groq | direct | `gsk_` | https://api.groq.com/openai/v1 | /models | openAI |
| deepseek | DeepSeek | direct | `sk-` | https://api.deepseek.com/v1 | /models | openAI |
| xai | xAI | direct | `xai-` | https://api.x.ai/v1 | /models | openAI |
| mistral | Mistral | direct | — | https://api.mistral.ai/v1 | /models | openAI |
| ollama | Ollama | local | — | http://127.0.0.1:11434 | /api/tags | ollama |
| lmstudio | LM Studio | local | — | http://127.0.0.1:1234/v1 | /models | openAI |

(Source: iBridge `ProviderCatalog.swift`, shipped and field-tested. Google
is deliberately excluded — its `/v1beta/models` shape needs its own adapter;
follow-up.)

**List-format adapters** (Rust `services/llm.rs` extension):
- `openAI`: `{ data: [{ id, owned_by }] }`
- `openRouter`: `{ data: [{ id, name, context_length, pricing }] }` — carries
  name/context/pricing; richest display.
- `anthropic`: `{ data: [{ id, display_name, max_input_tokens }] }` — request
  needs `x-api-key` + pinned `anthropic-version: 2023-06-01` header.
- `ollama`: `{ models: [{ name }] }`.

Normalized model DTO: `{ id, displayName, contextWindow?, inputPricePerM? }`.

**Key detection:** prefix match against catalog; ambiguous prefixes (`sk-`
matches openai/deepseek) present a disambiguation choice, ordered as the
catalog. Local providers have no key.

**Flow (Settings → Agent → 模型来源):** paste key → detect source →
**验证并加载模型** (new Tauri command `llm_list_models` with a connectivity
test) → model list rendered (name, context window, price hints) → tap to set
default model + provider/baseUrl. Key is written to the keychain under
`llm::<providerId>`; only providerId/model/baseUrl/temperature/etc. persist
in app settings. The existing three hand-typed fields are replaced by this
flow; an "高级：自定义 OpenAI 兼容端点" escape hatch remains for
self-hosted endpoints.

**Privacy copy** (placed at the opt-in surface, per iBridge lesson):
"提问内容会直连你选择的提供商，不经过 SendPalm。"

**Web-search record (2026-11-03):** Vercel AI Gateway is OpenAI-compatible
at `https://ai-gateway.vercel.sh/v1` (`vck_` keys, `/models` lists routed
models). DeepSeek `https://api.deepseek.com/v1`. Both verified against
current docs; iBridge catalog double-confirms shapes.

## Workstream 2 — Local Agent Gateway

### Transport & server

- **Streamable HTTP MCP server embedded in the app**, bound to
  `127.0.0.1` on an ephemeral port, single endpoint `/mcp`.
- Rust SDK: `rmcp` (official MCP Rust SDK) with `server` +
  `transport-streamable-http-server` features, **pinned ≥ 1.4.0**
  (RUSTSEC-2026-0189: pre-1.4.0 Streamable HTTP transport lacked an
  allowlist validation).
- MCP spec revision: 2026-07-28 (current; stdio + Streamable HTTP are the
  two standard transports; legacy HTTP+SSE deprecated).
- The app prints/exposes the effective URL in Settings; the port is persisted
  in app_kv so restarts keep it stable for already-written client configs.

### Auth

- Pairing token: generated on first enable (256-bit), stored in app_kv,
  passed as `Authorization: Bearer <token>`.
- Every tool call without the token → JSON-RPC error. Token is never logged.

### Tool surface (v1)

Read-mostly (the default agents will use):

- `list_messages` — filters: bucket, unread_only, from, since, until, limit
  (default 20, max 50). Lightweight rows (no body).
- `get_message` — full row; `body` plain text preferred; `bodyHtml` omitted
  by default (param `include_html` for the rare case).
- `search_messages` — query + filters over the FTS index.
- `get_contact` — by email or id: identity, company, stage, history counts.
- `list_events` — range query.
- `list_tasks` / `list_follow_ups` — open items.

Writes (draft-first, audited):

- `create_draft` — to/subject/body/cc/bcc/inReplyTo. Lands in Drafts; the
  human sends from SendPalm. **v1 has no `send_email`.**
- `create_task` / `create_follow_up` — reuses the Task/FollowUp models.
- `create_clip` — text snippet attached to a message.
- `approve_sender` / `block_sender` — Gate decisions; audited.
- `move_messages` — ids + whitelisted bucket
  (imbox/feed/paperTrail/trash/spam); audited.

Explicitly **not** in v1: `send_email`, `delete_message` (physical),
`body_html` raw output, settings mutation.

Every write tool: validates args, executes through the existing store
functions, writes an `agent_audit` row (`source: "mcp"`), and returns the
created entity id. Rate/blast-radius guard: `move_messages` caps at 50 ids
per call; `create_draft` refuses `to` addresses that fail a basic format
check.

### One-click client configuration

Settings → 「AI Agent 连接」:

- **Detection** (read-only, on settings open): `claude` / `codex` in PATH,
  `~/.claude.json`, `~/.codex/config.toml`, `~/.config/workbuddy/…`,
  plus existing config entries we previously wrote (marked 已连接).
- **Toggle per detected agent** → SendPalm atomically writes/removes its MCP
  server entry (URL + Bearer token in the client-specific shape; a backup
  copy `.bak-before-sendpalm` is made before first edit). Never shells out
  to client CLIs; direct file edits only.
- **绿灯 state** verified by a real `initialize` handshake probe after
  writing (only when the agent binary is present; otherwise "已配置，
  重启你的 Agent 后生效").
- Undetected agents → collapsed "手动添加" with a one-line snippet to copy.

### Skill pack + CLI (the foolproof layer)

- `sendpalm` CLI (thin Rust binary in the app bundle): `sendpalm mcp-url`,
  `sendpalm search <q>`, `sendpalm list [--unread]`, `sendpalm read <id>`,
  `sendpalm draft --to … --subject … --body …`, `sendpalm tasks`. Talks to
  the app's local endpoint with the pairing token from a well-known config
  file (`<app_data>/mcp.json`, 0600).
- **SendPalm Skill** (`SKILL.md` + scripts wrapping the CLI): installed into
  `~/.claude/skills/sendpalm/`, Codex skills dir, etc. by the same one-click
  toggle. Teaches the agent: when to reach for mail tools, SendPalm
  etiquette (draft-first, respect Gate, dates in the user's timezone,
  Chinese UI labels), and example invocations. Because Skill scripts call
  the CLI, **the skill works even when MCP registration failed** — it is
  the fallback path, not an extra dependency.

## Security model (local-first)

- Loopback-only bind; token pairing; no cloud component anywhere in this
  design. The user's email credentials never leave the keychain — agents get
  tool capability, not credentials.
- All gateway writes audited and visible in the existing AgentAudit view.
- Settings shows a plain-language disclosure: "开启后，你授权的 AI Agent
  可以读写你在这个应用里的邮件数据；邮件内容会进入该 Agent 的上下文，
  并发送到你配置的模型提供商。"

## Goals / Non-goals / Anti-goals

**Goals:** BYOK for mainstream providers incl. gateways; zero-hand-config
agent connection; draft-first agent writes; full audit.

**Non-goals (v1):** cloud/relay gateway (mobile agents), Google provider,
`send_email`, stdio transport binary, multi-user/team tokens, per-tool token
scopes.

**Anti-goals:** anything that emails the user's credentials to a third
party; silent write paths with no audit; requiring users to hand-edit JSON.

## Decisions (builder-check resolutions, delegated to implementer by user)

1. **Anthropic chat adapter is built in v1** — the catalog promises Anthropic,
   so list-only would be a broken promise. `llm.rs` gains an Anthropic
   `/v1/messages` adapter (`x-api-key` + pinned `anthropic-version:
   2023-06-01`), mapped from the same `ChatRequest` shape, stream=false.
2. **Multi-account v1 = merged view.** Tools take no account param; every row
   DTO carries `accountId` where the store already has it so a later
   per-account filter is additive, never a breaking change. Matches the
   SendPalm UI, which is account-merged today.
3. **Legacy plaintext key migrates itself.** When the Agent settings tab
   loads and a non-empty legacy `agent.llm.apiKey` exists, it is moved to the
   keychain under `llm::custom`, the settings field is wiped, and the store
   saved. Covered by a vitest migration test.
4. **"Screened mailbox" is positioning, not enforcement.** Read tools do NOT
   filter by Gate screening — the agent must see unscreened senders to advise
   on them, and `approve_sender`/`block_sender` exist precisely so agents can
   help triage. The positioning means: agents see SendPalm's organized data
   (buckets, piles, tasks, extracted dates), not raw IMAP envelopes.
5. **"App must be running" is an accepted v1 constraint**, stated plainly in
   the connection panel and in the Skill ("SendPalm 需要在运行中"). No
   background daemon. Skill/CLI failures say "打开 SendPalm 后重试".
6. **Skill pack v1 targets Claude Code + Codex**: one canonical SKILL.md plus
   per-agent thin wrappers (frontmatter/discovery-dir differences). WorkBuddy
   and others get the manual-snippet fallback path.

## Verification plan

- Rust: catalog prefix-detection unit tests (incl. ambiguous `sk-`),
  list-format adapter tests with fixture JSON (all four formats), vault
  round-trip for `llm::*` keys, MCP tool tests over an in-memory DB
  (rmcp service test harness), rmcp ≥ 1.4.0 pin in Cargo.toml.
- TS/Vitest: provider catalog parity test against the Rust catalog (single
  source: catalog lives in Rust, TS fetches via command), settings UI flow
  tests (paste → detect → verify → default model), client-config writer
  tests with fixture client dirs (claude/codex shapes, backup + idempotent
  re-write + clean removal).
- E2E (Playwright, browser mode + dev server): the full settings flow with
  a mocked `/models`; MCP handshake + `list_messages`/`create_draft` round
  trip against the running app in dev mode; one-click toggle writes a
  fixture `~/.claude.json`.
- Live check (local only, gitignored `.env`): the user's Vercel test key
  (`vck_…`) verifies the vercel provider end-to-end once. The key is never
  committed, logged, or pasted into source.
