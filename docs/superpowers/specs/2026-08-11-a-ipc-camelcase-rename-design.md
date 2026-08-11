# A. SendPalm IPC snake_case → camelCase Rename (Compose Send 修复)

> Spec authored 2026-08-11. Status: Draft awaiting write + commit. Sub-project A of the 2026-08-11 email/HTML/link audit fix series (commit `cb95452`). 5 个独立 sub-project 之一 (B/C/D/E 各有独立 spec/plan/implementation)。

## 1. 背景与问题

`cb95452` 报告 §3.3 + §7 确认:**12 个 IPC 命令里 6 个静默断裂**。根因是 Tauri 2 默认 camelCase ↔ snake_case 自动转换 (`https://v2.tauri.app/develop/calling-rust/`),但 `app/src/services/backend.ts` 和 `app/src/services/notifications.ts` 的 JS 端发的 snake_case payload keys,导致 Rust 端 serde deserialization 失败,safeInvoke catch 后返回 `null`。

**最严重后果**: Compose `send_message` 返回 `null`,邮件实际未发出 — 用户在 2026-08-11 反馈的"到底能不能很好的收发邮件"问题的根因。

**已确认 mismatch (audit report §3.3 第 1-3 项 + 第 12 项)**:

| 命令 | snake_case key (现) | Tauri 期望 camelCase | file:line |
|---|---|---|---|
| `send_message` | `html_body` / `account_id` / `from_override` | `htmlBody` / `accountId` / `fromOverride` | `backend.ts:72,73,77` |
| `list_mailboxes` | `account_id` | `accountId` | `backend.ts:84` |
| `sync_now` | `account_id` | `accountId` | `backend.ts:93` |
| `notify_settings_changed` | `desktop_enabled` / `quiet_hours_enabled` / `quiet_hours_start` / `quiet_hours_end` | `desktopEnabled` / `quietHoursEnabled` / `quietHoursStart` / `quietHoursEnd` | `notifications.ts:45-48` |

**已正确 (regression guard, 不动)**: `get_sync_state`, `vault_save`, `vault_load`, `vault_delete`, `list_email_providers`, `add_calendar_event`, `get_attachment_content`, `get_attachment_path`, `add_calendar_event`'s nested `IcalEvent` (有独立类型不一致问题,在 B-sub-project 单独处理)。

**Audit 报告计数修正**: §3.3 写 "8 keys" 是 typo — 实际是 **9 keys** (send_message 3 + list_mailboxes 1 + sync_now 1 + notify_settings_changed 4)。

## 2. 目标

JS 端把 9 个 snake_case keys 改为 camelCase,Rust 不动。修完后所有 12 个 IPC 命令 payload shape 都与 Tauri 2 默认一致。

## 3. 非目标

- ❌ 不动 Rust 端任何 `#[tauri::command]` 函数
- ❌ 不动 `safeInvoke` 实现 (`app/src/ipc/commands.ts`)
- ❌ 不动 `commands/mod.rs` / `commands/notification_settings.rs`
- ❌ 不修 `IcalEvent` 嵌套 struct 的类型不一致 (`add_calendar_event` 顶层 OK,嵌套字段在 audit §3.3 第 9 项,留待后续 sub-project)
- ❌ 不修 `tracking_pixel` / `iframe click` / `mailto` / IMAP UID / HTML 渲染 等其他 audit §7 项 (各属 B/C/D/E sub-project)
- ❌ 不加 ESLint 自定义规则防 IPC key 错配 (后续 PR;本次靠 Vitest 测试覆盖)
- ❌ 不动 `app/.env` 或任何凭据

## 4. 改动清单 (单 commit `fix(ipc): rename JS payload keys to camelCase (Tauri 2 default)`)

### 4.1 `app/src/services/backend.ts` (5 处 + 1 接口字段)

```diff
- account_id: string;
+ accountId: string;     // line 29 — SendOpts interface

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

  const r = await safeInvoke<string[]>("list_mailboxes", {
-   account_id: accountId,
+   accountId,
  });

  return safeInvoke("sync_now", {
-   account_id: accountId,
+   accountId,
    mailbox,
  });
```

> **TS shorthand**: 5 处 `key: var` 改为 `key` (ES2015+ 语法,本仓库 `tsconfig.json:8` 目标 ES2020 包含)。这样**无新引入任何 naming 不一致**。

### 4.2 `app/src/services/notifications.ts` (4 处)

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

`prefs` 对象 (`NotifyPrefs` interface) 的键名已经是 camelCase (interface 字段是 `desktop`, `quietHoursEnabled` 等),**无需同步改 interface**。

### 4.3 测试 — 3 新文件

#### `app/src/services/backend.test.ts` (新建)

Vitest, mock `@tauri-apps/api/core.invoke` (这是 `backend.ts:8` 直接 import 的,也是 `safeInvoke` 内部用的 — `@/ipc/commands` 只导出 `pingGreet`,不可 mock),断言 11 个 IPC wrapper 的 payload shape (含 4 个修改过的 + 7 个 regression guard):

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as backend from "./backend";

const invokeSpy = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => { invokeSpy(...args); return Promise.resolve(null); },
}));

describe("IPC payload keys (Tauri 2 default = camelCase)", () => {
  beforeEach(() => invokeSpy.mockClear());

  it("sendMessage — sends camelCase keys (no html_body / account_id / from_override)", async () => {
    await backend.sendMessage({
      to: "a@b", subject: "s", body: "b",
      htmlBody: "<p>x</p>", accountId: "acc-1",
      attachments: [], cc: "", bcc: "", fromOverride: "me@x",
    } as never);
    const [, args] = invokeSpy.mock.calls[0]!;
    expect(args).toEqual({
      to: "a@b", subject: "s", body: "b",
      htmlBody: "<p>x</p>", accountId: "acc-1",
      attachments: [], cc: "", bcc: "", fromOverride: "me@x",
    });
    expect(args).not.toHaveProperty("html_body");
    expect(args).not.toHaveProperty("account_id");
    expect(args).not.toHaveProperty("from_override");
  });

  it("fetchMailboxes — sends { accountId }", async () => {
    await backend.fetchMailboxes("acc-1");
    const [, args] = invokeSpy.mock.calls[0]!;
    expect(args).toEqual({ accountId: "acc-1" });
    expect(args).not.toHaveProperty("account_id");
  });

  it("syncNow — sends { accountId, mailbox }", async () => {
    await backend.syncNow("acc-1", "INBOX");
    const [, args] = invokeSpy.mock.calls[0]!;
    expect(args).toEqual({ accountId: "acc-1", mailbox: "INBOX" });
    expect(args).not.toHaveProperty("account_id");
  });

  it("regression guard: 7 already-correct commands still camelCase", async () => {
    for (const [name, call] of [
      ["getSyncState", () => backend.getSyncState("acc-1")],
      ["listEmailProviders", () => backend.listEmailProviders()],
      ["vaultSave", () => backend.vaultSave("acc-1", "pw")],
      ["vaultLoad", () => backend.vaultLoad("acc-1")],
      ["vaultDelete", () => backend.vaultDelete("acc-1")],
      ["getAttachmentContent", () => backend.getAttachmentContent("f-1")],
      ["getAttachmentPath", () => backend.getAttachmentPath("f-1")],
    ] as const) {
      invokeSpy.mockClear();
      await call();
      const args = invokeSpy.mock.calls[0]![1] as Record<string, unknown>;
      expect(JSON.stringify(args), `command "${name}" payload has snake_case`).not.toMatch(/_/);
    }
  });
});
```

#### `app/src/services/notifications.test.ts` (新建)

`notifications.ts:43` 用 dynamic `await import("@tauri-apps/api/core")` 拿 `invoke`,Vitest mock 模块替换同样生效:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { notifySettingsChanged } from "./notifications";

const invokeSpy = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => { invokeSpy(...args); return Promise.resolve(undefined); },
}));

describe("notifications IPC payload", () => {
  beforeEach(() => invokeSpy.mockClear());

  it("notifySettingsChanged — sends camelCase keys", async () => {
    await notifySettingsChanged({
      desktop: true,
      quietHoursEnabled: false,
      quietHoursStart: "22:00",
      quietHoursEnd: "07:00",
    } as never);
    const [, args] = invokeSpy.mock.calls[0]!;
    expect(args).toEqual({
      desktopEnabled: true,
      quietHoursEnabled: false,
      quietHoursStart: "22:00",
      quietHoursEnd: "07:00",
    });
    expect(args).not.toHaveProperty("desktop_enabled");
    expect(args).not.toHaveProperty("quiet_hours_enabled");
    expect(args).not.toHaveProperty("quiet_hours_start");
    expect(args).not.toHaveProperty("quiet_hours_end");
  });
});
```

## 5. Architecture (无)

本次不改架构,纯字面量替换。`safeInvoke` 抽象保留不动。

## 6. 数据流 (无)

本次不动数据流,纯 IPC payload shape 修正。

## 7. 错误处理 (无)

本次不改错误处理路径。`safeInvoke` 现有的 try/catch + 返回 `null` 不变。

## 8. 测试策略 (per AGENTS §3.4 IPC integration test 必加)

| 测试 | 类型 | 跑法 | 覆盖什么 |
|---|---|---|---|
| 9 个新 unit test | Vitest | `cd app && pnpm test` 自动 | 4 个修过的命令 + `notifySettingsChanged` + 7 个 regression guard |
| `pnpm typecheck` | tsc --noEmit | `cd app && pnpm typecheck` | SendOpts interface 字段同步为 camelCase |
| `pnpm lint` | eslint | `cd app && pnpm lint` | 无新引入 lint 错误 (1 个 pre-existing error 在 views.spec.ts:416 不动) |
| 真发邮件 (手工) | 端到端 | 不入 CI,PR review 时人工跑 | Compose → SMTP 真发 → inbox 收到 |

## 9. Definition of Done

- [ ] `app/src/services/backend.ts` 5 处 key 改名 + `SendOpts` interface 字段同步
- [ ] `app/src/services/notifications.ts` 4 处 key 改名
- [ ] 9 处全用 TS shorthand 语法
- [ ] `app/src/services/backend.test.ts` 新建,覆盖 11 个 IPC wrapper payload shape
- [ ] `app/src/services/notifications.test.ts` 新建,覆盖 `notifySettingsChanged` payload shape
- [ ] `pnpm test` 全绿 (现有 137 个 + 新增 N 个 payload-shape 测试)
- [ ] `pnpm typecheck` 全绿
- [ ] `pnpm lint` 全绿 (1 个 pre-existing error 不动)
- [ ] 手工 verification: 用 `edwinhao@sendpalm.com` Compose 一封邮件给自己 → 收件方在 feishu.cn webmail 看到该邮件 → Send toast 显示 `message_id` (非 `null`)
- [ ] 1 个 conventional commit `fix(ipc): rename JS payload keys to camelCase (Tauri 2 default)`
- [ ] Commit body 引用 audit 报告 commit `cb95452` §7 修复候选清单 HIGH 风险第 1 项
- [ ] 不写 `docs/PROGRESS.md` (sub-project 非 M-编号)

## 10. 风险

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| 漏改某个 key | 中 | 该命令继续 silently broken | Vitest 测试覆盖每个改过的命令,加 `not.toHaveProperty` 断言 |
| TS 接口字段忘改 | 低 | IDE 静态警告,运行时 OK | 同步改 `SendOpts` + typecheck 必跑 |
| `safeInvoke` 泛型约束过松 | 已存在 | 任何人能写 snake_case 而 TS 不报错 | 本次靠 Vitest 兜底;后续 sub-project 加 ESLint 自定义规则 |
| Tauri 行为变化 | 极低 | 大量命令同时断 | Tauri 2 default 已在官方文档 (v2.tauri.app/develop/calling-rust/) 锁定 |
| 回归: 6 个已正确命令被改坏 | 极低 | 这些命令同时断 | Regression guard 测试覆盖 7 个已正确命令,断言无 `_/ |

**回退**: 1 commit,`git revert <sha>` 即可还原所有 9 处字面量替换 + 测试文件。

## 11. 与其他 4 个 sub-project 的依赖

- ✅ 不阻塞 B (iframe click + opener): 独立
- ✅ 不阻塞 C (tracking pixel gate): 独立
- ✅ 不阻塞 D (IMAP UIDVALIDITY): Rust 端,独立
- ✅ 不阻塞 E (plain-text URL auto-link): 独立

5 个 sub-project 可**并行**开发。

## 12. References

- Audit report: `docs/superpowers/audit/2026-08-11-email-html-link-audit.md` §3.3, §7
- Audit commit: `cb95452`
- Tauri 2 docs: https://v2.tauri.app/develop/calling-rust/ ("Passing Arguments")
- AGENTS.md §3.4 (IPC integration test 必加), §3.5 (conventional commits), §3.7 (PR-ready cadence + verification-before-completion), §11 (silent-break trap lesson)