# SendPalm — Stack Decision Record

> Decision timestamp: 2026-08-01 (Asia/Shanghai).
> Re-author: AI build agent (autonomous).
> Source spec: `prototype-v11.38` (v11.38).

This file captures **why** each layer of the stack was chosen, with web-search citations current to the decision date. Do not change any layer without appending a new entry here.

---

## 1. Shell — Tauri 2.x

**Decision:** Tauri 2.10.x (CLI confirmed at `tauri-cli 2.10.1` on dev machine).

### Why

| Need | Tauri delivers | Notes |
|---|---|---|
| Single binary per platform | ✓ | System webview (WebKit/WKWebView on macOS+iOS, WebView2 on Windows, webkit2gtk-4.1 on Linux). |
| Native iOS + iPadOS apps | ✓ | Officially supported; iOS templates ship with Swift plugin bridge. Confirmed at https://v2.tauri.app/develop/plugins/develop-mobile/ (last updated 2026-05-14). |
| Rust core | ✓ | Memory/thread/type safety, small deps. |
| Mature IPC | ✓ | Type-safe `#[tauri::command]` ↔ `invoke()`; capabilities/permissions model in 2.x. |
| Plugin ecosystem | ✓ | sql, store, notification, haptics, clipboard, dialog, fs, http, etc. all in `tauri-apps/plugins-workspace` v2. |

### Alternatives considered

- **Electron** — rejected: 100MB+ runtime per app, Node in the bundle, heavier on iOS.
- **Native Swift/SwiftUI + Android Kotlin** — rejected: doubles the surface, no single code path for desktop+iOS.
- **Flutter desktop** — rejected: HEY-style dense list UIs fight Flutter's Material idioms; web UI patterns (CSS tokens, backdrop-filter) are awkward.

### Citations

- https://v2.tauri.app/start/ — current as of 2026-07-22 ("What is Tauri?" page).
- https://v2.tauri.app/develop/plugins/develop-mobile/ — confirmed iOS Swift plugin support, lifecycle events, FFI hooks.
- https://v2.tauri.app/start/create-project/ — confirmed `npm create tauri-app@latest` is current canonical scaffold; SolidJS is a first-class UI option.

---

## 2. Frontend — SolidJS

**Decision:** SolidJS (template `solid-ts` via `create-tauri-app`).

### Why

HEY-density interactions (live search, ⌘K palette, dense message lists with hover-swim actions, per-row keyboard nav, detail panel sliding in over the list) need **fine-grained reactivity**, not a virtual DOM.

| Need | SolidJS | React | Svelte 5 |
|---|---|---|---|
| Fine-grained updates | ✓ Native | ✗ VDOM diff | ✓ Compiled |
| Bundle size (gzip) | ~7 KB | ~45 KB | ~10 KB |
| JSX-like authoring | ✓ (better DX) | ✓ | ✗ |
| Per-row reactivity (don't re-render whole list) | ✓ | ✗ (need `memo`/`key`) | ✓ |
| Ecosystem maturity (router, stores, testing) | ✓ (SolidStart, solid-router, solid-testing-library) | ✓✓ (but heavier) | ✓ |

For an email app with hundreds of messages and a multi-pane layout, SolidJS is the correct fit. React forces a VDOM walk for every interaction; HEY-comparable density demands no extra work.

### Citations

- https://docs.solidjs.com/ — current as of 2026-04-28.
- https://www.solidjs.com/ecosystem — confirms ecosystem packages used (solid-router, solid-stores, @solidjs/testing-library).

---

## 3. Bundler — Vite

**Decision:** Vite (Tauri's recommended dev server for SolidJS templates; default `devUrl http://localhost:5173`).

### Why

- First-class Tauri 2 + SolidJS support (`vite-plugin-solid`).
- HMR works over Tauri's webview without manual wiring.
- Native ESM dev = no bundling overhead during iteration.
- Production `target: 'safari13'` matches Tauri's webkit runtime on macOS+iOS.

### Citations

- https://v2.tauri.app/start/frontend/vite/ — official config walkthrough.
- https://vite.dev/ — current Vite 5/6 line is stable; no migration needed.

---

## 4. Language — TypeScript (strict)

**Decision:** TypeScript strict mode (`"strict": true`, `"noUncheckedIndexedAccess": true`, `"exactOptionalPropertyTypes": true`).

### Why

- Prototype's `D.*` is a complex nested graph (contacts, accounts, messages, workflows). Catching shape mismatches at compile time is a 10× productivity multiplier.
- Tauri 2 IPC boundary is fully typed via `invoke<T>()`.
- AGENTS.md §3.2 forbids `any`; strict mode enforces this mechanically.

---

## 5. Styling — Vanilla CSS + CSS variables

**Decision:** Vanilla CSS with a single source-of-truth token file `app/src/styles/tokens.css`.

### Why

- HEY-DESIGN.md explicitly defines a token system (`--paper`, `--ink`, `--blurple`, `--mint`, …) — these translate 1-to-1 to CSS variables.
- Tailwind/UnoCSS force a utility class per node, fighting with the HEY token philosophy (which favors named semantic surfaces).
- CSS modules add build cost and obscure the global token system.
- `backdrop-filter`, `cubic-bezier` spring curves, and animated underlines are first-class in vanilla CSS.

### Citations

- https://web.dev/css-custom-properties/ — W3C baseline.
- https://developer.mozilla.org/en-US/docs/Web/CSS/Using_CSS_custom_properties — confirmed standard usage in 2026.

---

## 6. Icons — Phosphor (Light weight)

**Decision:** `@phosphor-icons/web` (Light weight), loaded via JS (matches prototype).

### Why

- Prototype already uses `@phosphor-icons/web@2.1.1` via CDN.
- HEY-DESIGN.md calls for thin elegant line icons.
- Treeshakeable per-icon imports available if bundle size matters.

---

## 7. State — SolidJS stores

**Decision:** `createStore` for app-wide domain state (`data.ts`), `createSignal` for ephemeral UI (`ui.ts`).

### Why

- No router, single-page shell with view state — matches prototype architecture exactly.
- Stores provide nested reactivity without VDOM, ideal for nested `D.*` shapes.
- No Redux/Zustand needed; Solid's primitives are sufficient.

---

## 8. Persistence — Tauri SQL plugin (built on sqlx)

**Decision:** `@tauri-apps/plugin-sql` with SQLite (`sqlite:sendpalm.db`), migrations defined in Rust and applied on `Database.load()`.

### Why

- **Decision date surprise:** The official Tauri 2 SQL plugin is the right choice over `rusqlite` standalone. It uses `sqlx` under the hood, ships with a typed migration API, and exposes a JS `Database` class that's identical to the dev experience of better-sqlite3. We **do not** need a separate Rust-side `sqlx` crate or `rusqlite` dep.
- Less surface to maintain — no parallel connection pool code in Rust.
- Auto-runs migrations on first load.
- Native plugin is iOS-compatible (confirmed in plugin docs).

### Schema migration plan

| Migration | Description |
|---|---|
| `0001_init.sql` | `accounts`, `contacts`, `messages`, `files`, `events`, `tasks`, `drafts`, `agent_drafts`, `agent_sessions`, `agent_tasks`, `agent_audit`, `notifications`, `snippets`, `stickies`, `contact_notes`, `clips`, `follow_ups`, `scheduled_sends`, `labels`, `shortcuts` — all tables mirroring `D.*`. |
| `0002_seed.sql` | Optional seed data for first-run onboarding (only if user opts in). |

### Citations

- https://v2.tauri.app/plugin/sql/ — current as of 2025-11-04. Confirmed sqlite/mysql/postgres backends, migration API, JS `Database.load()` semantics.

### Co-dep: Tauri Store plugin (tiny KV)

For non-relational prefs (`sendpalm-onboarding`, `sendpalm-notif-last-seen`, `sendpalm-theme`, …) use `tauri-plugin-store` instead of inventing a `kv` table.

- https://v2.tauri.app/plugin/store/

---

## 9. Auth / IMAP / SMTP / LLM — deferred

Per AGENTS.md §2: "If the prototype is missing it, it is out of scope for this build." The prototype is in-memory only. Real OAuth, IMAP, SMTP, and LLM calls are M10 work, not now.

When M10 lands:
- `oauth2` crate + `reqwest` for OAuth flows.
- `imap` crate for IMAP.
- `lettre` for SMTP.
- `reqwest` against any OpenAI-compatible endpoint for LLM.

---

## 10. Testing

- FE: Vitest + `@solidjs/testing-library` (first-class Vite + SolidJS).
- Rust: `cargo test` + `tauri::test` for IPC integration tests.

### Citations

- https://vitest.dev/ — current Vite-native test runner.
- https://testing-library.com/docs/solid-testing-library/intro — SolidJS bindings.

---

## 11. Lint / Format

- ESLint 9 (flat config) + Prettier 3 for FE.
- `cargo fmt` + `cargo clippy --all-targets --all-features -- -D warnings` for Rust.

---

## 12. Decisions deferred (open questions, no need to resolve now)

| Question | Default until proven wrong |
|---|---|
| Date library | Native `Intl.DateTimeFormat` + small helpers; add `date-fns` only if a complex need appears. |
| Markdown rendering for compose preview | `marked` (~30KB). Avoid `markdown-it` (heavier, plugin API overkill). |
| Drag-and-drop (M8 gestures) | `@thisbeyond/solid-dnd` — official SolidJS port of `react-dnd`, fine-grained. |
| Virtualization (long lists) | `@tanstack/solid-virtual` — current best for SolidJS. Don't pick `react-window`. |
| PDF preview | Tauri's webview can render PDFs natively via `<iframe src=blob:...>`; no `pdf.js` needed. |
| Color extraction for avatars | Done at seed time in Rust (image crate). No runtime JS dependency. |

Each of these will be re-validated via web search when the corresponding milestone is reached.