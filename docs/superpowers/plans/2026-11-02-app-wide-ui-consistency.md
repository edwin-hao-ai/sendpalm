# App-Wide UI Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all SendPalm views and child surfaces share a readable, predictable visual hierarchy without flattening their distinct workflows.

**Architecture:** Keep SolidJS, vanilla CSS, and the existing token system. Add shared page/section heading primitives and semantic typography/control classes, then migrate views, settings subpages, panels, Agent, and Compose in bounded groups. Domain-specific layouts, status colors, and navigation remain intact.

**Tech Stack:** SolidJS, TypeScript, vanilla CSS variables, current Vitest and Playwright setup. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-02-app-wide-ui-and-mail-date-integrity-design.md` — Shared visual language section.

## Global Constraints

- Page titles are left-aligned H1s; centered compositions are reserved for empty-state content, onboarding, and intentional focal flows.
- Use the existing `tokens.css`; do not introduce a new palette or typography library.
- Body copy is 18px by default and 16px for dense content; metadata is at least 13px; 11px is reserved for decorative micro-badges only.
- Preserve the 767/768/1023/1024 responsive breakpoints and tap targets of at least 44×44px.
- Keep Mail, Calendar, Contacts, Tasks, Library, Agent, Settings, and other surfaces purpose-specific; shared primitives normalize hierarchy, not content layout.
- Keep loading/empty/error/disabled/focus behavior and all existing routes/actions working.
- Do not modify prototype HTML/JS/CSS or email body HTML/Markdown rendering.

## Review Focus

1. Long localized page titles and action buttons at 375px. Test all page headers at mobile width and ensure no clipping/wrapping collision.
2. Views with missing descriptions or actions. Test `PageHeader` with every optional slot absent/present.
3. Nested Settings/panel headings versus page H1. Test semantic hierarchy remains one H1 per top-level view.
4. Dense lists/tables and 11px metadata. Verify important labels are readable while badges remain compact.
5. Light/dark mode and keyboard/touch states. Run visual/responsive checks in both themes and preserve focus-visible/tap-target behavior.

---

### Task 1: Add reusable page and section heading primitives

**Files:**
- Create: `app/src/components/PageHeader.tsx`
- Create: `app/src/components/PageHeader.css`
- Test: `app/src/components/PageHeader.test.tsx`
- Modify: `app/src/styles/tokens.css`
- Modify: `app/src/styles/base.css`

**Interfaces:**
- `PageHeader(props: { title: string; description?: JSX.Element; actions?: JSX.Element; class?: string })` renders one left-aligned H1 with optional description/actions.
- `SectionHeading(props: { title: string; description?: JSX.Element; actions?: JSX.Element; level?: 2 | 3 })` renders semantic section headings using existing h2/h3 tokens.
- Add semantic CSS classes for page title, section title, body, compact body, and metadata; do not change palette tokens.

- [ ] Add render/accessibility tests for H1 semantics, optional description/actions, mobile actions wrap, and class forwarding.
- [ ] Run the focused component test and verify it fails because `PageHeader` is absent.
- [ ] Implement the primitives and token-backed CSS; keep actions keyboard accessible and ≥44px targets.
- [ ] Run focused tests and lint.

### Task 2: Normalize Mail and message-workflow views

**Files:**
- Modify: `app/src/views/Imbox.tsx`
- Modify: `app/src/views/Gate.tsx`
- Modify: `app/src/views/Stream.tsx`
- Modify: `app/src/views/Records.tsx`
- Modify: `app/src/views/Spam.tsx`
- Modify: `app/src/views/Trash.tsx`
- Modify: `app/src/views/Drafts.tsx`
- Modify: `app/src/views/FocusReply.tsx`
- Modify: `app/src/views/ReadTogether.tsx`
- Modify: `app/src/views/PileBoard.tsx`
- Test: create `app/src/views/page-headers.test.ts`; extend `app/src/views/Imbox.test.ts`; E2E `app/e2e/views.spec.ts`

- [ ] Add/update structural tests requiring the shared page header and one H1 per top-level view, excluding deliberate onboarding/empty-state focal titles.
- [ ] Run focused view tests and confirm inconsistent h1/h2/centered title cases are identified.
- [ ] Migrate Mail/Records/Gate/Drafts/FocusReply/ReadTogether/PileBoard headers; preserve all actions, tab controls, and navigation behavior.
- [ ] Apply semantic typography classes to list labels, dates, counts, and empty/error copy; reserve micro size for badges.
- [ ] Run the focused view tests and Playwright at desktop/mobile widths.

### Task 3: Normalize workspace views and nested Settings pages

**Files:**
- Modify: `app/src/views/Contacts.tsx`
- Modify: `app/src/views/Companies.tsx`
- Modify: `app/src/views/Calendar.tsx`
- Modify: `app/src/views/Files.tsx`
- Modify: `app/src/views/Tasks.tsx`
- Modify: `app/src/views/FollowUps.tsx`
- Modify: `app/src/views/Clips.tsx`
- Modify: `app/src/views/Insights.tsx`
- Modify: `app/src/views/Search.tsx`
- Modify: `app/src/views/Settings.tsx`
- Test: create/extend `app/src/views/page-headers.test.ts`; existing `app/src/views/Contacts.test.ts`, `Calendar.test.ts`, `Files.test.ts`, `Tasks.test.tsx`, `Settings.test.ts`; E2E `app/e2e/views.spec.ts`

- [ ] Add/update tests for left-aligned H1, nested H2/H3 hierarchy, action alignment, and loading/empty/error state title consistency.
- [ ] Run focused tests and confirm old h2/h3 page-title cases fail the hierarchy assertion.
- [ ] Migrate workspace views and Settings subpages to shared primitives while retaining each view's max width, density, and functional layout.
- [ ] Fix any important list/form copy using micro text; do not enlarge decorative counts or dense calendar labels indiscriminately.
- [ ] Run focused tests and Playwright at desktop/tablet/mobile widths.

### Task 4: Normalize shared panels, Agent, Compose, and overlays

**Files:**
- Modify: `app/src/components/AgentPanel.tsx`
- Modify: `app/src/components/DetailPanel.tsx`
- Modify: `app/src/components/Topbar.tsx`
- Modify: `app/src/components/Modal.tsx`
- Modify: `app/src/components/ConfirmDialog.tsx`
- Modify: `app/src/components/FilterPanel.tsx`
- Modify: `app/src/panels/MessagePanel.tsx`
- Modify: `app/src/panels/ContactPanel.tsx`
- Modify: `app/src/panels/CompanyPanel.tsx`
- Modify: `app/src/panels/TaskPanel.tsx`
- Modify: `app/src/panels/MeetingPanel.tsx`
- Modify: `app/src/panels/FilePanel.tsx`
- Modify: `app/src/panels/DraftPanel.tsx`
- Modify: `app/src/compose/Compose.tsx`
- Test: create `app/src/components/layout-primitives.test.tsx`; extend `app/src/panels/MessagePanel.test.ts`, `ContactPanel.test.ts`, `app/src/compose/Compose.test.ts`; E2E `app/e2e/workflows.spec.ts`

- [ ] Add tests for shared panel title hierarchy, action alignment, modal heading contrast, focus ring, and disabled states.
- [ ] Run focused tests and identify styling differences before changes.
- [ ] Normalize panel/overlay typography and control dimensions without changing actions, message body rendering, or layout ownership.
- [ ] Verify keyboard navigation, reduced motion, dark mode, and 44px mobile targets.
- [ ] Run focused tests and responsive workflows E2E.

### Task 5: Full visual consistency gate

**Files:**
- Modify: `app/e2e/views.spec.ts`
- Modify: `app/e2e/workflows.spec.ts`
- Modify: `docs/PROGRESS.md`

- [ ] Add route-coverage assertions for shared top-level title and typographic minimums, with explicit exceptions for empty-state and onboarding composition.
- [ ] Capture/review screenshots for every main view at 375px, 820px, and 1440px, plus light and dark theme.
- [ ] Run full Vitest, typecheck, lint, build, and supported Playwright tests.
- [ ] Run `git diff --check`; verify internal view IDs, behavior, and the prototype remain unchanged.
- [ ] Update progress with audited surfaces, fixes, tests, and any intentional exceptions.
