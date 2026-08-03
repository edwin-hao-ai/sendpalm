# SendPalm Build Progress

> Source: prototype-v11.38 (v11.38) — every feature reimplemented as Tauri 2 + SolidJS.

## Milestones

| # | Milestone | Status | Notes |
|---|---|---|---|
| **M0** | Foundation | ✅ Done | Tauri 2.10 scaffold, SolidJS + TS strict, HEY tokens, SQLite schema, IPC, demo data, keyboard shortcuts |
| **M1** | Core boxes (Imbox/Gate/Stream/Records/Trash/Spam) | ✅ Done | All 6 views functional, bundles + piles, j/k nav |
| **M2** | Detail panels + Compose | ✅ Done | ContactPanel 6 tabs, MessagePanel w/ stickies+follow-ups+clips, MeetingPanel w/ agenda+actions, FilePanel w/ type-specific viewer, TaskPanel + DraftPanel w/ CRUD, Compose modal w/ autosave + split-button send |
| **M3** | Communication pillars | ✅ Done | Drafts view, FollowUps view, Clips view, Remind picker, FollowUp picker, periodic re-surfacing loop, Imbox pile modals |
| **M4** | Power features | ✅ Done | ⌘K palette (Fuse fuzzy), Live search, Global search page, Notifications panel, ⌘N compose, Shortcut help, three states, Spy pixel blocker |
| **M5** | Catalog views | ✅ Done | Contacts (CRUD + filter pills + group-by-company), Companies (group sections), Calendar (day/week/year + create modal), Files (grid + type filters), Insights (8 cards) |
| **M6** | Agent panel | ✅ Done | Sessions / Tasks / Drafts / Memory / Audit tabs, chat input → audit + task creation, approve/edit drafts |
| **M7** | Settings + Onboarding | ✅ Done | 7 tabs (Profile/Accounts/Preferences/Agent/Labels/Data/Shortcuts) with live save to tauri-plugin-store, replay onboarding button, 4-step onboarding wizard |
| **M8** | Mobile + Tablet responsive | ✅ Done | 3-tier CSS breakpoints (mobile <768 / tablet 768-1023 / desktop ≥1024), bottom-tab bar on mobile, full-screen modals on mobile, gesture helpers (useSwipe, useLongPress) |
| **M9** | Polish + Accessibility | ✅ Done | Full keyboard shortcut system (PRD §3.17), ?-help modal, focus rings, semantic role attributes, keyboard nav (j/k/Enter/x in Imbox) |
| **M10** | Real backend integration (IMAP / SMTP / vault / sync) | ✅ Done | `async-imap` + `lettre` + `keyring`, 10 provider registry, IMAP IDLE loop, real-time frontend event bridge, OS Keychain credential vault, 21 Rust integration tests (real Feishu), 17 Playwright E2E |

## Definition-of-Done status

- [x] Code compiles, tests pass, lint clean (TypeScript strict mode, `cargo check` clean)
- [x] Visual diff vs. prototype matches (HEY warm paper + palm-green palette)
- [x] Mobile (iPhone SE viewport) and tablet (iPad mini viewport) breakpoints in CSS + E2E
- [x] No new TODOs without justification
- [x] Conventional commit messages
- [x] PROGRESS.md updated

## Verified UI surfaces (screenshots in `docs/screenshots/`)

- Imbox: bundles for explicit senders + auto-detected
- Agent panel: 5-tab layout, sessions list, active task card
- Compose modal: From/To/Subject/Body, snippet picker, send split-button
- Detail panels: ContactPanel 6 tabs, MessagePanel w/ tracker shield + actions

## How to run

```bash
cd app
pnpm install
pnpm tauri dev
```

Tests:

```bash
# Frontend unit tests (Vitest)
cd app && pnpm test

# Playwright E2E (browser-mode UI verification)
cd app && pnpm e2e

# Rust integration tests against real IMAP/SMTP (requires .env credentials)
cd app/src-tauri && SENDPALM_E2E_NETWORK=1 cargo test --tests
```

Bundle:

```bash
pnpm tauri build
```