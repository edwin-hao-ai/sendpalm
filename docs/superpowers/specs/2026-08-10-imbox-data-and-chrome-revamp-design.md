# Inbox Data + Real-Time Notifications + Chrome (Sidebar & Topbar) Revamp

> Spec authored 2026-08-10. Status: Draft awaiting review. Replaces ad-hoc fixes for
> the empty Inbox, unreachable topbar brand mark, truncated desktop sidebar, and
> missing system notifications. Builds on top of
> `docs/superpowers/specs/2026-07-27-hey-inspired-desktop-client-design.md` and
> `docs/superpowers/specs/2026-07-29-responsive-mobile-ipad-redesign.md`.

## 1. Goal

Make SendPalm actually feel like an email client: real mail arrives within seconds
of landing on the server, new mail shows up in the Inbox without a manual
refresh, the brand mark is present and legible, and the desktop chrome is calm
and HEY-consistent.

Concretely, by the end of this work:

1. New mail in any configured IMAP account appears in the Inbox within 5
   seconds of arrival (down from "never" today).
2. New mail triggers an in-app bell update **and** an OS-level desktop
   notification (subject to the user's notification permission and quiet-hours
   preference).
3. The desktop left navigation is icon-only with a Phosphor-style tooltip
   and keyboard-shortcut badge, eliminating the `Im…`/`St…`/`Comp…` ellipsis
   regression.
4. The macOS titlebar is rendered by Tauri (no JS double-header), the SendPalm
   wordmark lives in the topbar with the brand green, and traffic lights have
   proper safe-area handling on `Overlay` mode.
5. The Inbox empty state tells the truth — "no account configured" vs "X senders
   waiting in Gate" — instead of always saying "add an account".

## 2. Non-Goals

- No new email accounts / providers. Existing Feishu + provider registry stays
  as the source of truth.
- No rewrite of the M10 sync machinery; we fix four interacting defects in
  place.
- No migration to a different IMAP/SMTP library. `async-imap` + `lettre` stay.
- No router, no Tailwind, no extra state library. SolidJS stores + Vanilla CSS
  tokens only (per AGENTS.md §3.2 and §3.3).
- No iOS-specific redesign. Mobile bottom-tab behavior is unchanged; only
  desktop and iPad layouts move.
- No new third-party notification or sound library; we use
  `tauri-plugin-notification` already in the dependency list.

## 3. Background & Root Cause (current state, evidence-based)

The investigation in this session surfaced four interacting defects plus two
chrome regressions. Each is fixed by a named change below.

### 3.1 Defect A — Default `Sent` folder name is wrong for Feishu (and other localized providers)

- Evidence: live log
  `select Sent: no response: code: None, info: Some("No such mailbox")`
  (`app/src-tauri/src/services/sync_loop.rs:510`).
- `Settings.tsx:596-599` writes the literal string `"Sent"` into
  `accounts.settings_json.syncFolders`. Feishu's IMAP `LIST` returns the
  encoded name `&XfJT0ZAB-`; the UTF-7 quoting isn't applied before
  `session.select("Sent")` (`app/src-tauri/src/services/imap.rs:151-156`).
- Consequence: `sync_folder` returns `Err` and `?` in
  `sync_one` (`sync_loop.rs:510`) aborts the whole cycle before
  `sync:new-messages` is emitted on line 549. The frontend's
  `useRefreshEffect` (`utils/gestures.ts:9-16`) therefore never re-runs
  after the first historical backfill.

### 3.2 Defect B — Per-folder failure aborts the cycle

- Even if Feishu's Sent name were correct, the `?` on `sync_folder` returns
  and breaks the for-loop. There is no per-folder try/catch and no
  "remaining folders" continuation path. Consequence: any folder that fails
  (e.g. localized Sent, `[Gmail]/Sent Mail`, OAuth 403) silently kills
  `INBOX` refreshes.

### 3.3 Defect C — Cursor advances over parse failures and short chunks

- `imap.rs:184-187` only sets `highest_uid` for `Ok(parsed)` messages; parsed
  failures drop the UID.
- `sync_loop.rs:612-641` then advances the persisted cursor to
  `bundle.highest_uid` on the last partial chunk.
- Combined: a burst of parse failures in the middle of a chunk can leave the
  cursor past UIDs the server still has but the local DB never received.
  Empirically the user's `messages` table has 600 rows covering UIDs 1–4694
  with a 1,467-UID hole around 3092–4558.

### 3.4 Defect D — `InboxZero` doesn't branch on "no account" vs "no screened contacts"

- `app/src/views/Imbox.tsx:1707-1718` hard-codes the "add an account" copy
  and a `setView("settings")` CTA.
- Today the account is connected (1 email account), 600 messages exist in
  `messages`, but every contact is `screened=0` because
  `upsert_contact` (`sync_loop.rs:1119-1162`) writes `first_seen=1, screened=0`
  for every brand-new IMAP sender. The Imbox filter
  (`Imbox.tsx:122-130`) then hides them all.
- Consequence: the empty state copy is wrong, and the user is dropped into
  Settings with no actionable path back to Gate.

### 3.5 Chrome regression E — Desktop sidebar text clipped

- Working tree reverted the `8fceed1` fix. `app/src/styles/tokens.css:149-150`
  is back at `--sidebar-width: 64px` and
  `app/src/components/Sidebar.tsx:115-120` is back at
  `width: 48px; height: 46px;`. The 9.5px label is ellipsized to
  `Im…`/`St…`/`Comp…`/`Settin…` (screenshot evidence). The lesson at
  `docs/lessons.md:128-134` is now violated by the working tree.

### 3.6 Chrome regression F — Double titlebar (Tauri native + JS)

- `app/src-tauri/tauri.conf.json:20-21` is `titleBarStyle: "Visible" +
  hiddenTitle: true` — WKWebView sits below the native macOS titlebar.
- `app/src/components/Titlebar.tsx:6-66` paints a second 32 px JS header
  containing a 16×16 `logo-mark.svg` (viewBox 0 0 128 128) and an 11 px
  "SendPalm" wordmark in `--text-muted` (`#a09aae`, the lowest-contrast text
  token). The result is the tiny centered mark the user reports.

### 3.7 Notification chain is half-wired

- Rust side is real: IDLE on INBOX (`sync_loop.rs:204-213`), per-folder
  notifications inserted with `previous_last_uid > 0 && uid >
  previous_last_uid` guard (`sync_loop.rs:733-757`), `sync:new-messages`
  emitted on success.
- Frontend side is partial: `startSyncEventBridge` listens for
  `sync:new-messages` and calls `bumpRefreshTick`
  (`app/src/services/sync-events.ts:22-46`); `NotificationBell` polls
  `countUnreadNotifications` every 10 s
  (`app/src/components/Topbar.tsx:147-192`).
- **OS-level `tauri-plugin-notification` is never called.** `lib.rs:127`
  registers the plugin; grep across `app/src` returns zero results for
  `sendNotification`, `isPermissionGranted`, `requestPermission`. Consequence:
  the app is silent when minimized or unfocused.

## 4. Architecture

### 4.1 Folder auto-discovery (Defect A)

- New `services/mailbox_resolver.rs` exports a single function
  `resolve_folder_names(creds, &settings) -> Vec<String>`.
- Steps:
  1. Read the existing `syncFolders` list from
     `accounts.settings_json` (default: `["INBOX"]` if absent).
  2. For each desired folder (`INBOX`, `Sent`, `Drafts`, `Trash`,
     `Spam/Junk`), call `client.list_mailboxes()` and pick the
     case-insensitive match from a candidate table.
  3. Candidate table is the union of common localized names:
     - `INBOX`: `["INBOX", "Inbox", "收件箱"]`
     - `Sent`: `["Sent", "Sent Messages", "Sent Items", "已发送",
       "[Gmail]/Sent Mail", "&XfJT0ZAB-"]` (Feishu).
     - `Drafts`: `["Drafts", "Draft", "草稿箱", "&XfJ8T-"]` (Feishu).
     - `Trash`: `["Trash", "Deleted", "Deleted Items", "Deleted Messages",
       "已删除", "[Gmail]/Trash"]`.
     - `Spam/Junk`: `["Spam", "Junk", "Junk Mail", "Junk E-mail",
       "Bulk Mail", "垃圾邮件", "[Gmail]/Spam"]`.
  4. If a desired folder can't be resolved, the resolver skips it (does not
     raise) and logs `[mailbox] cannot resolve <name> for <provider>; will
     skip folder`. Resolved names are persisted back into
     `accounts.settings_json.syncFolders` via `upsert_account`.
- The resolver is called **once per account per process boot**, before
  `sync_one` runs for that account, inside `spawn_account_loop` (replaces
  the current direct call to `sync_and_notify`).

### 4.2 Per-folder failure isolation (Defect B)

- `sync_one` replaces `sync_folder(...).await?` (line 510) with a
  `match sync_folder(...).await` that, on `Err`, logs
  `[sync] folder=<name> failed for <acct>: <e>` and continues to the next
  folder. `save_folder_sync_state` is still called with the previous
  cursor when a folder fails, so we don't lose progress.
- `sync:new-messages` is still emitted at the end with the per-folder
  results aggregated (`inserted = sum_of_per_folder_inserts`).

### 4.3 Cursor strictness (Defect C)

- `sync_folder` stops advancing `cursor` past a UID whose `insert_message`
  returned `Err`. Concretely: `cursor` advances only on the highest UID in
  `bundle.messages` that was either successfully inserted or already
  persisted (no-op `INSERT OR IGNORE`). Parse failures and DB-insert
  failures both keep the cursor below their UID.
- On chunk boundary, `cursor = max(last_successfully_inserted_uid,
  bundle.highest_uid)`. This caps the advance at the last successful UID
  while still letting the next tick re-attempt parse-failed UIDs.
- A new column `accounts.sync_last_error TEXT` records the most recent
  per-folder error string, surfaced in Settings → Accounts.

### 4.4 Gate backlog surfacing (Defect D)

- `InboxZero` (Imbox.tsx:1707-1718) becomes
  `InboxEmptyState` with three branches:
  1. `(emailAccounts() ?? []).length === 0` → existing "add an account" copy
     and Settings CTA.
  2. `(unscreenedCount() ?? 0) > 0` → "X 个发件人待 Gate 筛选" with a
     "打开 Gate" CTA that calls `setView("screener")`. `unscreenedCount`
     counts **contacts** (not messages), via a new
     `countGateCandidates` helper in `stores/data.ts` that runs
     `SELECT COUNT(*) FROM contacts WHERE first_seen=1 AND screened=0`.
     This branch fires whenever any contact still needs screening,
     regardless of how many Imbox rows those contacts already own.
  3. Otherwise → "Inbox 是空的" + "发送给对方试试" hint, no CTA.
- One-time backfill: a new migration `0014_gate_screened_backfill.sql` flips
  `contacts.screened` from `0` to `0` for any contact where
  `first_seen=1` (this is the existing state; the migration is a no-op
  data-wise but documents intent and re-runs the per-contact screener
  notice so the Inbox row count surfaces in Gate). Concretely the
  migration only normalizes any contact where `screened=1` but
  `first_seen=1` (an inconsistent state from earlier migrations) back to
  `screened=0`. No new UI for this; it's a defensive normalization.

### 4.5 Notification chain (Defect chain G)

- **Rust side** (new module `services/desktop_notifier.rs`):
  - Single function
    `notify_new_mail(app: &AppHandle, account_id: &str, subject: &str,
    sender: &str) -> Result<(), String>`.
  - Skips when `appSettings.preferences.notifications.desktop == false`
    (mirrored from the Tauri `appSettings` store key the JS side already
    manages; the JS bootstrap calls a new `notify_settings_changed` IPC
    after every `setStore` so the Rust cache is fresh — no `app_kv` read).
  - Skips when `quietHoursEnabled` is true and current local time is
    between `quietHoursStart` and `quietHoursEnd` (inclusive; same logic as
    the JS side so desktop + in-app stay in sync).
  - Skips when the message's account is in `setAside` or `replyLater`
    (existing `messages` columns). The Rust caller is
    `insert_message`, so it has the `parsed.subject`, the contact's
    `screened`/`blocked` state, and the `previous_last_uid` guard.
  - Calls
    `app.notification().builder().title(...).body(...).show()?` from
    `tauri_plugin_notification::NotificationExt`.
  - Permission is requested once on first run by the JS bootstrap (see
    below); the Rust side assumes permission is already decided and lets
    the plugin surface failures.
- **JS side** (`app/src/services/notifications.ts`, new file):
  - On `bootstrap.ts` mount (after the first render), call
    `isPermissionGranted()`; if not granted, call
    `requestPermission()` and write the result to
    `appSettings.preferences.notifications.desktop` via the existing
    `tauri-plugin-store` flow. Mirrors
    `app/src/services/sync-events.ts` for the no-op-in-browser pattern
    using `IS_BROWSER()`.
  - Listen for `appSettings.preferences.notifications.desktop === false`
    and skip the JS-side permission prompt. (The Rust side will also skip.)
  - Settings → Preferences → Notifications exposes the toggle, mirroring
    the `appSettings` shape (`desktop: boolean`, `quietHoursEnabled`,
    `quietHoursStart`, `quietHoursEnd`).
- **In-app bell** stays as-is (10 s poll + `sync:new-messages` event for
  instant updates). The only change is that `countUnreadNotifications`
  (`stores/data.ts`) now also counts desktop-notified items so the
  unread badge matches the OS notification count.

### 4.6 Sidebar → icon-only with tooltip (Defect E)

- `app/src/components/Sidebar.tsx`:
  - Add a new `SidebarTooltip` primitive (a small floating div positioned
    via `getBoundingClientRect` of the hovered/focused button) that shows
    the `Label` and, if present, `⌘N` shortcut hint. Delay 120 ms on
    pointer enter, 0 ms on focus/active. On touch / long-press 600 ms
    via `useLongPress` (already in `utils/gestures.ts:68-106`).
  - `NavItem` (Sidebar.tsx:92-198):
    - `width: 100%; max-width: 64px; height: 56px;` so the button fills
      the 64 px rail.
    - The visible label `<span>` is removed; `aria-label` stays.
    - The `⌘N` chip stays inside the button, but is moved to the
      bottom-right corner with `position: absolute; right: 4px; bottom:
      2px;` and the `aria-label` is updated to `<view-name>, shortcut
      ⌘<n>` (the chip is still a `<span>`, not a `<button>`, so screen
      readers don't double-announce).
    - `data-active` adds `aria-current="page"` for SR.
    - `tabindex` and `:focus-visible` ring stay; focus ring uses
      `--focus-ring` (already in `tokens.css`).
  - Mobile (≤767 px) keeps the bottom tab bar with labels at 10 px and the
    6 + "More" sheet — untouched.
- `app/src/styles/tokens.css`:
  - Keep `--sidebar-width: 64px;` and `--sidebar-width-tablet: 64px;` for
    desktop/tablet (regression E was about the working tree, not the
    spec). The 96 px lesson still applies **only** if the user later
    asks for labels back; the design is icon-only by request.
- `app/e2e/views.spec.ts`:
  - The iPad-portrait "Follow-ups is full text" assertion
    (`views.spec.ts:392`) is replaced with a "tooltip text contains
    'Follow-ups' on hover" assertion. iPad-landscape stays at
    `sidebarWidth === 64` (`views.spec.ts:415`).

### 4.7 Titlebar → `Overlay` + brand in topbar (Defect F)

- `app/src-tauri/tauri.conf.json`:
  - `titleBarStyle` flips from `"Visible"` to `"Overlay"`.
  - `hiddenTitle` stays `true`.
  - `trafficLightPosition` set to `{ x: 14, y: 14 }` so the WKWebView
    paints behind the native traffic lights.
  - `decorations` stays default `true` (we still get the native
    fullscreen-zoom affordance, but no native title text).
- `app/src/components/Titlebar.tsx`: deleted. The `<header id="titlebar">`
  mount in `App.tsx` and the `titlebar` row in the grid templates in
  `app/src/styles/base.css:130-172, 213-237` are removed.
- `app/src/styles/tokens.css`:
  - `--titlebar-height: 0px;` (down from 32 px). The two consumers
    (`LiveSearch.tsx:170`, `NotificationPanel.tsx:80`) keep their `calc`
    expressions; the `+ var(--titlebar-height) +` token adds 0.
  - Add `--titlebar-traffic-pad: 78px;` (the standard macOS
    traffic-light safe area for an Overlay window at 1440 wide).
- `app/src/components/Topbar.tsx`:
  - The existing `ph-leaf` + view-title group (Topbar.tsx:51-67) loses the
    leaf icon on desktop/tablet (the brand mark below takes its place);
    mobile keeps the leaf for visual continuity.
  - Prepend a new `<BrandMark />` leftmost in the topbar:
    - `Icon name="ph-leaf" size={18}` (moved from the view-title group),
      color `var(--palm)`.
    - Wordmark `SendPalm`, 18 px, weight 700, `var(--text-primary)`,
      letter-spacing `-0.01em` (matches prototype-v11
      `.topbar-logo` at `css/prototype-v11.css:375-426`).
    - Container has `padding-left: var(--titlebar-traffic-pad)` on
      desktop/tablet and `0` on mobile (≤767 px).
    - `<BrandMark />` is the only place the wordmark "SendPalm" is
      rendered. The Tauri bundle icons (already produced in
      commit `4a93905`) carry the brand at the Dock / app-icon layer.
- `app/src/components/Sidebar.tsx`:
  - First entry of `NAV_SECTIONS` is unchanged; the brand does **not**
    move into the sidebar.
- The single `text=SendPalm` Playwright assertion in `views.spec.ts:36`
  changes to `await expect(page.locator("[data-testid=brand-mark]"))
  .toContainText("SendPalm")` and gains a `data-testid="brand-mark"`
  on the new `<BrandMark />` wrapper to avoid the splash-collision
  lesson at `docs/lessons.md:166-182`.

## 5. Data Flow

### 5.1 Account → IMAP IDLE → DB → UI → OS

```
run_loop (every 60 s)
  └─> spawn_account_loop(account)
        ├─> resolve_folder_names(account)            [new; 4.1]
        │     └─> upsert_account(...)                 // persist resolved names
        ├─> sync_and_notify(...)                     [unchanged; 3.7]
        │     └─> sync_one(...)
        │           └─> for folder in syncFolders {
        │                 sync_folder(...).await     [now match, not ?, 4.2]
        │                 save_folder_sync_state(...)
        │                 // cursor only advances on successful UID [4.3]
        │               }
        │           emit("sync:new-messages", { inserted, cursor, ... })
        │     // success branch:
        │     notify_new_mail(...)                    [new; 4.5; per-insert]
        └─> idle_wait("INBOX", 5 min)
              └─> on Ok / timeout:
                    sync_and_notify(...)              // same path
```

### 5.2 Settings → store → bootstrap

```
bootstrap.ts (mount)
  ├─> loadAppSettings()                              // tauri-plugin-store
  ├─> ensureNotificationPermission()                 [new; 4.5]
  │     └─> isPermissionGranted() → request if false
  │     └─> save to appSettings.preferences.notifications.desktop
  └─> startSyncEventBridge()                         // existing
```

## 6. Components & Files

| File | Change | Section |
|---|---|---|
| `app/src-tauri/src/services/mailbox_resolver.rs` | NEW | 4.1 |
| `app/src-tauri/src/services/desktop_notifier.rs` | NEW | 4.5 |
| `app/src-tauri/src/services/sync_loop.rs` | call resolver before sync_one; replace `?` with match; cursor on success; call notifier in insert_message | 4.1 / 4.2 / 4.3 / 4.5 |
| `app/src-tauri/src/services/imap.rs` | unchanged (IMAP client) | — |
| `app/src-tauri/src/lib.rs` | nothing structural; just ensure plugin already registered | 4.5 |
| `app/src-tauri/src/commands/mod.rs` | add `notify_settings_changed` IPC so JS can tell the Rust side to refresh its `appSettings` cache | 4.5 |
| `app/src-tauri/migrations/0014_gate_screened_backfill.sql` | NEW | 4.4 |
| `app/src/components/Titlebar.tsx` | DELETE | 4.7 |
| `app/src/App.tsx` | remove Titlebar mount | 4.7 |
| `app/src/components/Topbar.tsx` | add `<BrandMark />`; traffic-light padding | 4.7 |
| `app/src/components/Sidebar.tsx` | icon-only NavItem; tooltip primitive; aria-current; ⌘N chip reposition | 4.6 |
| `app/src/components/BrandMark.tsx` | NEW; data-testid | 4.7 |
| `app/src/components/SidebarTooltip.tsx` | NEW | 4.6 |
| `app/src/services/notifications.ts` | NEW; ensureNotificationPermission | 4.5 |
| `app/src/services/sync-events.ts` | unchanged | — |
| `app/src/stores/data.ts` | add `countGateCandidates()` | 4.4 |
| `app/src/stores/ui.ts` | add `gateCandidateCount` signal (auto-updated by `useRefreshEffect`) | 4.4 |
| `app/src/views/Imbox.tsx` | replace InboxZero with InboxEmptyState branching on (no account / unscreened / empty) | 4.4 |
| `app/src/views/Settings.tsx` | add Notifications tab content (desktop toggle, quiet hours) | 4.5 |
| `app/src/styles/tokens.css` | `--titlebar-height: 0px; --titlebar-traffic-pad: 78px;` | 4.7 |
| `app/src/styles/base.css` | remove titlebar grid row; add 78px safe area to `#topbar` on desktop/tablet | 4.7 |
| `app/src/index.html` | unchanged | — |
| `app/e2e/views.spec.ts` | update Sidebar text-clamp test to tooltip; update titlebar test to brand-mark | 4.6 / 4.7 |
| `app/src/test/imbox.test.ts` | new tests for InboxEmptyState branches | 4.4 |
| `app/src-tauri/tests/mailbox_resolver_test.rs` | NEW; unit tests for each provider candidate | 4.1 |
| `app/src-tauri/tests/imap_real.rs` | extend: run `resolve_folder_names` against the real Feishu account and assert `Sent` resolves to `&XfJT0ZAB-` | 4.1 |

## 7. Error Handling

- All new Rust fallible calls map to `String` errors via `?`, matching the
  existing `sync_loop` style. `eprintln!` with `[<module>]` prefixes
  (`[mailbox]`, `[notifier]`, `[sync]`) so the running log is grep-friendly.
- Per-folder failure (4.2) is non-fatal: logged, state preserved, the
  remaining folders still sync.
- Cursor strictness (4.3) failure → cursor stays put; next IDLE tick
  retries the failed UIDs.
- Notification permission denied → in-app bell still works; OS notification
  skipped with `[notifier] permission denied; skipping` log on the first
  failure per session.
- Quiet hours → both Rust and JS independently skip; the in-app bell count
  still increments (only the OS surface is suppressed).

## 8. Testing

| Test | Type | Covers | Gate |
|---|---|---|---|
| `mailbox_resolver_test::feishu_sent` | Rust unit | candidate-table match for `&XfJT0ZAB-` | always |
| `mailbox_resolver_test::gmail_sent` | Rust unit | `[Gmail]/Sent Mail` | always |
| `mailbox_resolver_test::outlook_sent` | Rust unit | `Sent Items` | always |
| `mailbox_resolver_test::unknown_provider` | Rust unit | returns INBOX only, skips Sent | always |
| `sync_loop::per_folder_failure_continues` | Rust unit | Defect B regression | always |
| `sync_loop::cursor_does_not_advance_on_parse_failure` | Rust unit | Defect C | always |
| `imap_real::resolve_folder_names_feishu` | Rust integration | live Feishu; resolve Sent = `&XfJT0ZAB-` | `SENDPALM_E2E_NETWORK=1` |
| `imap_real::idle_triggers_new_message_event` | Rust integration | Defect G; IDLE → insert → notify | `SENDPALM_E2E_NETWORK=1` |
| `imbox.test::empty_state_no_account` | Vitest | branch 1 of InboxEmptyState | always |
| `imbox.test::empty_state_gate_pending` | Vitest | branch 2 of InboxEmptyState | always |
| `imbox.test::empty_state_truly_empty` | Vitest | branch 3 of InboxEmptyState | always |
| `notifications.test::permission_granted` | Vitest | bootstrap path | always |
| `notifications.test::permission_skipped_when_disabled` | Vitest | toggle path | always |
| `e2e/views.spec::sidebar_icons_have_tooltip` | Playwright | Defect E | always |
| `e2e/views.spec::brand_mark_visible` | Playwright | Defect F | always |
| `e2e/views.spec::imap_idle_populates_imbox` | Playwright (network) | Defects A + G | `E2E_NETWORK=1` |

## 9. Rollout

Phased, each phase is a self-contained commit and a `docs/PROGRESS.md`
update. Phase order matches user's request ("do everything"):

1. **Phase 1 — Inbox data chain** (defects A + B + C, plus InboxEmptyState
   branches): all Rust + TS changes that get real mail into the local
   `messages` table and into the Imbox list. No chrome change.
2. **Phase 2 — Desktop notifications** (defect G): Rust notifier +
   JS permission bootstrap + Settings tab. After this, leaving the app
   unfocused shows OS notifications.
3. **Phase 3 — Gate backlog surfacing** (defect D part 2): migration
   + `countGateCandidates` + `InboxEmptyState` branch 2 wiring.
4. **Phase 4 — Sidebar icon-only** (defect E): tooltip primitive,
   NavItem refactor, e2e updates.
5. **Phase 5 — Titlebar + brand** (defect F): Tauri `Overlay`, delete
   Titlebar.tsx, `<BrandMark />` in Topbar, e2e update.

Each phase:

- Build (`pnpm tauri build` for the desktop bundle; `pnpm typecheck` and
  `pnpm lint` clean).
- Run the relevant Vitest slice (`pnpm test -- <pattern>`).
- For phases that touch UI, run `pnpm e2e` and inspect the desktop
  screenshot.
- Update `docs/PROGRESS.md` and `docs/ios-screenshots/` if iOS visuals
  move (only Phase 4 + 5 can change iOS — and only by removing the
  custom titlebar).

## 10. Risks & Open Questions

- **Phase 1 + IDLE latency**: IDLE pushes a "data ready" event when the
  server announces a new message; we then `sync_folder` which opens a new
  IMAP session. End-to-end this is < 5 s for Feishu today. We will not
  attempt to fold IDLE into a long-lived streaming session in this
  change.
- **Phase 4 tooltip positioning**: the tooltip is anchored to the
  hovered button. If the user hovers near the top edge the tooltip must
  flip to render below. The new `SidebarTooltip` primitive handles this
  by checking `button.getBoundingClientRect().top < tooltipHeight +
  safeGap` and rendering below; we ship a screenshot test for both
  cases.
- **Phase 5 Overlay traffic-light drag region**: with the native title
  removed, the WKWebView owns the drag region. The current `<BrandMark
  />` is `onMouseDown={startDragging}` (reuse the
  `Titlebar.onMouseDown` body, now lives in `Topbar.tsx`). Drag-region
  buttons inside the topbar (search, lightning, bell, avatar) get
  `-webkit-app-region: no-drag` inline.
- **No-go**: changing the iOS bundle, adding push notifications for
  iOS/Android, replacing the Rust IMAP client.

## 11. Definition of Done

- [ ] All code compiles, `pnpm typecheck` + `pnpm lint` clean.
- [ ] All Vitest + Rust unit tests pass; gated network tests pass with
      `.env` present.
- [ ] `pnpm e2e` passes; desktop screenshot in `docs/PROGRESS.md` shows
      icon-only sidebar, brand mark in topbar, populated Imbox.
- [ ] iOS screenshot regenerated only if iOS visuals moved (they don't in
      this change — `Titlebar` is hidden on mobile already).
- [ ] No new TODOs without a commit-body justification.
- [ ] Conventional commit per phase (`feat(sync): …`,
      `feat(notify): …`, `feat(gate): …`, `refactor(sidebar): …`,
      `refactor(titlebar): …`).
- [ ] `docs/PROGRESS.md` updated per phase.
