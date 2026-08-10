# HEY-Inspired Relay v8 Design Spec

## Objective

Transform Relay v8 from a web-dashboard-style prototype into a lightweight, native-feeling email client inspired by HEY. Implement bucket-based navigation, opinionated triage actions, a Contact Mission Control + Screener, and a clean compose/reply experience, while polishing typography and visual hierarchy.

## Principles

1. **Views are classification.** Instead of asking an LLM to tag every email, use rules + user choice to route messages into views/buckets.
2. **Every email has a clear next action.** Triage is not a state machine hidden in data; it's visible buttons.
3. **Contacts are Mission Control.** The contact detail page is where you decide what to do with a sender.
4. **Native, not web-SaaS.** Tight spacing, strong type hierarchy, subtle separators, responsive hover/active states.
5. **Keep QA green.** Each deliverable must leave `node qa-tmp/render.test.js` passing.

## Current State

- `prototype-v8.html` / `js/prototype-v8.js` / `css/prototype-v8.css` form a working prototype.
- Sidebar has: For You, People, Calendar, Files, Drafts.
- Feed uses filter pills: For You / Notifications / Newsletters / All.
- Contact panel shows profile, topics, upcoming, notes, activity, files.
- Message thread supports rendered/markdown source toggle and markdown download.
- QA renders feed, opens message panel, opens people/contact panel, checks download buttons.

## Target Architecture

### Navigation (Sidebar)

Group nav items into three sections:

- **Mail**
  - `imbox` — Important conversations (replaces "For You").
  - `feed` — Newsletters, marketing, bulk-read content.
  - `paperTrail` — Receipts, notifications, system, transactional.
  - `screener` — First-time senders pending user decision.
- **Workflow**
  - `replyLater` — Emails marked for future reply.
  - `setAside` — Emails parked for later handling.
  - `bubbleUp` — Snoozed emails that will resurface.
- **More**
  - `contacts` (was `people`)
  - `calendar`
  - `files`
  - `drafts`

Implementation notes:
- Replace `navItems` array in `js/prototype-v8.js`.
- Introduce section headings in sidebar (small uppercase labels).
- Active state follows current view.
- Mobile/responsive: same sidebar, collapsible later if needed.

### Data Model Extensions

Add optional fields to message objects in `prototype-data.js`:

```js
{
  bucket: 'imbox' | 'feed' | 'paperTrail',
  screened: boolean,
  blocked: boolean,
  replyLater: boolean,
  setAside: boolean,
  bubbleUpUntil: ISOString | null,
  firstSeen: boolean,  // true until user screens the sender
}
```

Add to contact objects:

```js
{
  defaultBucket: 'imbox' | 'feed' | 'paperTrail',
  notify: boolean,
  blocked: boolean,
}
```

Default values when missing must be backward-compatible:
- `bucket` inferred from existing rules if absent.
- `screened: true`, `firstSeen: false` for existing contacts.
- All workflow flags default to `false`.

### Classification Rules (No Mandatory LLM)

When a message is rendered or a sender is first seen, assign a bucket in this priority:

1. Sender/contact `blocked === true` → drop from feed (do not render).
2. Sender/contact `firstSeen === true` → render in Screener only.
3. Contact `defaultBucket` set → use it.
4. Subject/channel heuristics:
   - `ch === 'Calendar'` or tag `日历` → `paperTrail`.
   - `fm === '系统'` or keywords (`receipt`, `invoice`, `order`, `验证码`, `verification`, `notification`) → `paperTrail`.
   - Keywords (`newsletter`, `digest`, `update`, `unsubscribe`) or sender group `cold` → `feed`.
5. Fallback → `imbox`.

The existing `smartCategoryForEvent()` can be replaced/extended by a `getMessageBucket(m)` helper.

### Feed Behavior per View

Each bucket view is a feed list with the same card component but filtered by the bucket or workflow flag.

- `imbox` / `feed` / `paperTrail`: messages whose `bucket` matches.
- `screener`: messages where contact `firstSeen === true` and `screened === false`.
- `replyLater`: messages with `replyLater === true`.
- `setAside`: messages with `setAside === true`.
- `bubbleUp`: messages with `bubbleUpUntil` in the future.
- `contacts` / `calendar` / `files` / `drafts`: existing views, kept but visually aligned.

Sorting:
- Imbox: priority score (existing) then newest.
- Feed / Paper Trail: chronological, newest first.
- Screener: oldest first so users clear FIFO.
- Workflow buckets: by action date / due date.

### Triage Actions

Every message card and message detail gets a consistent action bar:

- **Reply** — open composer.
- **Reply Later** — mark `replyLater = true`, show in Reply Later view.
- **Set Aside** — mark `setAside = true`.
- **Bubble Up** — prompt for time (later today / tomorrow / next week / custom), set `bubbleUpUntil`.
- **Move to…** — submenu: Imbox / Feed / Paper Trail.
- **Block sender** — visible in Screener and message detail; sets contact `blocked = true`.

Visual placement:
- In feed card: swipe actions can map to Set Aside (left) and Reply Later (right) or configurable.
- In message detail bottom action bar: primary Reply button + icon buttons for Reply All / Forward / Reply Later / Set Aside / Bubble Up / More (Move/Block).

### Contact Mission Control

The contact detail panel becomes the sender control center:

- Header: avatar, name, title/company, close button, action icons (email, download markdown).
- **Routing**
  - Default bucket selector: Imbox / Feed / Paper Trail.
  - Notify toggle.
  - Block button.
- **Topics**: existing chips, flattened style.
- **Upcoming**: next meeting + suggested action.
- **Notes**: editable, flat.
- **Activity**: recent threads from this contact.
- **Files**: files from this contact.
- **All threads** mini-list: subject + date; click opens thread.

Implementation: extend `renderContactPanel()` and helper functions; remove remaining CRM stats/insights code if any.

### Screener View

A dedicated main view listing first-time senders:

- Each row shows: sender avatar, name/email, subject + preview, time.
- Actions per row:
  - **Yes to Imbox**
  - **Yes to Feed**
  - **Yes to Paper Trail**
  - **No / Block**
- Batch select via avatar checkbox (nice-to-have; start with per-row).

After a decision, mark contact `firstSeen = false`, `screened = true`, `defaultBucket = chosen bucket`, and move the message out of Screener.

### Compose / Reply

Clean composer modal/window:

- To field with contact autocomplete.
- Subject field.
- Body textarea (markdown-first). Default font is monospaced-ish for markdown clarity, but rendered preview available.
- Toolbar: bold, italic, link, code block, list, attachment, AI draft, Snippets.
- Primary **Send** button (solid accent).
- Secondary: minimize draft to bottom dock, discard.

Reply context:
- Pre-fill To and Subject (`Re:` / `Fwd:`).
- Inline reply: support breaking quoted text and typing between paragraphs (start with quoted block at bottom).
- Snippets: small popup of reusable text snippets.

### UI/UX Polish

- **Typography**: calibrate sizes:
  - View title: 22px / weight 700.
  - Section header (e.g., "NEW FOR YOU"): 11px uppercase / weight 700 / muted.
  - List sender name: 14px / weight 600.
  - List subject: 13px / weight 500.
  - Preview: 13px / muted.
  - Time: 12px / mono / muted.
- **Color**: keep light native palette; accent remains system blue or shifts to a slightly more distinctive Relay indigo. Final decision during implementation.
- **Spacing**: reduce card padding further; use 1px separators; no card backgrounds.
- **Icons**: continue Phosphor; ensure every icon has a tooltip/title.
- **Buttons**: clear hover/active; primary solid, secondary ghost, icon-only circular where appropriate.
- **Empty states**: friendly copy per view ("No new senders to screen", "Reply Later is empty").

## Testing

- `node --check js/prototype-v8.js`
- `node --check prototype-data.js`
- `node qa-tmp/render.test.js`
- Update QA assertions if navigation/contact structure changes.

## Rollout Plan (Incremental)

1. **Navigation + classification rules** — replace sidebar, add bucket fields, make views work.
2. **Triage actions** — add Reply Later / Set Aside / Bubble Up / Move / Block.
3. **Contact Mission Control + Screener** — rebuild contact panel, add Screener view.
4. **Compose / reply + snippets** — clean composer, markdown-first, snippets.
5. **UI/UX polish pass** — typography, color, spacing, interactions, QA.

## Open Decisions

- Accent color: keep system blue or move to a Relay indigo/purple?
- Should Bubble Up use a simple preset picker or a date/time picker?
- Should swipe actions be configurable or fixed?

These will be decided during implementation and updated in this spec.
