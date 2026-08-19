# SendPalm Roadmap v2 — from "spec done" to "daily driver"

> **Status:** draft 2026-08-19
> **Author:** Mavis
> **Scope:** the gap between prototype-v11.38 feature parity and "actually usable as a real email client"
> **Out of scope:** real OAuth, real LLM, server-side sync, multi-user collab (all in PRD-v1 §12)

## TL;DR

M0–M11 are ✅ (see `docs/PROGRESS.md`). The product is feature-complete against the spec
but **not** daily-driver ready. Three buckets of remaining work:

1. **P0 — Ship-it-this-week** (3–5 days): the 3 user-reported bugs + the 1 known perf cliff that
   every real-mail user will hit
2. **P1 — Real-client essentials** (1–2 weeks): attachments, FTS5 search, inline pile fans,
   IMAP Sent-folder sync
3. **P2 — Polish to launch quality** (2 weeks): calendar visual fidelity, agent full view,
   heuristic pre-routing, multi-select in other views

The first bucket alone is what stands between "demo" and "I open this every morning".

## Definition of "Usable v2"

A person can:

| Capability | Definition |
|---|---|
| Open the app on a fresh Mac | Boots, renders Imbox, no white screen, no console errors |
| Get today's real email | IMAP sync completes without freezing the UI; HTML body renders for ≥ 95% of messages |
| Triage a day's mail | Read-together loop works for every unread, body shows, action bar moves on |
| Reply | Compose opens, pre-fills, sends via real SMTP, lands in Sent |
| File an attachment | Open a message with a PDF/image, see it, save it, attach a file in compose |
| Find an old mail | ⌘K returns the right result in < 200 ms with debounced typing |
| Use it for a week | No freezes, no data loss, no console red |

P0 + P1 together hit that bar. P2 is what makes it feel like a real product vs. a Tauri port
of the prototype.

## Current state vs. usable — gap audit

### What's solid (don't re-touch)

- All 23 views implemented and rendered
- IMAP/SMTP real backend with Feishu account, multi-account loop, OS keychain vault
- SolidJS KeepAlive + lightweight pile query + soft refresh (session 2026-08-17)
- Brand mark + splash + iOS bundle (M11)
- Contact / Company improvements (session 2026-08-18)
- Gate HTML body fix (session 2026-08-18)

### What's broken or missing for "usable"

#### A. P0 — User-reported, this week

| # | Item | Source | Root cause (preliminary) |
|---|---|---|---|
| A1 | Inbox big title misaligned / too far left | user complaint | Need to find the page-title `<h1>` in `Imbox.tsx` (and other views). Topbar title is small; "big title" is in the view body. Likely a `max-width` / `padding` / `margin: 0` / flex issue. |
| A2 | Homepage drag has bugs | user complaint | `DropBar.tsx` line 29 only enumerates `["imbox", "feed", "paperTrail", "trash", "spam"]`. The v10 prototype has 8 drop targets incl. 3 workflow targets (`pending`/`saved`/`remind`). The Tauri app is missing those 3. Also need to check `useDragContext` (in `app/src/utils/drag.ts`) — drag activation threshold, drop target hit-testing, and whether the cursor shows on hover. |
| A3 | "一起读" (Read Together) has bugs | user complaint | `ReadTogether.tsx` line 33 uses `listMessages()` (full `body_html`), not `lightweight: true`. Line 289 renders `current()!.body` (plain text) — but real IMAP mail often has empty `body` and only `body_html` populated, so the card is blank. |
| A4 | Often freezes | user complaint | Multiple suspect paths — needs real profile to find the cliff. Top candidates: `SyncBadge` 10 s `Promise.all`, `NotificationBell` 10 s poll, full-table search, IMAP chunked sync hitting the JS thread, large message parse on click. See "perf hunt" below. |

#### B. P1 — Real-client essentials, next 1–2 weeks

| # | Item | Source |
|---|---|---|
| B1 | Attachment download + preview + compose-attach | PROGRESS.md "Remaining gaps" (post-audit backlog) — MIME parts parsed but bytes not stored; FilePanel shows placeholder, MessagePanel has no attachment cards. |
| B2 | FTS5 search with CJK tokenization | PROGRESS.md 2026-08-04 + 2026-08-04 (late): "no FTS5/CJK index; search loads whole tables into memory". Hits ⌘K palette, topbar live search, Search page — all three. |
| B3 | Piles as inline fans, not modals | PROGRESS.md 2026-08-04 (late-night): "Reply Later / Set Aside / Remind are modal lists rather than the prototype's inline fan-style piles". |
| B4 | IMAP Sent-folder sync | PROGRESS.md 2026-08-04 (late-night): "only messages sent from the app are saved locally. Mail sent from other clients is not pulled via IMAP Sent folder." |

#### C. P2 — Polish, 2 weeks

| # | Item | Source |
|---|---|---|
| C1 | Calendar day/week/year fidelity (hero card, freetime strips, multi-day arcs) | PROGRESS.md "Remaining gaps" 2026-08-04 + 2026-08-04 (late-night) |
| C2 | Agent full view (not side panel) | PROGRESS.md 2026-08-04 (late-night): "Agent chat simulates a response" + "Agent memory editor: read-only" |
| C3 | Heuristic pre-routing (newsletters → Stream, receipts → Records) | PROGRESS.md 2026-08-04 (late-night) |
| C4 | Multi-select in Stream/Records/Trash/Spam and for bundles | PROGRESS.md 2026-08-04 (late-night) |
| C5 | Label/Move keyboard shortcuts actually fire (currently toast) | PROGRESS.md 2026-08-04 (late-night) |
| C6 | Agent memory editor (per-contact CRUD) | PROGRESS.md 2026-08-04 (late-night) |

### Perf hunt (parallel to A1–A3)

Need a profile run to find the specific cliff. Until I have one, my best guesses are:

1. **Search** — ⌘K / topbar / Search page all load whole tables. With 3900+ real Feishu messages
   this is the most likely "freezes when I type" cause. Fixed by B2.
2. **Topbar poll storm** — `SyncBadge` and `NotificationBell` each run a 10 s `createResource` /
   `setInterval` that re-fetches. Cheap per-call but runs forever. Fixed by replacing with the
   existing `sync-events` Tauri event bridge.
3. **Click-to-open** — MessagePanel probably calls `getMessage(id)` which is full SELECT including
   `body_html` (80 KB). With 50 messages in view and the user rapidly j/k-ing, the
   `prependByIds` / `refetch` pattern from 8/18 helps but doesn't eliminate the parse cost.
   Consider: lazy HTML body parse on first frame, not on list load.
4. **IMAP sync** — the 8/18 fix made the loop walk UIDNEXT correctly, but the per-message
   parse + insert still happens synchronously. The `async-imap` callbacks fire on the Tokio
   runtime; the SQLite writes need to be batched. Check whether sync is blocking the UI thread
   or just being perceived as slow.

## Phased plan

### Phase 1 — Ship-it-this-week (3–5 days)

**Goal:** the 3 user-reported bugs + the perf cliff. After this, the user can re-open the
app and say "ok, the obvious stuff works".

| Day | Task | Verification |
|---|---|---|
| 1 | A1 — fix big title alignment in Imbox + other views | Visual diff vs. prototype-v11; desktop + tablet + mobile screenshots |
| 1 | A2 — add 3 missing workflow drop targets (`pending`/`saved`/`remind`) in `DropBar.tsx`; audit `useDragContext` for threshold + cursor | Manual drag test in browser + iPad sim |
| 2 | A3 — switch `ReadTogether` to `lightweight: true`; render `body_html` via the sanitized iframe helper; show snippet preview | Manual test with a real IMAP account |
| 2–3 | A4 — profile the freeze path: add a temp `console.time` around the suspect areas (search, sync poll, message click); reproduce; pick the worst one and fix | Recorded before/after timings |
| 3–5 | A4 (continued) — fix the worst perf cliff: most likely B2-style FTS5 stub OR poll-storm replacement with event bridge | Per-feature perf measurement |

**Hard rules for this phase** (from AGENTS.md §3):

- One logical change per commit, conventional prefix
- Reuse the existing `emailBodyPreview()` helper, `lightweight: true` option, `softRefreshTick`,
  and `sync-events` event bridge — no new patterns
- Every view must keep its empty / loading / error states after the change
- No `any` in TypeScript
- Mobile + iPad breakpoint verified per change

### Phase 2 — Real-client essentials (1–2 weeks after Phase 1)

B1 → B4, in that order. Each is a multi-day subtask with its own brief:

- B1 attachments: parse + store MIME bytes, MessagePanel attachment cards, FilePanel real
  viewer, Compose attach
- B2 FTS5 search: schema migration for `messages_fts`, async rebuild on message insert,
  `searchMessages` IPC, ⌘K + LiveSearch + Search page consume it
- B3 pile fans: prototype-aligned inline fans below Imbox list, click to expand, drag
  message into them
- B4 Sent-folder sync: extend the sync loop to subscribe to a configurable Sent folder
  per account, dedupe against the local `direction='out'` copies

### Phase 3 — Polish (2 weeks)

C1 → C6. Order by user-visible impact:
- C4 multi-select (visible on every list view)
- C3 heuristic pre-routing (visible every sync)
- C1 calendar fidelity (the only view that still feels like a flat list)
- C5 shortcut wiring (invisible until you try)
- C2 agent full view (deferred until LLM is real)
- C6 agent memory editor (deferred until C2)

## What we are NOT doing in v2

- ❌ Real OAuth flows (out of scope per PRD-v1 §12)
- ❌ Real LLM in Agent (out of scope; Agent stays a structured workflow tool)
- ❌ Server-side sync / push
- ❌ E2E encryption, on-device embeddings
- ❌ Microsoft Graph / Slack / WeChat integrations
- ❌ Calendar / contacts integration with the OS

These remain explicitly deferred. Adding them would shift v2 into v3.

## Verification gate (end of Phase 1)

Before declaring "daily driver":

- [ ] `pnpm typecheck` ✅
- [ ] `pnpm test` ✅ (no new failures; new tests for the 3 bug fixes)
- [ ] `pnpm lint` ✅
- [ ] `pnpm e2e` ✅ (no regressions; add one for the new drop targets)
- [ ] `cargo test` ✅
- [ ] Manual real-mail run: open app, sync Feishu, triage 10 unread via Read Together,
      drag a message from Imbox to Pending, search for a sender, attach a file, send. No freezes,
      no console errors, every action completes in < 1 s.
- [ ] iPad mini breakpoint passes (per AGENTS.md §9 DoD)
- [ ] iPhone SE breakpoint passes
- [ ] `docs/PROGRESS.md` updated with the Phase 1 changelog

## Open questions for the user (decide before Phase 1 starts)

1. **Perf profile: which path freezes for you?** I can guess but I'd rather know. Is it on
   app start? Click a message? Type in search? During sync? If you can describe the exact
   reproduction, A4 will land in hours instead of days.
2. **A2 drag targets — match prototype or simplify?** Prototype has 8 (5 bucket + 3 workflow).
   We can ship all 8, or start with the 5 buckets and add workflow in a separate pass. I'd
   recommend all 8 since the spec is the source of truth.
3. **A1 title — can you point me at the view?** "Big title not aligned, too far left" — is
   this the Inbox page H1 (which I'd expect to be inside `Imbox.tsx`), or something else?
   A 5-second screenshot would pin this.

## What I will do on your go-ahead

1. Create a worktree `feat/v2-phase1-ship-it`
2. Fix A1, A2, A3 in three separate commits (one bug per commit, per AGENTS §3.5)
3. Run the full verification gate
4. If A4 is one of the top 3 guesses, fix it in commit 4
5. Update `docs/PROGRESS.md` and `AGENTS.md §11.4` with new lessons
6. Push the branch and merge per your call

Estimated: 3–5 days, ~4 commits, ~600 lines of changes.
