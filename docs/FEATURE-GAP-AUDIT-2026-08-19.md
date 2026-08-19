# SendPalm Feature Gap Audit — 2026-08-19

> Static code-level scan of `app/src/views/`, `app/src/panels/`, `app/src/agent/`,
> `app/src/components/`, `app/src/stores/data.ts`, and the 7 Onboarding / Settings
> tabs. Cross-referenced against `docs/PRD-v1.md` §3.1–§3.22.
>
> Companion to `docs/PERF-AUDIT-2026-08-19.md` (that one covered structural
> performance; this one covers **what isn't actually wired up**).

## TL;DR

SendPalm is, by design, a **local-first mock-data + M10-real-backend** hybrid.
The vast majority of the v1 PRD is implemented. There are exactly **3 high-priority
real bugs** (one wrong metric, one missing UI, one dead-code import) and a
small set of **honest "M6 / M10 实装" placeholders** that the prototype ships
because the corresponding real backend isn't built yet. There are no
"half-wired" features hiding behind a `showToast` admission-of-defeat — those
were all removed in earlier cleanup rounds.

| # | Severity | Area | Symptom |
|---|---|---|---|
| B1 | **HIGH** | Insights | "Replied (last 30 days)" card returns read-inbox count, not reply time |
| B2 | **HIGH** | Files | PRD §3.6 advanced filters (date / sender / size) are not in the UI |
| B3 | MEDIUM | Imbox | `const _placeholder = getMessage` dead-code hack |
| A1 | LOW (deferred M10) | Agent | "（M6 接入真实 LLM）" hardcoded response in `useAgent.sendChat` |
| A2 | LOW (deferred M6/M10) | Settings | "M6 实装" / "M10 实装" copy in Agent / IM accounts tabs |
| A3 | LOW (misleading) | Onboarding | Shows "IMAP IDLE" but actually polls every 60s |
| C1 | LOW (perf) | Topbar | Two 10-second `setInterval`s for state that has a push event |
| C2 | LOW (perf) | FollowUps, Insights, Companies, Files | Still use full-table `listMessages`/`listContacts`/`listEvents`/`listFiles` |
| D1 | N/A (by design) | Spam | Manual bucket only; no auto-classification (M10 backend) |

---

## B. Real bugs (worth fixing now)

### B1. Insights "Replied (last 30 days)" card is misnamed

**File:** `app/src/views/Insights.tsx:71-75`

```typescript
const replyTime = createMemo(() => {
  const list = messages() ?? [];
  const incoming = list.filter((m) => m.bucket === "imbox" && !m.unread);
  return incoming.length;  // <-- this is "read inbox count", not reply time
});
```

The card label is `Replied (last 30 days)` and the secondary text is
"已读消息总数" (which already says "read messages total" — internally
inconsistent with the title).

PRD §3.7 calls for "average reply time" — that needs the time delta between
`messages.st` and the sent reply's `st`. The data is there
(`messages` has `st`; outgoing sent messages have `direction = 'sent'`),
but the implementation just counts read inbox messages.

**Fix options** (pick one):

- **Rename + simplify** — change card to "Read inbox (last 30 days)" and keep the
  current computation. Honest.
- **Real reply-time** — filter inbox messages received in the last 30 days, pair
  with their sent replies (by `thread_id`), compute median delta. PRD-aligned but
  needs SQL aggregation; the per-message loop is O(N) and won't scale to the
  3,900-message Feishu account without `LIKEWELL` windowing.

### B2. Files view missing advanced filters

**File:** `app/src/views/Files.tsx`

Header comment (line 1): "Files view — grid with type filters + advanced filters."
Code only has the type filter (`typeFilter` signal, lines 24-26) and a name
search (line 27). No date range, no sender, no size filter — none of the three
filters PRD §3.6 calls for.

**Fix:** add 3 collapsed "Advanced" controls (date from/to, sender dropdown, size
min/max) wired to existing `listFiles()` slice. The data already has
`f.st` (timestamp), `f.pid` (sender), and a `size` column.

### B3. Imbox unused import hack

**File:** `app/src/views/Imbox.tsx:1769-1770`

```typescript
const _placeholder = getMessage; // keep import used
void _placeholder;
```

`getMessage` is imported but never called — the file was a leftover after
MessagePanel was refactored to use `usePaginatedMessages`. AGENTS §3.2 forbids
dead code. Two-line fix: drop the import and the placeholder lines.

---

## A. Honest "M 实装" placeholders (by design, but worth flagging)

### A1. Agent LLM responses are fake

**File:** `app/src/agent/useAgent.ts:138-167` (`sendChat`)

```typescript
setTimeout(async () => {
  await appendAudit(
    "agent_response",
    "Agent 正在处理你的请求…（M6 接入真实 LLM）",
  );
  // ...hardcoded task with 3 fake steps...
}, 600);
```

The Agent accepts input, logs it as an audit entry, waits 600 ms, and
synthesises a fixed 3-step task with no actual computation. The user-facing
behaviour is "you typed something, an audit row + a fake task appeared."

Per PRD §3.9 + §12, real LLM is M10 (out of scope until PRD explicitly
expands). The current code is a faithful stub.

**Fix when M10 starts:** swap the 600 ms timer for an HTTP call to
OpenAI-compatible API. `useAgent.ts:sendChat` is the only call site.

### A2. Settings "M6 / M10 实装" copy

**File:** `app/src/views/Settings.tsx:1191, 1297`

```tsx
{d().type === "im" ? "IM" : "Calendar"} 账户的详细设置（M10 实装）。
// ...
详细 memory 编辑器在 M6 实装。
```

These are honest in-product statements that those features are deferred. The
Agent memory editor actually exists in `app/src/components/AgentPanel.tsx:580-700`
(key/value editor for global + per-contact memory), so the M6 copy is
slightly out of date. The IM/Calendar account settings M10 copy is accurate
(only `email` account type is fully editable in `AccountEditModal`).

**Fix:** delete the "M6 实装" line; `AgentPanel` already has a memory editor.
Leave the M10 IM/Calendar line; PRD §12 defers those.

### A3. Onboarding says "IMAP IDLE" but actually polls

**File:** `app/src/views/Onboarding.tsx:45`

```typescript
highlight: { label: "拉取协议", value: "IMAP IDLE" },
```

Per `app/src-tauri/src/services/sync_loop.rs` and AGENTS §10.3, the sync is
a 60-second polling loop, not IDLE. The user is being told a different
implementation than what runs.

**Fix:** change the value to "60s IMAP 轮询" (or "60s polling"). One word.

---

## C. Performance gaps (P2 backlog, not blocking)

These are correctness-OK but slow on a 3,900-message mailbox. Recorded for
follow-up; not part of this audit's scope.

### C1. Topbar 10 s polling

**File:** `app/src/components/Topbar.tsx:158, 243`

```typescript
// Notification bell
const interval = window.setInterval(() => refetch(), 10_000);
// Sync badge
const interval = window.setInterval(refreshAll, 10_000);
```

Both signals have push equivalents in `app/src/services/sync-events.ts`
(`bumpSoftRefreshTick`, `notifyMessageUpdated`). The Topbar should
listen to those events and only re-render the affected badge, not poll
the whole notification count + sync-state table every 10 s. Pre-Phase-1.5
this was the source of the 78-second freeze during sync (logged in
`docs/PERF-AUDIT-2026-08-19.md` P0-2 — fixed for IMAP IPC by
`max_connections(1→8)`, but the JS-side poll is still there).

### C2. Full-table queries in FollowUps, Insights, Companies, Files

`usePaginatedMessages` + the new MessagePanel scoped queries (from
`feat/messagepanel-scoped-queries`) cover the high-frequency interactive
paths. The four catalog views still mount:

- `FollowUps.tsx:24-25` — `listMessages()`, `listContacts()` (full table)
- `Insights.tsx:21-29` — `listMessages`, `listContacts`, `listTasks`,
  `listFollowUps`, `listAgentTasks`, `listEvents` (six full tables)
- `Companies.tsx:23-26` — `listContacts`, `listMessages`, `listEvents`,
  `listFiles`
- `Files.tsx:14-16` — `listFiles`, `listContacts`, `listMessages`

These views are click-targets, not open-by-default, so the user-reported
freeze was the Topbar + MessagePanel path, not these. But on the Feishu
account (3,900 messages) opening Insights or Companies still pulls the
whole `messages` table through IPC.

The MessagePanel-scoped-queries pattern is the template for fixing these:
each view should have its own narrow accessor (e.g. `listInsightsMetrics`,
`listCompanySummary(contactIds)`). Roughly the same scope as the work
just committed to `feat/messagepanel-scoped-queries`, repeated 4×.

---

## D. Spam (user-mentioned)

### D1. Spam is a manual bucket only — by design

**File:** `app/src/views/Spam.tsx` (208 lines), `app/src/views/Imbox.tsx:458, 523`

What's there:

- `Spam.tsx` is a full list view with `usePaginatedMessages({ bucket: "spam" })`,
  `notSpam(id)` (move back to imbox) and `purge(id)` (delete) handlers.
- `Imbox.tsx:458` (per-message action menu) and `:523` (block-sender) both
  route to `moveMessageToBucket(m.id, "spam")`.
- `sync_loop.rs:144-160` purges spam messages older than 30 days.

What's NOT there:

- **No auto-classifier.** Nothing reads a message's headers / body and decides
  "this is spam." The bucket is reached only by explicit user action.
- **No Bayesian training, no heuristic, no server-side SpamAssassin-style rule.**
  Per PRD §12, server-side spam filtering is explicitly M10 (deferred).
- **No bulk "recover all from Spam"** — user has to do it one at a time.

So "Spam" in v2 is functionally the same as the Trash tab, just with a
different label and a different auto-purge window. The data model is right;
the smarts are deferred. This is consistent with what `prototype-v10` /
`prototype-v11` show — they don't have an auto-classifier either, they just
have a "Move to Spam" button.

If the user wants auto-classification in v2, that needs to be a new
project: header rules + user feedback loop + per-account training,
or a thin server with SpamAssassin / rspamd. Out of scope for the
local-first Tauri build.

---

## Verdict

The codebase matches the PRD surprisingly well for a v2 build at the
"Phase 1.6" milestone. There are **3 real bugs** (B1-B3) that should be
fixed in the next pass and **1 misleading copy** (A3) that should change
to "60s polling". Everything else is either a deferral (A1, A2) or a P2
perf item (C1, C2) that already has a known fix pattern.

**Recommended next worktree:** `fix/insights-reply-time-and-fs-advanced-filters`
covering B1 (pick one of the two fix options) + B2 + B3 + A3. Scope ~150
lines + 3-5 unit tests. Half a day.
