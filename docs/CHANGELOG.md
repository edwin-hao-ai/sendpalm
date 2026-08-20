# SendPalm Changelog

All notable changes to SendPalm are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Marketing site** at `marketing/index.html`. Single-page, no build, matches the app's design system. 6 section types, real iOS + Mac screenshots, no div-based fake UI.
- **`docs/POSITIONING.md`** — the v3 positioning as a HEY-workflow client for any IMAP service. Replaces the older "HEY replacement" framing.
- **`docs/OAUTH-DECISION.md`** — v3 ships IMAP + app-password only. No OAuth. Covers >= 90% of personal email users via the 10-provider registry. Defer OAuth to v4+ when (and if) the user base asks.
- **`docs/SOAK-CHECKLIST.md`** — 11 sections (A-K) of pre-release manual test cases. Run before declaring the app "daily driver ready".
- **`docs/PRIVACY-POLICY.md`** — formal privacy policy. We do not collect any data. There is no SendPalm server.
- **`CONTRIBUTING.md`** — what is in scope, what is not, the PR process.
- **`LICENSE`** — MIT.
- **Save-to-disk for attachments.** `utils/save-attachment.ts` uses the OS save dialog (`tauri-plugin-dialog::save`) + `tauri-plugin-fs::writeFile` so the user picks where attachments go. 5 vitest cases. `FilePanel` and `MessagePanel` both updated.

### Changed

- **Onboarding copy reworked** to lead with "连接你的邮箱" (was "接入真实邮箱") and surface the 10-service list and the Sent-folder sync as first-class features.
- **ESLint is now clean** for the first time. 4 long-standing e2e errors fixed: `BrowserContext` unused, `ScrollBehavior` undef, `sidebarWidth` unused, e2e config missing DOM lib.

### Fixed

- `https://github.com/yourorg/sendpalm/releases` placeholder in the marketing site footer (replace with real release URL before distribution).

## [0.1.0] - 2026-08-19

### Added

- **M0 - M12 milestone set**, all delivered:
  - M0 Foundation: Tauri 2.10 + SolidJS + strict TS + HEY tokens + SQLite schema
  - M1 Core boxes: Imbox / Gate / Stream / Records / Trash / Spam
  - M2 Detail panels: Contact / Message / Meeting / File / Task / Draft
  - M3 Communication pillars: Drafts / FollowUps / Clips / Sticky / Snippets / piles
  - M4 Power features: ⌘K palette / live search / notifications / shortcuts / three states
  - M5 Catalog: Contacts / Companies / Calendar / Files / Insights
  - M6 Agent: sessions / tasks / drafts / memory / audit
  - M7 Settings + Onboarding: 7 tabs + 4-step wizard
  - M8 Mobile / iPad responsive: 3-tier breakpoints + bottom-tab + gestures
  - M9 Polish + Accessibility: shortcuts, focus rings, keyboard nav
  - M10 Real backend: IMAP / SMTP / vault / sync loop / iCal
  - M11 Brand + splash + iOS verification
  - M12 Calendar RRULE + VTIMEZONE + Agent LLM
- 263 vitest cases.
- 132 Rust unit + integration tests (including per-provider invariants + iCal parser).
- 60 Playwright e2e cases covering all 22 views + workflows.
- 20 numbered SQL migrations.
- 13 native Tauri commands (other CRUD goes through `tauri-plugin-sql`).
- 22 views, 7 Settings tabs, 6 detail panels, 7 components primitives.
- iPhone 17 + iPad simulator screenshots in `docs/ios-screenshots/`.

[Unreleased]: https://github.com/yourorg/sendpalm/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/yourorg/sendpalm/releases/tag/v0.1.0
