# Sidebar Workspace Groups Design

## Intent

Reduce the crowded 15-entry sidebar to six recognizable workspaces while keeping every existing view and its behavior intact. This is a navigation-only change: existing view components, mail rendering, Markdown/HTML support, detail panels, data stores, and IPC remain unchanged.

## Goals

- Group existing views into Mail, Calendar, Contacts, Tasks, Library, and More.
- Keep every existing `ViewName`, `NAV_SECTIONS` entry, keyboard shortcut, tooltip label, and `data-nav-view` route available.
- Keep the existing visual language and 64px navigation rail; do not add a permanent second sidebar or modify the main app shell.
- Keep the mobile bottom navigation within six tap targets and present secondary routes in a grouped More sheet.
- Show the existing Gate candidate badge on the Mail group and on Gate itself when its menu is open.

## Group Mapping

| Workspace | Default view | Existing views |
|---|---|---|
| Mail | Inbox (`imbox` route) | Gate, Inbox, Stream, Drafts, Spam, Trash |
| Calendar | Calendar | Calendar |
| Contacts | Contacts | Contacts, Companies |
| Tasks | Follow-ups | Follow-ups |
| Library | Files | Files, Records, Clips |
| More | Insights | Insights, Settings |

Tasks maps to the existing Follow-ups view for this navigation change. No new task model, extraction pipeline, or task screen is introduced here.

## Approaches

1. **Group flyouts in the existing rail — selected.** Keep one-click access to each workspace's default view; a small disclosure control opens its secondary views. The mobile More sheet lists secondary views under the same group headings.
2. **Add a persistent second navigation pane.** Rejected because it changes the current shell, consumes content width, and risks disturbing established view layouts.
3. **Hide or delete low-frequency views.** Rejected because all existing functions must remain reachable.

## Constraints and Non-Goals

- `NAV_SECTIONS` remains the canonical flat route list; group metadata is additive.
- Do not modify `Main.tsx`, existing view/panel renderers, `DetailPanel`, MessagePanel, markdown/HTML rendering, or app data behavior.
- Do not claim the regrouping itself improves startup performance.
- Existing E2E routes must continue to work through the group menu, including Gate, Stream, Records, Drafts, Clips, and Settings.

## Verification

- Unit tests prove each existing route is assigned to exactly one group and each group's default route is one of its children.
- E2E tests prove group navigation, secondary route reachability, Gate badge behavior, and mobile More-sheet behavior.
- Run frontend unit tests, typecheck, lint, and the focused Playwright navigation suite.
