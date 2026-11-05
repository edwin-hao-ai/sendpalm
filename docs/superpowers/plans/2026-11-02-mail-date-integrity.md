# Mail Date Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make inbox chronology reflect actual server receipt time, show sender-declared time separately when useful, and format dates in the user's configured timezone.

**Architecture:** Preserve the existing `st`/`tm` wire fields for compatibility, add nullable `sent_at` and `received_at` storage, and fetch IMAP `INTERNALDATE` plus `ENVELOPE` without changing body parsing or sync cursors. A bounded metadata-only backfill repairs dates for existing IMAP rows; shared TypeScript helpers format and group mail dates using `profile.timezone`.

**Tech Stack:** Existing Rust/Tauri 2, async-imap, SQLite migration runner, SolidJS/TypeScript, Vitest, Rust unit tests, Playwright. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-02-app-wide-ui-and-mail-date-integrity-design.md` — date behavior and reliability sections.

## Global Constraints

- Do not edit the prototype or change the `imbox` route/bucket IDs.
- Keep current `st` and `tm` response fields; do not claim legacy `tm` is a real local-time timestamp.
- New `sent_at` / `received_at` fields are nullable; never fabricate a sender date or server arrival date.
- Inbox sort/group uses `received_at ?? st`; legacy fallback is labeled neutrally and must not use `tm`.
- Use `profile.timezone` for display and day/week boundaries; invalid zones fall back to OS timezone.
- Metadata repair requests only UID, ENVELOPE, and INTERNALDATE; it never downloads message bodies or modifies read state, bucket, or normal UID sync cursors.
- All credential resolution stays in the existing OS keychain path; never log or expose secrets.

## Review Focus

1. Missing/malformed RFC Date: `sent_at` stays absent, timeline falls back to actual INTERNALDATE, not sync time. Test in parser/sync mapping.
2. Device timezone differs from profile timezone, including DST and UTC day-boundary crossings. Test in date utilities and Playwright.
3. Sparse UID ranges, empty chunks, restart, and UIDVALIDITY changes during metadata backfill. Test cursor progress and idempotency without affecting sync cursors.
4. Legacy rows with only `st`/`tm` and locally-created messages with no IMAP identity. Test neutral fallback and no accidental update.
5. Missing keychain password or server date: show stale/unknown status; never claim the mailbox is current. Test state mapping and UI.

---

### Task 1: Parse sender date separately from IMAP receipt date

**Files:**
- Modify: `app/src-tauri/src/services/parser.rs`
- Modify: `app/src-tauri/src/services/imap.rs`
- Test: `app/src-tauri/src/services/parser.rs` (unit tests)
- Test: `app/src-tauri/tests/mail_date_test.rs`

**Interfaces:**
- `ParsedMessage.sent_at: Option<DateTime<Utc>>` is parsed only from a valid RFC 5322 `Date` header; missing/invalid headers return `None`, never `Utc::now()`.
- Add `FetchedMessage { uid: u32, parsed: ParsedMessage, received_at: Option<DateTime<Utc>> }`.
- `SyncBundle.messages: Vec<FetchedMessage>`.
- `ImapClient::sync()` requests `(FLAGS UID ENVELOPE INTERNALDATE BODY.PEEK[])`; maps `msg.internal_date()` to UTC `received_at`.

- [ ] Add Rust tests for valid offsets normalizing to UTC, missing Date, malformed Date, INTERNALDATE present/missing, and retaining UID with parsed result.
- [ ] Run the focused Rust tests and verify the missing/malformed Date case fails against the current `Utc::now()` fallback.
- [ ] Implement optional sender date parsing and the fetched-message DTO; preserve `BODY.PEEK[]` behavior and the existing UID-range protocol.
- [ ] Run focused Rust tests; verify no parser path invents a sender timestamp.

### Task 2: Persist both dates without breaking existing rows

**Files:**
- Create: `app/src-tauri/migrations/0025_message_sent_received_dates.sql`
- Modify: `app/src-tauri/src/lib.rs`
- Modify: `app/src/types/index.ts`
- Modify: `app/src/stores/data.ts`
- Modify: `app/src/services/mock-db.ts`
- Test: `app/src/stores/message-dates.test.ts`
- Test: `app/src-tauri/tests/mail_date_migration.rs`

**Interfaces:**
- `Message.sentAt?: ISODate | null` maps to `sent_at`.
- `Message.receivedAt?: ISODate | null` maps to `received_at`.
- Migration adds nullable `sent_at` and `received_at` plus an index supporting `COALESCE(received_at, st)` list ordering. It does not rewrite `st`, `tm`, content, or flags.
- New sync rows set compatibility `st = sent_at ?? received_at`; legacy rows are not rewritten. `upsertMessage` persists both fields; `rowToMessage`, `rowToMessageLight`, and pile/message projections map missing legacy columns/values to `undefined`.
- Email list/thread queries sort by `COALESCE(received_at, st)` where chronological order is intended; date-history lookups remain tied to their selected message timestamp.

- [ ] Add store/migration tests for legacy rows, both timestamps round-tripping, nullable dates, and chronological ordering with mixed old/new rows.
- [ ] Run focused tests and confirm they fail because the columns and mappings are absent.
- [ ] Add/register migration 0025 and update the mock DB, message DTO mapping, upsert, and scoped order-by queries.
- [ ] Run focused Rust and Vitest tests; verify pre-existing task/message content and unread flags are unchanged by migration.

### Task 3: Add timezone-aware date presentation helpers

**Files:**
- Create: `app/src/utils/message-dates.ts`
- Test: `app/src/utils/message-dates.test.ts`
- Modify: `app/src/utils/date.ts`

**Interfaces:**
- `messageTimelineAt(message: Pick<Message, "st" | "receivedAt">): string` returns `receivedAt ?? st`.
- `formatMessageDate(message, timezone, mode)` returns a typed presentation with a primary label/value and optional secondary sent/received value; legacy rows use neutral `邮件时间` labeling.
- `localDateKeyInZone(iso, timezone)` and `dateBucketInZone(iso, timezone, now)` use IANA timezone calendar boundaries; invalid timezone falls back to the runtime zone.
- `formatMessageDate` never reads `tm`.

- [ ] Add tests for `Asia/Shanghai` vs OS timezone, UTC midnight crossings, DST, invalid zone, sent/received distinction, and legacy fallback.
- [ ] Run focused date tests and verify they fail for offset/profile-zone mismatch.
- [ ] Implement pure helpers using `Intl.DateTimeFormat`; no date dependency.
- [ ] Run focused tests and existing `date.test.ts` / `date.ts` coverage.

### Task 4: Backfill IMAP dates using bounded metadata-only requests

**Files:**
- Create: `app/src-tauri/src/services/date_backfill.rs`
- Modify: `app/src-tauri/src/services/mod.rs`
- Modify: `app/src-tauri/src/services/imap.rs`
- Modify: `app/src-tauri/src/services/sync_loop.rs`
- Test: `app/src-tauri/src/services/date_backfill.rs` (unit tests)

**Interfaces:**
- `ImapClient::fetch_date_metadata(mailbox, uid_range)` returns `DateMetadataRow { uid, sent_at: Option<DateTime<Utc>>, received_at: Option<DateTime<Utc>> }` from `(UID ENVELOPE INTERNALDATE)` only.
- `backfill_missing_message_dates(...)` scans every already-synced IMAP folder, reconstructs existing `imap_<account>_<folder>_<uid>` IDs, and updates only existing rows with missing date fields.
- Progress is stored per account/folder using existing `app_kv` helpers; at most 200 UID values are requested per account/folder per sync-loop pass. Terminate with UIDNEXT, advance across empty sparse ranges, and resume after restart.
- UIDVALIDITY changes reset only this backfill cursor; normal folder sync cursors are never modified.

- [ ] Add tests for sparse ranges, empty chunks, restart position, UIDVALIDITY reset, idempotent updates, and non-IMAP IDs remaining untouched.
- [ ] Run focused Rust tests and verify they fail for the missing backfill worker.
- [ ] Implement metadata fetch and a separately persisted bounded cursor; do not request BODY or ENVELOPE body content.
- [ ] Run Rust tests and inspect the FETCH query assertion to confirm it contains no body section.

### Task 5: Use correct dates throughout mail UI and Inbox bundles

**Files:**
- Modify: `app/src/views/Imbox-helpers.ts`
- Modify: `app/src/views/Imbox.tsx`
- Modify: `app/src/views/Stream.tsx`
- Modify: `app/src/views/FocusReply.tsx`
- Modify: `app/src/views/ReadTogether.tsx`
- Modify: `app/src/views/PileBoard.tsx`
- Modify: `app/src/panels/MessagePanel.tsx`
- Modify: `app/src/panels/ContactPanel.tsx`
- Modify: `app/src/panels/CompanyPanel.tsx`
- Modify: `app/src/stores/data.ts`
- Test: `app/src/views/Imbox.test.ts`
- Test: `app/src/panels/MessagePanel.test.ts`
- Test: `app/e2e/workflows.spec.ts`

**Interfaces:**
- All email date labels use `formatMessageDate` and `appSettings.profile.timezone`; no email view renders `m.tm` directly.
- Inbox sorting/grouping uses `messageTimelineAt`.
- Bundle children: most recent 7 local calendar days grouped day-by-day; older messages grouped Monday–Sunday by week; each row shows an unread marker and date.
- Opening unread preserves detail and scroll/focus; the row moves to Read. The expanded bundle remains open while unread siblings remain; the group leaves New after its last unread child.

- [ ] Add component tests for day/week group boundaries, unread count updates, opened-row removal, expanded-group retention, and last-unread behavior.
- [ ] Run focused Inbox/MessagePanel tests and confirm the new date grouping/transition cases fail.
- [ ] Replace raw `tm` display paths with timezone-aware helpers and preserve existing email body/rendering paths.
- [ ] Add responsive E2E assertions for local date labels, detail sent/received labels, and stable New-to-Read behavior.
- [ ] Run focused E2E at 375/820/1440px.

### Task 6: Explain mailbox freshness and missing credentials in the UI

**Files:**
- Modify: `app/src-tauri/src/services/state.rs`
- Modify: `app/src-tauri/src/services/sync_loop.rs`
- Modify: `app/src-tauri/src/commands/mod.rs`
- Modify: `app/src/services/backend.ts`
- Modify: `app/src/components/Topbar.tsx`
- Modify: `app/src/views/Settings.tsx`
- Test: create `app/src/components/Topbar.test.tsx`
- Test: `app/src/views/Settings.test.ts`

**Interfaces:**
- Extend `AccountSyncState`/`SyncStateDto` with a stable status (`never_synced`, `syncing`, `connected`, `needs_credentials`, `error`) and sanitized user-facing error code; display strings never include credential values.
- The user can navigate directly from the stale/error status to Settings → Accounts.
- `get_sync_state` returns the last successful sync, not the last failed attempt; if no success exists it returns `never_synced`, not the Unix epoch as a plausible date.

- [ ] Add tests for no saved password, no successful sync yet, stale last sync, and successful sync.
- [ ] Run focused tests and confirm the stale/missing-credential explanation is absent.
- [ ] Implement a concise, actionable status; do not emit a toast every poll interval.
- [ ] Run focused tests and Topbar/navigation E2E.

### Task 7: Final integration gates

**Files:**
- Modify: `docs/PROGRESS.md`
- Modify: `app/e2e/views.spec.ts`
- Modify: `app/e2e/workflows.spec.ts`

- [ ] Run all Rust unit tests with `RUSTUP_TOOLCHAIN=stable cargo test --manifest-path src-tauri/Cargo.toml` from `app/`.
- [ ] Run `pnpm test`, `pnpm typecheck`, `pnpm lint`, and `pnpm build` from `app/`.
- [ ] Run supported Playwright suites; report live IMAP tests skipped when credentials are absent.
- [ ] Run `git diff --check`; verify `.mddock/**`, the prototype, email body HTML/Markdown rendering, and credentials are untouched.
- [ ] Update progress with actual verification and any backfill still pending due to unavailable account credentials.
