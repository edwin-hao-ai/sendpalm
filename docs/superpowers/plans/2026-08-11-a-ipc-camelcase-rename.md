# Plan A: IPC snake_case → camelCase Rename (Compose Send 修复)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 修 `app/src/services/{backend,notifications}.ts` 里 9 个 snake_case payload keys → camelCase,让 6 个静默断裂的 IPC 命令 (含 `send_message`) 真正能工作;Compose 实际能发出邮件。

**Architecture:** JS 端纯字面量替换 + TS shorthand 语法 (`{ accountId }` 而非 `{ accountId: accountId }`)。Rust 不动 (`safeInvoke` 抽象保留;`@tauri-apps/api/core.invoke` 保留)。Vitest 单测 mock `@tauri-apps/api/core.invoke` 捕获 (cmd, args) tuple,断言 payload shape 与 Tauri 2 camelCase 默认一致。

**Tech Stack:** TypeScript (ES2020), Vitest, Vite. No new deps.

## Global Constraints

Verbatim from spec + AGENTS.md:
- AGENTS.md §3.2: no `any` in TS, no magic strings.
- AGENTS.md §3.4: IPC crossings require integration tests — 9 unit tests added.
- AGENTS.md §3.5: conventional commits; one logical change per commit (this plan produces 1 commit).
- AGENTS.md §3.7: PR-ready cadence; verification-before-completion; no "we'll fix it later" markers.
- AGENTS.md §11: silent-break trap (key renames must be exhaustive).
- Spec §4: 9 string-literal replacements + 1 interface field rename; no Rust touched.
- Spec §9: Definition of Done — lint/typecheck/test all green; manual SMTP verification on `edwinhao@sendpalm.com`.
- Tauri 2 default convention (https://v2.tauri.app/develop/calling-rust/): JS payload keys are camelCase; `#[tauri::command]` parameters are snake_case; Tauri auto-converts.
- No source modifications outside the 2 listed files (per spec §3).

---

## Task A.1: Rename keys in `app/src/services/backend.ts` + `SendOpts` interface

**Files:**
- Modify: `app/src/services/backend.ts:29` (interface field `account_id` → `accountId`)
- Modify: `app/src/services/backend.ts:72,73,77,84,93` (5 payload keys)
- Read first: `app/src/services/backend.ts` (163 lines, especially lines 25-100)

**Interfaces:**
- Consumes: current `backend.ts` with snake_case payload keys + `account_id: string` interface field.
- Produces: `backend.ts` with all camelCase payload keys + `accountId: string` interface field. TS shorthand syntax used everywhere a key matches its variable.

- [ ] **Step 1: Read current `backend.ts` lines 1-100**

Verify the exact code shape. Note especially:
- The `SendOpts` interface (around line 29).
- The 5 call sites at lines 67-77 (send_message), 82-86 (fetchMailboxes), 92-94 (syncNow).

- [ ] **Step 2: Rename `account_id: string` → `accountId: string` (interface field)**

```diff
- account_id: string;
+ accountId: string;
```

- [ ] **Step 3: Rename payload keys at lines 72, 73, 77 (send_message call)**

```diff
  return safeInvoke<{ message_id: string; local_message_id?: string }>(
    "send_message",
    {
      to, subject, body,
-     html_body: htmlBody,
-     account_id: accountId,
+     htmlBody,
+     accountId,
      attachments, cc, bcc,
-     from_override: fromOverride,
+     fromOverride,
    },
  );
```

Use TS shorthand — `htmlBody, accountId, fromOverride,` not `htmlBody: htmlBody, ...`.

- [ ] **Step 4: Rename payload key at line 84 (fetchMailboxes call)**

```diff
  const r = await safeInvoke<string[]>("list_mailboxes", {
-   account_id: accountId,
+   accountId,
  });
```

- [ ] **Step 5: Rename payload key at line 93 (syncNow call)**

```diff
  return safeInvoke("sync_now", {
-   account_id: accountId,
+   accountId,
    mailbox,
  });
```

- [ ] **Step 6: Run `pnpm typecheck`**

```bash
cd app && pnpm typecheck 2>&1 | tee qa-tmp/audit-2026-08-11-fix-a-typecheck.log
```

Expected: 0 errors. If errors, check that `SendOpts.accountId` is the only field name change in the interface, and that no other file in `app/src` references `SendOpts.account_id`. (`grep "SendOpts"` may surface callers.)

- [ ] **Step 7: Do NOT commit yet**

Task A.2 adds more renames + tests. Single commit at the end (per spec §4 commit message).

---

## Task A.2: Rename keys in `app/src/services/notifications.ts`

**Files:**
- Modify: `app/src/services/notifications.ts:45,46,47,48` (4 payload keys)
- Read first: `app/src/services/notifications.ts` (53 lines)

**Interfaces:**
- Consumes: `notify_settings_changed` invoke call with 4 snake_case payload keys.
- Produces: same call with 4 camelCase payload keys. (`NotifyPrefs` interface is already camelCase — no change needed.)

- [ ] **Step 1: Read current `notifications.ts` lines 40-53**

Confirm the exact shape of the `notify_settings_changed` call.

- [ ] **Step 2: Rename 4 payload keys**

```diff
  await invoke("notify_settings_changed", {
-   desktop_enabled: prefs.desktop,
+   desktopEnabled: prefs.desktop,
-   quiet_hours_enabled: prefs.quietHoursEnabled,
+   quietHoursEnabled: prefs.quietHoursEnabled,
-   quiet_hours_start: prefs.quietHoursStart,
+   quietHoursStart: prefs.quietHoursStart,
-   quiet_hours_end: prefs.quietHoursEnd,
+   quietHoursEnd: prefs.quietHoursEnd,
  });
```

- [ ] **Step 3: Run `pnpm typecheck` again to confirm**

```bash
cd app && pnpm typecheck 2>&1 | tee qa-tmp/audit-2026-08-11-fix-a-typecheck.log
```

Expected: 0 errors. (`NotifyPrefs` interface already uses camelCase; verify the `desktop` field is correctly typed.)

- [ ] **Step 4: Do NOT commit yet**

A.3 adds tests, A.4 commits.

---

## Task A.3: Add Vitest unit tests for `backend.ts` payload shapes

**Files:**
- Create: `app/src/services/backend.test.ts`
- Read first: `app/src/services/backend.ts` (163 lines — to know all 11 export names)

**Interfaces:**
- Consumes: `backend.ts` exports (`sendMessage`, `fetchMailboxes`, `syncNow`, `getSyncState`, `listEmailProviders`, `vaultSave`, `vaultLoad`, `vaultDelete`, `addCalendarEvent`, `getAttachmentContent`, `getAttachmentPath`).
- Produces: 1 Vitest test file with 4 tests:
  1. `sendMessage` — payload is camelCase + no snake_case keys.
  2. `fetchMailboxes` — `{ accountId }`.
  3. `syncNow` — `{ accountId, mailbox }`.
  4. Regression guard for 7 already-correct commands.

- [ ] **Step 1: Create `app/src/services/backend.test.ts`**

Use the exact code from spec §4.3, with `vi.mock("@tauri-apps/api/core", ...)` (NOT `@/ipc/commands` — the latter only exports `pingGreet` and won't intercept).

- [ ] **Step 2: Run the new tests**

```bash
cd app && pnpm test -- backend.test 2>&1 | tee qa-tmp/audit-2026-08-11-fix-a-test-backend.log
```

Expected: 4 tests pass.

- [ ] **Step 3: If any test fails, debug**

Most likely failure mode: the `vi.mock` factory function timing — Vitest hoists mocks; verify the factory references only variables that exist at hoist time (`vi.fn()` is hoisted-safe). If TS complains about `as never`, the cast is intentional — the mocks lose real types.

---

## Task A.4: Add Vitest unit test for `notifications.ts` payload shape

**Files:**
- Create: `app/src/services/notifications.test.ts`

**Interfaces:**
- Consumes: `notifications.ts` exports `notifySettingsChanged` (via dynamic `await import("@tauri-apps/api/core")`).
- Produces: 1 Vitest test verifying `notifySettingsChanged` payload is camelCase.

- [ ] **Step 1: Create `app/src/services/notifications.test.ts`**

Use the exact code from spec §4.3, with `vi.mock("@tauri-apps/api/core", ...)`.

- [ ] **Step 2: Run the new test**

```bash
cd app && pnpm test -- notifications.test 2>&1 | tee qa-tmp/audit-2026-08-11-fix-a-test-notifications.log
```

Expected: 1 test passes.

---

## Task A.5: Full verification sweep + commit

**Files:**
- Stage: `app/src/services/backend.ts`, `app/src/services/backend.test.ts`, `app/src/services/notifications.ts`, `app/src/services/notifications.test.ts`
- Modify: nothing new

**Interfaces:**
- Produces: 1 conventional commit on `main` with the exact message from spec §4.

- [ ] **Step 1: Run full test suite**

```bash
cd app && pnpm test 2>&1 | tee qa-tmp/audit-2026-08-11-fix-a-test-full.log
```

Expected: all tests pass (137 existing + new tests for backend + notifications).

- [ ] **Step 2: Run typecheck + lint**

```bash
cd app && pnpm typecheck 2>&1 | tee qa-tmp/audit-2026-08-11-fix-a-typecheck-final.log
cd app && pnpm lint 2>&1 | tee qa-tmp/audit-2026-08-11-fix-a-lint-final.log
```

Expected: typecheck 0 errors; lint same as before (1 pre-existing ESLint error in `views.spec.ts` unchanged).

- [ ] **Step 3: Verify no `.env` or secrets staged**

```bash
git diff --cached --name-only | grep -E "\.env$|password|secret" || echo "ok no secrets"
```

- [ ] **Step 4: Verify only 4 files modified, no source drift**

```bash
git diff --cached --name-only
```

Expected: `app/src/services/backend.ts`, `app/src/services/backend.test.ts`, `app/src/services/notifications.ts`, `app/src/services/notifications.test.ts` — exactly 4 files, no `app/src-tauri/`, no `app/src-tauri/src/`, no `app/src/panels/`.

- [ ] **Step 5: Manual SMTP verification (per spec §9 DoD)**

Skip if no `.env` / no SMTP credentials available — instead document the manual step in the commit body.

When `.env` is present:
1. `pnpm tauri dev`
2. Click Compose, fill: to=self, subject=`Audit A verification 2026-08-11`, body=`send_message IPC working`
3. Click Send
4. Check feishu.cn webmail inbox for the message
5. Verify Send toast shows `message_id` (not `null`)

- [ ] **Step 6: Commit (1 commit)**

```bash
cd /Users/edwinhao/sendpalm
git add app/src/services/backend.ts \
        app/src/services/backend.test.ts \
        app/src/services/notifications.ts \
        app/src/services/notifications.test.ts
git commit -m "fix(ipc): rename JS payload keys to camelCase (Tauri 2 default)" \
  -m "Per audit report 2026-08-11 (commit cb95452) §3.3 + §7 HIGH-risk
candidate #1: 6 of 12 IPC commands silently returned null because
JS sent snake_case keys but Tauri 2 expects camelCase. Most
visible breakage: send_message (Compose 'sent' but no email
left), sync_now (Sync button no-op), notify_settings_changed
(notification prefs never reached the sync loop).

Fix: 9 payload keys renamed to camelCase + SendOpts interface
field sync. JS-side only (per brainstorm §3.1); Rust unchanged.
TS shorthand used everywhere key matches its variable.

Tests: 5 new unit tests (Vitest) covering all 11 backend IPC
wrappers + notifySettingsChanged, with not.toHaveProperty
regression guards against snake_case keys on every changed
command + no-underscore assertion for the 7 already-correct
commands.

Manual verification: SMTP roundtrip on edwinhao@sendpalm.com
account (see commit body or PR comments for details).

Refs: docs/superpowers/specs/2026-08-11-a-ipc-camelcase-rename-design.md
Refs: docs/superpowers/audit/2026-08-11-email-html-link-audit.md §3.3, §7"
```

- [ ] **Step 7: Verify commit**

```bash
git log --oneline -3
git show --stat HEAD | head -10
```

Expected: 1 new commit `fix(ipc): rename JS payload keys to camelCase (Tauri 2 default)`, 4 files changed.

---

## Self-Review (per writing-plans skill)

**1. Spec coverage:**
- Spec §1 (背景) → Task A.1-2 rationale ✅
- Spec §2 (目标) → Task A.1-2 + A.3-4 deliverables ✅
- Spec §3 (非目标) → all 8 excluded items: Rust untouched (A.1-2 verify); `safeInvoke` untouched (mock test); `commands/mod.rs` untouched (out of scope); `IcalEvent` untouched (deferred); other sub-projects untouched (B/C/D/E in their own plans); ESLint rule deferred; `app/.env` untouched; `safeInvoke` 抽象保留 ✅
- Spec §4 (改动清单) → A.1 step 2-5 (5 backend.ts changes), A.2 step 2 (4 notifications.ts changes), A.3-4 (test files) ✅
- Spec §8 (测试策略) → A.3 (backend.test.ts), A.4 (notifications.test.ts), A.5 step 1-2 (full sweep), A.5 step 5 (manual SMTP) ✅
- Spec §9 (DoD) → A.5 step 1-7 maps 1:1 ✅
- Spec §10 (风险) → A.5 step 3-4 verify no secret/drift ✅
- Spec §11 (与其他 sub-project 依赖) → plan covers only A ✅

**2. Placeholder scan:**
- "TBD" / "TODO" / "fill in" / "implement later" → 0 (grep'd plan)
- "Similar to Task N" → 0
- All bash commands have explicit content; no "run appropriate tests".

**3. Type/接口 一致性:**
- A.1 modifies `backend.ts:29` interface field; A.3 tests cover this interface via the actual export.
- A.2 modifies `notifications.ts:45-48`; A.4 tests cover this.
- TS shorthand syntax used in both A.1 and A.2 — consistent with plan §4 (spec).
- Mock path is `@tauri-apps/api/core` in both A.3 and A.4 — consistent (corrected from earlier draft).
- Commit message in A.5 step 6 references audit report §3.3 + §7 + spec path — consistent.
- All log paths under `qa-tmp/audit-2026-08-11-fix-a-*.log` — distinct from audit `audit-2026-08-11-*.log` files (already committed in `cb95452`).