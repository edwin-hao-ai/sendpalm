# Contact Comprehensive Improvement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the root cause of incomplete contact Timeline/Files, then bring the entire Contact/Company surface to PRD + prototype-v11 parity with per-contact queries, full UI states, and tests.

**Architecture:** Replace whole-table loads in `ContactPanel` and `CompanyPanel` with targeted SQL queries (`listContactMessages`, `listContactFiles`, etc.), then layer the missing UI features (Timeline filters, Follow-up markers, Files grid, richer Insights, Company Insights) on top of the corrected data flow. Every tab gets explicit empty/loading/error states.

**Tech Stack:** SolidJS, Tauri 2, SQLite (`tauri-plugin-sql`), TypeScript strict, Vitest, Playwright.

## Global Constraints

- **No whole-table loads** for contact-scoped data. Use per-contact SQL queries with `pid IN (...)` or `pid = $1`.
- **No `any` in TypeScript**. Use `unknown` and narrow.
- **All new logic must have unit tests**; all new UI flows must have at least one e2e test or explicit visual verification.
- **Match the HEY-inspired visual system** in `app/src/styles/tokens.css`.
- **Follow the existing file layout**: data queries in `app/src/stores/data.ts`, panels in `app/src/panels/`, views in `app/src/views/`, tests next to code or in `app/src/test/`.
- **Mobile breakpoints**: `< 768px` full-screen sheet, `768–1023px` drawer, `>= 1024px` right panel.
- **All tap targets ≥ 44×44px** on touch.

---

## File Map

| File | Responsibility |
|---|---|
| `app/src/stores/data.ts` | Add per-contact queries (`listContactMessages`, `listContactFiles`, `listContactEvents`, `listContactTasks`, `listContactFollowUps`, `listContactClips`). Update any existing helpers. |
| `app/src/panels/ContactPanel.tsx` | Swap to per-contact resources, add Timeline filters, Follow-up markers, Files grid, richer Insights, loading/error states. |
| `app/src/panels/CompanyPanel.tsx` | Swap to company-scoped queries, complete all tabs (People, Communications, Files, Meetings, Insights), loading/error states. |
| `app/src/views/Contacts.tsx` | Verify filters/grouping, ensure company click opens `CompanyPanel`. |
| `app/src/components/ContactEditModal.tsx` | Verify all contact fields editable and save correctly. |
| `app/src/utils/reply-time.ts` | New pure helper for contact/company reply-time statistics. |
| `app/src/stores/data.test.ts` / new `*.test.ts` | Unit tests for per-contact queries and reply-time helper. |
| `app/e2e/contact.spec.ts` | New Playwright spec covering Timeline filter, Files grid, Company People tab. |

---

## Task 1: Per-contact data layer (root cause fix)

**Files:**
- Modify: `app/src/stores/data.ts`
- Create: `app/src/stores/data.test.ts` (extend existing)

**Interfaces:**
- Consumes: `getDb`, `rowToMessage`, `rowToFile`, `rowToEvent`, `rowToTask`, `rowToFollowUp`, `rowToClip`, existing `Message`, `FileItem`, `CalendarEvent`, `Task`, `FollowUp`, `Clip` types.
- Produces:
  - `listContactMessages(contactId: ID): Promise<Message[]>`
  - `listContactFiles(contactId: ID): Promise<FileItem[]>`
  - `listContactEvents(contactId: ID): Promise<CalendarEvent[]>`
  - `listContactTasks(contactId: ID): Promise<Task[]>`
  - `listContactFollowUps(contactId: ID): Promise<FollowUp[]>`
  - `listContactClips(contactId: ID): Promise<Clip[]>`
  - `listCompanyContacts(companyName: string): Promise<Contact[]>`
  - `listCompanyMessages(contactIds: ID[]): Promise<Message[]>`
  - `listCompanyFiles(contactIds: ID[]): Promise<FileItem[]>`
  - `listCompanyEvents(contactIds: ID[]): Promise<CalendarEvent[]>`

- [ ] **Step 1: Write the data tests first.** Add focused tests for the new queries: empty contact returns empty, messages filtered by `pid`, files filtered by `pid`, follow-ups filtered by `msgId` belonging to contact messages, clips by `contactId`, company helpers use `company` column and `IN` lists.
- [ ] **Step 2: Run tests; confirm failures** because functions do not exist yet.
- [ ] **Step 3: Implement the per-contact queries** in `data.ts`. Each function does a targeted `SELECT * FROM <table> WHERE pid = $1` (or `contactId`/`msgId`/`pids` join). For company helpers, first fetch contact ids by company, then query related tables using `IN` placeholders.
- [ ] **Step 4: Run unit tests; confirm all pass.**
- [ ] **Step 5: Commit.**
  ```bash
  git add app/src/stores/data.ts app/src/stores/data.test.ts
  git commit -m "feat(data): add per-contact and per-company targeted queries"
  ```

---

## Task 2: ContactPanel — use targeted resources and fix states

**Files:**
- Modify: `app/src/panels/ContactPanel.tsx`

**Interfaces:**
- Consumes: functions from Task 1.
- Produces: `ContactPanel` renders Timeline/Files/etc. with per-contact data and full empty/loading/error states.

- [ ] **Step 1: Replace whole-table resources.** In `ContactPanel`, change `createResource(listMessages)` → `createResource(() => props.contactId, listContactMessages)`, and similarly for files/events/tasks/follow-ups/clips. Keep notes on its own `listContactNotes(id)`.
- [ ] **Step 2: Add loading skeleton and error state wrappers.** Wrap the tab content area so while any resource is pending it shows `SkeletonList`, and on error it shows `ErrorState` with a retry button that calls all `refetch` functions.
- [ ] **Step 3: Verify the immediate bug is gone.** Run the app or a focused Playwright/e2e check: open a contact from an email and assert Timeline and Files render items. The previous “显示不全” should be fixed because we no longer depend on `listMessages` succeeding for the whole mailbox.
- [ ] **Step 4: Commit.**
  ```bash
  git add app/src/panels/ContactPanel.tsx
  git commit -m "fix(contact-panel): load per-contact data instead of whole tables"
  ```

---

## Task 3: ContactPanel Timeline — prototype parity

**Files:**
- Modify: `app/src/panels/ContactPanel.tsx`
- Create: `app/src/utils/reply-time.ts` (if needed in this task, otherwise create in Task 5)

**Interfaces:**
- Consumes: `listContactMessages`, `upsertFollowUp`, `upsertTask`.
- Produces: `TimelineTab` with `All / From them / To them` filter and clickable follow-up marker.

- [ ] **Step 1: Add a unit test or component test for the filter logic.** Given a list of messages with directions `in`/`out`, the filter should keep only the matching subset.
- [ ] **Step 2: Implement the filter UI.** Add three pill buttons above the Timeline list. State `threadFilter: 'all' | 'from' | 'to'`. Filter memo based on `direction`.
- [ ] **Step 3: Add the Follow-up marker button.** Each Timeline row gets a small button that cycles the source message’s follow-up status through `'' → todo → wait → done`. If no follow-up exists, create one; if it exists, update it. Use `upsertFollowUp`. (Mapping to the prototype `fl` field maps to `FollowUp.status`; introduce intermediate status `'wait'` if not already in type.)
- [ ] **Step 4: Add tests/verification.** Unit test the filter; e2e or manual verify the marker click updates state.
- [ ] **Step 5: Commit.**
  ```bash
  git add app/src/panels/ContactPanel.tsx app/src/utils/reply-time.ts app/src/test/*.test.ts
  git commit -m "feat(contact-panel): timeline filters and follow-up marker"
  ```

---

## Task 4: ContactPanel Files tab — prototype grid

**Files:**
- Modify: `app/src/panels/ContactPanel.tsx`

**Interfaces:**
- Consumes: `listContactFiles`.
- Produces: `FilesTab` renders a grid of file cards with icon, name, size, date.

- [ ] **Step 1: Update `FilesTab` layout.** Replace the current list-of-buttons with a CSS grid (`grid-template-columns: repeat(auto-fill, minmax(160px, 1fr))`). Each card shows a file-type icon, truncated filename, formatted size + type + date.
- [ ] **Step 2: Add empty state.** Use the existing `Empty` component when no files.
- [ ] **Step 3: Add an e2e or visual check.** Seed a contact with a file, open Files tab, assert the card is visible and clickable.
- [ ] **Step 4: Commit.**
  ```bash
  git add app/src/panels/ContactPanel.tsx
  git commit -m "feat(contact-panel): files grid layout"
  ```

---

## Task 5: ContactPanel Insights — PRD parity

**Files:**
- Create: `app/src/utils/reply-time.ts`
- Modify: `app/src/panels/ContactPanel.tsx`
- Create: `app/src/utils/reply-time.test.ts`

**Interfaces:**
- Consumes: `listContactMessages`, `contact`.
- Produces: `InsightsTab` shows total messages, last-30d count, reply-time stats, communication channels, pattern, and health trend.

- [ ] **Step 1: Write the reply-time helper with tests.** Given an array of messages for one contact (with `st` and `direction`), compute average/median reply time in hours. Only consider pairs of `in` followed by `out` from the same contact.
- [ ] **Step 2: Wire the helper into `InsightsTab`.** Add cards for reply time and trend (use the contact’s `ch` field for channels, `pattern` field for pattern).
- [ ] **Step 3: Commit.**
  ```bash
  git add app/src/utils/reply-time.ts app/src/utils/reply-time.test.ts app/src/panels/ContactPanel.tsx
  git commit -m "feat(contact-panel): richer insights with reply-time stats"
  ```

---

## Task 6: CompanyPanel — targeted queries and full tabs

**Files:**
- Modify: `app/src/panels/CompanyPanel.tsx`

**Interfaces:**
- Consumes: `listCompanyContacts`, `listCompanyMessages`, `listCompanyFiles`, `listCompanyEvents`.
- Produces: All five tabs (People, Communications, Files, Meetings, Insights) load quickly and correctly.

- [ ] **Step 1: Replace resources with company-scoped queries.** Use `listCompanyContacts(props.companyName)`; derive `contactIds`; then load messages/files/events via the company helpers.
- [ ] **Step 2: Fill Communications tab.** Show a Timeline-style list of all company messages with direction and subject.
- [ ] **Step 3: Fill Meetings tab.** List company events with color bar, title, date, attendee count.
- [ ] **Step 4: Fill Files tab.** Grid of company files.
- [ ] **Step 5: Fill Insights tab.** Company health score (average of member health), total messages, total files, reply-time across company messages.
- [ ] **Step 6: Add loading/error states.**
- [ ] **Step 7: Commit.**
  ```bash
  git add app/src/panels/CompanyPanel.tsx
  git commit -m "feat(company-panel): targeted queries and complete tabs"
  ```

---

## Task 7: Contacts list + ContactEditModal verification

**Files:**
- Modify: `app/src/views/Contacts.tsx`
- Modify: `app/src/components/ContactEditModal.tsx`

**Interfaces:**
- Consumes: existing `listContacts`, `upsertContact`, `deleteContact`.
- Produces: Filters and grouping work; edit modal covers all PRD fields.

- [ ] **Step 1: Verify filter pills map to `grp`.** The current code filters by `grp` (`active`/`risk`/`cold`) but the labels say “活跃/需跟进/冷淡”. Confirm `healthToGroup` returns those values; add a unit test if missing.
- [ ] **Step 2: Verify ContactEditModal fields.** The PRD specifies avatar/company/title/emails/phones/stage/labels/topics/notes/blocked/notify/firstSeen/screened. Check the modal supports them; add any missing inputs.
- [ ] **Step 3: Add a unit test for `healthToGroup` / save flow if not already present.**
- [ ] **Step 4: Commit.**
  ```bash
  git add app/src/views/Contacts.tsx app/src/components/ContactEditModal.tsx app/src/test/*.test.ts
  git commit -m "fix(contacts): verify filters and edit-modal fields"
  ```

---

## Task 8: End-to-end tests

**Files:**
- Create: `app/e2e/contact.spec.ts`

**Interfaces:**
- Consumes: browser-mode seed helpers from existing e2e setup.
- Produces: Passing Playwright tests for the critical new flows.

- [ ] **Step 1: Seed data via sessionStorage** (follow existing e2e pattern) with one account, one contact, two messages (one in, one out), one file, one event.
- [ ] **Step 2: Test Timeline filter.** Open contact, switch to Timeline, click “To them”, assert only outgoing message visible.
- [ ] **Step 3: Test Files grid.** Open Files tab, assert file card visible, click opens FilePanel.
- [ ] **Step 4: Test Company People tab.** From Contacts list group by company, click company name, assert People tab shows the contact.
- [ ] **Step 5: Run tests and commit.**
  ```bash
  git add app/e2e/contact.spec.ts
  git commit -m "test(e2e): contact timeline, files, and company people"
  ```

---

## Task 9: Verification and final commit

- [ ] **Step 1: Run full unit test suite.** `pnpm test -- --run` must pass.
- [ ] **Step 2: Run typecheck.** `pnpm typecheck` must pass.
- [ ] **Step 3: Run lint on changed files.** `rtk lint src/... --max-warnings=0` must pass for all modified files.
- [ ] **Step 4: Run the new e2e spec.** `pnpm e2e contact.spec.ts` must pass.
- [ ] **Step 5: Update `docs/PROGRESS.md`** with a short note that contact/company comprehensive improvement is complete.
- [ ] **Step 6: Final commit or summary.**
  ```bash
  git add docs/PROGRESS.md
  git commit -m "docs: update progress for contact/company improvements"
  ```

---

## Spec Coverage Check

| Spec / Prototype Requirement | Task |
|---|---|
| Contact Timeline with All/From/To filters | Task 3 |
| Follow-up marker on Timeline | Task 3 |
| Files grid in contact panel | Task 4 |
| Insights: reply time, channels, pattern, health | Task 5 |
| Company view: People, Communications, Files, Meetings, Insights | Task 6 |
| Contacts list filters/grouping | Task 7 |
| Contact edit modal all fields | Task 7 |
| No whole-table loads (performance) | Task 1 + 2 + 6 |
| Empty/loading/error states | Task 2 + 6 |
| Tests | Task 1, 3, 5, 7, 8 |

## Placeholder Scan

No TBD/TODO placeholders in steps above. Every task ends with a testable deliverable and explicit commit command.