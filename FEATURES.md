# SendPalm Feature Inventory v11.38 (current prototype)

> Built on the **HEY**-inspired design language. See `PRD.md` for the product-level narrative and `DESIGN.md` for the visual system (HEY accents on light surfaces — the original dark-glass "Relay" direction is archived).

## 1. Communication boxes (the spine)

| Box | View | Purpose |
|---|---|---|
| Gate (Screener) | `state.view === 'screener'` | First-time senders; user approves / blocks |
| Imbox | `state.view === 'imbox'` | Important + immediate messages, split New for you / Previously seen |
| Stream | `state.view === 'feed'` | Newsletters / long reads |
| Records | `state.view === 'paperTrail'` | Receipts / transactions |
| Trash | `state.view === 'trash'` | Recoverable for 30 days |
| Spam | `state.view === 'spam'` | Filtered |

## 2. Workflows (HEY-style piles)

| Pile / Action | Trigger | Behaviour |
|---|---|---|
| Reply Later / Pending | `l` | Email parks at bottom of Imbox; fan-out reveals list |
| Set Aside / Saved | `s` | Same pattern, distinct pile |
| Bubble Up / Remind | `z` then pick datetime | Message floats back to top at chosen time |
| Snooze / Remind (custom) | picker — Tomorrow 9 / Monday / Next Friday / custom | Same as Bubble Up |
| Follow-up | per-message `ph-bell-ringing` | Reminder fires when due; badge on message row; sidebar view |

## 3. Detail panels

| Entity | Tabs / Sections |
|---|---|
| Contact | Timeline · **Notes** · Files · Insights · Network · Calendar |
| Message (thread) | Subject + participants + tracker-shield + body + sticky notes + clips + actions |
| Meeting | Brief · Agenda · Notes · Action items · Materials |
| File | Header · inline preview (image / pdf / doc) · Open · Copy Markdown |
| Task | Title / due / status / priority / related / notes |
| Draft | Recipient / subject / body / status / actions |

## 4. Compose

| Feature | Notes |
|---|---|
| Per-account From | Only email accounts; pre-selects via `defaultFrom` |
| Per-account signature | Override or fall back to global `D.user.signature` |
| Snippets (templates) | Data-driven picker; Settings → Manage snippets (full CRUD) |
| Auto-title suggestion | ChatGPT-style pre-filled when body has content |
| Send split-button | Send now / Schedule send / Save as draft |
| Scheduled sends | Surface in Drafts view with countdown |

## 5. Search & command

| Surface | Trigger | Behaviour |
|---|---|---|
| Command palette | ⌘K / Ctrl+K | Fuzzy across views / actions / contacts / messages / files / meetings |
| Topbar live search | click magnifier, type | 200 ms debounce; grouped results; arrow-key navigation |
| Search page | Enter from any search | Filters per type, full-page layout |

## 6. Notifications

| Element | Behaviour |
|---|---|
| Topbar bell | Unread count badge |
| Dropdown panel | Grouped Today / Yesterday / Earlier |
| Click-through | Navigate to source view + selection |
| Mark all as read | Persists `sendpalm-notif-last-seen` to localStorage |

## 7. Insights dashboard

7 cards: weekly volume + trend / Top People / reply time trend / channel share / pending follow-up count / agent actions / health distribution.

## 8. Drafts

- Sections: Scheduled / Pending approval / Manual / Sent.
- Status badges (pending / approved / sent / edited / discarded).
- Multi-select with batch Approve / Discard.

## 9. Agent

- Right-side panel with sessions (freeform / message / contact / event / file).
- Tasks with step-level progress + ETA.
- Drafts (Send / Edit / Edit manually).
- Memory editor (global + per-contact).
- Audit log with undo where possible.

## 10. Files

- Grid view with type filter pills + advanced filters (date / sender / size).
- Inline preview for image (with spy-pixel shield) / pdf (with "tracking stripped" notice) / doc / spreadsheet.

## 11. Per-account email settings

- Identity (label / display name / default From / reply-to)
- Signature (per-account override)
- Aliases (dynamic list, From dropdown sync)
- Sync (folder checkboxes + frequency)
- Automation (auto-BCC + vacation responder)

## 12. Privacy / tracking

- Tracker detector + HEY-style shield badge on thread header
- Per-account signature override
- Vacation responder toggle

## 13. Settings (7 tabs)

| Tab | Highlights |
|---|---|
| Profile | Display name / avatar / timezone / language / signature / Replay onboarding |
| Accounts | Connected accounts + Add account + per-account Settings |
| Preferences | Notifications / Quiet hours / Security / Sync & Storage / Snippets |
| Agent | Behavior toggles + memory editor |
| Labels | Full CRUD with preset colors |
| Data | Mailbox backup / Contacts CSV / Tasks JSON / Empty Trash / Delete all data (typed) / Delete account (mock) |
| Shortcuts | Editable keyboard shortcuts + restore defaults |

## 14. Three states

- **Empty:** every primary view has themed empty state with icon + title + copy.
- **Loading:** skeleton placeholders match final layout.
- **Error:** themed error state with retry.

## 15. Keyboard shortcuts (default)

- ⌘1–⌘9 views · `/` search · `?` help · `j`/`k` move · `x` select · `Enter` open · `;` bulk · `o` read together · `r` reply · `e` archive · `l` reply later · `a` set aside · `z` bubble up · `f` forward · `b` label · `v` move · `t` trash · `u` unread · `⌘N` new · `⌘K` palette · `⌘↩` send · `d/w/y` calendar views · `←/→` prev/next day.

All customizable in Settings → Shortcuts; `D.shortcuts` is the source of truth.

## 16. Onboarding

4-step wizard: Welcome → Connect channels → Indexing → Done. Replayable from Settings → Profile.

## 17. Sticky notes, contact notes, clips

- **Sticky notes:** per-message private notes (yellow card).
- **Contact notes:** Notes tab in contact detail with pinned notes.
- **Clips:** sidebar Clips view (Today / Earlier); per-message Clip action.