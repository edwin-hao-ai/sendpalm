# SendPalm PRD v1 — Reimplementation Build

> **Status:** v1.0 (spec baseline locked to `prototype-v11.38`).
> **Source of truth:** every feature in `prototype-v11.38` (`prototype-v11.html`, `js/prototype-v11.js`, `css/prototype-v11.css`, `prototype-data.js`) plus `PRD.md` / `FEATURES.md` verbal contract.
> **Engine:** Tauri 2.x desktop + iPhone + iPadOS, SolidJS frontend, SQLite local persistence.
> **Out of scope:** real OAuth, real IMAP/SMTP/Gmail-API, real LLM, server-side sync, multi-user collaboration. (M10 only.)

---

## 1. Mission & Targets

| Target | Platform |
|---|---|
| Desktop | macOS (priority), Windows 10/11, Linux (deb/rpm/AppImage) |
| Mobile | iPhone (iOS 16+) |
| Tablet | iPad (iPadOS 16+), portrait + landscape |

**Design lineage:** HEY.com warm-paper aesthetic with `palm-green` (`#0A8F63`) accent. Token system frozen in `app/src/styles/tokens.css`.

**Quality bar:** every view has empty / loading / error states. Every interactive entity has full CRUD. Every shortcut is editable. Every modal supports Esc / × / outside-click to dismiss.

---

## 2. Personas (from prototype PRD §2)

| Persona | Why they care | SendPalm gives them |
|---|---|---|
| Founder / executive | 200+ emails/day, delegation | Agent drafts, Follow-ups, Snooze |
| Investor / consultant | Long threads, frequent follow-ups | Relationship health, Reply Later, Sticky Notes |
| Sales / BD | CRM discipline on relationships | Contact notes, Notifications, Company view |
| Independent operator | One-person team, daily context-switch | Streams, Bundles, Clips, ⌘K palette |

---

## 3. Functional surface — feature inventory

> **Numbering note**: §3.1–§3.22 mirror the prototype PRD §3 sections 1-to-1. Every function listed there is in scope here.

### 3.1 Inbox / boxes (M1)

- **Imbox** — split into "New for you" (unread, surfaces by snooze/bubble-up) and "Previously seen" (read + sent). Sender bundling collapses any sender with ≥ 3 unread into a single row that fans out on click.
- **Stream** — newsletters / casual reads, scannable list, no read/unread state.
- **Records** — receipts, transactions, auto-file, no read/unread.
- **Gate (Screener)** — first-time senders land here; Tinder-style Yes/No + history view of screened-in/out.
- **Reply Later / Saved / Remind piles** — at the bottom of the Imbox, each fans out on click. Reply Later (L) / Saved (A) / Bubble Up (Z → datetime picker) are per-message actions.
- **Trash / Spam** — recoverable for 30 days.

### 3.2 Compose (M2)

- **From account** — email accounts only; per-account signature override; global `D.user.signature` fallback.
- **Subject + auto-title** — pre-filled when body has content.
- **Cc / Bcc** — toggle rows.
- **Snippets** — data-driven picker (Settings → Manage snippets).
- **Send split-button** — Send now / Schedule send / Save as draft.
- **Scheduled sends** — appear in Drafts with countdown.
- **Draft autosave** — "Saving… / Draft saved" status in footer.

### 3.3 Detail panels (M2)

| Entity | Tabs / Sections |
|---|---|
| **Contact** | Timeline · Notes · Files · Insights · Network · Calendar |
| **Message** | Subject + participants + tracker shield + body + stickies + clips + bottom action bar (Reply / Reply Later / Saved / Remind / Follow-up / Sticky / Clip / Unread / More) |
| **Meeting** | Brief (auto) · Agenda (editable) · Notes · Action items (owner/due/done) · Materials (linked files) |
| **File** | Header + inline preview (image / pdf with "tracking stripped" / doc/spreadsheet with markdown extract) + Open + Copy Markdown |
| **Task** | Title / due / status / priority / related contact or event / notes |
| **Draft** | Recipient / subject / body / last edited / status (pending / approved / sent / edited) |

### 3.4 Contacts (M5)

- List with filter pills (All / Active / Need follow up / Cold) and group toggle (All contacts / By company).
- Add / Edit modal (avatar / company / title / emails / phones / stage / labels / topics / notes / blocked / notify / firstSeen / screened).
- Notes tab — multiple private notes per contact, pin/unpin.
- Screener history view.
- Company view — people + communications + files + meetings per company.

### 3.5 Calendar (M5)

- Day / Week / Year views with arrows / Today / jump-to-date.
- Event detail with brief, agenda, notes, action items, materials.
- Create / Edit / Delete modal: attendees, color, reminder, video link.

### 3.6 Files (M5)

- Grid view with type filters (All / PDF / Image / Doc / Spreadsheet).
- Advanced filters: date range, sender, size.
- File preview panel with type-specific viewer.

### 3.7 Insights dashboard (M5)

7 cards: weekly volume + trend, Top People, average reply time, channel share, pending follow-up count, agent actions this week, health distribution. Each card data-driven from `D.*`.

### 3.8 Drafts (M3)

- Sections: Scheduled / Pending approval / Manual / Sent.
- Multi-select with batch approve / discard.
- Status badges (pending / approved / sent / edited / discarded).
- Per-account signature preview in compose.

### 3.9 Agent (M6)

- Agent panel right-side (340 px) — sessions with context, actions, chat input.
- Sessions: freeform, message-anchored, contact-anchored, event-anchored, file-anchored.
- Tasks with step-level progress and ETA.
- Drafts: Send / Edit / Edit manually.
- Memory global + per-contact, modifiable from UI.
- Audit log with undo where possible.

### 3.10 Follow-ups (M3)

- Sidebar view: Overdue / Today / This week / Later, with Mark done / Remove.
- Per-message picker: 1 day / 3 days / 1 week / 2 weeks / custom.
- Compose-time prompt after sending: "Set follow-up in 3 days".

### 3.11 Snippets / Templates (M3)

- Settings → Manage snippets modal: list with Edit / Delete; + New; Name + Body + optional Shortcut.
- Compose toolbar: snippet button → data-driven picker + "Manage snippets…" entry.

### 3.12 Sticky Notes (M3)

- Per-message yellow sticky card list, add / remove.
- Surface in global search.

### 3.13 Clips (M3)

- Sidebar view: Today / Earlier, copy / remove actions.
- Per-message Clip action: saves selected text (or prompts) to `D.clips`.

### 3.14 Notifications (M4)

- Topbar bell with unread count badge.
- Dropdown panel grouped Today / Yesterday / Earlier.
- Click-through navigates to source.
- Mark all as read + close on outside click.

### 3.15 Command palette ⌘K (M4)

- Fuzzy across Views / Actions (compose / new event / new task / new contact) / Contacts / Messages / Files / Meetings / Recent.
- ↑/↓ navigate, Enter to execute, Esc to close.

### 3.16 Live search topbar (M4)

- 200 ms debounced dropdown.
- Grouped: People / Messages / Files / Views.
- Arrow-key navigation, Enter to open, Esc to close.

### 3.17 Keyboard shortcuts (M4 + M9)

All customizable via Settings → Shortcuts (`D.shortcuts`):

- Navigation: ⌘1–⌘9 views, / search, ? help.
- Imbox: j/k move, x select, Enter open, ; bulk menu, o read together, r reply.
- Per-message: e archive, l reply later, a set aside, z bubble up, f forward, b label, v move, t trash, u unread.
- Compose: ⌘N new, ⌘K palette, ⌘↩ send.
- Calendar: d day, w week, y year, t today, ←/→ prev/next.

### 3.18 Per-account email settings (M7)

- Identity: display label, display name, default From address (primary or alias), reply-to.
- Signature: per-account override with global fallback.
- Aliases: dynamic list with add/remove + From dropdown sync.
- Sync: folder checkboxes + frequency (5 min / 15 min / 30 min / 1 h / manual).
- Automation: Auto-BCC toggle + address, Vacation responder toggle + subject + body.

### 3.19 Settings — 7 tabs (M7)

| Tab | Contents |
|---|---|
| Profile | Display name / avatar / timezone / language / signature / Replay onboarding |
| Accounts | Connected accounts + Add account + per-account Settings |
| Preferences | Notifications (desktop / digest / quiet hours) / Security (app lock / screenshot / clipboard) / Sync & Storage / Snippets |
| Agent | Behavior toggles + memory editor |
| Labels | Create / edit / delete labels with preset colors |
| Data | Mailbox backup / Contacts CSV / Tasks JSON / Empty Trash / Delete all data (typed) / Delete account (mock) |
| Shortcuts | Editable keyboard shortcuts + restore defaults |

### 3.20 Onboarding (M7)

4-step wizard: Welcome → Connect channels → Indexing → Done. Replayable from Settings → Profile.

### 3.21 Three states (M4)

- Empty: themed empty state with icon + title + copy.
- Loading: skeleton placeholders matching final layout.
- Error: themed error state with retry.

### 3.22 Privacy / tracking (M4)

- Spy-pixel shield badge on threads with tracker URLs.
- File preview declares "tracking stripped" for PDF and image.
- Per-account signature override + vacation responder toggle.

---

## 4. Mobile / iPad parity (M8)

| Breakpoint | Layout |
|---|---|
| `< 768px` | Bottom tab bar, full-screen detail, full-screen compose, 100dvh. |
| `768–1023px` (iPad portrait) | Left rail 56 px, tighter spacing, two-column where useful. |
| `>= 1024px` (desktop / iPad landscape) | Full desktop grid. |

- Tap targets ≥ 44×44 px on touch.
- Swipe left on feed card → Saved. Swipe right → Pending.
- Long-press on feed card → context menu.
- Pull-to-refresh on Imbox / Stream / Records.

---

## 5. Data model (M0)

The prototype `D.*` graph is the **contract**. Each top-level collection becomes a SQLite table:

| TS type (in `app/src/types/`) | SQL table |
|---|---|
| `Account` | `accounts` |
| `Contact` | `contacts` |
| `Message` | `messages` |
| `File` | `files` |
| `Event` | `events` |
| `Task` | `tasks` |
| `Draft` | `drafts` |
| `AgentDraft` | `agent_drafts` |
| `AgentSession` | `agent_sessions` |
| `AgentTask` | `agent_tasks` |
| `AgentAuditEntry` | `agent_audit` |
| `Notification` | `notifications` |
| `Snippet` | `snippets` |
| `Sticky` | `stickies` |
| `ContactNote` | `contact_notes` |
| `Clip` | `clips` |
| `FollowUp` | `follow_ups` |
| `ScheduledSend` | `scheduled_sends` |
| `Label` | `labels` |
| `Shortcut` | `shortcuts` |
| `BundleConfig` | `bundle_configs` (per-sender bundle toggle) |

Per-message workflow state lives as columns on `messages`: `reply_later`, `set_aside`, `bubble_up_at`, `remind_at`. App settings live in `tauri-plugin-store` KV.

---

## 6. State model

`ui.ts` (SolidJS signals) owns:

- `view`, `selectedContactId`, `selectedMessageId`, `selectedMeetingId`, `selectedFileId`, `selectedTaskId`, `selectedDraftId`, `selectedIds: Set<string>`
- `expandedPile: 'pending' | 'saved' | 'remind' | null`
- `cursorIndex`
- `contactTab`
- `searchOpen`, `searchQuery`, `searchFilter`, `selectedSearchResult`
- `notificationsOpen`, `unreadNotificationCount`
- `commandPaletteOpen`, `commandPaletteQuery`, `commandPaletteCursor`
- `agentPanelOpen`, `agentSessions`, `currentAgentSessionId`, `agentMemory`
- `calendarView`, `calendarSelected`, `calendarWeekStart`, `calendarYearAnchor`
- `composeOpen`, `composeMinimized`, `composeContext`
- `settingsTab`
- `onboardingStep`, `onboardingCompleted`
- `loading`, `error`

Persistence: only `sendpalm-onboarding` and `sendpalm-notif-last-seen` are mirrored to `tauri-plugin-store`. Everything else is derived from SQL tables on app start.

---

## 7. Keyboard shortcuts (defaults)

See prototype PRD §3.17. Every shortcut is editable in Settings → Shortcuts; the global keydown handler reads from the `shortcuts` table.

---

## 8. Interaction glossary (HEY vocabulary we keep)

| HEY term | SendPalm mapping |
|---|---|
| Screener | Gate |
| Imbox | Inbox |
| The Feed | Stream |
| Paper Trail | Records |
| Reply Later | Pending pile |
| Set Aside | Saved pile |
| Bubble Up | Remind |
| Sticky | Sticky note |
| Clips | Clips |
| Bundles | Bundles |
| Snippets | Snippets / Templates |
| Read together | Read together (M5) |

---

## 9. Milestones

| # | Title | Subtasks | Done criteria |
|---|---|---|---|
| **M0** | Foundation | Scaffold + tokens + shell + data model + SQLite | Empty app boots on desktop + iOS sim with sidebar/topbar/main/detail/agent placeholder. |
| **M1** | Core boxes | Gate/Imbox/Stream/Records/Trash/Spam views + per-message actions | Imbox shows "New for you / Previously seen" with bundles + piles + keyboard nav. |
| **M2** | Detail panels + Compose | Contact/Message/Meeting/File/Task/Draft panels + Compose modal | Open a message → reply opens compose with quote → send lands in Drafts. |
| **M3** | Communication pillars | Bundles / Reply Later / Set Aside / Bubble Up / Snooze / Sticky / Clips / Follow-ups / Snippets / Drafts / Schedule send | Every per-message action works end-to-end; piles update live. |
| **M4** | Power features | ⌘K palette / Live search / Global search / Notifications / Three states / Spy pixel blocker | All keyboard accessible; every view has empty/loading/error. |
| **M5** | Catalog views | Contacts / Companies / Calendar / Files / Insights | Full CRUD across all five. |
| **M6** | Agent | Sessions / Tasks / Drafts / Memory / Audit log | Agent panel opens, can create session anchored to a contact, run a fake task. |
| **M7** | Settings + Onboarding | 7-tab Settings + 4-step Onboarding + Per-account email settings | All toggles persist across reload. |
| **M8** | Mobile / iPad | 3-tier CSS + iPad layout + touch gestures | iPhone SE and iPad mini pass visual diff. |
| **M9** | Polish + Accessibility | Keyboard nav / aria / focus rings / page transitions / toast stacking / skeleton / sound / haptic | Full keyboard walkthrough possible; axe-core has zero serious issues. |
| **M10** | Backend (deferred) | OAuth / IMAP / SMTP / real LLM / push | Out of scope until PRD explicitly expands. |

Each milestone is split into subtasks tracked in `docs/PROGRESS.md`.

---

## 10. Anti-goals

- ❌ Don't introduce a backend in this phase.
- ❌ Don't pick up legacy prototype HTML/JS as source.
- ❌ Don't add Tailwind / UnoCSS / any utility framework.
- ❌ Don't add a router (single-page shell with view state).
- ❌ Don't accept half-finished views. Empty / loading / error states mandatory.
- ❌ Don't ship half-implemented features. If it's in a milestone, it must be done.

---

## 11. Success criteria

- A user can complete "Day in the life": receive → triage (Gate) → Imbox → reply or snooze → draft with snippets → schedule send → set follow-up → file in Records → review Insights — without leaving the app, and without runtime errors.
- Every primary entity has a working CRUD path: contact, message, event, task, file, draft, label, snippet, sticky, clip, contact note, follow-up, notification, agent task.
- Every view has empty / loading / error states.
- ⌘K palette and topbar live search both work end-to-end with arrow-key navigation.
- Per-account email settings persist across reload (within session).
- App boots cleanly on macOS desktop, iPhone simulator, iPad simulator.
- All AGENTS.md §9 Definition-of-Done items are met per subtask.

---

## 12. Open gaps (intentional, deferred)

- OAuth flows, IMAP / SMTP / Gmail API / Microsoft Graph / Slack API / WeChat integration
- Real LLM-powered Agent (drafting / summarizing / action extraction)
- Server-side persistence + sync + push
- Real-time collaboration
- E2E encryption / on-device embeddings
- Real audit logs, GDPR export, SOC 2 controls