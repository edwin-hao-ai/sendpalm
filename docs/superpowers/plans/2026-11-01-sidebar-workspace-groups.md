# Sidebar Workspace Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Group existing SendPalm sidebar destinations into six workspaces without changing any view or email/detail behavior.

**Architecture:** Keep `NAV_SECTIONS` and every route ID intact. Add a separate group map, render six workspace entries in the existing `Sidebar`, and use a small desktop group menu plus the existing mobile sheet pattern to reach secondary views. Existing view components and the Tauri shell are out of scope.

**Tech Stack:** SolidJS, TypeScript, Vitest, Playwright; no new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-01-sidebar-workspace-groups-design.md`

## Global Constraints

- Do not change existing view IDs, `NAV_SECTIONS`, shortcut destinations, page renderers, data stores, IPC, or the 64px rail shell.
- Do not change existing Mail, Markdown/HTML email rendering, detail panels, or mobile touch-target sizing.
- All 15 current sidebar views remain reachable through the group UI.
- The active group reflects the current child view; the active child is identified in the group menu.
- No new task model or task extraction behavior in this navigation-only change.

## Review Focus

- **Hidden secondary routes:** every `NAV_SECTIONS` view must still be reachable through a group menu and retain its `data-nav-view` value.
- **Shortcut stability:** keyboard shortcuts and Topbar labels must continue to resolve the same view IDs.
- **Gate badge:** the badge remains visible on the Mail group, and the Gate child retains its own badge when expanded.
- **Mobile reachability:** primary group tabs remain at least 44×44px; More-sheet routes remain grouped and dismissible by Escape/swipe.
- **Current-view state:** entering a child route highlights the correct workspace and child rather than reverting to the group's default.

---

### Task 1: Add navigation group metadata

**Files:**
- Modify: `app/src/utils/labels.ts`
- Test: `app/src/components/Sidebar.test.ts`

**Interfaces:**
- Produces: `NavGroup` and `NAV_GROUPS`, containing `id`, `label`, `icon`, `defaultView`, and ordered `views`.
- Keeps: existing `NavSection` and `NAV_SECTIONS` unchanged.

- [x] Add tests asserting the six group IDs/defaults from the design spec, every existing `NAV_SECTIONS.view` occurs exactly once, and every default is a child.
- [x] Run `cd app && pnpm test -- src/components/Sidebar.test.ts` and confirm the new tests fail because `NAV_GROUPS` is not defined.
- [x] Add `NavGroup` and `NAV_GROUPS` to `app/src/utils/labels.ts` with the approved mapping.
- [x] Re-run the focused test and confirm it passes.

### Task 2: Group the desktop rail without changing the shell

**Files:**
- Modify: `app/src/components/Sidebar.tsx`
- Test: `app/src/components/Sidebar.test.ts`

**Interfaces:**
- Consumes: `NAV_GROUPS`, `NAV_SECTIONS`, existing `setView`, `view`, and Gate count.
- Produces: six group buttons; default route navigation; a small disclosure menu listing the group's existing child routes.

- [x] Add component-level tests for default-route navigation, opening/selecting a secondary route, active-child state, and Escape/outside dismissal.
- [x] Run the focused Sidebar tests and verify these new cases fail before the component change.
- [x] Render group buttons using the current `NavItem` visual treatment. Keep parent click mapped to its existing default route; the disclosure button opens the child menu.
- [x] Keep child entries' `data-nav`, `data-nav-view`, labels, tooltips, and view IDs sourced from `NAV_SECTIONS`.
- [x] Derive active group from `view()` membership; preserve the Gate badge on the Mail group and Gate child.
- [x] Run the focused Sidebar tests and confirm all new and existing cases pass.

### Task 3: Group mobile destinations and preserve route coverage

**Files:**
- Modify: `app/src/components/Sidebar.tsx`
- Modify: `app/e2e/views.spec.ts`
- Modify as needed: `app/e2e/perf-views.spec.ts`, `app/e2e/perf-2-pass.spec.ts`, `app/e2e/ui-audit-shots.spec.ts`, `app/e2e/workflows.spec.ts`, `app/e2e/contact.spec.ts`

**Interfaces:**
- Consumes: `NAV_GROUPS` and flat `NAV_SECTIONS`.
- Produces: six mobile workspace tabs; a More sheet organized by group; a test helper that navigates to an existing view through its group.

- [x] Add/update E2E assertions for six primary group tabs, grouped secondary routes in More, all 15 existing destinations reachable, and unchanged active-view behavior.
- [x] Verify the focused Playwright navigation tests fail against the old 15-item desktop sidebar/group-less More sheet.
- [x] Update the mobile primary destinations to the six approved workspace defaults and render secondary routes in grouped More-sheet sections.
- [x] Update route-navigation test helpers to open a group menu when a test targets a secondary route; do not weaken view assertions.
- [x] Run focused E2E tests at desktop and mobile widths; confirm Gate, Stream, Records, Drafts, Clips, and Settings remain navigable.

### Task 4: Full regression gates

**Files:**
- No production files beyond Tasks 1–3.

- [x] Run `cd app && pnpm test`.
- [x] Run `cd app && pnpm typecheck`.
- [x] Run `cd app && pnpm lint`.
- [x] Run `cd app && pnpm e2e` or the full supported navigation/view suite if the desktop Tauri prerequisites are unavailable; report any skips explicitly.
- [x] Visually verify the unchanged Mail, Calendar, Contacts, and Follow-ups pages at desktop and mobile sizes; confirm the Mail detail/Markdown/HTML path was not changed.
