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

### 11.1 Lessons learned (Session 2026-08-12 audit-fix series)

7-sub-project audit fix series (`23c6474` A · `22a601a` B · `5f3da2f` C · `ad8f133` D · `0910f98` E · `2a78c74` F · `3187d7d` G). All 9 HIGH-risk items from `docs/superpowers/audit/2026-08-11-email-html-link-audit.md` §3.3 + §5 + §7 fixed.

- **`session.fetch` vs `session.uid_fetch` (RFC 3501 §6.4.8)** — never feed a UID-range string to `session.fetch(range, ...)`. It is **sequence**-fetch; sequence numbers diverge from UIDs after any expunge. Use `session.uid_fetch(range, "(FLAGS UID ENVELOPE BODY.PEEK[])")`. Coincidentally correct on pristine mailboxes; silently wrong on day 2. Fixed in `app/src-tauri/src/services/imap.rs` (Sub-D, `ad8f133`).
- **Tauri 2 IPC convention is camelCase JS ↔ snake_case Rust, but ONLY for command arguments** — response DTOs (e.g. `SyncStateDto` in `backend.ts`) mirror the Rust wire format. Tauri 2 does the camelCase↔snake_case conversion only on the way IN to the Rust handler; serialization OUT is plain serde with whatever `rename_all` the Rust struct declares. Do NOT auto-rename response DTO fields to camelCase — most Rust structs here have no `#[serde(rename_all)]` and the wire is snake_case; renaming the TS interface to camelCase makes it lie about the wire shape. (`SyncStateDto` in `app/src/services/backend.ts` deliberately kept snake_case; see spec 2026-08-11-a §3 for the reasoning.)
- **`safeInvoke` returns `null` on parse failure** — already in §11 above; reinforced by the Sub-A fix: 6 of 12 IPC commands had `null`-swallowing bug because JS sent `html_body`/`account_id` but Tauri 2 expects `htmlBody`/`accountId`. The frontend shim catches and returns null, so users saw "Compose sent" with no email leaving. **Any new `#[tauri::command]` must have its JS caller use camelCase keys.** Add a Vitest regression test (`expect(args).not.toHaveProperty("snake_case_key")`) so future re-introductions are caught.
- **DOMPurify 3.x ships its own TypeScript types** — `@types/dompurify@3.x` is a **deprecated stub package** that contains no `.d.ts`. `pnpm add dompurify` is enough; do not also `pnpm add -D @types/dompurify`. (Sub-C Task 1, dropped after 1 fix round.)
- **DOMPurify strips `<a target="_blank">` and `target`/`rel` attributes by default** — to safely rewrite `<a target="_blank">` → add `rel="noopener noreferrer"` in the `afterSanitizeAttributes` hook, also pass `ADD_ATTR: ["target", "rel"]` in the sanitize config. Without `ADD_ATTR`, the rewrite hook fires but the attributes never reach the output. (Sub-C Task 3 scope deviation, implementer fixed inline.)
- **Tauri 2 CSP requires `'unsafe-inline'` for `script-src` and `style-src` when using iframe `srcdoc`** — the iframe srcdoc injects an inline `<script>` (click interceptor + show-images handler) and an inline `<style>` block (table/blockquote styles). Without `'unsafe-inline'` the srcdoc renders inert. Also: `connect-src` MUST include `ipc: http://ipc.localhost` for `safeInvoke`/`invoke` to reach Rust commands — Tauri 2's IPC bridge uses these schemes. Current strict CSP is in `app/src-tauri/tauri.conf.json` (Sub-G, `3187d7d`).
- **`#mddock` `closest()` returns `Element`, not `HTMLAnchorElement`** — must cast `as HTMLAnchorElement | null` before reading `.href`. `tsc --noEmit` rejects `e.target.closest("a[href"]).href` without the cast. (Sub-E Task 3.)
- **`vi.mock` is hoisted before imports** — any `const` referenced inside the factory must use `vi.hoisted(() => ({ ... }))`. Otherwise `ReferenceError: Cannot access 'x' before initialization`. (Sub-A Tasks 3, 4.)
- **`pnpm lint --max-warnings=0` makes unused `// eslint-disable-next-line` directives themselves a lint error** — only add the directive if the rule actually fires on the next line; otherwise remove the directive. (Sub-C final review; Sub-G Task 5 reviewer caught the same issue.)
- **Pre-existing dirty files in working tree are environment state, not task scope** — this repo's working tree routinely contains uncommitted `AGENTS.md` (system context load), `.gitignore` updates, `.claude/`, `.kimi/`, `.opencode/` (skill dirs), `qa-tmp/.DS_Store` (macOS metadata), and other agents' untracked plans. Sub-task reviewers must scope-check via `git status --short` against the brief's intended files only, not the full diff. (Sub-C Task 3, Sub-F Task 3.)
- **iOS build on this darwin is supported** — Xcode toolchain + iOS Simulator runtimes are installed. `pnpm tauri ios build` produces a signed-or-unsigned `SendPalm.app` bundle at `~/Library/Developer/Xcode/DerivedData/sendpalm-app-*/Build/Products/release-iphoneos/`. First build is slow (~30 min cargo + ~2 min xcodebuild). Bash `5 min` timeouts are too short; use `60 min` for iOS builds. Per AGENTS §10.6 caveats: `devUrl` hash/query params don't survive into WKWebView; AppleScript/`osascript` clicks don't reach the Simulator's WKWebView under macOS Accessibility prompts — UI interaction verification remains manual, but compile verification is now in CI scope.
- **Subagent-driven execution pattern works on this repo** — spec → plan → task brief → implementer subagent → reviewer subagent → fix rounds → final review. 7 sub-projects × ~5 tasks each = 35 dispatches, all reviewer-approved except 5 fix rounds (acceptable scope drift caught + corrected). Pattern survives subagent `vi.mock` hoisting quirks, log-path inconsistencies (`app/qa-tmp/` vs `qa-tmp/`), and pre-existing dirty files.

### 11.2 Lessons learned (Session 2026-08-17 — Imbox performance + rustls CryptoProvider)

- **Do not animate `grid-template-columns` to open side panels** — every frame forces reflow of the entire main column and makes dense lists jitter. Use `position: fixed` overlays animated with `transform`/`opacity` so the Imbox list never reflows.
- **SolidJS `<Switch>/<Match>` unmounts inactive views** — switching tabs tears down the previous view, so returning re-runs all `createResource` fetches and resets scroll. For views that must feel instant (Imbox), wrap them in a `KeepAlive` component that toggles `display: none` instead of unmounting.
- **Give UI piles their own lightweight query** — do not call full `listMessages()` (which pulls `body_html`) just to render reply_later/set_aside/bubble_up piles. Add a dedicated query (e.g. `listPileMessages()`) that returns only the columns the UI actually needs, and refetch just that slice on card actions.
- **Split refresh signals into hard and soft ticks** — a global hard `refreshTick` that clears paged lists is overkill for background sync events. Add a `softRefreshTick` that updates lightweight state (piles, contacts, counts) without resetting the paginated list. Sync events should use the soft tick; new messages are still prepended by the paginated path.
- **`useRefreshEffect` should skip its initial mount run** — otherwise it double-fetches resources that already fetch on mount. Use an initial-skip guard or merge the refresh logic into the resource itself.
- **rustls 0.23 requires an explicit process-level CryptoProvider** — calling `rustls::ClientConfig::builder()` without a provider panics at runtime. Install `rustls::crypto::ring::default_provider()` once at app startup in `lib.rs::run()` so IMAP DoH, lettre, sqlx, and reqwest all find a default. `AlreadySet` is harmless; log it and continue.
- **Restarting `pnpm tauri dev` can leave orphan processes** — Vite on `:1420` and the `sendpalm-app` binary may survive `kill`. Before starting a fresh dev server, run `lsof -ti :1420 | xargs kill -9` and `ps aux | grep sendpalm-app` to clean up, or use a single `pnpm tauri dev` session and let Playwright reuse it.
- **Direct `innerHTML` email previews need the same `.sp-img-hidden` rule as the MessagePanel iframe** — the DOMPurify hook hides external images by adding `class="sp-img-hidden"`, but that class only works if it is defined in the host document (not just inside an iframe srcdoc). Add it to `base.css` so Gate and any other non-iframe preview paths hide tracking pixels by default.

---

## 12. Agent Skills & Global Protocols

SendPalm adopts a set of global agent skills stored in `~/.agents/skills/`. These skills are available to Kimi Code, Claude Code, OpenCode, and any other agent that reads the standard skill directory. **Invoke them by name** when the situation matches their description:

| Skill | When to invoke |
|---|---|
| `managing-git-worktrees` | Before starting a non-trivial task, creating a worktree, merging a worktree branch, or cleaning up worktrees. |
| `preventing-code-debt` | Before declaring a feature done, during review, or when planning periodic cleanup with subagents. |
| `debugging-monorepo` | When a bug spans Rust / TypeScript / Tauri / frontend layers, or when previous fixes failed. |
| `session-handoff` | When pausing unfinished work that another session may continue, or resuming such work. |
| `pre-execution-safety` | Before running any shell command that could mutate shared state, especially git, filesystem, credentials, or production. |
| `cleanup-and-docs-sync` | When planning periodic cleanup or verifying documentation matches code. |

Additional Superpowers plugin skills are also available:

| Skill | When to invoke |
|---|---|
| `using-git-worktrees` | Worktree setup and isolation decisions. |
| `systematic-debugging` | Any bug, test failure, or unexpected behavior before proposing a fix. |
| `subagent-driven-development` | When executing a plan with independent tasks that can run in parallel. |
| `verification-before-completion` | Before claiming a task is complete, fixed, or passing. |

**Rule**: if a skill applies, invoke it before acting. Do not skip skill discipline because the task "feels simple."

---

## 13. Worktree & Git Workflow

Based on the MDDock worktree incidents, SendPalm uses the following hard rules to prevent lost work and cross-session overwrites.

### 13.1 When to use a worktree

| Situation | Use worktree? | Branch naming |
|---|---|---|
| New feature / bugfix / refactor | **Yes** | `feat/<slug>`, `fix/<slug>`, `refactor/<slug>` |
| Multiple concurrent AI or human sessions | **Yes, one per session** | unique slugs |
| Read-only exploration / review | No | stay on current tree |
| Emergency hotfix | Yes | `hotfix/<slug>` |
| Temporary spike / bug reproduction | Yes, delete same day | `spike/<slug>` |
| Solo, <5 lines in one file | Optional; branch still safer | `fix/<slug>` |

### 13.2 Creating a worktree

1. Ensure `.worktrees/` is gitignored. If not:
   ```bash
   echo ".worktrees/" >> .gitignore
   git add .gitignore && git commit -m "chore: ignore worktree directory"
   ```
2. Create from latest `main`:
   ```bash
   git fetch origin main
   git worktree add .worktrees/feat/<slug> -b feat/<slug> origin/main
   ```
3. **Never create a worktree inside another worktree.**
4. Bootstrap the new worktree before editing:
   ```bash
   cd .worktrees/feat/<slug>
   pnpm install
   cargo build
   pnpm test || cargo test
   ```
   If baseline tests fail, stop and report.

### 13.3 Working inside a worktree

- Commit early and often. Uncommitted work can be lost on force-removal.
- Lock long-running worktrees: `git worktree lock <path>`.
- Keep shared handoff files outside the worktree, resolving paths via `git rev-parse --git-common-dir`.

### 13.4 Merging back

1. Preview the merge without committing:
   ```bash
   git fetch origin main
   git merge origin/main --no-commit --no-ff
   ```
2. Resolve conflicts file by file:
   - **UI/flow/behavior conflicts**: prefer the worktree's implementation, then manually port clearly newer bugfixes from `main`.
   - **Non-UI code conflicts**: prefer the newer commit.
   - **Never use `--theirs` or `--ours` wholesale.**
3. Run regression tests and visual verification before pushing.

### 13.5 Cleaning up

```bash
# Dry-run first
git worktree remove --dry-run .worktrees/feat/<slug>
# Then remove
git worktree remove .worktrees/feat/<slug>
git branch -d feat/<slug>
```

---

## 14. Debugging Discipline

SendPalm is a Tauri 2 + Rust + SolidJS monorepo. Bugs can hide across Rust commands, IPC bindings, frontend stores, and native shell behavior. Follow this discipline before editing code.

1. **Lock the surface first.** Decide whether the symptom lives in:
   - Rust backend (`src-tauri/src/`) → `cargo test`
   - Tauri IPC / commands → check `src-tauri/src/commands/` and typed bindings in `app/src/ipc/`
   - SolidJS frontend → `pnpm test`, browser devtools
   - Tauri shell / native → `pnpm tauri dev`, panic logs, device logs
   - Build / tooling → clean rebuild, source maps
2. **Reproduce before fixing.** If you cannot reproduce the bug, you do not understand it.
3. **Add boundary logs.** Log at the exact layer where expected diverges from actual.
4. **Trace data flow backward** from the symptom to the source.
5. **One hypothesis, one change, one verification.** Do not change multiple surfaces at once.
6. **Three-strike rule.** If three fix attempts fail, stop and question the architecture before a fourth.
7. **Read logs first.** Tauri panic log: `~/Library/Logs/com.sendpalm.app/`; browser/Tauri devtools console; Rust stderr.
8. **Never debug in release builds.** Use dev/debug builds with source maps and symbols.

Invoke the `debugging-monorepo` or `systematic-debugging` skill at the start of any non-trivial bug investigation.

---

## 15. Code Hygiene & Debt Prevention

SendPalm already forbids technical debt in §3.2. This section adds the cleanup protocol.

### 15.1 Prevention checklist (apply before every commit)

1. **Delete, don't comment out.** No `_legacy`, `_old`, `.deprecated.*`, or commented-out blocks.
2. **Remove unused code.** Imports, parameters, variables, functions, unreachable branches.
3. **One logical change per commit.** No mixing refactor + feature + bugfix.
4. **Match surrounding style.** Follow existing file patterns before imposing your own.
5. **No speculative abstraction.** Don't extract a helper until it has ≥ 3 concrete callers.
6. **Keep files small.** Soft limit 1200 lines per file; split before hitting it.
7. **Update collateral.** Deleting a feature means deleting its tests, docs, i18n keys, types, and generated artifacts.
8. **Tests prove the change.** Every behavior change has a failing test that turns green.

### 15.2 Slop detection signals

Watch for these AI-generation warning signs:

| Signal | Fix |
|---|---|
| Unnecessary comments stating the obvious | Delete them. |
| Defensive over-engineering (`as any`, broad try/catch) | Narrow types and error handling. |
| Duplicated logic | Extract a shared helper. |
| Magic numbers / strings | Move to named constants. |
| TODO / FIXME without justification | Fix now or remove. |

### 15.3 Periodic cleanup with subagents

When debt accumulates, run a structured cleanup:

1. **Audit** — identify hotspots (large files, duplicated code, dead code).
2. **Triage** — prioritize by impact and risk.
3. **Delegate** — use isolated subagents with narrow scopes. Never delegate whole-codebase cleanup or overlapping files in parallel.
4. **Review** — verify each cleanup with tests and diff review.
5. **Update debt ledger** — record what was cleaned and what remains.

Invoke the `preventing-code-debt` skill before declaring a feature done or when planning cleanup.

---

## 16. Cross-Session Handoff & Context

AI sessions lose context when they end, get compacted, or run in parallel. Use a layered handoff strategy.

| Need | Mechanism | Location | Lifetime |
|---|---|---|---|
| Same tool, same task, short break | Native resume | `kimi --continue` / `claude --resume` | tool-managed |
| Task state for next session | `HANDOFF.md` | repo root or worktree root | delete when done |
| Parallel session coordination | `.ai-handoff/STATUS.md` | repo root, resolved via `GIT_COMMON_DIR` | rolling |
| Permanent project memory | vault / memory files / `AGENTS.md` updates | project memory store | permanent |

### 16.1 `HANDOFF.md` contents

When pausing unfinished work, write a `HANDOFF.md` in the repo or worktree root:

```markdown
# Handoff: <task-title>

## Status
- Started: <ISO date>
- Last session: <ISO date>
- Current branch / worktree: <name>
- Completed: <bullet list>
- Blocked by: <external dependency or question>

## Next step
<single concrete next action>

## Open decisions
<questions the next session must answer>

## Important context
<files, commands, test failures, gotchas>

## Drift / out-of-scope items
<tasks discovered but not part of this branch>
```

Delete `HANDOFF.md` when the task is complete.

### 16.2 Parallel sessions

If multiple AI or human sessions are editing SendPalm concurrently:

1. Maintain `.ai-handoff/STATUS.md` at the repo root.
2. Each session records its branch/worktree, current task, and estimated completion.
3. Resolve shared paths via `git rev-parse --git-common-dir` so all worktrees see the same status file.
4. When in doubt, prefer worktree isolation (§13) over concurrent edits on the same branch.

Invoke the `session-handoff` skill when starting, pausing, or resuming multi-session work.

## Agent Role Definitions

This repo provides declarative agent definitions for Claude Code (`.claude/agents/`), Kimi Code (`.kimi/agents/`), and OpenCode (`.opencode/agent/`). Available roles:

| Role | File | Purpose | Isolation |
|---|---|---|---|
| `feature-builder` | `.claude/agents/feature-builder.md`, `.kimi/agents/feature-builder.yaml`, `.opencode/agent/feature-builder.md` | Build features and bugfixes | worktree |
| `debugger` | `.claude/agents/debugger.md`, `.kimi/agents/debugger.yaml`, `.opencode/agent/debugger.md` | Investigate bugs | worktree when editing |
| `cleanup-agent` | `.claude/agents/cleanup-agent.md`, `.kimi/agents/cleanup-agent.yaml`, `.opencode/agent/cleanup-agent.md` | Periodic cleanup + docs sync | worktree |
| `reviewer` | `.claude/agents/reviewer.md`, `.kimi/agents/reviewer.yaml`, `.opencode/agent/reviewer.md` | Pre-merge diff review | none (read-only) |

These definitions reference the global skills in `~/.agents/skills/`. When starting a task, invoke the appropriate role by name, e.g.:

> "Use the feature-builder agent to implement ..."
> "Use the cleanup-agent to audit and clean up ..."
