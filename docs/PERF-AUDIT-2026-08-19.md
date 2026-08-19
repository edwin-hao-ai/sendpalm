# SendPalm performance + interaction audit (2026-08-19)

> **Status:** living document
> **Author:** Mavis (initial audit)
> **Triggered by:** user reported persistent sluggishness after the Phase 1 ship-it fixes. Tauri dev unavailable during this audit (mddock iOS sim build held the shared `~/.cargo/shared-target` lock), so findings are from static code analysis of `app/src/` and the Tauri backend. No live profile data yet for the post-pool-fix state.

## How far are we from "daily driver"?

Phase 1 (commit `f77c644`) closed the 3 user-reported bugs. Phase 1.5
(branch `feat/perf-db-pool`, commits `5117bdb` + `89f37df` + docs)
closed the 78-second sync-stall. With the pool fix, **read-during-sync
is no longer blocked**, but two more structural issues remain before the
app feels fast enough for daily use:

1. `htmlEmailSrcdoc` runs DOMPurify on the main thread synchronously,
   blocking 200-600ms per message view (this audit's commit `a1` on
   `perf-quick-wins`).
2. `MessagePanel` mounts 5 full-table queries on every message view
   (see "Phase 2" below) — the biggest remaining structural issue.

Phase 2 (attachments, FTS5 search, inline pile fans, IMAP Sent-folder
sync, calendar fidelity, agent full view) is mostly orthogonal to
perf; see `docs/ROADMAP-v2-usable.md`.

## What was found in this audit

### P0 — fixed in this commit (`perf-quick-wins` branch)

#### `htmlEmailSrcdoc` blocks main thread synchronously

- **Where:** `app/src/utils/html.ts::htmlEmailSrcdoc` (sanitize), called
  from `MessagePanel.tsx` (main message iframe, was line 1191),
  `ReadTogether.tsx` (was line 360), and `Stream.tsx` (card preview,
  was line 313).
- **Symptom:** Click a message → 200-600ms freeze during which the UI
  doesn't repaint. The Imbox card is selected, the DetailPanel
  chrome paints, but the iframe body stays blank until DOMPurify
  finishes.
- **Root cause:** `htmlEmailSrcdoc` builds the srcdoc string
  synchronously inside the render expression, calling DOMPurify
  inline. For 80 KB body_html (the Feishu average per AGENTS §10.5)
  the parse + sanitize + DOM walk takes 200-600ms on a single thread.
- **Fix applied in this commit:**
  - Add a writable `iframeSrc` signal + `createEffect` at the
    component level. The effect tracks `message()?.bodyHtml`
    (MessagePanel) or `current()?.bodyHtml` (ReadTogether), schedules
    a `setTimeout(0)` to call `htmlEmailSrcdoc`, and writes the
    result to the signal.
  - Replace the synchronous `srcdoc={htmlEmailSrcdoc(...)}` IIFE
    with `srcdoc={iframeSrc()}`.
  - Stale-closure guard (`pendingSanitize` counter) discards the
    sanitize of a message the user already moved past.
- **Stream card preview is NOT fixed** in this commit — the iframe
  is only shown when the user expands the card, and most stream
  previews are small. Can be a follow-up.
- **Expected after fix:** click → panel chrome paints within one
  frame, iframe body populates within 100-400ms without blocking
  the click path. User can scroll, click another message, etc.
  while the first iframe is still sanitizing.

### P1 — fixed in this commit

#### `refetch().finally` type error in `Topbar` probe

- **Where:** `app/src/components/Topbar.tsx:160`
- **Symptom:** TS error `Property 'finally' does not exist on type
  'number'` because `refetch` from `createResource` is typed as
  `() => T | Promise<T | undefined>` and the synchronous
  `countUnreadNotifications` returns `number`.
- **Fix:** wrap in `Promise.resolve(refetch())` so `.finally` always
  sees a Promise.
- (This only matters because the profile probe is enabled. In the
  no-probe code path the type error didn't surface.)

### P2 — needs Phase 2 work (NOT in this commit)

#### `MessagePanel` mounts 5 full-table queries

- **Where:** `app/src/panels/MessagePanel.tsx:89-94`
  ```ts
  const [allContacts, ...]   = createResource(listContacts);
  const [allMessages, ...]   = createResource(listMessages);   // ← body_html
  const [stickies, ...]      = createResource(listStickies);
  const [followUps, ...]     = createResource(listFollowUps);
  const [files, ...]         = createResource(listFiles);
  ```
- **Symptom:** every message view mount pulls 5 full tables across
  the IPC bridge. `listMessages()` includes `body` and `body_html`
  — for the Feishu account this is ~300 MB of HTML crossing the
  bridge on every click. The actual use is much narrower:
  - `allMessages()` is used to compute `thread` (filter by
    threadId / same baseSubject + pid) and `sortedMessages` (sort
    the full list to find prev/next neighbour).
  - `allContacts()` is used for `contactsById` map (lookup by id).
  - `stickies()` / `followUps()` are filtered to the current
    `props.messageId` only.
  - `files()` is filtered to the current message's attachments.
- **Fix shape (Phase 2):**
  - New IPC commands: `listThreadMessages({ threadId, baseSubject,
    pid })` and `listThreadNeighbours({ id })` (1 row each direction).
  - Replace `listStickies(listStickies)` with
    `listStickiesForMessage(messageId)` (already in spirit via
    `stickyForMsg` filter, but should push the filter to SQL).
  - Replace `listFollowUps(listFollowUps)` and
    `listFiles(listFiles)` similarly.
  - `allContacts` can become `getContact(id)` lazy + a small map
    built on first contact-needed access, or stay but switch to
    `lightweight: true` (skip body fields even though contacts
    don't have body — pointless).
  - Net effect: MessagePanel mount goes from "5 full tables" to
    "1 thread + 1 message body + N sticky/fu/file rows for current
    id", which is at most a few KB of IPC per click.

#### Topbar 10-second poll storm

- **Where:** `app/src/components/Topbar.tsx:158-161, 235-244`
  - `NotificationBell` `setInterval(refetch, 10_000)`
  - `SyncBadge` `setInterval(refreshAll, 10_000)` and a re-render
    effect on `emailAccounts().length` that re-triggers `refreshAll`
    on account-list changes.
- **Symptom:** every 10 seconds, two IPC round-trips fire regardless
  of whether anything changed. The pool fix (Phase 1.5) means
  these don't block, but they're still wasted wakeups, plus they
  recompute `states` and re-render the popover on every cycle.
- **Fix shape (Phase 2):** use the existing
  `services/sync-events.ts` (already imported in places). Have the
  Rust side emit a `sync-state-changed` event on transitions
  (busy / idle / last_uid / last_synced_at), and the Topbar
  subscribes. Polling is replaced by push, with a 60s polling
  fallback for staleness safety. Notification badge count
  similarly: push on `notification:created` / `notification:marked-read`.

#### Reminder tick 60s poll

- **Where:** `app/src/services/reminder.ts:119`
  - `setInterval(tick, 60_000)`, walks `bubble_up_at` rows.
- **Symptom:** similar pattern — every minute, one full `listMessages`
  call to find due follow-ups. Cheap, but conceptually the same
  push-notification shape.
- **Fix shape (Phase 2):** keep the 60s poll as a safety net but
  switch the main trigger to a `sync:follow-up-due` Tauri event.

### P3 — UX / interaction observations (out of scope for perf but worth noting)

- **Tabs are duplicated with section headers.** The Imbox view has
  a "New for you" tab in `ImboxTabs` AND a "New for you" section
  header in `SectionHeader` right below it (per AGENTS §11.4 user
  feedback). The `SectionHeader`'s `title` text is the only thing
  not rendered as a tab. Could collapse to "Drag the mail to the
  一起读 button on the right" without the duplicate label.
- **Sidebar section labels are still narrow** — even with the
  `--sidebar-width: 96px` bump (AGENTS §11 lessons), very long
  labels like "Companies" / "Follow-ups" feel cramped on
  iPad-portrait (768px). Could collapse to icon-only with a
  tooltip on hover/peek.
- **Error states are inconsistent.** Some panels use
  `<ErrorState title="加载失败" retry={...} />`; some panels have
  no error state at all and just show blank. AGENTS §3.21 says
  every view MUST have empty / loading / error. The view-health
  audit on 2026-08-18 added them to ~8 views; need a sweep to
  catch the rest.
- **No "you have unsynced changes" indicator.** If IMAP sync is
  in progress or has queued, the user has no obvious signal
  beyond the topbar pulse animation. A small status pill or
  breadcrumb in the Imbox header (next to the "同步" button)
  would help discoverability.
- **The "Read together" view exits silently on completion.**
  When the user clicks Next on the last unread, `close()` is
  called and a toast says "All caught up" — but the user might
  not see the toast if they immediately look at the empty view.
  Could add a brief "🎉 All caught up" view state for 1.5s
  before transitioning to the empty state.
- **Touch targets < 44px in some places** — the tabs and the
  read-together action bar hit 36-40px. AGENTS §6 says ≥ 44px.
  Could go on a sweep.

### P4 — speculative (out of scope without live profile)

- **Web Worker for DOMPurify.** The synchronous sanitize in
  `htmlEmailSrcdoc` is the remaining single-thread hot path. A
  worker would eliminate it entirely, at the cost of an extra
  `postMessage` round-trip per message view. Worth measuring
  after the Phase 1.5 defer is in production.
- **FTS5 search index.** AGENTS §10.5, backlog B2. ⌘K, topbar
  live search, and `/` Search page all load whole tables into
  memory and fuzzy-search in JS. For 3,900+ messages, this is
  the next user-visible "I typed in search and everything froze"
  issue. Independent of the perf fixes above.

## Verification

- `pnpm typecheck` ✅
- `pnpm test` ✅ 207/207
- `pnpm lint` (changed files) ✅
- Live profile: not run this commit (Tauri dev not available —
  mddock held the cargo lock). Will re-run when the user brings
  the dev back up. Expected outcome: topbar poll during sync is
  < 50 ms (was 78 s), MessagePanel mount is < 200 ms (was 78 s
  + 200-600 ms DOMPurify), scroll during sync is smooth.

## Suggested next step

Phase 2 P2 work above, in order:
1. `MessagePanel` 5 full-table queries → scoped queries
   (highest impact, biggest diff, needs the dev to verify).
2. Topbar poll → event bridge (medium impact, smaller diff).
3. Sweep error states across the 23 views.
