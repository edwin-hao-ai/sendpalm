# Inbox Email-to-Tasks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn commitments in newly received or explicitly selected emails into reviewable task suggestions, and create formal Tasks only after user confirmation.

**Architecture:** Reuse the existing SQLite `tasks` table and `TaskPanel` for confirmed tasks. Add a separate, persisted per-message extraction-run queue plus suggestion rows; use the existing OpenAI-compatible `agentChat` bridge for BYOK/local-model requests. A new lazy-loaded Tasks view reviews suggestions and lists formal tasks; existing Follow-ups remains a distinct reminder view.

**Tech Stack:** SolidJS, TypeScript, SQLite through `tauri-plugin-sql`, current Tauri `agentChat`, Vitest, Playwright; no new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-02-email-task-extraction-design.md`

## Global Constraints

- AI output is a draft; it must not become a formal Task until the user confirms it.
- Automatic extraction is opt-in, uses the existing model configuration, and only processes new inbound Inbox mail from screened/non-blocked senders after the enable timestamp.
- Historical or sent messages are processed only after an explicit per-message manual action.
- Do not scan the full `messages` table or include attachments/thread history; use message IDs and bounded projections.
- Preserve the existing MessagePanel HTML/Markdown rendering, detail UI, Follow-ups reminder behavior, and all existing view IDs.
- Keep API keys in the existing OS keychain flow; no new dependency or backend provider.
- User-visible “Imbox” is called “Inbox”; the internal `imbox` route and bucket stay unchanged.
- The prototype file is out of scope and must not be edited.

## Review Focus

- **No-BYOK path:** no model request and no fake suggestions; manual Tasks and existing Follow-ups remain usable.
- **Gate eligibility:** automatic processing excludes unscreened/blocked senders, non-Inbox buckets, and outgoing messages; Gate approval only queues the displayed message.
- **Token bounds:** one message only, plain text only, bounded input/output, serial queue; no old-mail backfill.
- **Duplicate/retry behavior:** one extraction run per source message; confirmation is idempotent; only failed runs may be manually retried.
- **Persistence compatibility:** old Task rows/settings load with nullable source/direction and extraction default off; deleted source messages do not crash TaskPanel or Tasks view.

---

### Task 1: Persist task provenance and extraction review state

**Files:**
- Create: `app/src-tauri/migrations/0024_email_task_extraction.sql`
- Modify: `app/src-tauri/src/lib.rs`
- Modify: `app/src/types/index.ts`
- Modify: `app/src/stores/data.ts`
- Test: `app/src/stores/data.test.ts`

**Interfaces:**
- Add `TaskDirection = "mine" | "theirs"` and optional `Task.relatedMessageId` / `Task.direction`.
- Add `TaskExtractionRunState = "queued" | "processing" | "pending_review" | "no_tasks" | "failed" | "reviewed" | "skipped"`.
- Add `TaskSuggestionDirection = TaskDirection | "unclear"` and `TaskSuggestionStatus = "pending" | "accepted" | "dismissed"`.
- Add `TaskExtractionRun` keyed by `sourceMessageId` and `TaskSuggestion` rows keyed by stable IDs and linked to their source message/run.
- Store functions must include bounded `listPendingTaskSuggestions(limit = 100)`, `listQueuedTaskExtractionRuns(limit = 25)`, source-message lookup, run upsert/status update, suggestion upsert/status update, and existing-task upsert with optional message source/direction.

- [ ] Write failing store tests for nullable Task source/direction round-trip, run/suggestion insert/list/update, and the pending/queued limits.
- [ ] Run the focused `data.test.ts` cases and confirm they fail because the new fields/queries are missing.
- [ ] Add migration 0024 for nullable Task source/direction fields and extraction-run/suggestion tables with the specified status checks and indexes; register it after migration 0023.
- [ ] Add typed row mappings and bounded SQL functions in `stores/data.ts`; preserve existing Task CRUD behavior for rows without the new fields.
- [ ] Run the focused store/migration tests and confirm they pass.

### Task 2: Implement bounded extraction, BYOK opt-in, and new-mail queueing

**Files:**
- Create: `app/src/utils/task-extraction.ts`
- Test: `app/src/utils/task-extraction.test.ts`
- Create: `app/src/services/task-extraction.ts`
- Test: `app/src/services/task-extraction.test.ts`
- Modify: `app/src/types/index.ts`
- Modify: `app/src/stores/ui.ts`
- Modify: `app/src/stores/data.ts`
- Modify: `app/src/services/sync-events.ts`
- Modify: `app/src/App.tsx`
- Modify: `app/src/views/Settings.tsx`
- Test: `app/src/views/Settings.test.ts`
- Modify: `app/src/views/Gate.tsx`
- Modify: `app/src/views/Imbox.tsx`

**Interfaces:**
- `parseTaskExtractionResponse(raw, context) -> ParsedTaskSuggestion[]` validates JSON, direction, due dates, and candidate count.
- `extractTasksForMessage(messageId, mode: "automatic" | "manual") -> Promise<ExtractionResult>` uses `agentChat` and the existing LLM configuration.
- `startTaskExtractionService() -> cleanup` consumes new-message IDs and resumes persisted queued runs only while automatic extraction is enabled.
- Add `agent.autoExtractTasks` (default `false`) and `agent.taskExtractionEnabledAt` (nullable ISO timestamp); normalize old settings on load.
- Add a `registerNewMessages(handler)` bridge for bounded sync IDs; queue events that arrive before the extractor registers.

- [ ] Write parser tests for valid multi-candidate output, empty/no-task output, malformed JSON, unclear direction, explicit vs. missing due dates, and body/candidate bounds.
- [ ] Run parser tests and confirm they fail because the parser is absent.
- [ ] Implement the pure parser with named limits: 12,000 input characters, at most 3 suggestions, and at most 512 completion tokens per message; pass only one message's metadata/plain text, no attachments or history.
- [ ] Write service tests for no-model/no-toggle, eligible inbound Inbox + screened sender, Gate/Spam/Trash/outgoing exclusions, enable timestamp, event deduplication, interrupted queue recovery, no-task runs, and manual failed-run retry.
- [ ] Run service tests and confirm they fail because extraction orchestration is absent.
- [ ] Implement sequential, idempotent extraction using `agentChat`; persist `no_tasks`/failed state so sync retries do not spend tokens repeatedly.
- [ ] Add the default-off Settings toggle and enable timestamp; disabling skips unsent queued work, re-enabling does not backfill older mail.
- [ ] Start the service after bootstrap; wire sync events and Gate/inline Inbox approvals. Automatic Gate approval processes only the currently displayed message and only when it is approved into Inbox.
- [ ] Re-run parser/service/settings tests and confirm they pass with no request in browser/no-BYOK mode.

### Task 3: Add Tasks review/list UI and manual extraction action

**Files:**
- Create: `app/src/views/Tasks.tsx`
- Test: `app/src/views/Tasks.test.tsx`
- Modify: `app/src/components/Main.tsx`
- Modify: `app/src/stores/ui.ts`
- Modify: `app/src/utils/labels.ts`
- Modify: `app/src/components/Sidebar.tsx`
- Modify: `app/src/panels/MessagePanel.tsx`
- Modify: `app/src/panels/TaskPanel.tsx`
- Test: `app/src/panels/MessagePanel.test.ts`
- Modify: `app/e2e/views.spec.ts`
- Modify: `app/e2e/workflows.spec.ts`

**Interfaces:**
- Add the `tasks` `ViewName`, lazy route, and Tasks group default; retain `followUps` as a sibling route.
- `Tasks` loads formal tasks and pending suggestions via bounded store queries, displays `mine` / `theirs` / `unclassified` groups, and handles loading/error/empty states.
- Suggestion cards expose source navigation, editable title/due/direction, confirm, and dismiss. Confirm promotes with a stable Task ID and source message link.
- MessagePanel More menu exposes manual extraction for the open message; no changes to body rendering or existing controls.
- TaskPanel adds an optional “source email” link for tasks with `relatedMessageId`; old tasks render unchanged.

- [ ] Write Tasks view tests for mixed existing tasks, pending suggestions, no-BYOK state, empty/error states, confirm/dismiss, and direction review before confirming.
- [ ] Run the focused Tasks view tests and confirm they fail because the view is absent.
- [ ] Implement the lazy Tasks view using existing design tokens, `ResourceGate`, `TaskPanel`, and current list/detail patterns.
- [ ] Add the manual MessagePanel action and source link as additive controls; keep current MessagePanel DOM/render path intact.
- [ ] Write E2E tests for manual historical extraction, opening source email, confirming one suggestion, and preserving existing Follow-ups/MessagePanel behavior.
- [ ] Run the focused E2E tests at desktop and mobile widths.

### Task 4: Regression gates and docs

**Files:**
- Modify: `app/e2e/navigation.ts`
- Modify: `app/e2e/views.spec.ts`
- Modify: `app/e2e/workflows.spec.ts`
- Modify: `docs/PROGRESS.md`

- [ ] Verify view route/navigation tests still expose the existing Inbox and Tasks group without changing other route IDs or keyboard shortcuts.
- [ ] Run `cd app && pnpm test`.
- [ ] Run `cd app && pnpm typecheck`, `pnpm lint`, and `pnpm build`.
- [ ] Run the full supported Playwright suite; report live Feishu or native-only tests skipped by environment explicitly.
- [ ] Review `git diff --check` and confirm `prototypes/sendpalm-suite.html`, MessagePanel HTML/Markdown rendering, existing views, and IPC were not modified except the additive manual task action and optional source link.
- [ ] Update `docs/PROGRESS.md` with the Tasks feature and final verification counts.
