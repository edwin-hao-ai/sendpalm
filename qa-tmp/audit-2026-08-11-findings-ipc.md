# Audit 2026-08-11 — IPC Consistency (Frontend ↔ Backend)

> **Scope.** Every `safeInvoke(...)` / `invoke(...)` call site in `app/src` is
> compared to every `#[tauri::command]` handler registered in
> `app/src-tauri/src/lib.rs`. The convention verified against the official Tauri
> 2 docs (`https://v2.tauri.app/develop/calling-rust/`) is:
>
> - Tauri 2 macro auto-renames Rust `snake_case` parameter names to **camelCase**
>   when called from JS — the JS payload must use **camelCase** keys.
> - Override: `#[tauri::command(rename_all = "snake_case")]` switches the macro
>   to expect snake_case keys.
> - Nested `#[serde(Deserialize)]` structs honour their own `rename_all` only —
>   the `#[tauri::command]` rename does NOT recurse into struct fields.
> - `AppHandle` / `State<...>` are Tauri-injected; they never appear in the JS
>   payload.

---

## A. Headline counts

| | Count |
|---|---|
| Frontend `safeInvoke` / `invoke` call sites | 12 (in 2 files) |
| Frontend command names invoked (unique) | 12 |
| Frontend command names defined but **un-called** | 1 (`greet`) |
| Rust `#[tauri::command]` handlers registered | 12 |
| Rust handlers invoked from JS | 12 (all of them) |
| Rust handlers un-called (dead code) | 0 |
| Frontend-only / browser-shim-only commands (no Rust) | 21 (in `tauri-shim.ts`) |

### 21 shim-only commands (not registered in Rust)
`list_accounts`, `list_contacts`, `list_messages`, `list_files`, `list_events`,
`list_tasks`, `list_drafts`, `list_agent_sessions`, `list_agent_tasks`,
`list_agent_drafts`, `list_agent_audit`, `list_notifications`, `list_snippets`,
`list_stickies`, `list_contact_notes`, `list_clips`, `list_follow_ups`,
`list_scheduled_sends`, `list_labels`, `list_shortcuts`, `list_bundle_configs`.
These are never called from JS today (per AGENTS §10, the frontend talks to
SQLite via `tauri-plugin-sql`, not via Rust commands). The shim returns `[]`
for them in browser mode. Not a mismatch — just dead browser-mode fallback
switches that should ideally be removed (file: `app/src/services/tauri-shim.ts`).

---

## B. Pair-by-pair status

Legend: ✅ match · ❌ mismatch · ⚠️ runtime-OK but TS types disagree

### 1. `send_message` ❌ MISMATCH
- **JS call site**: `app/src/services/backend.ts:66-79`
  (`safeInvoke<{...}>("send_message", { to, subject, body, html_body,
  account_id, attachments, cc, bcc, from_override })`)
- **Rust handler**: `app/src-tauri/src/commands/mod.rs:84-95`
  (`pub async fn send_message(app, to, subject, body, html_body, account_id,
  attachments, cc, bcc, from_override)`)
- **Param diff** (Tauri expects camelCase keys):

  | Rust param | JS key sent | Expected camelCase | Status |
  |---|---|---|---|
  | `to` | `to` | `to` | ✅ |
  | `subject` | `subject` | `subject` | ✅ |
  | `body` | `body` | `body` | ✅ |
  | `html_body` | `html_body` | `htmlBody` | ❌ |
  | `account_id` | `account_id` | `accountId` | ❌ |
  | `attachments` | `attachments` | `attachments` | ✅ |
  | `cc` | `cc` | `cc` | ✅ |
  | `bcc` | `bcc` | `bcc` | ✅ |
  | `from_override` | `from_override` | `fromOverride` | ❌ |

- **Net effect** (AGENTS §10.5 silent-break trap): Rust deserialization will
  fail with "missing field `htmlBody`" → `send_message` returns `Err(...)`
  → `safeInvoke` swallows the throw and returns `null` → Compose "sends"
  nothing. This is the literal example AGENTS §10.5 calls out.

### 2. `list_mailboxes` ❌ MISMATCH
- **JS**: `safeInvoke<string[]>("list_mailboxes", { account_id: accountId })`
  — `app/src/services/backend.ts:83-85`
- **Rust**: `pub async fn list_mailboxes(account_id: String)` —
  `app/src-tauri/src/commands/mod.rs:69`

  | Rust param | JS key sent | Expected | Status |
  |---|---|---|---|
  | `account_id` | `account_id` | `accountId` | ❌ |

- **Net effect**: returns `null`; UI shows empty mailbox list. Already has
  silent-break fallback in the caller (`r ?? []`), so the bug is invisible
  in dev.

### 3. `sync_now` ❌ MISMATCH
- **JS**: `safeInvoke("sync_now", { account_id: accountId, mailbox })` —
  `app/src/services/backend.ts:93`
- **Rust**: `pub async fn sync_now(app, account_id, mailbox)` —
  `app/src-tauri/src/commands/mod.rs:24-27`

  | Rust param | JS key sent | Expected | Status |
  |---|---|---|---|
  | `account_id` | `account_id` | `accountId` | ❌ |
  | `mailbox` | `mailbox` | `mailbox` | ✅ |

- **Net effect**: Sync button is a no-op. Caller checks `r === null` and falls
  through silently.

### 4. `get_sync_state` ✅ MATCHED
- **JS**: `safeInvoke<SyncStateDto>("get_sync_state", { accountId })` —
  `app/src/services/backend.ts:97`
- **Rust**: `pub async fn get_sync_state(app, account_id: String)` —
  `app/src-tauri/src/commands/mod.rs:221`

  | Rust param | JS key sent | Status |
  |---|---|---|
  | `account_id` | `accountId` | ✅ |

### 5. `list_email_providers` ✅ MATCHED
- **JS**: `safeInvoke<EmailProvider[]>("list_email_providers")` (no args) —
  `app/src/services/backend.ts:110`
- **Rust**: `pub async fn list_email_providers()` —
  `app/src-tauri/src/commands/mod.rs:234`

### 6. `vault_save` ✅ MATCHED
- **JS**: `safeInvoke<void>("vault_save", { accountId, password })` —
  `app/src/services/backend.ts:120`
- **Rust**: `pub async fn vault_save(account_id: String, password: String)` —
  `app/src-tauri/src/commands/mod.rs:239`

  | Rust param | JS key sent | Status |
  |---|---|---|
  | `account_id` | `accountId` | ✅ |
  | `password` | `password` | ✅ |

### 7. `vault_load` ✅ MATCHED
- **JS**: `safeInvoke<string | null>("vault_load", { accountId })` —
  `app/src/services/backend.ts:125`
- **Rust**: `pub async fn vault_load(account_id: String)` —
  `app/src-tauri/src/commands/mod.rs:244`

### 8. `vault_delete` ✅ MATCHED
- **JS**: `safeInvoke<void>("vault_delete", { accountId })` —
  `app/src/services/backend.ts:129`
- **Rust**: `pub async fn vault_delete(account_id: String)` —
  `app/src-tauri/src/commands/mod.rs:249`

### 9. `add_calendar_event` ⚠️ TYPES-DISAGREE / RUNTIME-OK
- **JS**: `safeInvoke<string>("add_calendar_event", { invite, contactId })` —
  `app/src/services/backend.ts:150`
- **Rust**: `pub async fn add_calendar_event(invite: IcalEvent,
  contact_id: Option<String>)` — `app/src-tauri/src/commands/mod.rs:255-258`
- **Top-level param**: `contactId` (camelCase) → Rust `contact_id` ✅ (auto)
- **Nested `invite` struct** (no `rename_all` on `services::ical::IcalEvent`,
  lines 24-35 of `app/src-tauri/src/services/ical.rs`):

  | Rust field | Field type | TS types/index.ts | TS services/backend.ts |
  |---|---|---|---|
  | `uid` | `Option<String>` | `uid?` | `uid?` |
  | `summary` | `String` | `summary` | `summary` |
  | `dtstart` | `Option<String>` | `dtstart?` | `dtstart?` |
  | `dtstart_tzid` | `Option<String>` | `dtstartTzid?` ⚠️ | `dtstart_tzid?` |
  | `dtend` | `Option<String>` | `dtend?` | `dtend?` |
  | `dtend_tzid` | `Option<String>` | `dtendTzid?` ⚠️ | `dtend_tzid?` |
  | `all_day` | **`bool`** | (missing!) ❌ | (missing!) ❌ |
  | `location` | `Option<String>` | `location?` | `location?` |
  | `description` | `Option<String>` | `description?` | `description?` |

  - **TS-type disagreement**: `app/src/types/index.ts:174-183` declares
    `IcalEvent` with camelCase `dtstartTzid` / `dtendTzid`, while
    `app/src/services/backend.ts:135-144` declares the same interface with
    snake_case `dtstart_tzid` / `dtend_tzid`. The actual JSON data in
    `r.calendar_json` is parsed by `safeParse` (TS doesn't enforce) and at
    runtime the keys are snake_case (because that's what `IcalEvent::Serialize`
    in Rust produced when the message was ingested via IMAP).

  - **Runtime**: the data flowing through `m.calendarInvite` from
    `stores/data.ts:173-174` uses snake_case keys (because that's what the
    Rust parser wrote). JSON.stringify then ships snake_case to Rust, which
    Rust expects. So the wire format is correct today, **but the TS types
    lie**, and the `all_day: bool` (NOT `Option<bool>`) field will deserialize
    to `false` if missing, which only matters if JS ever constructs a new
    invite object manually — at which point the missing `all_day` would be
    `undefined` and Rust serde would default it to `false` (works), but if
    any field were ever flipped to non-Option, this would silently break.

  - **Fragility**: a future refactor that constructs an invite from JS code
    using the `types/index.ts` (camelCase) shape will break the wire format.

### 10. `get_attachment_content` ✅ MATCHED
- **JS**: `safeInvoke<string>("get_attachment_content", { fileId })` —
  `app/src/services/backend.ts:156`
- **Rust**: `pub async fn get_attachment_content(app, file_id: String)` —
  `app/src-tauri/src/commands/mod.rs:304`

  | Rust param | JS key sent | Status |
  |---|---|---|
  | `file_id` | `fileId` | ✅ |

### 11. `get_attachment_path` ✅ MATCHED
- **JS**: `safeInvoke<string>("get_attachment_path", { fileId })` —
  `app/src/services/backend.ts:162`
- **Rust**: `pub async fn get_attachment_path(app, file_id: String)` —
  `app/src-tauri/src/commands/mod.rs:332`

### 12. `notify_settings_changed` ❌ MISMATCH
- **JS**: `invoke("notify_settings_changed", { desktop_enabled,
  quiet_hours_enabled, quiet_hours_start, quiet_hours_end })` —
  `app/src/services/notifications.ts:44`
- **Rust**: `pub async fn notify_settings_changed(app, desktop_enabled,
  quiet_hours_enabled, quiet_hours_start, quiet_hours_end)` —
  `app/src-tauri/src/commands/notification_settings.rs:5-12`

  | Rust param | JS key sent | Expected | Status |
  |---|---|---|---|
  | `desktop_enabled` | `desktop_enabled` | `desktopEnabled` | ❌ |
  | `quiet_hours_enabled` | `quiet_hours_enabled` | `quietHoursEnabled` | ❌ |
  | `quiet_hours_start` | `quiet_hours_start` | `quietHoursStart` | ❌ |
  | `quiet_hours_end` | `quiet_hours_end` | `quietHoursEnd` | ❌ |

- **Net effect**: Rust deserialization fails → IPC throws → JS catch block
  swallows → notification preferences never reach the sync loop. The catch
  comment says "The Rust side will pick up the next store.set on app
  restart." So the bug is documented as "works on restart only".

### 13. `greet` (frontend-only, no Rust handler)
- **JS**: `invoke<string>("greet", { name })` —
  `app/src/ipc/commands.ts:12`. Exported as `pingGreet(name)`, but no
  importer calls it anywhere in `app/src` (grep confirms only the declaration
  matches, plus an unrelated `"greeting"` literal in `views/Settings.tsx`).
- **Rust**: no `#[tauri::command] greet` exists.
- **Status**: dead code — should be deleted. Not a correctness issue.

---

## C. Mismatch summary

| # | Command | JS sends | Expected (camelCase) | Bug location |
|---|---|---|---|---|
| 1 | `send_message` | `html_body` | `htmlBody` | backend.ts:72 |
| 1 | `send_message` | `account_id` | `accountId` | backend.ts:73 |
| 1 | `send_message` | `from_override` | `fromOverride` | backend.ts:77 |
| 2 | `list_mailboxes` | `account_id` | `accountId` | backend.ts:84 |
| 3 | `sync_now` | `account_id` | `accountId` | backend.ts:93 |
| 9 | `add_calendar_event` | nested struct field-naming disagreement + missing `all_day` | either pin TS to snake_case, OR `#[serde(rename_all = "camelCase")]` on Rust struct | types/index.ts:174-183 ↔ services/ical.rs:24-35 |
| 12 | `notify_settings_changed` | `desktop_enabled` | `desktopEnabled` | notifications.ts:45 |
| 12 | `notify_settings_changed` | `quiet_hours_enabled` | `quietHoursEnabled` | notifications.ts:46 |
| 12 | `notify_settings_changed` | `quiet_hours_start` | `quietHoursStart` | notifications.ts:47 |
| 12 | `notify_settings_changed` | `quiet_hours_end` | `quietHoursEnd` | notifications.ts:48 |

**Counts**: 6 of 12 active commands are mismatched (50%). Three of those
(`send_message`, `sync_now`, `notify_settings_changed`) are functionally
important (sending email, syncing mail, notification prefs). The remaining
three (`list_mailboxes`, `add_calendar_event`, and the `IcalEvent` struct
itself) are silent because callers fall through on `null`.

## D. Recommended fix shapes

Two consistent ways to fix, pick one per audit:

**A. JS-side rename to camelCase** (recommended — matches the 4 commands
that already work this way: `get_sync_state`, `vault_*`).
```ts
// send_message
{ htmlBody: htmlBody, accountId: accountId, ..., fromOverride: fromOverride }
// sync_now / list_mailboxes
{ accountId: accountId, mailbox }
// notify_settings_changed
{ desktopEnabled, quietHoursEnabled, quietHoursStart, quietHoursEnd }
```

**B. Rust-side `rename_all = "snake_case"`** (alternative — fewer JS
diffs, matches the AGENTS §10.5 wording "keep parameter names in sync").
```rust
#[tauri::command(rename_all = "snake_case")]
pub async fn send_message(...) { ... }
```
Apply to `send_message`, `sync_now`, `list_mailboxes`,
`notify_settings_changed`. Do NOT apply to the four already-correct ones
(`get_sync_state`, `vault_*`, `get_attachment_*`) — they currently use
camelCase JS keys and would silently break.

**For `IcalEvent`** (item 9), neither top-level approach fixes the nested
struct. Add `#[serde(rename_all = "camelCase")]` to
`services::ical::IcalEvent` so the `all_day` / `dtstart_tzid` fields
deserialize from the `types/index.ts`-shaped JS objects (camelCase), OR
correct the TS interface to `dtstart_tzid` / `all_day` and add a comment
warning that `all_day` defaults to `false` if omitted.