# SendPalm — Engineering Rules (AGENTS.md)

> This file is the source of truth for how every agent (human or AI) must build SendPalm.
> prototype-v11.38 (v11.38) is the spec. We are reimplementing it from scratch as a Tauri 2 desktop + iOS + iPadOS client, **feature-for-feature**.

---

## 1. Mission

Build **SendPalm** — a calm, HEY-inspired email + calendar + IM + Agent workspace. Targets:

1. **Desktop** — macOS (priority), Windows, Linux via Tauri 2.
2. **iPhone** — native iOS via Tauri 2 mobile.
3. **iPad** — native iPadOS via Tauri 2 mobile (portrait + landscape).
4. **Linux server** (later) — Tauri 2.

The deliverable must implement **every function** listed in `docs/PRD-v1.md` (the re-authored PRD for this build) — no drop-outs, no "TBD", no "we'll get to that later".

---

## 2. The Spec — prototype-v11.38

| Source | Meaning |
|---|---|
| `prototype-v11.html` | App shell, viewport, mount points. |
| `js/prototype-v11.js` | Behavior, renderers, state machine, interactions. |
| `css/prototype-v11.css` | Visual system, responsive rules, animations. |
| `prototype-data.js` | Canonical `D.*` data model — shapes are contract. |
| `docs/superpowers/plans/2026-07-30-p4-hey-power-features-plan.md` | P4 feature spec (already implemented in v11). |
| `docs/superpowers/plans/2026-07-29-responsive-mobile-ipad-redesign.md` | Mobile/iPad responsive spec. |
| `PRD.md`, `FEATURES.md`, `ARCH.md`, `HEY-DESIGN.md`, `DESIGN.md` | Verbal contract. |

**Rule**: when in doubt about any interaction or visual, the prototype is the truth. If the prototype is missing it (e.g. true IMAP sync), it is **out of scope for this build**.

---

## 3. Engineering Rules

### 3.1 Web-search-first

Before implementing any **non-trivial** dependency (framework feature, library, API), run a web search for the current best practice.

- Search targets: official docs, GitHub, current year blog posts.
- Capture the result in a comment or commit body if it affects a design choice.
- Example: don't pick `react-window` without checking `@tanstack/virtual` or `virtua` for current state of the art.

### 3.2 No technical debt

- **No "we'll fix it later"** markers. If it's wrong now, fix it now.
- **No dead code**. Anything not on a hot path gets deleted before commit.
- **No magic strings**. Constants in a single source.
- **No ad-hoc styling**. Every visual decision flows from the token system in `app/src/styles/tokens.css`.
- **No copy-pasted components**. If you wrote the same JSX twice, extract.
- **No `any` in TypeScript**. Use `unknown` and narrow.

### 3.3 DRY by default

- Repeated render logic → a single component with props.
- Repeated state shape → a typed model in `app/src/types/`.
- Repeated style → a CSS class or utility.
- Repeated string literal → a constant.

### 3.4 Tests are mandatory for logic, optional for pure UI

- **Pure UI renderers** (markup only) — visual verification only.
- **Anything with branching logic, reducers, sort, filter, search** — unit test required.
- **Anything crossing IPC** (Rust ↔ JS) — integration test required.
- Tests live next to code: `foo.ts` → `foo.test.ts`.

### 3.5 Commit discipline

- One logical change per commit.
- Conventional commit prefix: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`.
- Never commit secrets, `.env`, build artifacts, screenshots, `node_modules`, `target`.

### 3.6 Self-review before commit

For every PR / commit, run the mental checklist:

1. Does this duplicate something already written?
2. Is the smallest possible change?
3. Did I introduce a new dependency without web-searching it?
4. Did I add a TODO / FIXME? If yes, justify it in the commit body.
5. Are tests added where logic exists?
6. Does this match the prototype?

### 3.7 PR-ready cadence

- After each milestone subtask, commit.
- After each milestone, summarize in `docs/PROGRESS.md` and tag.
- After each milestone, run the verification matrix and paste results.

---

## 4. Stack — chosen, documented

> **Why this stack?** See `docs/STACK-DECISION.md` for the web-search record.

| Layer | Choice | Rationale |
|---|---|---|
| Shell | **Tauri 2.x** | Small binary, native window, official iOS support, Rust core. |
| Frontend framework | **SolidJS** | Fine-grained reactivity, no virtual DOM, perfect for HEY-density views. Smaller payload than React. |
| Bundler | **Vite** | First-class Tauri 2 + SolidJS support. |
| Language (FE) | **TypeScript (strict)** | Type safety on the data model that mirrors `D.*`. |
| Styling | **Vanilla CSS + CSS variables (tokens)** | Matches HEY-DESIGN.md token system; no Tailwind to fight with. |
| Icons | **Phosphor Icons** | Matches the prototype. |
| State | **SolidJS stores** | Built-in, no Redux/Zustand needed. |
| Routing | **None** (single-page shell with view state) | Matches prototype architecture. |
| Local persistence | **SQLite via `rusqlite`** + **Tauri Store plugin** for tiny KV | Tauri-native, no external services. |
| Rust ORM | **`sqlx` (compile-time checked queries)** | Rust-native, no DSL. |
| Rust async | **`tokio`** | Standard. |
| Auth (future) | **`oauth2` crate + `reqwest`** | Standard. |
| IMAP (future) | **`imap` crate** | Standard. |
| SMTP (future) | **`lettre`** | Standard. |
| LLM (future) | **OpenAI-compatible HTTP via `reqwest`** | Vendor-agnostic. |
| Test (FE) | **Vitest + @solidjs/testing-library** | First-class Vite + SolidJS. |
| Test (Rust) | **`cargo test`** + **`tauri::test`** | Standard. |
| Lint | **ESLint + Prettier** + **`clippy`** | Standard. |
| Format | **Prettier (FE) + `rustfmt` (Rust)** | Standard. |

---

## 5. Architecture — `app/`

```
app/
├── package.json                  # FE deps + scripts
├── vite.config.ts                # Vite + SolidJS
├── tsconfig.json                 # Strict TS
├── index.html                    # App shell (mirror of prototype-v11.html)
├── src/                          # SolidJS frontend
│   ├── main.tsx                  # Mount SolidJS
│   ├── App.tsx                   # Top-level layout (titlebar / sidebar / topbar / main / detail / agent)
│   ├── styles/
│   │   ├── tokens.css            # CSS variables — HEY design tokens
│   │   ├── base.css              # Reset + base typography
│   │   └── animations.css        # Reusable keyframes
│   ├── components/               # Shared primitives
│   │   ├── Avatar.tsx
│   │   ├── Button.tsx
│   │   ├── Modal.tsx
│   │   ├── Drawer.tsx
│   │   ├── Toast.tsx
│   │   ├── Icon.tsx
│   │   ├── Empty.tsx
│   │   ├── Skeleton.tsx
│   │   ├── ErrorState.tsx
│   │   └── ...
│   ├── views/                    # One file per major view
│   │   ├── Imbox.tsx
│   │   ├── Gate.tsx
│   │   ├── Stream.tsx
│   │   ├── Records.tsx
│   │   ├── Trash.tsx
│   │   ├── Spam.tsx
│   │   ├── Contacts.tsx
│   │   ├── Companies.tsx
│   │   ├── Calendar.tsx
│   │   ├── Files.tsx
│   │   ├── Insights.tsx
│   │   ├── Drafts.tsx
│   │   ├── FollowUps.tsx
│   │   ├── Clips.tsx
│   │   ├── Search.tsx
│   │   ├── Settings.tsx
│   │   └── Onboarding.tsx
│   ├── panels/                   # Right-side detail panels
│   │   ├── ContactPanel.tsx
│   │   ├── MessagePanel.tsx
│   │   ├── MeetingPanel.tsx
│   │   ├── FilePanel.tsx
│   │   ├── TaskPanel.tsx
│   │   └── DraftPanel.tsx
│   ├── compose/                  # Compose modal & helpers
│   │   ├── Compose.tsx
│   │   ├── SnippetPicker.tsx
│   │   ├── SchedulePicker.tsx
│   │   └── ...
│   ├── agent/                    # Agent subsystem
│   │   ├── AgentPanel.tsx
│   │   ├── AgentSession.tsx
│   │   ├── AgentTask.tsx
│   │   ├── AgentDraft.tsx
│   │   ├── AgentMemory.tsx
│   │   └── AgentAudit.tsx
│   ├── search/                   # ⌘K palette + live search
│   │   ├── CommandPalette.tsx
│   │   └── LiveSearch.tsx
│   ├── notifications/            # Topbar bell + dropdown
│   ├── stores/                   # SolidJS stores (the single source of truth at runtime)
│   │   ├── data.ts               # Wraps Tauri commands
│   │   ├── ui.ts                 # view / panel / modal state
│   │   └── agent.ts
│   ├── ipc/                      # Tauri command bindings (typed)
│   │   └── commands.ts
│   ├── types/                    # TypeScript types — mirror D.*
│   │   ├── contact.ts
│   │   ├── message.ts
│   │   ├── event.ts
│   │   ├── task.ts
│   │   ├── file.ts
│   │   ├── draft.ts
│   │   ├── account.ts
│   │   ├── snippet.ts
│   │   ├── sticky.ts
│   │   ├── clip.ts
│   │   ├── followUp.ts
│   │   ├── notification.ts
│   │   ├── label.ts
│   │   ├── shortcut.ts
│   │   ├── agent.ts
│   │   └── index.ts
│   ├── utils/                    # Pure helpers
│   │   ├── date.ts
│   │   ├── fuzzy.ts
│   │   ├── trackers.ts
│   │   ├── color.ts
│   │   └── shortcuts.ts
│   └── seed/                     # Demo data (mirrors prototype-data.js)
│       └── demo.ts
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── src/
│   │   ├── main.rs               # Tauri builder + plugin registration
│   │   ├── lib.rs                # Public Rust API
│   │   ├── db/
│   │   │   ├── mod.rs            # rusqlite + sqlx pool
│   │   │   ├── migrations.rs     # SQL migrations on startup
│   │   │   └── schema.sql        # SQLite schema
│   │   ├── commands/             # #[tauri::command] handlers
│   │   │   ├── contact.rs
│   │   │   ├── message.rs
│   │   │   ├── event.rs
│   │   │   ├── task.rs
│   │   │   ├── draft.rs
│   │   │   ├── account.rs
│   │   │   ├── snippet.rs
│   │   │   ├── follow_up.rs
│   │   │   ├── sticky.rs
│   │   │   ├── clip.rs
│   │   │   ├── notification.rs
│   │   │   ├── label.rs
│   │   │   ├── shortcut.rs
│   │   │   └── agent.rs
│   │   └── services/
│   │       ├── search.rs
│   │       ├── tracker.rs
│   │       └── reminder.rs       # 60s tick to re-surface bubbled messages
│   └── icons/
└── docs/
    ├── PRD-v1.md                 # This build's PRD (rewritten)
    ├── STACK-DECISION.md         # Web-search record for stack choices
    └── PROGRESS.md               # Milestone tracker
```

---

## 6. Mobile / iPad rules

- Three breakpoints: **mobile `< 768px`**, **tablet `768–1023px`**, **desktop `>= 1024px`**.
- iPad portrait → tablet layout.
- iPad landscape → desktop layout.
- Use `100dvh` for full-height containers.
- All tap targets ≥ `44×44px` on touch.
- Bottom tab bar on mobile, left rail on tablet/desktop.
- Detail panel: overlay drawer on tablet/desktop, full-screen sheet on mobile.
- Compose: full-screen on mobile, modal on tablet/desktop.

---

## 7. Self-improvement loop

After every milestone:

1. Re-read the prototype for the milestone's surface — diff what's missing.
2. Run web search for any new tech that came up.
3. Re-evaluate the file layout — if a file does not belong in its folder, move it.
4. Commit a `docs/PROGRESS.md` update with a screenshot or a video link.
5. Tag the milestone.

When **everything** in PRD-v1.md is implemented and the user signs off, the goal is met.

---

## 8. Anti-goals (what NOT to do)

- ❌ Don't pick up legacy prototype HTML/JS — it's reference only, not source.
- ❌ Don't introduce a backend in this phase — local-first, SQLite only.
- ❌ Don't add a CSS framework (Tailwind, UnoCSS) — the token system is enough.
- ❌ Don't add a state library beyond SolidJS stores.
- ❌ Don't add a router — single-page shell with view state.
- ❌ Don't accept half-finished views. Every view needs empty / loading / error states.

---

## 9. Definition of Done (per subtask)

- [ ] Code compiles, tests pass, lint clean.
- [ ] Visual diff vs. prototype attached (screenshot or short video).
- [ ] Mobile breakpoint (iPhone SE) and tablet (iPad mini) verified.
- [ ] No new TODOs without justification.
- [ ] Conventional commit message.
- [ ] `docs/PROGRESS.md` updated.

---

## 10. Real backend integration (M10 — done for v2; ongoing maintenance)

SendPalm is **local-first**, but the user wants the email client to talk to **real IMAP/SMTP** servers so messages persist across devices.

### 10.1 Test credentials (production-grade IMAP/SMTP account)

These are real credentials provided by the user for end-to-end testing. They live in `app/.env` (gitignored) and are referenced by every agent that runs the backend suite.

```
SENDPALM_TEST_EMAIL=edwinhao@sendpalm.com
SENDPALM_TEST_PASSWORD=<app-specific password from user, see .env>
SENDPALM_TEST_IMAP_HOST=imap.feishu.cn
SENDPALM_TEST_IMAP_PORT=993
SENDPALM_TEST_SMTP_HOST=smtp.feishu.cn
SENDPALM_TEST_SMTP_PORT=465
```

**Do NOT** commit `.env` or paste the password into any file, commit, screenshot, or log. Use `.env.example` for placeholders only.

### 10.2 Tech stack (web-search verified 2026-08-01)

| Concern | Crate | Why |
|---|---|---|
| IMAP receive | `async-imap` | Async-native, tokio-compatible, used by Delta Chat. |
| SMTP send | `lettre` | Async SMTP client with TLS/rustls + SMTP AUTH. |
| MIME parse | `mailparse` | RFC 3501 / 2045 / 5322 compliant, no_std-friendly. |
| Config | `dotenvy` | Loads `.env` at Rust boot (dev) and skips in release. |

### 10.3 Sync semantics

- Each `accounts` row stores: `last_uid`, `uid_validity`, `last_synced_at`.
- On sync: connect → `SELECT INBOX` → fetch UIDs > `last_uid` → `mailparse::parse_mail` → upsert into `messages`, `contacts`, `files`.
- New senders get a `Contact` row (firstSeen=false, screened=true).
- `Re-surfacing tick` is replaced by real IMAP `IDLE` (when async-imap supports it) or 60 s polling.

### 10.4 E2E strategy

| Test | Type | Verifies |
|---|---|---|
| `src-tauri/tests/parser_test.rs` | Unit (no network) | MIME → Message round-trip on RFC822 fixtures. |
| `src-tauri/tests/imap_real.rs` | Integration (network, gated by env) | Connect to imap.feishu.cn, list INBOX, assert ≥ 1 msg, message fields parse. |
| `src-tauri/tests/smtp_roundtrip.rs` | Integration (network, gated) | Send a unique-subject email to self, poll IMAP for it, assert body matches. |
| `app/e2e/` (Playwright) | Frontend | Boot desktop build, assert all 16 views render without error. |

Network tests are **gated** behind `if std::env::var("SENDPALM_E2E_NETWORK").is_ok()`. CI without credentials skips them; locally with `.env` present they run.

### 10.5 Privacy

- The app-specific password in `.env` is **read-only for app source**. Never log it.
- IMAP/SMTP connections use TLS (`SslTunnel` for IMAP, `SmtpTransport::relay` over rustls for SMTP).
- Sync metadata (UID, UIDVALIDITY) is persisted locally; message bodies pass through memory only.
- **Auth mode per provider** (locked by `tests/providers_registry.rs`):
  - `app-password` — Gmail, Outlook, iCloud, Yahoo, Fastmail, Feishu (requires the user to generate an app-specific password from the provider's security page).
  - `password-with-auth-code` — QQ, 网易 163, 网易 126 (the login password does NOT work for SMTP/IMAP; the user must enable IMAP/SMTP in the webmail settings and copy the authorization code).
- **Initial IMAP backfill walks chunks**, not a single page. `client.sync("INBOX", last_uid)` returns up to `MAX_PER_TICK = 200`; loop until a chunk isn't full. Without this, a mailbox with thousands of messages never gets fully backfilled.
- **`.env` must be loaded before reading `SENDPALM_TEST_*`** in `sync_loop::resolve_credentials`. `load_test_credentials()` calls `dotenvy::dotenv()`; `resolve_credentials` re-calls it explicitly so the test-account fallback works when called before any `load_test_credentials`.
- **Multi-account sync**: the background loop reads `accounts` every 60s (configurable via `ACCOUNT_RELOAD_INTERVAL`), spawns a per-account task, and signals existing tasks to stop via an `AtomicBool` + `JoinHandle::abort()`. New accounts added in Settings start syncing within ~60s without an app restart.
- **Calendar invites (iCal)**: minimal in-tree parser in `services/ical.rs` (no `icalendar` crate dep). RFC 5545 line unfolding: drop `\r?\n[ \t]` and the leading whitespace of the continuation. VEVENT detection must check the **full line** for `VEVENT`, not just the name before `:` — `split(':').next()` returns `BEGIN` for both `BEGIN:VEVENT` and `BEGIN:VCALENDAR`. Cover with `tests/ical.rs`.
- **First-seen contacts for Gate**: when `upsert_contact` runs from a brand-new IMAP sender, set `first_seen=1, screened=0` on insert (do NOT reset on `ON CONFLICT`). Backfill migration ensures legacy contacts also appear in the Gate screener.

### 10.6 iOS Simulator verification (mobile smoke test)

`scripts/verify-ios.sh` builds a debug bundle, installs it to a booted simulator, launches the app, and captures a screenshot into `docs/ios-screenshots/`. Pair with `pnpm e2e` (desktop Playwright viewport tests) — the two together cover both the responsive layouts and the real Tauri WKWebView boot.

Prerequisites:

- Xcode + iOS SDK (`xcodebuild -version`).
- `rustup target add aarch64-apple-ios-sim`.
- `pnpm` + `@tauri-apps/cli`.

Pitfalls hit during mobile verification:

- **`devUrl` hash/query don't survive into the WKWebView**: the iOS bundle's webview ignores `#onboard-skip` or `?foo=bar` appended to `tauri.conf.json`'s `devUrl`. Don't rely on URL params to drive JS behavior on iOS — use `tauri-plugin-deep-link` for real URL schemes or store flags via `tauri-plugin-store`.
- **AppleScript / `osascript` clicks don't reach the Simulator's WKWebView** under macOS Accessibility permissions without an interactive prompt. The workaround is to bake the desired UI state into the build (e.g., the bootstrap's `IS_BROWSER()` fallback) or to dispatch via `xcrun simctl ui` (limited) / `xcrun simctl openurl <scheme>` (only works once a deep-link scheme is registered).
- **`xcrun simctl` has no `tap` subcommand**. Use `cliclick` (Homebrew) or a registered deep-link scheme to drive UI in CI.
- **Bundle rebuild drops cached outputs**: when iterating on `index.html` or icons, `rm -rf src-tauri/gen/apple/build` before the next `pnpm tauri ios build` to avoid "Directory not empty" rename errors.

---

## 11. Lessons learned (Session 2026-08-04)

Captures the recurring traps the next agent should avoid. Detailed explanations live in `docs/lessons.md`.

- **Animations**: `transform: translateY(0)` is what you animate, not `top`/`bottom` (GPU-accelerated). For spring physics use `cubic-bezier(0.175, 0.885, 0.32, 1.275)` (easeOutBack). Replay a CSS animation on prop change by setting `el.style.animation = 'none'; void el.offsetHeight; el.style.animation = '…'` — SolidJS doesn't reapply animation style changes otherwise.
- **Long unbroken strings (URLs)**: any paragraph that may contain mailto:, https URLs, or tracking-pixel paths needs `overflow-wrap: anywhere` (modern; supersedes `word-break: break-all` for non-CJK text). Set this on a global `p { }` rule in `base.css` so it covers all current and future views.
- **iCal parsing**: `split(':').next()` returns the *name* half (`BEGIN` for both `BEGIN:VEVENT` and `BEGIN:VCALENDAR`). To detect a specific block, check the **uppercased full line** for the block keyword, not the split-off name. Same gotcha for `split_property`.
- **Sidebar**: don't pre-truncate labels (the original `slice(0, 5)` is hostile to long words like "Companies" or "Follow-ups"). Use the full label with `text-overflow: ellipsis` and `white-space: nowrap` and let the sidebar expand.
- **Toast "View" action**: a toast with an action that navigates somewhere needs to also `setCalendarJumpTo`/`setView`/etc. — the action callback must be self-contained and idempotent because toasts are dismissable.
- **Playwright on Tauri builds**: the splash overlay declared in `index.html` blocks Playwright from finding topbar text. Either dismiss the splash explicitly in tests (`await page.locator('body.app-ready').waitFor()`) or scope selectors to `#titlebar`.
- **`cli.send_email_via_backend`** signature changes are silently breaking: the frontend shim returns `null` for unknown commands, so a renamed parameter produces no error — just a Compose that "sends" nothing. Always keep `safeInvoke<…>` parameter names in sync with the Rust `#[tauri::command]` argument names.
- **Tauri store plugin**: the `sendpalm.prefs.json` file is written only after `store.save()`. If a view reads via `store.get(...)` and never calls `set+save`, the file does not exist on disk and any FS-level test will see `null`. In `bootstrap.ts`, always set `onboarding_completed=true; store.save()` so the file materializes.
- **本仓库被 mddock overlay**。`.mddock/` 是 mddock vault 状态目录 (含 tantivy 索引、audit.db、blobs.db), **不得**被 SendPalm 工具链观察、编译、提交。Vite `server.watch.ignored` 已加 `**/.mddock/**`; 任何后续新增 watcher、tsc include、tauri resources 都必须显式排除 `.mddock/**`。