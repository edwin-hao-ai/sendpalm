# SendPalm — Product Requirements Document

> **Status:** v11.38 prototype (interaction layer complete)
> **Type:** Vanilla JS / HTML / CSS prototype, in-memory data, all interactions wired but no backend
> **Cache:** `v=11.38` (after P4)
> **Primary reference product:** HEY (37signals) — we explicitly borrow their UX patterns

---

## 1. Product overview

SendPalm is a calm, HEY-inspired email + IM + calendar workspace with a built-in Agent layer. The current build is a single-page prototype (`prototype-v11.html`) that runs against in-memory sample data (`prototype-data.js`) so we can rehearse every interaction before any backend work begins.

### 1.1 Design lineage

The product ships in the **light-mode HEY aesthetic** (HEY-orange accent on near-white surfaces, monospace metadata, "New for you / Previously seen" split, piles at the bottom of the box). The original `DESIGN.md` describes an earlier "Relay" dark-mode glass direction that has since been **superseded by HEY**; keep that doc only for archival reference. All future design decisions follow HEY.

### 1.2 Scope of the prototype

- **In scope:** every interaction listed in §3 — modals, nav, keyboard, gestures, empty states, three-states, accessibility primitives, notifications, ⌘K palette, per-account settings, data export, follow-ups, snippets, bundles, sticky notes, clips, file preview, meeting detail, drafts, scheduled sends.
- **Out of scope (intentionally deferred to a real backend):** real OAuth, real IMAP/SMTP/Gmail-API, real LLM, persistence across reloads, real-time sync, audit logs beyond the prototype's mocked session.

---

## 2. Personas & use cases

| Persona | Why they care | What SendPalm gives them |
|---|---|---|
| Founder / executive | 200+ emails a day, needs delegation | Agent drafts, Follow-ups, Snooze |
| Investor / consultant | Long client threads, frequent follow-ups | Relationship health, Reply Later, Sticky Notes |
| Sales / BD | CRM-like discipline on relationships | Contact notes, Notifications, Company view |
| Independent operator | One-person team, context-switching daily | Streams, Bundles, Clips, Command palette |

---

## 3. Functional surface (as-built in v11.38)

### 3.1 Inbox / boxes

**Imbox** — HEY-style split into "New for you" (unread, surfaces by snooze/bubble-up) and "Previously seen" (read + sent). Sender bundling collapses any sender with ≥3 unread into a single row that fans out on click.

**Stream** — newsletters and casual reads, scannable list.

**Records** — receipts, transactions, auto-file.

**Gate (Screener)** — first-time senders land here; user decides Yes/No. History view shows who has been screened in or out.

**Reply Later / Saved / Remind piles** — at the bottom of the Imbox; each fans out on click and links to a dedicated view. Reply Later (L) / Saved (A) / Bubble Up (Z → datetime picker) are message-level actions.

**Trash / Spam** — recoverable for 30 days (display copy).

### 3.2 Compose

- **From account** — email accounts only; remembers the per-account signature override; falls back to global `D.user.signature`.
- **Subject + auto-title** — ChatGPT-style auto-title suggestion pre-filled when the user starts typing the body.
- **Cc / Bcc** — toggle rows.
- **Snippets** — data-driven picker (`D.snippets`); supports full CRUD via Settings → Manage snippets.
- **Attach / Ask Agent / Send** — toolbar icons.
- **Send split-button** — Send now / Schedule send / Save as draft. Schedule send uses quick presets (Tomorrow 9am / Monday 9am / Next Friday) or custom datetime.
- **Scheduled sends** — appear in Drafts view with countdown.

### 3.3 Detail panels

Every primary entity opens a right-side detail panel (overlay on mobile):

- **Contact** — hero with avatar / name / company / title / channel toggles (notify / delivery bucket / autofile / recycling); tabs: Timeline / **Notes** / Files / Insights / Network / Calendar.
- **Message** — thread header with subject + participants + HEY-style "tracker blocked" shield; per-message body with reply actions + sticky notes + clip action; bottom action bar with Reply / Reply Later / Saved / Remind / Follow-up / Sticky / Clip / Unread / More.
- **Meeting** — brief (auto-generated from attendees' recent messages), editable Agenda, editable Notes, Action items (owner / due / done), Materials (linked files).
- **File** — header + inline preview (image with spy-pixel shield, pdf with "tracking stripped" notice, doc/spreadsheet with markdown extract) + Open + Copy Markdown actions.
- **Task** — title / due / status / priority / related contact or event / notes.
- **Draft** — recipient / subject / body / last edited / status (pending / approved / sent / edited).

### 3.4 Contacts

- **List** with filter pills (All / Active / Need follow up / Cold) and group toggle (All contacts / By company).
- **Add / Edit modal** (full CRUD with avatar / company / title / emails / phones / stage / labels / topics / notes / blocked / notify / firstSeen / screened).
- **Notes tab** (P4 L) — multiple private notes per contact with pin/unpin.
- **Screener history** — shows screened-in / screened-out contacts.
- **Company view** — per-company group: people + communications + files + meetings.

### 3.5 Calendar

- **Day / Week / Year views** with arrows / Today / jump-to-date.
- **Event detail** with brief, agenda, notes, action items, materials.
- **Create / Edit / Delete modal** with attendees, color, reminder, video link.

### 3.6 Files

- **Grid view** with type filters (All / PDF / Image / Doc / Spreadsheet) and More filters (date range, sender, etc.).
- **File preview panel** with type-specific viewer.

### 3.7 Insights dashboard

7 modules: weekly volume + trend, Top People, average reply time, channel share, pending follow-up count, agent actions this week, health distribution. Each card is data-driven from `D.*`.

### 3.8 Drafts

- **Sections**: Scheduled / Pending approval / Manual / Sent.
- **Multi-select** with batch approve / discard.
- **Status badges** (pending / approved / sent / edited / discarded).
- **Per-account signature** preview in compose (P4).

### 3.9 Agent

- **Agent panel** (right side, 340 px) — sessions with context, actions, chat input.
- **Sessions**: freeform, message-anchored, contact-anchored, event-anchored, file-anchored.
- **Tasks** with step-level progress and ETA.
- **Drafts** with Send / Edit / Edit manually.
- **Memory** global + per-contact, modifiable from UI.
- **Audit log** with undo where possible.

### 3.10 Follow-ups

- **Sidebar view**: Overdue / Today / This week / Later groups, with Mark done / Remove actions.
- **Per-message picker**: 1 day / 3 days / 1 week / 2 weeks / custom date.
- **Compose-time prompt** after sending: "Set follow-up in 3 days".

### 3.11 Snippets (Templates)

- **Settings → Manage snippets** modal: list with Edit / Delete; + New snippet; Name + Body + optional Shortcut.
- **Compose toolbar**: snippet button → data-driven picker + "Manage snippets…" entry.

### 3.12 Sticky Notes

- Per-message yellow sticky card list, add / remove.
- Surface in global search.

### 3.13 Clips

- **Sidebar view**: Today / Earlier groups, copy / remove actions.
- **Per-message Clip action**: saves selected text (or prompts) to `D.clips`.

### 3.14 Notifications

- **Topbar bell** with unread count badge.
- **Dropdown panel** grouped by Today / Yesterday / Earlier.
- **Click-through** navigates to source (view + contact / file / event).
- **Mark all as read** + close on outside click.

### 3.15 Command palette (⌘K / Ctrl+K)

- Fuzzy search across: Views, Actions (compose / new event / new task / new contact), Contacts, Messages, Files, Meetings, Recent items.
- ↑/↓ navigate, Enter to execute, Esc to close.

### 3.16 Live search (topbar)

- 200 ms debounced dropdown.
- Grouped: People / Messages / Files / Views.
- Arrow-key navigation, Enter to open, Esc to close.

### 3.17 Keyboard shortcuts

All customizable via Settings → Shortcuts (`D.shortcuts`):

- **Navigation:** ⌘1–⌘9 (views), / search, ? help.
- **Imbox:** j/k move, x select, Enter open, ; bulk menu, o read together, r reply.
- **Per-message:** e archive, l reply later, a set aside, z bubble up, f forward, b label, v move, t trash, u unread.
- **Compose:** ⌘N new, ⌘K palette, ⌘↩ send.
- **Calendar:** d day, w week, y year, t today, ←/→ prev/next.

### 3.18 Per-account email settings (Settings → Accounts → Settings)

- Identity: display label, display name, default From address (primary or alias), reply-to.
- Signature: per-account override with global fallback.
- Aliases: dynamic list with add / remove + From dropdown sync.
- Sync: folder checkboxes (INBOX, Sent, Drafts, Archive, Trash, Spam, Starred, Important) + frequency (5 min / 15 min / 30 min / 1 h / manual).
- Automation: Auto-BCC toggle + address, Vacation responder toggle + subject + body.

### 3.19 Settings (7 tabs)

| Tab | Contents |
|---|---|
| Profile | Display name / avatar / timezone / language / signature / Replay onboarding |
| Accounts | Connected accounts + Add account + per-account Settings |
| Preferences | Notifications (desktop / digest / quiet hours) / Security (app lock / screenshot / clipboard) / Sync & Storage / Snippets |
| Agent | Behavior toggles + memory editor |
| Labels | Create / edit / delete labels with preset colors |
| Data | Mailbox backup / Contacts CSV / Tasks JSON / Empty Trash / Delete all data (typed) / Delete account (mock) |
| Shortcuts | Editable keyboard shortcuts + restore defaults |

### 3.20 Onboarding

4-step first-run wizard: Welcome → Connect channels → Indexing → Done. Replayable from Settings → Profile.

### 3.21 Three states (empty / loading / error)

- **Empty:** all major views render a themed empty state with icon + title + copy (`renderEmpty()`).
- **Loading:** skeleton placeholders matching final layout (`renderSkeletonList()`).
- **Error:** themed error state with retry (`renderErrorState()`).

### 3.22 Privacy / tracking protection

- Spy-pixel shield badge on every message thread that contains tracker URLs.
- File preview declares "tracking stripped" for PDF and image.
- Per-account signature override + vacation responder with explicit user toggle.

---

## 4. Data model (`D.*`)

| Field | Purpose |
|---|---|
| `D.user` | Display name, avatar, timezone, language, signature |
| `D.accounts[]` | Email / IM / calendar accounts; each email account has `settings` (aliases / signature / replyTo / defaultFrom / syncFolders / syncFrequency / autoBcc / vacationResponder) |
| `D.contacts[]` | Full contact records with health / stage / topics / labels / notes / blocked / notify / screened |
| `D._msgs[]` | Messages across all channels, with bucket / replyLater / setAside / bubbleUpUntil / screened / seen |
| `D._files[]` | Attachments with type / size / md extract |
| `D.events[]` (alias `_meetings`) | Events with attendees / dt / tm / agenda / actionItems / materials |
| `D.tasks[]` | Tasks with status / due / priority / related |
| `D.drafts[]` + `D.agentDrafts[]` | Manual and agent drafts |
| `D.labels[]` | Custom labels with color |
| `D.workflowState` (per-message) | replyLater / setAside / bubbleUpUntil / remindAt |
| `D.scheduledSends[]` | Future scheduled messages |
| `D.followUps[]` | Per-message follow-up reminders |
| `D.notifications[]` | Cross-feature notifications with type / read / ref |
| `D.snippets[]` | Compose snippets (label / body / shortcut) |
| `D.stickies[]` | Per-message private notes |
| `D.contactNotes[]` | Per-contact private notes (with pinned flag) |
| `D.clips[]` | Saved text snippets from messages |
| `D.agentTasks[]`, `D.agentDrafts[]`, `D.agentMemory{}`, `D.agentAuditLog[]`, `D.agentCompleted[]` | Agent subsystem |
| `D.bundles{}` | Per-sender bundle flag |
| `D.shortcuts[]` | Customizable keyboard shortcuts |

---

## 5. State model (`state`)

`state` owns: `view`, `selectedContactId`, `selectedMessageId`, `selectedMeetingId`, `selectedFileId`, `selectedIds`, `expandedThreadMessages`, `expandedStreamMessages`, `expandedPile`, `cursorIndex`, `contactTab`, `searchOpen`, `searchQuery`, `searchFilter`, `settingsTab`, `notificationsOpen`, `draftSelected`, `focusReplyOpen`, `focusReplyIndex`, `focusReplyCompletedIds`, `notifications` count, `prepChecked`, `commandPalette` selection, `agentSessions[]`, `currentAgentSessionId`, `calendarView`, `calendarSelected`, `composeOpen`, `composeMinimized`, `composeContext`, `appSettings`, `selectedIds` Set, `expandedPile`, `selectedSearchResult`, `readTogetherOpen`, `readTogetherIndex`, `viewHeader`, `viewHeaderLeft`, `composerAutoTitle`, and per-keyboard-shortcut edit buffers.

Persistence: only `sendpalm-onboarding` and `sendpalm-notif-last-seen` are persisted to `localStorage`. Everything else resets on reload — by design.

---

## 6. Keyboard shortcuts (default)

See §3.17. Every shortcut is editable; `D.shortcuts` is the source of truth, and the global keydown handler reads from it dynamically.

---

## 7. Interaction glossary (HEY vocabulary we keep)

| HEY term | SendPalm mapping | Notes |
|---|---|---|
| Screener | Gate | First-time senders land here |
| Imbox | Inbox | Important + immediate messages |
| The Feed | Stream | Newsletters / long reads |
| Paper Trail | Records | Receipts / transactions |
| Reply Later | Pending | Pile at bottom of Imbox |
| Set Aside | Saved | Pile at bottom of Imbox |
| Bubble Up | Remind | Future-floats-back message |
| Cover Art | (planned, P5) | Slides image over Previously seen |
| Sticky | Sticky note | Yellow card on message |
| Clips | Clips | Saved text snippets |
| Bundles | Bundles | Same-sender collapse |
| Snippets | Snippets / Templates | Compose re-usable text |
| Workflows | (planned, P5) | Multi-stage email tracking |
| Read together | Read together | Multi-message scroll view |
| Power Through New | (planned, P5) | Focus on unread |
| Focus & Reply | (planned, P5) | Reply-only view |
| Speakeasy | (planned, P5) | Subject-code to bypass screener |
| Sticky thread | Sticky note (per-message) | Equivalent at message level |

---

## 8. Phases shipped

| Phase | Scope | Status |
|---|---|---|
| P1 | Shared form infrastructure + core CRUD modals (contacts / events / tasks / drafts / settings) | Done (P1 commit + review) |
| P2 | Contact detail tabs / Company view / Global search / Label manager / Advanced filters | Done (P2 commit + review) |
| P3 | Onboarding / Insights / Data / Shortcuts / Email settings | Done (P3 commit + review) |
| P4 | HEY-style power features + notification center + ⌘K + file preview + meeting detail + drafts + send later + follow-up + snippets + bundles + sticky notes + contact notes + spy-pixel blocker + three states + live search + clips | **Done — current build v11.38** |
| P5 (planned) | UX polish + mobile: theme / density / block list / drag-drop / inline edit / swipe gestures / pull-to-refresh / bottom sheet / long-press / unfurl / thread merge / rename subject / mute thread / share via link / read together / focus & reply / power through / modal nesting / form dirty state / duplicate detection / page transitions / toast stacking | Not started |
| P6 (planned) | Accessibility + global polish: keyboard nav audit / aria / focus rings / color contrast / sound / haptic / page transitions / toast stacking / skeleton | Not started |
| P7 | PRD / FEATURES / DESIGN sync — this doc | **Done** |

---

## 9. Open gaps (intentional, for production)

These are visible in the prototype as mock data but require real implementation:

- OAuth flows, IMAP / SMTP / Gmail API / Microsoft Graph / Slack API / WeChat integration
- Real LLM-powered Agent (drafting / summarizing / action extraction)
- Persistence (Postgres + API + auth)
- Sync engine + delta queries + PubSub push
- Server-side notification dispatcher (vs. in-memory `D.notifications`)
- Real-time collaboration (multi-user contact notes / shared threads)
- Mobile native apps (vs. PWA)
- E2E encryption / on-device embedding (vs. localStorage only)
- Real audit logs, GDPR data export, SOC 2 controls

---

## 10. Success criteria (prototype-level)

- A user can complete a "Day in the life": receive → triage (Screener) → Imbox → reply or snooze → draft with snippets → schedule send → set follow-up → file in Records → review Insights — without leaving the prototype, and without runtime errors.
- Every primary entity has a working CRUD path: contact, message, event, task, file, draft, label, snippet, sticky, clip, contact note, follow-up, notification.
- Every view has an empty / error state.
- ⌘K palette and topbar live search both work end-to-end with arrow-key navigation.
- Per-account email settings persist across reload (within session).