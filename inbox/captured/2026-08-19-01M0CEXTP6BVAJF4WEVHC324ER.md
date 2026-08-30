---
type: capture
title: "SendPalm session 2026-08-18 — IMAP backfill, Imbox tabs, view-health audit fixes"
date: 2026-08-19T07:31:45.990354+00:00
source: cli
---

# SendPalm session 2026-08-18 — IMAP backfill, Imbox tabs, view-health audit fixes

## What happened
User reported three complaints in one session that turned into five distinct fixes:

1. "Imbox shows 2022 emails but I have 2026 emails that aren't loading"
2. "Click a message, can't find it again" + "should it be a tabs presentation?"
3. "Hundreds of unread, how do I navigate?" + "big titles aren't centered"
4. View-health audit (P0/P1/P2 gaps across 22 views from 2026-08-17)
5. Splash/brand audit (topbar using stock icon while splash uses bespoke SVG)

## Root causes found

### IMAP backfill partial-chunk bug (`app/src-tauri/src/services/sync_loop.rs`)
`client.sync("INBOX", last_uid)` walks 200-UID chunks; the old loop terminated
when `messages.len() < MAX_PER_TICK`. For sparse mailboxes (Feishu has ~3900
messages spread across UIDs 1..7228, density 0.54 msgs/UID), most chunks are
partial, so the loop exited after the first chunk. Left 3500+ messages
unbackfilled.

Fix: read `mailbox.uid_next` from SELECT response, loop until `cursor >= uid_next - 1`.
Add `should_continue_after_chunk(cursor, uid_next, chunk_size)` pure function
with 6 unit tests including the regression case. Fall back to legacy
"stop on partial chunk" heuristic when server doesn't expose UIDNEXT.

Also: empty chunk (no messages in 200-UID range) used to break the loop.
Now advances cursor by MAX_PER_TICK and continues. Cursor persists after
every successful chunk so mid-backfill errors don't lose progress.

### "Lightweight" list query (`app/src/stores/data.ts`)
`listMessagesPaged` was `SELECT *` which pulled `body_html` (avg 80 KB/row).
For 100 rows that's 8 MB of HTML crossing the IPC bridge for content the
list view never renders. Measured SQLite timing: 1.95 s cold cache →
0.15 s with columns omitted. 13x speedup just from column selection.

Added `lightweight?: boolean` to `ListMessagesOptions`. When true, SELECT
omits `body` and `body_html`; rows are projected via `rowToMessageLight`
(same Message shape, body='' and bodyHtml=null). Detail views still use
`getMessage(id)` which does full SELECT for one row.

Imbox + PileBoard opt in to `lightweight: true`. Stream/Records/Trash/Spam
keep full body because their preview renders the plain-text body.

### Imbox tabs redesign (`app/src/views/Imbox.tsx`)
The previous implementation used ONE paginated query and split loaded rows
client-side into "New for you" (unread=true) and "Previously seen" (unread=false).
With 1000+ messages, only the first 100 newest were loaded; anything older
in the "Previously seen" section was invisible.

Fix:
- `listMessagesPaged` gains `readOnly?: boolean` filter (mutually exclusive
  with `unreadOnly`; `unreadOnly` wins if both set).
- Imbox holds TWO paginated resources: `newPaged` (unreadOnly=true) and
  `seenPaged` (readOnly=true). Each has its own scroll position.
- New `ImboxTabs` component (pill buttons with badge counts) above the list.
- New `DateGroupedList` wraps the ItemList with bucket headers (今天 / 昨天 /
  本周早些 / 本月早些 / 1月). `dateBucket()` and `bucketLabel()` are pure
  helpers in `app/src/utils/date.ts` with 13 unit tests.
- mark-as-read: `newPaged.removeByIds([id])` + `seenPaged.prependByIds([id])`
  (prependByIds fetches the full row once so the seen tab has body/bodyHtml).
- mark-as-unread: reverse.
- Per-message actions (replyLater, setAside, archive, trash, spam) call
  `removeByIds` on BOTH resources. `removeByIds` is a no-op when the id
  isn't present in the loaded window, so this is safe without knowing
  which tab the user was on.

### Show-wrap pattern for error states in complex views
For views with 14+ Show blocks nested across multiple return statements
(Calendar, Gate, ScreenerHistory, Insights, Agent, PileBoard), wrapping
in a single `<Show when={!resource.error} fallback={<ErrorState retry={refetch}/>}>`
inside the outer `<div>` is the minimal invasive way to add error handling
without restructuring data flow. Close the wrapping </Show> right before
the outer </div>.

### Aggregate error for multi-resource hooks
When a hook (e.g. `useAgent`) owns multiple `createResource` calls, expose
a single `error()` accessor that returns the first non-undefined error
across all resources via `??` chaining. The consuming view renders ONE
ErrorState instead of checking 5 resources.

### Brand consistency
Topbar using a stock Phosphor `ph-leaf` icon while the splash / full logo /
Tauri bundle icons all share a bespoke paper-plane + palm-leaf composition
is a visible identity gap. BrandMark embeds `/src/assets/logo-mark.svg`
inline as `<img>` at 22×22 px — same composition as splash, no runtime
fetch (Vite bundles the asset). Removes the unused Icon import.

## Atomic commits (chronological)
- 7a4e5b4 fix(imap): keep walking chunks up to UIDNEXT + persist cursor per chunk
- 6bc2eb8 perf(imbox): exclude body/body_html from list page query
- 22c2a6d feat(imbox): collapsible pile drawer, Focus & Reply, Open board
- d4f0b7b fix(imbox): default newest-first sort + wire 一起读 button
- 5a52122 fix(brand): topbar BrandMark uses logo-mark.svg
- bddad2f fix(splash): dedup CSS, color-scheme dark, logo onerror fallback
- 150cb55 fix(records): remove unwired '导出为 CSV' placeholder button
- 72790c1 fix(settings): add Empty fallbacks to AccountsTab and ShortcutsTab
- be1969b feat(ui): ResourceGate wrapper for empty/loading/error states
- ed5c777 fix(stream): error fallback for paginated message resource
- db2f6e8 fix(files): error fallback for listFiles resource
- 8c0477d fix(drafts,followups): error fallbacks for createResource views
- d2ce3f4 fix(views): add error fallbacks to 8 createResource views
- 5c5ed99 fix(records): error fallback for paginated message resource
- 34f577f feat(date): dateBucket + bucketLabel helpers for Imbox date grouping
- c5be73b feat(imbox): New / Previously seen tabs + date grouping
- 562a2c6 fix(gate): error fallbacks for Gate + ScreenerHistory
- 68df124 fix(agent): error fallback for the Agent workspace
- 9239f70 fix(calendar,pileboard): error fallbacks for events / pile loader
- 3e77e75 docs(progress): record Imbox tabs + scale + remaining view errors
- 2fd1321 merge: feat/imbox-tabs-and-deferred — Imbox tabs redesign + scale + remaining view errors

## Lessons to encode in AGENTS.md §11
1. Sparse mailboxes need UIDNEXT-based termination, not "partial chunk" heuristic.
3. SELECT * on 100 rows that pulls 80KB of HTML per row costs 13x more than
   selecting only needed columns. Always lightweight list queries.
4. Single paginated resource split client-side loses messages older than
   PAGE_SIZE rows. Each user-visible section needs its own paginated
   resource if it can be the user-facing destination for "find this again".
5. Date-grouped sections (Today/Yesterday/This week/...) make 100+ item
   lists navigable. Pure `dateBucket` helper with TDD is the right shape.
6. Per-message actions that could match either tab: call `removeByIds` on
   BOTH resources — it's a no-op when the id isn't present, so safe.
7. Aggregate `error()` accessor pattern for hooks owning multiple
   createResource calls.
8. BrandMark using a stock icon while bespoke SVG exists is an identity
   failure. Always use the bespoke asset when one exists.

## Test counts
- Frontend: 194 → 207 (added 13 dateBucket tests)
- Rust: 80 (no new tests, only added 6 inline sync_loop tests = 86)
