# Relay v9 — HEY-Inspired Desktop Client Design

## Goal
Transform the current Relay v9 prototype from a web-like SaaS interface into a polished, native-feeling desktop email client. The interaction language is heavily inspired by HEY.com, but adapted to desktop conventions (sidebar, topbar, detail panels, keyboard shortcuts, bottom action bars).

## Non-Goals
- Do not rebuild as a multi-window/tabbed Outlook-style workspace.
- Do not copy HEY's centered onboarding cards literally; translate them into desktop flows.
- Do not add new backend or real email protocols; keep it as a high-fidelity HTML/JS prototype.

## Guiding Principles
1. **One decision at a time.** Gate, Focus Reply, and Bubble Up should feel like a clear sequence, not a crowded list.
2. **Actions live where the content lives.** Reading an email shows its actions at the bottom; a contact shows actions at the top.
3. **Natural, restrained motion.** Popovers and transitions should be quick (150–250 ms), use opacity + subtle translate, and never feel flashy.
4. **Keyboard-first navigation.** Every main view has a ⌘/Ctrl+number shortcut; lists support arrow keys + Enter.
5. **Real data at scale.** Lists must look credible with tens/hundreds of items: compact rows, clear hierarchy, hover/active states.

## Architecture / Layout

```
┌──────────────────────────────────────────────────────────────┐
│ [●●●]                    Relay                               │  titlebar
├──────────────────────────────────────────────────────────────┤
│ [🔍]              Inbox                         [🔔] [👤]    │  topbar
├────────┬─────────────────────────────────────────┬───────────┤
│        │                                         │           │
│  nav   │              main content               │  detail   │
│        │                                         │  panel    │
│        │                                         │           │
└────────┴─────────────────────────────────────────┴───────────┘
```

- **Titlebar**: macOS-style traffic lights + centered window title. Stays subtle.
- **Topbar**: search toggle, current view title, notifications, profile.
- **Sidebar**: compact icon-only vertical nav with sections (Mail, Workflow, More). Active item uses a pill background.
- **Main**: scrollable content area. Views are full-height and self-contained.
- **Detail panel**: slides in from the right when an email, contact, file, or meeting is selected. Can be closed with Escape or a close button.

## 1. Gate / Screener

### Current Problem
The Gate is a centered list with Yes/No buttons. It feels like a web form, not a triage flow.

### New Design
- **Single-card focus**: show one unscreened sender at a time in the center of the main area.
- **Large, clear actions** below the card:
  - **Yes** (primary blue) → immediately reveal a second row of bucket choices: Inbox / Stream / Records.
  - **No** (secondary gray) → block sender and animate the card away.
- After a decision, the card slides out (direction indicates Yes/No), and the next sender slides in.
- If no senders remain, show a friendly empty state: "All caught up. No one new is waiting at the Gate."
- Gate keeps a history link to "Screened in / Screened out" (existing screenerHistory view), but presented as a small link below the card, not a tab.

## 2. Inbox

### Current Problem
List looks like a generic feed; no sense of "new vs. seen" priority.

### New Design
- Two clearly separated sections:
  - **New for you** — unseen messages, sorted by priority score.
  - **Previously seen** — seen messages, sorted by date.
- Section headers are sticky and use small uppercase labels.
- A **"Power Through New"** button appears at the top right of "New for you". Clicking it enters Focus Reply mode for all new messages.
- Each row shows: avatar, name+email, subject, short preview, time, and a subtle unread dot.
- Hover reveals quick actions: Reply Later / Set Aside / Bubble Up / Archive.
- Clicking a row opens the message in the detail panel (not a new page).
- Empty state: friendly message + suggestion to invite someone to email you.

## 3. Reading Email (Detail Panel)

### Layout
- Right-side panel with email header, body, attachments, and a **fixed bottom action bar**.
- Header shows: avatar, sender name + email, to you, time, and a "more" button.
- Body is rendered as clean text/markdown with comfortable line height.

### Bottom Action Bar
Always visible at the bottom of the detail panel:

```
[Reply Now] [Reply Later] [Set Aside] [Bubble Up] [More]
```

- **Reply Now**: opens compose modal pre-filled as reply.
- **Reply Later**: moves message to Pending; updates badge; toast confirms.
- **Set Aside**: moves message to Saved; updates badge.
- **Bubble Up**: opens a popover time picker:
  - Now
  - Later today
  - Tomorrow
  - This weekend
  - Next week
  - Pick a date…
  - If no reply by…
- **More**: opens a popover menu:
  - Forward
  - Label…
  - Move to Inbox / Stream / Records
  - Trash
  - Thread options (Mark unseen, Ignore thread, Add note, Print)

### Animations
- Panel slides in from right with `translateX(20px)` + opacity (200 ms, ease-out).
- Action bar buttons scale slightly on press.
- Popovers fade in + translateY(-4px) (150 ms).

## 4. Compose / Reply

### Layout
- Modal centered on screen, not full-page.
- Fields: To (with contact chips), Subject, body.
- Bottom bar: Send dropdown, Save draft, attach, formatting, trash.
- Reply mode pre-fills recipient and subject, and includes a quoted header.

## 5. Contacts

### List View
- Simple list: avatar, name, email, last contact time.
- Import / New buttons in topbar (when view is Contacts).

### Detail View
- Header action bar (like HEY contact page):
  - Notify / Don't notify
  - Deliver to Inbox / Stream / Records
  - Autofile
  - Add note
- Below: tabs for Timeline, Emails, Files, Meetings.
- Timeline shows mixed email + meeting + note events in chronological order.

## 6. Stream, Records, Pending, Saved, Remind

- Maintain as distinct views in sidebar.
- Stream: card-based reader, but cards should be more compact and use better typography.
- Records: list view optimized for receipts/notifications (show sender, subject, date, attachments).
- Pending, Saved, Remind: focused lists with clear empty states and bulk actions.

## 7. Files

- Grid or list of attachments across all messages.
- Filter by type (PDF, Image, Spreadsheet, Doc).
- Empty state with friendly copy and illustration placeholder.

## 8. Calendar

- Keep the existing day timeline but polish:
  - Cleaner time markers.
  - Meeting cards that show title, people, location, prep checklist.
  - Click a meeting opens detail panel.

## 9. Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| ⌘1 / Ctrl1 | Inbox |
| ⌘2 / Ctrl2 | Stream |
| ⌘3 / Ctrl3 | Records |
| ⌘4 / Ctrl4 | Gate |
| ⌘5 / Ctrl5 | Pending |
| ⌘6 / Ctrl6 | Saved |
| ⌘7 / Ctrl7 | Contacts |
| ⌘K / CtrlK | Command palette |
| ⌘N / CtrlN | New message |
| ↑ / ↓ | Navigate list |
| Enter | Open selected |
| E | Archive |
| R | Reply |
| L | Reply Later |
| S | Set Aside |
| B | Bubble Up |

## 10. Visual Polish Checklist

- Replace any remaining text-only buttons with Phosphor icons + labels.
- Use consistent 6–10 px border-radius.
- Shadows should be subtle: 0 1px 2px for cards, 0 8px 24px for modals/panels.
- Typography: system fonts, tight leading, clear weight hierarchy.
- Empty states: short headline + one sentence + one action.
- Active states: blue pill for nav, blue border for selected rows.

## Files to Modify
- `prototype-v9.html` — minor structural tweaks if needed.
- `css/prototype-v9.css` — extensive visual and animation updates.
- `js/prototype-v9.js` — rewrite Gate, Inbox, detail panel, action bars, popovers, keyboard shortcuts.
- `prototype-data.js` — enrich contacts/messages for realistic demo data.

## Success Criteria
- Gate feels like a decision flow, not a list.
- Inbox clearly separates new vs. seen.
- Every button in the reading view is clickable and does something visible.
- Detail panel slides in naturally and closes with Escape.
- Keyboard shortcuts work.
- QA passes: `node --check js/prototype-v9.js && node --check prototype-data.js && node qa-tmp/render-v9.test.js`.
