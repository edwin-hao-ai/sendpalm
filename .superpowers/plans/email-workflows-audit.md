# Plan — Email workflow audit & hardening

## Goal
Ensure SendPalm behaves as a real email client across the core mail user
journeys: calendar invites, reply/forward, Gate first-sender screening,
Reply Later / Set Aside / Bubble Up, and contact-centric indexing. Surface
and fix real functional gaps, then cover the workflows with automated
end-to-end tests.

## Global Constraints
- Do NOT add new external dependencies without web-search justification.
- Match the existing code style (SolidJS + vanilla CSS, no Tailwind).
- Keep changes minimal; do not refactor unrelated code.
- All TypeScript changes must pass `pnpm typecheck` and `pnpm lint`.
- All Rust changes must pass `cargo fmt --check && cargo clippy -- -D warnings && cargo test`.
- Browser-mode Playwright tests must remain deterministic and headless.
- Do not commit `.env`, screenshots, or build artifacts.

## Task 1 — Fix message persistence and compose gaps

Fix three concrete bugs found in code review:

1. `app/src/stores/data.ts` `upsertMessage` does not persist `calendar_json`,
   even though the table has the column (migration `0002_calendar.sql`) and
   `rowToMessage` reads it. Add `calendar_json` to the INSERT/UPDATE column
   list and parameter array so calendar invites survive any frontend write
   (e.g. marking unread, Reply Later, Set Aside, moving buckets).

2. `app/src/compose/Compose.tsx` `buildDraft` builds the quoted original
   body from `m.body` only. When a message has only `bodyHtml`, the quote
   block is empty. Extract plain text from `bodyHtml` as a fallback (strip
   tags is sufficient) and include it in the quote.

3. `app/src/panels/MessagePanel.tsx` renders the "Sticky notes" section
   header even when there are no stickies because the Show condition is
   `stickyForMsg().length > 0 || true`. Change to `stickyForMsg().length > 0`.

After the edits, run:
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test` (FE unit tests)

Report the exact file/line changes and test output.

## Task 2 — Add Playwright E2E coverage for email workflows

Extend `app/e2e/views.spec.ts` (or add a dedicated
`app/e2e/workflows.spec.ts`) with browser-mode tests that seed minimal
contact/message/event data through the existing frontend data layer and
exercise these workflows:

1. **Gate flow**: seed one unscreened contact + message, navigate to
   `/screener`, approve to Imbox, assert the message appears in Imbox.
2. **Reply flow**: open a message, click Reply, assert the Compose modal
   recipient matches the sender and the subject is prefixed with `Re:`.
3. **Forward flow**: open a message, click Forward, assert the subject is
   prefixed with `Fwd:` and the quote contains the original body text.
4. **Calendar invite flow**: seed a message with `calendarInvite`, open it,
   click "添加到日历", and assert the event appears in the Calendar view.
   Because browser mode returns `null` for `add_calendar_event`, mock the
   Tauri invoke handler in the test page so the event is written into the
   local data store.
5. **Reply Later / Set Aside**: from Imbox row actions or message detail,
   mark a message Reply Later and Set Aside, then assert the piles render
   the message.

Use stable `data-testid` or `aria-label` selectors where the UI lacks them;
add those attributes in the source files as part of this task. Keep tests
headless and deterministic. Run `pnpm e2e` and report results.

## Task 3 — Run full verification matrix

After Tasks 1 and 2 are reviewed and clean, run the complete verification
matrix from AGENTS.md and report results:

1. `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test`
2. `cargo fmt --check && cargo clippy -- -D warnings && cargo test`
3. `pnpm e2e`
4. `scripts/verify-ios.sh`

Update `docs/PROGRESS.md` with a short paragraph and the pass counts.

## Task 4 — Thread-first message detail + view-mode toggle

Refactor `app/src/panels/MessagePanel.tsx` to match the prototype-v11
thread-first layout and add the missing `Rendered / Source / Plain` body
toggle.

### Requirements

1. **Thread-first layout**: the detail panel is a thread, not a single
   message. Keep the existing contact/subject hero but render the whole
   thread (`threadMessages()` + current message) as a vertical list of
   message cards.
2. **Message cards**: each card shows sender avatar, name, email, time,
   and body. The current message is expanded by default; older messages
   are collapsed to a 1-line preview unless the thread has ≤3 messages or
   the user clicks to expand.
3. **Collapse / expand**: clicking a collapsed card expands it; clicking
   an expanded non-current card collapses it. Track expanded state in a
   local signal (`Set<string>` of message ids).
4. **View-mode toggle**: add a segmented control in the panel header with
   three modes:
   - **Rendered** (default): show HTML body in an iframe when `bodyHtml`
     exists, otherwise plain text paragraphs.
   - **Plain**: always show `body` as plain paragraphs.
   - **Source**: show the raw message as a `<pre>` block combining
     `From`, `To`, `Subject`, `Date`, and the raw body text.
5. **Move attachments / calendar invite**: render them inside the message
   card they belong to (the current message), not as separate sections
   below the whole panel.
6. **Preserve existing features**: bottom action bar (Reply/Reply
   All/Forward/Later/Save/Remind/Follow-up/Sticky/Clip/More), Sticky
   notes section, Follow-ups section, tracker guard, pull-to-navigate.
7. **Test coverage**: add one Playwright E2E test that seeds a thread
   with 2 messages, opens the detail panel, expands the older message,
   and asserts both bodies are visible. Add a Vitest unit test for the
   source-mode formatter if it is extracted to a pure helper.

### Acceptance criteria
- `pnpm typecheck` and `pnpm lint` pass.
- `pnpm e2e` still passes (existing + new test).
- `pnpm test` still passes.
- The detail panel visually resembles the prototype: thread header with
  participant chips, collapsed previews, expanded bodies, and the three
  view-mode buttons.
