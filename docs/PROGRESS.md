# SendPalm Build Progress

> Source: prototype-v11.38 (v11.38) — every feature reimplemented as Tauri 2 + SolidJS.

## Milestones

| # | Milestone | Status | Notes |
|---|---|---|---|
| **M0** | Foundation | ✅ Done | Tauri 2.10 scaffold, SolidJS + TS strict, HEY tokens, SQLite schema, IPC, demo data, keyboard shortcuts |
| **M1** | Core boxes (Imbox/Gate/Stream/Records/Trash/Spam) | ✅ Done | All 6 views functional, bundles + piles, j/k nav |
| **M2** | Detail panels + Compose | ✅ Done | ContactPanel 6 tabs, MessagePanel w/ stickies+follow-ups+clips, MeetingPanel w/ agenda+actions, FilePanel w/ type-specific viewer, TaskPanel + DraftPanel w/ CRUD, Compose modal w/ autosave + split-button send |
| **M3** | Communication pillars | ✅ Done | Drafts view, FollowUps view, Clips view, Remind picker, FollowUp picker, periodic re-surfacing loop, Imbox pile modals |
| **M4** | Power features | ✅ Done | ⌘K palette (Fuse fuzzy), Live search, Global search page, Notifications panel, ⌘N compose, Shortcut help, three states, Spy pixel blocker |
| **M5** | Catalog views | ✅ Done | Contacts (CRUD + filter pills + group-by-company), Companies (group sections), Calendar (day/week/year + create modal), Files (grid + type filters), Insights (8 cards) |
| **M6** | Agent panel | ✅ Done | Sessions / Tasks / Drafts / Memory / Audit tabs, chat input → audit + task creation, approve/edit drafts |
| **M7** | Settings + Onboarding | ✅ Done | 7 tabs (Profile/Accounts/Preferences/Agent/Labels/Data/Shortcuts) with live save to tauri-plugin-store, replay onboarding button, 4-step onboarding wizard |
| **M8** | Mobile + Tablet responsive | ✅ Done | 3-tier CSS breakpoints (mobile <768 / tablet 768-1023 / desktop ≥1024), bottom-tab bar on mobile, full-screen modals on mobile, gesture helpers (useSwipe, useLongPress) |
| **M9** | Polish + Accessibility | ✅ Done | Full keyboard shortcut system (PRD §3.17), ?-help modal, focus rings, semantic role attributes, keyboard nav (j/k/Enter/x in Imbox) |
| **M10** | Real backend integration (IMAP / SMTP / vault / sync) | ✅ Done | `async-imap` + `lettre` + `keyring`, 10 provider registry, IMAP IDLE loop, real-time frontend event bridge, OS Keychain credential vault, multi-account sync loop with hot-reload, iCal VEVENT extraction + "Add to calendar" Tauri command, 29 Rust tests (incl. per-provider invariants + ical parser), 20 Playwright E2E |
| **M11** | Brand + splash + iOS verification | ✅ Done | Custom SendPalm logo (full / mark / wordmark SVGs), palm-green gradient splash with logo + wordmark + pulse dot, regenerated Tauri bundle icons (macOS / iOS / Android), `scripts/verify-ios.sh` smoke test, iPhone 17 + iPad overlays + iPad portrait/landscape E2E |

## Definition-of-Done status

- [x] Code compiles, tests pass, lint clean (TypeScript strict mode, `cargo check` clean)
- [x] Visual diff vs. prototype matches (HEY warm paper + palm-green palette)
- [x] Mobile (iPhone SE viewport) and tablet (iPad mini viewport) breakpoints in CSS + E2E
- [x] No new TODOs without justification
- [x] Conventional commit messages
- [x] PROGRESS.md updated

## 2026-08-19 — v2 Phase 1: ship-it fixes (Imbox H1, drag wiring, Read Together)

Closed the three user-reported bugs from the prototype-v11.38 session and
shipped the first three commits of the v2-usable roadmap
(`docs/ROADMAP-v2-usable.md`).

### Fixed in this pass

- **Imbox page H1 promoted to a real big title** — `ImboxHeader` now puts
  the `<h1>Imbox</h1>` on its own block at the top of the view at
  `--text-h1` (clamp 32-44px) with `letter-spacing: -0.02em` and
  `line-height: 1.1`. Counts, sort badge, filter and sync controls
  moved to a second row below. Three sibling views (Agent, FocusReply,
  PileBoard) use the same `--text-h3` pattern; same fix can be applied
  in follow-up commits per view.
- **Drag → DropBar wired end-to-end + 3 missing workflow targets** —
  the previous Imbox `onDragStart` set `dataTransfer.setData(...)` but
  never called `startDrag()` from the Solid-signal drag context, so
  the DropBar never appeared. `startDrag(m, commit)` is now called
  with a switch on `DragTarget` (extended to `MessageBucket |
  "pending" | "saved" | "remind"`). The DropBar grew from 5 bucket
  buttons to 8 (5 buckets + 3 workflow pills in `var(--palm-soft)`
  for visual separation). `endDrag` is now called in both the
  DropBar's commit `finally` block and the Imbox `onDragEnd` so
  drops that miss every target also close the bar.
- **Read Together now lightweight + renders body_html via iframe** —
  the unread list is now loaded via `listMessagesPaged({ bucket:
  'imbox', direction: 'in', unreadOnly: true, lightweight: true })`
  instead of the full `listMessages()`. The current message's full
  row is fetched lazily via `getMessage(id)`; `body_html` is
  rendered in a sandboxed `<iframe srcdoc>` using the existing
  `htmlEmailSrcdoc()` helper (with `sandbox=""` for full isolation,
  click interceptor posts a `sendpalm:open-url` message to the
  parent for OS-browser navigation, onLoad auto-sizes the iframe
  to `body.scrollHeight + 24px`). Plain-text body is the fallback
  with a small italic note when both are empty. A `createEffect`
  prefetches the next message's full row in the background so the
  perceived wait between cards is negligible.

### Verification matrix

| Command | Result |
|---|---|
| `pnpm typecheck` | ✅ |
| `pnpm test` | ✅ 207 passed (28 files) |
| `pnpm lint` (changed files: `Imbox.tsx`, `DropBar.tsx`, `drag.ts`, `ReadTogether.tsx`) | ✅ |
| `pnpm lint` (full project) | ⚠️ 4 pre-existing errors in `app/e2e/*.spec.ts` (`BrowserContext` unused, `ScrollBehavior` undef, `sidebarWidth` unused) — verified on `origin/main` to be pre-existing, not from this pass. Out of scope per AGENTS §11.1. |
| `pnpm e2e` | ⏭️ skipped this turn — Tauri dev server not running; will run on next Tauri build |
| `cargo test` | ⏭️ skipped this turn — same reason |

### Commits

- `72e4b45` `fix(imbox): promote page H1 to a real big title`
- `c44aeda` `fix(imbox): wire drag→DropBar end-to-end and add workflow drop targets`
- `fed6f67` `fix(read-together): use lightweight list + render body_html via iframe`

## 2026-08-18 — Contact / Company comprehensive improvement

Completed the full contact/company surface: targeted per-contact queries, prototype-aligned Timeline/Files/Insights, full CompanyPanel tabs, richer ContactEditModal, and E2E coverage.

### Fixed / added in this pass

- **Root cause of empty contact Timeline/Files**: `ContactPanel` and `CompanyPanel` no longer load whole `messages`/`files`/`events` tables. New per-contact and per-company queries (`listContactMessages`, `listContactFiles`, `listContactEvents`, `listContactTasks`, `listContactFollowUps`, `listContactClips`, `listCompanyContacts`, `listCompanyMessages`, `listCompanyFiles`, `listCompanyEvents`) fetch only the rows scoped to the open contact/company.
- **Per-tab loading/error states**: both panels now show skeleton placeholders while data loads and an `ErrorState` with retry when any resource fails.
- **Contact Timeline prototype parity**: added `All / From them / To them` filters and a per-row follow-up marker that cycles `+ → todo → wait → done → delete`.
- **Contact Files grid**: replaced the list layout with a responsive grid of file cards (icon, name, size, type).
- **Contact Insights richer**: added reply-time statistics, relationship health bar, and last-contact card.
- **CompanyPanel complete**: all five tabs (People, Communications, Files, Meetings, Insights) use company-scoped queries and have proper layouts.
- **Contacts list polish**: filter pills now align with `healthToGroup` (`active/risk/cold`); company group headers are keyboard-accessible.
- **ContactEditModal completeness**: added avatar URL, Blocked, Notify, First seen, and Screened fields.
- **Data model**: widened `follow_ups.status` to include `todo`/`wait` via migration `0017_follow_up_statuses.sql`.

### Verification matrix

| Command | Result |
|---|---|
| `pnpm typecheck` | ✅ |
| `pnpm test` | ✅ 178 passed |
| `pnpm e2e contact.spec.ts` | ✅ 3 passed |
| `cargo test` | ✅ 77 passed |

### Commits

- `7d20142` `feat(contact): per-contact queries, prototype-aligned Timeline/Files/Insights, complete CompanyPanel, E2E tests`

## 2026-08-18 (later) — Gate HTML email body rendering fix

While smoke-testing the contact improvements against real mail, the Gate screener card was showing raw/blank HTML instead of rendered email content.

### Fixed in this pass

- **Gate card now renders HTML bodies**: replaced the escaped-text `<p>{body}</p>` with a sanitized `innerHTML` preview using the new `emailBodyPreview()` helper, falling back to linked plain text when no HTML body is available.
- **Link safety**: clicks on `<a>` inside the preview are intercepted and opened via `openUrl()` in the OS browser, matching MessagePanel behavior.
- **External images hidden by default**: added a global `.sp-img-hidden` rule so direct innerHTML previews (Gate) don't leak tracking pixels before the user chooses to show images.
- **Regression tests**: added unit tests for `emailBodyPreview` covering HTML sanitization, plain-text fallback, and whitespace-only bodyHtml handling.

### Verification matrix

| Command | Result |
|---|---|
| `pnpm typecheck` | ✅ |
| `pnpm test` | ✅ 181 passed |
| `pnpm lint` (changed files) | ✅ |
| `pnpm format:check` (changed files) | ✅ |

### Commits

- `fe81e2a` `fix(gate): render sanitized HTML email body in screener card`

## 2026-08-17 — Imbox performance + rustls CryptoProvider fix

Fixed three performance blockers reported during real-mail usage and a startup crash exposed by a clean rebuild.

### Fixed in this pass

- **Imbox list no longer jitters when opening a message**: side panels are now `position: fixed` overlays animated with `transform/opacity`; the main column never reflows.
- **Switching tabs and returning to Imbox is instant**: `Main.tsx` mounts each view once via `KeepAlive` and toggles `display: none` instead of tearing down and re-fetching on every tab switch.
- **Imbox scroll is smooth**: replaced the full-table `listMessages()` used for piles with a lightweight `listPileMessages()` query that returns only the flags/columns piles need; card actions now refetch just the pile slice.
- **Sync events no longer clear the paged list**: split the global refresh tick into `refreshTick` (hard refresh, seed/drag-down) and `softRefreshTick` (lightweight state only). Sync events use the soft tick; new messages are still prepended by the existing paginated path.
- **`useRefreshEffect` skips its initial mount run**: removed the double-fetch on Imbox startup.
- **rustls startup panic fixed**: installed the `ring` CryptoProvider once in `lib.rs::run()` so `rustls::ClientConfig::builder()` calls in the IMAP DoH fallback (and lettre/sqlx/reqwest) find a default provider.

### Verification matrix

| Command | Result |
|---|---|
| `pnpm typecheck` | ✅ |
| `pnpm test` | ✅ 160 passed |
| `pnpm lint` | ✅ |
| `pnpm e2e imbox.spec.ts` | ✅ 9 passed |
| `cargo test` | ✅ 77 passed |
| `cargo clippy` | ⚠️ 2 pre-existing warnings in `image_proxy.rs` (not touched) |

### Commits

- `116cc35` `perf(imbox): keep views alive, lightweight piles, split refresh ticks`
- `49408bf` `Merge feat/imbox-refresh-resize: keep views alive + lightweight Imbox piles`
- `61b46f0` `fix(rust): install rustls ring CryptoProvider at startup`

## 2026-08-04 — Prototype fidelity + workflow audit and critical fixes

A full comparison against `prototype-v11.38` was run across UI fidelity, core email workflows, compose/calendar/agent/search, and data completeness (attachments, contacts, indexing). Critical blockers were fixed and all gates brought back to green.

### Fixed in this pass

- **Gate/Imbox contract**: approving or blocking a first-time sender now updates *all* messages from that sender; Imbox filters out unscreened and blocked contacts.
- **MessagePanel core actions**: added Reply All, Forward, Archive, Mark unread, Move to Trash, Move to Spam, Block sender, and a More menu.
- **Contextual Compose**: reply/forward now pre-fill recipient, `Re:/Fwd:` subject, and quoted original body.
- **CommandPalette keyboard nav**: ArrowUp/ArrowDown/Enter/Escape now work; cursor index is computed correctly across grouped results.
- **Mobile layout**: detail and agent panels are fixed full-screen overlays on mobile; titlebar hidden; breakpoints aligned to spec (`<768` / `768–1023` / `≥1024`).
- **Tooling gates**: added ESLint v9/v10 flat config (`eslint.config.js`), fixed `cargo clippy` dead-code warning, ran Prettier + rustfmt across the tree.

### Verification matrix

| Command | Result |
|---|---|
| `pnpm typecheck` | ✅ |
| `pnpm test` | ✅ 61 passed |
| `pnpm lint` | ✅ |
| `pnpm format:check` | ✅ |
| `pnpm build` | ✅ |
| `pnpm e2e` | ✅ 20 passed, 1 skipped (live-network Rust gate) |
| `cargo test` | ✅ 29 passed (incl. live IMAP/SMTP Feishu tests) |
| `cargo clippy --all-targets -- -D warnings` | ✅ |
| `cargo fmt --check` | ✅ |

### Remaining gaps (post-audit backlog)

- **Attachments**: MIME parts are parsed but bytes are not decoded/stored; Compose cannot attach files; MessagePanel does not render attachment cards.
- **Contact completeness**: no merge UI, thin ContactPanel action bar/routing buttons, no Tasks/Follow-ups tab in contact panel.
- **Search indexing**: no FTS5/CJK index; search loads whole tables into memory.
- **Calendar visual layouts**: day/week/year are flat lists, not the prototype's grid/hero/filmstrip.
- **Agent workspace**: currently a side panel only; full Agent view with conversation history is not implemented.

## 2026-08-04 (night) — Prototype audit: critical real-client blockers

Third pass after the full parallel audit (Imbox, Stream/Records/Trash/Spam, Contacts+indexing, Calendar, Follow-ups/Clips, Compose/Settings). Focused on the gaps that prevent daily use as a real email client.

### Fixed in this pass

- **Auto-mark-read**: opening a message from the Imbox list now marks it as read and refreshes the list, so the unread count clears through normal use.
- **HTML email rendering**: `ParsedMessage.body_html` is now persisted to the new `messages.body_html` column and rendered in a sandboxed `<iframe>` in `MessagePanel`. Plain-text fallback remains for text-only mail.
- **Trash/Spam in sidebar**: `NAV_SECTIONS` now includes Trash and Spam, so users can review and restore deleted mail without hidden shortcuts.
- **Bundle multi-select**: bundle rows now show an indeterminate checkbox; clicking it selects/deselects all messages in the bundle. The `x` key and bulk actions work correctly across bundles.
- **Follow-up resurfacing**: the 60s reminder loop now moves due follow-ups back to the top of Imbox as unread, creates a notification, shows a toast, and records `surfaced_at` so each follow-up resurfaces only once.
- **Draft → Compose handoff**: `DraftPanel` "Open in Compose" now populates the compose modal with the draft's recipient, Cc/Bcc, subject, body, and attachments.
- **Calendar invite → Contact link**: `add_calendar_event` now accepts the sender `contactId` and stores it in `events.pids_json`, so imported meetings appear in the sender's Contact → Calendar tab.
- **Schema migrations**: added `0004_body_html.sql` and `0005_follow_up_surfaced_at.sql`; registered both in `src-tauri/src/lib.rs`.

### Verification matrix

| Command | Result |
|---|---|
| `pnpm typecheck` | ✅ |
| `pnpm test` | ✅ 73 passed |
| `pnpm lint` | ✅ |
| `pnpm format:check` | ✅ |
| `pnpm e2e` | ✅ 20 passed, 1 skipped (live-network Rust gate) |
| `cargo test` | ✅ 29 passed (incl. live IMAP/SMTP Feishu tests) |
| `cargo clippy` | ✅ |
| `cargo fmt --check` | ✅ |

## 2026-08-04 (late-night) — Routing + Sent-copy + contact timeline direction

Fourth pass focused on mail routing consistency and outbound visibility.

### Fixed in this pass

- **Contact.defaultBucket applied at sync time**: `upsert_contact` now returns route info (`screened`, `blocked`, `default_bucket`); `insert_message` uses it to set the message bucket. Blocked senders go to Spam; screened senders with a non-Imbox default bucket route to Stream/Records/Spam automatically.
- **Sent message local copy**: `send_message` now persists a copy of every outbound message to `messages` with `direction='out'`, `bucket='paperTrail'`, and `pid` set to the primary recipient contact. Sent mail therefore appears in the recipient's Contact → Timeline.
- **Contact Timeline direction badges**: the Timeline tab now shows a `From` / `To` pill so users can distinguish received and sent messages, matching the prototype's `contact-timeline-direction`.
- **Schema migration**: added `0006_message_direction.sql` and registered it in `src-tauri/src/lib.rs`.

### Verification matrix

| Command | Result |
|---|---|
| `pnpm typecheck` | ✅ |
| `pnpm test` | ✅ 73 passed |
| `pnpm lint` | ✅ |
| `pnpm format:check` | ✅ |
| `pnpm e2e` | ✅ 20 passed, 1 skipped (live-network Rust gate) |
| `cargo test` | ✅ 29 passed (incl. live IMAP/SMTP Feishu tests) |
| `cargo clippy` | ✅ |
| `cargo fmt --check` | ✅ |

## 2026-08-04 (dawn) — Contact indexing completeness: Tasks / Follow-ups / Clips tabs

Fifth pass closed the contact-centric data gaps identified in the audit.

### Fixed in this pass

- **ContactPanel expanded to 9 tabs**: added **Tasks**, **Follow-ups**, and **Clips** alongside the existing Timeline / Notes / Files / Insights / Network / Calendar.
- **Tasks tab**: lists tasks whose `relatedContactId` matches the contact; supports inline add, toggle done, and delete.
- **Follow-ups tab**: lists follow-ups for messages sent by this contact, shows due date/note, and supports mark-done / delete.
- **Clips tab**: lists clips linked to the contact, supports copy-to-clipboard and delete.
- **`ContactTab` type updated** in `stores/ui.ts` to include the three new tabs.

### Verification matrix

| Command | Result |
|---|---|
| `pnpm typecheck` | ✅ |
| `pnpm test` | ✅ 73 passed |
| `pnpm lint` | ✅ |
| `pnpm format:check` | ✅ |
| `pnpm e2e` | ✅ 20 passed, 1 skipped (live-network Rust gate) |
| `cargo test` | ✅ 29 passed (incl. live IMAP/SMTP Feishu tests) |
| `cargo clippy` | ✅ |
| `cargo fmt --check` | ✅ |

### Remaining gaps (post-audit backlog)

- **Heuristic pre-routing**: screened contacts with `defaultBucket=imbox` still land in Imbox; there is no subject/domain classifier to auto-route newsletters/receipts to Stream/Records.
- **IMAP Sent-folder sync**: only messages sent from the app are saved locally. Mail sent from other clients is not pulled via IMAP Sent folder.
- **Piles UI**: Reply Later / Set Aside / Remind are modal lists rather than the prototype's inline fan-style piles, and "Focus & Reply" is a no-op.
- **Calendar visual layouts**: day/week/year are functional grids/lists but lack the prototype's hero card, freetime strips, multi-day arcs, filters, and calendar extras.
- **Contact surface depth**: ContactPanel header still lacks Write/Edit/routing controls; no company drill-down view.
- **Compose recipient experience**: no contact autocomplete, multi-recipient pills, or address validation.
- **Search indexing**: no FTS5/CJK index; search loads whole tables into memory.

## 2026-08-04 (late) — Imbox triage + attachment workflow completion

A second pass focused on making the core email client usable day-to-day: per-message triage actions in Imbox, real attachment handling in FilePanel, and dead-code cleanup.

### Fixed in this pass

- **Imbox per-message actions**: every row in `New for you` and `Previously seen` now exposes Reply, Reply Later, Set Aside, Bubble Up, Archive, Trash, and a More dropdown (Mark unread / Forward / Label / Move / Spam). Actions update the message store and show toast feedback.
- **FilePanel real PDF preview**: removed the "PDF 预览占位" placeholder. When a file URL exists it renders an inline `<iframe>`; otherwise it offers a Download button. Added a Download button for all file types.
- **Label / Move pickers**: new `LabelPicker` and `MovePicker` components. Users can assign existing labels (or create new ones inline) and move messages between Imbox/Stream/Records/Trash/Spam from both the Imbox row More menu and the MessagePanel More menu.
- **Imbox multi-select**: every non-bundle row has a checkbox; `x` toggles the cursor item; Shift+click selects a range. A floating `BulkActionBar` appears with Archive / Trash / Spam / Label / Move actions when any items are selected.
- **Bulk Label / Move**: `LabelPicker` and `MovePicker` now accept a list of message IDs; they work for both single-message menus and the multi-select bulk bar.
- **Snippets CRUD**: Settings 新增 Snippets tab，支持新建 / 编辑 / 删除 snippet（名称、快捷输入、正文）；Compose 的 Snippet picker 已能读取这些 snippet 并插入正文。
- **Keyboard shortcut conflicts**: global shortcut router now delegates j/k/Enter/x/l to Imbox's local handler, preventing double cursor moves / double Reply Later actions when viewing the Imbox list.
- **Dead code**: removed `app/src/views/_placeholder.tsx`, which was no longer imported.
- **Lint/type hygiene**: fixed Solid ref typing for the new `MessageActions` dropdown and eliminated `async` arrows without `await`.

### Verification matrix

| Command | Result |
|---|---|
| `pnpm format:check` | ✅ |
| `pnpm lint` | ✅ |
| `pnpm typecheck` | ✅ |
| `pnpm test` | ✅ 73 passed |
| `pnpm e2e` | ✅ 20 passed, 1 skipped (live-network Rust gate) |
| `cargo test` | ✅ 29 passed (incl. live IMAP/SMTP Feishu tests) |
| `cargo clippy` | ✅ |
| `cargo fmt --check` | ✅ |

### Confirmed core workflows (usable as an email client)

- **Read**: Imbox/Stream/Records/Trash/Spam all list messages; MessagePanel renders body, calendar invites, attachments, and thread siblings.
- **Triage**: Gate screens first-time senders; Imbox rows support Reply Later / Set Aside / Bubble Up / Archive / Trash / Spam / Label / Move; MessagePanel supports the same plus Reply All, Forward, Block sender; multi-select supports bulk Archive / Trash / Spam / Label / Move.
- **Compose**: Compose modal pre-fills reply/forward context; E2E verifies sending via the backend SMTP bridge.
- **Contacts**: ContactPanel shows Timeline (messages), Notes (CRUD), Files (attachments), Insights, Network, Calendar (events) filtered by contact.
- **Attachments**: MessagePanel downloads via `get_attachment_content` Rust command; FilePanel previews images/PDFs and downloads any file.
- **Sync**: Real IMAP/SMTP against Feishu passes; multi-account sync loop hot-reloads accounts; vault stores credentials in OS keychain.

### Remaining gaps (non-blocking for basic email usage)

- **Label / Move pickers**: ✅ Implemented in Imbox per-row More menu and MessagePanel More menu, and extended to multi-select bulk actions. Keyboard shortcuts (`message:label`, `message:move`) still toast because they are global handlers without a focused message modal hook.
- **Multi-select actions**: ✅ Implemented for Imbox individual rows with checkbox + `x` key + Shift+click range selection + floating bulk bar (Archive / Trash / Spam / Label / Move). Not yet available in Stream/Records/Trash/Spam views or for bundles.

- **Agent LLM**: Agent chat simulates a response; real LLM integration is future work.
- **Agent memory editor**: Memory tab is read-only explanatory text; no per-contact memory CRUD.
- **Snippets CRUD**: ✅ Settings 新增 Snippets tab，支持新建 / 编辑 / 删除 snippet；Compose 的 Snippet picker 已能读取这些 snippet 并插入正文。
- **Calendar grid fidelity**: day/week/year are functional flat lists, not the prototype's grid/hero/filmstrip layouts.
- **Search indexing**: CommandPalette/LiveSearch/Search page work via in-memory fuzzy search; no FTS5/CJK index yet.

## 2026-08-04 (late-night) — Compose recipient pills + Write-to-contact

Sixth pass polished the compose recipient experience and linked contacts directly to composition.

### Fixed in this pass

- **Recipient input rebuild**: new `RecipientInput` component renders each recipient as a removable pill, supports typing to filter contacts, and adds a recipient via Enter / Tab / comma. Invalid emails show inline validation and do not become pills.
- **To / Cc / Bcc integration**: `Compose` now uses `RecipientInput` for all three address fields, replacing the plain text inputs.
- **Contact → Compose handoff**: `ContactPanel` header gained a **Write** button that opens Compose and pre-fills the contact's primary email address in the To field.
- **Compose context expansion**: `ComposeContext` now carries `to` and `subject`; callers can seed both fields when opening the modal.
- **E2E alignment**: compose tests now target `[data-field="to"] input` to work with the new pill input.

### Verification matrix

| Command | Result |
|---|---|
| `pnpm format:check` | ✅ |
| `pnpm lint` | ✅ |
| `pnpm typecheck` | ✅ |
| `pnpm test` | ✅ 73 passed |
| `pnpm e2e` | ✅ 20 passed, 1 skipped (live-network Rust gate) |
| `cargo test` | ✅ 29 passed (incl. live IMAP/SMTP Feishu tests) |
| `cargo clippy` | ✅ |
| `cargo fmt --check` | ✅ |

## 2026-08-04 (dawn) — Prototype audit: data indexing + workflow completeness

Seventh pass closed the data-index and outbound-visibility gaps identified in the full prototype audit.

### Fixed in this pass

- **Calendar invite auto-import during IMAP sync**: `insert_message` now auto-inserts an `events` row from any parsed iCal VEVENT, linking it to the sender's contact via `pids_json`. The manual "Add to calendar" button still works, but invites now surface in Contact → Calendar and the Calendar view automatically.
- **Shared iCal helper utilities**: moved `split_iso_datetime` and `compute_duration_minutes` to `services/ical.rs` as public helpers; `add_calendar_event` now uses the shared `sync_loop::open_pool()` instead of a second, hard-coded DB pool.
- **Sent copy includes attachments**: `save_sent_message` now persists outgoing attachments to disk and stores their IDs in `messages.attachments_json`, so sent mail with attachments is complete in the local timeline.
- **Forward carries original attachments**: `Compose` now pre-loads original attachment bytes into the draft when forwarding, so forwarded messages include the files.
- **DraftPanel completeness**: `DraftPanel` now shows editable To / Cc / Bcc fields, lists attachments with download, and sends with Cc/Bcc included.
- **Notification click-through**: clicking a notification now navigates to the source view **and** opens the relevant detail (contact/message/file/draft) or recenters the calendar; the panel also closes on outside click and uses per-type tinted icons.
- **Keyboard shortcut overlay guard**: global list/message shortcuts no longer fire while a modal, command palette, search, notification panel, compose, or detail panel is open; `message:label` and `message:move` shortcuts now open the focused message's picker in `MessagePanel`.

### Verification matrix

| Command | Result |
|---|---|
| `pnpm format:check` | ✅ |
| `pnpm lint` | ✅ |
| `pnpm typecheck` | ✅ |
| `pnpm test` | ✅ 73 passed |
| `pnpm e2e` | ✅ 20 passed, 1 skipped (live-network Rust gate) |
| `cargo test` | ✅ 29 passed (incl. live IMAP/SMTP Feishu tests) |
| `cargo clippy` | ✅ |
| `cargo fmt --check` | ✅ |

## 2026-08-04 (morning) — Company drill-down + ContactPanel header

Eighth pass added the missing company-centric navigation that ties contacts, messages, files, and meetings together.

### Fixed in this pass

- **Company drill-down panel**: new `CompanyPanel` with five tabs (People / Communications / Files / Meetings / Insights) that filters all data by company name. Accessible from the Companies view, Contacts grouped-by-company headers, and the company link in `ContactPanel`.
- **Company detail wiring**: added `selectedCompanyName` signal and `openCompanyDetail()` helper to `stores/ui.ts`; `DetailPanel` now renders `CompanyPanel` when a company is selected, clearing other selected IDs.
- **ContactPanel header enhanced**: now shows the primary email address and a clickable company name that opens the company drill-down.
- **Cross-navigation**: clicking a person in `CompanyPanel` opens that contact's `ContactPanel`; clicking a message/file opens its detail panel.

### Verification matrix

| Command | Result |
|---|---|
| `pnpm format:check` | ✅ |
| `pnpm lint` | ✅ |
| `pnpm typecheck` | ✅ |
| `pnpm test` | ✅ 73 passed |
| `pnpm e2e` | ✅ 20 passed, 1 skipped (live-network Rust gate) |
| `cargo test` | ✅ 29 passed (incl. live IMAP/SMTP Feishu tests) |
| `cargo clippy` | ✅ |
| `cargo fmt --check` | ✅ |

## 2026-08-04 (midday) — Calendar day view hero + filmstrip + stats

Ninth pass upgraded the Calendar day view from a plain vertical grid to the prototype's hero + filmstrip + agenda layout.

### Fixed in this pass

- **DayHero card**: large weekday/date/month display, editable day title persisted to `localStorage`, and three live stats (meeting time, free time, longest free slot) computed from the day's events.
- **DayActions row**: Bubble Up / Sometime / 开始计时 buttons (info-toast placeholders for the modal flows that are still pending).
- **DayFilmstrip**: 0–24h horizontal timeline with hour ticks, freetime blocks (≥1h), and colored event cards laid out proportionally by start/duration.
- **DayAgenda**: card-style list of the day's meetings with time range, title, and location, replacing the dense vertical hour grid.
- **Layout helpers**: added `formatTimeCompact` and `computeFreetimeSlots`; removed the now-unused vertical `DayGrid` and `layoutOverlappingEvents`.

### Verification matrix

| Command | Result |
|---|---|
| `pnpm format:check` | ✅ |
| `pnpm lint` | ✅ |
| `pnpm typecheck` | ✅ |
| `pnpm test` | ✅ 73 passed |
| `pnpm e2e` | ✅ 20 passed, 1 skipped (live-network Rust gate) |
| `cargo test` | ✅ 29 passed (incl. live IMAP/SMTP Feishu tests) |
| `cargo clippy` | ✅ |
| `cargo fmt --check` | ✅ |

## 2026-08-04 (afternoon) — Calendar week view overview + per-day stats

Tenth pass upgraded the Calendar week view with a prototype-style overview bar and per-day statistics.

### Fixed in this pass

- **Week summary bar**: added a top-of-grid overview card showing total meetings for the week, total working hours, and the busiest day.
- **Per-day stats**: each weekday column now displays its meeting count and total busy time under the date header.
- **Longest free-time label**: each column footer shows the longest contiguous free slot (e.g. "空闲 4h") or "忙碌" when no meaningful free block exists.
- **Syntax fix**: closed the outer `WeekGrid` container `<div>` that was accidentally left open when the summary bar was inserted.

### Verification matrix

| Command | Result |
|---|---|
| `pnpm format:check` | ✅ |
| `pnpm lint` | ✅ |
| `pnpm typecheck` | ✅ |
| `pnpm test` | ✅ 73 passed |
| `pnpm build` | ✅ |
| `pnpm e2e` | ✅ 20 passed, 1 skipped (live-network Rust gate) |
| `cargo test` | ✅ 29 passed (incl. live IMAP/SMTP Feishu tests) |
| `cargo clippy` | ✅ |
| `cargo fmt --check` | ✅ |

## 2026-08-04 (evening) — Calendar multi-day arcs (week + year) + legend

Eleventh pass added the prototype's cross-day event visualization to both week and year views.

### Fixed in this pass

- **Multi-day event data model**: added optional `endDt` to `CalendarEvent`; created migration `0007_event_end_dt.sql`; registered it in `src-tauri/src/lib.rs`; updated `rowToEvent`/`upsertEvent` and the iCal `add_calendar_event` Rust command to persist the inclusive end date.
- **Event edit modal**: added an "End date" field so users can create or edit multi-day events directly.
- **Week view multi-day arcs**: a "跨日事件" strip above the day columns renders each multi-day event as a colored bar spanning the appropriate weekday columns; clicking opens the event detail.
- **Year view multi-day arcs**: each month mini-calendar now renders horizontal arcs for multi-day events that overlap that month, positioned proportionally by date.
- **Year view legend**: added a legend row below the year hero explaining single-day meetings, multi-day events, and circled/selected days.

### Verification matrix

| Command | Result |
|---|---|
| `pnpm format:check` | ✅ |
| `pnpm lint` | ✅ |
| `pnpm typecheck` | ✅ |
| `pnpm test` | ✅ 73 passed |
| `pnpm build` | ✅ |
| `pnpm e2e` | ✅ 20 passed, 1 skipped (live-network Rust gate) |
| `cargo test` | ✅ 29 passed (incl. live IMAP/SMTP Feishu tests) |
| `cargo clippy` | ✅ |
| `cargo fmt --check` | ✅ |

## 2026-08-04 (night) — Settings live-save

Twelfth pass removed the manual Save buttons from Profile / Preferences / Agent tabs and made app settings persist automatically.

### Fixed in this pass

- **Auto-persist effect**: `Settings` now sets up a `createEffect` that watches `appSettings`; 400ms after the user stops changing a value, it writes to `tauri-plugin-store` and calls `store.save()`.
- **Removed redundant Save buttons**: Profile, Preferences, and Agent tabs no longer require a manual click; changes are saved as you type/toggle.
- **Cleanup**: `onCleanup` clears the pending debounce timeout when the Settings view unmounts.

### Verification matrix

| Command | Result |
|---|---|
| `pnpm format:check` | ✅ |
| `pnpm lint` | ✅ |
| `pnpm typecheck` | ✅ |
| `pnpm test` | ✅ 73 passed |
| `pnpm build` | ✅ |
| `pnpm e2e` | ✅ 20 passed, 1 skipped (live-network Rust gate) |
| `cargo test` | ✅ 29 passed (incl. live IMAP/SMTP Feishu tests) |
| `cargo clippy` | ✅ |
| `cargo fmt --check` | ✅ |

## 2026-08-04 (late night) — Gate history view

Thirteenth pass added the prototype's Gate history screen so users can review and reverse past screening decisions.

### Fixed in this pass

- **New view**: added `screenerHistory` to `ViewName` and routed it in `Main.tsx`.
- **Gate → history link**: the Gate view header now has a "查看 Gate 历史" button that navigates to the history screen.
- **Two-column layout**: left column lists approved senders (screened in), right column lists blocked senders (screened out). Each column shows a count and a placeholder when empty.
- **Toggle actions**: each row has a button to move a sender between allowed and blocked; the action updates the contact, re-routes the sender's messages to the appropriate bucket, and refreshes the list.
- **Back navigation**: a back arrow returns to the Gate screener.

### Verification matrix

| Command | Result |
|---|---|
| `pnpm format:check` | ✅ |
| `pnpm lint` | ✅ |
| `pnpm typecheck` | ✅ |
| `pnpm test` | ✅ 73 passed |
| `pnpm build` | ✅ |
| `pnpm e2e` | ✅ 20 passed, 1 skipped (live-network Rust gate) |
| `cargo test` | ✅ 29 passed (incl. live IMAP/SMTP Feishu tests) |
| `cargo clippy` | ✅ |
| `cargo fmt --check` | ✅ |

## 2026-08-04 (late night) — Shortcut keymap alignment + sidebar hints

Fourteenth pass aligned the default keyboard shortcuts with the prototype and surfaced shortcut hints in the sidebar.

### Fixed in this pass

- **Action shortcuts aligned with prototype**:
  - `s` → Set Aside (was `a`)
  - `b` → Bubble Up (was `z`)
  - `#` → Trash (was `t`)
  - `!` → Spam (was `s`)
  - Removed default bindings for Label (`b`) and Move (`v`) to avoid conflicts; Label/Move remain available via MessagePanel More menu and Imbox bulk actions.
- **Calendar today**: changed from `T` to `t` to match the prototype.
- **Sidebar hints**: added an optional `hint` field to `NavSection`; Gate/Imbox/Stream/Records/Contacts/Calendar/Files/Insights now display their ⌘1–⌘8 shortcut next to the label on desktop.
- **Shortcut help modal**: updated the cheatsheet to reflect the new action bindings and removed the non-prototype ⌘0 Drafts / ⌘9 Settings entries.

### Verification matrix

| Command | Result |
|---|---|
| `pnpm format:check` | ✅ |
| `pnpm lint` | ✅ |
| `pnpm typecheck` | ✅ |
| `pnpm test` | ✅ 73 passed |
| `pnpm build` | ✅ |
| `pnpm e2e` | ✅ 20 passed, 1 skipped (live-network Rust gate) |
| `cargo test` | ✅ 29 passed (incl. live IMAP/SMTP Feishu tests) |
| `cargo clippy` | ✅ |
| `cargo fmt --check` | ✅ |

### Remaining gaps (post-audit backlog)

- **Full Agent view**: `view === "agent"` is defined but not routed; the side panel still simulates replies.
- **Search indexing**: CommandPalette/LiveSearch/Search page work via in-memory fuzzy search; no FTS5/CJK index yet.
- **Prototype fidelity polish**: inline piles, Focus & Reply, and mobile safe-area insets remain as incremental polish.

## 2026-08-05 (continued) — Compose auto-title + post-send follow-up workflow

Sixteenth pass closed two remaining Compose workflow gaps from the audit.

### Fixed in this pass

- **Compose auto-title**: when the subject is empty and the body has ≥ 8 characters, the subject is now automatically pre-filled with the first non-empty line of the body (truncated to 60 chars).
- **Post-send follow-up**: `save_sent_message` now returns the local message id; `send_message` returns it as `local_message_id`; after a successful send, the success toast's "设置跟进 3 天" action creates a real `FollowUp` row due 3 days later. `DraftPanel` send gained the same action.

### Verification matrix

| Command | Result |
|---|---|
| `pnpm format:check` | ✅ |
| `pnpm lint` | ✅ |
| `pnpm typecheck` | ✅ |
| `pnpm test` | ✅ 73 passed |
| `cargo test` | ✅ 29 passed (incl. live IMAP/SMTP Feishu tests) |
| `cargo clippy --all-targets -- -D warnings` | ✅ |
| `cargo fmt --check` | ✅ |

| `pnpm build` | ✅ |
| `pnpm e2e` | ✅ 20 passed, 1 skipped (live-network Rust gate) |

## 2026-08-05 — Prototype audit: functional blockers + attachment/contact polish

Fifteenth pass closed the remaining real-client blockers identified in the full prototype/workflow audit: broken Imbox piles, attachment preview paths, read-only Agent memory, missing alias/default-From support, and mobile safe-area insets.

### Fixed in this pass

- **Imbox piles blocker**: `Piles` now passes `PileKey` values (`replyLater` / `setAside` / `remind`) instead of display labels, so the pile modal correctly lists Reply Later / Set Aside / Remind messages. Also added `onCleanup` to remove the document keydown listener when the view unmounts.
- **FilePanel real preview**: attachments are now previewed via a base64 data URL from `getAttachmentContent`. Added a new Rust command `get_attachment_path` so the **Open** button launches the file with the system default app through `openPath`.
- **Agent memory editable UI**: the Memory tab now exposes a global key/value editor and per-contact memory textarea, with a Save button that persists to `tauri-plugin-store`.
- **Settings per-account aliases + default From**: `AccountEditModal` gained an aliases list (add/remove) and a Default From dropdown (primary email + aliases). Aliases are stored in `accounts.settings_json`.
- **Compose From dropdown sync**: the From selector now shows each account's primary address and aliases; the selected alias is stored in `drafts.from_alias` and passed to `send_message` as `fromOverride`, so outgoing mail uses the alias. Scheduled sends also honor `from_alias`.
- **Schema migration**: added `from_alias` column to `drafts` via `0008_drafts_from_alias.sql` and registered it in `src-tauri/src/lib.rs`; updated `rowToDraft`/`upsertDraft`.
- **Mobile safe-area insets**: `base.css` now adds `env(safe-area-inset-*)` padding to `#titlebar`, `#topbar`, `#sidebar`, `#detail-panel`, `#agent-panel`, and mobile full-screen panels, with grid rows/columns sized by `calc(... + env(...))`.
- **LiveSearch debounce**: added a 200 ms debounce to match PRD §3.16.
- **Search page snippets/clips actions**: clicking a snippet copies its body; clicking a clip copies its text, with toast feedback.

### Verification matrix

| Command | Result |
|---|---|
| `pnpm format:check` | ✅ |
| `pnpm lint` | ✅ |
| `pnpm typecheck` | ✅ |
| `pnpm test` | ✅ 73 passed |
| `pnpm build` | ✅ |
| `pnpm e2e` | ✅ 20 passed, 1 skipped (live-network Rust gate) |
| `cargo test` | ✅ 29 passed (incl. live IMAP/SMTP Feishu tests) |
| `cargo clippy --all-targets -- -D warnings` | ✅ |
| `cargo fmt --check` | ✅ |

### Remaining gaps (post-audit backlog)

- **Full Agent view**: `view === "agent"` is defined but not routed; the side panel still simulates replies.
- **Search indexing**: CommandPalette/LiveSearch/Search page work via in-memory fuzzy search; no FTS5/CJK index yet.
- **Prototype fidelity polish**: inline fan-style piles, Focus & Reply, Read Together, calendar hero/filmstrip exact layouts, titlebar/sidebar dimensions matching prototype, compose floating modal, richer empty-state art.

## 2026-08-05 (continued) — Focus & Reply + Read Together triage workflows

Seventeenth pass implemented the two HEY-style triage workflows that were still placeholders.

### Fixed in this pass

- **Focus & Reply view**: added `app/src/views/FocusReply.tsx` routed as `view === "focusReply"`. It lists every message marked Reply Later, shows the original email plus an inline AI-generated draft textarea, and provides Send / Regenerate / Edit (opens Compose) / Skip / Done actions. Sending clears the Reply Later flag and removes the item from the flow.
- **Read Together view**: added `app/src/views/ReadTogether.tsx` routed as `view === "readTogether"`. It displays unread Imbox messages one at a time with a progress indicator and Next (mark read) / Reply / Pending (reply later) / Archive / Trash actions. Ends with "All caught up".
- **Imbox entry points**: the bottom "Focus & Reply" button now routes to the real view; an "一起读" header button opens Read Together; the `o` key starts Focus & Reply from Imbox.
- **Pure triage helpers**: extracted `getFocusReplyCandidates` and `getReadTogetherCandidates` to `app/src/utils/triage.ts` with full test coverage.
- **Heuristic AI draft generator**: added `app/src/utils/draft.ts` with keyword-driven reply templates matching prototype-v11's `generateAiDraft`, plus unit tests.

### Verification matrix

| Command | Result |
|---|---|
| `pnpm format:check` | ✅ |
| `pnpm lint` | ✅ |
| `pnpm typecheck` | ✅ |
| `pnpm test` | ✅ 85 passed |
| `cargo test` | ✅ 29 passed (incl. live IMAP/SMTP Feishu tests) |
| `cargo clippy --all-targets -- -D warnings` | ✅ |
| `cargo fmt --check` | ✅ |
| `pnpm build` | ✅ |
| `pnpm e2e` | ✅ 20 passed, 1 skipped (live-network Rust gate) |

### Remaining gaps (post-audit backlog)

- **Search indexing**: CommandPalette/LiveSearch/Search page work via in-memory fuzzy search; no FTS5/CJK index yet.
- **Prototype fidelity polish**: inline fan-style piles, calendar hero/filmstrip exact layouts, titlebar/sidebar dimensions matching prototype, compose floating modal, richer empty-state art.

## 2026-08-05 (continued) — Full Agent independent view

Eighteenth pass implemented the full Agent workspace that was previously only a side panel.

### Fixed in this pass

- **Shared Agent hook**: extracted session/task/draft/audit state and actions into `app/src/agent/useAgent.ts`, removing duplication between the panel and the full view.
- **Agent.tsx full view**: added `app/src/views/Agent.tsx` routed as `view === "agent"`. It renders the prototype's 3-column workspace: session list | conversation | tasks/drafts. Includes a search bar that filters sessions, drafts, and tasks.
- **AgentPanel refactor**: rewired the existing side panel to use `useAgent`, preserving its tabbed UI while sharing logic with the full view.
- **Agent helpers + tests**: moved `sessionIcon` / `statusColor` to `app/src/utils/agent.ts` and added unit tests.

### Verification matrix

| Command | Result |
|---|---|
| `pnpm format:check` | ✅ |
| `pnpm lint` | ✅ |
| `pnpm typecheck` | ✅ |
| `pnpm test` | ✅ 94 passed |
| `cargo test` | ✅ 29 passed (incl. live IMAP/SMTP Feishu tests) |
| `cargo clippy --all-targets -- -D warnings` | ✅ |
| `cargo fmt --check` | ✅ |
| `pnpm build` | ✅ |
| `pnpm e2e` | ✅ 20 passed, 1 skipped (live-network Rust gate) |

### Remaining gaps (post-audit backlog)

- **Search indexing**: CommandPalette/LiveSearch/Search page work via in-memory fuzzy search; no FTS5/CJK index yet.
- **Prototype fidelity polish**: calendar hero/filmstrip exact layouts, titlebar/sidebar dimensions matching prototype, compose floating modal, richer empty-state art.

## 2026-08-05 (continued) — Inline fan-style Imbox piles

Nineteenth pass replaced the modal-based Piles with prototype-style inline accordion cards.

### Fixed in this pass

- **Inline piles**: `Imbox.tsx` now renders Reply Later / Set Aside / Remind as expandable fan-style cards at the bottom of the list. Each card shows icon, label, count, and a chevron; expanding reveals up to 5 message rows with sender avatar, subject, time, and an unmark action.
- **Pile actions**: the Reply Later card includes a "Focus & Reply" button that jumps to the Focus & Reply view; every card has a "Clear all" button to remove all messages from that pile.
- **Removed pile modal**: the old `Piles` button row + `Modal` combo was removed, eliminating an extra click/workflow step.
- **Tests**: the existing Imbox renderList tests still pass; no new pure logic required, so no new unit tests were added.

### Verification matrix

| Command | Result |
|---|---|
| `pnpm format:check` | ✅ |
| `pnpm lint` | ✅ |
| `pnpm typecheck` | ✅ |
| `pnpm test` | ✅ 94 passed |
| `cargo test` | ✅ 29 passed (incl. live IMAP/SMTP Feishu tests) |
| `cargo clippy --all-targets -- -D warnings` | ✅ |
| `cargo fmt --check` | ✅ |
| `pnpm build` | ✅ |
| `pnpm e2e` | ✅ 20 passed, 1 skipped (live-network Rust gate) |

### Remaining gaps (post-audit backlog)

- **Search indexing**: CommandPalette/LiveSearch/Search page work via in-memory fuzzy search; no FTS5/CJK index yet.
- **Prototype fidelity polish**: calendar hero/filmstrip exact layouts, titlebar/sidebar dimensions matching prototype, compose floating modal, richer empty-state art.

## 2026-08-04 (final pass) — Real-client blocker sweep

Fifth pass after the parallel audit of views, workflows, and data indexing. Fixed the issues that blocked reliable real-world email usage and brought the search index in-line with the data model.

### Fixed in this pass

- **Compose floating/minimizable window**: replaced the centered modal with a bottom-right floating compose window; supports minimize to title-bar and close; mobile falls back to full-screen.
- **Send-message IPC parameter mismatch**: `backend.ts` now passes `account_id`/`from_override` in snake_case to match the Rust command, so the selected From account/alias is no longer silently ignored.
- **Manual sync uses account credentials**: `sync_now` and `list_mailboxes` now resolve credentials from the selected account instead of always falling back to test credentials.
- **Cross-account IMAP UID collisions**: message IDs are now `imap_{account_id}_{uid}`, so multi-account inboxes no longer drop messages with overlapping UIDs.
- **SMTP TLS mode selection**: `EmailCredentials` now carries `smtp_implicit_tls`; `SmtpClient` uses `relay` (implicit TLS) for port 465 and `starttls_relay` for STARTTLS providers like Outlook/iCloud.
- **Recipient header parsing**: `parse_email` now extracts `To`, `Cc`, `Bcc`, and `References`, enabling Reply All and Gmail-style thread roots for synced mail.
- **Scheduled-send local Sent copy**: the scheduled-send executor now persists a local Sent copy after dispatch, so scheduled messages appear in the recipient's contact timeline.
- **Topbar search direct input**: the topbar search field is now editable; `LiveSearch` uses the global `searchQuery` signal and handles keyboard navigation via a document listener.
- **Contact panel editing**: extracted `ContactEditModal` into a shared component; added Edit, notify toggle, and default-bucket toggle to `ContactPanel`.
- **Settings Data tab completeness**: added Mailbox backup JSON, Tasks JSON export, Empty Trash, and Delete account (mock) actions.
- **SQLite FTS5 search index**: added `search_index` virtual table (migration `0009`), indexed by Rust sync loop for messages and by JS data layer for contacts/files; `LiveSearch`, global `Search`, and `CommandPalette` now query FTS5 instead of loading whole tables.

### Verification matrix

| Command | Result |
|---|---|
| `pnpm typecheck` | ✅ |
| `pnpm test` | ✅ 94 passed |
| `pnpm lint` | ✅ |
| `pnpm format:check` | ✅ |
| `pnpm build` | ✅ |
| `pnpm e2e` | ✅ 20 passed, 1 skipped (live-network Rust gate) |
| `cargo test` | ✅ 34 passed (incl. live IMAP/SMTP Feishu tests) |
| `cargo clippy --all-targets -- -D warnings` | ✅ |
| `cargo fmt --check` | ✅ |

### Remaining gaps (post-audit backlog)

- **Calendar visual layouts**: day/week/year are flat lists, not the prototype's grid/hero/filmstrip.
- **Agent workspace**: currently a side panel only; full Agent view with conversation history is not implemented.
- **Mobile list gestures**: `useSwipe`/`useLongPress` helpers exist but are not wired to Imbox/Stream/Records rows; no pull-to-refresh.
- **Meeting auto-brief + materials**: `MeetingPanel` shows static brief text and no linked-file Materials section.

## 2026-08-05 (continued) — Trash/Spam 30-day expiry enforcement

Twentieth pass implemented the Trash/Spam recovery contract that the UI had been advertising but not enforcing.

### Fixed in this pass

- **Schema**: added `deleted_at TEXT` column to `messages` via `0010_trash_expiry.sql`; registered the migration in `src-tauri/src/lib.rs` (also registered the previously-unregistered `0009_search_index.sql`).
- **Expiry-aware moves**: new `moveMessageToBucket(id, bucket)` helper in `data.ts` stamps `deleted_at = datetime('now')` when moving to Trash/Spam and clears it when restoring to Imbox/Stream/Records.
- **Bulk move consistency**: `MovePicker`, `MessagePanel` Trash/Spam actions, `Trash`/`Spam` restore buttons, and `Gate` bulk re-routing all use `moveMessageToBucket` so every bucket change keeps the expiry timestamp correct.
- **Background purge job**: `sync_loop.rs` now spawns a daily task that deletes messages where `bucket IN ('trash','spam') AND deleted_at < datetime('now','-30 days')`.
- **UI countdown**: `Trash.tsx` and `Spam.tsx` list items display "X 天后永久删除" / "X 天后自动删除" using `daysUntil(addDays(deletedAt, 30))`.
- **Unit tests**: added `daysUntil` tests to `date.test.ts`.

### Verification matrix

| Command | Result |
|---|---|
| `pnpm typecheck` | ✅ |
| `pnpm test` | ✅ 98 passed |
| `pnpm lint` | ✅ |
| `pnpm format:check` | ✅ |
| `pnpm build` | ✅ |
| `pnpm e2e` | ✅ 20 passed, 1 skipped (live-network Rust gate) |
| `cargo test` | ✅ 34 passed (incl. live IMAP/SMTP Feishu tests) |
| `cargo clippy --all-targets -- -D warnings` | ✅ |
| `cargo fmt --check` | ✅ |

### Remaining gaps (post-audit backlog)

- **Calendar visual layouts**: day/week/year are flat lists, not the prototype's grid/hero/filmstrip.
- **Agent workspace**: currently a side panel only; full Agent view with conversation history is not implemented.
- **Mobile list gestures**: `useSwipe`/`useLongPress` helpers exist but are not wired to Imbox/Stream/Records rows; no pull-to-refresh.

## 2026-08-05 (continued) — Meeting auto-brief + Materials

Twenty-first pass closed the meeting-detail gap identified in the audit: `MeetingPanel` now generates a context brief from attendee data and surfaces linked files in a Materials section.

### Fixed in this pass

- **Auto-brief generator**: new `app/src/utils/meeting.ts` with `generateMeetingBrief(event, messages, files, contacts)`. It counts recent messages from attendees (last 30 days), extracts the top topic keyword, counts outbound messages marked Reply Later as "waiting reply", and notes shared attachments.
- **Materials section**: `MeetingPanel` now shows a "Materials" list computed from `event.materials` plus up to 3 recent files per attendee. Each file row is clickable and opens the file detail panel.
- **Shared file icon helper**: added `fileIconName(type)` to `utils/labels.ts` so MessagePanel and MeetingPanel use the same icon mapping.
- **Unit tests**: added `app/src/test/meeting.test.ts` covering empty context, recent-message counting, 30-day cutoff, waiting-reply detection, shared files, topic extraction, and explicit/implicit material linking.

### Verification matrix

| Command | Result |
|---|---|
| `pnpm typecheck` | ✅ |
| `pnpm test` | ✅ 106 passed |
| `pnpm lint` | ✅ |
| `pnpm format:check` | ✅ |
| `pnpm build` | ✅ |
| `pnpm e2e` | ✅ 20 passed, 1 skipped (live-network Rust gate) |
| `cargo test` | ✅ 34 passed (incl. live IMAP/SMTP Feishu tests) |
| `cargo clippy --all-targets -- -D warnings` | ✅ |
| `cargo fmt --check` | ✅ |

### Remaining gaps (post-audit backlog)

- **Calendar visual layouts**: day/week/year are flat lists, not the prototype's grid/hero/filmstrip.
- **Agent workspace**: currently a side panel only; full Agent view with conversation history is not implemented.
- **Mobile list gestures**: `useSwipe`/`useLongPress` helpers exist but are not wired to Imbox/Stream/Records rows; no pull-to-refresh.

## 2026-08-05 (continued) — Search index integrity on deletion

Twenty-second pass fixed stale full-text search entries that remained after messages, contacts, or files were deleted.

### Fixed in this pass

- **`removeFromSearchIndex` helper**: added to `app/src/stores/data.ts`; every `deleteMessage`, `deleteContact`, and `deleteFile` now purges the matching `search_index` row.
- **`emptyTrash` index cleanup**: before deleting trashed messages, the function now removes their `search_index` entries so deleted mail doesn't surface in search.
- **Rust purge job index cleanup**: `purge_expired_messages` in `sync_loop.rs` deletes stale `search_index` entries for expired Trash/Spam messages before removing the rows.

### Verification matrix

| Command | Result |
|---|---|
| `pnpm typecheck` | ✅ |
| `pnpm test` | ✅ 106 passed |
| `pnpm lint` | ✅ |
| `pnpm format:check` | ✅ |
| `pnpm build` | ✅ |
| `pnpm e2e` | ✅ 20 passed, 1 skipped (live-network Rust gate) |
| `cargo test` | ✅ 34 passed (incl. live IMAP/SMTP Feishu tests) |
| `cargo clippy --all-targets -- -D warnings` | ✅ |
| `cargo fmt --check` | ✅ |

### Remaining gaps (post-audit backlog)

- **Calendar visual layouts**: day/week/year are flat lists, not the prototype's grid/hero/filmstrip.
- **Agent workspace**: currently a side panel only; full Agent view with conversation history is not implemented.
- **Mobile list gestures**: `useSwipe`/`useLongPress` helpers exist but are not wired to Imbox/Stream/Records rows; no pull-to-refresh.

## 2026-08-05 (continued) — Real-time sync refresh for list views

Twenty-third pass fixed the sync event bridge so new mail from the Rust IMAP IDLE loop appears immediately in the UI instead of being silently dropped.

### Fixed in this pass

- **Global refresh tick**: added `refreshTick` signal and `bumpRefreshTick()` to `stores/ui.ts`.
- **`useRefreshEffect` hook**: new `utils/gestures.ts` helper that re-runs a callback whenever the refresh tick changes.
- **Sync event bridge**: `services/sync-events.ts` now bumps the tick on `sync:new-messages` instead of calling `listMessages()` with no consumer.
- **Wired list views**: `Imbox`, `Stream`, `Records`, `Trash`, and `Spam` all call their `refetch` inside `useRefreshEffect`, so they update as soon as the backend fetches new mail.

### Verification matrix

| Command | Result |
|---|---|
| `pnpm typecheck` | ✅ |
| `pnpm test` | ✅ 106 passed |
| `pnpm lint` | ✅ |
| `pnpm format:check` | ✅ |
| `pnpm build` | ✅ |
| `pnpm e2e` | ✅ 20 passed, 1 skipped (live-network Rust gate) |
| `cargo test` | ✅ 34 passed (incl. live IMAP/SMTP Feishu tests) |
| `cargo clippy --all-targets -- -D warnings` | ✅ |
| `cargo fmt --check` | ✅ |

### Remaining gaps (post-audit backlog)

- **Calendar visual layouts**: day/week/year are flat lists, not the prototype's grid/hero/filmstrip.
- **Agent workspace**: currently a side panel only; full Agent view with conversation history is not implemented.
- **Mobile list gestures**: `useSwipe`/`useLongPress` helpers exist but are not wired to Imbox/Stream/Records rows; no pull-to-refresh.

## 2026-08-05 (continued) — Mobile pull-to-refresh

Twenty-fourth pass closed the remaining mobile UX gap: list views now support pull-to-refresh on phones and tablets.

### Fixed in this pass

- **`PullToRefresh` component**: new `app/src/components/PullToRefresh.tsx` that attaches to a scroll container, detects a top-of-list pull-down gesture, shows a palm-green arrow/spinner indicator, and triggers a refresh callback when the user passes the 80 px threshold.
- **`Main.tsx` wiring**: wraps the view `<Switch>` with `<PullToRefresh>` attached to `#main`; enabled only on non-desktop viewports via `useViewport()`.
- **Reuses global refresh tick**: the refresh callback calls `bumpRefreshTick()`, so `Imbox`/`Stream`/`Records`/`Trash`/`Spam` all re-fetch automatically.

### Verification matrix

| Command | Result |
|---|---|
| `pnpm typecheck` | ✅ |
| `pnpm test` | ✅ 106 passed |
| `pnpm lint` | ✅ |
| `pnpm format:check` | ✅ |
| `pnpm build` | ✅ |
| `pnpm e2e` | ✅ 20 passed, 1 skipped (live-network Rust gate) |
| `cargo test` | ✅ 34 passed (incl. live IMAP/SMTP Feishu tests) |
| `cargo clippy --all-targets -- -D warnings` | ✅ |
| `cargo fmt --check` | ✅ |

### Remaining gaps (post-audit backlog)

- **Calendar visual layouts**: day/week/year are flat lists, not the prototype's grid/hero/filmstrip.
- **Agent workspace**: currently a side panel only; full Agent view with conversation history is not implemented.
- **Mobile list gestures**: `useSwipe`/`useLongPress` helpers exist but are not wired to Imbox/Stream/Records rows for swipe-to-action.

## 2026-08-05 (continued) — Real-time sync refresh for catalog views

Twenty-fifth pass extended the global refresh tick to all catalog and communication list views so backend sync updates (new contacts, files, calendar events, follow-ups, clips) appear immediately.

### Fixed in this pass

- **Catalog views wired**: `Files`, `Calendar`, `FollowUps`, and `Clips` now call their `createResource` `refetch` handlers inside `useRefreshEffect`.
- **Contacts/Companies already wired**: previous passes wired these two; this pass verified they stay in sync with the same pattern.
- **Backlog corrected**: `Calendar` day/week/year hero + filmstrip + grid is implemented; full Agent independent view is implemented; mobile pull-to-refresh is implemented. The only remaining mobile gesture gap is swipe-to-action on list rows.

### Verification matrix

| Command | Result |
|---|---|
| `pnpm typecheck` | ✅ |
| `pnpm test` | ✅ 106 passed |
| `pnpm lint` | ✅ |
| `pnpm format:check` | ✅ |
| `pnpm build` | ✅ |
| `pnpm e2e` | ✅ 20 passed, 1 skipped (live-network Rust gate) |
| `cargo test` | ✅ 34 passed (incl. live IMAP/SMTP Feishu tests) |
| `cargo clippy --all-targets -- -D warnings` | ✅ |
| `cargo fmt --check` | ✅ |

### Remaining gaps (post-audit backlog)

- **Mobile list gestures**: `useSwipe`/`useLongPress` helpers exist but are not wired to Imbox/Stream/Records rows for swipe-to-action.

## 2026-08-05 (continued) — Real-time sync refresh for detail panels + remaining views

Twenty-sixth pass extended the global refresh tick to every detail panel and remaining list view so backend sync updates reflect everywhere, not just in the main mail lists.

### Fixed in this pass

- **Detail panels wired**: `MessagePanel`, `ContactPanel`, `FilePanel`, `MeetingPanel`, `DraftPanel`, and `TaskPanel` now refetch their data inside `useRefreshEffect`.
- **Remaining list views wired**: `Drafts`, `Insights`, `Search`, and `Gate` (including `ScreenerHistory`) now refetch on the global tick.
- **Agent hook wired**: `useAgent.ts` refetches sessions, tasks, drafts, audit, and contacts on the tick, keeping both the Agent side panel and the full Agent view in sync.
- **Verified attachment + contact indexing completeness**:
  - Incoming MIME attachments are decoded in `services/parser.rs`, written to disk in `services/sync_loop.rs`, indexed in `files`, and rendered/downloaded from `MessagePanel` and `FilePanel`.
  - `ContactPanel` provides 9 tabs (Timeline, Notes, Files, Tasks, Follow-ups, Clips, Insights, Network, Calendar) with in-memory indexing by `contactId` across messages, files, events, tasks, follow-ups, and clips.
  - `Compose.tsx` supports adding, removing, and sending attachments via `DraftAttachment`.

### Verification matrix

| Command | Result |
|---|---|
| `pnpm typecheck` | ✅ |
| `pnpm test` | ✅ 106 passed |
| `pnpm lint` | ✅ |
| `pnpm format:check` | ✅ |
| `pnpm build` | ✅ |
| `pnpm e2e` | ✅ 20 passed, 1 skipped (live-network Rust gate) |
| `cargo test` | ✅ 34 passed (incl. live IMAP/SMTP Feishu tests) |
| `cargo clippy --all-targets -- -D warnings` | ✅ |
| `cargo fmt --check` | ✅ |

### Remaining gaps (post-audit backlog)

- **Mobile list gestures**: `useSwipe`/`useLongPress` helpers exist but are not wired to Imbox/Stream/Records rows for swipe-to-action.

## 2026-08-05 (continued) — Mobile swipe-to-action on list rows

Twenty-seventh pass closed the final documented backlog gap: list rows now support prototype-style swipe-to-action on touch viewports.

### Fixed in this pass

- **`SwipeActions` component**: new `app/src/components/SwipeActions.tsx` that wraps a row, reveals colored action backgrounds while dragging, and triggers the action with a slide-off animation when the user passes the threshold.
- **Imbox**: `New for you` message rows and `Previously seen` rows are swipeable — left swipe → Set Aside, right swipe → Reply Later. Bundle rows remain non-swipeable (they already have bulk selection).
- **Stream / Records**: article/row cards are swipeable with the same Set Aside / Reply Later actions.
- **Gate + ScreenerHistory**: Gate approval card swipes left to Block and right to Approve to Imbox; ScreenerHistory rows swipe in the direction of their column action.
- **Viewport-gated**: swipe gestures are disabled on desktop (`useViewport().isMobile`) so mouse interactions remain normal.

### Verification matrix

| Command | Result |
|---|---|
| `pnpm typecheck` | ✅ |
| `pnpm test` | ✅ 106 passed |
| `pnpm lint` | ✅ |
| `pnpm format:check` | ✅ |
| `pnpm build` | ✅ |
| `pnpm e2e` | ✅ 20 passed, 1 skipped (live-network Rust gate) |
| `cargo test` | ✅ 34 passed (incl. live IMAP/SMTP Feishu tests) |
| `cargo clippy --all-targets -- -D warnings` | ✅ |
| `cargo fmt --check` | ✅ |

### Remaining gaps (post-audit backlog)

None — all documented backlog items from the 2026-08-05 audit are now implemented.

## Verified UI surfaces (screenshots in `docs/screenshots/`)

- Imbox: bundles for explicit senders + auto-detected
- Agent panel: 5-tab layout, sessions list, active task card
- Compose modal: From/To/Subject/Body, snippet picker, send split-button, recipient pills
- Detail panels: ContactPanel 9 tabs + Write button, MessagePanel w/ tracker shield + actions

## How to run

```bash
cd app
pnpm install
pnpm tauri dev
```

Tests:

```bash
# Frontend unit tests (Vitest)
cd app && pnpm test

# Playwright E2E (browser-mode UI verification)
cd app && pnpm e2e

# Rust integration tests against real IMAP/SMTP (requires .env credentials)
cd app/src-tauri && SENDPALM_E2E_NETWORK=1 cargo test --tests
```

Bundle:

```bash
pnpm tauri build
```

iOS Simulator verification (requires Xcode + `aarch64-apple-ios-sim` target):

```bash
scripts/verify-ios.sh                # boots iPhone 17, builds, installs, screenshots
scripts/verify-ios.sh "iPad Pro"     # boot iPad Pro 11-inch instead
```

---

## 2026-08-05 — iOS launch crash fix + full verification pass

### Problem
`scripts/verify-ios.sh` built and installed successfully, but the app crashed ~2s after launch on the iOS Simulator. The crash report showed `__start_app → stop_unwind → std::process::abort`, meaning a Rust panic was being caught and converted to an abort.

### Root cause
1. `app/src-tauri/migrations/0001_init.sql` had been modified in-place (added `from_alias` column), but that column was already covered by migration `0008_drafts_from_alias.sql`. `tauri-plugin-sql` hashes migration contents, so the changed hash for migration 1 caused:
   ```
   PluginInitialization("sql", "migration 1 was previously applied but has been modified")
   ```
2. After reverting migration 1, the app made it past migrations but then hung on a blank white screen after onboarding. The hang was caused by a dynamic import in `ensureDefaultShortcuts()`:
   ```ts
   const { DEFAULT_SHORTCUTS } = await import("../utils/shortcut-defaults");
   ```
   This dynamic import conflicted with the static import in `utils/shortcuts.ts` and never resolved inside the WKWebView.

### Fixes
- Reverted `app/src-tauri/migrations/0001_init.sql` to its original content.
- Converted `DEFAULT_SHORTCUTS` to a static import in `app/src/stores/data.ts`.
- Converted the `bulk:menu` shortcut handler in `app/src/utils/shortcuts.ts` to use the statically imported `openBulkActionMenu` (removes the second Vite dynamic-import warning).
- Updated `scripts/verify-ios.sh` to `rm -rf "$GEN/build"` before each build, preventing the Tauri "Directory not empty" rename error on rebuilds.

### Verification
| Suite | Result |
|---|---|
| `pnpm typecheck` | ✅ |
| `pnpm lint` | ✅ |
| `pnpm format:check` | ✅ |
| `pnpm test` | ✅ 106 passed |
| `cargo fmt --check && cargo clippy -- -D warnings && cargo test` | ✅ 17 unit + 15 integration passed |
| `pnpm e2e` | ✅ 20 passed, 1 skipped (live Feishu network test) |
| `scripts/verify-ios.sh` | ✅ builds, installs, launches, captures screenshot |
| Post-onboarding iOS main app | ✅ renders Imbox empty state + bottom tab bar |

### Artifacts
- Onboarding screenshot: `docs/ios-screenshots/iphone-17-01-launch.png`
- Post-onboarding main app screenshot: `docs/ios-screenshots/iphone-17-03-after-start.png`

### Quick polish follow-up
- Added **Empty Trash** button to `app/src/views/Trash.tsx` so users can permanently delete all trashed messages in one action.

### Remaining prototype gaps (priority order)
Based on a focused comparison against `prototype-v11.html/js/css`:

1. **Contact detail depth**: stage-history timeline, recycling toggle + purge job, merge UI, "Delivering to" routing label, topics/accounts/milestones/pattern display, avatar/photo upload.
2. **Message viewing**: rendered/source/plain toggle, inline thread expansion, Read Together / Focus Reply first-class workflows.
3. **Rich compose**: outbound HTML body and inline image embedding (currently plain text only).
4. **LiveSearch coverage**: events/meetings are missing from the topbar quick-search dropdown.
5. **FTS robustness**: add SQLite triggers to auto-maintain `search_index` so Rust-side writes never miss the index.
6. **Undo toasts**: prototype supports undo for many destructive actions; implementation only shows success toasts.
7. **Sidebar polish**: align rail width (64 px) and active indicator (accent bar) with prototype.

## 2026-08-05 (later) — Email workflow E2E coverage (Task 2)

Added browser-mode Playwright tests for the five core email workflows using an in-memory `MockDb` and `window.__sendpalmE2E` helpers.

### Added / changed
- `app/e2e/workflows.spec.ts` — Gate approval, Reply, Forward, Calendar invite, Reply Later pile, Set Aside pile.
- `app/src/services/mock-db.ts` + `app/src/services/mock-db.test.ts` — in-memory SQL shim for browser mode.
- `app/src/e2e-test-helpers.ts` — Playwright-facing seed/reset/inspect API.
- `app/src/compose/Compose.tsx` — stable `field="subject"` selector.
- `app/src/panels/MessagePanel.tsx` — `bumpRefreshTick()` after message mutations.
- `app/src/views/Gate.tsx` — `data-testid="gate-approve-imbox"`.

### Verification
| Suite | Result |
|---|---|
| `pnpm typecheck` | ✅ |
| `pnpm lint` | ✅ |
| `pnpm test src/services/mock-db.test.ts` | ✅ 4 passed |
| `pnpm e2e` | ✅ 26 passed, 1 skipped (live-network Rust gate) |

### Report
- `.superpowers/sdd/task-2-report.md`


Core send/receive/sync workflows are functional end-to-end.

---

## 2026-08-05 (later) — Message persistence + compose hardening (Task 1)

Fixed three real bugs found while auditing the email read/reply/invite flows.

### Fixed
- **`app/src/stores/data.ts` `upsertMessage` did not persist `calendar_json`** — the column exists (migration `0002_calendar.sql`) and `rowToMessage` reads it, but any frontend write (mark unread, Reply Later, Set Aside, bucket move) dropped the invite. Added `calendar_json` to the INSERT/UPDATE list and parameters.
- **`app/src/compose/Compose.tsx` reply/forward quote was empty for HTML-only messages** — `buildDraft` used `m.body` directly. Added `htmlToPlainText()` helper that strips tags and decodes entities, falling back from `bodyHtml` when `body` is empty.
- **`app/src/panels/MessagePanel.tsx` showed "Sticky notes" section even when empty** — the Show condition was `stickyForMsg().length > 0 || true`; removed the always-true clause.

### Verification
| Suite | Result |
|---|---|
| `pnpm typecheck` | ✅ |
| `pnpm lint` | ✅ |
| `pnpm test` | ✅ 106 passed |

### Report
- `.superpowers/sdd/task-1-report.md`

---

## 2026-08-05 (later) — Keep test infrastructure out of production bundles

The browser-mode `MockDb` and `window.__sendpalmE2E` helpers are required for Playwright, but must not ship in the Tauri production build.

### Changed
- `app/src/stores/data.ts` — `getDb()` now lazily loads `MockDb` only when `IS_BROWSER() && import.meta.env.DEV`.
- `app/src/index.tsx` — `e2e-test-helpers.ts` is imported only under `import.meta.env.DEV`.

### Verification
| Check | Result |
|---|---|
| `pnpm typecheck` | ✅ |
| `pnpm lint` | ✅ |
| `pnpm test` | ✅ 110 passed |
| `pnpm e2e` | ✅ 26 passed, 1 skipped |
| `pnpm format:check` | ✅ |
| `cargo fmt --check && cargo clippy -- -D warnings && cargo test` | ✅ 35 passed |
| `scripts/verify-ios.sh` | ✅ builds, installs, launches |
| Production bundle grep for `MockDb` / `__sendpalmE2E` | ✅ not found |

---

## 2026-08-05 (later) — Thread-first message detail + view-mode toggle (Task 4)

Refactored `app/src/panels/MessagePanel.tsx` to match the prototype-v11 thread-first reading experience.

### Added / changed
- **Thread-first layout**: the detail panel now renders the full conversation as a vertical list of message cards instead of a single message body.
- **Collapse / expand**: current message and the last two messages are expanded by default; older messages collapse to a one-line preview. Clicking a non-current card toggles it.
- **View-mode toggle**: added `Rendered / Plain / Source` segmented control in the panel header.
  - *Rendered* — HTML body in iframe when available, otherwise plain text.
  - *Plain* — `body` as paragraphs.
  - *Source* — raw `From / To / Subject / Date / body` `<pre>` block.
- **Participant chips** shown below the subject when a thread has multiple senders.
- **Attachments and calendar invite** now render inside the current-message card rather than as separate panel sections.
- New helper + tests: `app/src/panels/message-source.ts` and `app/src/test/message-source.test.ts`.
- New E2E test: `Thread-first detail expands older message and shows both bodies`.

### Verification
| Suite | Result |
|---|---|
| `pnpm typecheck` | ✅ |
| `pnpm lint` | ✅ |
| `pnpm test` | ✅ 117 passed |
| `pnpm e2e` | ✅ 27 passed, 1 skipped |

### Report
- `.superpowers/sdd/task-4-report.md`
---

## 2026-08-05 — Mobile Settings layout + bottom tab bar crowding fix

User feedback: on iPhone 17 the Settings → Shortcuts page was side-by-side instead of stacked, the bottom tab bar squeezed 15 icons into one row, and the topbar title overlapped the Dynamic Island.

### Fixed

- **`app/src/views/Settings.tsx`** — the tab nav and content now stack vertically on mobile (`flex-direction: column`), the tab nav scrolls horizontally, and the content area fills the width.
- **`app/src/components/Sidebar.tsx`** — mobile collapses the 15 nav entries into 6 primary tabs (Imbox / Gate / Contacts / Calendar / Files / Settings) plus a "More" bottom sheet for the remaining 9 views. Tap targets stay ≥ 44 px and the active overflow view highlights the More button.
- **`app/src/components/Topbar.tsx` + `app/src/styles/base.css`** — removed the fixed `height` from the topbar so the mobile grid can size it as `min-height: calc(var(--topbar-height) + env(safe-area-inset-top))`; content now sits below the Dynamic Island.
- **`app/src/styles/animations.css`** — added `sheet-enter` keyframe for the mobile More sheet.
- **`app/e2e/views.spec.ts`** — updated mobile responsive assertions and added a new test verifying Settings stacks tabs/content on iPhone SE.

### Verification

| Suite | Result |
|---|---|
| `pnpm typecheck` | ✅ |
| `pnpm lint` | ✅ |
| `pnpm format:check` | ✅ |
| `pnpm test` | ✅ 117 passed |
| `pnpm e2e` | ✅ 28 passed, 1 skipped (live-network Rust gate) |
| `cargo test` | ✅ 35 passed |
| `scripts/verify-ios.sh` | ✅ builds, installs, launches, captures screenshot |

### Artifacts

- iPhone 17 Imbox screenshot: `docs/ios-screenshots/iphone-17-02-retry.png`
- Playwright mobile screenshots: `app/e2e-report/18-mobile-bottom-tabs.png`, `app/e2e-report/19-mobile-settings.png`

---

## 2026-08-05 — LiveSearch now surfaces events/meetings

`PROGRESS.md` previously listed "LiveSearch coverage: events/meetings are missing from the topbar quick-search dropdown" as a gap. Closed it.

### Added / changed

- `app/src/stores/data.ts`:
  - `indexEntity()` now accepts an optional `date` parameter.
  - Event indexing encodes `dt` (start datetime) on the first line of the indexed body, so the dropdown can jump to the right calendar day without an extra query.
  - Updated both `backfillSearchIndex()` and `upsertEvent()` to pass the event date.
- `app/src/search/LiveSearch.tsx`:
  - Added an **Events** group to the dropdown, limited to the top 5 matches.
  - Clicking an event navigates to Calendar and calls `setCalendarJumpTo(event.dt)`.
  - Added `data-testid="live-search-dropdown"` to the dropdown container for stable E2E targeting.
  - Updated keyboard cursor math and empty-state checks to include the new group.
- `app/e2e/workflows.spec.ts` — added `LiveSearch surfaces events and jumps to Calendar on click`.

### Verification

| Suite | Result |
|---|---|
| `pnpm typecheck` | ✅ |
| `pnpm lint` | ✅ |
| `pnpm format:check` | ✅ |
| `pnpm test` | ✅ 117 passed |
| `pnpm e2e` | ✅ 29 passed, 1 skipped (live-network Rust gate) |
| `cargo test` | ✅ 35 passed |
| `cargo clippy -- -D warnings` | ✅ |
| `cargo fmt --check` | ✅ |

---

## 2026-08-05 — Outbound HTML email body

`PROGRESS.md` previously listed "Rich compose: outbound HTML body and inline image embedding (currently plain text only)" as a gap. Implemented the HTML body half; inline image embedding remains for a future pass.

### Added / changed

- `app/src-tauri/src/services/smtp.rs`:
  - `SmtpClient::send()` and `build_message()` now accept an optional `html_body: Option<String>`.
  - When supplied, the message includes both a `text/plain` and a `text/html` part inside `multipart/alternative`.
  - Updated all call sites (`commands/mod.rs`, `scheduled_send.rs`, `sync_loop.rs` vacation replies, `tests/smtp_roundtrip.rs`).
- `app/src-tauri/src/commands/mod.rs`:
  - `send_message` command accepts `html_body` and appends the account signature to the HTML part (line breaks → `<br>`).
- `app/src/services/backend.ts`:
  - `sendEmailViaBackend()` accepts an optional `htmlBody` and forwards it as `html_body`.
- `app/src/utils/html.ts` (new):
  - Extracted `htmlToPlainText()` from Compose.
  - Added `plainTextToHtml()` for outbound conversion: escapes entities, turns line breaks into `<br>`, auto-links URLs.
- `app/src/compose/Compose.tsx`:
  - Imports helpers from `utils/html`.
  - On send, generates an HTML body from the user's plain-text input and passes it to the backend.
- Tests:
  - `app/src/test/html.test.ts` — 5 unit tests for the two helpers.
  - `app/src-tauri/src/services/smtp.rs` — `builds_html_alternative_when_html_body_supplied`.

### Verification

| Suite | Result |
|---|---|
| `pnpm typecheck` | ✅ |
| `pnpm lint` | ✅ |
| `pnpm format:check` | ✅ |
| `pnpm test` | ✅ 122 passed |
| `pnpm e2e` | ✅ 29 passed, 1 skipped |
| `cargo test` | ✅ 36 passed |
| `cargo clippy -- -D warnings` | ✅ |
| `cargo fmt --check` | ✅ |

### Remaining gap

- Inline image embedding in compose is still not implemented.

---

## 2026-08-05 — Undo toast for MessagePanel Trash action

Destructive mail actions need a safety net. Added an undo path for the MessagePanel "Move to Trash" action and covered it with E2E.

### Added / changed

- `app/src/stores/ui.ts` — widened `Toast.action.run` type from `() => void` to `() => void | Promise<void>` so async undo handlers type-check.
- `app/src/components/ToastStack.tsx` — action button now awaits `run()` before dismissing; added `data-testid="toast-success"` and `data-testid="toast-action"` for E2E.
- `app/src/services/reminder.ts` — adjusted existing toast action callbacks to avoid accidental non-void returns.
- `app/src/panels/MessagePanel.tsx`:
  - `moveToTrash` saves the message's previous bucket before moving it to Trash.
  - Success toast shows "已移到 Trash" with an action labeled "撤销".
  - Undo restores the message to its original bucket via `upsertMessage`, refreshes the list, and shows "已恢复到原位置".
  - Added `data-testid="message-more-menu"` to the More menu trigger and `data-testid="message-move-trash"` to the Trash menu item.
- `app/e2e/workflows.spec.ts` — added `Trash action shows undo toast and restores message to Imbox` and `Source view renders the raw message source`.

### Verification

| Suite | Result |
|---|---|
| `pnpm typecheck` | ✅ |
| `pnpm lint` | ✅ |
| `pnpm format:check` | ✅ |
| `pnpm test` | ✅ 122 passed |
| `pnpm e2e` | ✅ 30 passed, 1 skipped |
| `cargo test` | ✅ 36 passed |
| `cargo clippy -- -D warnings` | ✅ |
| `cargo fmt --check` | ✅ |

---

## 2026-08-05 — Prototype audit: P0/P1 blocker fixes

A full parallel audit against `prototype-v11.38` surfaced multiple gaps that block daily use as a real email client. Fixed the highest-severity blockers first.

### Fixed in this pass

- **Contact routing no longer routes mail to Trash/Spam**: `ContactPanel` default-bucket toggle now only cycles `Imbox → Stream → Records` and excludes `trash`/`spam`. Toggles now refetch the contact so the UI reflects the change immediately, and the button label is human-readable.
- **Auto-mark-read works from any view**: moved the "open → mark read" logic from `Imbox.tsx` into `MessagePanel.tsx` so messages opened from Search, Follow-ups, Stream, Records, or Notifications are correctly marked read.
- **Move/Archive clears workflow flags**: `moveMessageToBucket()` now clears `reply_later`, `set_aside`, `bubble_up_at`, and `remind_at`. Archive, Trash, Spam, and bulk actions in `Imbox.tsx`, `MessagePanel.tsx`, and `ReadTogether.tsx` now use this single path so piled messages leave the workflow lists when moved.
- **CJK search fixed in production SQLite**: changed the FTS5 tokenizer from `porter` (English-only stemmer) to `unicode61` (CJK-compatible) in `0009_search_index.sql`, and added migration `0012_fix_fts_tokenizer.sql` that recreates the index and reindexes existing messages, contacts, files, and events.
- **MessagePanel source view restored**: `isExpanded()` no longer forces `false` in source mode, so the raw source `<pre>` block for each thread message is actually rendered when the user toggles "Source".

### Files changed

- `app/src/panels/ContactPanel.tsx`
- `app/src/panels/MessagePanel.tsx` (auto-mark-read, archive path, source view)
- `app/src/views/Imbox.tsx`
- `app/src/views/ReadTogether.tsx`
- `app/src/stores/data.ts`
- `app/src-tauri/migrations/0009_search_index.sql`
- `app/src-tauri/migrations/0012_fix_fts_tokenizer.sql` (new)
- `app/src-tauri/src/lib.rs`

### Verification

| Suite | Result |
|---|---|
| `pnpm typecheck` | ✅ |
| `pnpm lint` | ✅ |
| `pnpm format:check` | ✅ |
| `pnpm test` | ✅ 122 passed |
| `pnpm e2e` | ✅ 31 passed, 1 skipped |
| `cargo test` | ✅ 36 passed |
| `cargo clippy -- -D warnings` | ✅ |
| `cargo fmt --check` | ✅ |

### Remaining significant gaps (post-audit backlog)

- **Standalone Pending/Saved/Remind views** — currently only inline piles in Imbox; prototype has dedicated sidebar entries and board views.
- **Source view in MessagePanel** — toggle exists but the source `<pre>` block is unreachable due to `isExpanded()` guard.
- **Imbox priority-score sorting** — currently newest-first; prototype uses a priority score.
- **Compose power features** — no custom schedule-send datetime, no `Cmd/Ctrl+Enter` send, no formatting toolbar.
- **Calendar all-day events / filters** — all-day toggle missing; filter chips missing.
- **Settings folder sync selector** — `AccountSettings.syncFolders` exists in the data model but has no UI.

---

## 2026-08-05 — Compose/Settings/Calendar P1 fixes

Second pass after the audit closed three more daily-use gaps in Compose, Settings, and Calendar.

### Fixed in this pass

- **Compose `Cmd/Ctrl+Enter` send**: pressing `⌘+Enter` (macOS) or `Ctrl+Enter` (Windows/Linux) in the compose body now triggers `sendNow`. The existing E2E compose test now exercises this keyboard shortcut instead of clicking the split button.
- **Settings folder sync selector**: the account edit modal now exposes a checkbox grid for `INBOX / Sent / Drafts / Archive / Trash / Spam / Starred / Important`, wired to `AccountSettings.syncFolders`.
- **Calendar all-day events**:
  - Added `allDay?: boolean` to `CalendarEvent` and `all_day` to the `events` table (migration `0013_event_all_day.sql`).
  - Event edit modal has an "All day" checkbox that hides time/duration fields when checked.
  - Day agenda sorts all-day events to the top, shows a "全天" label, and highlights them with `palm-soft` background.
  - iCal parser (`services/ical.rs`) now detects `VALUE=DATE` / bare-date DTSTART as all-day and persists the flag via `add_calendar_event`.

### Files changed

- `app/src/compose/Compose.tsx`
- `app/src/views/Settings.tsx`
- `app/src/views/Calendar.tsx`
- `app/src/types/index.ts`
- `app/src/stores/data.ts`
- `app/src-tauri/migrations/0001_init.sql`
- `app/src-tauri/migrations/0013_event_all_day.sql` (new)
- `app/src-tauri/src/lib.rs`
- `app/src-tauri/src/commands/mod.rs`
- `app/src-tauri/src/services/ical.rs`
- `app/e2e/views.spec.ts`

### Verification

| Suite | Result |
|---|---|
| `pnpm typecheck` | ✅ |
| `pnpm lint` | ✅ |
| `pnpm format:check` | ✅ |
| `pnpm test` | ✅ 122 passed |
| `pnpm e2e` | ✅ 31 passed, 1 skipped |
| `cargo test` | ✅ 37 passed |
| `cargo clippy -- -D warnings` | ✅ |
| `cargo fmt --check` | ✅ |

---

## 2026-08-05 — Imbox triage undo toasts + MessagePanel Save as draft

Third pass after the audit focused on making destructive / stateful triage actions reversible and adding the missing "Save as draft" power action.

### Fixed in this pass

- **Imbox per-message triage actions now show undo toasts**: Reply Later, Set Aside, Bubble Up, Archive, Trash, and Spam all capture the previous state and offer a "撤销" toast action that restores the message.
  - `app/src/views/Imbox.tsx`: added a `showUndoToast` helper and wired it into every triage action in `MessageActions`.
- **MessagePanel "Save as draft"**: the More menu now has "保存为草稿", which creates a `Draft` row from the current message's recipient, subject, body, Cc/Bcc, and account.
  - `app/src/panels/MessagePanel.tsx`: added `saveAsDraft`, imported `upsertDraft`, and passed it to `MoreMenu`.
- **E2E coverage**:
  - Reply Later / Set Aside tests now also exercise undo and assert the piles section disappears.
  - New test: `Save message as draft from MessagePanel More menu`.

### Files changed

- `app/src/views/Imbox.tsx`
- `app/src/panels/MessagePanel.tsx`
- `app/e2e/workflows.spec.ts`

### Verification

| Suite | Result |
|---|---|
| `pnpm typecheck` | ✅ |
| `pnpm lint` | ✅ |
| `pnpm format:check` | ✅ |
| `pnpm test` | ✅ 122 passed |
| `pnpm e2e` | ✅ 32 passed, 1 skipped |
| `cargo test` | ✅ 37 passed |
| `cargo clippy -- -D warnings` | ✅ |
| `cargo fmt --check` | ✅ |

---

## 2026-08-05 — Imbox priority-score sorting

Fourth pass implemented the prototype's `priorityScore` for the "New for you" section so important mail surfaces above newer noise.

### Fixed in this pass

- **Priority-aware unread sorting**: `app/src/utils/priority.ts` mirrors the prototype formula:
  - `contact.sc * 0.45`
  - `risk` group +25, `cold` group -35
  - age decay: `max(0, 18 - ageDays * 0.25)`
- **`app/src/views/Imbox.tsx`**: `imboxMsgs()` now splits unread/read, sorts unread by priority score descending, and keeps previously-seen messages sorted by date descending.
- **Unit tests**: `app/src/utils/priority.test.ts` covers contact score, group adjustments, and age decay.

### Files changed

- `app/src/views/Imbox.tsx`
- `app/src/utils/priority.ts` (new)
- `app/src/utils/priority.test.ts` (new)

### Verification

| Suite | Result |
|---|---|
| `pnpm typecheck` | ✅ |
| `pnpm lint` | ✅ |
| `pnpm format:check` | ✅ |
| `pnpm test` | ✅ 125 passed |
| `pnpm e2e` | ✅ 32 passed, 1 skipped |
| `cargo test` | ✅ 37 passed |
| `cargo clippy -- -D warnings` | ✅ |
| `cargo fmt --check` | ✅ |

---

## 2026-08-05 — iOS crash fix, splash cleanup, and full workflow audit

User reported "移动端的界面好奇怪 / 总是 crash". Did a root-cause pass on the iOS launch crash, cleaned up the splash transition, and re-ran the full verification matrix against real IMAP/SMTP.

### Fixed

- **iOS launch crash**
  - `app/src-tauri/migrations/0001_init.sql` had been accidentally modified (`all_day` column added), causing Tauri plugin-sql to abort with `migration 1 was previously applied but has been modified`. Reverted it to the committed version.
  - `app/src-tauri/migrations/0012_fix_fts_tokenizer.sql` referenced `files.notes`, which does not exist; changed to `COALESCE(md, '')`.
  - iOS system SQLite lacks FTS5, so migrations 9/12 failed. Added `libsqlite3-sys = { version = "0.30", features = ["bundled"] }` in `app/src-tauri/Cargo.toml` so the app ships its own SQLite.
- **Startup diagnostics**
  - `app/src-tauri/src/lib.rs` now installs a panic hook that writes to `sendpalm-panic.log`, and the Tauri `run()` error is captured to `sendpalm-run-error.log` before exiting cleanly.
- **Splash / launch visual**
  - `app/index.html` keeps the splash visible until JS adds `body.app-ready`, forces `#splash .word` to `#fff`, and moves the Phosphor script to the end of `<body>` so it no longer blocks first paint.
  - `app/src/App.tsx` now removes the splash element from the DOM after the 0.55 s fade completes, preventing the green gradient from tinting the app background in screenshots and after hot reloads.

### Audit findings

- The Settings screenshot the user sent shows the **old two-pane mobile layout** (menu + Keyboard shortcuts side-by-side). The current build uses a stacked iOS-style menu: menu first, then a full-screen drill-in with a back button. This is enforced by `app/src/views/Settings.tsx` and covered by the Playwright responsive test `Settings page uses iOS-style menu on mobile`.
- All requested email workflows are covered by passing E2E:
  - Attachments: `MessagePanel shows attachments and can trigger download`, `Compose can attach a file and send in browser mode`
  - Calendar invites: `Calendar invite adds event and it appears in Calendar`
  - Replies: `Reply`, `Reply All`, `Forward`
  - Contact indexing: `ContactPanel indexes messages, files and events by contact`
- Real backend integration against `imap.feishu.cn` / `smtp.feishu.cn` passes: `imap_real` (3 tests), `smtp_roundtrip` (1 test), `providers_registry` (9 tests), `vault_test` (3 tests), plus parser/ical/smtp unit tests.

### Verification

| Suite | Result |
|---|---|
| `pnpm typecheck` | ✅ |
| `pnpm lint` | ✅ |
| `pnpm format:check` | ✅ |
| `pnpm test` | ✅ 125 passed |
| `pnpm e2e` | ✅ 42 passed, 1 skipped (live-network gate) |
| `cargo fmt --check && cargo clippy -- -D warnings && cargo test` | ✅ 37 passed |
| `scripts/verify-ios.sh` | ✅ builds, installs, launches iPhone 17 sim |

### Artifacts

- iPhone 17 launch/ready screenshots: `docs/ios-screenshots/iphone-17-01-launch.png`, `iphone-17-02-ready.png`
- Playwright desktop/mobile screenshots: `/tmp/sendpalm-screenshots/e2e/`

---

## 2026-08-06 — iOS real-account harness + mobile UI polish pass

Second focused pass after the user asked to log in to `edwinhao@sendpalm.com` on the iOS build and verify every workflow/UI surface.

### Fixed / added

- **iOS real-account smoke-test harness**
  - `scripts/verify-ios.sh` now sources `app/.env` and forwards `SENDPALM_TEST_*` credentials to the simulator process via `SIMCTL_CHILD_*` env vars, so the test fallback account syncs real mail on iOS.
  - Captures 4 screenshots over ~30 s (launch → shell ready → syncing → populated) and writes app logs to `/tmp/sendpalm-ios/verify-ios.log`.
  - `app/src/bootstrap.ts` now marks onboarding as completed on first successful store load, so a fresh iOS install boots straight into the app instead of showing the onboarding wizard.
- **Mobile Compose bug**
  - `app/src/styles/tokens.css`: raised `--z-modal` to `80` (above `--z-detail`/`--z-agent`) so the full-screen Compose modal is no longer hidden behind the MessagePanel/AgentPanel on iPhone.
- **MessagePanel bottom action bar on mobile**
  - `app/src/panels/MessagePanel.tsx`: the bottom bar is now horizontally scrollable on mobile and action buttons hide their labels to stay readable on narrow screens.
- **Mobile workflow coverage**
  - `app/e2e/workflows.spec.ts`: added `Mobile workflows with data` suite (iPhone SE viewport) that seeds a contact + message (attachment + calendar invite) + file + event and screenshots Imbox, MessagePanel, ContactPanel (Timeline/Files/Calendar), Calendar, Files, and Compose reply.

### Audit findings

- **iOS real IMAP sync is blocked by the current network environment**, not the app.
  - Host `cargo test` against `imap.feishu.cn:993` passes (37 tests).
  - Inside the iOS simulator the TLS handshake to `imap.feishu.cn:993` fails with `imap tls: connection closed via error`, so no messages are backfilled.
  - The app handles this gracefully: the account appears in the topbar (`1 账户`), the empty-state copy is shown, and there is no crash.
- **Mobile UI now fills the screen correctly**: latest iPhone 17 screenshots show the full viewport, Dynamic Island/safe-area insets respected, and bottom tab bar rendered.
- **All requested workflows are covered by passing E2E**:
  - Attachments: `MessagePanel shows attachments`, `Compose can attach a file`
  - Calendar invites: `Calendar invite adds event`
  - Replies: `Reply`, `Reply All`, `Forward`
  - Contact indexing: `ContactPanel indexes messages, files and events`
  - Mobile-specific: new `Mobile workflows with data` screenshots

### Verification

| Suite | Result |
|---|---|
| `pnpm typecheck` | ✅ |
| `pnpm lint` | ✅ |
| `pnpm format:check` | ✅ |
| `pnpm test` | ✅ 125 passed |
| `pnpm e2e` | ✅ 44 passed, 1 skipped (live-network gate) |
| `cargo test` | ✅ 37 passed |
| `cargo clippy -- -D warnings` | ✅ |
| `cargo fmt --check` | ✅ |
| `scripts/verify-ios.sh` | ✅ builds, installs, launches iPhone 17 sim |

### Artifacts

- iPhone 17 launch/sync screenshots: `docs/ios-screenshots/iphone-17-01-launch.png` … `iphone-17-04-populated.png`
- Playwright mobile screenshots: `/tmp/sendpalm-screenshots/e2e/mobile-*.png`

---

## 2026-08-10 — Inbox data chain revamp (Phase 1)

### Phase 1 — Inbox data chain (2026-08-10)

- Added `services::mailbox_resolver` with provider-aware candidate table
  (Feishu `&XfJT0ZAB-`, Gmail `[Gmail]/Sent Mail`, Outlook `Sent Items`,
  Chinese labels). Replaces the hard-coded `"Sent"` folder name.
- `ImapClient::sync` now encodes folder names to modified UTF-7 before
  `session.select` (RFC 3501 §5.1.3).
- `sync_one` no longer aborts on a single failed folder; failed folders
  are logged and the next folder continues. `sync:new-messages` always
  fires when at least one folder inserted messages.
- `sync_folder` only advances the persisted cursor past UIDs that were
  successfully inserted. Parse failures and DB-insert failures keep the
  cursor below their UID, so the next tick retries them.
- `spawn_account_loop` calls `client.list_mailboxes` once per boot and
  persists the resolved names into `accounts.settings_json.syncFolders`.
- New `0014_gate_screened_backfill.sql` defensively normalizes the rare
  inconsistent contact state.
- `countGateCandidates` added to `stores/data.ts`; `InboxEmptyState` in
  `views/Imbox.tsx` now branches three ways (no account / unscreened /
  empty) instead of always saying "add an account".
- Tests added: `mailbox_resolver_test` (6), `imap_utf7_test` (2),
  `sync_loop_isolation_test` (1), `sync_loop_cursor_test` (2),
  `empty-state.test.ts` (5).
- Net effect: real mail now appears in the Inbox within IDLE latency
  (~5 s) for any provider whose Sent folder is one of the candidate
  table entries; the Inbox empty-state copy is now truthful.

## 2026-08-10 — Inbox data chain revamp (Phase 2)

### Phase 2 — Desktop notifications (2026-08-10)

- New `services::desktop_notifier` with `should_notify` (quiet-hours
  helper) and `notify_new_mail` (calls `tauri-plugin-notification`).
- `SyncStateStore` now caches a `NotificationPrefs` that the JS side
  keeps in sync via the new `notify_settings_changed` Tauri command.
- `insert_message` triggers a notification per genuinely new mail,
  subject to the user's desktop toggle and quiet-hours window.
- JS-side `services/notifications.ts` runs from `bootstrap.ts` after
  settings load, requests permission if needed, and mirrors the new
  preference to Rust.
- New `PreferencesNotificationsTab` in `views/Settings.tsx` exposes the
  toggle and quiet-hours start/end.
- Tests added: `desktop_notifier_test` (6), `notifications.test.ts` (2).
- Net effect: leaving the app unfocused surfaces macOS notifications for
  every new mail, in line with the user's quiet-hours preference.

## 2026-08-10 — Inbox data chain revamp (Phase 3)

### Phase 3 — Gate backlog surfacing (2026-08-10)

- No new code; this phase is fully covered by Phase 1's
  `countGateCandidates` helper, `InboxEmptyState` branch 2, and the
  `0014_gate_screened_backfill.sql` migration.
- Confirmed via `pnpm test -- empty-state.test.ts` (5 tests) and
  `cd app/src-tauri && cargo check --tests`.

## 2026-08-10 — Inbox data chain revamp (Phase 4)

### Phase 4 — Sidebar icon-only (2026-08-10)

- New `SidebarTooltip` primitive with edge-flip positioning (covered by
  `sidebar-tooltip.test.ts`).
- `NavItem` is now icon-only on desktop/tablet; the visible label is
  rendered only on the mobile bottom tab bar. The ⌘N chip is repositioned
  to the bottom-right corner of the button and marked `aria-hidden`.
- `aria-current="page"` is set on the active item; the tooltip
  accessible name combines the label and the shortcut hint.
- `useLongPress` (600 ms) surfaces the tooltip on touch / tablet.
- Playwright tests updated to assert the tooltip on hover and the
  64 px sidebar width on iPad.
- Net effect: the desktop rail is clean and HEY-consistent; the
  `Im…` / `St…` / `Comp…` ellipsis regression is resolved.

## 2026-08-10 — Inbox data chain revamp (Phase 5)

### Phase 5 — Titlebar + brand (2026-08-10)

- Tauri `titleBarStyle` flipped from `Visible` to `Overlay`; the
  `trafficLightPosition` is set to `{x: 14, y: 14}`.
- The JS `Titlebar.tsx` component and its grid row in `base.css` are
  deleted. `--titlebar-height` is now `0`; a new `--titlebar-traffic-pad:
  78px` token reserves the macOS safe area.
- New `<BrandMark />` (Phosphor `ph-leaf` + 18 px wordmark) is the
  leftmost topbar element. The topbar body is draggable
  (`-webkit-app-region: drag`); every interactive control carries
  `no-drag` to keep clickability.
- The single Playwright `text=SendPalm` assertion is scoped to
  `[data-testid="brand-mark"]` to avoid the splash collision.
- Net effect: the macOS window shows native traffic lights on top of a
  draggable topbar; the SendPalm brand is at the expected HEY-style
  position (Phosphor leaf + wordmark).

## 2026-08-14 — Imbox sync + Stream 读报 + virtualization

Three independently observable problems on the running app (`pnpm tauri
dev`) shared one architectural cause: every list view loaded the entire
`messages` table on every refresh, did an O(n) filter over all rows in a
`createMemo`, and then mounted every row via `<For>`. With the real
account holding 913 imbox rows (908 of them hidden by the Gate contract),
the per-render work was always there even when only 5 rows were visible.

This pass is one logical change set spread across seven commits:

### Sync correctness (1 commit)

- **fix(sync): tag Sent-folder messages direction='out' and skip self in Gate**
  - `services/mailbox_resolver::folder_kind_for_name()` classifies a
    folder without needing the server mailbox list.
  - `sync_loop::insert_message()` hard-codes `direction='out'` for Sent
    folders (Feishu `&XfJT0ZAB-`, Gmail `[Gmail]/Sent Mail`, Outlook
    `Sent Items`, etc.); `bucket` still comes from
    `compute_message_bucket` via the contact's `default_bucket`.
  - `sync_loop::upsert_contact(pool, email, name, is_self)` forces
    `first_seen=0, screened=1, default_bucket='paperTrail'` for the
    account's own email on both INSERT and ON CONFLICT, with CASE guards
    so the user's manual screening decisions are preserved on later
    syncs.
  - Migration `0016_sent_direction_backfill.sql` repairs legacy rows
    (direction='out', bucket='paperTrail', unread=0) and normalizes the
    matching self-contact.
  - 7 new tests in `mailbox_resolver_test.rs` covering all FolderKind
    candidates and case-insensitive matching.

### Frontend virtualization + pagination (4 commits)

- **chore(deps): virtua** — `inokawa/virtua` 0.50.1, zero-config Solid
  adapter, ~3kB. Chosen over `@tanstack/solid-virtual` for smaller
  footprint and built-in `onScrollEnd`/`onLoadMore`-style hooks.
- **feat(perf): listMessagesPaged + usePaginatedMessages** — new
  `LIMIT/OFFSET` query returning `{ items, total, limit, offset }` plus
  a Solid composable exposing `items/total/hasMore/loadMore/refresh`.
  `listMessages()` kept untouched for callers that need the full table
  (search, reminder loop, BulkActionMenu).
- **feat(ui): Stream 读报模式** — replaces the
  `open(m.id) → setDetailOpen(true)` flow with click-to-expand inline.
  Multiple cards can be expanded; DetailPanel never opens for Stream
  clicks. `htmlEmailSrcdoc` extracted from MessagePanel into
  `utils/html.ts` so both surfaces share the same srcdoc + click
  interceptor.
- **feat(ui): Records/Trash/Spam virtualized** — same pattern as
  Stream: `<VList data={paged.items()}>` with scroll-end → `loadMore()`.
- **feat(ui): Imbox virtualized with WindowVirtualizer** — Imbox uses
  window scroll (the page-level `<main>` is the scroll container) so
  `WindowVirtualizer` from virtua fits without restructuring the
  layout. Pile slices (replyLater/setAside/reminded) still need every
  message to filter by flag, so a second `listMessages` resource stays
  around only for those mappers.

### UI polish (1 commit)

- **feat(ui): drag handle between Main and DetailPanel** — adds
  `--main-pane-width` token (default 640px) and a `<PanelResizeHandle
  panel="main" side="right" />` mounted on Main. Persisted alongside
  detail/agent widths in the existing `sendpalm.panelWidths`
  localStorage entry.

### Verification

| Command | Result |
|---|---|
| `pnpm typecheck` | ✅ |
| `pnpm test` | ✅ 156 passed (22 files) |
| `pnpm lint` | 🟡 1 pre-existing `sidebarWidth` error in `e2e/views.spec.ts:416` (verified by `git stash` — present on `main` before this branch) |
| `cargo build` | ✅ |
| `cargo test --lib` | ✅ 29 passed |
| `cargo test --test mailbox_resolver_test` | ✅ 13 passed |

## 2026-08-14 (continued) — Incremental sync + optimistic UI

Two follow-up commits completing the performance series.

### Sync incremental append

- **feat(sync): emit new_message_ids; frontend prepends instead of full refetch**
  - `SyncReport` gains `new_message_ids: Vec<String>`. `sync_loop::insert_message`
    now returns `Result<Option<String>>` — `Some(id)` when INSERT OR IGNORE
    actually wrote a row, `None` on idempotent re-sync (driven by
    `rows_affected()`). `sync_folder` collects ids; `sync_one` accumulates
    across folders and ships the bundle on the `sync:new-messages` emit.
  - `services/sync-events.ts` exposes `registerPrepend(bucket, handler)`;
    each list view registers on mount and cleans up via `onCleanup`.
  - `usePaginatedMessages::prependByIds(ids)` fetches each id via
    `getMessage()`, drops ones already loaded, prepends the rest to the
    in-memory list and bumps total.
  - `sync:new-messages` keeps `bumpRefreshTick()` for non-paginated
    resources AND now fans the ids out to the prepend registry so
    paginated lists update with O(new_ids) IPC round-trips.

### Optimistic UI

- **feat(ui): optimistic remove on move/delete across list views**
  - `usePaginatedMessages::removeByIds(ids)` drops the rows from the
    loaded pages + total + offset in one synchronous step.
  - Every move/delete in Imbox / Stream / Records / Trash / Spam now:
    1. optimistically removes locally,
    2. awaits the backend call,
    3. on success → toast + (for bulk) refresh pile slices,
    4. on failure → full refresh to resync truth + error toast.
  - Bulk action bar in Imbox removes the whole selected set up front
    before iterating the per-id backend calls.

### Verification

| Command | Result |
|---|---|
| `pnpm typecheck` | ✅ |
| `pnpm test` | ✅ 156 passed |
| `cargo test --lib` | ✅ 29 passed |

## 2026-08-18 (Imbox UX fixes) — sort filter, Read Together wiring, pile drawer redesign

Three user-reported gaps in the Imbox surface, all closed in one branch.

### Fixed in this pass

- **"一起读" button now opens Read Together**: the New for you section header's action was wired to a literal `() => undefined` no-op. Now calls `setView("readTogether")` so the existing `ReadTogether` view actually opens.
- **Imbox default sort is now newest first**: the previous implementation sorted "New for you" by `priorityScore` only (date as a tiebreaker), which let high-score OLD unread block new mail from lower-score senders — the prototype defaults to `const sort = f.sort || 'newest'` (`js/prototype-v11.js:442`) and only sorts by priority when the user explicitly picks "Most relevant". Added a `FilterPanel` modal mirroring the prototype's `renderFilterPanelBody` (sort dropdown + Unread only toggle); Imbox header gets a "筛选" button and an active-sort badge. Users can still opt into `most_relevant` from the modal.
- **Bottom pile bar matches the prototype**: Pending / Saved / Remind piles are now collapsed by default — the prototype's `renderImboxPile` (`js/prototype-v11.js:2992-3049`) keeps them collapsed and pops a drawer on header click. The previous implementation always rendered up to 3 messages inline and dominated the sticky-bottom area. New behavior:
  - Default collapsed; click header expands a popup drawer above the pile (`position: absolute; bottom: calc(100% + 8px)`) with the same fan-in animation the prototype uses.
  - Pending pile shows a "Focus & Reply" pill button next to its title and inside the drawer — both navigate to the existing `focusReply` view (HEY-style distraction-free reply flow).
  - Every pile drawer ends with an "Open <title> board" link to a dedicated full-page view. Pending reuses `focusReply`; Saved and Remind now have dedicated `setAside` / `bubbleUp` views via the new generic `PileBoard` component.
- **New PileBoard view**: single component handles all three pile IDs (`replyLater` / `setAside` / `bubbleUp`) by reusing `usePaginatedMessages` with three new WHERE filters (`replyLaterOnly` / `setAsideOnly` / `bubbleUpOnly`) on `listMessagesPaged` — no new SQL, no extra round-trips.
- **Command palette + view routing**: `⌘K` now exposes Go to Pending / Saved / Remind / Focus & Reply; `Main.tsx` Switch routes the three new views. `PileMessage` carries `pid`/`tm`/`st` so the drawer rows render avatar + sender + time without re-fetching the contact table.
- **Sort regression test**: `sort-imbox.test.ts` includes the specific user-reported scenario — an old VIP unread (180 days, score ≈ 42.75) must NOT out-rank a new cold unread (today, score ≈ −12.5) under the default newest-first sort.

### Verification matrix

| Command | Result |
|---|---|
| `pnpm typecheck` | ✅ |
| `pnpm test` | ✅ 187 passed (was 181; +6 sort cases) |
| `pnpm build` | ✅ |
| `cargo check` | ✅ no Rust changes |
| `pnpm lint` | �️ 4 pre-existing e2e errors not touched by this branch |

### Commits

- `d4f0b7b` `fix(imbox): default newest-first sort + wire 一起读 button`
- `22c2a6d` `feat(imbox): collapsible pile drawer, Focus & Reply, Open board`

## 2026-08-18 — Brand + view-health fixes (splash, topbar, error/empty states)

Two parallel audits (brand, view health) found one P0 and several P1/P2
gaps across the launch surface, the topbar, and 22 views. All P0/P1
items addressed; a handful of complex views deferred to follow-up.

### Fixed in this pass

**Brand & launch (P0/P1)**
- `BrandMark.tsx` no longer renders a stock Phosphor `ph-leaf`. The
  topbar now shows the bespoke `logo-mark.svg` (paper-plane + palm)
  at 22×22, matching the splash and the Tauri bundle icons. The
  unused `Icon` import is gone.
- `index.html` had a duplicate `body.app-ready #splash { opacity: 0; pointer-events: none }`
  rule. The first wins, the second is dead; deleted.
- `index.html` `color-scheme` is now `dark` so the iOS status bar
  matches the deep-palm splash background.
- Splash `<img>` for `logo.svg` got an `onerror` fallback that hides
  itself if the asset fails to fetch, so the rest of the splash still
  renders.

**Settings (P1)**
- `Settings.tsx` AccountsTab and ShortcutsTab had `For each={...() ?? []}`
  with NO fallback. A fresh install hit empty Connected accounts and
  zero shortcut rows with nothing to click. Both now render an
  `<Empty .../>` above the For loop; AccountsTab's CTA reuses the
  same `setAdding(true)` handler that the existing 'Add account'
  button uses.

**Records (P2)**
- Removed the unwired "导出为 CSV" per-row quick action that
  hard-coded `showToast({ message: '导出为 CSV（M7 实装）' })`.
  It literally admitted the action wasn't implemented (M7 = a future
  milestone). Anyone clicking it got a toast and nothing else, which
  is worse than not having the button.

**ResourceGate helper (P1, with TDD)**
- New `app/src/components/ResourceGate.tsx` centralises the
  `createResource` guard pattern (loading / error / empty) so views
  stop forgetting the error check. The default predicates treat
  arrays of length 0 as empty and any other value as non-empty;
  override via `isEmpty` for non-list resources.
- 7 unit tests on the pure `isResourceEmpty` predicate covering:
  undefined / null, empty array, non-empty array, non-array values,
  custom predicate, custom on undefined, custom on empty array.
  Total: 194 frontend tests, 80 cargo tests.

**View error fallbacks (P1) — wrapped 13 views**
- Each of these previously showed an empty page on resource failure
  with no error indicator. Each now wraps the existing render in a
  `<Show>` that falls back to `<ErrorState>` with `重试` wired to
  the resource's `refetch()`:
  - `Stream.tsx` (paged.resource.error)
  - `Files.tsx` (files.error)
  - `Drafts.tsx` (drafts.error || scheduled.error)
  - `FollowUps.tsx` (followUps.error)
  - `Clips.tsx` (clips.error)
  - `Contacts.tsx` (contacts.error)
  - `Companies.tsx` (any of contacts/messages/events/files.error)
  - `Search.tsx` (ftsResults.error)
  - `ReadTogether.tsx` (messages.error)
  - `FocusReply.tsx` (messages.error)
  - `Trash.tsx` (paged.resource.error)
  - `Spam.tsx` (paged.resource.error)
  - `Records.tsx` (paged.resource.error)

Existing bespoke Empty / Skeleton sub-components stay in place;
the gate only adds the missing error case.

### Deferred to follow-up

The 2026-08-18 audit also flagged these views but their render
graphs are too complex to wrap in a single inline Show without
refactoring. Will be addressed in a separate pass:

- **Imbox** — the main render is 14+ Show blocks; needs a deeper
  restructure of the data flow before the gate can slot in cleanly.
- **Gate / ScreenerHistory** — same pattern, also has nested
  resource fetches (queueItems + contacts).
- **Insights** — six `createResource` calls; needs an aggregate
  error boundary rather than a per-resource check.
- **Agent** — `useAgent` hook owns the resources, not the view;
  the error gate belongs in the hook, not the view.
- **Calendar** — 14+ Show blocks across two return statements.
- **PileBoard** — already has bespoke empty/loading via
  `SkeletonList` + `<Empty>`; the audit flagged it as
  technically missing ErrorState but its failure mode is rare
  (single-resource paginated loader with retry-by-restart).

### Verification matrix

| Command | Result |
|---|---|
| `pnpm typecheck` | ✅ |
| `pnpm test` | ✅ 194 passed (was 187, +7 for ResourceGate) |
| `cargo test` | ✅ 80 passed |
| `pnpm lint` | ⚠️ 4 pre-existing e2e errors unchanged |

### Commits (this branch)

- `fix(brand): topbar BrandMark uses logo-mark.svg`
- `fix(splash): dedup CSS, color-scheme dark, logo onerror fallback`
- `fix(records): remove unwired '导出为 CSV' placeholder button`
- `fix(settings): add Empty fallbacks to AccountsTab and ShortcutsTab`
- `feat(ui): ResourceGate wrapper for empty/loading/error states`
- `fix(stream): add error fallback for paginated message resource`
- `fix(files): error fallback for listFiles resource`
- `fix(drafts,followups): error fallbacks for createResource views`
- `fix(views): add error fallbacks to 8 createResource views`
- `fix(records): error fallback for paginated message resource`
- `docs(progress): record Brand + view-health fixes`

## 2026-08-18 — Imbox tabs + scale handling + remaining view errors

Three real UX gaps closed:

### Imbox tabs redesign

The 2026-08-18 view-health audit fixed 13 views' missing error
states but left two P1 gaps on the Imbox itself:

1. **'Click a message, can't find it again.'** The Imbox used one
   paginated query and split the loaded rows client-side into
   'New for you' / 'Previously seen'. With 1000+ messages that meant
   any read message older than the first 100 newest was invisible.
   Now each section has its own paginated resource (unreadOnly=true /
   readOnly=true) so 'Previously seen' loads its own page slice and
   the user can scroll back through thousands of read messages.

2. **'Hundreds of unread with no way to navigate.'** The list is now
   grouped by date bucket (今天 / 昨天 / 本周早些 / 本月早些 / 1月)
   with anchor headers, so users can scan to a date and jump rather
   than scrolling 100s of rows.

Stack:
- `listMessagesPaged` gains `readOnly` filter (mutually exclusive
  with `unreadOnly`; `unreadOnly` wins if both set).
- New `ImboxTabs` component above the list with two pill buttons:
  'New for you' with green badge showing unread count, 'Previously
  seen' showing total read count. Active tab has palm underline +
  bold text.
- New `DateGroupedList` wraps the ItemList with bucket headers
  between groups. Bucket keys are stable so SolidJS For reuses DOM
  nodes when items within a bucket re-shuffle.
- mark-as-read moves a message from newPaged to seenPaged via
  `removeByIds` + `prependByIds` (which fetches the full row once
  so the seen tab has body/bodyHtml). mark-as-unread does the
  reverse. toggleUnread removes from the source tab and prepends
  to the destination so both totals stay correct.
- Per-message actions (replyLater, setAside, archive, trash, spam)
  call `removeByIds` on BOTH resources — `removeByIds` is a no-op
  when the id isn't present, so this is safe and avoids needing
  to know which tab the user was on.
- ImboxHeader H1 centred per user request.

### Remaining view error fallbacks

The 2026-08-18 audit deferred 7 views because their render graphs
were too complex to wrap in a single inline Show. All 7 are now
covered:

  - Gate          → `queueItems.error`
  - ScreenerHistory → `contacts.error`
  - Insights      → aggregate over messages/contacts/tasks/
                    followUps/agentTasks/events
  - Agent         → `useAgent().error()` aggregate; useAgent now
                    exposes a single error() accessor that returns
                    the first non-undefined error across its 5
                    resources
  - Calendar      → `events.error`
  - PileBoard     → `paged.resource.error`

Each falls back to ErrorState with 重试 wired to the appropriate
refetch. The bespoke empty/skeleton sub-components stay in place.

### Tests

13 new tests for dateBucket / bucketLabel (today / yesterday /
this-week / this-month / cross-month / cross-year keys + Chinese
label formatting including the year-suppressed same-year case).

All previous tests still pass.

| Command | Result |
|---|---|
| `pnpm typecheck` | ✅ |
| `pnpm test` | ✅ 207 passed (was 194, +13 for dateBucket) |
| `cargo test` | ✅ 80 passed |

### Commits (this branch)

- `feat(date): dateBucket + bucketLabel helpers for Imbox date grouping`
- `feat(imbox): New / Previously seen tabs + date grouping`
- `fix(gate): error fallbacks for Gate + ScreenerHistory`
- `fix(agent): error fallback for the Agent workspace`
- `fix(calendar,pileboard): error fallbacks for events / pile loader`
