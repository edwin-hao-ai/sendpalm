# Relay → SendPalm Architecture (current prototype state)

> **Note:** The early "Relay" docs (`DESIGN.md`, original `ARCH.md`) described an early dark-mode / Tauri / on-device-LLM direction that has been **superseded by SendPalm**, a HEY-inspired, in-memory, vanilla-JS prototype. This file is the current source of truth.

---

## 1. Stack

- **Frontend:** Vanilla JS + CSS + HTML (no build step).
- **Data:** `D.*` — in-memory object graph in `prototype-data.js`.
- **Persistence:** `localStorage` only for `sendpalm-onboarding` and `sendpalm-notif-last-seen`.
- **Cache:** Service Worker (`sw.js`) precaches the prototype shell.
- **No backend** at this phase.

---

## 2. File layout

```
prototype-v11.html          ← shell (cache-busts css/js)
css/prototype-v11.css       ← all styles
js/prototype-v11.js         ← all app code (single IIFE in module pattern)
prototype-data.js           ← D.* seed data
sw.js                       ← service worker cache
manifest.json               ← PWA manifest
docs/superpowers/plans/     ← implementation plans (P1, P2, P3, P4, …)
.superpowers/sdd/           ← task briefs, reports, progress (local-only)
qa-tmp/                     ← verification scripts + screenshots (local-only)
```

---

## 3. Module boundaries (within the single `prototype-v11.js`)

```
const D = {}                 ← shared data
const state = {}             ← UI state
const navSections = [...]    ← sidebar config

// Renderers
renderImbox / renderStream / renderGate / renderPaperTrail / renderBucket / renderPeople
renderCompanyView / renderCalendar / renderFiles / renderInsightsView / renderSearchView
renderSettings (with sub-renderers per tab) / renderDrafts / renderFollowUpsView / openClipsView

// Modals
openModalCard (shared shell)
openContactModal / openEventModal / openTaskModal / openDraftModal
openEmailAccountSettings / openSnippetPicker / openSnippetsManager / openSnippetEditModal
openFollowUpPicker / openRemindDatePicker / openStickyModal / openScheduleSend
openLabelModal / openAddAccountModal / openScreenerHistory

// Detail panels
openDetailPanel / closePanel
renderContactPanel / renderMessagePanel / renderMeetingPanel / renderFilePanel / renderDraftPanel

// Helpers
el / elAttr / icon / renderEmpty / renderSkeletonList / renderErrorState
renderFormGroup / renderToggle / renderPillInput / renderAvatar / renderSectionHeader
openContextMenuFromElement / openContextMenu
showToast / copyToClipboard / confirmDestructive
elAttr / openModalCard / closeCompose / minimizeCompose / expandCompose

// Workflow
replyLaterMessage / setAsideMessage / bubbleUpMessage / openRemindDatePicker
clearWorkflowFlags / restoreMessageState / openFollowUpPicker / setFollowUp

// Agent
buildAgentContext / getCurrentAgentSession / createAgentSession / showAgentSessionDropdown

// Search
searchContacts / searchMessages / searchFiles / searchMeetings
buildLiveSearchResults (topbar dropdown) / searchPalette (⌘K)

// Keyboard
shortcutSingleMatches / shortcutSequenceMatches / shortcutKeyList / displayKeyName
```

---

## 4. Data flow

`D.*` is mutated in place; `state.*` is mutated in place; `renderMain()` is the single function that re-renders `#main`. `renderNav()` and `renderTopBar()` re-render their respective regions when needed.

For modal/dialog flows we use `openModalCard({ title, renderBody, renderActions })` which mounts into `#compose-modal` (also used for non-compose modals). The detail panel uses `openDetailPanel(content)` → mounts into `#detail-panel`.

---

## 5. Cross-cutting patterns

- **Three-state helpers:** `renderEmpty()`, `renderSkeletonList()`, `renderErrorState()`. Applied to every primary view.
- **Draft autosave:** timer-driven "Saving… / Draft saved" status in compose footer.
- **Undo toast:** `showToast(msg, { undo: () => restore(m, prev) })` for destructive message actions.
- **Live search:** debounced (200 ms) topbar dropdown with arrow-key navigation.
- **⌘K palette:** reusable palette shell + `buildLiveSearchResults`-style indexer that runs on every keystroke.
- **Settings state mirroring:** `state.settings` is seeded from `D.appSettings` so toggles persist between renders without re-rendering.

---

## 6. Out of scope (this phase)

Backend, persistence, real OAuth, real LLM, real-time sync, audit logs, encryption, billing. See PRD §9 for the full production list.