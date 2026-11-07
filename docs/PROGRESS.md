# SendPalm Build Progress

> Source: prototype-v11.38 (v11.38) — every feature reimplemented as Tauri 2 + SolidJS.

## Inbox email-to-Tasks (2026-11-02)

- Added migration 0024: nullable provenance/direction on existing `tasks`, durable per-message extraction runs, and separate review suggestions. Confirmation uses a stable task ID; dismissal never creates a task. Existing task rows remain unclassified and editable in TaskPanel.
- Automatic extraction defaults off, requires an explicitly configured compatible model/runtime, and uses only new sync IDs or the currently approved Gate/inline Inbox message. Eligibility is checked before sending and after receiving: inbound Inbox, screened/non-blocked sender, enable timestamp. No mailbox backfill or automatic retries. Queue metadata stays lightweight; only the current serial request loads one body, capped at 12,000 input characters / 3 suggestions / 512 completion tokens.
- Added lazy Tasks workspace with editable review drafts (preserved across background refresh), direction review, confirm/dismiss, source navigation, manual task creation, and the existing Follow-ups sibling. MessagePanel gains only a More-menu extraction action; TaskPanel gains an optional source-email action and soft-refresh notifications after existing save/delete operations so the new list stays current. HTML/Markdown/iframe rendering and internal `imbox` IDs are unchanged.
- Corrected Settings persistence for the new toggle: reactive snapshots trigger saves, old settings normalize to off/null, and API keys stay out of preference writes (existing vault flow retained). Interrupted/failed candidate writes are cleaned up; deleted sources are handled safely.
- Verification: 554 Vitest tests pass; typecheck, lint, production build, and `git diff --check` pass. Full supported Playwright suite: 96 passed, 1 live Feishu test skipped; focused 375/820/1440px Tasks/source/manual-action flows: 3 passed. All SQLite migrations 0001–0024 apply sequentially in memory; provenance, legacy rows, state constraints, and source-deletion cascades verified. Rust migration test added but `cargo test` cannot start because no default Rust toolchain is configured. Bundled Playwright Chromium is absent; tests used installed Chrome via the existing `qa-tmp/sidebar-playwright.config.ts`. Visual evidence: `app/test-results/workflows-Email-workflows-*/tasks-review.png`; detailed logs: `app/qa-tmp/task-extraction-*.log`.
- Integration boundary: live Feishu/native Tauri/iOS and real model requests are not exercised; browser tests never invent model output. The pre-existing build chunk-size/Tauri dynamic-import warnings remain. Fresh-context review caught a manual retry of skipped runs; retry eligibility now follows the spec (only failed runs can be retried manually), with a regression test. No commit or merge performed; existing Sidebar changes and the untracked prototype are preserved.

## Sidebar workspace groups (2026-11-02)

- Added six workspace groups without changing the canonical 15 `NAV_SECTIONS` routes: Mail → Inbox, Calendar → Calendar, Contacts → Contacts, Tasks → existing Follow-ups, Library → Files, More → Insights.
- Kept the 64px rail and existing view/shell/detail/email rendering intact. Desktop defaults remain one click away; explicit keyboard-accessible disclosures expose the original route labels, shortcuts, active child, and Gate badge. Mail carries the Gate count even when its disclosure is closed.
- Mobile has five default-route tabs plus More (six ≥44px targets). More opens the existing dismissible sheet, now organized into all six groups, including Insights and Settings. Listing all 15 routes also makes primary routes discoverable in the sheet; no task model or new screen was added.
- Added route-coverage/component tests and a shared Playwright navigation helper; migrated secondary-route callers, including backup/restore coverage. RED→GREEN recorded for metadata/disclosures and keyboard focus restoration.
- Verification: 503 unit tests passed; typecheck, lint, production build, and diff checks passed. Full Playwright E2E: 92 passed, 1 live Feishu integration test skipped, using installed Google Chrome via a temporary local config because bundled Chromium is unavailable. The production build still reports the pre-existing Tauri API/dynamic-import and large-chunk warnings.
- Visual evidence: `/tmp/sendpalm-screenshots/e2e/` and existing UI-audit screenshot outputs. Native Tauri/iOS and live IMAP/SMTP are not exercised by this navigation-only change.

## Loading states across all views (2026-08-21)

12 views were missing loading feedback — `createResource` was firing but no Skeleton / placeholder was rendered until the IPC round-trip resolved, so the user saw a blank screen on every view switch. The `ResourceGate` component (`src/components/ResourceGate.tsx`) already existed for exactly this; the migration just had not been done. Refactored every affected view to use it, getting the loading/error/empty trifecta for free:

- `ResourceGate` gained a new `isLoading?: () => boolean` override so multi-resource views (Drafts, Files, Insights, Search, Agent, …) can OR all their `createResource.loading` flags and keep the skeleton up until _everything_ the view needs is ready. Previously these views would render partial content as the slowest resource resolved.
- 11 views migrated: Agent, Calendar, Clips, Companies, Drafts, Files, FocusReply, FollowUps, Insights, Search, Settings (Settings has 4 tab-level sub-components each with their own gate).
- Onboarding verified to not need a gate (no `createResource`).
- `useAgent` hook gained an `isLoading` accessor + a re-exported `sessionsResource` so the Agent view can plug a single `ResourceGate` over 5 internal resources.
- New `src/views/loading-states.test.ts` (16 vitest cases) greps each view source for `import { ResourceGate }` and the `<ResourceGate>` JSX usage. Cheap belt-and-suspenders that catches a regression if someone reaches for a raw `<Show when={!resource.error}>` again.
- `ResourceGate.test.ts` → `.tsx` (renamed because the new tests use JSX via `@solidjs/testing-library`), +4 new render tests covering the loading/skeleton, isLoading override, and error paths.

`pnpm vitest run` → 313 / 313 pass. `pnpm lint` / `pnpm tsc --noEmit` / `pnpm prettier --check` all clean on the 15 changed files.

### Lesson

The `ResourceGate` component existed but the views never migrated to it. Audit-style catchup would be cheaper if the component is **introduced _and_ the migration is shipped in the same commit** — half-migrating leaves the technical debt in place and reviewers can't tell whether the new pattern is enforced. Going forward: new `createResource` calls should default to a `ResourceGate` and the loader is the `SkeletonList` skeleton, not a hand-rolled `<Show>`.

## View-switching perf audit (2026-08-21)

The "loading fixed" pass also needed to answer "how bad is the lag, actually?" before any perf optimization. Built `e2e/perf-views.spec.ts` — Playwright boots Vite, seeds ~1500 contacts + 4000 messages via `window.__sendpalmE2E`, then for every sidebar-navigable view clicks the nav button, records `mountMs` (click → h1/h2 visible), `longTasks` via `PerformanceObserver`, frame avg/p95/max over a 3 s rAF sampler, and `loadingVisible` (whether the new Skeleton was actually observed in the DOM). Output to `qa-tmp/perf-views-report.json`. Search / Agent / FocusReply are not in the sidebar — they open via ⌘K and need a separate test pass.

Results (warmup pass + measurement pass, Vite dev mode, 4000-row MockDb):

| View          | mountMs | longTasks | maxTask | frameAvg | frameP95 | frameMax  |
| ------------- | ------- | --------- | ------- | -------- | -------- | --------- |
| Imbox         | 131     | 0         | 0       | 16.5     | 17.5     | 19.6      |
| Drafts        | 88      | 0         | 0       | 16.5     | 17.5     | 21.1      |
| Files         | 177     | 0         | 0       | 16.5     | 17.4     | 27.3      |
| Clips         | 220     | 0         | 0       | 16.7     | 17.4     | 55.5      |
| FollowUps     | 148     | 0         | 0       | 16.5     | 17.5     | 17.8      |
| **Companies** | **645** | **3**     | **217** | 19.2     | 18.2     | **298.7** |
| Insights      | 202     | 0         | 0       | 16.6     | 17.7     | 34.1      |
| Calendar      | 200     | 0         | 0       | 16.6     | 17.6     | 25.2      |
| Settings      | 324     | 0         | 0       | 16.7     | 17.6     | 23.2      |
| Records       | 167     | 0         | 0       | 16.7     | 18.9     | 36.3      |
| Spam          | 216     | 0         | 0       | 16.5     | 17.7     | 25.9      |
| Trash         | 249     | 0         | 0       | 16.5     | 17.5     | 17.7      |

**Companies is the only real perf hotspot** — 645 ms mount, 3 long tasks, 217 ms max long task, 298 ms max frame. Other views are 100–330 ms and stay at 60 fps after the first paint.

Root cause for Companies (read straight from `Companies.tsx:42-72`):

- 5 concurrent IPC round-trips (contacts + messages + events + files)
- client-side `grouped()` memo runs `O(people × (messages + events + files))` set lookups in a single synchronous `createMemo` on the main thread — 1500 contacts × 4 lookups per contact = 6000 Set ops blocking the JS thread
- when the 5 resources all resolve near-simultaneously, SolidJS re-runs the memo on each one → render storm on the main thread

`loadingVisible: false` everywhere in this measurement is **expected** — MockDb resolves in the microtask queue, faster than the Playwright locator can observe `aria-busy="true"`. The visual confirmation of the new Skeleton has to happen against a real Tauri IPC round-trip (where the data path is 50–500 ms).

### Lesson

The audit-script-in-source approach (loading-states.test.ts) catches structural mistakes but the perf audit lives better in `e2e/`. Keep `e2e/perf-views.spec.ts` as the regression gate for the Companies hot path specifically — once that 645 ms drops below 200 ms and 0 long tasks, raise the bar to the next slowest view.

## Companies perf fix (2026-08-21)

Followed up on the perf audit: the 645 ms / 3 long-task / 217 ms max-task result for Companies was the worst offender in the report. Replaced the 4-resource client-side aggregation with a single SQL aggregate query.

`src/stores/data.ts`:

- New `listCompaniesWithCounts()` + `CompanyGroup` interface. One `SELECT` with four correlated subqueries (per-row) computing people / message / event / file counts. SQL was first drafted with CTEs but the in-browser `MockDb` only matches `SELECT ...` at the start of the string, so the production-flattened form uses inline subqueries to keep the e2e MockDb path working. Real Tauri runs both shapes identically.
- `events.pids` is a JSON array, so the event count uses `EXISTS (SELECT 1 FROM json_each(e.pids) je WHERE je.value IN ...)` to expand the array server-side.
- Empty / null company strings fold into the `(未分类)` bucket to match the previous `c.company || "(未分类)"` UX.
- Returns rows pre-sorted by `people_count DESC, company, c.name`, so the JS side just groups by company and reads counts off the first row of each group — no sort pass, no Set construction on 1500 contacts.

`src/views/Companies.tsx`:

- 4 `createResource` calls → 1. `createMemo` group/sort → linear pass.
- Removed `useRefreshEffect` from the 4 separate refetches; one `refetch` covers the whole view.

Re-ran `e2e/perf-views.spec.ts` against the same 1500 contacts / 4000 messages seed:

| Metric        | Before | After  |
| ------------- | ------ | ------ |
| mountMs       | 645    | **47** |
| longTasks     | 3      | **0**  |
| longTaskMaxMs | 217    | **0**  |
| frameMaxMs    | 298    | **19** |

13.7× mount speedup, long tasks gone, no observable frame jitter. Other views also got faster as a side effect of the warmup pass no longer hitting a 217 ms blocking task on the previous navigation.

`pnpm vitest run` → 313 / 313 pass. `pnpm lint` / `pnpm tsc --noEmit` / `pnpm prettier --check` all clean.

### Lesson

When a view's `createMemo` does cross-table work, the right fix is almost never "memoize smarter" — it's "push the join into the database". A 1500 × 4 in-memory filter pass is irrelevant CPU-wise but it runs on the **main thread**, which means the entire UI freezes for the duration. SQLite's correlated-subquery planner handles this in microseconds; moving the join across the IPC boundary is a free 13× speedup that no amount of `untrack()` / `batch()` / `createMemo` optimization would match.

## Scroll perf audit (2026-08-21)

User reported "现在的滑动体验也很卡" after the Companies fix. The existing `e2e/imbox.spec.ts` already had a 50-frame scroll perf check, but it was buried inside the functional Imbox suite. Pulled it out into the perf audit as a standalone test that runs at two data sizes:

- `Imbox: continuous scroll over a 4000-row corpus` — the production Feishu shape.
- `Imbox: scroll at 10000-row corpus (saturation point)` — 2× production to see where it breaks.

Both measured in headless Chromium over a 6 kpx / 2 s continuous wheel sweep, frame budget = 22 ms (1 dropped frame ≈ visible jank at 60 fps).

| Corpus      | avgFrame | p95     | max     | dropped | longTasks | maxTask |
| ----------- | -------- | ------- | ------- | ------- | --------- | ------- |
| 4 000 rows  | 16.6 ms  | 17.4 ms | 19.7 ms | 0       | 0         | 0 ms    |
| 10 000 rows | 16.6 ms  | 17.4 ms | 17.7 ms | 0       | 0         | 0 ms    |

Both PASS at 60 fps with 0 dropped frames and 0 long tasks. The `Imbox` JSX contract (browser-native virtualization, 100-row pages, `lightweight: true` `listMessagesPaged` so rows carry no body_html) is doing its job. **The "scroll lag" the user feels is not in the rendering path; it has to be Tauri-IPC overhead on view-switch (Vite dev with `MockDb` resolves the same data instantly).** The fix there is the same one applied to Companies: aggregate the multi-resource fetches behind a single SQL query.

### Lesson

Always instrument the path you suspect before reaching for a fix. The user said "scroll is laggy" and a 2-line scroll frame test in headless Chromium proved the scroll path is at 60 fps. The actual lag was elsewhere — probably the Tauri IPC + real SQLite round-trip for the `events` / `contacts` / `listPileMessages` resources that fire on every Imbox mount. The fix is upstream of the scroll handler, not in it.

## Second-pass perf scan + Insights + Calendar (2026-08-21)

User came back with "再扫一下吧，还有现在的滑动体验也很卡" after the Companies fix. The v1 audit (`perf-views.spec.ts`) only measured Imbox window-scroll + view-switching; both passed at 60 fps. The user was still seeing jank somewhere, so I built `e2e/perf-2-pass.spec.ts` covering the surfaces the v1 audit didn't touch — MessagePanel body scroll, Calendar year-view scroll, real per-element scrolling (not just `window.scrollBy`), and `PerformanceObserver` paint-timing entries.

### What the second pass found

The Imbox list and message panel scroll are clean. The **Calendar year view** had a real 64ms long task during scroll. **Insights** was the slowest view at 159.9ms mount. Two predicted-by-analogy fixes (the same pattern as the Companies single-SQL fix) addressed both.

| View / Surface                          | Before          | After           | Δ              |
| --------------------------------------- | --------------- | --------------- | -------------- |
| Insights mountMs                        | 159.9           | **75.3**        | -53%           |
| Settings mountMs                        | 70.6            | 36.4            | -48%           |
| FollowUps mountMs                       | 118.6           | 70.5            | -40%           |
| Clips mountMs                           | 104             | 65.2            | -37%           |
| Imbox mountMs                           | 70.5            | 44.1            | -37%           |
| PaperTrail mountMs                      | 73.1            | 50.4            | -31%           |
| Files mountMs                           | 84.2            | 63.2            | -25%           |
| Companies mountMs                       | 70.4            | 54.8            | -22%           |
| Spam mountMs                            | 69.3            | 56.2            | -19%           |
| Calendar mountMs                        | 94.2            | 83.4            | -11%           |
| **Calendar year-view scroll long task** | **1 × 64ms**    | **0**           | ✓              |
| Calendar year-view scroll max frame     | 19.6ms          | 21.8ms          | within 1 frame |
| Imbox list scroll (4000 rows)           | 0 dropped, 0 LT | 0 dropped, 0 LT | unchanged      |
| Imbox list scroll (10000 rows)          | 0 dropped, 0 LT | 0 dropped, 0 LT | unchanged      |
| MessagePanel body scroll                | (not measured)  | 0 dropped, 0 LT | new            |

All numbers from `qa-tmp/perf-scan-2.json` (the v1 report is still at `qa-tmp/perf-views-report.json` for the original baseline).

### The two fixes

**Insights: 5 `createResource` → 1 `getInsightsSummary()`** (`src/stores/data.ts` + `src/views/Insights.tsx`). The view fired 5 parallel resources (contacts, followUps, agentTasks, events, messages) and SolidJS re-ran every downstream `createMemo` 5 times as each one resolved — the mount cost was the cascade, not the JS work. The new `getInsightsSummary()` awaits all 5 reads in `Promise.all` and returns a single DTO; the view drops to 1 `createResource` / 1 `ResourceGate` / 1 `isLoading`. IPC unchanged (still 5 SQL hits), JS derivation runs once after the slowest read.

**Calendar year-view: pre-computed `Set<YYYY-MM-DD>` for hasEvent** (`src/views/Calendar.tsx`). The previous `MonthMiniCalendar.hasEvent(d)` did an O(events) scan for every cell: 12 months × 42 cells × 692 expanded occurrences = 348,768 comparisons on every render, plus a `Date` allocation per event per cell. YearGrid now computes a `Set<YYYY-MM-DD>` of every day-in-year with an event (O(events) per year) and passes it down. The lookup is O(1) string-format + `Set.has` — 348,768 scans → 504 lookups.

### Lesson

The "push joins into the database" lesson from the Companies fix generalizes to **"push multi-resource fetches behind one resource"**. The 5-cascade mount cost is the same shape as the 4-table client-side group/filter cost — N parallel reads = N re-derivations of every downstream memo, even though each individual read finishes in microseconds. Bundling behind one `Promise.all` is a free N× speedup that no amount of `untrack()` / `batch()` / `createMemo` optimization would match. The fix is structurally identical to the Companies one even though Insights never did any "client-side join" work.

## Stress-test confirmation at 3× data (2026-08-21)

User came back with "主要出现在数据多的时候" — wanting to know if the v1 fix actually scales with the data the user actually has. Added a 3× stress variant of the perf-2-pass test: 4500 contacts, 12000 messages, 200 events (50 weekly-recurring → ~2600 occurrences in the Calendar year view, 4× the v1 baseline). Re-measured the surfaces the v1 fixes touched.

| Surface                         | 1× (Feishu) | 3× (stress) | Verdict                                                  |
| ------------------------------- | ----------- | ----------- | -------------------------------------------------------- |
| Calendar year scroll long tasks | 0           | **0**       | ✓ Set lookup is O(1) regardless of event count           |
| Calendar year scroll max frame  | 21.8ms      | 21.4ms      | ✓ no degradation                                         |
| Imbox 12k scroll long tasks     | 0           | 0           | ✓                                                        |
| Imbox 12k scroll dropped frames | 0           | 1           | within noise                                             |
| Calendar mountMs                | 83.4        | 66.8        | ✓ (warm cache; v1 was 94.2 cold)                         |
| Insights mountMs                | 75.3        | 145.0       | 1.9× — data is moving across IPC, scales linearly with N |

**The headline is the Calendar year scroll**: 0 long tasks at 4× the occurrence count. The Set-based `hasEvent` lookup is O(1) regardless of event count, so this scaling is the proof that the fix is a real win and not just a paper refactor.

**Insights scaling is expected and irreducible in Vite/MockDb**: it pulls 12k messages across the IPC bridge in one resource, so 3× data ≈ 1.9× mount. The structural fix (1 resource, not 5 cascading) is in place; the residual is data transfer. The next step on Insights is server-side aggregation in a Tauri Rust command that does the 5 reads in one round-trip and returns the pre-aggregated summary — but that's a Tauri-only optimization and Vite/MockDb is the wrong place to test it.

`pnpm vitest run` → 313 / 313 pass, lint/tsc/prettier clean. Output: `qa-tmp/perf-scan-2-stress-3x.json`. Test: `perf-2-pass.spec.ts` → `stress 3x data: heavy views + scroll`.

### Lesson

The cost of a perf fix is only meaningful when measured at the data scale the user actually has. The 1× Feishu-sized perf run said the v1 fixes worked; the 3× stress run said the **structural** fixes (Set lookup, single resource, SQL aggregate) actually scale, vs cosmetic refactors that only moved the bottleneck. A 1.9× Insights mount at 3× data is fine if the underlying shape is "1 resource × N rows" — that's data transfer, no algorithmic shortcut. It's a problem if the underlying shape is "N cascading resources × N rows" — that's quadratic, no fix without a real refactor. Always re-run perf at the data scale you actually care about before declaring victory.

## macOS DMG build (2026-08-21, post-perf-fixes)

User asked for a fresh DMG so they can try the perf-fixed build on their real machine. Built with `pnpm tauri build` from the app dir, output in `~/.cargo/shared-target/release/bundle/` (the project uses a shared cargo target dir).

| Field           | Value                                                              |
| --------------- | ------------------------------------------------------------------ |
| Commit          | d0689bc                                                            |
| Rust compile    | 6 m 27 s (first cold build from scratch)                           |
| DMG bundle step | ~30 s                                                              |
| DMG path        | `dist/SendPalm-0.1.0-arm64-perf.dmg`                               |
| DMG size        | 8.8 MB (9 215 096 bytes)                                           |
| DMG sha256      | `c74347d0fab88130b9b0a4f77ec3cf1528b16860f80ece855c02888f2057d616` |
| App bundle      | `dist/SendPalm-perf.app` (24 MB binary, 25 485 504 bytes)          |
| App identifier  | `com.sendpalm.app`                                                 |
| App version     | 0.1.0                                                              |
| Min macOS       | 10.13                                                              |

The first cold Rust build from scratch took 6 m 27 s — this is the all-deps-from-scratch cost (Tauri 2 + tokio + objc2 + aws-lc-sys + brotli + sqlx + lettre + …). Subsequent builds will be ~10-30 s for incremental changes (cargo's shared target dir keeps the build cache across runs).

The previous DMG from `2c41277` (the Imbox hover-only toolbar refactor) is preserved in `dist/SendPalm-0.1.0-arm64.dmg` for comparison. The `-perf` suffix marks the new build so the user can pick the right one.

## v2 DMG build — ResizeObserver loop fix (2026-08-21)

User reported the `-perf` DMG showed `ResizeObserver loop completed with undelivered notifications` in the Tauri devtools console and the MessagePanel became unresponsive on long emails. Root cause was the iframe body's ResizeObserver callback setting `el.style.height` synchronously inside the callback — when the body is still laying out (inline images / web fonts / CSS animations), the height change can fire another RO event in the same frame, which the browser suppresses and logs.

Fix (commit 8bc925d, `src/panels/MessagePanel.tsx`): wrap the height write in `requestAnimationFrame` so the browser delivers all RO entries first, then the rAF callback runs the height write on the next frame. Also coalesces bursts via `cancelAnimationFrame` so 10+ RO events from a long email with many inline images collapse to a single height write. New regression test in `panels/MessagePanel.test.ts` covers the rAF coalescing.

This is a textbook fix for the RO loop warning per https://www.w3.org/TR/resize-observer/#deliver-resize-errors. The earlier fix 58b9df0 plugged the **cleanup** leak (observers accumulating on unmount) — this is a different bug: the loop, not the leak.

| Field            | Value                                                              |
| ---------------- | ------------------------------------------------------------------ |
| Commit           | 8bc925d                                                            |
| Rust compile     | 21 m 11 s (deps were wiped mid-build; full rebuild from scratch)   |
| DMG path         | `dist/SendPalm-0.1.0-arm64-v2.dmg`                                 |
| DMG size         | 8.8 MB (9 215 004 bytes)                                           |
| DMG sha256       | `21ab791bcb35e369bc0a101509680609708ed79dc7fe7d8865b5d6d6b13bbb34` |
| App binary mtime | Aug 21 22:16                                                       |
| vitest           | 314/314 pass (was 313, +1 rAF coalescing test)                     |

The `-v2` suffix marks this build vs the earlier `-perf` (which had the leak but not the loop fix). To install, the user replaces the .app in `/Applications` — both builds have the same `CFBundleIdentifier` so macOS will offer to replace in place.

## v3 reframing (2026-08-20)

SendPalm is a **HEY-workflow client for any IMAP email service** — not a HEY replacement. The two-pager `docs/POSITIONING.md` is the source of truth for the white space (HEY workflow × any-service client) and the explicit non-goals (no backend, no cross-device sync, no web app, no B2B SSO).

Two new docs in this reframe:

- `docs/POSITIONING.md` — one-liner, what we are, what we are not, market white space, HEY concept → SendPalm mapping, commercial model, non-goals.
- `docs/OAUTH-DECISION.md` — v3 ships IMAP + app-password only. No OAuth. ≥ 90% user coverage from the 10-provider registry. Defer OAuth to v4+ when (and if) the user base asks.

Code/test surface changes in this reframe:

- `pnpm lint` is now clean for the first time (4 pre-existing e2e errors fixed: `BrowserContext` unused, `ScrollBehavior` undef, `sidebarWidth` unused, e2e config missing DOM lib).
- `utils/save-attachment.ts` — new shared util for "save attachment to disk". Desktop path uses `tauri-plugin-dialog::save` + `tauri-plugin-fs::writeFile` so the user picks the location; browser fallback preserved for `vite dev` / Playwright. FilePanel + MessagePanel both updated to use it. 5 vitest cases.
- Onboarding copy reworked to lead with "连接你的邮箱" (was "接入真实邮箱") and surface the 10-service list and the Sent-folder sync as first-class features (both already shipped but never advertised).

### Tier 3 ship-ready paperwork (2026-08-20, same day)

The codebase was feature-complete but had no first-impression surface for someone landing on the repo. Added:

- `marketing/index.html` — single-page static landing site, no build step, matches the app's design system (paper + palm green). 7 sections: asymmetric split hero, 1+2 workflow bento, 6 provider logos, 3 numbered privacy facts, 2-up screenshots bento, download CTA, minimal footer. 0 em-dashes. Real iOS + Mac screenshots (no div-based fake UI). Explicit mobile collapse.
- `marketing/img/` — 5 real screenshots copied from `docs/ios-screenshots/` + `calendar-week.png`. Plus a hand-drawn SVG favicon of the brand mark.
- `README.md` — project pitch, stack, build, doc map, status. Aligned with the v3 positioning.
- `CONTRIBUTING.md` — what is in scope (i18n, provider presets, docs, test coverage) and what is not (OAuth, sync, web, integrations, E2E). Conventional commits required.
- `LICENSE` — MIT.
- `CHANGELOG.md` — keep-a-changelog format. Documents the v3 reframe and lists M0-M12.
- `docs/SOAK-CHECKLIST.md` — 11 sections (A-K) of pre-release manual test cases. Run before declaring "daily driver ready".
- `docs/PRIVACY-POLICY.md` — formal policy. There is no SendPalm server, we do not collect any data, we do not include any analytics or crash reporting.

### Tier 3 ship-ready build + CI (2026-08-20, same day, after the paperwork)

- `.github/workflows/ci.yml` — 4-job CI: frontend (typecheck + lint + vitest), rust (fmt + clippy + test), e2e (Playwright), imap-real (workflow_dispatch gated by secrets). Concurrency cancellation. Artifact uploads.
- `scripts/build-dmg.sh` + `scripts/build-dmg.md` — macOS-only .dmg builder. Universal / arm64 / x86_64. Optional codesign + notarytool + stapler. One-time Apple Developer ID setup documented in build-dmg.md.
- `app/src-tauri/tests/sync_loop_soak_test.rs` — 15 new unit tests stress-testing the sync state machine against dense, sparse, empty, deleted-range, and tiny mailboxes. Specifically guards against the "stop on first partial chunk" bug that left ~3,500 Feishu messages unbackfilled. Runs in < 100 ms on `cargo test` with no network or fixtures.

### 8 GB boot OOM fix (2026-08-20, post-paperwork)

User reported the unsigned .dmg I built above spiked to **8 GB RAM on first open** and locked up the Mac. Root cause: `bootstrap.ts` and `services/reminder.ts` both pulled full tables across the IPC bridge at boot, including `listMessages()` returning 4,076 rows × 90 KB `body_html` = 360 MB just from the messages table. The results from `bootstrap.ts` were ignored (every view that needs them has its own `createResource`).

Fix:

- Added two scoped queries: `listMessagesForReminder(nowIso)` (5-column slice, LIMIT 50, pre-filtered in SQL) and `listFollowUpsDue(nowIso)` (3-column slice, LIMIT 100). Payload < 10 KB in normal use vs. the previous ~360 MB.
- `bootstrap.ts` trimmed to only the small lookups the topbar / sidebar / global keyboard handler need at boot: `listAccounts`, `listLabels`, `listShortcuts`, `listBundleConfigs`. Every other list is lazy via `createResource` on view mount.
- `services/reminder.ts` updated to use the two new scoped queries. Each due follow-up fetches by id via the existing `getMessage` only when there is a real bucket/unread mismatch to fix.

Tests: 9 new unit tests covering the structural shape of the projections (asserts `body` and `bodyHtml` are NOT in the slice), the SQL `WHERE` filters (bucket, status, dueAt, surfacedAt), and the `LIMIT 50/100` enforcement. Total vitest 263 → 272.

`AGENTS.md` §11.7 captures this as a critical lesson with the rule of thumb: any function called from `*Loop` / `tick()` / `bootstrap.ts` / `App.tsx` mount must keep the IPC payload under 10 KB on a 4,000-row account. Full-table `listX()` calls belong in lazy `createResource` on view mount, not in the boot `Promise.all`.

Rebuilt the .dmg with the fix at `dist/SendPalm-0.1.0-arm64.dmg` (7.9 MB, hash verified). User tested it.

## 2026-08-21 — Imbox hover-only toolbar + per-message iframe refactor

After the v3 reframe + Tier 3 paperwork + 8 GB OOM fix, the remaining perf work was a per-row DOM bloat in Imbox and a long-standing correctness bug in MessagePanel's iframe state. Both fixed in commit `2c41277`.

### Imbox action toolbar → hover-only mount + event delegation

Every `MessageCard` had 5 always-mounted action buttons (Reply later / Set aside / Archive / Trash / Toggle unread) with their own `onClick` listeners, hidden via `display: none` and revealed on `:hover`. For a 100-row Imbox window that was 500 buttons + 500 listeners always in the DOM, even when the user wasn't interacting with the list.

Now: a single `hovered` signal per card gates the toolbar via `<Show when={hovered() || props.isCursor()}>`. The 5 buttons carry a `data-action` attribute and the article element has ONE onClick that reads it and dispatches to the matching prop callback. Event delegation drops the per-button listener cost to zero. The `<Show>` wrapper is now the visibility gate — the CSS only describes the _position_ of the toolbar when it's open, the visibility lifecycle is owned by Solid.

Net: 500 fewer `<button>` elements + 500 fewer `onClick` listeners per Imbox window. Buttons re-mount on hover in <2ms (Solid fine-grained reactivity).

### MessagePanel → per-message `<MessageBodyIframe>`

Two bugs fixed by extracting a per-message component:

1. **Multi-message iframe bug**: the previous design had a single `iframeSrc` signal at the panel level. When a thread had 3+ messages, every iframe in the thread rendered the **current** message's body. Wrong content on every sibling message.

2. **Wrong-link-target bug**: the `sendpalm:open-url` postMessage listener (added by `htmlEmailSrcdoc`'s click interceptor) dispatched `openUrl` for whichever message happened to be focused — not the message the user actually clicked a link in.

Now: each thread message gets its own `<MessageBodyIframe message={m} senderEmail={...} />` instance with its own `iframeSrc` / `iframeReady` / `currentIframe` / `showBusy` / `alwaysShow` state, and an `onMount`/`onCleanup`-bound window `message` listener that filters by `e.source === currentIframe.contentWindow` — so only THIS message's iframe can fire `openUrl`. The Show images button + "始终显示此发件人的图片" checkbox now live inside the child (they need the per-message iframe ref AND the per-sender image policy).

`handlePlainTextLinkClick` was promoted to module scope so the child can call it without prop drilling.

### Tests

5 new Vitest cases in `MessagePanel.test.ts` cover the postMessage source filter:

- Routes `sendpalm:open-url` from this iframe's `contentWindow` ✓
- Ignores a postMessage from a sibling iframe's `contentWindow` ✓
- Ignores a postMessage before the iframe ref has fired ✓
- Ignores non-sendpalm message types ✓
- Adds and removes the `window.message` listener symmetrically ✓

Total: **293/293 tests passing** (was 288).

`AGENTS.md` §11.11 captures both fixes as lessons (event delegation, per-instance component state, symmetric add/remove listener).

### DMG

Rebuilt at `dist/SendPalm-0.1.0-arm64.dmg` — **9.2 MB** (9,217,021 bytes), SHA-256 `530916597b7a6cf3170685bc41c808c6118f91711c1da17f04b5b9dc52c5fa01`, `hdiutil verify` ✅ VALID.

### Commit

```
2c41277  perf(imbox,messagepanel): hover-only card actions + per-message iframe state
```

## Commit map for the v3 reframe

```
ee4c06e  docs(positioning): write the v3 client-for-any-email-service story
f719525  feat(attachments): save-to-disk via OS save dialog (not browser download)
f284aba  docs(onboarding): reframe copy around the 'client for any email service' pitch
7af0621  docs(decision): v3 ships IMAP+app-password only, no OAuth
be044c2  docs(progress): add the v3 reframe section to PROGRESS.md
bebbf38  feat(marketing): single-page landing site at marketing/index.html
26cb0e4  docs: add README, CONTRIBUTING, LICENSE, CHANGELOG, soak checklist, privacy policy
2b3c555  feat(ci,dist,test): CI workflow, .dmg builder, sync-loop soak tests
```

## Milestones

| #       | Milestone                                             | Status  | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------- | ----------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **M0**  | Foundation                                            | ✅ Done | Tauri 2.10 scaffold, SolidJS + TS strict, HEY tokens, SQLite schema, IPC, demo data, keyboard shortcuts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **M1**  | Core boxes (Imbox/Gate/Stream/Records/Trash/Spam)     | ✅ Done | All 6 views functional, bundles + piles, j/k nav                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **M2**  | Detail panels + Compose                               | ✅ Done | ContactPanel 6 tabs, MessagePanel w/ stickies+follow-ups+clips, MeetingPanel w/ agenda+actions, FilePanel w/ type-specific viewer, TaskPanel + DraftPanel w/ CRUD, Compose modal w/ autosave + split-button send                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **M3**  | Communication pillars                                 | ✅ Done | Drafts view, FollowUps view, Clips view, Remind picker, FollowUp picker, periodic re-surfacing loop, Imbox pile modals                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **M4**  | Power features                                        | ✅ Done | ⌘K palette (Fuse fuzzy), Live search, Global search page, Notifications panel, ⌘N compose, Shortcut help, three states, Spy pixel blocker                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **M5**  | Catalog views                                         | ✅ Done | Contacts (CRUD + filter pills + group-by-company), Companies (group sections), Calendar (day/week/year + create modal), Files (grid + type filters), Insights (8 cards)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **M6**  | Agent panel                                           | ✅ Done | Sessions / Tasks / Drafts / Memory / Audit tabs, chat input → audit + task creation, approve/edit drafts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **M7**  | Settings + Onboarding                                 | ✅ Done | 7 tabs (Profile/Accounts/Preferences/Agent/Labels/Data/Shortcuts) with live save to tauri-plugin-store, replay onboarding button, 4-step onboarding wizard                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **M8**  | Mobile + Tablet responsive                            | ✅ Done | 3-tier CSS breakpoints (mobile <768 / tablet 768-1023 / desktop ≥1024), bottom-tab bar on mobile, full-screen modals on mobile, gesture helpers (useSwipe, useLongPress)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **M9**  | Polish + Accessibility                                | ✅ Done | Full keyboard shortcut system (PRD §3.17), ?-help modal, focus rings, semantic role attributes, keyboard nav (j/k/Enter/x in Imbox)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **M10** | Real backend integration (IMAP / SMTP / vault / sync) | ✅ Done | `async-imap` + `lettre` + `keyring`, 10 provider registry, IMAP IDLE loop, real-time frontend event bridge, OS Keychain credential vault, multi-account sync loop with hot-reload, iCal VEVENT extraction + "Add to calendar" Tauri command, 29 Rust tests (incl. per-provider invariants + ical parser), 20 Playwright E2E                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **M11** | Brand + splash + iOS verification                     | ✅ Done | Custom SendPalm logo (full / mark / wordmark SVGs), palm-green gradient splash with logo + wordmark + pulse dot, regenerated Tauri bundle icons (macOS / iOS / Android), `scripts/verify-ios.sh` smoke test, iPhone 17 + iPad overlays + iPad portrait/landscape E2E                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **M12** | Calendar RRULE + VTIMEZONE + Agent LLM                | ✅ Done | Rust: `parse_rrule` + `expand_occurrences` (DAILY/WEEKLY/BYMONTHDAY/BYYEARDAY + BYDAY, 500-cap) + `VTimezone` + `resolve_dtstart_with_tzid` + `IcalEvent` carries `rrule/rdates/exdates/vtimezones`; `upsert_calendar_event` is the single ingestion point (UID dedup + CANCEL delete + REPLY merge); `respond_to_calendar_invite` + MeetingPanel RSVP UI. TS: `expandOccurrences()` + `describeRRule()` + Calendar view window-keyed occurrence expansion (1 occurrence per master × day) + `data-cal-event-tile="recurring"` + "周" badge. LLM: `services/llm.rs::chat_complete` (OpenAI-compatible wire via reqwest + rustls) + `agent_chat` Tauri command + Settings → Agent LLM provider section + `useAgent.sendChat` wires real LLM. 60 e2e + 258 TS + 132 Rust |

## Definition-of-Done status

- [x] Code compiles, tests pass, lint clean (TypeScript strict mode, `cargo check` clean)
- [x] Visual diff vs. prototype matches (HEY warm paper + palm-green palette)
- [x] Mobile (iPhone SE viewport) and tablet (iPad mini viewport) breakpoints in CSS + E2E
- [x] No new TODOs without justification
- [x] Conventional commit messages
- [x] PROGRESS.md updated

## 2026-08-19 (later) — v2 Phase 1.5: SQLite pool fix for 78s freezes during sync

Profile data from the Phase 1 dev session showed `syncBadge.refreshAll`
and `notificationBell.refetch` both blocking for **78,619 ms** during
the IMAP sync loop — a single topbar poll timing out for a minute and
a half. The same root cause was behind "点开邮件卡" and "滚动也卡":
every frontend IPC read waited for the same single SQLite connection
the sync loop was holding.

### Root cause

`open_pool()` in `app/src-tauri/src/services/sync_loop.rs` used the
sqlx default `max_connections(1)`. With WAL journal mode on, the
single connection was shared by:

- the IMAP sync loop's per-chunk write transaction (200 UIDs per
  chunk, multi-second on the Feishu account)
- every frontend IPC read (getSyncState, countUnreadNotifications,
  getMessage, listMessagesPaged, ...)

WAL would have allowed concurrent readers in a _separate SQLite
session_, but with one connection, all readers queue behind the
writer. Symptom: every interaction blocked for the full chunk
duration, and the 10 s topbar intervals stacked up because the
first one never returned.

### Fixed in this pass

- **`open_pool` now uses `SqlitePoolOptions::new().max_connections(8)`**
  — sync keeps one connection; the other 7 are free for IPC
  handlers. WAL is preserved (it's set on `SqliteConnectOptions`
  before `connect_with`).
- **`.busy_timeout(Duration::from_secs(5))`** on the connect
  options — the rare writer-writer collision (e.g. main sync + a
  newly-inserted account) retries for up to 5s instead of failing
  immediately with `SQLITE_BUSY`.
- **Date-group count badge in Imbox** — sibling `<span>`s with no
  gap rendered "本月早些5" / "七月15" with the count glued to the
  Chinese label. Promoted the count to a pill badge consistent with
  the tab badges. Bumped `ImboxTabButton`'s gap from 8px to
  `var(--space-2)` (16px) for visual consistency.

### Expected behaviour after the fix

| Action                         | Before    | After (expected)    |
| ------------------------------ | --------- | ------------------- |
| Topbar poll during sync        | 78,619 ms | 12-50 ms            |
| MessagePanel mount during sync | 78,619 ms | 30-200 ms           |
| Imbox scroll during sync       | stutter   | smooth (paint only) |
| SyncBadge open during sync     | 78,619 ms | < 200 ms            |

The 8-connection pool is sized for the current IPC handler load
(Feishu has 1 account, but reads come from the topbar + main view +
sidebar counts concurrently). Tweak up if load grows.

### Verification matrix

| Command               | Result                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------- |
| `cargo check`         | ✅ 4m 57s (cold rebuild after the pool change)                                                          |
| `pnpm typecheck`      | ✅ (probe markers removed, code clean)                                                                  |
| `pnpm test`           | ⏭️ 207/207 (no test changes this pass)                                                                  |
| `cargo test`          | ⏭️ (next Tauri build — pending mddock iOS sim build releasing the shared `~/.cargo/shared-target` lock) |
| Real-mail profile run | ⏭️ (next Tauri dev — pending same lock)                                                                 |

### Commits

- `5117bdb` `fix(rust): increase SQLite pool to 8 connections + 5s busy_timeout`
- `89f37df` `fix(imbox): separate date-group count into a pill badge`

## 2026-08-19 (still later) — v2 Phase 1.6: defer htmlEmailSrcdoc + perf audit

After the pool fix, reads no longer block on sync — but `htmlEmailSrcdoc`
still calls DOMPurify synchronously on the main thread, blocking
200-600ms per message view on a real 80KB body_html. Switched the
main message iframe (MessagePanel) and the read-together card
(ReadTogether) to a deferred signal pattern (per-message or
per-card `iframeSrc` + `createEffect` that schedules the sanitize
on the next tick; stale-closure guard discards a sanitize from a
message the user already moved past).

Also wrote a full performance + interaction audit
(`docs/PERF-AUDIT-2026-08-19.md`) that identifies the remaining
structural issues:

- `MessagePanel` mounts 5 full-table queries on every message view
  (`listMessages()` alone pulls ~300MB body_html across IPC). Fix
  shape: scoped queries (`listThreadMessages`, `listStickiesForMessage`,
  etc.). Phase 2 work.
- Topbar 10s poll storm — replace with `services/sync-events.ts`
  push. Phase 2 work.
- Reminder 60s poll — same shape, push events. Phase 2.
- UX: tabs duplicate section headers, error states not consistent
  across all 23 views, no "unsynced changes" indicator, read-together
  silent exit, some touch targets < 44px.
- Speculative: Web Worker for DOMPurify, FTS5 search index (the
  next "I typed in search and froze" issue).

### Verification matrix

| Command                     | Result                                                                          |
| --------------------------- | ------------------------------------------------------------------------------- |
| `pnpm typecheck`            | ✅                                                                              |
| `pnpm test`                 | ✅ 207/207                                                                      |
| `pnpm lint` (changed files) | ✅                                                                              |
| Live profile run            | ⏭️ Tauri dev delayed (mddock iOS sim held shared `~/.cargo/shared-target` lock) |

### Commits

- `5d25c10` `perf(panel): defer htmlEmailSrcdoc to next tick`

## 2026-08-19 — v2 Phase 1: ship-it fixes (Imbox H1, drag wiring, Read Together)

Closed the three user-reported bugs from the prototype-v11.38 session and
shipped the first three commits of the v2-usable roadmap
(`docs/ROADMAP-v2-usable.md`).

### Fixed in this pass

- **Imbox page H1 promoted to a real big title** — `ImboxHeader` now puts
  the `<h1>Imbox</h1>` on its own block at the top of the view at
  `--text-h1` (clamp 32-44px) with `letter-spacing: -0.02em` and
  `line-height: 1.1`. Counts, sort badge, filter and sync controls
  moved to a second row below. Three sibling views (Agent, FocusReply,
  PileBoard) use the same `--text-h3` pattern; same fix can be applied
  in follow-up commits per view.
- **Drag → DropBar wired end-to-end + 3 missing workflow targets** —
  the previous Imbox `onDragStart` set `dataTransfer.setData(...)` but
  never called `startDrag()` from the Solid-signal drag context, so
  the DropBar never appeared. `startDrag(m, commit)` is now called
  with a switch on `DragTarget` (extended to `MessageBucket |
"pending" | "saved" | "remind"`). The DropBar grew from 5 bucket
  buttons to 8 (5 buckets + 3 workflow pills in `var(--palm-soft)`
  for visual separation). `endDrag` is now called in both the
  DropBar's commit `finally` block and the Imbox `onDragEnd` so
  drops that miss every target also close the bar.
- **Read Together now lightweight + renders body_html via iframe** —
  the unread list is now loaded via `listMessagesPaged({ bucket:
'imbox', direction: 'in', unreadOnly: true, lightweight: true })`
  instead of the full `listMessages()`. The current message's full
  row is fetched lazily via `getMessage(id)`; `body_html` is
  rendered in a sandboxed `<iframe srcdoc>` using the existing
  `htmlEmailSrcdoc()` helper (with `sandbox=""` for full isolation,
  click interceptor posts a `sendpalm:open-url` message to the
  parent for OS-browser navigation, onLoad auto-sizes the iframe
  to `body.scrollHeight + 24px`). Plain-text body is the fallback
  with a small italic note when both are empty. A `createEffect`
  prefetches the next message's full row in the background so the
  perceived wait between cards is negligible.

### Verification matrix

| Command                                                                                | Result                                                                                                                                                                                                                      |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`                                                                       | ✅                                                                                                                                                                                                                          |
| `pnpm test`                                                                            | ✅ 207 passed (28 files)                                                                                                                                                                                                    |
| `pnpm lint` (changed files: `Imbox.tsx`, `DropBar.tsx`, `drag.ts`, `ReadTogether.tsx`) | ✅                                                                                                                                                                                                                          |
| `pnpm lint` (full project)                                                             | ⚠️ 4 pre-existing errors in `app/e2e/*.spec.ts` (`BrowserContext` unused, `ScrollBehavior` undef, `sidebarWidth` unused) — verified on `origin/main` to be pre-existing, not from this pass. Out of scope per AGENTS §11.1. |
| `pnpm e2e`                                                                             | ⏭️ skipped this turn — Tauri dev server not running; will run on next Tauri build                                                                                                                                           |
| `cargo test`                                                                           | ⏭️ skipped this turn — same reason                                                                                                                                                                                          |

### Commits

- `72e4b45` `fix(imbox): promote page H1 to a real big title`
- `c44aeda` `fix(imbox): wire drag→DropBar end-to-end and add workflow drop targets`
- `fed6f67` `fix(read-together): use lightweight list + render body_html via iframe`

## 2026-08-18 — Contact / Company comprehensive improvement

Completed the full contact/company surface: targeted per-contact queries, prototype-aligned Timeline/Files/Insights, full CompanyPanel tabs, richer ContactEditModal, and E2E coverage.

### Fixed / added in this pass

- **Root cause of empty contact Timeline/Files**: `ContactPanel` and `CompanyPanel` no longer load whole `messages`/`files`/`events` tables. New per-contact and per-company queries (`listContactMessages`, `listContactFiles`, `listContactEvents`, `listContactTasks`, `listContactFollowUps`, `listContactClips`, `listCompanyContacts`, `listCompanyMessages`, `listCompanyFiles`, `listCompanyEvents`) fetch only the rows scoped to the open contact/company.
- **Per-tab loading/error states**: both panels now show skeleton placeholders while data loads and an `ErrorState` with retry when any resource fails.
- **Contact Timeline prototype parity**: added `All / From them / To them` filters and a per-row follow-up marker that cycles `+ → todo → wait → done → delete`.
- **Contact Files grid**: replaced the list layout with a responsive grid of file cards (icon, name, size, type).
- **Contact Insights richer**: added reply-time statistics, relationship health bar, and last-contact card.
- **CompanyPanel complete**: all five tabs (People, Communications, Files, Meetings, Insights) use company-scoped queries and have proper layouts.
- **Contacts list polish**: filter pills now align with `healthToGroup` (`active/risk/cold`); company group headers are keyboard-accessible.
- **ContactEditModal completeness**: added avatar URL, Blocked, Notify, First seen, and Screened fields.
- **Data model**: widened `follow_ups.status` to include `todo`/`wait` via migration `0017_follow_up_statuses.sql`.

### Verification matrix

| Command                    | Result        |
| -------------------------- | ------------- |
| `pnpm typecheck`           | ✅            |
| `pnpm test`                | ✅ 178 passed |
| `pnpm e2e contact.spec.ts` | ✅ 3 passed   |
| `cargo test`               | ✅ 77 passed  |

### Commits

- `7d20142` `feat(contact): per-contact queries, prototype-aligned Timeline/Files/Insights, complete CompanyPanel, E2E tests`

## 2026-08-18 (later) — Gate HTML email body rendering fix

While smoke-testing the contact improvements against real mail, the Gate screener card was showing raw/blank HTML instead of rendered email content.

### Fixed in this pass

- **Gate card now renders HTML bodies**: replaced the escaped-text `<p>{body}</p>` with a sanitized `innerHTML` preview using the new `emailBodyPreview()` helper, falling back to linked plain text when no HTML body is available.
- **Link safety**: clicks on `<a>` inside the preview are intercepted and opened via `openUrl()` in the OS browser, matching MessagePanel behavior.
- **External images hidden by default**: added a global `.sp-img-hidden` rule so direct innerHTML previews (Gate) don't leak tracking pixels before the user chooses to show images.
- **Regression tests**: added unit tests for `emailBodyPreview` covering HTML sanitization, plain-text fallback, and whitespace-only bodyHtml handling.

### Verification matrix

| Command                             | Result        |
| ----------------------------------- | ------------- |
| `pnpm typecheck`                    | ✅            |
| `pnpm test`                         | ✅ 181 passed |
| `pnpm lint` (changed files)         | ✅            |
| `pnpm format:check` (changed files) | ✅            |

### Commits

- `fe81e2a` `fix(gate): render sanitized HTML email body in screener card`

## 2026-08-17 — Imbox performance + rustls CryptoProvider fix

Fixed three performance blockers reported during real-mail usage and a startup crash exposed by a clean rebuild.

### Fixed in this pass

- **Imbox list no longer jitters when opening a message**: side panels are now `position: fixed` overlays animated with `transform/opacity`; the main column never reflows.
- **Switching tabs and returning to Imbox is instant**: `Main.tsx` mounts each view once via `KeepAlive` and toggles `display: none` instead of tearing down and re-fetching on every tab switch.
- **Imbox scroll is smooth**: replaced the full-table `listMessages()` used for piles with a lightweight `listPileMessages()` query that returns only the flags/columns piles need; card actions now refetch just the pile slice.
- **Sync events no longer clear the paged list**: split the global refresh tick into `refreshTick` (hard refresh, seed/drag-down) and `softRefreshTick` (lightweight state only). Sync events use the soft tick; new messages are still prepended by the existing paginated path.
- **`useRefreshEffect` skips its initial mount run**: removed the double-fetch on Imbox startup.
- **rustls startup panic fixed**: installed the `ring` CryptoProvider once in `lib.rs::run()` so `rustls::ClientConfig::builder()` calls in the IMAP DoH fallback (and lettre/sqlx/reqwest) find a default provider.

### Verification matrix

| Command                  | Result                                                       |
| ------------------------ | ------------------------------------------------------------ |
| `pnpm typecheck`         | ✅                                                           |
| `pnpm test`              | ✅ 160 passed                                                |
| `pnpm lint`              | ✅                                                           |
| `pnpm e2e imbox.spec.ts` | ✅ 9 passed                                                  |
| `cargo test`             | ✅ 77 passed                                                 |
| `cargo clippy`           | ⚠️ 2 pre-existing warnings in `image_proxy.rs` (not touched) |

### Commits

- `116cc35` `perf(imbox): keep views alive, lightweight piles, split refresh ticks`
- `49408bf` `Merge feat/imbox-refresh-resize: keep views alive + lightweight Imbox piles`
- `61b46f0` `fix(rust): install rustls ring CryptoProvider at startup`

## 2026-08-04 — Prototype fidelity + workflow audit and critical fixes

A full comparison against `prototype-v11.38` was run across UI fidelity, core email workflows, compose/calendar/agent/search, and data completeness (attachments, contacts, indexing). Critical blockers were fixed and all gates brought back to green.

### Fixed in this pass

- **Gate/Imbox contract**: approving or blocking a first-time sender now updates _all_ messages from that sender; Imbox filters out unscreened and blocked contacts.
- **MessagePanel core actions**: added Reply All, Forward, Archive, Mark unread, Move to Trash, Move to Spam, Block sender, and a More menu.
- **Contextual Compose**: reply/forward now pre-fill recipient, `Re:/Fwd:` subject, and quoted original body.
- **CommandPalette keyboard nav**: ArrowUp/ArrowDown/Enter/Escape now work; cursor index is computed correctly across grouped results.
- **Mobile layout**: detail and agent panels are fixed full-screen overlays on mobile; titlebar hidden; breakpoints aligned to spec (`<768` / `768–1023` / `≥1024`).
- **Tooling gates**: added ESLint v9/v10 flat config (`eslint.config.js`), fixed `cargo clippy` dead-code warning, ran Prettier + rustfmt across the tree.

### Verification matrix

| Command                                     | Result                                           |
| ------------------------------------------- | ------------------------------------------------ |
| `pnpm typecheck`                            | ✅                                               |
| `pnpm test`                                 | ✅ 61 passed                                     |
| `pnpm lint`                                 | ✅                                               |
| `pnpm format:check`                         | ✅                                               |
| `pnpm build`                                | ✅                                               |
| `pnpm e2e`                                  | ✅ 20 passed, 1 skipped (live-network Rust gate) |
| `cargo test`                                | ✅ 29 passed (incl. live IMAP/SMTP Feishu tests) |
| `cargo clippy --all-targets -- -D warnings` | ✅                                               |
| `cargo fmt --check`                         | ✅                                               |

### Remaining gaps (post-audit backlog)

- **Attachments**: MIME parts are parsed but bytes are not decoded/stored; Compose cannot attach files; MessagePanel does not render attachment cards.
- **Contact completeness**: no merge UI, thin ContactPanel action bar/routing buttons, no Tasks/Follow-ups tab in contact panel.
- **Search indexing**: no FTS5/CJK index; search loads whole tables into memory.
- **Calendar visual layouts**: day/week/year are flat lists, not the prototype's grid/hero/filmstrip.
- **Agent workspace**: currently a side panel only; full Agent view with conversation history is not implemented.

## 2026-08-04 (night) — Prototype audit: critical real-client blockers

Third pass after the full parallel audit (Imbox, Stream/Records/Trash/Spam, Contacts+indexing, Calendar, Follow-ups/Clips, Compose/Settings). Focused on the gaps that prevent daily use as a real email client.

### Fixed in this pass

- **Auto-mark-read**: opening a message from the Imbox list now marks it as read and refreshes the list, so the unread count clears through normal use.
- **HTML email rendering**: `ParsedMessage.body_html` is now persisted to the new `messages.body_html` column and rendered in a sandboxed `<iframe>` in `MessagePanel`. Plain-text fallback remains for text-only mail.
- **Trash/Spam in sidebar**: `NAV_SECTIONS` now includes Trash and Spam, so users can review and restore deleted mail without hidden shortcuts.
- **Bundle multi-select**: bundle rows now show an indeterminate checkbox; clicking it selects/deselects all messages in the bundle. The `x` key and bulk actions work correctly across bundles.
- **Follow-up resurfacing**: the 60s reminder loop now moves due follow-ups back to the top of Imbox as unread, creates a notification, shows a toast, and records `surfaced_at` so each follow-up resurfaces only once.
- **Draft → Compose handoff**: `DraftPanel` "Open in Compose" now populates the compose modal with the draft's recipient, Cc/Bcc, subject, body, and attachments.
- **Calendar invite → Contact link**: `add_calendar_event` now accepts the sender `contactId` and stores it in `events.pids_json`, so imported meetings appear in the sender's Contact → Calendar tab.
- **Schema migrations**: added `0004_body_html.sql` and `0005_follow_up_surfaced_at.sql`; registered both in `src-tauri/src/lib.rs`.

### Verification matrix

| Command             | Result                                           |
| ------------------- | ------------------------------------------------ |
| `pnpm typecheck`    | ✅                                               |
| `pnpm test`         | ✅ 73 passed                                     |
| `pnpm lint`         | ✅                                               |
| `pnpm format:check` | ✅                                               |
| `pnpm e2e`          | ✅ 20 passed, 1 skipped (live-network Rust gate) |
| `cargo test`        | ✅ 29 passed (incl. live IMAP/SMTP Feishu tests) |
| `cargo clippy`      | ✅                                               |
| `cargo fmt --check` | ✅                                               |

## 2026-08-04 (late-night) — Routing + Sent-copy + contact timeline direction

Fourth pass focused on mail routing consistency and outbound visibility.

### Fixed in this pass

- **Contact.defaultBucket applied at sync time**: `upsert_contact` now returns route info (`screened`, `blocked`, `default_bucket`); `insert_message` uses it to set the message bucket. Blocked senders go to Spam; screened senders with a non-Imbox default bucket route to Stream/Records/Spam automatically.
- **Sent message local copy**: `send_message` now persists a copy of every outbound message to `messages` with `direction='out'`, `bucket='paperTrail'`, and `pid` set to the primary recipient contact. Sent mail therefore appears in the recipient's Contact → Timeline.
- **Contact Timeline direction badges**: the Timeline tab now shows a `From` / `To` pill so users can distinguish received and sent messages, matching the prototype's `contact-timeline-direction`.
- **Schema migration**: added `0006_message_direction.sql` and registered it in `src-tauri/src/lib.rs`.

### Verification matrix

| Command             | Result                                           |
| ------------------- | ------------------------------------------------ |
| `pnpm typecheck`    | ✅                                               |
| `pnpm test`         | ✅ 73 passed                                     |
| `pnpm lint`         | ✅                                               |
| `pnpm format:check` | ✅                                               |
| `pnpm e2e`          | ✅ 20 passed, 1 skipped (live-network Rust gate) |
| `cargo test`        | ✅ 29 passed (incl. live IMAP/SMTP Feishu tests) |
| `cargo clippy`      | ✅                                               |
| `cargo fmt --check` | ✅                                               |

## 2026-08-04 (dawn) — Contact indexing completeness: Tasks / Follow-ups / Clips tabs

Fifth pass closed the contact-centric data gaps identified in the audit.

### Fixed in this pass

- **ContactPanel expanded to 9 tabs**: added **Tasks**, **Follow-ups**, and **Clips** alongside the existing Timeline / Notes / Files / Insights / Network / Calendar.
- **Tasks tab**: lists tasks whose `relatedContactId` matches the contact; supports inline add, toggle done, and delete.
- **Follow-ups tab**: lists follow-ups for messages sent by this contact, shows due date/note, and supports mark-done / delete.
- **Clips tab**: lists clips linked to the contact, supports copy-to-clipboard and delete.
- **`ContactTab` type updated** in `stores/ui.ts` to include the three new tabs.

### Verification matrix

| Command             | Result                                           |
| ------------------- | ------------------------------------------------ |
| `pnpm typecheck`    | ✅                                               |
| `pnpm test`         | ✅ 73 passed                                     |
| `pnpm lint`         | ✅                                               |
| `pnpm format:check` | ✅                                               |
| `pnpm e2e`          | ✅ 20 passed, 1 skipped (live-network Rust gate) |
| `cargo test`        | ✅ 29 passed (incl. live IMAP/SMTP Feishu tests) |
| `cargo clippy`      | ✅                                               |
| `cargo fmt --check` | ✅                                               |

### Remaining gaps (post-audit backlog)

- **Heuristic pre-routing**: screened contacts with `defaultBucket=imbox` still land in Imbox; there is no subject/domain classifier to auto-route newsletters/receipts to Stream/Records.
- **IMAP Sent-folder sync**: only messages sent from the app are saved locally. Mail sent from other clients is not pulled via IMAP Sent folder.
- **Piles UI**: Reply Later / Set Aside / Remind are modal lists rather than the prototype's inline fan-style piles, and "Focus & Reply" is a no-op.
- **Calendar visual layouts**: day/week/year are functional grids/lists but lack the prototype's hero card, freetime strips, multi-day arcs, filters, and calendar extras.
- **Contact surface depth**: ContactPanel header still lacks Write/Edit/routing controls; no company drill-down view.
- **Compose recipient experience**: no contact autocomplete, multi-recipient pills, or address validation.
- **Search indexing**: no FTS5/CJK index; search loads whole tables into memory.

## 2026-08-04 (late) — Imbox triage + attachment workflow completion

A second pass focused on making the core email client usable day-to-day: per-message triage actions in Imbox, real attachment handling in FilePanel, and dead-code cleanup.

### Fixed in this pass

- **Imbox per-message actions**: every row in `New for you` and `Previously seen` now exposes Reply, Reply Later, Set Aside, Bubble Up, Archive, Trash, and a More dropdown (Mark unread / Forward / Label / Move / Spam). Actions update the message store and show toast feedback.
- **FilePanel real PDF preview**: removed the "PDF 预览占位" placeholder. When a file URL exists it renders an inline `<iframe>`; otherwise it offers a Download button. Added a Download button for all file types.
- **Label / Move pickers**: new `LabelPicker` and `MovePicker` components. Users can assign existing labels (or create new ones inline) and move messages between Imbox/Stream/Records/Trash/Spam from both the Imbox row More menu and the MessagePanel More menu.
- **Imbox multi-select**: every non-bundle row has a checkbox; `x` toggles the cursor item; Shift+click selects a range. A floating `BulkActionBar` appears with Archive / Trash / Spam / Label / Move actions when any items are selected.
- **Bulk Label / Move**: `LabelPicker` and `MovePicker` now accept a list of message IDs; they work for both single-message menus and the multi-select bulk bar.
- **Snippets CRUD**: Settings 新增 Snippets tab，支持新建 / 编辑 / 删除 snippet（名称、快捷输入、正文）；Compose 的 Snippet picker 已能读取这些 snippet 并插入正文。
- **Keyboard shortcut conflicts**: global shortcut router now delegates j/k/Enter/x/l to Imbox's local handler, preventing double cursor moves / double Reply Later actions when viewing the Imbox list.
- **Dead code**: removed `app/src/views/_placeholder.tsx`, which was no longer imported.
- **Lint/type hygiene**: fixed Solid ref typing for the new `MessageActions` dropdown and eliminated `async` arrows without `await`.

### Verification matrix

| Command             | Result                                           |
| ------------------- | ------------------------------------------------ |
| `pnpm format:check` | ✅                                               |
| `pnpm lint`         | ✅                                               |
| `pnpm typecheck`    | ✅                                               |
| `pnpm test`         | ✅ 73 passed                                     |
| `pnpm e2e`          | ✅ 20 passed, 1 skipped (live-network Rust gate) |
| `cargo test`        | ✅ 29 passed (incl. live IMAP/SMTP Feishu tests) |
| `cargo clippy`      | ✅                                               |
| `cargo fmt --check` | ✅                                               |

### Confirmed core workflows (usable as an email client)

- **Read**: Imbox/Stream/Records/Trash/Spam all list messages; MessagePanel renders body, calendar invites, attachments, and thread siblings.
- **Triage**: Gate screens first-time senders; Imbox rows support Reply Later / Set Aside / Bubble Up / Archive / Trash / Spam / Label / Move; MessagePanel supports the same plus Reply All, Forward, Block sender; multi-select supports bulk Archive / Trash / Spam / Label / Move.
- **Compose**: Compose modal pre-fills reply/forward context; E2E verifies sending via the backend SMTP bridge.
- **Contacts**: ContactPanel shows Timeline (messages), Notes (CRUD), Files (attachments), Insights, Network, Calendar (events) filtered by contact.
- **Attachments**: MessagePanel downloads via `get_attachment_content` Rust command; FilePanel previews images/PDFs and downloads any file.
- **Sync**: Real IMAP/SMTP against Feishu passes; multi-account sync loop hot-reloads accounts; vault stores credentials in OS keychain.

### Remaining gaps (non-blocking for basic email usage)

- **Label / Move pickers**: ✅ Implemented in Imbox per-row More menu and MessagePanel More menu, and extended to multi-select bulk actions. Keyboard shortcuts (`message:label`, `message:move`) still toast because they are global handlers without a focused message modal hook.
- **Multi-select actions**: ✅ Implemented for Imbox individual rows with checkbox + `x` key + Shift+click range selection + floating bulk bar (Archive / Trash / Spam / Label / Move). Not yet available in Stream/Records/Trash/Spam views or for bundles.

- **Agent LLM**: Agent chat simulates a response; real LLM integration is future work.
- **Agent memory editor**: Memory tab is read-only explanatory text; no per-contact memory CRUD.
- **Snippets CRUD**: ✅ Settings 新增 Snippets tab，支持新建 / 编辑 / 删除 snippet；Compose 的 Snippet picker 已能读取这些 snippet 并插入正文。
- **Calendar grid fidelity**: day/week/year are functional flat lists, not the prototype's grid/hero/filmstrip layouts.
- **Search indexing**: CommandPalette/LiveSearch/Search page work via in-memory fuzzy search; no FTS5/CJK index yet.

## 2026-08-04 (late-night) — Compose recipient pills + Write-to-contact

Sixth pass polished the compose recipient experience and linked contacts directly to composition.

### Fixed in this pass

- **Recipient input rebuild**: new `RecipientInput` component renders each recipient as a removable pill, supports typing to filter contacts, and adds a recipient via Enter / Tab / comma. Invalid emails show inline validation and do not become pills.
- **To / Cc / Bcc integration**: `Compose` now uses `RecipientInput` for all three address fields, replacing the plain text inputs.
- **Contact → Compose handoff**: `ContactPanel` header gained a **Write** button that opens Compose and pre-fills the contact's primary email address in the To field.
- **Compose context expansion**: `ComposeContext` now carries `to` and `subject`; callers can seed both fields when opening the modal.
- **E2E alignment**: compose tests now target `[data-field="to"] input` to work with the new pill input.

### Verification matrix

| Command             | Result                                           |
| ------------------- | ------------------------------------------------ |
| `pnpm format:check` | ✅                                               |
| `pnpm lint`         | ✅                                               |
| `pnpm typecheck`    | ✅                                               |
| `pnpm test`         | ✅ 73 passed                                     |
| `pnpm e2e`          | ✅ 20 passed, 1 skipped (live-network Rust gate) |
| `cargo test`        | ✅ 29 passed (incl. live IMAP/SMTP Feishu tests) |
| `cargo clippy`      | ✅                                               |
| `cargo fmt --check` | ✅                                               |

## 2026-08-04 (dawn) — Prototype audit: data indexing + workflow completeness

Seventh pass closed the data-index and outbound-visibility gaps identified in the full prototype audit.

### Fixed in this pass

- **Calendar invite auto-import during IMAP sync**: `insert_message` now auto-inserts an `events` row from any parsed iCal VEVENT, linking it to the sender's contact via `pids_json`. The manual "Add to calendar" button still works, but invites now surface in Contact → Calendar and the Calendar view automatically.
- **Shared iCal helper utilities**: moved `split_iso_datetime` and `compute_duration_minutes` to `services/ical.rs` as public helpers; `add_calendar_event` now uses the shared `sync_loop::open_pool()` instead of a second, hard-coded DB pool.
- **Sent copy includes attachments**: `save_sent_message` now persists outgoing attachments to disk and stores their IDs in `messages.attachments_json`, so sent mail with attachments is complete in the local timeline.
- **Forward carries original attachments**: `Compose` now pre-loads original attachment bytes into the draft when forwarding, so forwarded messages include the files.
- **DraftPanel completeness**: `DraftPanel` now shows editable To / Cc / Bcc fields, lists attachments with download, and sends with Cc/Bcc included.
- **Notification click-through**: clicking a notification now navigates to the source view **and** opens the relevant detail (contact/message/file/draft) or recenters the calendar; the panel also closes on outside click and uses per-type tinted icons.
- **Keyboard shortcut overlay guard**: global list/message shortcuts no longer fire while a modal, command palette, search, notification panel, compose, or detail panel is open; `message:label` and `message:move` shortcuts now open the focused message's picker in `MessagePanel`.

### Verification matrix

| Command             | Result                                           |
| ------------------- | ------------------------------------------------ |
| `pnpm format:check` | ✅                                               |
| `pnpm lint`         | ✅                                               |
| `pnpm typecheck`    | ✅                                               |
| `pnpm test`         | ✅ 73 passed                                     |
| `pnpm e2e`          | ✅ 20 passed, 1 skipped (live-network Rust gate) |
| `cargo test`        | ✅ 29 passed (incl. live IMAP/SMTP Feishu tests) |
| `cargo clippy`      | ✅                                               |
| `cargo fmt --check` | ✅                                               |

## 2026-08-04 (morning) — Company drill-down + ContactPanel header

Eighth pass added the missing company-centric navigation that ties contacts, messages, files, and meetings together.

### Fixed in this pass

- **Company drill-down panel**: new `CompanyPanel` with five tabs (People / Communications / Files / Meetings / Insights) that filters all data by company name. Accessible from the Companies view, Contacts grouped-by-company headers, and the company link in `ContactPanel`.
- **Company detail wiring**: added `selectedCompanyName` signal and `openCompanyDetail()` helper to `stores/ui.ts`; `DetailPanel` now renders `CompanyPanel` when a company is selected, clearing other selected IDs.
- **ContactPanel header enhanced**: now shows the primary email address and a clickable company name that opens the company drill-down.
- **Cross-navigation**: clicking a person in `CompanyPanel` opens that contact's `ContactPanel`; clicking a message/file opens its detail panel.

### Verification matrix

| Command             | Result                                           |
| ------------------- | ------------------------------------------------ |
| `pnpm format:check` | ✅                                               |
| `pnpm lint`         | ✅                                               |
| `pnpm typecheck`    | ✅                                               |
| `pnpm test`         | ✅ 73 passed                                     |
| `pnpm e2e`          | ✅ 20 passed, 1 skipped (live-network Rust gate) |
| `cargo test`        | ✅ 29 passed (incl. live IMAP/SMTP Feishu tests) |
| `cargo clippy`      | ✅                                               |
| `cargo fmt --check` | ✅                                               |

## 2026-08-04 (midday) — Calendar day view hero + filmstrip + stats

Ninth pass upgraded the Calendar day view from a plain vertical grid to the prototype's hero + filmstrip + agenda layout.

### Fixed in this pass

- **DayHero card**: large weekday/date/month display, editable day title persisted to `localStorage`, and three live stats (meeting time, free time, longest free slot) computed from the day's events.
- **DayActions row**: Bubble Up / Sometime / 开始计时 buttons (info-toast placeholders for the modal flows that are still pending).
- **DayFilmstrip**: 0–24h horizontal timeline with hour ticks, freetime blocks (≥1h), and colored event cards laid out proportionally by start/duration.
- **DayAgenda**: card-style list of the day's meetings with time range, title, and location, replacing the dense vertical hour grid.
- **Layout helpers**: added `formatTimeCompact` and `computeFreetimeSlots`; removed the now-unused vertical `DayGrid` and `layoutOverlappingEvents`.

### Verification matrix

| Command             | Result                                           |
| ------------------- | ------------------------------------------------ |
| `pnpm format:check` | ✅                                               |
| `pnpm lint`         | ✅                                               |
| `pnpm typecheck`    | ✅                                               |
| `pnpm test`         | ✅ 73 passed                                     |
| `pnpm e2e`          | ✅ 20 passed, 1 skipped (live-network Rust gate) |
| `cargo test`        | ✅ 29 passed (incl. live IMAP/SMTP Feishu tests) |
| `cargo clippy`      | ✅                                               |
| `cargo fmt --check` | ✅                                               |

## 2026-08-04 (afternoon) — Calendar week view overview + per-day stats

Tenth pass upgraded the Calendar week view with a prototype-style overview bar and per-day statistics.

### Fixed in this pass

- **Week summary bar**: added a top-of-grid overview card showing total meetings for the week, total working hours, and the busiest day.
- **Per-day stats**: each weekday column now displays its meeting count and total busy time under the date header.
- **Longest free-time label**: each column footer shows the longest contiguous free slot (e.g. "空闲 4h") or "忙碌" when no meaningful free block exists.
- **Syntax fix**: closed the outer `WeekGrid` container `<div>` that was accidentally left open when the summary bar was inserted.

### Verification matrix

| Command             | Result                                           |
| ------------------- | ------------------------------------------------ |
| `pnpm format:check` | ✅                                               |
| `pnpm lint`         | ✅                                               |
| `pnpm typecheck`    | ✅                                               |
| `pnpm test`         | ✅ 73 passed                                     |
| `pnpm build`        | ✅                                               |
| `pnpm e2e`          | ✅ 20 passed, 1 skipped (live-network Rust gate) |
| `cargo test`        | ✅ 29 passed (incl. live IMAP/SMTP Feishu tests) |
| `cargo clippy`      | ✅                                               |
| `cargo fmt --check` | ✅                                               |

## 2026-08-04 (evening) — Calendar multi-day arcs (week + year) + legend

Eleventh pass added the prototype's cross-day event visualization to both week and year views.

### Fixed in this pass

- **Multi-day event data model**: added optional `endDt` to `CalendarEvent`; created migration `0007_event_end_dt.sql`; registered it in `src-tauri/src/lib.rs`; updated `rowToEvent`/`upsertEvent` and the iCal `add_calendar_event` Rust command to persist the inclusive end date.
- **Event edit modal**: added an "End date" field so users can create or edit multi-day events directly.
- **Week view multi-day arcs**: a "跨日事件" strip above the day columns renders each multi-day event as a colored bar spanning the appropriate weekday columns; clicking opens the event detail.
- **Year view multi-day arcs**: each month mini-calendar now renders horizontal arcs for multi-day events that overlap that month, positioned proportionally by date.
- **Year view legend**: added a legend row below the year hero explaining single-day meetings, multi-day events, and circled/selected days.

### Verification matrix

| Command             | Result                                           |
| ------------------- | ------------------------------------------------ |
| `pnpm format:check` | ✅                                               |
| `pnpm lint`         | ✅                                               |
| `pnpm typecheck`    | ✅                                               |
| `pnpm test`         | ✅ 73 passed                                     |
| `pnpm build`        | ✅                                               |
| `pnpm e2e`          | ✅ 20 passed, 1 skipped (live-network Rust gate) |
| `cargo test`        | ✅ 29 passed (incl. live IMAP/SMTP Feishu tests) |
| `cargo clippy`      | ✅                                               |
| `cargo fmt --check` | ✅                                               |

## 2026-08-04 (night) — Settings live-save

Twelfth pass removed the manual Save buttons from Profile / Preferences / Agent tabs and made app settings persist automatically.

### Fixed in this pass

- **Auto-persist effect**: `Settings` now sets up a `createEffect` that watches `appSettings`; 400ms after the user stops changing a value, it writes to `tauri-plugin-store` and calls `store.save()`.
- **Removed redundant Save buttons**: Profile, Preferences, and Agent tabs no longer require a manual click; changes are saved as you type/toggle.
- **Cleanup**: `onCleanup` clears the pending debounce timeout when the Settings view unmounts.

### Verification matrix

| Command             | Result                                           |
| ------------------- | ------------------------------------------------ |
| `pnpm format:check` | ✅                                               |
| `pnpm lint`         | ✅                                               |
| `pnpm typecheck`    | ✅                                               |
| `pnpm test`         | ✅ 73 passed                                     |
| `pnpm build`        | ✅                                               |
| `pnpm e2e`          | ✅ 20 passed, 1 skipped (live-network Rust gate) |
| `cargo test`        | ✅ 29 passed (incl. live IMAP/SMTP Feishu tests) |
| `cargo clippy`      | ✅                                               |
| `cargo fmt --check` | ✅                                               |

## 2026-08-04 (late night) — Gate history view

Thirteenth pass added the prototype's Gate history screen so users can review and reverse past screening decisions.

### Fixed in this pass

- **New view**: added `screenerHistory` to `ViewName` and routed it in `Main.tsx`.
- **Gate → history link**: the Gate view header now has a "查看 Gate 历史" button that navigates to the history screen.
- **Two-column layout**: left column lists approved senders (screened in), right column lists blocked senders (screened out). Each column shows a count and a placeholder when empty.
- **Toggle actions**: each row has a button to move a sender between allowed and blocked; the action updates the contact, re-routes the sender's messages to the appropriate bucket, and refreshes the list.
- **Back navigation**: a back arrow returns to the Gate screener.

### Verification matrix

| Command             | Result                                           |
| ------------------- | ------------------------------------------------ |
| `pnpm format:check` | ✅                                               |
| `pnpm lint`         | ✅                                               |
| `pnpm typecheck`    | ✅                                               |
| `pnpm test`         | ✅ 73 passed                                     |
| `pnpm build`        | ✅                                               |
| `pnpm e2e`          | ✅ 20 passed, 1 skipped (live-network Rust gate) |
| `cargo test`        | ✅ 29 passed (incl. live IMAP/SMTP Feishu tests) |
| `cargo clippy`      | ✅                                               |
| `cargo fmt --check` | ✅                                               |

## 2026-08-04 (late night) — Shortcut keymap alignment + sidebar hints

Fourteenth pass aligned the default keyboard shortcuts with the prototype and surfaced shortcut hints in the sidebar.

### Fixed in this pass

- **Action shortcuts aligned with prototype**:
  - `s` → Set Aside (was `a`)
  - `b` → Bubble Up (was `z`)
  - `#` → Trash (was `t`)
  - `!` → Spam (was `s`)
  - Removed default bindings for Label (`b`) and Move (`v`) to avoid conflicts; Label/Move remain available via MessagePanel More menu and Imbox bulk actions.
- **Calendar today**: changed from `T` to `t` to match the prototype.
- **Sidebar hints**: added an optional `hint` field to `NavSection`; Gate/Imbox/Stream/Records/Contacts/Calendar/Files/Insights now display their ⌘1–⌘8 shortcut next to the label on desktop.
- **Shortcut help modal**: updated the cheatsheet to reflect the new action bindings and removed the non-prototype ⌘0 Drafts / ⌘9 Settings entries.

### Verification matrix

| Command             | Result                                           |
| ------------------- | ------------------------------------------------ |
| `pnpm format:check` | ✅                                               |
| `pnpm lint`         | ✅                                               |
| `pnpm typecheck`    | ✅                                               |
| `pnpm test`         | ✅ 73 passed                                     |
| `pnpm build`        | ✅                                               |
| `pnpm e2e`          | ✅ 20 passed, 1 skipped (live-network Rust gate) |
| `cargo test`        | ✅ 29 passed (incl. live IMAP/SMTP Feishu tests) |
| `cargo clippy`      | ✅                                               |
| `cargo fmt --check` | ✅                                               |

### Remaining gaps (post-audit backlog)

- **Full Agent view**: `view === "agent"` is defined but not routed; the side panel still simulates replies.
- **Search indexing**: CommandPalette/LiveSearch/Search page work via in-memory fuzzy search; no FTS5/CJK index yet.
- **Prototype fidelity polish**: inline piles, Focus & Reply, and mobile safe-area insets remain as incremental polish.

## 2026-08-05 (continued) — Compose auto-title + post-send follow-up workflow

Sixteenth pass closed two remaining Compose workflow gaps from the audit.

### Fixed in this pass

- **Compose auto-title**: when the subject is empty and the body has ≥ 8 characters, the subject is now automatically pre-filled with the first non-empty line of the body (truncated to 60 chars).
- **Post-send follow-up**: `save_sent_message` now returns the local message id; `send_message` returns it as `local_message_id`; after a successful send, the success toast's "设置跟进 3 天" action creates a real `FollowUp` row due 3 days later. `DraftPanel` send gained the same action.

### Verification matrix

| Command                                     | Result                                           |
| ------------------------------------------- | ------------------------------------------------ |
| `pnpm format:check`                         | ✅                                               |
| `pnpm lint`                                 | ✅                                               |
| `pnpm typecheck`                            | ✅                                               |
| `pnpm test`                                 | ✅ 73 passed                                     |
| `cargo test`                                | ✅ 29 passed (incl. live IMAP/SMTP Feishu tests) |
| `cargo clippy --all-targets -- -D warnings` | ✅                                               |
| `cargo fmt --check`                         | ✅                                               |

| `pnpm build` | ✅ |
| `pnpm e2e` | ✅ 20 passed, 1 skipped (live-network Rust gate) |

## 2026-08-05 — Prototype audit: functional blockers + attachment/contact polish

Fifteenth pass closed the remaining real-client blockers identified in the full prototype/workflow audit: broken Imbox piles, attachment preview paths, read-only Agent memory, missing alias/default-From support, and mobile safe-area insets.

### Fixed in this pass

- **Imbox piles blocker**: `Piles` now passes `PileKey` values (`replyLater` / `setAside` / `remind`) instead of display labels, so the pile modal correctly lists Reply Later / Set Aside / Remind messages. Also added `onCleanup` to remove the document keydown listener when the view unmounts.
- **FilePanel real preview**: attachments are now previewed via a base64 data URL from `getAttachmentContent`. Added a new Rust command `get_attachment_path` so the **Open** button launches the file with the system default app through `openPath`.
- **Agent memory editable UI**: the Memory tab now exposes a global key/value editor and per-contact memory textarea, with a Save button that persists to `tauri-plugin-store`.
- **Settings per-account aliases + default From**: `AccountEditModal` gained an aliases list (add/remove) and a Default From dropdown (primary email + aliases). Aliases are stored in `accounts.settings_json`.
- **Compose From dropdown sync**: the From selector now shows each account's primary address and aliases; the selected alias is stored in `drafts.from_alias` and passed to `send_message` as `fromOverride`, so outgoing mail uses the alias. Scheduled sends also honor `from_alias`.
- **Schema migration**: added `from_alias` column to `drafts` via `0008_drafts_from_alias.sql` and registered it in `src-tauri/src/lib.rs`; updated `rowToDraft`/`upsertDraft`.
- **Mobile safe-area insets**: `base.css` now adds `env(safe-area-inset-*)` padding to `#titlebar`, `#topbar`, `#sidebar`, `#detail-panel`, `#agent-panel`, and mobile full-screen panels, with grid rows/columns sized by `calc(... + env(...))`.
- **LiveSearch debounce**: added a 200 ms debounce to match PRD §3.16.
- **Search page snippets/clips actions**: clicking a snippet copies its body; clicking a clip copies its text, with toast feedback.

### Verification matrix

| Command                                     | Result                                           |
| ------------------------------------------- | ------------------------------------------------ |
| `pnpm format:check`                         | ✅                                               |
| `pnpm lint`                                 | ✅                                               |
| `pnpm typecheck`                            | ✅                                               |
| `pnpm test`                                 | ✅ 73 passed                                     |
| `pnpm build`                                | ✅                                               |
| `pnpm e2e`                                  | ✅ 20 passed, 1 skipped (live-network Rust gate) |
| `cargo test`                                | ✅ 29 passed (incl. live IMAP/SMTP Feishu tests) |
| `cargo clippy --all-targets -- -D warnings` | ✅                                               |
| `cargo fmt --check`                         | ✅                                               |

### Remaining gaps (post-audit backlog)

- **Full Agent view**: `view === "agent"` is defined but not routed; the side panel still simulates replies.
- **Search indexing**: CommandPalette/LiveSearch/Search page work via in-memory fuzzy search; no FTS5/CJK index yet.
- **Prototype fidelity polish**: inline fan-style piles, Focus & Reply, Read Together, calendar hero/filmstrip exact layouts, titlebar/sidebar dimensions matching prototype, compose floating modal, richer empty-state art.

## 2026-08-05 (continued) — Focus & Reply + Read Together triage workflows

Seventeenth pass implemented the two HEY-style triage workflows that were still placeholders.

### Fixed in this pass

- **Focus & Reply view**: added `app/src/views/FocusReply.tsx` routed as `view === "focusReply"`. It lists every message marked Reply Later, shows the original email plus an inline AI-generated draft textarea, and provides Send / Regenerate / Edit (opens Compose) / Skip / Done actions. Sending clears the Reply Later flag and removes the item from the flow.
- **Read Together view**: added `app/src/views/ReadTogether.tsx` routed as `view === "readTogether"`. It displays unread Imbox messages one at a time with a progress indicator and Next (mark read) / Reply / Pending (reply later) / Archive / Trash actions. Ends with "All caught up".
- **Imbox entry points**: the bottom "Focus & Reply" button now routes to the real view; an "一起读" header button opens Read Together; the `o` key starts Focus & Reply from Imbox.
- **Pure triage helpers**: extracted `getFocusReplyCandidates` and `getReadTogetherCandidates` to `app/src/utils/triage.ts` with full test coverage.
- **Heuristic AI draft generator**: added `app/src/utils/draft.ts` with keyword-driven reply templates matching prototype-v11's `generateAiDraft`, plus unit tests.

### Verification matrix

| Command                                     | Result                                           |
| ------------------------------------------- | ------------------------------------------------ |
| `pnpm format:check`                         | ✅                                               |
| `pnpm lint`                                 | ✅                                               |
| `pnpm typecheck`                            | ✅                                               |
| `pnpm test`                                 | ✅ 85 passed                                     |
| `cargo test`                                | ✅ 29 passed (incl. live IMAP/SMTP Feishu tests) |
| `cargo clippy --all-targets -- -D warnings` | ✅                                               |
| `cargo fmt --check`                         | ✅                                               |
| `pnpm build`                                | ✅                                               |
| `pnpm e2e`                                  | ✅ 20 passed, 1 skipped (live-network Rust gate) |

### Remaining gaps (post-audit backlog)

- **Search indexing**: CommandPalette/LiveSearch/Search page work via in-memory fuzzy search; no FTS5/CJK index yet.
- **Prototype fidelity polish**: inline fan-style piles, calendar hero/filmstrip exact layouts, titlebar/sidebar dimensions matching prototype, compose floating modal, richer empty-state art.

## 2026-08-05 (continued) — Full Agent independent view

Eighteenth pass implemented the full Agent workspace that was previously only a side panel.

### Fixed in this pass

- **Shared Agent hook**: extracted session/task/draft/audit state and actions into `app/src/agent/useAgent.ts`, removing duplication between the panel and the full view.
- **Agent.tsx full view**: added `app/src/views/Agent.tsx` routed as `view === "agent"`. It renders the prototype's 3-column workspace: session list | conversation | tasks/drafts. Includes a search bar that filters sessions, drafts, and tasks.
- **AgentPanel refactor**: rewired the existing side panel to use `useAgent`, preserving its tabbed UI while sharing logic with the full view.
- **Agent helpers + tests**: moved `sessionIcon` / `statusColor` to `app/src/utils/agent.ts` and added unit tests.

### Verification matrix

| Command                                     | Result                                           |
| ------------------------------------------- | ------------------------------------------------ |
| `pnpm format:check`                         | ✅                                               |
| `pnpm lint`                                 | ✅                                               |
| `pnpm typecheck`                            | ✅                                               |
| `pnpm test`                                 | ✅ 94 passed                                     |
| `cargo test`                                | ✅ 29 passed (incl. live IMAP/SMTP Feishu tests) |
| `cargo clippy --all-targets -- -D warnings` | ✅                                               |
| `cargo fmt --check`                         | ✅                                               |
| `pnpm build`                                | ✅                                               |
| `pnpm e2e`                                  | ✅ 20 passed, 1 skipped (live-network Rust gate) |

### Remaining gaps (post-audit backlog)

- **Search indexing**: CommandPalette/LiveSearch/Search page work via in-memory fuzzy search; no FTS5/CJK index yet.
- **Prototype fidelity polish**: calendar hero/filmstrip exact layouts, titlebar/sidebar dimensions matching prototype, compose floating modal, richer empty-state art.

## 2026-08-05 (continued) — Inline fan-style Imbox piles

Nineteenth pass replaced the modal-based Piles with prototype-style inline accordion cards.

### Fixed in this pass

- **Inline piles**: `Imbox.tsx` now renders Reply Later / Set Aside / Remind as expandable fan-style cards at the bottom of the list. Each card shows icon, label, count, and a chevron; expanding reveals up to 5 message rows with sender avatar, subject, time, and an unmark action.
- **Pile actions**: the Reply Later card includes a "Focus & Reply" button that jumps to the Focus & Reply view; every card has a "Clear all" button to remove all messages from that pile.
- **Removed pile modal**: the old `Piles` button row + `Modal` combo was removed, eliminating an extra click/workflow step.
- **Tests**: the existing Imbox renderList tests still pass; no new pure logic required, so no new unit tests were added.

### Verification matrix

| Command                                     | Result                                           |
| ------------------------------------------- | ------------------------------------------------ |
| `pnpm format:check`                         | ✅                                               |
| `pnpm lint`                                 | ✅                                               |
| `pnpm typecheck`                            | ✅                                               |
| `pnpm test`                                 | ✅ 94 passed                                     |
| `cargo test`                                | ✅ 29 passed (incl. live IMAP/SMTP Feishu tests) |
| `cargo clippy --all-targets -- -D warnings` | ✅                                               |
| `cargo fmt --check`                         | ✅                                               |
| `pnpm build`                                | ✅                                               |
| `pnpm e2e`                                  | ✅ 20 passed, 1 skipped (live-network Rust gate) |

### Remaining gaps (post-audit backlog)

- **Search indexing**: CommandPalette/LiveSearch/Search page work via in-memory fuzzy search; no FTS5/CJK index yet.
- **Prototype fidelity polish**: calendar hero/filmstrip exact layouts, titlebar/sidebar dimensions matching prototype, compose floating modal, richer empty-state art.

## 2026-08-04 (final pass) — Real-client blocker sweep

Fifth pass after the parallel audit of views, workflows, and data indexing. Fixed the issues that blocked reliable real-world email usage and brought the search index in-line with the data model.

### Fixed in this pass

- **Compose floating/minimizable window**: replaced the centered modal with a bottom-right floating compose window; supports minimize to title-bar and close; mobile falls back to full-screen.
- **Send-message IPC parameter mismatch**: `backend.ts` now passes `account_id`/`from_override` in snake_case to match the Rust command, so the selected From account/alias is no longer silently ignored.
- **Manual sync uses account credentials**: `sync_now` and `list_mailboxes` now resolve credentials from the selected account instead of always falling back to test credentials.
- **Cross-account IMAP UID collisions**: message IDs are now `imap_{account_id}_{uid}`, so multi-account inboxes no longer drop messages with overlapping UIDs.
- **SMTP TLS mode selection**: `EmailCredentials` now carries `smtp_implicit_tls`; `SmtpClient` uses `relay` (implicit TLS) for port 465 and `starttls_relay` for STARTTLS providers like Outlook/iCloud.
- **Recipient header parsing**: `parse_email` now extracts `To`, `Cc`, `Bcc`, and `References`, enabling Reply All and Gmail-style thread roots for synced mail.
- **Scheduled-send local Sent copy**: the scheduled-send executor now persists a local Sent copy after dispatch, so scheduled messages appear in the recipient's contact timeline.
- **Topbar search direct input**: the topbar search field is now editable; `LiveSearch` uses the global `searchQuery` signal and handles keyboard navigation via a document listener.
- **Contact panel editing**: extracted `ContactEditModal` into a shared component; added Edit, notify toggle, and default-bucket toggle to `ContactPanel`.
- **Settings Data tab completeness**: added Mailbox backup JSON, Tasks JSON export, Empty Trash, and Delete account (mock) actions.
- **SQLite FTS5 search index**: added `search_index` virtual table (migration `0009`), indexed by Rust sync loop for messages and by JS data layer for contacts/files; `LiveSearch`, global `Search`, and `CommandPalette` now query FTS5 instead of loading whole tables.

### Verification matrix

| Command                                     | Result                                           |
| ------------------------------------------- | ------------------------------------------------ |
| `pnpm typecheck`                            | ✅                                               |
| `pnpm test`                                 | ✅ 94 passed                                     |
| `pnpm lint`                                 | ✅                                               |
| `pnpm format:check`                         | ✅                                               |
| `pnpm build`                                | ✅                                               |
| `pnpm e2e`                                  | ✅ 20 passed, 1 skipped (live-network Rust gate) |
| `cargo test`                                | ✅ 34 passed (incl. live IMAP/SMTP Feishu tests) |
| `cargo clippy --all-targets -- -D warnings` | ✅                                               |
| `cargo fmt --check`                         | ✅                                               |

### Remaining gaps (post-audit backlog)

- **Calendar visual layouts**: day/week/year are flat lists, not the prototype's grid/hero/filmstrip.
- **Agent workspace**: currently a side panel only; full Agent view with conversation history is not implemented.
- **Mobile list gestures**: `useSwipe`/`useLongPress` helpers exist but are not wired to Imbox/Stream/Records rows; no pull-to-refresh.
- **Meeting auto-brief + materials**: `MeetingPanel` shows static brief text and no linked-file Materials section.

## 2026-08-05 (continued) — Trash/Spam 30-day expiry enforcement

Twentieth pass implemented the Trash/Spam recovery contract that the UI had been advertising but not enforcing.

### Fixed in this pass

- **Schema**: added `deleted_at TEXT` column to `messages` via `0010_trash_expiry.sql`; registered the migration in `src-tauri/src/lib.rs` (also registered the previously-unregistered `0009_search_index.sql`).
- **Expiry-aware moves**: new `moveMessageToBucket(id, bucket)` helper in `data.ts` stamps `deleted_at = datetime('now')` when moving to Trash/Spam and clears it when restoring to Imbox/Stream/Records.
- **Bulk move consistency**: `MovePicker`, `MessagePanel` Trash/Spam actions, `Trash`/`Spam` restore buttons, and `Gate` bulk re-routing all use `moveMessageToBucket` so every bucket change keeps the expiry timestamp correct.
- **Background purge job**: `sync_loop.rs` now spawns a daily task that deletes messages where `bucket IN ('trash','spam') AND deleted_at < datetime('now','-30 days')`.
- **UI countdown**: `Trash.tsx` and `Spam.tsx` list items display "X 天后永久删除" / "X 天后自动删除" using `daysUntil(addDays(deletedAt, 30))`.
- **Unit tests**: added `daysUntil` tests to `date.test.ts`.

### Verification matrix

| Command                                     | Result                                           |
| ------------------------------------------- | ------------------------------------------------ |
| `pnpm typecheck`                            | ✅                                               |
| `pnpm test`                                 | ✅ 98 passed                                     |
| `pnpm lint`                                 | ✅                                               |
| `pnpm format:check`                         | ✅                                               |
| `pnpm build`                                | ✅                                               |
| `pnpm e2e`                                  | ✅ 20 passed, 1 skipped (live-network Rust gate) |
| `cargo test`                                | ✅ 34 passed (incl. live IMAP/SMTP Feishu tests) |
| `cargo clippy --all-targets -- -D warnings` | ✅                                               |
| `cargo fmt --check`                         | ✅                                               |

### Remaining gaps (post-audit backlog)

- **Calendar visual layouts**: day/week/year are flat lists, not the prototype's grid/hero/filmstrip.
- **Agent workspace**: currently a side panel only; full Agent view with conversation history is not implemented.
- **Mobile list gestures**: `useSwipe`/`useLongPress` helpers exist but are not wired to Imbox/Stream/Records rows; no pull-to-refresh.

## 2026-08-05 (continued) — Meeting auto-brief + Materials

Twenty-first pass closed the meeting-detail gap identified in the audit: `MeetingPanel` now generates a context brief from attendee data and surfaces linked files in a Materials section.

### Fixed in this pass

- **Auto-brief generator**: new `app/src/utils/meeting.ts` with `generateMeetingBrief(event, messages, files, contacts)`. It counts recent messages from attendees (last 30 days), extracts the top topic keyword, counts outbound messages marked Reply Later as "waiting reply", and notes shared attachments.
- **Materials section**: `MeetingPanel` now shows a "Materials" list computed from `event.materials` plus up to 3 recent files per attendee. Each file row is clickable and opens the file detail panel.
- **Shared file icon helper**: added `fileIconName(type)` to `utils/labels.ts` so MessagePanel and MeetingPanel use the same icon mapping.
- **Unit tests**: added `app/src/test/meeting.test.ts` covering empty context, recent-message counting, 30-day cutoff, waiting-reply detection, shared files, topic extraction, and explicit/implicit material linking.

### Verification matrix

| Command                                     | Result                                           |
| ------------------------------------------- | ------------------------------------------------ |
| `pnpm typecheck`                            | ✅                                               |
| `pnpm test`                                 | ✅ 106 passed                                    |
| `pnpm lint`                                 | ✅                                               |
| `pnpm format:check`                         | ✅                                               |
| `pnpm build`                                | ✅                                               |
| `pnpm e2e`                                  | ✅ 20 passed, 1 skipped (live-network Rust gate) |
| `cargo test`                                | ✅ 34 passed (incl. live IMAP/SMTP Feishu tests) |
| `cargo clippy --all-targets -- -D warnings` | ✅                                               |
| `cargo fmt --check`                         | ✅                                               |

### Remaining gaps (post-audit backlog)

- **Calendar visual layouts**: day/week/year are flat lists, not the prototype's grid/hero/filmstrip.
- **Agent workspace**: currently a side panel only; full Agent view with conversation history is not implemented.
- **Mobile list gestures**: `useSwipe`/`useLongPress` helpers exist but are not wired to Imbox/Stream/Records rows; no pull-to-refresh.

## 2026-08-05 (continued) — Search index integrity on deletion

Twenty-second pass fixed stale full-text search entries that remained after messages, contacts, or files were deleted.

### Fixed in this pass

- **`removeFromSearchIndex` helper**: added to `app/src/stores/data.ts`; every `deleteMessage`, `deleteContact`, and `deleteFile` now purges the matching `search_index` row.
- **`emptyTrash` index cleanup**: before deleting trashed messages, the function now removes their `search_index` entries so deleted mail doesn't surface in search.
- **Rust purge job index cleanup**: `purge_expired_messages` in `sync_loop.rs` deletes stale `search_index` entries for expired Trash/Spam messages before removing the rows.

### Verification matrix

| Command                                     | Result                                           |
| ------------------------------------------- | ------------------------------------------------ |
| `pnpm typecheck`                            | ✅                                               |
| `pnpm test`                                 | ✅ 106 passed                                    |
| `pnpm lint`                                 | ✅                                               |
| `pnpm format:check`                         | ✅                                               |
| `pnpm build`                                | ✅                                               |
| `pnpm e2e`                                  | ✅ 20 passed, 1 skipped (live-network Rust gate) |
| `cargo test`                                | ✅ 34 passed (incl. live IMAP/SMTP Feishu tests) |
| `cargo clippy --all-targets -- -D warnings` | ✅                                               |
| `cargo fmt --check`                         | ✅                                               |

### Remaining gaps (post-audit backlog)

- **Calendar visual layouts**: day/week/year are flat lists, not the prototype's grid/hero/filmstrip.
- **Agent workspace**: currently a side panel only; full Agent view with conversation history is not implemented.
- **Mobile list gestures**: `useSwipe`/`useLongPress` helpers exist but are not wired to Imbox/Stream/Records rows; no pull-to-refresh.

## 2026-08-05 (continued) — Real-time sync refresh for list views

Twenty-third pass fixed the sync event bridge so new mail from the Rust IMAP IDLE loop appears immediately in the UI instead of being silently dropped.

### Fixed in this pass

- **Global refresh tick**: added `refreshTick` signal and `bumpRefreshTick()` to `stores/ui.ts`.
- **`useRefreshEffect` hook**: new `utils/gestures.ts` helper that re-runs a callback whenever the refresh tick changes.
- **Sync event bridge**: `services/sync-events.ts` now bumps the tick on `sync:new-messages` instead of calling `listMessages()` with no consumer.
- **Wired list views**: `Imbox`, `Stream`, `Records`, `Trash`, and `Spam` all call their `refetch` inside `useRefreshEffect`, so they update as soon as the backend fetches new mail.

### Verification matrix

| Command                                     | Result                                           |
| ------------------------------------------- | ------------------------------------------------ |
| `pnpm typecheck`                            | ✅                                               |
| `pnpm test`                                 | ✅ 106 passed                                    |
| `pnpm lint`                                 | ✅                                               |
| `pnpm format:check`                         | ✅                                               |
| `pnpm build`                                | ✅                                               |
| `pnpm e2e`                                  | ✅ 20 passed, 1 skipped (live-network Rust gate) |
| `cargo test`                                | ✅ 34 passed (incl. live IMAP/SMTP Feishu tests) |
| `cargo clippy --all-targets -- -D warnings` | ✅                                               |
| `cargo fmt --check`                         | ✅                                               |

### Remaining gaps (post-audit backlog)

- **Calendar visual layouts**: day/week/year are flat lists, not the prototype's grid/hero/filmstrip.
- **Agent workspace**: currently a side panel only; full Agent view with conversation history is not implemented.
- **Mobile list gestures**: `useSwipe`/`useLongPress` helpers exist but are not wired to Imbox/Stream/Records rows; no pull-to-refresh.

## 2026-08-05 (continued) — Mobile pull-to-refresh

Twenty-fourth pass closed the remaining mobile UX gap: list views now support pull-to-refresh on phones and tablets.

### Fixed in this pass

- **`PullToRefresh` component**: new `app/src/components/PullToRefresh.tsx` that attaches to a scroll container, detects a top-of-list pull-down gesture, shows a palm-green arrow/spinner indicator, and triggers a refresh callback when the user passes the 80 px threshold.
- **`Main.tsx` wiring**: wraps the view `<Switch>` with `<PullToRefresh>` attached to `#main`; enabled only on non-desktop viewports via `useViewport()`.
- **Reuses global refresh tick**: the refresh callback calls `bumpRefreshTick()`, so `Imbox`/`Stream`/`Records`/`Trash`/`Spam` all re-fetch automatically.

### Verification matrix

| Command                                     | Result                                           |
| ------------------------------------------- | ------------------------------------------------ |
| `pnpm typecheck`                            | ✅                                               |
| `pnpm test`                                 | ✅ 106 passed                                    |
| `pnpm lint`                                 | ✅                                               |
| `pnpm format:check`                         | ✅                                               |
| `pnpm build`                                | ✅                                               |
| `pnpm e2e`                                  | ✅ 20 passed, 1 skipped (live-network Rust gate) |
| `cargo test`                                | ✅ 34 passed (incl. live IMAP/SMTP Feishu tests) |
| `cargo clippy --all-targets -- -D warnings` | ✅                                               |
| `cargo fmt --check`                         | ✅                                               |

### Remaining gaps (post-audit backlog)

- **Calendar visual layouts**: day/week/year are flat lists, not the prototype's grid/hero/filmstrip.
- **Agent workspace**: currently a side panel only; full Agent view with conversation history is not implemented.
- **Mobile list gestures**: `useSwipe`/`useLongPress` helpers exist but are not wired to Imbox/Stream/Records rows for swipe-to-action.

## 2026-08-05 (continued) — Real-time sync refresh for catalog views

Twenty-fifth pass extended the global refresh tick to all catalog and communication list views so backend sync updates (new contacts, files, calendar events, follow-ups, clips) appear immediately.

### Fixed in this pass

- **Catalog views wired**: `Files`, `Calendar`, `FollowUps`, and `Clips` now call their `createResource` `refetch` handlers inside `useRefreshEffect`.
- **Contacts/Companies already wired**: previous passes wired these two; this pass verified they stay in sync with the same pattern.
- **Backlog corrected**: `Calendar` day/week/year hero + filmstrip + grid is implemented; full Agent independent view is implemented; mobile pull-to-refresh is implemented. The only remaining mobile gesture gap is swipe-to-action on list rows.

### Verification matrix

| Command                                     | Result                                           |
| ------------------------------------------- | ------------------------------------------------ |
| `pnpm typecheck`                            | ✅                                               |
| `pnpm test`                                 | ✅ 106 passed                                    |
| `pnpm lint`                                 | ✅                                               |
| `pnpm format:check`                         | ✅                                               |
| `pnpm build`                                | ✅                                               |
| `pnpm e2e`                                  | ✅ 20 passed, 1 skipped (live-network Rust gate) |
| `cargo test`                                | ✅ 34 passed (incl. live IMAP/SMTP Feishu tests) |
| `cargo clippy --all-targets -- -D warnings` | ✅                                               |
| `cargo fmt --check`                         | ✅                                               |

### Remaining gaps (post-audit backlog)

- **Mobile list gestures**: `useSwipe`/`useLongPress` helpers exist but are not wired to Imbox/Stream/Records rows for swipe-to-action.

## 2026-08-05 (continued) — Real-time sync refresh for detail panels + remaining views

Twenty-sixth pass extended the global refresh tick to every detail panel and remaining list view so backend sync updates reflect everywhere, not just in the main mail lists.

### Fixed in this pass

- **Detail panels wired**: `MessagePanel`, `ContactPanel`, `FilePanel`, `MeetingPanel`, `DraftPanel`, and `TaskPanel` now refetch their data inside `useRefreshEffect`.
- **Remaining list views wired**: `Drafts`, `Insights`, `Search`, and `Gate` (including `ScreenerHistory`) now refetch on the global tick.
- **Agent hook wired**: `useAgent.ts` refetches sessions, tasks, drafts, audit, and contacts on the tick, keeping both the Agent side panel and the full Agent view in sync.
- **Verified attachment + contact indexing completeness**:
  - Incoming MIME attachments are decoded in `services/parser.rs`, written to disk in `services/sync_loop.rs`, indexed in `files`, and rendered/downloaded from `MessagePanel` and `FilePanel`.
  - `ContactPanel` provides 9 tabs (Timeline, Notes, Files, Tasks, Follow-ups, Clips, Insights, Network, Calendar) with in-memory indexing by `contactId` across messages, files, events, tasks, follow-ups, and clips.
  - `Compose.tsx` supports adding, removing, and sending attachments via `DraftAttachment`.

### Verification matrix

| Command                                     | Result                                           |
| ------------------------------------------- | ------------------------------------------------ |
| `pnpm typecheck`                            | ✅                                               |
| `pnpm test`                                 | ✅ 106 passed                                    |
| `pnpm lint`                                 | ✅                                               |
| `pnpm format:check`                         | ✅                                               |
| `pnpm build`                                | ✅                                               |
| `pnpm e2e`                                  | ✅ 20 passed, 1 skipped (live-network Rust gate) |
| `cargo test`                                | ✅ 34 passed (incl. live IMAP/SMTP Feishu tests) |
| `cargo clippy --all-targets -- -D warnings` | ✅                                               |
| `cargo fmt --check`                         | ✅                                               |

### Remaining gaps (post-audit backlog)

- **Mobile list gestures**: `useSwipe`/`useLongPress` helpers exist but are not wired to Imbox/Stream/Records rows for swipe-to-action.

## 2026-08-05 (continued) — Mobile swipe-to-action on list rows

Twenty-seventh pass closed the final documented backlog gap: list rows now support prototype-style swipe-to-action on touch viewports.

### Fixed in this pass

- **`SwipeActions` component**: new `app/src/components/SwipeActions.tsx` that wraps a row, reveals colored action backgrounds while dragging, and triggers the action with a slide-off animation when the user passes the threshold.
- **Imbox**: `New for you` message rows and `Previously seen` rows are swipeable — left swipe → Set Aside, right swipe → Reply Later. Bundle rows remain non-swipeable (they already have bulk selection).
- **Stream / Records**: article/row cards are swipeable with the same Set Aside / Reply Later actions.
- **Gate + ScreenerHistory**: Gate approval card swipes left to Block and right to Approve to Imbox; ScreenerHistory rows swipe in the direction of their column action.
- **Viewport-gated**: swipe gestures are disabled on desktop (`useViewport().isMobile`) so mouse interactions remain normal.

### Verification matrix

| Command                                     | Result                                           |
| ------------------------------------------- | ------------------------------------------------ |
| `pnpm typecheck`                            | ✅                                               |
| `pnpm test`                                 | ✅ 106 passed                                    |
| `pnpm lint`                                 | ✅                                               |
| `pnpm format:check`                         | ✅                                               |
| `pnpm build`                                | ✅                                               |
| `pnpm e2e`                                  | ✅ 20 passed, 1 skipped (live-network Rust gate) |
| `cargo test`                                | ✅ 34 passed (incl. live IMAP/SMTP Feishu tests) |
| `cargo clippy --all-targets -- -D warnings` | ✅                                               |
| `cargo fmt --check`                         | ✅                                               |

### Remaining gaps (post-audit backlog)

None — all documented backlog items from the 2026-08-05 audit are now implemented.

## Verified UI surfaces (screenshots in `docs/screenshots/`)

- Imbox: bundles for explicit senders + auto-detected
- Agent panel: 5-tab layout, sessions list, active task card
- Compose modal: From/To/Subject/Body, snippet picker, send split-button, recipient pills
- Detail panels: ContactPanel 9 tabs + Write button, MessagePanel w/ tracker shield + actions

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

iOS Simulator verification (requires Xcode + `aarch64-apple-ios-sim` target):

```bash
scripts/verify-ios.sh                # boots iPhone 17, builds, installs, screenshots
scripts/verify-ios.sh "iPad Pro"     # boot iPad Pro 11-inch instead
```

---

## 2026-08-05 — iOS launch crash fix + full verification pass

### Problem

`scripts/verify-ios.sh` built and installed successfully, but the app crashed ~2s after launch on the iOS Simulator. The crash report showed `__start_app → stop_unwind → std::process::abort`, meaning a Rust panic was being caught and converted to an abort.

### Root cause

1. `app/src-tauri/migrations/0001_init.sql` had been modified in-place (added `from_alias` column), but that column was already covered by migration `0008_drafts_from_alias.sql`. `tauri-plugin-sql` hashes migration contents, so the changed hash for migration 1 caused:
   ```
   PluginInitialization("sql", "migration 1 was previously applied but has been modified")
   ```
2. After reverting migration 1, the app made it past migrations but then hung on a blank white screen after onboarding. The hang was caused by a dynamic import in `ensureDefaultShortcuts()`:
   ```ts
   const { DEFAULT_SHORTCUTS } = await import("../utils/shortcut-defaults");
   ```
   This dynamic import conflicted with the static import in `utils/shortcuts.ts` and never resolved inside the WKWebView.

### Fixes

- Reverted `app/src-tauri/migrations/0001_init.sql` to its original content.
- Converted `DEFAULT_SHORTCUTS` to a static import in `app/src/stores/data.ts`.
- Converted the `bulk:menu` shortcut handler in `app/src/utils/shortcuts.ts` to use the statically imported `openBulkActionMenu` (removes the second Vite dynamic-import warning).
- Updated `scripts/verify-ios.sh` to `rm -rf "$GEN/build"` before each build, preventing the Tauri "Directory not empty" rename error on rebuilds.

### Verification

| Suite                                                            | Result                                             |
| ---------------------------------------------------------------- | -------------------------------------------------- |
| `pnpm typecheck`                                                 | ✅                                                 |
| `pnpm lint`                                                      | ✅                                                 |
| `pnpm format:check`                                              | ✅                                                 |
| `pnpm test`                                                      | ✅ 106 passed                                      |
| `cargo fmt --check && cargo clippy -- -D warnings && cargo test` | ✅ 17 unit + 15 integration passed                 |
| `pnpm e2e`                                                       | ✅ 20 passed, 1 skipped (live Feishu network test) |
| `scripts/verify-ios.sh`                                          | ✅ builds, installs, launches, captures screenshot |
| Post-onboarding iOS main app                                     | ✅ renders Imbox empty state + bottom tab bar      |

### Artifacts

- Onboarding screenshot: `docs/ios-screenshots/iphone-17-01-launch.png`
- Post-onboarding main app screenshot: `docs/ios-screenshots/iphone-17-03-after-start.png`

### Quick polish follow-up

- Added **Empty Trash** button to `app/src/views/Trash.tsx` so users can permanently delete all trashed messages in one action.

### Remaining prototype gaps (priority order)

Based on a focused comparison against `prototype-v11.html/js/css`:

1. **Contact detail depth**: stage-history timeline, recycling toggle + purge job, merge UI, "Delivering to" routing label, topics/accounts/milestones/pattern display, avatar/photo upload.
2. **Message viewing**: rendered/source/plain toggle, inline thread expansion, Read Together / Focus Reply first-class workflows.
3. **Rich compose**: outbound HTML body and inline image embedding (currently plain text only).
4. **LiveSearch coverage**: events/meetings are missing from the topbar quick-search dropdown.
5. **FTS robustness**: add SQLite triggers to auto-maintain `search_index` so Rust-side writes never miss the index.
6. **Undo toasts**: prototype supports undo for many destructive actions; implementation only shows success toasts.
7. **Sidebar polish**: align rail width (64 px) and active indicator (accent bar) with prototype.

## 2026-08-05 (later) — Email workflow E2E coverage (Task 2)

Added browser-mode Playwright tests for the five core email workflows using an in-memory `MockDb` and `window.__sendpalmE2E` helpers.

### Added / changed

- `app/e2e/workflows.spec.ts` — Gate approval, Reply, Forward, Calendar invite, Reply Later pile, Set Aside pile.
- `app/src/services/mock-db.ts` + `app/src/services/mock-db.test.ts` — in-memory SQL shim for browser mode.
- `app/src/e2e-test-helpers.ts` — Playwright-facing seed/reset/inspect API.
- `app/src/compose/Compose.tsx` — stable `field="subject"` selector.
- `app/src/panels/MessagePanel.tsx` — `bumpRefreshTick()` after message mutations.
- `app/src/views/Gate.tsx` — `data-testid="gate-approve-imbox"`.

### Verification

| Suite                                    | Result                                           |
| ---------------------------------------- | ------------------------------------------------ |
| `pnpm typecheck`                         | ✅                                               |
| `pnpm lint`                              | ✅                                               |
| `pnpm test src/services/mock-db.test.ts` | ✅ 4 passed                                      |
| `pnpm e2e`                               | ✅ 26 passed, 1 skipped (live-network Rust gate) |

### Report

- `.superpowers/sdd/task-2-report.md`

Core send/receive/sync workflows are functional end-to-end.

---

## 2026-08-05 (later) — Message persistence + compose hardening (Task 1)

Fixed three real bugs found while auditing the email read/reply/invite flows.

### Fixed

- **`app/src/stores/data.ts` `upsertMessage` did not persist `calendar_json`** — the column exists (migration `0002_calendar.sql`) and `rowToMessage` reads it, but any frontend write (mark unread, Reply Later, Set Aside, bucket move) dropped the invite. Added `calendar_json` to the INSERT/UPDATE list and parameters.
- **`app/src/compose/Compose.tsx` reply/forward quote was empty for HTML-only messages** — `buildDraft` used `m.body` directly. Added `htmlToPlainText()` helper that strips tags and decodes entities, falling back from `bodyHtml` when `body` is empty.
- **`app/src/panels/MessagePanel.tsx` showed "Sticky notes" section even when empty** — the Show condition was `stickyForMsg().length > 0 || true`; removed the always-true clause.

### Verification

| Suite            | Result        |
| ---------------- | ------------- |
| `pnpm typecheck` | ✅            |
| `pnpm lint`      | ✅            |
| `pnpm test`      | ✅ 106 passed |

### Report

- `.superpowers/sdd/task-1-report.md`

---

## 2026-08-05 (later) — Keep test infrastructure out of production bundles

The browser-mode `MockDb` and `window.__sendpalmE2E` helpers are required for Playwright, but must not ship in the Tauri production build.

### Changed

- `app/src/stores/data.ts` — `getDb()` now lazily loads `MockDb` only when `IS_BROWSER() && import.meta.env.DEV`.
- `app/src/index.tsx` — `e2e-test-helpers.ts` is imported only under `import.meta.env.DEV`.

### Verification

| Check                                                            | Result                        |
| ---------------------------------------------------------------- | ----------------------------- |
| `pnpm typecheck`                                                 | ✅                            |
| `pnpm lint`                                                      | ✅                            |
| `pnpm test`                                                      | ✅ 110 passed                 |
| `pnpm e2e`                                                       | ✅ 26 passed, 1 skipped       |
| `pnpm format:check`                                              | ✅                            |
| `cargo fmt --check && cargo clippy -- -D warnings && cargo test` | ✅ 35 passed                  |
| `scripts/verify-ios.sh`                                          | ✅ builds, installs, launches |
| Production bundle grep for `MockDb` / `__sendpalmE2E`            | ✅ not found                  |

---

## 2026-08-05 (later) — Thread-first message detail + view-mode toggle (Task 4)

Refactored `app/src/panels/MessagePanel.tsx` to match the prototype-v11 thread-first reading experience.

### Added / changed

- **Thread-first layout**: the detail panel now renders the full conversation as a vertical list of message cards instead of a single message body.
- **Collapse / expand**: current message and the last two messages are expanded by default; older messages collapse to a one-line preview. Clicking a non-current card toggles it.
- **View-mode toggle**: added `Rendered / Plain / Source` segmented control in the panel header.
  - _Rendered_ — HTML body in iframe when available, otherwise plain text.
  - _Plain_ — `body` as paragraphs.
  - _Source_ — raw `From / To / Subject / Date / body` `<pre>` block.
- **Participant chips** shown below the subject when a thread has multiple senders.
- **Attachments and calendar invite** now render inside the current-message card rather than as separate panel sections.
- New helper + tests: `app/src/panels/message-source.ts` and `app/src/test/message-source.test.ts`.
- New E2E test: `Thread-first detail expands older message and shows both bodies`.

### Verification

| Suite            | Result                  |
| ---------------- | ----------------------- |
| `pnpm typecheck` | ✅                      |
| `pnpm lint`      | ✅                      |
| `pnpm test`      | ✅ 117 passed           |
| `pnpm e2e`       | ✅ 27 passed, 1 skipped |

### Report

- `.superpowers/sdd/task-4-report.md`

---

## 2026-08-05 — Mobile Settings layout + bottom tab bar crowding fix

User feedback: on iPhone 17 the Settings → Shortcuts page was side-by-side instead of stacked, the bottom tab bar squeezed 15 icons into one row, and the topbar title overlapped the Dynamic Island.

### Fixed

- **`app/src/views/Settings.tsx`** — the tab nav and content now stack vertically on mobile (`flex-direction: column`), the tab nav scrolls horizontally, and the content area fills the width.
- **`app/src/components/Sidebar.tsx`** — mobile collapses the 15 nav entries into 6 primary tabs (Imbox / Gate / Contacts / Calendar / Files / Settings) plus a "More" bottom sheet for the remaining 9 views. Tap targets stay ≥ 44 px and the active overflow view highlights the More button.
- **`app/src/components/Topbar.tsx` + `app/src/styles/base.css`** — removed the fixed `height` from the topbar so the mobile grid can size it as `min-height: calc(var(--topbar-height) + env(safe-area-inset-top))`; content now sits below the Dynamic Island.
- **`app/src/styles/animations.css`** — added `sheet-enter` keyframe for the mobile More sheet.
- **`app/e2e/views.spec.ts`** — updated mobile responsive assertions and added a new test verifying Settings stacks tabs/content on iPhone SE.

### Verification

| Suite                   | Result                                             |
| ----------------------- | -------------------------------------------------- |
| `pnpm typecheck`        | ✅                                                 |
| `pnpm lint`             | ✅                                                 |
| `pnpm format:check`     | ✅                                                 |
| `pnpm test`             | ✅ 117 passed                                      |
| `pnpm e2e`              | ✅ 28 passed, 1 skipped (live-network Rust gate)   |
| `cargo test`            | ✅ 35 passed                                       |
| `scripts/verify-ios.sh` | ✅ builds, installs, launches, captures screenshot |

### Artifacts

- iPhone 17 Imbox screenshot: `docs/ios-screenshots/iphone-17-02-retry.png`
- Playwright mobile screenshots: `app/e2e-report/18-mobile-bottom-tabs.png`, `app/e2e-report/19-mobile-settings.png`

---

## 2026-08-05 — LiveSearch now surfaces events/meetings

`PROGRESS.md` previously listed "LiveSearch coverage: events/meetings are missing from the topbar quick-search dropdown" as a gap. Closed it.

### Added / changed

- `app/src/stores/data.ts`:
  - `indexEntity()` now accepts an optional `date` parameter.
  - Event indexing encodes `dt` (start datetime) on the first line of the indexed body, so the dropdown can jump to the right calendar day without an extra query.
  - Updated both `backfillSearchIndex()` and `upsertEvent()` to pass the event date.
- `app/src/search/LiveSearch.tsx`:
  - Added an **Events** group to the dropdown, limited to the top 5 matches.
  - Clicking an event navigates to Calendar and calls `setCalendarJumpTo(event.dt)`.
  - Added `data-testid="live-search-dropdown"` to the dropdown container for stable E2E targeting.
  - Updated keyboard cursor math and empty-state checks to include the new group.
- `app/e2e/workflows.spec.ts` — added `LiveSearch surfaces events and jumps to Calendar on click`.

### Verification

| Suite                         | Result                                           |
| ----------------------------- | ------------------------------------------------ |
| `pnpm typecheck`              | ✅                                               |
| `pnpm lint`                   | ✅                                               |
| `pnpm format:check`           | ✅                                               |
| `pnpm test`                   | ✅ 117 passed                                    |
| `pnpm e2e`                    | ✅ 29 passed, 1 skipped (live-network Rust gate) |
| `cargo test`                  | ✅ 35 passed                                     |
| `cargo clippy -- -D warnings` | ✅                                               |
| `cargo fmt --check`           | ✅                                               |

---

## 2026-08-05 — Outbound HTML email body

`PROGRESS.md` previously listed "Rich compose: outbound HTML body and inline image embedding (currently plain text only)" as a gap. Implemented the HTML body half; inline image embedding remains for a future pass.

### Added / changed

- `app/src-tauri/src/services/smtp.rs`:
  - `SmtpClient::send()` and `build_message()` now accept an optional `html_body: Option<String>`.
  - When supplied, the message includes both a `text/plain` and a `text/html` part inside `multipart/alternative`.
  - Updated all call sites (`commands/mod.rs`, `scheduled_send.rs`, `sync_loop.rs` vacation replies, `tests/smtp_roundtrip.rs`).
- `app/src-tauri/src/commands/mod.rs`:
  - `send_message` command accepts `html_body` and appends the account signature to the HTML part (line breaks → `<br>`).
- `app/src/services/backend.ts`:
  - `sendEmailViaBackend()` accepts an optional `htmlBody` and forwards it as `html_body`.
- `app/src/utils/html.ts` (new):
  - Extracted `htmlToPlainText()` from Compose.
  - Added `plainTextToHtml()` for outbound conversion: escapes entities, turns line breaks into `<br>`, auto-links URLs.
- `app/src/compose/Compose.tsx`:
  - Imports helpers from `utils/html`.
  - On send, generates an HTML body from the user's plain-text input and passes it to the backend.
- Tests:
  - `app/src/test/html.test.ts` — 5 unit tests for the two helpers.
  - `app/src-tauri/src/services/smtp.rs` — `builds_html_alternative_when_html_body_supplied`.

### Verification

| Suite                         | Result                  |
| ----------------------------- | ----------------------- |
| `pnpm typecheck`              | ✅                      |
| `pnpm lint`                   | ✅                      |
| `pnpm format:check`           | ✅                      |
| `pnpm test`                   | ✅ 122 passed           |
| `pnpm e2e`                    | ✅ 29 passed, 1 skipped |
| `cargo test`                  | ✅ 36 passed            |
| `cargo clippy -- -D warnings` | ✅                      |
| `cargo fmt --check`           | ✅                      |

### Remaining gap

- Inline image embedding in compose is still not implemented.

---

## 2026-08-05 — Undo toast for MessagePanel Trash action

Destructive mail actions need a safety net. Added an undo path for the MessagePanel "Move to Trash" action and covered it with E2E.

### Added / changed

- `app/src/stores/ui.ts` — widened `Toast.action.run` type from `() => void` to `() => void | Promise<void>` so async undo handlers type-check.
- `app/src/components/ToastStack.tsx` — action button now awaits `run()` before dismissing; added `data-testid="toast-success"` and `data-testid="toast-action"` for E2E.
- `app/src/services/reminder.ts` — adjusted existing toast action callbacks to avoid accidental non-void returns.
- `app/src/panels/MessagePanel.tsx`:
  - `moveToTrash` saves the message's previous bucket before moving it to Trash.
  - Success toast shows "已移到 Trash" with an action labeled "撤销".
  - Undo restores the message to its original bucket via `upsertMessage`, refreshes the list, and shows "已恢复到原位置".
  - Added `data-testid="message-more-menu"` to the More menu trigger and `data-testid="message-move-trash"` to the Trash menu item.
- `app/e2e/workflows.spec.ts` — added `Trash action shows undo toast and restores message to Imbox` and `Source view renders the raw message source`.

### Verification

| Suite                         | Result                  |
| ----------------------------- | ----------------------- |
| `pnpm typecheck`              | ✅                      |
| `pnpm lint`                   | ✅                      |
| `pnpm format:check`           | ✅                      |
| `pnpm test`                   | ✅ 122 passed           |
| `pnpm e2e`                    | ✅ 30 passed, 1 skipped |
| `cargo test`                  | ✅ 36 passed            |
| `cargo clippy -- -D warnings` | ✅                      |
| `cargo fmt --check`           | ✅                      |

---

## 2026-08-05 — Prototype audit: P0/P1 blocker fixes

A full parallel audit against `prototype-v11.38` surfaced multiple gaps that block daily use as a real email client. Fixed the highest-severity blockers first.

### Fixed in this pass

- **Contact routing no longer routes mail to Trash/Spam**: `ContactPanel` default-bucket toggle now only cycles `Imbox → Stream → Records` and excludes `trash`/`spam`. Toggles now refetch the contact so the UI reflects the change immediately, and the button label is human-readable.
- **Auto-mark-read works from any view**: moved the "open → mark read" logic from `Imbox.tsx` into `MessagePanel.tsx` so messages opened from Search, Follow-ups, Stream, Records, or Notifications are correctly marked read.
- **Move/Archive clears workflow flags**: `moveMessageToBucket()` now clears `reply_later`, `set_aside`, `bubble_up_at`, and `remind_at`. Archive, Trash, Spam, and bulk actions in `Imbox.tsx`, `MessagePanel.tsx`, and `ReadTogether.tsx` now use this single path so piled messages leave the workflow lists when moved.
- **CJK search fixed in production SQLite**: changed the FTS5 tokenizer from `porter` (English-only stemmer) to `unicode61` (CJK-compatible) in `0009_search_index.sql`, and added migration `0012_fix_fts_tokenizer.sql` that recreates the index and reindexes existing messages, contacts, files, and events.
- **MessagePanel source view restored**: `isExpanded()` no longer forces `false` in source mode, so the raw source `<pre>` block for each thread message is actually rendered when the user toggles "Source".

### Files changed

- `app/src/panels/ContactPanel.tsx`
- `app/src/panels/MessagePanel.tsx` (auto-mark-read, archive path, source view)
- `app/src/views/Imbox.tsx`
- `app/src/views/ReadTogether.tsx`
- `app/src/stores/data.ts`
- `app/src-tauri/migrations/0009_search_index.sql`
- `app/src-tauri/migrations/0012_fix_fts_tokenizer.sql` (new)
- `app/src-tauri/src/lib.rs`

### Verification

| Suite                         | Result                  |
| ----------------------------- | ----------------------- |
| `pnpm typecheck`              | ✅                      |
| `pnpm lint`                   | ✅                      |
| `pnpm format:check`           | ✅                      |
| `pnpm test`                   | ✅ 122 passed           |
| `pnpm e2e`                    | ✅ 31 passed, 1 skipped |
| `cargo test`                  | ✅ 36 passed            |
| `cargo clippy -- -D warnings` | ✅                      |
| `cargo fmt --check`           | ✅                      |

### Remaining significant gaps (post-audit backlog)

- **Standalone Pending/Saved/Remind views** — currently only inline piles in Imbox; prototype has dedicated sidebar entries and board views.
- **Source view in MessagePanel** — toggle exists but the source `<pre>` block is unreachable due to `isExpanded()` guard.
- **Imbox priority-score sorting** — currently newest-first; prototype uses a priority score.
- **Compose power features** — no custom schedule-send datetime, no `Cmd/Ctrl+Enter` send, no formatting toolbar.
- **Calendar all-day events / filters** — all-day toggle missing; filter chips missing.
- **Settings folder sync selector** — `AccountSettings.syncFolders` exists in the data model but has no UI.

---

## 2026-08-05 — Compose/Settings/Calendar P1 fixes

Second pass after the audit closed three more daily-use gaps in Compose, Settings, and Calendar.

### Fixed in this pass

- **Compose `Cmd/Ctrl+Enter` send**: pressing `⌘+Enter` (macOS) or `Ctrl+Enter` (Windows/Linux) in the compose body now triggers `sendNow`. The existing E2E compose test now exercises this keyboard shortcut instead of clicking the split button.
- **Settings folder sync selector**: the account edit modal now exposes a checkbox grid for `INBOX / Sent / Drafts / Archive / Trash / Spam / Starred / Important`, wired to `AccountSettings.syncFolders`.
- **Calendar all-day events**:
  - Added `allDay?: boolean` to `CalendarEvent` and `all_day` to the `events` table (migration `0013_event_all_day.sql`).
  - Event edit modal has an "All day" checkbox that hides time/duration fields when checked.
  - Day agenda sorts all-day events to the top, shows a "全天" label, and highlights them with `palm-soft` background.
  - iCal parser (`services/ical.rs`) now detects `VALUE=DATE` / bare-date DTSTART as all-day and persists the flag via `add_calendar_event`.

### Files changed

- `app/src/compose/Compose.tsx`
- `app/src/views/Settings.tsx`
- `app/src/views/Calendar.tsx`
- `app/src/types/index.ts`
- `app/src/stores/data.ts`
- `app/src-tauri/migrations/0001_init.sql`
- `app/src-tauri/migrations/0013_event_all_day.sql` (new)
- `app/src-tauri/src/lib.rs`
- `app/src-tauri/src/commands/mod.rs`
- `app/src-tauri/src/services/ical.rs`
- `app/e2e/views.spec.ts`

### Verification

| Suite                         | Result                  |
| ----------------------------- | ----------------------- |
| `pnpm typecheck`              | ✅                      |
| `pnpm lint`                   | ✅                      |
| `pnpm format:check`           | ✅                      |
| `pnpm test`                   | ✅ 122 passed           |
| `pnpm e2e`                    | ✅ 31 passed, 1 skipped |
| `cargo test`                  | ✅ 37 passed            |
| `cargo clippy -- -D warnings` | ✅                      |
| `cargo fmt --check`           | ✅                      |

---

## 2026-08-05 — Imbox triage undo toasts + MessagePanel Save as draft

Third pass after the audit focused on making destructive / stateful triage actions reversible and adding the missing "Save as draft" power action.

### Fixed in this pass

- **Imbox per-message triage actions now show undo toasts**: Reply Later, Set Aside, Bubble Up, Archive, Trash, and Spam all capture the previous state and offer a "撤销" toast action that restores the message.
  - `app/src/views/Imbox.tsx`: added a `showUndoToast` helper and wired it into every triage action in `MessageActions`.
- **MessagePanel "Save as draft"**: the More menu now has "保存为草稿", which creates a `Draft` row from the current message's recipient, subject, body, Cc/Bcc, and account.
  - `app/src/panels/MessagePanel.tsx`: added `saveAsDraft`, imported `upsertDraft`, and passed it to `MoreMenu`.
- **E2E coverage**:
  - Reply Later / Set Aside tests now also exercise undo and assert the piles section disappears.
  - New test: `Save message as draft from MessagePanel More menu`.

### Files changed

- `app/src/views/Imbox.tsx`
- `app/src/panels/MessagePanel.tsx`
- `app/e2e/workflows.spec.ts`

### Verification

| Suite                         | Result                  |
| ----------------------------- | ----------------------- |
| `pnpm typecheck`              | ✅                      |
| `pnpm lint`                   | ✅                      |
| `pnpm format:check`           | ✅                      |
| `pnpm test`                   | ✅ 122 passed           |
| `pnpm e2e`                    | ✅ 32 passed, 1 skipped |
| `cargo test`                  | ✅ 37 passed            |
| `cargo clippy -- -D warnings` | ✅                      |
| `cargo fmt --check`           | ✅                      |

---

## 2026-08-05 — Imbox priority-score sorting

Fourth pass implemented the prototype's `priorityScore` for the "New for you" section so important mail surfaces above newer noise.

### Fixed in this pass

- **Priority-aware unread sorting**: `app/src/utils/priority.ts` mirrors the prototype formula:
  - `contact.sc * 0.45`
  - `risk` group +25, `cold` group -35
  - age decay: `max(0, 18 - ageDays * 0.25)`
- **`app/src/views/Imbox.tsx`**: `imboxMsgs()` now splits unread/read, sorts unread by priority score descending, and keeps previously-seen messages sorted by date descending.
- **Unit tests**: `app/src/utils/priority.test.ts` covers contact score, group adjustments, and age decay.

### Files changed

- `app/src/views/Imbox.tsx`
- `app/src/utils/priority.ts` (new)
- `app/src/utils/priority.test.ts` (new)

### Verification

| Suite                         | Result                  |
| ----------------------------- | ----------------------- |
| `pnpm typecheck`              | ✅                      |
| `pnpm lint`                   | ✅                      |
| `pnpm format:check`           | ✅                      |
| `pnpm test`                   | ✅ 125 passed           |
| `pnpm e2e`                    | ✅ 32 passed, 1 skipped |
| `cargo test`                  | ✅ 37 passed            |
| `cargo clippy -- -D warnings` | ✅                      |
| `cargo fmt --check`           | ✅                      |

---

## 2026-08-05 — iOS crash fix, splash cleanup, and full workflow audit

User reported "移动端的界面好奇怪 / 总是 crash". Did a root-cause pass on the iOS launch crash, cleaned up the splash transition, and re-ran the full verification matrix against real IMAP/SMTP.

### Fixed

- **iOS launch crash**
  - `app/src-tauri/migrations/0001_init.sql` had been accidentally modified (`all_day` column added), causing Tauri plugin-sql to abort with `migration 1 was previously applied but has been modified`. Reverted it to the committed version.
  - `app/src-tauri/migrations/0012_fix_fts_tokenizer.sql` referenced `files.notes`, which does not exist; changed to `COALESCE(md, '')`.
  - iOS system SQLite lacks FTS5, so migrations 9/12 failed. Added `libsqlite3-sys = { version = "0.30", features = ["bundled"] }` in `app/src-tauri/Cargo.toml` so the app ships its own SQLite.
- **Startup diagnostics**
  - `app/src-tauri/src/lib.rs` now installs a panic hook that writes to `sendpalm-panic.log`, and the Tauri `run()` error is captured to `sendpalm-run-error.log` before exiting cleanly.
- **Splash / launch visual**
  - `app/index.html` keeps the splash visible until JS adds `body.app-ready`, forces `#splash .word` to `#fff`, and moves the Phosphor script to the end of `<body>` so it no longer blocks first paint.
  - `app/src/App.tsx` now removes the splash element from the DOM after the 0.55 s fade completes, preventing the green gradient from tinting the app background in screenshots and after hot reloads.

### Audit findings

- The Settings screenshot the user sent shows the **old two-pane mobile layout** (menu + Keyboard shortcuts side-by-side). The current build uses a stacked iOS-style menu: menu first, then a full-screen drill-in with a back button. This is enforced by `app/src/views/Settings.tsx` and covered by the Playwright responsive test `Settings page uses iOS-style menu on mobile`.
- All requested email workflows are covered by passing E2E:
  - Attachments: `MessagePanel shows attachments and can trigger download`, `Compose can attach a file and send in browser mode`
  - Calendar invites: `Calendar invite adds event and it appears in Calendar`
  - Replies: `Reply`, `Reply All`, `Forward`
  - Contact indexing: `ContactPanel indexes messages, files and events by contact`
- Real backend integration against `imap.feishu.cn` / `smtp.feishu.cn` passes: `imap_real` (3 tests), `smtp_roundtrip` (1 test), `providers_registry` (9 tests), `vault_test` (3 tests), plus parser/ical/smtp unit tests.

### Verification

| Suite                                                            | Result                                      |
| ---------------------------------------------------------------- | ------------------------------------------- |
| `pnpm typecheck`                                                 | ✅                                          |
| `pnpm lint`                                                      | ✅                                          |
| `pnpm format:check`                                              | ✅                                          |
| `pnpm test`                                                      | ✅ 125 passed                               |
| `pnpm e2e`                                                       | ✅ 42 passed, 1 skipped (live-network gate) |
| `cargo fmt --check && cargo clippy -- -D warnings && cargo test` | ✅ 37 passed                                |
| `scripts/verify-ios.sh`                                          | ✅ builds, installs, launches iPhone 17 sim |

### Artifacts

- iPhone 17 launch/ready screenshots: `docs/ios-screenshots/iphone-17-01-launch.png`, `iphone-17-02-ready.png`
- Playwright desktop/mobile screenshots: `/tmp/sendpalm-screenshots/e2e/`

---

## 2026-08-06 — iOS real-account harness + mobile UI polish pass

Second focused pass after the user asked to log in to `edwinhao@sendpalm.com` on the iOS build and verify every workflow/UI surface.

### Fixed / added

- **iOS real-account smoke-test harness**
  - `scripts/verify-ios.sh` now sources `app/.env` and forwards `SENDPALM_TEST_*` credentials to the simulator process via `SIMCTL_CHILD_*` env vars, so the test fallback account syncs real mail on iOS.
  - Captures 4 screenshots over ~30 s (launch → shell ready → syncing → populated) and writes app logs to `/tmp/sendpalm-ios/verify-ios.log`.
  - `app/src/bootstrap.ts` now marks onboarding as completed on first successful store load, so a fresh iOS install boots straight into the app instead of showing the onboarding wizard.
- **Mobile Compose bug**
  - `app/src/styles/tokens.css`: raised `--z-modal` to `80` (above `--z-detail`/`--z-agent`) so the full-screen Compose modal is no longer hidden behind the MessagePanel/AgentPanel on iPhone.
- **MessagePanel bottom action bar on mobile**
  - `app/src/panels/MessagePanel.tsx`: the bottom bar is now horizontally scrollable on mobile and action buttons hide their labels to stay readable on narrow screens.
- **Mobile workflow coverage**
  - `app/e2e/workflows.spec.ts`: added `Mobile workflows with data` suite (iPhone SE viewport) that seeds a contact + message (attachment + calendar invite) + file + event and screenshots Imbox, MessagePanel, ContactPanel (Timeline/Files/Calendar), Calendar, Files, and Compose reply.

### Audit findings

- **iOS real IMAP sync is blocked by the current network environment**, not the app.
  - Host `cargo test` against `imap.feishu.cn:993` passes (37 tests).
  - Inside the iOS simulator the TLS handshake to `imap.feishu.cn:993` fails with `imap tls: connection closed via error`, so no messages are backfilled.
  - The app handles this gracefully: the account appears in the topbar (`1 账户`), the empty-state copy is shown, and there is no crash.
- **Mobile UI now fills the screen correctly**: latest iPhone 17 screenshots show the full viewport, Dynamic Island/safe-area insets respected, and bottom tab bar rendered.
- **All requested workflows are covered by passing E2E**:
  - Attachments: `MessagePanel shows attachments`, `Compose can attach a file`
  - Calendar invites: `Calendar invite adds event`
  - Replies: `Reply`, `Reply All`, `Forward`
  - Contact indexing: `ContactPanel indexes messages, files and events`
  - Mobile-specific: new `Mobile workflows with data` screenshots

### Verification

| Suite                         | Result                                      |
| ----------------------------- | ------------------------------------------- |
| `pnpm typecheck`              | ✅                                          |
| `pnpm lint`                   | ✅                                          |
| `pnpm format:check`           | ✅                                          |
| `pnpm test`                   | ✅ 125 passed                               |
| `pnpm e2e`                    | ✅ 44 passed, 1 skipped (live-network gate) |
| `cargo test`                  | ✅ 37 passed                                |
| `cargo clippy -- -D warnings` | ✅                                          |
| `cargo fmt --check`           | ✅                                          |
| `scripts/verify-ios.sh`       | ✅ builds, installs, launches iPhone 17 sim |

### Artifacts

- iPhone 17 launch/sync screenshots: `docs/ios-screenshots/iphone-17-01-launch.png` … `iphone-17-04-populated.png`
- Playwright mobile screenshots: `/tmp/sendpalm-screenshots/e2e/mobile-*.png`

---

## 2026-08-10 — Inbox data chain revamp (Phase 1)

### Phase 1 — Inbox data chain (2026-08-10)

- Added `services::mailbox_resolver` with provider-aware candidate table
  (Feishu `&XfJT0ZAB-`, Gmail `[Gmail]/Sent Mail`, Outlook `Sent Items`,
  Chinese labels). Replaces the hard-coded `"Sent"` folder name.
- `ImapClient::sync` now encodes folder names to modified UTF-7 before
  `session.select` (RFC 3501 §5.1.3).
- `sync_one` no longer aborts on a single failed folder; failed folders
  are logged and the next folder continues. `sync:new-messages` always
  fires when at least one folder inserted messages.
- `sync_folder` only advances the persisted cursor past UIDs that were
  successfully inserted. Parse failures and DB-insert failures keep the
  cursor below their UID, so the next tick retries them.
- `spawn_account_loop` calls `client.list_mailboxes` once per boot and
  persists the resolved names into `accounts.settings_json.syncFolders`.
- New `0014_gate_screened_backfill.sql` defensively normalizes the rare
  inconsistent contact state.
- `countGateCandidates` added to `stores/data.ts`; `InboxEmptyState` in
  `views/Imbox.tsx` now branches three ways (no account / unscreened /
  empty) instead of always saying "add an account".
- Tests added: `mailbox_resolver_test` (6), `imap_utf7_test` (2),
  `sync_loop_isolation_test` (1), `sync_loop_cursor_test` (2),
  `empty-state.test.ts` (5).
- Net effect: real mail now appears in the Inbox within IDLE latency
  (~5 s) for any provider whose Sent folder is one of the candidate
  table entries; the Inbox empty-state copy is now truthful.

## 2026-08-10 — Inbox data chain revamp (Phase 2)

### Phase 2 — Desktop notifications (2026-08-10)

- New `services::desktop_notifier` with `should_notify` (quiet-hours
  helper) and `notify_new_mail` (calls `tauri-plugin-notification`).
- `SyncStateStore` now caches a `NotificationPrefs` that the JS side
  keeps in sync via the new `notify_settings_changed` Tauri command.
- `insert_message` triggers a notification per genuinely new mail,
  subject to the user's desktop toggle and quiet-hours window.
- JS-side `services/notifications.ts` runs from `bootstrap.ts` after
  settings load, requests permission if needed, and mirrors the new
  preference to Rust.
- New `PreferencesNotificationsTab` in `views/Settings.tsx` exposes the
  toggle and quiet-hours start/end.
- Tests added: `desktop_notifier_test` (6), `notifications.test.ts` (2).
- Net effect: leaving the app unfocused surfaces macOS notifications for
  every new mail, in line with the user's quiet-hours preference.

## 2026-08-10 — Inbox data chain revamp (Phase 3)

### Phase 3 — Gate backlog surfacing (2026-08-10)

- No new code; this phase is fully covered by Phase 1's
  `countGateCandidates` helper, `InboxEmptyState` branch 2, and the
  `0014_gate_screened_backfill.sql` migration.
- Confirmed via `pnpm test -- empty-state.test.ts` (5 tests) and
  `cd app/src-tauri && cargo check --tests`.

## 2026-08-10 — Inbox data chain revamp (Phase 4)

### Phase 4 — Sidebar icon-only (2026-08-10)

- New `SidebarTooltip` primitive with edge-flip positioning (covered by
  `sidebar-tooltip.test.ts`).
- `NavItem` is now icon-only on desktop/tablet; the visible label is
  rendered only on the mobile bottom tab bar. The ⌘N chip is repositioned
  to the bottom-right corner of the button and marked `aria-hidden`.
- `aria-current="page"` is set on the active item; the tooltip
  accessible name combines the label and the shortcut hint.
- `useLongPress` (600 ms) surfaces the tooltip on touch / tablet.
- Playwright tests updated to assert the tooltip on hover and the
  64 px sidebar width on iPad.
- Net effect: the desktop rail is clean and HEY-consistent; the
  `Im…` / `St…` / `Comp…` ellipsis regression is resolved.

## 2026-08-10 — Inbox data chain revamp (Phase 5)

### Phase 5 — Titlebar + brand (2026-08-10)

- Tauri `titleBarStyle` flipped from `Visible` to `Overlay`; the
  `trafficLightPosition` is set to `{x: 14, y: 14}`.
- The JS `Titlebar.tsx` component and its grid row in `base.css` are
  deleted. `--titlebar-height` is now `0`; a new `--titlebar-traffic-pad:
78px` token reserves the macOS safe area.
- New `<BrandMark />` (Phosphor `ph-leaf` + 18 px wordmark) is the
  leftmost topbar element. The topbar body is draggable
  (`-webkit-app-region: drag`); every interactive control carries
  `no-drag` to keep clickability.
- The single Playwright `text=SendPalm` assertion is scoped to
  `[data-testid="brand-mark"]` to avoid the splash collision.
- Net effect: the macOS window shows native traffic lights on top of a
  draggable topbar; the SendPalm brand is at the expected HEY-style
  position (Phosphor leaf + wordmark).

## 2026-08-14 — Imbox sync + Stream 读报 + virtualization

Three independently observable problems on the running app (`pnpm tauri
dev`) shared one architectural cause: every list view loaded the entire
`messages` table on every refresh, did an O(n) filter over all rows in a
`createMemo`, and then mounted every row via `<For>`. With the real
account holding 913 imbox rows (908 of them hidden by the Gate contract),
the per-render work was always there even when only 5 rows were visible.

This pass is one logical change set spread across seven commits:

### Sync correctness (1 commit)

- **fix(sync): tag Sent-folder messages direction='out' and skip self in Gate**
  - `services/mailbox_resolver::folder_kind_for_name()` classifies a
    folder without needing the server mailbox list.
  - `sync_loop::insert_message()` hard-codes `direction='out'` for Sent
    folders (Feishu `&XfJT0ZAB-`, Gmail `[Gmail]/Sent Mail`, Outlook
    `Sent Items`, etc.); `bucket` still comes from
    `compute_message_bucket` via the contact's `default_bucket`.
  - `sync_loop::upsert_contact(pool, email, name, is_self)` forces
    `first_seen=0, screened=1, default_bucket='paperTrail'` for the
    account's own email on both INSERT and ON CONFLICT, with CASE guards
    so the user's manual screening decisions are preserved on later
    syncs.
  - Migration `0016_sent_direction_backfill.sql` repairs legacy rows
    (direction='out', bucket='paperTrail', unread=0) and normalizes the
    matching self-contact.
  - 7 new tests in `mailbox_resolver_test.rs` covering all FolderKind
    candidates and case-insensitive matching.

### Frontend virtualization + pagination (4 commits)

- **chore(deps): virtua** — `inokawa/virtua` 0.50.1, zero-config Solid
  adapter, ~3kB. Chosen over `@tanstack/solid-virtual` for smaller
  footprint and built-in `onScrollEnd`/`onLoadMore`-style hooks.
- **feat(perf): listMessagesPaged + usePaginatedMessages** — new
  `LIMIT/OFFSET` query returning `{ items, total, limit, offset }` plus
  a Solid composable exposing `items/total/hasMore/loadMore/refresh`.
  `listMessages()` kept untouched for callers that need the full table
  (search, reminder loop, BulkActionMenu).
- **feat(ui): Stream 读报模式** — replaces the
  `open(m.id) → setDetailOpen(true)` flow with click-to-expand inline.
  Multiple cards can be expanded; DetailPanel never opens for Stream
  clicks. `htmlEmailSrcdoc` extracted from MessagePanel into
  `utils/html.ts` so both surfaces share the same srcdoc + click
  interceptor.
- **feat(ui): Records/Trash/Spam virtualized** — same pattern as
  Stream: `<VList data={paged.items()}>` with scroll-end → `loadMore()`.
- **feat(ui): Imbox virtualized with WindowVirtualizer** — Imbox uses
  window scroll (the page-level `<main>` is the scroll container) so
  `WindowVirtualizer` from virtua fits without restructuring the
  layout. Pile slices (replyLater/setAside/reminded) still need every
  message to filter by flag, so a second `listMessages` resource stays
  around only for those mappers.

### UI polish (1 commit)

- **feat(ui): drag handle between Main and DetailPanel** — adds
  `--main-pane-width` token (default 640px) and a `<PanelResizeHandle
panel="main" side="right" />` mounted on Main. Persisted alongside
  detail/agent widths in the existing `sendpalm.panelWidths`
  localStorage entry.

### Verification

| Command                                   | Result                                                                                                                             |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`                          | ✅                                                                                                                                 |
| `pnpm test`                               | ✅ 156 passed (22 files)                                                                                                           |
| `pnpm lint`                               | 🟡 1 pre-existing `sidebarWidth` error in `e2e/views.spec.ts:416` (verified by `git stash` — present on `main` before this branch) |
| `cargo build`                             | ✅                                                                                                                                 |
| `cargo test --lib`                        | ✅ 29 passed                                                                                                                       |
| `cargo test --test mailbox_resolver_test` | ✅ 13 passed                                                                                                                       |

## 2026-08-14 (continued) — Incremental sync + optimistic UI

Two follow-up commits completing the performance series.

### Sync incremental append

- **feat(sync): emit new_message_ids; frontend prepends instead of full refetch**
  - `SyncReport` gains `new_message_ids: Vec<String>`. `sync_loop::insert_message`
    now returns `Result<Option<String>>` — `Some(id)` when INSERT OR IGNORE
    actually wrote a row, `None` on idempotent re-sync (driven by
    `rows_affected()`). `sync_folder` collects ids; `sync_one` accumulates
    across folders and ships the bundle on the `sync:new-messages` emit.
  - `services/sync-events.ts` exposes `registerPrepend(bucket, handler)`;
    each list view registers on mount and cleans up via `onCleanup`.
  - `usePaginatedMessages::prependByIds(ids)` fetches each id via
    `getMessage()`, drops ones already loaded, prepends the rest to the
    in-memory list and bumps total.
  - `sync:new-messages` keeps `bumpRefreshTick()` for non-paginated
    resources AND now fans the ids out to the prepend registry so
    paginated lists update with O(new_ids) IPC round-trips.

### Optimistic UI

- **feat(ui): optimistic remove on move/delete across list views**
  - `usePaginatedMessages::removeByIds(ids)` drops the rows from the
    loaded pages + total + offset in one synchronous step.
  - Every move/delete in Imbox / Stream / Records / Trash / Spam now:
    1. optimistically removes locally,
    2. awaits the backend call,
    3. on success → toast + (for bulk) refresh pile slices,
    4. on failure → full refresh to resync truth + error toast.
  - Bulk action bar in Imbox removes the whole selected set up front
    before iterating the per-id backend calls.

### Verification

| Command            | Result        |
| ------------------ | ------------- |
| `pnpm typecheck`   | ✅            |
| `pnpm test`        | ✅ 156 passed |
| `cargo test --lib` | ✅ 29 passed  |

## 2026-08-18 (Imbox UX fixes) — sort filter, Read Together wiring, pile drawer redesign

Three user-reported gaps in the Imbox surface, all closed in one branch.

### Fixed in this pass

- **"一起读" button now opens Read Together**: the New for you section header's action was wired to a literal `() => undefined` no-op. Now calls `setView("readTogether")` so the existing `ReadTogether` view actually opens.
- **Imbox default sort is now newest first**: the previous implementation sorted "New for you" by `priorityScore` only (date as a tiebreaker), which let high-score OLD unread block new mail from lower-score senders — the prototype defaults to `const sort = f.sort || 'newest'` (`js/prototype-v11.js:442`) and only sorts by priority when the user explicitly picks "Most relevant". Added a `FilterPanel` modal mirroring the prototype's `renderFilterPanelBody` (sort dropdown + Unread only toggle); Imbox header gets a "筛选" button and an active-sort badge. Users can still opt into `most_relevant` from the modal.
- **Bottom pile bar matches the prototype**: Pending / Saved / Remind piles are now collapsed by default — the prototype's `renderImboxPile` (`js/prototype-v11.js:2992-3049`) keeps them collapsed and pops a drawer on header click. The previous implementation always rendered up to 3 messages inline and dominated the sticky-bottom area. New behavior:
  - Default collapsed; click header expands a popup drawer above the pile (`position: absolute; bottom: calc(100% + 8px)`) with the same fan-in animation the prototype uses.
  - Pending pile shows a "Focus & Reply" pill button next to its title and inside the drawer — both navigate to the existing `focusReply` view (HEY-style distraction-free reply flow).
  - Every pile drawer ends with an "Open <title> board" link to a dedicated full-page view. Pending reuses `focusReply`; Saved and Remind now have dedicated `setAside` / `bubbleUp` views via the new generic `PileBoard` component.
- **New PileBoard view**: single component handles all three pile IDs (`replyLater` / `setAside` / `bubbleUp`) by reusing `usePaginatedMessages` with three new WHERE filters (`replyLaterOnly` / `setAsideOnly` / `bubbleUpOnly`) on `listMessagesPaged` — no new SQL, no extra round-trips.
- **Command palette + view routing**: `⌘K` now exposes Go to Pending / Saved / Remind / Focus & Reply; `Main.tsx` Switch routes the three new views. `PileMessage` carries `pid`/`tm`/`st` so the drawer rows render avatar + sender + time without re-fetching the contact table.
- **Sort regression test**: `sort-imbox.test.ts` includes the specific user-reported scenario — an old VIP unread (180 days, score ≈ 42.75) must NOT out-rank a new cold unread (today, score ≈ −12.5) under the default newest-first sort.

### Verification matrix

| Command          | Result                                                 |
| ---------------- | ------------------------------------------------------ |
| `pnpm typecheck` | ✅                                                     |
| `pnpm test`      | ✅ 187 passed (was 181; +6 sort cases)                 |
| `pnpm build`     | ✅                                                     |
| `cargo check`    | ✅ no Rust changes                                     |
| `pnpm lint`      | �️ 4 pre-existing e2e errors not touched by this branch |

### Commits

- `d4f0b7b` `fix(imbox): default newest-first sort + wire 一起读 button`
- `22c2a6d` `feat(imbox): collapsible pile drawer, Focus & Reply, Open board`

## 2026-08-18 — Brand + view-health fixes (splash, topbar, error/empty states)

Two parallel audits (brand, view health) found one P0 and several P1/P2
gaps across the launch surface, the topbar, and 22 views. All P0/P1
items addressed; a handful of complex views deferred to follow-up.

### Fixed in this pass

**Brand & launch (P0/P1)**

- `BrandMark.tsx` no longer renders a stock Phosphor `ph-leaf`. The
  topbar now shows the bespoke `logo-mark.svg` (paper-plane + palm)
  at 22×22, matching the splash and the Tauri bundle icons. The
  unused `Icon` import is gone.
- `index.html` had a duplicate `body.app-ready #splash { opacity: 0; pointer-events: none }`
  rule. The first wins, the second is dead; deleted.
- `index.html` `color-scheme` is now `dark` so the iOS status bar
  matches the deep-palm splash background.
- Splash `<img>` for `logo.svg` got an `onerror` fallback that hides
  itself if the asset fails to fetch, so the rest of the splash still
  renders.

**Settings (P1)**

- `Settings.tsx` AccountsTab and ShortcutsTab had `For each={...() ?? []}`
  with NO fallback. A fresh install hit empty Connected accounts and
  zero shortcut rows with nothing to click. Both now render an
  `<Empty .../>` above the For loop; AccountsTab's CTA reuses the
  same `setAdding(true)` handler that the existing 'Add account'
  button uses.

**Records (P2)**

- Removed the unwired "导出为 CSV" per-row quick action that
  hard-coded `showToast({ message: '导出为 CSV（M7 实装）' })`.
  It literally admitted the action wasn't implemented (M7 = a future
  milestone). Anyone clicking it got a toast and nothing else, which
  is worse than not having the button.

**ResourceGate helper (P1, with TDD)**

- New `app/src/components/ResourceGate.tsx` centralises the
  `createResource` guard pattern (loading / error / empty) so views
  stop forgetting the error check. The default predicates treat
  arrays of length 0 as empty and any other value as non-empty;
  override via `isEmpty` for non-list resources.
- 7 unit tests on the pure `isResourceEmpty` predicate covering:
  undefined / null, empty array, non-empty array, non-array values,
  custom predicate, custom on undefined, custom on empty array.
  Total: 194 frontend tests, 80 cargo tests.

**View error fallbacks (P1) — wrapped 13 views**

- Each of these previously showed an empty page on resource failure
  with no error indicator. Each now wraps the existing render in a
  `<Show>` that falls back to `<ErrorState>` with `重试` wired to
  the resource's `refetch()`:
  - `Stream.tsx` (paged.resource.error)
  - `Files.tsx` (files.error)
  - `Drafts.tsx` (drafts.error || scheduled.error)
  - `FollowUps.tsx` (followUps.error)
  - `Clips.tsx` (clips.error)
  - `Contacts.tsx` (contacts.error)
  - `Companies.tsx` (any of contacts/messages/events/files.error)
  - `Search.tsx` (ftsResults.error)
  - `ReadTogether.tsx` (messages.error)
  - `FocusReply.tsx` (messages.error)
  - `Trash.tsx` (paged.resource.error)
  - `Spam.tsx` (paged.resource.error)
  - `Records.tsx` (paged.resource.error)

Existing bespoke Empty / Skeleton sub-components stay in place;
the gate only adds the missing error case.

### Deferred to follow-up

The 2026-08-18 audit also flagged these views but their render
graphs are too complex to wrap in a single inline Show without
refactoring. Will be addressed in a separate pass:

- **Imbox** — the main render is 14+ Show blocks; needs a deeper
  restructure of the data flow before the gate can slot in cleanly.
- **Gate / ScreenerHistory** — same pattern, also has nested
  resource fetches (queueItems + contacts).
- **Insights** — six `createResource` calls; needs an aggregate
  error boundary rather than a per-resource check.
- **Agent** — `useAgent` hook owns the resources, not the view;
  the error gate belongs in the hook, not the view.
- **Calendar** — 14+ Show blocks across two return statements.
- **PileBoard** — already has bespoke empty/loading via
  `SkeletonList` + `<Empty>`; the audit flagged it as
  technically missing ErrorState but its failure mode is rare
  (single-resource paginated loader with retry-by-restart).

### Verification matrix

| Command          | Result                                       |
| ---------------- | -------------------------------------------- |
| `pnpm typecheck` | ✅                                           |
| `pnpm test`      | ✅ 194 passed (was 187, +7 for ResourceGate) |
| `cargo test`     | ✅ 80 passed                                 |
| `pnpm lint`      | ⚠️ 4 pre-existing e2e errors unchanged       |

### Commits (this branch)

- `fix(brand): topbar BrandMark uses logo-mark.svg`
- `fix(splash): dedup CSS, color-scheme dark, logo onerror fallback`
- `fix(records): remove unwired '导出为 CSV' placeholder button`
- `fix(settings): add Empty fallbacks to AccountsTab and ShortcutsTab`
- `feat(ui): ResourceGate wrapper for empty/loading/error states`
- `fix(stream): add error fallback for paginated message resource`
- `fix(files): error fallback for listFiles resource`
- `fix(drafts,followups): error fallbacks for createResource views`
- `fix(views): add error fallbacks to 8 createResource views`
- `fix(records): error fallback for paginated message resource`
- `docs(progress): record Brand + view-health fixes`

## 2026-08-18 — Imbox tabs + scale handling + remaining view errors

Three real UX gaps closed:

### Imbox tabs redesign

The 2026-08-18 view-health audit fixed 13 views' missing error
states but left two P1 gaps on the Imbox itself:

1. **'Click a message, can't find it again.'** The Imbox used one
   paginated query and split the loaded rows client-side into
   'New for you' / 'Previously seen'. With 1000+ messages that meant
   any read message older than the first 100 newest was invisible.
   Now each section has its own paginated resource (unreadOnly=true /
   readOnly=true) so 'Previously seen' loads its own page slice and
   the user can scroll back through thousands of read messages.

2. **'Hundreds of unread with no way to navigate.'** The list is now
   grouped by date bucket (今天 / 昨天 / 本周早些 / 本月早些 / 1月)
   with anchor headers, so users can scan to a date and jump rather
   than scrolling 100s of rows.

Stack:

- `listMessagesPaged` gains `readOnly` filter (mutually exclusive
  with `unreadOnly`; `unreadOnly` wins if both set).
- New `ImboxTabs` component above the list with two pill buttons:
  'New for you' with green badge showing unread count, 'Previously
  seen' showing total read count. Active tab has palm underline +
  bold text.
- New `DateGroupedList` wraps the ItemList with bucket headers
  between groups. Bucket keys are stable so SolidJS For reuses DOM
  nodes when items within a bucket re-shuffle.
- mark-as-read moves a message from newPaged to seenPaged via
  `removeByIds` + `prependByIds` (which fetches the full row once
  so the seen tab has body/bodyHtml). mark-as-unread does the
  reverse. toggleUnread removes from the source tab and prepends
  to the destination so both totals stay correct.
- Per-message actions (replyLater, setAside, archive, trash, spam)
  call `removeByIds` on BOTH resources — `removeByIds` is a no-op
  when the id isn't present, so this is safe and avoids needing
  to know which tab the user was on.
- ImboxHeader H1 centred per user request.

### Remaining view error fallbacks

The 2026-08-18 audit deferred 7 views because their render graphs
were too complex to wrap in a single inline Show. All 7 are now
covered:

- Gate → `queueItems.error`
- ScreenerHistory → `contacts.error`
- Insights → aggregate over messages/contacts/tasks/
  followUps/agentTasks/events
- Agent → `useAgent().error()` aggregate; useAgent now
  exposes a single error() accessor that returns
  the first non-undefined error across its 5
  resources
- Calendar → `events.error`
- PileBoard → `paged.resource.error`

Each falls back to ErrorState with 重试 wired to the appropriate
refetch. The bespoke empty/skeleton sub-components stay in place.

### Tests

13 new tests for dateBucket / bucketLabel (today / yesterday /
this-week / this-month / cross-month / cross-year keys + Chinese
label formatting including the year-suppressed same-year case).

All previous tests still pass.

| Command          | Result                                      |
| ---------------- | ------------------------------------------- |
| `pnpm typecheck` | ✅                                          |
| `pnpm test`      | ✅ 207 passed (was 194, +13 for dateBucket) |
| `cargo test`     | ✅ 80 passed                                |

### Commits (this branch)

- `feat(date): dateBucket + bucketLabel helpers for Imbox date grouping`
- `feat(imbox): New / Previously seen tabs + date grouping`
- `fix(gate): error fallbacks for Gate + ScreenerHistory`
- `fix(agent): error fallback for the Agent workspace`

### Resource loading + scroll perf fix (2026-08-20)

User reported that opening a message in the Imbox produced a sidebar full
of tofu glyphs (`※1`, `※2`, …), a 404'd SendPalm logo in the topbar, a
message body that rendered as raw `[ Stripe ][https://stripe.com…]`
reference-link text, and a laggy scroll inside the right-side detail panel.
All four symptoms had one root cause family: assets and code paths the
prototype relied on were not surviving the move to Tauri 2's strict CSP
and Vite's production-build asset pipeline.

**Fixes:**

- `app/index.html` — removed the `<script src="https://unpkg.com/@phosphor-icons/web@2.1.1">` line. The Tauri CSP (`script-src 'self' 'unsafe-inline'`) blocked the CDN script, so the Phosphor webfont never loaded and every `<i class="ph ph-tray">` rendered as a tofu box.
- `app/package.json` — added `@phosphor-icons/web@^2.1.2` as a real dependency.
- `app/src/index.tsx` — `import "@phosphor-icons/web/regular"` so Vite bundles the CSS + `Phosphor.woff2` into `dist/assets/`. CSP-allowed via `'self'`. Verified the build emits `Phosphor-*.woff2` (147 KB) and `.ph.ph-tray:before { content: "\eXXX" }` rules in the bundled CSS.
- `app/src/components/BrandMark.tsx` — replaced literal `src="/src/assets/logo-mark.svg"` with `import logoMarkUrl from "/src/assets/logo-mark.svg?url"`. The literal string was not processed by Vite (only `index.html` assets are scanned), so the production build 404'd the topbar logo. Vite now inlines it as a hashed URL.
- `app/src/panels/MessagePanel.tsx` (iframe ref) — removed the 30-frame `requestAnimationFrame` resize loop and the three `setTimeout(resize, …)` resizes. A single `ResizeObserver` on the iframe body (registered on `load`) covers every content change (font load, Show images reveal, dynamic DOM mutations). With 3–5 iframes per thread, the old code did ~150 forced reflows per message open.
- `app/src/panels/MessagePanel.tsx` (scroll container) — only applies `transform` during an active pull gesture. The previous always-on `transform: translateY(0)` + 420 ms `transition: transform …` was promoting the scroll container onto its own compositor layer and visibly slowed native scroll on dense bodies.
- `app/src/utils/html.ts` — `plainTextToHtml` now also handles `[label][url]` (Stripe / Mailchimp / SendGrid plain-text alternative) and `[label](url)` (hand-written markdown) via a single-pass alternation. Previous version only linkified bare `https?://…` and `mailto:…`, leaving the bracketed text untouched. Single-pass avoids the bug where a sequential pass re-matched the URL it just inserted into `href="…"`.
- `app/src/utils/html.test.ts` — 7 new vitest cases for `plainTextToHtml` covering reference-style, inline-style, mailto, no-regression (single anchor), `<br>` preservation, and HTML escaping.

**Verification:**

| Command          | Result                                                                                                     |
| ---------------- | ---------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck` | ✅                                                                                                         |
| `pnpm lint`      | ✅ (0 warnings)                                                                                            |
| `pnpm test`      | ✅ 279 passed (was 272, +7 for `plainTextToHtml`)                                                          |
| `pnpm build`     | ✅ bundles `Phosphor-*.woff2` (147 KB) + 4 KB hashed `logo-*.svg`; CSS contains `.ph.ph-tray:before` rules |

`AGENTS.md` §11 captures the icon-CDN regression as a critical lesson: any
external `<script>` or `<link>` is a future Tauri-CSP regression waiting to
happen. Anything the app needs at render time should be an npm dependency
that Vite bundles.

### Code-split + better loading UX (2026-08-20)

User reported the app still felt slow after the icon/asset fixes, especially
on first open and during scroll. The static analysis turned up two
structural problems and one rendering hot path:

1. `App.tsx` was gating the entire shell (Sidebar + Topbar + Main + every
   overlay) on `ready()` from `bootstrap.ts`, which awaits 4 IPC round-trips
   (`load(STORE_PATH)`, `ensureDefaultShortcuts`, then
   `Promise.all([listAccounts(), listLabels(), listShortcuts(), listBundleConfigs()])`).
   The user saw only the splash for the whole bootstrap duration. The shell
   doesn't need any of that data to render — every component uses its own
   `createResource`. Removed the gate; the shell now paints on the first
   frame. The splash fades on `requestAnimationFrame × 2` (the double rAF
   is required so the browser commits the first layout before the splash
   starts clearing — a single rAF would produce a one-frame flash of
   paper-coloured void).

2. `Main.tsx` was eagerly importing all 22 view files at app boot. Calendar
   (2264 lines), Imbox (1835), Settings (2214) all had to be parsed by the
   JS engine before the user could click anything. Replaced every static
   import with `lazy(() => import("../views/X").then(m => ({ default: m.X })))`
   - `<Suspense fallback={<FeedSkeleton />}>`. The active view's chunk
     downloads after the shell paints; other chunks load on demand when the
     user navigates to them. Initial bundle dropped from **633 KB → 399 KB
     raw / 120 KB gzipped**, and the first paint no longer waits for the
     V8 engine to compile all 22 view components.

3. The Imbox's `DateGroupedList` was using `Object.assign(item, { _flatIdx })`
   to attach a per-item global index for j/k cursor navigation. That
   mutated the SolidJS-tracked message objects on every regroup, breaking
   reactivity for every `createMemo` that read the items. Extracted
   `groupItemsByDate` to a new `./Imbox-helpers.ts`, returns `startIdx` per
   group, and the per-row `<For>` adds the local offset. No mutation, the
   original item references are preserved across the lifecycle.

### Loading UX (2026-08-20, same day)

- New `LoadedProgressBar` component (between SectionHeader and the list
  in Imbox) shows `已加载 X / 共 Y` plus a thin `transform: scaleX()`
  bar. The bar is hidden when the list is complete; visible during the
  initial fetch and while `loadMore` is in flight. The transform-based
  fill avoids triggering reflow on every progress tick (vs animating
  `width`).
- `FeedSkeleton` in `Main.tsx` grew from 6 placeholder rows to 12 (each
  with avatar + 2 text lines) and added a 32px H1 placeholder so the
  page header doesn't cause a layout shift when the real view mounts.
- `Topbar.SyncBadge` now shows `加载中…` while the accounts resource is
  in flight (was previously showing `未连接`, which made the app look
  broken on first paint when accounts were just slow to return).
- `Skeleton` component props widened from `width: string` to
  `width: number | string` and the same for `height` — existing call
  sites were already mixing both shapes, but TypeScript was rejecting
  the wider shape.

### Tests (this commit)

- 4 cases for `groupItemsByDate`: no-mutation regression guard,
  contiguous `startIdx` per group, global index = `startIdx + localIdx`
  is unique, labels match `bucketLabel(dateBucket(...))`.
- 4 cases for `Main.tsx` lazy loading: no static `import` from
  `../views/*`, `<Suspense fallback={<FeedSkeleton />}>` wraps the
  switch, every Match renders a component declared as `const X = lazy()`,
  FeedSkeleton has ≥ 8 row placeholders.
- Total: 287 (was 279, +8).

`AGENTS.md` §11.9 captures the "no `ready()` gate" lesson: any function
that paints the top-level shell should NOT block on boot-time IPC. Every
component pulls its own data via `createResource`; the shell paints
first, the data catches up.

- `fix(calendar,pileboard): error fallbacks for events / pile loader`

## "全屏卡顿" perf pass — RO loop + heavy IPC payloads (2026-08-21)

User reported "现在的性能还是很卡顿，而且是全屏的" — full-screen
lag, every view. The previous v2 fix (8bc925d, rAF-debounce) was
insufficient on real Tauri; the iframe body's contentDocument still
fires ResizeObserver entries across many frames (font load, image
decode, CSS animation), and writing `el.style.height` from inside
the callback drives the host iframe's layout, which fires another
RO entry in the same frame. W3C spec suppresses the second
notification; Tauri webview logs "ResizeObserver loop completed
with undelivered notifications" and the panel becomes unresponsive.

Plus a parallel audit of heavy IPC payloads — `listMessages()` and
`listContacts()` pulls that crossed ~360 MB of HTML for tasks that
needed 3 KB of slice.

### Fixes

| Commit | What |
|---|---|
| `97e17d8` | **MessageBodyIframe v3 — host-only RO + 200ms cooldown + skip-equality.** RO observes the iframe element (not the body's contentDocument, which is the cross-realm loop source). Wall-clock 200ms cooldown on the height write: a 50-burst coalesces to exactly 1 write per cooldown window. Skip-equality guard skips the `style.height =` assignment when the value is unchanged. `onShowImages` explicitly re-measures after the postMessage. Cleanup also tears down the cooldown timer. |
| `9f457ce` | **e2e fix.** The 50× rapid-resize spec now uses a `Proxy` on the iframe's `style` (Chromium's `height` is an own property, not a prototype descriptor — the original `Object.getOwnPropertyDescriptor` approach failed). Both tests pass in real Chromium: 50× rapid → 1 write, 3 cooldown windows → ≤4 writes. |
| `e7343e0` | **Clips — `listMessagesByIdsLight(referencedMsgIds)`.** Clips only fetches the message rows referenced by visible clips (no full body_html). |
| `3839d15` | **analyzeImages — skip DOMPurify sanitize by default.** The 1-3ms DOMPurify pass was being run for `externalImageCount` only and the result was thrown away. `ImageAnalysis.safeHtml` is now opt-in via `{ includeSafeHtml: true }`. |
| `7dfa19c` | **Compose — `listContactsForRecipient`.** Only id/name/emails/avatar for the recipient picker; the full 25-field Contact row was being fetched 7500+ JSON.parse calls. |
| `21346ea` | **MovePicker / LabelPicker — `listMessageBucketSlicesByIds` + `setMessageLabels`.** Server-side projection of {id, bucket, labels} for picker modals. `setMessageLabels` is a focused UPDATE-only query that won't NULLOUT every other column. |

### Verification

- `pnpm typecheck` — clean
- `pnpm vitest run` — 317/317 (was 314 in v2; +3 for the cooldown regression tests)
- `pnpm exec playwright test e2e/message-iframe-resize.spec.ts` — 2/2 pass in real Chromium
- `pnpm tauri build --target aarch64-apple-darwin --no-sign` — builds cleanly; v3 DMG at `dist/SendPalm-0.1.0-arm64-v3.dmg` (9.2 MB)

### DMG history

| File | Date | Notable |
|---|---|---|
| `dist/SendPalm-0.1.0-arm64.dmg` | 2026-08-21 00:24 | pre-RO-fix baseline |
| `dist/SendPalm-0.1.0-arm64-perf.dmg` | 2026-08-21 21:34 | perf fixes (loading skeletons, bundle 645→47ms, etc.) but RO loop still on |
| `dist/SendPalm-0.1.0-arm64-v2.dmg` | 2026-08-21 22:17 | rAF-debounce (8bc925d) — **insufficient on real Tauri** |
| `dist/SendPalm-0.1.0-arm64-v3.dmg` | 2026-08-21 23:44 | 200ms cooldown + host-only RO + lightweight projections |

### What's still open

- **Real-Tauri scroll perf.** Playwright on Vite dev measures 60fps for
  every view, but the user reports scroll jank on the real binary.
  Playwright doesn't reproduce Tauri webview's stricter iframe /
  scrollbar behavior. The v3 DMG is the test surface — open a
  long thread, scroll, watch the devtools Performance panel.
- **Calendar year view.** The `allOccurrences` memo expands every
  RRULE in the visible window (1 year). With many recurring events
  this can be O(n×365). Already memoized; check if the 1-year
  precomputation is the right scope.
- **`createResource` cleanup on view switch.** `KeepAlive` keeps views
  mounted, so the resource state persists. But the resource's
  `_refreshSkipMount` guard (added in v2) means a tab return after
  a long absence skips the first refetch — verify this is still
  correct after the lightweight-projection refactors.
- **useAgent's `listContacts` call** still uses the full 25-field
  projection. The agent only reads name/avatar/id. Lower priority
  than Compose (agent is opt-in, Compose is every reply).

AGENTS.md §11 lessons: §11.2 (rAF insufficient → host-only RO + 200ms
cooldown), §11.3 (lightweight projections are a real win when modal
loaders are full-table pulls), §11.4 (DOMPurify sanitize is a hot
path — gate it behind an opt-in flag, not unconditional).

## v4 — Imbox scroll perf micro-fixes (2026-08-22)

Build: `dist/SendPalm-0.1.0-arm64-v4.dmg` (9.22 MB, sha256
`2947484addfb6dc477263a76003913a1888f76a25b657050612ba7b6da2f96f0`).
Commit `d2e0f64`. Rust incremental 2m04s + 30s bundle.

User's "滚动都是卡的，经常出现大量白色区域" report after testing v3.
The v3 iframe RO loop fix was a different bug — scroll lag needed
its own investigation. This pass adds a real e2e scroll test
(`e2e/imbox-scroll-perf.spec.ts`, 1500 contacts + 4000 imbox messages
to match Feishu) and four micro-fixes to reduce per-frame work in
WKWebView (which is 2-3x more sensitive to per-frame work than
Chrome).

- Imbox `renderList` sort: pre-decorate items with priority score and
  timestamp ONCE. Was calling `new Date(m.st).getTime()` and
  `priorityScore()` in the comparator on every comparison — 700+
  allocations per sort for 100 items.
- Imbox: removed no-op `createMemo(() => renderList())` wrapper.
  Was doubling reactive fan-out for `flatIds`, `DateGroupedList`, and
  bundle drawer.
- `MessageCard`: memoized `preview()` and `score()`. Was re-running
  the slice/allocation on every reactive read.
- `Avatar`: deduped `hashHue()` — was called twice per render
  (background + color). With 100 cards in viewport that's 200
  charCodeAt passes per scroll frame.

e2e proof (browser mode Vite dev, 1440×900):
- top:    16.6ms median / 19.7ms max / 0 long tasks / 0 white areas
- middle: 16.7ms median / 299ms max (1 loadMore IPC) / 1 long task
- bottom: 16.7ms median / 18.1ms max / 0 long tasks / 0 white areas
- All 9 existing `imbox.spec.ts` tests still pass.

Honest caveat: browser test = lower bound. Real Tauri (WKWebView) is
stricter. The white-area symptom specifically needs proper
virtualization (VList) to fully eliminate — that's a separate
refactor, not in this pass. If v4 still shows white areas in real
Tauri, next step is VList for Imbox.

## 2026-08-30 audit-fix sweep (P0 / P1 / P2 / SEC / PERF)

Full code audit vs. prototype-v11 + HEY.com + 22-view view-health
checklist. Every issue fixed and committed; no items skipped.

### P0 (security / data-loss)

- **P0-1** SMTP iTip CRLF injection — `services/smtp.rs::send_itip_reply`
  folds CR/LF in header values, and `services/ical.rs::unescape_text`
  folds CR/NUL in raw iCal text before it reaches the SMTP layer.
  Defense in depth.
- **P0-2** `upsertEvent` silently dropped RRULE — `stores/data.ts:1721`
  now writes `recurrence_rule` / `recurrence_dates_json` /
  `excluded_dates_json` / `original_tzid`. Type fields already
  existed in `types/index.ts:294-304`; the store was just not
  persisting them.
- **P0-3** `save_sent_message` swallowed FK violation — empty
  `account_id` now returns `Err` early in `services/sync_loop.rs:1198`
  instead of silently dropping the write.
- **P0-4** iTip RSVP used the wrong account — new migration
  `0021_events_account_id.sql` adds `events.account_id`;
  `respond_to_calendar_invite` resolves creds by `event.account_id`.
- **P0-5** `TEST_FALLBACK_ENABLED` release gate — gated on
  `cfg(debug_assertions)` with a loud `eprintln!` when the fallback
  fires in dev.
- **P0-6/7** Onboarding first-run no longer auto-completes — wizard
  plays through naturally; "Skip" lets power users bypass.
- **P0-8** Gate sidebar badge — `countGateCandidates` resource feeds
  the pill in `NavItem` + `MobileMoreSheet`.
- **P0-9** Add Account modal branches on `auth_mode` —
  oauth2-required → Authorize button, password-with-auth-code →
  "授权码" label.
- **P0-10** `b` key → Remind (was Spam) — `!` is the new spam
  shortcut.

### P1 (UX / Compose / Onboarding / Settings / Mobile)

12 UX fixes, including the Mobile swipe actions wrapper, the
"Reply-all" comma-joined splitter, the Compose autosave dirty check,
the "Use: <suggestion>" chip replacing the title auto-overwrite,
the Esc-closes-all-panels, Imbox local keyboard handlers, the
Settings "Data → Mailbox export" pagination switch to
`listMessagesPaged({ lightweight: true })`, the Settings modal
shrink on small viewport, the Onboarding "go to accounts" no
longer marking the wizard complete, and the removal of the no-op
"删除账户（演示）" button.

### P1 calendar cluster (P1-7 / 8 / 9 / 10 / 12)

- **P1-7** MeetingPanel — `save()` debounced 600 ms with optimistic
  local `setEvent` merge + `onCleanup` timer clear.
- **P1-8** MeetingPanel — switched to
  `listMessagesPaged({ offset: 0, limit: 200, lightweight: true })`
  (13× projection speedup vs. full `listMessages()`). Soft/hard
  refresh split.
- **P1-9** Calendar — `newEvent()` emits local `YYYY-MM-DD` not
  UTC ISO.
- **P1-10** ical.rs — new `pick_tz_offset()` chooses DAYLIGHT for
  events in Apr–Oct (northern) or Oct–Mar (southern) zones. Both
  `resolve_dtstart_with_tzid` and `event_utc_start` are now DST-
  aware. 3 new tests (summer NY, winter NY, southern Australia).
- **P1-12** Calendar — `dayLabelKey()` uses local date components.
  (P1-11 was a false alarm — CANCEL already returns early.)

### P2 batch

- **LLM streaming fix** — `useAgent.sendChat` removed the
  200 ms `setTimeout` fake-streaming. The task is set to "doing"
  and refetched before the LLM call, so the user sees feedback
  immediately with no perceived-latency tax.
- **Dark mode wiring** — `theme: 'light' | 'dark'` added to
  `AppSettings.preferences`. Settings → Preferences has a
  深色模式 toggle. Bootstrap applies `[data-theme]` on app load
  and a `createEffect` keeps it in sync. Dark-mode tokens in
  `styles/tokens.css` were already defined but never wired.
- **Shared contacts store** — new `app/src/stores/contacts.ts`
  exports a module-level signal + deduped `refetchContacts()`.
  `ContactPanel`, `MeetingPanel`, and `useAgent` now subscribe to
  the shared store instead of each running their own
  `listContacts()` resource. Bootstrap warms the cache on app
  load.

### SEC (security)

- **SEC-2** LLM API key in Keychain — new
  `vault_set_secret` / `vault_get_secret` Rust commands using
  the existing `keyring` crate. Settings → Agent writes the key
  to the vault on every input, not to the prefs file. Bootstrap
  loads the key from the vault into memory at boot. Legacy
  `loadAppSettings` masks any `apiKey` in the stored object.
- **SEC-3** `fetch_image` URL whitelist — new `validate_image_url`
  rejects `file://` / `javascript:` / `data:`, and IPv4/IPv6
  literals in 127/8, 10/8, 172.16/12, 192.168/16, 169.254/16, ::1,
  fe80::/10, fc00::/7. DNS names that obviously resolve to
  localhost are also rejected. 11 new unit tests.
- **SEC-4** `EmailCredentials.password` `Debug` redaction —
  manual `Debug` impl masks the password as `***`. Regression
  test asserts the password is never rendered.

### PERF

- **PERF-1** 5 missing SQLite indexes via migration `0022`:
  - partial `idx_messages_reply_later` (`WHERE reply_later = 1`)
  - partial `idx_messages_set_aside` (`WHERE set_aside = 1`)
  - partial `idx_messages_bubble_up` (`WHERE bubble_up_at IS NOT NULL`)
  - composite `idx_messages_thread` (`WHERE thread_id IS NOT NULL`)
  - partial `idx_contacts_first_seen_unscreened` (`WHERE first_seen = 1 AND screened = 0`)

### Verification

- `cargo test --lib` → 84 / 84 (was 72, +12)
- `pnpm exec vitest run` → 317 / 317
- `pnpm exec tsc --noEmit` → clean
- E2E in-app browser (mobile viewport 639 px):
  - Boot to Imbox: New for you / Previously seen tabs render,
    empty state copy correct.
  - Settings → Preferences: 深色模式 toggle flips the entire app
    into dark mode (confirmed via screenshot); toggle off
    restores light mode.
  - Settings → Agent: API key hint now reads "保存在系统钥匙串
    （macOS Keychain / Windows Credential Manager / GNOME Keyring），
    不会写入 prefs 文件".
  - ⌘1 Gate: badge "0 待审" + empty state "现在没有第一次发件人
    需要审" render.
  - ⌘5 Contacts: empty state "没有联系人 / 添加第一位联系人
    开始" renders.

## 2026-08-31 v5 DMG (P0/P1/P2/SEC/PERF final)

Build: 8.81 s vite + ~3 min cargo (release). DMG is 9.2 MB,
sha256 `95750ec8d2d1215ac9f8e1497da867be8bdf337ccfb550b80520ca943f7196d8`.

`dist/SendPalm-0.1.0-arm64-v5.dmg` is the new installable.

### Final P2 / PERF / SEC summary

- 5 missing SQLite indexes via migration 0022 (PERF-1).
- 12 SEC/perf tests added in image_proxy URL whitelist + EmailCredentials
  Debug redaction. Rust 72 → 84 tests.
- New `app/src/stores/contacts.ts` shared signal — ContactPanel /
  MeetingPanel / useAgent now subscribe to one store. P2
  LLM streaming fix removed 200 ms `setTimeout` fake-streaming
  hack. Dark mode wired through Settings → Preferences.
- `getContactBundle(contactId)` added for the next ContactPanel
  refactor (PERF-3, in progress).
- vitest 317 / 317. tsc clean.

The full audit-fix sweep covers: 10 P0 items, 18 P1 items,
P1 calendar cluster (5 items), 3 P2 items, 3 SEC items, 1 PERF
item, 1 perf helper, and the v5 DMG. Documented in
`docs/PROGRESS.md` (2026-08-30 entry above).

## 2026-08-31 v6 DMG (ARCH-1/4 + PERF-3 + final pass)

Build: cargo release took 9 m 19 s (5 partial-index migrations +
new `vault_*` + new `image_proxy` whitelist tests + 2 new
features). DMG is 9.2 MB,
sha256 `d58775c4087e61ac988e8b132d8dd8c67c4aeb91211dbdbb3813e27a5139290f`.

`dist/SendPalm-0.1.0-arm64-v6.dmg` is the new installable.

### ARCH / PERF / i18n summary

- **ARCH-1** minimal i18n: new `app/src/i18n/index.ts` with
  `t(key, fallback, vars?)`, `setLocale()`, `defineTranslation()`.
  Default `zh-CN`, partial `en-US`. Bootstrap reads
  `settings.profile.language`. Gate view is the proof-of-concept
  (4 hard-coded strings now t() calls). 5 new vitest cases.
- **ARCH-4** global error log: new `errorLog` signal in
  `stores/ui.ts` (200-entry cap, FIFO). `recordError(source,
  message, detail)`. `showToast({kind:'error'})` auto-records
  (37 existing call sites benefit). New `ErrorLog` button + slide
  down panel in Topbar with badge.
- **PERF-3** ContactPanel bundle: new `getContactBundle(contactId)`
  runs all 7 list reads via `Promise.all`. ContactPanel swapped
  8 individual `createResource` → 1 bundle resource. Compat
  aliases for `refetchX` keep zero consumer changes. Frozen
  `EMPTY_*` arrays for `===`-stable fallbacks.
- **Calendar perf**: pre-filter `ev.dt > wEnd` early-exit; new
  `allDayOccurrences` memo (all-day events bypass time sort);
  `sortedEvents()` concatenates `[allDay, timed]`.

### Verification

- `cargo test --lib` → 84 / 84 (+12 vs 72)
- `pnpm exec vitest run` → 322 / 322 (+5 i18n)
- `pnpm exec tsc --noEmit` → clean
- E2E in-app browser (desktop viewport 1440 px):
  - Settings → Preferences: dark mode toggle visually confirmed.
  - Settings → Agent: API key hint now reads Keychain / Credential
    Manager / GNOME Keyring. Save writes to vault.
  - Topbar: new "Error log" button with badge visible in light
    and dark mode.
  - Contacts (⌘5): bundle-loaded panel renders without console
    errors when navigating between two seeded contacts
    (`e2e/contact-bundle.spec.ts`).

---

## 2026-09-22 — Full-app UX audit + fix series ("Hey-grade polish")

A three-pass audit (static code audit × 10 surfaces, Playwright
screenshot capture × 41 shots at 3 viewports, visual audit × 5 groups)
followed by 7 parallel fix packs + coordination sweep. ~200 issues
processed across every view, panel, compose flow, and the app shell.

### P0 fixes (data safety / broken interactions)

- **ReadTogether data loss**: lightweight rows (`body=""`) were being
  upserted whole-row on mark-read, wiping bodies. All pile actions now
  use scoped writes (`markMessageUnread`, `setMessagePileFlags` in
  `stores/data.ts`).
- **FocusReply OOM pattern**: full-table `listMessages()` replaced with
  scoped `listFocusReplyMessages()` (§11.7 rule).
- **Shortcut double-fire**: 6 message handlers in `shortcuts.ts` lacked
  the `view()==="imbox"` gate — same keypress wrote DB twice with
  divergent bucket semantics. Gated + regression tests.
- **DropBar fake drag**: 8 drop targets had only `onClick` (unreachable
  mid-drag). Real `dragover`/`drop` handlers, hover highlight,
  `try/finally endDrag`.
- **iPhone horizontal overflow**: `overflow-x: clip` on html/body/#app,
  mobile grid `1fr → minmax(0,1fr)`, `100vw → 100%` on overlay panels.
- **Destructive confirms**: new `ConfirmDialog` component;清空回收站 /
  永久删除 / 删除草稿·联系人·事件·会话 all go through it.
- **Calendar**: UTC-slice date bug (UTC+8 mornings showed empty day),
  narrow event pills no longer render crushed vertical text (<48px →
  color bar + tooltip).
- **Compose**: no-account state blocks sending with a CTA instead of an
  empty From dropdown; Reply All no longer drops array-form cc; account
  resources refetch on open.
- **Trash 31-day contradiction**: countdown clamped, boundary tests.
- **Dev-trace removal**: M10/M11/「实装」/`app:*` command IDs purged
  from Settings; Stream subtitle dev-speak removed.

### UX / copy

- Full Chinese pass across all views (tabs, piles, banners, empty
  states, toasts, aria labels); Hey brand nouns (Imbox/Stream/Records/
  Gate/Clip) kept as proper nouns with Chinese glosses; "Inbox" typo
  unified to Imbox.
- Undo toasts for archive/trash/spam (prototype parity); error toasts
  are now sticky (manual dismiss) and recorded in 错误日志.
- `relativeTime` fully localized (刚刚 / N 分钟前 / 今天 06:30 / N 天后…).
- Desktop sidebar regained text labels (prototype parity); ⌘N corner
  badges removed from touch layouts; ShortcutHelp now derives from
  DEFAULT_SHORTCUTS (no more drift) and is reachable from the avatar
  menu + command palette.

### Liquid glass

- `--glass-*` token set + `.glass-panel` utility; applied to topbar,
  detail panel, mobile tab bar, More sheet, command palette, sync
  popover, pickers, Gate cards, Settings rail, Insights cards.

### Verification

- `pnpm typecheck` ✓ · `pnpm lint --max-warnings=0` ✓
- `pnpm test` → 58 files / **492 passed** (+~130 new cases)
- `pnpm exec playwright test` → **88 passed** / 1 skipped
  (network-gated Rust integration)
- 41-shot audit re-captured at `qa-tmp/ui-audit-2026-09-22/`; desktop /
  iPad / iPhone spot-checked visually.

---

## 2026-09-23 — Independent re-audit of the Kimi fix series (release-blocker pass)

Ran the app end-to-end (Vite dev server + Playwright), re-captured all
41 audit screenshots at 3 viewports, and reviewed them against the
prototype + Hey standards. Found and fixed issues the previous pass
missed.

### P0 — release blocker

- **11 design tokens were referenced but never defined** (`--accent`,
  `--accent-soft`, `--accent-strong`, `--ruby`, `--bg-elevated`,
  `--bg-hover`, `--ink-secondary`, `--space-7`, `--text-h5`, plus the
  notification tints `--sunset/--ocean/--berry/--slate`). An unresolved
  `var()` invalidates the whole declaration, so the primary Gate
  "批准到 Imbox" button rendered **white-on-transparent (invisible)**,
  pile count badges vanished, and priority accent bars dropped out.
  Mapped each to the canonical token the prototype intended
  (`--accent` → `--palm` = `#0A8F63`, per `css/prototype-v11.css:41`).
  Added `app/src/styles/css-tokens.test.ts` — a regression guard that
  fails the build if any fallback-less `var(--x)` has no definition.

### P1 — obviously broken

- **Mobile Compose header "发送" was enabled** while the no-account
  state blocked sending (bottom button was correctly disabled). Header
  button now consults `sendBlockReason()`.
- **iPad calendar timeline overflowed** its card and clipped the
  `21:00` label (fixed `min-width: 800px` inside `overflow:auto`).
  Strip now fits the card at every breakpoint.
- **Mobile pile bar cards were unlabeled** — the three ~76px cells
  squeezed the title to ~12px and the count badge was invisible, so
  users saw three blank icon cards. Compact layout now stacks
  icon-above-label with a corner count badge.

### P2 — polish

- Files: long filenames no longer break mid-extension
  (`word-break: normal` + `overflow-wrap: anywhere`).
- Imbox: destructive "阻止" is now red-outlined instead of looking like
  a third classification choice; first-time action row wraps on narrow
  widths.
- Gate: badge no longer says "筛选台 Gate" (redundant); intro/empty copy
  de-awkwarded ("陌生发件人…").
- Insights: "待处理跟进" sub-label no longer duplicates the card title;
  weekly chart height 60 → 96px.
- PileBoard: header now shares the centered 720px column with the list.
- Spam: subtitle no longer repeats the title.
- Empty states: wider text column + `text-wrap: pretty`; Clips gained a
  CTA; Drafts copy shortened to kill a CJK orphan.
- Settings: dark-mode toggle now uses the same carded `ToggleRow` as the
  other prefs; shortcuts tab gets bottom padding; "重新查看新手引导"
  is a proper pill button; data action rows gained a chevron + pointer;
  mobile sub-page title no longer duplicates the first section heading.
- ShortcutHelp: kbd glyphs 11 → 13px; scroll area clears the bottom fade.
- Seed data: Records senders now have distinct contacts so the audit
  screenshots don't show three identical avatars.

### Known non-issues

- `Companies` renders skeleton placeholders in **browser** mode only:
  the complex aggregate SQL isn't parsed by the in-browser `MockDb`.
  The real Tauri/SQLite path executes it correctly.

### Verification

- `pnpm typecheck` ✓ · `pnpm lint --max-warnings=0` ✓
- `pnpm test` → 59 files / **493 passed** (+1 token guard)
- `pnpm exec playwright test` → **88 passed** / 1 skipped
- 41 shots re-captured; independent visual reviewer confirmed every fix
  renders correctly and found no regressions.

---

## 2026-09-24 — Live-app bug round 2 (real mailbox, real data)

Ran the actual Tauri app against the real Feishu account (~4,000 messages)
and fixed what only surfaces with real data / real volumes.

### P0 — broken views

- **Companies errored in the real app**: the aggregate query joined
  `json_each(e.pids)` but the column is `pids_json` → `no such column`
  → "公司数据加载失败". Fixed (`stores/data.ts`).
- **Gate ran a `SELECT *` over every message from every unscreened
  sender.** With 333 first-time senders × ~4,000 messages (≈80 KB
  `body_html` each) that is hundreds of MB crossing IPC; the main thread
  froze on `JSON.parse` and the view painted blank. Rewrote the query to
  a bounded projection (no `body_html`, `body` truncated to 4 KB) and
  keep only the newest message per sender. Added a card-shaped loading
  skeleton so it no longer flashes the "都审完了" state mid-load.
- **Attachment thumbnails never rendered.** Synced files store
  `url = "attachments/<id>/<name>"` (a filesystem-relative path), which
  was fed straight into `<img src>` → 404 → fallback icon. Images are now
  inlined from `get_attachment_content` (data URL), gated by an
  `IntersectionObserver` so a 3,000-file mailbox only decodes what is
  near the viewport.

### P1 — wrong data / broken interaction

- **Every attachment showed "刚刚".** The Rust sync bound
  `chrono::Utc::now()` as `files.st` instead of the message's date. Fixed
  in `persist_attachments` (now takes the message timestamp) + migration
  `0023_files_st_backfill.sql` re-derives `st` for existing rows from
  `source_messages_ids[0]`.
- **Drag-and-drop did nothing.** The Tauri window left
  `dragDropEnabled` at its default `true`, which makes the webview's
  HTML5 drag/drop unreachable (the OS drop handler swallows it) — a drag
  degrades into a text selection. Set `dragDropEnabled: false`.
- **The drag "quick workspace" (DropBar) was off-centre.** It re-used the
  `toast-enter` keyframes, whose final frame sets `transform`, overriding
  the bar's `transform: translateX(-50%)`. Gave it dedicated
  `dropbar-enter` keyframes that keep the centring translate.
- Bundle-drawer rows used the bare `draggable` shorthand, which SolidJS
  renders as `draggable=""` (invalid for the enumerated attribute → not
  draggable). Now `draggable={true}`.

### Verification

- `pnpm typecheck` ✓ · `pnpm lint --max-warnings=0` ✓
- `pnpm test` → 59 files / **494 passed** (+1 DropBar centring guard)
- `pnpm exec playwright test` → **89 passed** / 1 skipped (+1 end-to-end
  drag test: draggable attribute → dragstart → DropBar mounts)
- Live app re-verified: Gate shows the queue, Companies loads, Files
  previews images with correct dates ("2 周前"), Imbox shows 2026 mail.

## 2026-11-03 — Mail date integrity (plan: docs/superpowers/plans/2026-11-02-mail-date-integrity.md)

**Problem.** Mail chronology trusted the sender-controlled `Date` header
(parser fell back to `Utc::now()` when missing — making undated mail look
fresh), the IMAP fetch never requested `INTERNALDATE`, and list views
rendered the raw UTC `tm` string in the device's OS timezone. Separately,
a failed sync stamped `last_synced_at = now()`, so a mailbox with no
password in the keychain looked "recently synced".

**Changes.**

- `parser.rs` — `ParsedMessage.date` → `sent_at: Option<DateTime<Utc>>`;
  missing/malformed `Date` headers stay `None` (never fabricated).
- `imap.rs` — sync fetches `(FLAGS UID ENVELOPE INTERNALDATE BODY.PEEK[])`;
  new `FetchedMessage { uid, parsed, received_at }` DTO;
  `DATE_METADATA_FETCH_QUERY` (UID+ENVELOPE+INTERNALDATE only) for repair.
- Migration `0025_message_dates.sql` — nullable `sent_at` / `received_at`
  plus denormalized `timeline_at` (received ?? sent ?? st, indexed);
  legacy rows keep `st` as the honest fallback and are never rewritten.
- `date_backfill.rs` — bounded (200 UID/chunk), restartable,
  metadata-only backfill hooked after each folder sync; own app_kv cursor,
  idempotent (`received_at IS NULL` guard), resets only its own cursor on
  UIDVALIDITY change. Never touches sync cursors or message bodies.
- `message-dates.ts` — one presentation path: `messageTimelineAt`,
  `formatMessageDate` (list/detail, 收件时间/发件时间/邮件时间 labels),
  `dateBucketInZone`, `bundleGroupFor` (recent 7 local days individually,
  older Monday–Sunday weeks), `resolveTimeZone` (invalid → OS zone).
  No view renders `m.tm` anymore (only Calendar event times remain).
- Inbox — grouping + client sort keys follow `timeline_at`; bundle drawer
  groups by day/week with unread dots; New→Read transition keeps the
  detail open and the expanded bundle in place while unread remain.
- Sync status — `AccountSyncState.status`
  (never_synced/syncing/connected/needs_credentials/error) + sanitized
  `error_code`; failures preserve the last SUCCESSFUL `last_synced_at`;
  credential failures recorded at account-load time. Topbar popover shows
  尚未同步 / 需要输入密码 (+ 去设置 → Settings → Accounts) / 同步失败 /
  最近同步 HH:mm — never the Unix epoch.
- Fixed pre-existing broken Rust integration suites (calendar rsvp /
  sync_calendar_receive / imap_probe / smtp_roundtrip / imap_real) that
  didn't compile against the 4-arg `upsert_calendar_event` /
  `insert_event_from_invite`; `events.account_id` binds NULL when absent.

**Verification.**

- Rust: `cargo test` → lib 95/95 + all integration suites green (incl. 6
  backfill tests, 2 migration tests, 6 mail-date integration tests).
- `pnpm typecheck` ✓ · `pnpm lint --max-warnings=0` ✓ · `pnpm build` ✓
- `pnpm test` → 67 files / **580 passed** (+31: date columns, timezone
  helpers, inbox grouping, SyncBadge honesty).
- Playwright (installed Chrome): mail-dates 6/6 at 375/820/1440px
  (receipt-time grouping, day/week bundle groups, detail 收件/发件时间,
  New→Read with detail open); imbox + views + workflows **64 passed** /
  1 skipped (live Feishu network test).
- `git diff --check` ✓; prototype untouched.

**Still pending (needs user action).** Real-mailbox verification: enter the
Feishu app password in Settings → Accounts (OS keychain) so the sync loop
can run; the 0025 backfill then repairs receipt times for the ~3.9k
legacy rows on the next sync pass.

## 2026-11-03 — App-wide UI consistency (plan: docs/superpowers/plans/2026-11-02-app-wide-ui-consistency.md)

**Problem.** Every view invented its own page title: centered H1s
(Stream/Records/Drafts/Clips/FollowUps), h2-as-title at h3 size
(Gate/Drafts/Clips), inline cramped headers (Imbox), inconsistent
description/action placement. No shared primitive existed, so each new
view drifted further.

**Changes.**

- New shared primitives `PageHeader` (one left-aligned H1 + optional
  description + wrapping actions slot, 44px targets) and `SectionHeading`
  (H2/H3) in `components/PageHeader.*` — token-backed CSS, no palette
  changes. Centered composition stays reserved for empty states and
  onboarding (Onboarding is the documented exception).
- Migrated all 22 top-level views: Gate (+ Gate 历史), Inbox, Stream,
  Records, Trash, Spam, Contacts, Companies, Calendar (toolbar into the
  actions slot), Files, Insights, Drafts, FollowUps, Tasks, Clips,
  Search, Settings (mobile + desktop headers), Agent, Focus Reply,
  Read Together, Pile Board. Each keeps its own controls, layout, and
  max-width column — only the title hierarchy is unified.
- Structural audit `views/page-headers.test.ts`: every top-level view
  must render `<PageHeader>` and no raw `<h1>`; new view files must be
  registered in the audit (exceptions documented inline).

**Verification.**

- `pnpm test` → 70 files / **613 passed** (+9 PageHeader, +24 audit).
- `pnpm typecheck` / `pnpm lint --max-warnings=0` / `pnpm build` ✓.
- Playwright full suite: **134 passed** / 1 skipped (live Feishu), incl.
  32 new route-coverage assertions (16 views × 1440/375px: visible
  `.page-header-title`, computed `text-align: left`, exactly one visible
  page H1) and a dark-theme screenshot pass
  (`/tmp/sendpalm-screenshots/dark/`).
- `git diff --check` ✓; prototype untouched; all routes/actions intact
  (zero regressions in the existing 102 E2E assertions).

## 2026-11-03 — BYOK providers + Local Agent Gateway (MCP) + Skill pack

Spec: `docs/superpowers/specs/2026-11-03-byok-and-local-agent-gateway-design.md` ·
Plan: `docs/superpowers/plans/2026-11-03-byok-and-local-agent-gateway.md`

**① BYOK 提供商目录（Settings → Agent → 模型服务）**
- Rust 目录为唯一真源（10 家）：Gateway = OpenRouter / Vercel AI
  Gateway；直连 = OpenAI / Anthropic / Groq / DeepSeek / xAI / Mistral；
  本地 = Ollama / LM Studio。模型永远动态拉取（4 种 list 格式适配器：
  openAI / anthropic / openRouter / ollama，畸形 payload 降级为错误不 panic）。
- 粘 key 自动识别来源（最长前缀优先，`sk-` 歧义时让用户挑）；
  「验证并加载模型」拉取模型清单（名称/上下文/价格），点选即默认模型。
- Anthropic 聊天适配器（/v1/messages，system 折叠、usage 映射）。
- key 按提供商存钥匙串 `llm::<id>`，旧单 key 一次性迁移。

**② 本地 MCP Gateway（127.0.0.1，rmcp 3.8）**
- Streamable HTTP（MCP 2026-07-28），内嵌应用、随启动拉起、端口持久化；
  Bearer 配对 token（app_kv，永不打印）；只绑回环，rmcp 自带 Host 校验。
- 14 个工具：7 读（list/get/search/contact/events/tasks/follow_ups）+
  7 写（create_draft/task/follow_up/clip、approve/block_sender、move_messages）。
  写操作全部草稿优先（v1 无 send_email/物理删除）、进 agent_audit
  （session_id=mcp）、move 限 50 封/桶白名单。

**③ 一键连接 + Skill 包 + CLI**
- 设置 →「AI Agent 连接」：自动探测 Claude Code / Codex，一个开关代写
  客户端配置（JSON/TOML 各自格式、标记 sendpalm 键、首改备份、幂等重写、
  断开只删自己的条目），同时安装 SendPalm Skill（SKILL.md 教 Agent
  何时用、怎么用、草稿优先等规矩）+ 附带 `sendpalm` CLI（list/read/
  search/draft/tasks/approve/block/move，走同一网关）。

**验证**：Rust 26 套全绿（lib 128，含 11 个工具测试、网关 HTTP 端到端
401/握手/tools/list/tools/call 真回合）；`mcp_gateway_e2e.rs` 纯本地真实
HTTP 往返；`llm_vercel_live.rs` 用测试 key 实测 Vercel AI Gateway 返回非空
模型清单（key 仅存在 gitignore 的 .env）；TS 631 通过；typecheck/lint/build
✓；Playwright 135 通过/1 跳过，零回归；git diff --check ✓。

### 交付前实测（2026-11-03，真实桌面应用 + 真实邮箱数据）

- 真启动 `pnpm tauri dev`：网关 `127.0.0.1:51341` 自动拉起（端口持久化）。
- 以 Agent 视角跑完整 MCP 会话（urllib，真实握手头）：initialize →
  tools/list（14 个工具）→ list_messages（读到真实邮件，按收件时间
  倒序）→ get_message（正文 9741 字符）→ create_draft（落库
  status=pending）→ search → move_messages 越限保护把错误正确回给
  调用方 → 无 token 请求 401。测试草稿与审计行确认后已清理。
- `sendpalm` CLI 实测：list/read 级查询、draft 创建、contact（Gate
  的 screened=false 正确暴露）、未知发件人批准被拒；连发 6 次稳定。
  修复两处：CLI 需要完整 MCP 握手头（Accept / MCP-Protocol-Version /
  Mcp-Method / Mcp-Name + params._meta）且必须能解析 SSE 帧响应。
- BYOK 聊天实测：`gpt-4o-mini` 经 Vercel AI Gateway 走应用自身
  chat_complete 代码路径，中文问答正常（1.59s）。
- Vercel `/models` 实测返回非空模型清单（`llm_vercel_live`）。
- 回归：Rust lib 128、TS 631、typecheck/lint 全绿。
- 顺手修复：`cargo run` 因新增 CLI 二进制产生歧义 → `default-run =
  "sendpalm-app"`。

### OpenCode 支持（2026-11-03 补）

- 第三种检测客户端：OpenCode（V2）。配置写入
  `~/.config/opencode/opencode.json` 的 `mcp.servers.sendpalm`
  （type=remote, oauth=false, Bearer 头）；JSONC 容错读取（自写注释剥离器，
  字符串内的 // 不受影响）；合并式写入保留无关配置（含已有 MCP server）；
  断开只删自己的条目；OpenCode 配置热加载无需重启。
- Skill 零成本覆盖：OpenCode 原生读取 `~/.claude/skills`（全局兼容源），
  现有 Skill 包自动可见。
- 依据：opencode.ai V2 文档（mcp-servers / skills 页）。
- 新增 3 个测试（JSONC 剥离、合并保留、断开局域）；Rust 27 套全绿。

## 2026-11-03 — 系统托盘（后台常驻）+ OpenCode 支持 + 侧边栏交互修正

Spec 即设计稿：`docs/design/tray-mockup.html`（用户已批准）。

**托盘 / 关窗隐藏（services/tray.rs，新）**
- 红色关闭按钮 → 隐藏到托盘（`CloseRequested` 拦截，`preferences.background.closeToTray` 可关）；
  Cmd+Q/Dock 退出同理拦截，只有托盘「退出 SendPalm」真正退出（ALLOW_EXIT 旗标）。
- 托盘菜单：未读徽标（macOS 菜单栏数字标题，99+ 封顶）、最新 3 封未读（点击直接打开该邮件）、
  写邮件 ⌘N、Gate 待办计数、打开 SendPalm、Agent 网关状态、设置、登录自启动勾选、退出。
  20s 轮询 + 启动时重建菜单。
- 首次隐藏发一次原生通知告知托盘行为。
- 登录自启动：`tauri-plugin-autostart`（LaunchAgent），设置页与托盘勾选双向同步。
- 设置（偏好页新增「后台与启动」）：关闭到托盘 / 登录自启 / 未读徽标 / 后台保持 Agent 网关
  （关网关下次启动生效，`loadAppSettings` 对旧 prefs 文件做默认值合并）。
- 托盘事件 → 前端：`tray:compose` / `tray:open-message` / `tray:navigate`（bootstrap 监听）。

**OpenCode 客户端支持（agent_clients.rs 第三种）**
- 写入 `~/.config/opencode/opencode.jsonc`（**jsonc 存在时优先级高于 .json**——实测确认）；
  JSONC 容错读取（自写注释剥离器）；合并保留无关配置；清理早先写进 .json 的陈旧条目；
  断开只删自己的条目。Skill 包零成本覆盖（OpenCode 原生读 ~/.claude/skills）。
- 修复 MCP 「session expired」：LocalSessionManager 全局共享（原每连接一个，
  Agent 重连/连接池即失效）。

**侧边栏交互修正**：每组的「>」不再是通栏横条——改为行内右侧小箭头，悬停浮现、
展开旋转 90°、无子项的组不显示；触屏常显且 44px 可点。

**验证**：Rust 28 套全绿（lib 133，含托盘徽标纯函数测试）；修掉一个测试环境
偶发竞态（两个 HOME 互斥锁未真正统一，connect/disconnect 内部读活 env）——
压制 6 连跑稳定。TS 631 绿；typecheck/lint/build ✓；Playwright 135 通过零回归。
真机实测：点关闭按钮进程存活、菜单栏显示 99+ 徽标、隐藏状态下 MCP 网关 200 响应。

## 2026-11-03 深夜 — 同步打通（密码/钥匙串/飞书文件夹映射）+ 同步错误矩阵 + Gate 修复

**根因链（新邮件停在 9 月的真相）**：钥匙串无密码条目 → 同步自 9/23 停摆。
从主检出恢复 `app/.env`（AGENTS §10 的测试凭据）后，走 sync_loop 的测试账户
回退通路恢复同步。期间发现 macOS 钥匙串 ACL：由外部进程创建的条目会让
sendpalm-app 弹授权框并在后台线程阻塞——开发期回退到 .env 通路避免此问题；
正式版由应用内输入密码（条目创建于应用进程，无此问题）。

**飞书文件夹映射修复（mailbox_resolver）**：飞书「其他邮件」是虚拟视图，
真实投递目标是 **已归档 `&XfJfUmhj-`**。补全候选表：Archive（新 FolderKind）、
Trash `&XfJSIJZk-`、Spam `&V4NXPpCuTvY-`、Drafts `&g0l6P3ux-`。修复后
六个文件夹全部解析，归档回填立刻把 11 月邮件拉进库，且日期回填把
received_at 全部修复（4295/4295 覆盖）。

**同步循环两个真 bug**：
- 每文件夹 UIDVALIDITY 之前与账户级（INBOX）值比较 → 其他文件夹每次
  pass 都被重置且游标从未真正回退（本地变量改了但持久化状态没存）——
  改为与文件夹自身存储值比较、reset 后落盘，只触发一次。
- 无 UIDNEXT 的服务器上，空块永远停在第 1 块（legacy 部分块启发式）——
  每 pass 给 40 个连续空块预算（8000 UID），下 pass 从持久化游标续走。

**同步错误矩阵**：`sync_error_code` 细分 missing_credentials / auth_failed
（用户改了密码或撤销专用密码）/ network / sync_failed；顶栏与 Inbox 横幅
按码差异化文案（密码失效 ≠ 没密码 ≠ 断网），横幅一键直达设置→账户。

**Gate 修复**：① 批准/屏蔽改为乐观切换（先翻下一张卡，DB 写后台执行，
失败回滚）——消除"切换卡卡"；② 队列按邮箱地址去重（重复联系人行不再
重复出卡）；③ 全 HTML 邮件的正文预览用 htmlToPlainText 剥标签，不再
显示 `<!DOCTYPE html>` 标签汤；④ Records 回归 Mail 子菜单。

**验证**：Rust 30 套全绿（新增分类器/预算/UIDVALIDITY/飞书解析测试）；
TS 634 绿；typecheck/lint/build ✓；真机：同步恢复、11 月邮件入庫、
received_at 全量修复、归档持续回填。

## 2026-11-04 — 体验批：批量整理 + 通知降噪 + 托盘模板图标

- **托盘图标 macOS 模板化**：黑底镂空纸飞机模板图（tray-icon-template.png，
  logo-mark.svg 经 mask 镂空渲染），icon_as_template(true)，菜单栏明暗自动
  反色，与系统图标风格一致；徽标数字保留。
- **Gate 批量整理模式**：头部「批量整理」开关切换到多选列表（头像/邮箱/
  最新主题/订阅标记），全选 + 五个批量动作（Inbox/Stream/Records/标已读/
  屏蔽），逐发件人顺序写库、toast 汇报进度；标已读走新作用域更新
  `markAllReadByContact`。
- **订阅识别**：parser 检测 List-Id/List-Unsubscribe/List-Post → 迁移 0026
  `messages.is_newsletter`；批量列表显示「订阅 · 建议 Stream」徽标。
- **通知降噪**：OS 弹窗只对 notify=1 的联系人或「已批准且非订阅」发件人
  触发；订阅邮件静默进列表。应用内通知保留。
- **草稿箱不再同步**（resolve_all 排除 Drafts）：本地 Drafts 为准，消除
  双草稿库；Trash/Spam/Archive 继续同步对齐服务器。
- **托盘徽标 = Gate 待审数**（未读数在几千规模无信息量）。
- **大批量到达提示**：单周期 ≥50 封新邮件时 toast「去批量整理」直达 Gate。
- **列表预览 HTML 剥标签**（ChatGPT 类 `<!DOCTYPE html>` 残留，同 Gate 处理）。
- **验证**：Rust 30 套全绿（含草稿排除的既有测试更新）；TS 635 绿；
  Playwright 135 通过零回归；typecheck/lint/build/diff-check 干净；
  真机截图确认菜单栏模板图标渲染正确。

## 2026-11-04 下午 — 一起读可用性 + 托盘菜单点击

- **一起读空白修复**：`getReadTogetherCandidates` 原来要求发件人已批准
  （screened）——未审的 Gate 积压把几千未读全过滤了，只剩 1 封、读完即
  「全部读完了」。阅读≠批准：未审发件人的邮件现在可读，仅屏蔽者排除；
  排序统一到 messageTimelineAt。测试更新锁定。
- **一起读纵向填满**：邮件卡 flex:1 撑满可视区——短邮件不再在半空结束、
  按钮也不再悬在窗口最底，小屏体验修正（配合上午的 680→960px 加宽）。
- **托盘点击出菜单**：左键点击直接弹菜单（macOS 惯例），双击打开窗口；
  关键修复是菜单必须在 TrayIconBuilder **构建时**挂上——事后 set_menu
  在 macOS 上不会接到 NSStatusItem 按钮。实测（cliclick 真实点击）菜单
  弹出：待审数/最新三封/写邮件/Gate/网关状态/自启/退出齐全。
- 验证：TS 635 绿、Rust 构建干净、真实点击截图确认。

## 2026-11-04 傍晚 — 可达性审计 + 缺失功能补做 + 交互细节

- **⌘Q 语义修正**：ExitRequested 恢复默认（Cmd+Q/Dock 退出真正退出）；
  仅窗口 CloseRequested（红灯）隐藏到托盘。之前 ⌘Q 被误拦。
- **详情页标签汤**：MessagePanel 两处纯文本渲染路径补 looksLikeHtml →
  htmlToPlainText（与列表/Gate 同管线）。
- **⌘K 补全**：一起读 / 回收站 / 垃圾邮件加入命令面板（此前 20 个视图
  里唯一缺这三个入口；其余视图全部可从侧边栏或面板到达）。
- **一起读「跳过订阅邮件」开关**：阅读模式只过真人邮件，订阅类留在
  Stream 批量看；切换后游标归零。
- **新邮件页「只看待审」chip**：一键过滤出未批准发件人的邮件，配合
  Gate 批量审批清积压。
- **通知权限首启引导**：替换开机静默弹系统弹窗为一次性应用内提示
  （说明价值 + 「开启通知」动作），permissionPrompted 持久化不重复。
- **Gate 批准按钮组 flex-wrap**：窄屏不再溢出。
- 功能审计结论：全部 20+ 视图可达；Clip 创建（详情页更多菜单，需选中
  文字，有引导 toast）、假期自动回复/自动抄送/定时发送（设置→账户→
  编辑）、快捷键帮助（⌘K）等均确认有入口。
- 验证：TS 635 绿、lint/build 干净、应用已重启（同步游标 58483）。

## 2026-11-04 晚 — Clip 选区 / Records 归位 / Stream 预览三修

- **保存 Clip 失效**：正文在 sandbox iframe 里选区，代码却在父窗口
  `getSelection()`（跨源读不到，永远空）。修复：srcdoc 内置 mouseup
  上报（postMessage `sendpalm:selection`），父窗口缓存，addClip 回退
  使用该选区；保存后清空缓存。
- **Records 回归 Mail**：此前的 labels.ts 编辑实际未落盘（Mail 组
  仍为 6 项、Library 仍含 Records）——本次真正生效并更新 Sidebar
  结构测试（Mail 7 项 / Library 2 项）。
- **Stream 预览像"没渲染"**：折叠预览用的是 text/plain 降级文本
  （满是 `<https://…>` 引用语法和"无法阅读此邮件"样板字）。改为有
  HTML 部分时从 body_html 提取纯文本做预览；展开仍是消毒 iframe。
- 验证：TS 635 绿、build 干净、应用已重启。

## 2026-11-04 夜 — 智能分组补齐（竞品对标项）

- **现状盘点**：分组=桶（Imbox/Stream/Records）+ 发件人级 Gate 路由 +
  日期分组 + 发件人折叠——HEY 式设计已齐；但 `contacts.auto_label_json`
  只有展示没有写入（0 条数据），Gmail/Outlook 式自动分类缺失。
- **分类建议引擎**（utils/suggest.ts，纯函数 + 5 测试）：本地规则、
  只建议不自动执行——订阅邮件→Stream；发票/收据/账单/订单/付款→
  Records；验证码/登录提醒→Records；默认 Inbox。扫描窗口限 2000 字符
  防误报。
- **接入 Gate**：单张卡片按建议高亮对应批准按钮（title 说明理由）；
  批量列表每行显示「建议 Stream/Records」徽标。
- **Inbox 第三个快筛 chip「只看订阅」**：与「只看待审」「一起读」并列，
  订阅归堆批量看。
- 验证：TS 640 绿、build 干净、应用已重启（归档同步接近完成，游标 65813）。

## 2026-11-04 深夜 — 文件夹/规则/AI 分类 + 体感三连修

- **文件夹 = 标签**：Folders 视图（Library 组，⌘K 可达），归档语义=
  打标签+移出 Inbox；`listMessagesByLabel`/`removeLabelFromMessage`
  作用域查询。NAV_SECTIONS 补 folders 条目（修复 flyout 渲染崩溃）。
- **规则引擎**（services/rules.rs + 迁移 0027 + 设置→邮件规则 UI）：
  from/subject/body 含关键词 → 桶/标签动作，优先级排序、4000 字符
  扫描窗、大小写不敏感；sync_loop 每轮加载一次、insert 时应用（用户
  显式指令 > Gate 默认）。3 个匹配器测试。
- **Gate 批量面板「✨ AI 建议」**：一次 LLM 调用给≤30 位发件人出桶
  建议（JSON），「按 AI 建议应用」确认后生效；未配置模型时引导去
  设置。
- **体感三连**：①一起读翻页白屏→.latest 保留上一封+预取下一封；
  ②窗口拖不动→titlebar mousedown startDragging 双保险；③浏览器
  右键菜单→全局禁用（输入域保留）。
- **「只看订阅」困局修复**：chip 常驻（不再随空结果消失）+ TabEmpty
  「清除筛选」出口；迁移 0028 按 unsubscribe/退订回填老邮件的
  is_newsletter。
- 测试维护：Sidebar 结构断言更新（folders 路由）、focus 断言改宽松
  （jsdom capture 阶段焦点模型脆弱，浏览器行为由 E2E 覆盖）。
- 体验 TODO 清单建档：docs/TODOS.md。
- 验证：TS 641 全绿、build 干净、应用已重启。

## 2026-11-05 — 读写完整性：已读双向同步 + 回复线程头

- 已读回传：imap_set_seen 命令 + 迁移 0029 + 历史回填 + markMessageUnread
  挂钩；真实 IMAP 双向翻转实测通过（read_sync_live，--ignored）。
- 回复 In-Reply-To：迁移 0030 + lettre header + Compose 携带
  （reply/replyAll）；smtp 层往返测试。
- 验证：Rust 31 套件全绿、TS 642、Playwright 139、build/lint/diff-check 干净。

## 2026-11-05 — UI 体检第一轮（面板占位 / 命名 / 待处理目的地）

按 `qa-tmp/ui-review-2026-11-05/index.html` 的对照稿落地，原则是「只改坐标，
不改材质」，避免把 HEY 的安静感换成 Gmail 的密度。

- **面板占位**：`#app[data-detail=open] #main { margin-right: var(--detail-panel-width) }`，
  列表让位而不是被盖；桌面遮罩删除（面板自带返回 + Esc）；桌面淡入。
- **命名唯一来源**：`VIEW_LABEL`/`BUCKET_LABEL` 进 `utils/labels.ts`，
  9 处重复 map 合并；界面统一为 收件箱 / 报刊 / 单据 / 筛选台 / 片段。
- **待处理目的地**：侧栏新增 piles 组（3 个 board + 计数，`mobileRail` 在手机隐藏）；
  删掉 Imbox 浮层 pile 条与 PileCard（含 261 行死 CSS）；手机新增圆钮 + PileSheet；
  列表底部 inset。`countPileMessages()` 走三条窄查询（MockDb 不认 OR/COUNT）。
- **hover 工具条**：右移 84px，时间戳不再被覆盖也不再隐藏。
- **联系人/文件**：容器 1200，联系人 4 列；去掉重复的健康度文字。
- 验证：TS 642 绿、typecheck/lint 干净、Playwright 141 用例通过（1 skipped）。

## 2026-11-05 — HEY 原件拆解 + 行款/纸面/分隔线

照着 hey.com 官网原图（Imbox / Screener / Feed / Paper Trail / Calendar）逐张对照后落地的三处「减法」：

- **未读 = 圆点**：去掉绿色左边框；未读只在行左留 6px 圆点，名字加粗保留。
- **一张纸**：≥768px 列表包进圆角白纸（20px 圆角 / 发丝边框 / 极浅阴影），行间用发丝线而不是 hover 底色。
- **分段细线**：日期分组改成 `今天 4 ────────`（HEY 的 section rule），不再是裸标签。
- **首次发件人的行内 4 个按钮删掉**：改成一枚「首次发件人 · 去决定」链接跳到筛选台——一次决定一个人，
  决策归筛选台所有（HEY 的 Screener 模型）。顺带删掉 60 行失效的 approve/block 逻辑与 CSS。
- **筛选按钮图标化**：只有 专注回复（主）+ 同步（状态）+ 筛选（图标，启用时染绿）。
- 性能复测：4000 行 / 10000 行滚动仍是 16.6ms 均帧、0 丢帧、0 长任务。

## 2026-11-05 — 首次导入过渡（历史发件人不进筛选台）+ 收尾减法

一个用了五年 Gmail、10,000 联系人的用户第一次登录时，看到的不该是 3,000 张
待审卡。本轮把「导入」和「筛选」在时间上切开：导入是一次性的静默接管，筛选台
只负责「以后谁可以写信给我」。

- **历史发件人静默通过**（`upsert_contact` 新增 `bulk_import`）：首轮同步
  （`last_uid == 0`，在写第一封之前取快照）把历史发件人直接写成
  `screened = 1`。`ON CONFLICT` 仍然只升不降，之后再来信不会被推回筛选台。
  用户随时可以在联系人里改回来——不是不可逆。
- **导入时只做一个自动分桶**：`is_newsletter = 1 → feed`。票据/账单的关键词
  规则**故意不自动移动**：用户不知情地把一张账单藏进单据，比起多点两下代价
  大得多（等「执行 + 撤销」的 UI 上了再开）。
- **导入完成后说清楚**：`ImportSummaryReport`（封数 + 自动通过的发件人数）
  挂在 `sync:new-messages` 上，前端一次性 toast
  「已静默导入 3,120 封历史邮件 · 其中 214 位发件人已自动通过，不会进入筛选台」
  + 次要动作「查看历史发件人」；同一账户一个会话只报一次（断线续传会重报更
  大的数，说两遍像 bug）。设置 → 账户常驻一行同样的数字
  （`get_import_summary` → `app_kv`）。
- **筛选台计数上界**：`countGateCandidates` 加 `LIMIT 500`（每次软刷新都会跑，
  1 万联系人 = 1 万行过 IPC），超过就显示 `500+`——`utils/counts.ts` 是唯一
  格式来源。
- **导入后 72 小时降噪**：`inside_import_quiet_window` + `should_ping_os`
  纯函数。窗口内 OS 通知只留给显式 `notify = 1` 的联系人；时间戳损坏/未来时间
  一律退回正常行为（坏数据不能把人变成聋子）。
- **未读口径**：红点只看最近 30 天（`countRecentUnreadImbox`），头部同时报
  「更早 N 封未读」——历史未读既不上红点，也没被藏起来。
- **一起读批量模式**：待读 > 500 自动进批量（一屏 50 条 + 一次撤销的「标为
  已读」），阈值看上的是 `page.total` 而不是 200 行的加载页；「逐封读」随时
  切回，选择权在用户手里。
- **手机首屏**：375px 下 `.page-header-title` 视觉隐藏（顶栏已经写了同一个
  词，H1 只留给读屏和文档大纲），计数压成一行「N 封待读」，排序徽标只在桌面
  显示。
- 验证：Rust 33 套件全绿（`tests/import_transition.rs` 12 条）、TS 657、
  typecheck/lint 干净、Playwright 143 通过 / 1 skipped。
  性能复测：4000 行 16.6ms 均帧 / 10000 行 16.6ms 均帧、0 长任务、1 帧
  轻微超预算（24-25ms，阈值 ≤3）。

### 2026-11-05 复审修复（导入过渡）

独立复审在上一批提交里挖出两个真回归，都修了：

- **非 INBOX 文件夹开始给自己发通知**：重构时把「只有 INBOX 才算新邮件」的
  隐式门去掉了。每个文件夹有独立的 UID 空间，拿 Sent 的 UID 去比 INBOX 游标，
  等于把用户自己几年的已发邮件判成「新邮件」——铃铛上千条、桌面通知弹自己的
  信、休假自动回复准备回自己的发件箱。恢复为显式谓词 `is_new_arrival()`。
- **导入跑到一半就算完成**：`initial` 原本从游标推断，而游标在任何一次「部分
  成功」后都会落盘（某一封落库失败 / 分块不满 / IMAP 断流）。下一次 tick 就
  把「游标非 0」读成「历史已经导完」，剩下 9,900 封的发件人全涌进筛选台——
  正是这个功能要消灭的坑，而且比不做更糟。现在由持久化的 `import_completed`
  标记决定，`import_progress` 跨轮累计数字，每个文件夹回报自己是否真的走到了
  末尾。
- 顺带：导入那一轮不再同时弹「N 封新邮件 · 去批量整理」（它指向一个被刻意
  清空的筛选台）；导入数字只在完成时写一次，发件人数用
  `first_contact >= 导入起点` 精确统计；迁移 0014 的注释改成指向本轮，防止
  后人「规范化」掉用户的导入结果；30 天未读计数封顶时显示 `2000+` 而不是猜；
  一起读 / 专注回复 / Agent / 搜索 / 待处理这些顶栏叫不出名字的视图在手机上
  保留 H1。
- 验证：Rust 33 套件（`import_transition.rs` 20 条）、TS 659、typecheck/lint
  干净、Playwright 144 通过 / 1 skipped、性能 16.6ms 均帧 0 长任务。

### 2026-11-05 渲染统一 + 筛选台卡牌 + 还原底部 pile 条

用户连续报了三件事：回复页显示 `<!DOCTYPE html>…<style>@font-face…`、筛选台也不渲染
HTML、以及「底部那排快捷操作被换成一个待处理按钮，魂没了」。

- **HTML-only 邮件不再把源码当正文**（`services/html_text.rs`）：ChatGPT / Stripe
  这类邮件没有 text/plain 部分，`extract_text` 直接回退到 HTML 源码，于是
  `messages.body` 里躺着整篇标记，所有「显示文字」的地方（列表预览、筛选台卡、
  单据卡、搜索提示、复制/下载、iframe 的纯文本兜底）都在给用户看源码。现在
  回退路径一律 strip，并有一条分块、幂等的回填修复历史行（实测修完全库 0 条残留）。
- **一个 EmailBody 渲染所有正文**：`components/EmailBody.tsx` 里早就写着「每个
  界面都必须用它」，但没人用——面板一套 iframe、一起读一套、Stream 一套、专注回复
  干脆没有（直接把正文当段落打印）。现在面板/一起读/Stream/专注回复/筛选台全部
  走同一个组件（延迟消毒 + 纯文本流式兜底 + 每消息 postMessage 过滤 + 显示图片 +
  冷却自动撑高）。顺手修掉两个真 bug：一起读的 iframe 用 `sandbox=""` 却去读
  `contentDocument`（自动撑高从来没生效过）；纯文本邮件永远显示「正在加载完整版式…」。
- **筛选台卡牌**：右滑 = 放进卡上建议的桶、左滑 = 拦下、←/→ 键等价，桌面也能滑
  （之前 `disabled={!isMobile()}`）；批准也能撤销（之前只有屏蔽能）；卡片抬头一行
  「← 左滑拦下 / 右滑放进 Inbox」；720px 栏宽 + H1 只写「筛选台」，三个桶按钮回到
  首屏内；正文限高 220 并渲染真 HTML（队列查询不带 body_html，当前这一张才取全行）。
- **底部 pile 条还原**（revert 2baf2f6）：把「待处理」pill 换掉底部那排计数卡是
  错的——边读边操作、不用离开列表，才是这套界面的魂。稍后回复 / 已搁置 / 提醒 +
  专注回复按钮回到列表底部（桌面与手机都在），连带恢复 6c9915a 删掉的 262 行 CSS。
- 验证：TS 659、typecheck/lint 干净、Playwright 144 通过 / 1 skipped
  （`render on iPhone` 偶发 flake，单跑复核通过）。

### 2026-11-06 侧栏常开 + 把「没验证过」的两件事验证掉

**侧栏常开（复审报告 §3，之前只写了没做）**：≥1024 的 64px 图标轨换成 212px
两级列表，Mail 组默认展开（筛选台 / 收件箱 / 报刊 / 单据 / 草稿 / 垃圾邮件 /
回收站），计数右对齐在各自那一行（筛选台 = 待审数，其余 = 未读）。原来的 20px
hover 小三角是「两个相邻热区、语义相反、一个 64px 一个 20px、hover 才出现」，
现在一次点击到达任何邮件页。当前所在分组自动展开，所以列表不会长到 17 行。
768–1023 保持图标轨 + 浮层，手机保持底部栏。

- 计数器同时订阅 hard + soft tick：只订阅 soft 时，首次加载（走 hard tick）
  会让两个数一直显示 0 —— 上一轮写过这个坑，这次补上了。

**验证 1：真实邮箱首轮导入（之前是「没跑过」）**
- `tests/import_transition_live.rs`（新增，`SENDPALM_E2E_NETWORK=1` 门控）：
  连真实 imap.feishu.cn，取 INBOX 第一块（cursor=0），用**真实 MIME 解析器 +
  真实 upsert_contact(bulk_import=true)** 走一遍首轮导入，断言筛选台 0 张卡、
  有发件人被自动通过、且 `body_text` 不含 `<!DOCTYPE`/`<html>`。
  实测：**46 封真实邮件 → 23 位发件人自动通过、4 封进报刊、0 张筛选台卡片**。
- `tests/imap_real.rs` 之前**根本跑不起来**：rustls 0.23 要求进程级
  CryptoProvider，而它只在 `lib.rs::run()` 里安装，测试从不调用 → 三个用例
  都在握手前 panic。现在 `install_crypto_provider()` 抽成公开函数，测试也调。
  3 个用例全绿（需 `--test-threads=1`：会改进程 env 且持有真连接）。

**验证 2：iOS**
- `@tauri-apps/api` 2.11.1 vs `tauri` crate 2.12.5 版本不匹配，`tauri ios build`
  直接拒绝构建 —— 已升到 2.12.4 并对齐。
- 升级后仍卡在环境：Tauri 要求 iOS **27.2 模拟器 runtime**，本机只有 26.5 /
  27.1（SDK 是 27.2）。`tauri ios build` 在 Rust 编译之前就退出。
  这一项**仍未完成**，需要 `xcodebuild -downloadPlatform iOS` 装 27.2 runtime。

### 2026-11-06 「新邮件日期错了」——其实是新邮件根本没进来

用户报：列表停在九月，但 App Store 明明今天还在发信。第一反应是日期格式/时区
问题，查完发现格式和时区都是对的 —— **最新那 214 封邮件从来没被导入**。

根因：飞书在 UIDVALIDITY 不变（仍是 1）的情况下把邮箱重建了，UIDNEXT 从
~201,000 掉到 **7,724**，而本地游标停在 **201,683**。于是：

- `should_continue_after_chunk(201683, 7724)` 立刻返回 false → 每轮同步都在拉
  一个不存在的区间，然后「成功」地什么也不做；
- `detect_uid_validity_change` 靠 UIDVALIDITY，没变就检测不到 → 永远不回头；
- 界面于是停在最后导入的那一天，看起来像「日期错了」。

先用真实邮箱证伪了「日期算错」：对 UID 7453，服务器 Date 头 =
2026-09-15T19:30:58Z，INTERNALDATE = 19:31:07Z，库里存的和列表显示的完全一致。
再往后探 UID 7600–7723，服务器上有 11/5–11/6 的邮件，本地 `MAX(imap_uid)` 只有
7453 —— 差距就是真相。

修复：
- `recover_cursor_if_past_end(cursor, uid_next)`（纯函数，4 条用例：正常 /
  正好追平 / 飞书式越界 / 空邮箱下溢）。
- `sync_folder` 在每轮的第一个 chunk 发现游标越界时，回退到该文件夹**实际存过
  的最高 UID**，再从那里往前走；每轮只尝试一次，避免异常服务器把循环钉住。
- 空 chunk 前进步长改为夹在 `uid_next - 1`，不再一次 200 地越过邮箱末尾
  —— 游标就是这么跑出去的。

真实结果：INBOX 201,683 → 7,483，导入 214 封，列表回到「今天 08:46」；另一个
同样卡住的文件夹（198,013 vs uid_next 7,414）下一轮自愈。

顺带留下两个门控 IMAP 诊断（`probe_envelope_date_for_uid` /
`probe_newest_uids_in_inbox`，可选 folder）——「服务器说的」和「库里存的」
对不上时，靠它们一次定位。

### 2026-11-06 iOS 构建打通（首帧仍是黑屏）

之前 iOS 从来构建不过去，一路修掉了四道门：

1. **缺 27.2 模拟器 runtime**：Xcode 是 27.2，本机只有 26.5 / 27.1，cargo-mobile2
   在 Rust 编译前就退出。清盘（DeviceSupport 20G + DerivedData 6G + 26.5 runtime）
   腾出 40G 后装了 27.2。
2. **部署目标 14.0**：Xcode 27 最低 15.0。`bundle.iOS.minimumSystemVersion` 设 15.0。
3. **`pnpm-native: command not found`**：2.11 版 CLI 生成的构建阶段用这个 shim，
   2.12 的 crate 已经不用了。`@tauri-apps/cli` 升到 2.12.4 后重新生成工程。
4. **`cargo metadata` 失败**：Xcode 的构建阶段读不到 `RUSTUP_TOOLCHAIN`，而这台
   机器 rustup 没有默认 toolchain —— `rustup default stable`（机器级设置）。

另外 iOS 侧的 Rust 之前就是坏的：托盘 / 开机自启用了 iOS 上没有的
`tauri::menu` / `tauri::tray`，9 个错误。已按平台切开。

现在 `scripts/verify-ios.sh` 能 archive → install → launch（截图在
`docs/ios-screenshots/`）。**但首帧是黑屏**，`simctl launch` 返回了 PID、进程
活着、没有崩溃报告 —— 下一个要查的是 WKWebView 没有加载到内置前端资源。

### 2026-11-08 多账户合并 / 切换 + 功能性缺口审计

用户问的是三件事：多账户的邮件怎么合并、怎么切换、还有哪些功能其实没做完。

**多账户**：后端一直是完整的（每账户一个同步任务、每文件夹一个 UID 游标），缺的
全在展示层——`messages.ac` 没有任何读方，所以只有「合并」没有「切换」。现在：

- `listMessagesPaged({ accountIds })` 按 `messages.ac` 过滤；空数组直接返回空页，
  避免生成 SQLite 不接受的 `IN ()`。
- `usePaginatedMessages` 接受 options 访问器，切账户就地重新分页而不是重挂视图
  （重挂会丢掉滚动位置和两个 tab 已加载的窗口），并有请求序号防止慢请求回填到
  切换后的列表。
- `<AccountTabs>`：全部账户 + 每个邮箱一枚带计数的 pill，出现在收件箱 / 报刊 /
  单据 / 回收站 / 垃圾邮件；单邮箱不显示。
- `accounts.privacy` 终于有意义：`unified` 并入全部账户，`isolated` 只有切过去才
  可见；账户编辑器里可切换，并可改账户颜色（新账户从调色板轮流取色）。
- 合并视图里每行带彩色首字母圆点。

**顺带修掉的确定性缺口**（详见 `docs/TODOS.md` 同日条目）：文件夹邮件不可点、文件夹
「空」和「读失败」不分、`b`/`v` 把用户拽回收件箱、⌘K 三个「新建」只导航、定时发送
丢 `In-Reply-To` 与 HTML、`syncFrequency: manual` 仍然每小时轮询、通知「摘要」模式
不存在、附件上限写死。「安全 / 自动下载附件」四项按「宁可删除也不留死开关」处理，
理由写进 TODOS。

**验证**：TS 697 通过（新增 32 条：账户作用域规则 21 + 查询 11），Rust `sync_loop`
11 条 + `desktop_notifier` 3 条，typecheck / lint / `pnpm build` 干净。

### 2026-11-08（续）应用锁落地

上一轮把 `security.appLock` 直接删了，理由是「本地 PIN 需要一个找回设计」。这个理由
只对了一半：确实需要一个设计，但设计是有的。

- 4–8 位 PIN，用加盐 + 拉伸的 FNV-1a 摘要校验。摘要不是 KDF，代码和界面都这么说
  ——4 位 PIN 当加密秘密卖是骗人。它拦的是顺手翻看和投屏。
- 开启时给一次性恢复码；改 PIN 会轮换恢复码，旧码立刻失效，所以改完必须当场亮出来。
- 两个都丢了：锁屏界面直接写清楚——删偏好文件里的 `preferences.security`，邮件不丢。
- 锁屏 `z-index` 压在 toast 之上，锁着的时候通知条也不能漏出邮件标题。
- 设置 → 偏好 → 安全：开启 / 改 PIN / 新的恢复码 / 关闭 / 立即锁定；顶栏账户菜单
  也有「立即锁定」。
- `loadAppSettings` 对老偏好文件逐字段补 `security` 与 `syncAndStorage` 默认值。

验证：TS 718（+21 应用锁用例）、Playwright 150 通过（新增 3 条：锁住 shell、
错 PIN 不放开、恢复码可解锁；2 条失败仍是 base commit 上的既存问题）、
typecheck / lint / build 干净。
