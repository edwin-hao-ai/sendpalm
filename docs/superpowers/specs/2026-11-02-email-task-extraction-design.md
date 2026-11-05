# Inbox Email-to-Tasks Design

## Intent

Let SendPalm turn concrete commitments in email into useful tasks without treating AI output as fact. Existing tasks are user-owned records; extracted suggestions remain drafts until reviewed and confirmed. Preserve the existing Mail screen, MessagePanel, Markdown/HTML rendering, Gate behavior, and Follow-ups reminder flow.

## What Exists Today

- SQLite `tasks`, `TaskPanel`, and ContactPanel's Tasks tab already support formal task CRUD. `Task` has title, due date, status, priority, contact/event links, and notes, but no source-message or commitment-direction field. There is no top-level Tasks list view.
- `follow_ups` are date-based reminders linked to messages; they are not business tasks.
- `agent_tasks` represent Agent execution progress; they are not user commitments.
- `MessagePanel` can create a manual Follow-up. The app already has an OpenAI-compatible `agentChat` call, a keychain-backed API key, and a `sync:new-messages` event containing newly inserted message IDs.
- `Gate.tsx` approves a first-time sender and moves its messages into a chosen bucket; the inline first-sender action in Inbox is a second approval path.

## Goals

- Add a real Tasks view that lists formal tasks and a separate queue of AI suggestions awaiting review.
- Automatically extract only new inbound messages that have passed Gate into Inbox, and only after the user explicitly enables the task-extraction pipeline with a configured model.
- Let the user manually request extraction from any locally available open email, including historical or sent mail. This explicit action does not require automatic extraction to be enabled.
- Confirmation promotes an editable suggestion to a formal task with a source-message link; dismissal never creates a task.
- Preserve existing task records, Follow-ups, email rendering/detail behavior, and route IDs.
- Use “Inbox” for user-visible labels while preserving the internal `imbox` view and bucket identifiers.

## Non-Goals

- No automatic backfill or scan of the existing mailbox.
- No task auto-creation, sending, or other side effects without human confirmation.
- No replacement or redesign of MessagePanel, Follow-ups, existing task CRUD, or the app shell.
- No new LLM provider, dependency, or server-side service.
- No changes to Agent's internal `agent_tasks` execution records.

## Approaches

1. **Separate persisted extraction suggestions, promote on confirmation — selected.** Keep `tasks` as the formal record and store model output in a review queue tied to its source message. This preserves the AI-draft/trusted-task boundary and supports restart-safe review.
2. **Reuse `follow_ups`.** Rejected because Follow-ups represent reminder timing/status, not a titled commitment with direction and source evidence.
3. **Insert directly into `tasks` and let the user undo.** Rejected because an unreviewed model guess becomes a trusted task.

## User Flow

### Automatic extraction

1. Settings → Agent adds an **Auto-extract tasks from new Inbox emails** toggle. It defaults off. Turning it on records an enabled-at timestamp; turning it off pauses future work. Re-enabling does not backfill older mail.
2. When enabled, the sync event hands the extractor only the newly inserted message IDs. The extractor accepts only inbound messages routed to Inbox from a screened, non-blocked contact, with a message timestamp at or after the enabled-at timestamp.
3. When a user approves a Gate sender into Inbox (including the inline first-sender action), queue only the message currently displayed in Gate if the same eligibility conditions pass. Do not process every older message moved with that sender. Approval into Stream/Records, blocking, Spam, Trash, outbound mail, and unscreened senders do not trigger automatic extraction.
4. Persist extraction-run rows as a durable queue so queued work can resume after restart while the toggle remains on. Before sending each request, re-check the toggle, enabled-at timestamp, Inbox bucket, inbound direction, and screened/non-blocked sender. Turning the toggle off marks unsent queued runs skipped; an already in-flight request cannot be recalled, but its response is discarded if the pipeline is now disabled. Re-enabling skips runs whose message timestamp predates the new enabled-at time.
5. One run per source message: `queued`, `processing`, `pending_review`, `no_tasks`, `failed`, `reviewed`, or `skipped`. No automatic retries. A user may retry a `failed` run manually; `no_tasks`, `pending_review`, and `reviewed` results do not issue another request from the same button.

### Manual extraction

- Add an **Extract tasks** action to the existing MessagePanel More menu. It operates on only the open message, even if it is historical or sent. The user's click is the explicit content-sharing action.
- Automatic extraction may be disabled and manual extraction still works, but a model must be configured. Without a model or Tauri runtime, show an explanation and create no fake suggestion.
- If a source message already has a run, open its saved result instead of spending tokens again. Only a failed run can be manually retried in this version; `no_tasks` and reviewed results do not re-run.

### Extraction contract and token bounds

- Use the existing `agentChat` and configured compatible model. Do not send API keys in the request body except through the existing secure backend bridge; never log keys or message content.
- Input contains one message's direction, mailbox/account email, sender/recipients, subject, received timestamp, and plain text only. This gives the model enough perspective to distinguish “I owe” from “the other person owes” without sending thread history or unrelated contacts. Use `htmlToPlainText` for HTML-only messages; exclude attachments and thread history.
- Bound input to a named 12,000-character maximum and output to at most 3 suggestions / 512 completion tokens per message. Process the queue serially. These are implementation defaults chosen to bound token spend; no whole-mailbox backfill.
- Parse and validate structured JSON. Candidate fields: title, optional notes/evidence excerpt, optional due date, priority, and direction (`mine`, `theirs`, or `unclear`). Do not invent a due date when none is explicit. Invalid output is a failed run, not a suggestion.
- Associate a candidate with the source message's existing contact when available. No full email body is copied into the suggestion table; the source message remains authoritative.

## Data and UI

- Add nullable `related_message_id` and commitment `direction` (`mine`/`theirs`) to existing `tasks`; existing manually created tasks remain valid with both fields absent.
- Add a per-message `task_extraction_runs` table and normalized `task_suggestions` rows. Run state is `queued`, `processing`, `pending_review`, `no_tasks`, `failed`, `reviewed`, or `skipped`; suggestion status is `pending`, `accepted`, or `dismissed`. Retain the accepted task ID for idempotent confirmation.
- Confirming a suggestion creates a normal `Task` (`todo`, default `normal` priority) linked to the source message and contact. Use a stable task ID derived from the suggestion so a retry cannot create a duplicate. Mark the suggestion accepted only after the upsert succeeds. Dismissal creates no task.
- Add a `Tasks` view using existing design tokens/components. It lists formal tasks by commitment direction/status, puts existing tasks with no direction in an “未分类” section, and places pending AI suggestions in a separate review section with source link, edit, confirm, and dismiss actions. The existing Follow-ups view remains a sibling route in the Tasks workspace.
- TaskPanel remains the existing detail UI; add a source-email link only when `relatedMessageId` exists.
- MessagePanel only gains the additive More-menu action; leave its iframe, HTML sanitizer, Markdown/plain-text fallback, and layout unchanged.
- Add a per-pipeline setting with a backward-compatible false default for existing preference files. Keep model credentials in the current OS-keychain path.
- Rename visible “Imbox” labels/copy to “Inbox” throughout the app and relevant tests. Keep `imbox` route, SQL bucket value, CSS/test IDs, and internal function/file names stable.

## Reliability and Privacy

- Use the existing sync event IDs and scoped message/contact queries. Do not call full-table `listMessages()` in a sync loop or background tick.
- Queue only after Gate eligibility; the user-facing manual action may explicitly process the currently opened message.
- Persist suggestions and run status locally so pending review survives restart. If the source message is deleted, the suggestion is removed or renders a safe unavailable-source state.
- No model configured or extraction toggle off means no automatic network call. All AI output remains an isolated suggestion until the user confirms it.
- Manual extraction is an explicit per-message user action and may process any locally available message, including sent mail or messages outside Inbox. It still requires a configured model, sends only that message, and never changes the automatic eligibility rules.

## Verification

- Unit tests for response validation, empty/invalid model results, due-date/direction parsing, body bounds, deduplication, and idempotent promotion.
- Store/migration tests for old task rows, nullable source/direction fields, extraction-run states, suggestions, and retry/dismiss/confirm behavior.
- E2E tests for auto extraction after Gate, Inbox eligibility filters, no-BYOK/no-toggle behavior, manual historical extraction, source linking, confirm/dismiss, and existing Follow-ups/TaskPanel flows.
- Run existing Mail/MessagePanel HTML and Markdown rendering tests, Gate tests, backup/restore tests, and responsive navigation tests.
