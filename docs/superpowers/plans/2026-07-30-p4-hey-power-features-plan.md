# P4 — HEY-Style Power Features & Notification Layer

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 prototype-v11 P3 基础上，补齐 HEY 风格的核心 workflow（Reply Later / Set Aside / Bubble Up / Snooze）、通知中心、命令面板、文件预览、会议详情、草稿中心、Send Later、Follow-up Reminder、Snippets 模板、Bundles、Sticky Notes、Clips、Three-States、Live Search 等关键交互，让原型接近 HEY/Mail.app/Superhuman 这一档的体验密度。

**Architecture:** 沿用 P1/P2/P3 的共享表单 / Modal / `openModalCard` 基础设施、`renderMain()` 全量刷新模式、内存 `D.*` 数据；引入 `D.workflows`、`D.notifications`、`D.clips`、`D.snippets`、`D.bundles`、`D.reminders`、`D.stickies`、`D.contactNotes`、`D.scheduledSends`、`D.followUps` 等新集合。

**Tech Stack:** Vanilla JS, CSS, HTML modal containers, in-memory data.

## Reference

- HEY 功能清单：https://hey.com/features/（重点参考 Screener / Imbox / Reply Later / Set Aside / Bubble Up / Workflows / Snippets / Sticky Notes / Clips / Bundles / Read Together / Power Through New）
- HEY 快捷键：https://hey.com/keyboard-shortcuts/
- 已有 P3 基础：Onboarding / Insights / Data / Shortcuts / Email Settings 已完成

## Global Constraints

- 沿用 P1 helpers：`openModalCard`、`renderFormGroup`、`renderToggle`、`renderPillInput`、`confirmDestructive`、`elAttr`、`el`、`icon`、`showToast`、`renderMain`、`setView`
- 所有 modal 支持 Esc / 遮罩点击 / × 关闭；移动端 modal 全屏、底部固定操作栏
- HEY 大疏单栏 / iOS toggle / 主按钮右下沿用
- 数据全在 `D.*`，不引入持久化 / API
- 每完成一个任务需通过 Playwright headless 截图 + 运行时错误检查验证

---

## Task A: Reply Later / Set Aside / Bubble Up / Snooze（HEY 工作流）

**Files:**
- Modify: `js/prototype-v11.js` — add 4 actions on message, 4 piles in imbox, detail-page toggle, kebab action menu
- Modify: `prototype-data.js` — add `D.workflowState` per message, plus `D.reminders` collection
- Modify: `css/prototype-v11.css` — HEY-style pile rows, fan-out animation
- Test: Playwright

**Behavior (HEY reference):**
- **Reply Later (L)** — moves email to dedicated Reply Later pile at bottom of Imbox. Same-screen fanned list shows count.
- **Set Aside (A)** — moves email to Set Aside pile. Fan to reveal all. Distinct from star/flag: own pile, predictable location.
- **Bubble Up (Z)** — sets a future timestamp (1h / 3h / Tomorrow / Next week / Pick date). When that time passes, email floats back to top of Imbox.
- **Snooze / Remind (B)** — snooze for a duration OR pick a custom date. Removes from view, surfaces at the time.

**State model:**
```js
D.workflowState = {
  [msgId]: {
    replyLater: true | false,
    setAside: true | false,
    bubbleUpAt: <ISO> | null,
    remindAt: <ISO> | null
  }
}
```

**Steps:**

- [ ] **Step 1: Extend data model**
   Add `D.workflowState = {}` and `D.reminders = []` to `prototype-data.js`. Helpers `getWorkflowState(msgId)` returning default + stored; `setWorkflowState(msgId, patch)`.

- [ ] **Step 2: Pile rendering in Imbox**
   Below the message list, render `Reply Later` and `Set Aside` piles as collapsed cards with count + fan-on-click. Bubble Up / Remind affect sort: when `bubbleUpAt` is in the past, prepend to "New For You"; otherwise push to "Snoozed" section.

- [ ] **Step 3: Kebab action menu in message detail**
   In the message detail bottom action bar (and message row right-click menu), add 4 actions: Reply Later (L), Set Aside (A), Bubble Up (Z → opens date picker), Snooze / Remind (B → opens duration picker).

- [ ] **Step 4: Bubble Up / Snooze pickers**
   Modal with quick presets (1h / 3h / Tomorrow 9am / Next Monday / Pick date) + custom datetime input.

- [ ] **Step 5: Periodic re-surfacing**
   `setInterval` (every 60s in prototype) checks for `bubbleUpAt`/`remindAt` timestamps that have passed and updates Imbox sort order + emits a toast for items that surfaced.

- [ ] **Step 6: Test and commit**
   ```bash
   git add js/prototype-v11.js prototype-data.js css/prototype-v11.css
   git commit -m "feat(workflow): Reply Later / Set Aside / Bubble Up / Snooze per HEY"
   ```

---

## Task B: Notification Center

**Files:**
- Modify: `js/prototype-v11.js` — topbar bell + dropdown panel
- Modify: `prototype-data.js` — add `D.notifications`
- Modify: `css/prototype-v11.css` — bell + panel
- Test: Playwright

**Behavior:**
- Bell icon in topbar with unread count badge.
- Click → opens dropdown panel (right-aligned) listing recent notifications:
  - 关系提醒：「王洋 已 45 天未联系」
  - 跟进提醒：「你标记的 3 条跟进尚未处理」
  - 草稿提醒：「有 2 份草稿等待审批」
  - Agent 完成提醒：「会议简报已生成」
  - Snooze / Bubble Up / Reply Later 回浮提醒
- Each notification: icon, title, time, click-through to source.
- Mark all as read; persist last-seen timestamp to localStorage.

**Steps:**

- [ ] **Step 1: Data + seed**
   Add `D.notifications = [...]` (5+ seeded entries spanning all categories). Helper `addNotification({ type, title, body, ref })` and `unreadCount()`.

- [ ] **Step 2: Bell button + badge**
   Add bell button in topbar; badge shows unread count, hides when 0.

- [ ] **Step 3: Notification panel**
   Right-aligned dropdown panel (not modal) showing grouped list: Today / Yesterday / Earlier. Each row: icon (color-coded by type), title, snippet, time ago. Footer: "Mark all as read".

- [ ] **Step 4: Click-through**
   Click a notification → navigate to source view (e.g. contact detail, meeting detail, draft list).

- [ ] **Step 5: Test and commit**
   ```bash
   git commit -m "feat(notifications): bell + dropdown notification center"
   ```

---

## Task C: Command Palette (⌘K)

**Files:**
- Modify: `js/prototype-v11.js` — global ⌘K / Ctrl+K listener + palette UI
- Modify: `css/prototype-v11.css` — palette styles
- Test: Playwright

**Behavior:**
- Press `⌘K` (or `Ctrl+K`) anywhere → centered palette opens
- Fuzzy search across:
  - Views: Go to Imbox / Contacts / Companies / Calendar / Files / Insights / Settings
  - Actions: Compose new message / New event / New task / New contact
  - Contacts: by name / email / company (limit 5)
  - Messages: by subject / sender (limit 5)
  - Recent items (last 5)
- ↑/↓ navigate, Enter to execute, Esc to close
- Grouped sections with section headers

**Steps:**

- [ ] **Step 1: Palette modal**
   Build `openCommandPalette()` using `openModalCard` (centered, full-width input at top, results list below).

- [ ] **Step 2: Search index**
   Build an index of: views, actions, contacts, messages. Fuzzy match with simple scoring (substring + word-boundary bonus).

- [ ] **Step 3: Keyboard navigation**
   Global keydown for `⌘K` / `Ctrl+K` opens palette. Inside palette: ↑/↓/Enter/Esc.

- [ ] **Step 4: Result rendering**
   Group results by type, show top 5 per group, render with icon + title + subtitle.

- [ ] **Step 5: Test and commit**
   ```bash
   git commit -m "feat(command): ⌘K command palette with fuzzy search"
   ```

---

## Task D: File Preview (PDF / Image / Text)

**Files:**
- Modify: `js/prototype-v11.js` — `renderFilePreview(file)` panel
- Modify: `prototype-data.js` — add sample file content blobs
- Modify: `css/prototype-v11.css` — preview viewer
- Test: Playwright

**Behavior:**
- Click a file in Files view or message attachment → opens full-height preview panel (right side or modal).
- Detection:
  - `.pdf` → embedded preview placeholder + metadata (HEY blocks spy trackers; show "PDF preview — tracking stripped")
  - Image (`.png .jpg .gif`) → actual `<img>` rendering with the picsum URL or inline placeholder
  - Text / doc → text preview with monospace font
  - Other → generic icon + metadata
- Preview header: filename, size, sender, date, actions (Download / Open in new tab / Forward)

**Steps:**

- [ ] **Step 1: Sample file content**
   In `prototype-data.js`, add 3-5 mock file records with type, contentType, inline data (text or image URL).

- [ ] **Step 2: Preview panel**
   `renderFilePreview(fileId)` opens a side panel (re-use `renderDetailPanel`) or full modal with header + viewer + footer.

- [ ] **Step 3: Type detection + render**
   Switch on file.type/contentType: image → `<img>`; pdf → "PDF — preview placeholder (tracking stripped)" notice + download CTA; text → `<pre>`; other → icon + meta.

- [ ] **Step 4: Test and commit**
   ```bash
   git commit -m "feat(files): preview panel for image/pdf/text attachments"
   ```

---

## Task E: Meeting Detail View

**Files:**
- Modify: `js/prototype-v11.js` — `renderMeetingDetail(eventId)` panel
- Modify: `prototype-data.js` — extend events with `agenda`, `brief`, `notes`, `actionItems`
- Modify: `css/prototype-v11.css` — meeting detail
- Test: Playwright

**Behavior:**
- Click a meeting → opens detail panel with:
  - Header: title, datetime, location
  - **Brief** (before meeting): auto-generated summary of relevant emails / past meetings / contact profiles of attendees
  - **Agenda**: editable list (add / remove items)
  - **Attendees**: avatar list with health score badge
  - **Notes**: free-form textarea (persists to D.events[id].notes)
  - **Action items**: editable list of follow-ups (each item: title, owner, due date, mark done)
  - **Materials**: linked files
  - **Recording / Transcript**: placeholder

**Steps:**

- [ ] **Step 1: Extend event model**
   Add `agenda: []`, `brief: ''`, `notes: ''`, `actionItems: []`, `materials: []` to seeded events.

- [ ] **Step 2: Meeting detail panel**
   `renderMeetingDetail(eventId)` returns a detail-panel-style layout using existing helpers.

- [ ] **Step 3: Brief generator (mocked)**
   `generateMeetingBrief(eventId)` scans messages from attendees in the past 30 days and surfaces top 3 topics.

- [ ] **Step 4: Editable agenda / notes / action items**
   Inline editing with simple add / remove buttons. Persist on blur.

- [ ] **Step 5: Test and commit**
   ```bash
   git commit -m "feat(meetings): detail panel with brief, agenda, notes, action items"
   ```

---

## Task F: Drafts List / Detail

**Files:**
- Modify: `js/prototype-v11.js` — `renderDraftsView()`, `openDraftList()`
- Modify: `prototype-data.js` — extend `D.drafts` / `D.agentDrafts` with `status: 'pending' | 'approved' | 'sent' | 'edited'`
- Modify: `css/prototype-v11.css` — drafts list
- Test: Playwright

**Behavior:**
- New `Drafts` view in sidebar (next to Files).
- List grouped by status: Pending approval (Agent drafts) / In progress (manual drafts) / Sent (history).
- Each row: recipient, subject, snippet, last edited, status badge.
- Multi-select for batch approve / discard.
- Detail view opens draft in compose window with status.

**Steps:**

- [ ] **Step 1: Status field + seed**
   All drafts have `status` (default 'pending' for agent, 'edited' for manual). Add 3+ agent drafts and 2+ manual drafts with varied status.

- [ ] **Step 2: Drafts view**
   `renderDraftsView()` renders grouped list. Multi-select checkbox column.

- [ ] **Step 3: Batch actions**
   Bottom action bar when rows selected: Approve all / Discard all / Move to Sent.

- [ ] **Step 4: Sidebar nav entry**
   Add `Drafts` to navSections with icon `ph-pencil-line`.

- [ ] **Step 5: Test and commit**
   ```bash
   git commit -m "feat(drafts): drafts list view with status groups and batch actions"
   ```

---

## Task G: Send Later / Scheduled Send

**Files:**
- Modify: `js/prototype-v11.js` — extend compose with Send Later option
- Modify: `prototype-data.js` — add `D.scheduledSends`
- Modify: `css/prototype-v11.css` — schedule picker styles
- Test: Playwright

**Behavior:**
- In compose window, Send button has dropdown: Send now / Send later (date+time picker) / Save as draft.
- Scheduled sends surface in:
  - A "Scheduled" tab on Drafts view (or a Scheduled section).
  - Notification center fires when send time passes (mock: shows "Would have sent").
- Edit / cancel scheduled send.

**Steps:**

- [ ] **Step 1: Data model**
   `D.scheduledSends = [{ id, msg draft snapshot, scheduledAt, accountId, status }]`.

- [ ] **Step 2: Send Later button**
   In compose footer, change Send to a split button: primary action + dropdown. Dropdown options: Send now (default), Schedule send, Save draft.

- [ ] **Step 3: Schedule picker**
   Reuse quick presets (Tomorrow 9am / Next Monday / Pick date+time) + validation (no past times).

- [ ] **Step 4: Scheduled list**
   Drafts view shows scheduled items with countdown ("Sends in 2h").

- [ ] **Step 5: Test and commit**
   ```bash
   git commit -m "feat(compose): Send Later with schedule picker and scheduled list"
   ```

---

## Task H: Follow-up Reminder

**Files:**
- Modify: `js/prototype-v11.js` — `setFollowUp(msgId, when)`; show in detail and message list
- Modify: `prototype-data.js` — add `D.followUps`
- Modify: `css/prototype-v11.css` — follow-up badge
- Test: Playwright

**Behavior:**
- In message detail, button: "Set follow-up" → date+time picker (3 days / 1 week / 2 weeks / custom).
- After sending, prompt: "Follow up in N days if no reply?" → checkbox + duration.
- Follow-up badge on message row + dedicated Follow-ups view in sidebar.
- Notification center fires when reminder due.

**Steps:**

- [ ] **Step 1: Data model**
   `D.followUps = [{ id, msgId, dueAt, status: 'pending' | 'done' | 'cancelled' }]`.

- [ ] **Step 2: Set follow-up modal**
   Reuse quick presets + custom datetime. Persists to `D.followUps`.

- [ ] **Step 3: Follow-up badge**
   Message row shows small clock icon if a pending follow-up exists; tooltip with "Due in 2 days".

- [ ] **Step 4: Follow-ups view**
   Sidebar entry `Follow-ups` (icon `ph-bell-ringing`). List grouped by Overdue / Today / This week / Later. Each row: contact, message subject, due, action (Open / Mark done).

- [ ] **Step 5: Compose-time prompt**
   After sending, small toast with action "Set follow-up in 3 days" — clicking applies follow-up to that message.

- [ ] **Step 6: Test and commit**
   ```bash
   git commit -m "feat(followup): follow-up reminder badge + view + post-send prompt"
   ```

---

## Task I: Snippets / Templates Manager

**Files:**
- Modify: `js/prototype-v11.js` — `openSnippetsManager()`; extend compose toolbar snippet menu
- Modify: `prototype-data.js` — add `D.snippets` with default 3 + CRUD
- Modify: `css/prototype-v11.css` — snippets modal
- Test: Playwright

**Behavior:**
- Settings → new entry: Snippets (or in Preferences tab).
- Manager: list of snippet {label, body, shortcut (optional)}.
- CRUD with modal.
- In compose, snippet button now opens a search-and-pick modal populated from D.snippets.

**Steps:**

- [ ] **Step 1: Data + seed**
   `D.snippets = [{ id, label, body, shortcut? }]`. Seed with 3-5 starter snippets.

- [ ] **Step 2: Manager UI**
   `openSnippetsManager()` lists all snippets with Edit / Delete; New button at top.

- [ ] **Step 3: Compose integration**
   Replace hardcoded snippets array in compose toolbar with `D.snippets`; show search input when > 8 snippets.

- [ ] **Step 4: Settings entry**
   Add Snippets card to Settings → Preferences (or new tab Snippets).

- [ ] **Step 5: Test and commit**
   ```bash
   git commit -m "feat(snippets): snippets manager + integration with compose"
   ```

---

## Task J: Bundles

**Files:**
- Modify: `js/prototype-v11.js` — collapse same-sender emails into a single row in Imbox
- Modify: `prototype-data.js` — add `D.bundles` (per-account / per-sender) with `enabled` flag
- Modify: `css/prototype-v11.css` — bundle row + expand UI
- Test: Playwright

**Behavior:**
- HEY-style bundle row: "X — 5 emails — latest snippet".
- Click row → expands to show all 5 emails (vertical stack).
- Per-sender bundle toggle in Settings → Bundles.
- Auto-bundle detection: if a sender has ≥ 3 unread in the same view.

**Steps:**

- [ ] **Step 1: Bundle config**
   `D.bundles = { [senderId]: { enabled, label } }`.

- [ ] **Step 2: Bundle row in Imbox**
   Group messages by sender when bundle enabled; render collapsed row with count and latest snippet. Expand on click.

- [ ] **Step 3: Settings UI**
   Add Bundles section in Preferences tab: list of "auto-detected" senders with toggle.

- [ ] **Step 4: Test and commit**
   ```bash
   git commit -m "feat(bundles): HEY-style sender bundling in Imbox"
   ```

---

## Task K: Sticky Notes on Email

**Files:**
- Modify: `js/prototype-v11.js` — add note textarea in message detail; save to `D.stickies`
- Modify: `prototype-data.js` — add `D.stickies`
- Modify: `css/prototype-v11.css` — sticky note UI
- Test: Playwright

**Behavior:**
- In message detail, sticky-note icon in action bar → opens inline editor (HEY yellow background).
- Notes are private, attached to the message, surface in Contact Notes / Search.
- Multiple stickies per message possible.

**Steps:**

- [ ] **Step 1: Data model**
   `D.stickies = [{ id, msgId, body, createdAt }]`.

- [ ] **Step 2: Sticky UI**
   Yellow card pinned to message detail. Inline editable. Auto-save on blur.

- [ ] **Step 3: Action button**
   Action bar icon (paperclip-note). Click toggles sticky editor.

- [ ] **Step 4: Search integration**
   Add stickies to global search index (Task C).

- [ ] **Step 5: Test and commit**
   ```bash
   git commit -m "feat(sticky): HEY-style sticky notes on email"
   ```

---

## Task L: Rich Contact Notes

**Files:**
- Modify: `js/prototype-v11.js` — separate contact notes panel from existing notes field
- Modify: `prototype-data.js` — add `D.contactNotes` with `[{ id, contactId, body, createdAt, pinned }]`
- Modify: `css/prototype-v11.css` — notes panel
- Test: Playwright

**Behavior:**
- HEY-style contact notes: a sidebar section on contact detail with multiple notes.
- Each note: body, timestamp, pin to top.
- Search notes (integrated with Task C).

**Steps:**

- [ ] **Step 1: Data model**
   `D.contactNotes = [...]`. Seed 3-5 notes per high-value contact.

- [ ] **Step 2: Contact notes UI**
   Tab or sidebar section in contact detail: list of notes, add-new textarea at bottom, pin button per note.

- [ ] **Step 3: Test and commit**
   ```bash
   git commit -m "feat(contacts): HEY-style rich contact notes with pin"
   ```

---

## Task M: Spy Pixel Blocker + Tracking Indicator

**Files:**
- Modify: `js/prototype-v11.js` — strip tracking params on preview; show "Tracker blocked" badge
- Modify: `css/prototype-v11.css` — tracker badge
- Test: Playwright

**Behavior:**
- In message detail, if the email body has any tracking URLs (utm_*, /track, pixel.gif), show a small "1 tracker blocked" badge.
- Click badge → list of stripped trackers.

**Steps:**

- [ ] **Step 1: Detector helper**
   `detectTrackers(text)` returns array of matched tracker URLs.

- [ ] **Step 2: Badge in message header**
   Render badge when trackers detected.

- [ ] **Step 3: Test and commit**
   ```bash
   git commit -m "feat(privacy): spy pixel blocker with tracking indicator"
   ```

---

## Task N: Three States (Empty / Loading / Error)

**Files:**
- Modify: `js/prototype-v11.js` — wrap view renderers with state-aware shell
- Modify: `css/prototype-v11.css` — empty / skeleton / error components
- Test: Playwright

**Behavior:**
- Every view renders one of:
  - **Empty state** — icon + title + description + primary CTA (e.g. "No contacts yet — Add one").
  - **Loading state** — skeleton placeholders matching final layout.
  - **Error state** — error icon + message + retry button.
- Cover: Imbox, Contacts, Companies, Calendar, Files, Insights, Drafts, Follow-ups, Notifications, Settings tabs.

**Steps:**

- [ ] **Step 1: Helpers**
   `renderEmptyState({ icon, title, description, action })`, `renderSkeleton(kind)`, `renderErrorState({ title, message, retry })`.

- [ ] **Step 2: Apply across views**
   For each view, add empty / error states (loading is a stretch — only add for async flows).

- [ ] **Step 3: Test and commit**
   ```bash
   git commit -m "feat(states): empty/loading/error states across all views"
   ```

---

## Task O: Live Search (Debounced Search-as-you-type)

**Files:**
- Modify: `js/prototype-v11.js` — topbar search input + live results dropdown
- Modify: `css/prototype-v11.css` — search dropdown
- Test: Playwright

**Behavior:**
- Topbar search input (placeholder: "Search contacts, messages, files…").
- 200ms debounce → renders dropdown with grouped results (People / Messages / Files / Meetings / Tasks).
- Click result → navigate.

**Steps:**

- [ ] **Step 1: Topbar search**
   Add input to topbar (next to bell).

- [ ] **Step 2: Debounced search**
   `searchAll(q)` runs 200ms after last keystroke; renders dropdown with grouped results (max 5 per group).

- [ ] **Step 3: Keyboard nav**
   Arrow keys to navigate results, Enter to open, Esc to close.

- [ ] **Step 4: Test and commit**
   ```bash
   git commit -m "feat(search): live debounced search-as-you-type in topbar"
   ```

---

## Task P: Clips (Save Snippets from Emails)

**Files:**
- Modify: `js/prototype-v11.js` — "Save as clip" action on selected text in message; `renderClipsView()`
- Modify: `prototype-data.js` — add `D.clips`
- Modify: `css/prototype-v11.css` — clips view
- Test: Playwright

**Behavior:**
- Select text in message body → small floating action "Save as clip".
- Clips view in sidebar: list of saved snippets with source message link.
- Click clip → opens original message.

**Steps:**

- [ ] **Step 1: Data model**
   `D.clips = [{ id, text, msgId, contactId?, createdAt }]`.

- [ ] **Step 2: Selection action**
   On `selectionchange` in message body, show floating "Save clip" button near selection.

- [ ] **Step 3: Clips view**
   Sidebar entry `Clips` (icon `ph-bookmarks`). List grouped by Today / Earlier.

- [ ] **Step 4: Test and commit**
   ```bash
   git commit -m "feat(clips): HEY-style clip library from email text"
   ```

---

## P4 验收

- [ ] Reply Later / Set Aside / Bubble Up / Snooze 工作流全部可演示
- [ ] 通知中心 bell + 中心面板可演示
- [ ] ⌘K 命令面板可调用，模糊搜索可用
- [ ] 文件预览对 image / pdf / text 三类可演示
- [ ] 会议详情有 brief / agenda / notes / action items
- [ ] Drafts 视图可演示（pending / in-progress / sent）
- [ ] Send Later 可调度
- [ ] Follow-up reminder 可设置 + 视图可演示
- [ ] Snippets 模板 CRUD 完整
- [ ] Bundles 在 Imbox 中可折叠
- [ ] Sticky notes 可贴在消息上
- [ ] Contact notes 独立面板可用
- [ ] 跟踪器指示器在有 tracker 的消息上可见
- [ ] 所有 view 都有 empty / error 状态
- [ ] Topbar 实时搜索可用
- [ ] Clips 库可演示
- [ ] WebBridge / headless 截图验证无运行时错误
- [ ] 所有改动已提交并 push 到 main

---

## Phase 拆分建议

| Phase | 范围 | 估计任务数 |
|-------|------|-----------|
| **P4（现在做）** | HEY 核心 workflow + 通知中心 + 命令面板 | 16 tasks |
| **P5（下次）** | UX 完善 + 移动端：theme / density / block / drag-drop / inline edit / swipe / pull-to-refresh / bottom sheet / long-press / unfurl / thread merge / rename subject / mute / share / read together / focus & reply / power through / modal nesting / form dirty state / duplicate detection | ~20 tasks |
| **P6（再下次）** | 可访问性 + 全局 polish：keyboard nav / aria / focus rings / color contrast / sound / haptic / page transitions / toast stacking / skeleton | ~10 tasks |
| **P7** | PRD 重写 — 把所有功能按 view / interaction 维度完整列出 | 1 doc |