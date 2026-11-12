# Imbox 合并单列表（未读 = 视觉属性）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Imbox 的「新邮件 / 已读」双 tab 改造成一条合并列表，打开邮件时行留在原位、只有未读标记消失。

**Architecture:** 两个 `usePaginatedMessages` 资源合并成一个（`unreadOnly` 由快筛信号派生，切换即重查第 1 页）。已读的落库与列表内 patch 沿用 `MessagePanel` 现有的 `notifyMessageUpdated` → `patchMessage` 链路，Imbox 只订阅一次 `registerMessageUpdated`，在「未读筛选开着且行变已读」时把行移出列表。头部「已读数」由新增的有界计数 `countImboxUnread` 与 `paged.total()` 相减得出。

**Tech Stack:** Tauri 2 + SolidJS + TypeScript(strict) + Vitest + Playwright

**Spec:** `docs/superpowers/specs/2026-11-12-imbox-single-list-unread-attribute-design.md`

## Global Constraints

- 单次跨 IPC 的列表查询必须有界：`LIMIT 100` 分页 + `lightweight: true`（不含 `body` / `body_html`）。AGENTS §11.7。
- 计数查询形状必须是 `SELECT id ... LIMIT N`，不得用 `COUNT(*)`——`mock-db` 不解析聚合（`data.ts:1017` 的既有约束）。
- `countImboxUnread` 与 `countRecentUnreadImbox` 必须共用 `RECENT_UNREAD_CAP`（2000），否则 `olderUnread()` 的减法在 999+/2000+ 邮箱上失真。
- 快筛一律**互斥单选**，点亮再点一次回到「全部」。不得出现两个独立开关叠加成交集（AGENTS §11.3 已踩过）。
- 不留死代码（AGENTS §3.2 / §15.1）：本计划删除的符号必须全部删干净，包括其测试。
- 视图样式只走 `.css` 文件或 token，不得用运行时 `<style>`（AGENTS §11.15/§11.18）。
- 提交信息用 conventional prefix。

## Review Focus

1. **已读筛选关着时点开一封未读邮件** → 行必须原地保留、只去掉加粗和蓝点，滚动位置不动。这是本次改动唯一的核心承诺。
2. **未读筛选开着时点开一封未读邮件** → 行必须真的从列表消失（否则筛选在撒谎），且计数减 1、不跳到列表顶部。
3. **2000 封以上未读的邮箱** → 头部「更早 N 封未读」必须显示 0 或隐藏，不能出现负数或把 2000+ 说成精确值。
4. **快筛把列表筛空**（订阅 0 封 / 未读 0 封）→ chip 行必须仍然可见，并提供退出筛选的出口。
5. **账户切换 + 快筛同时生效** → 未读数与列表必须落在同一个账户范围内，不能一个查全部账户一个查单个。

---

### Task 1: 头部算术与未读计数（纯逻辑 + 数据层）

**Files:**
- Modify: `app/src/stores/data.ts`（在 `countRecentUnreadImbox` 之后新增 `countImboxUnread`）
- Modify: `app/src/views/Imbox-helpers.ts`（新增两个纯函数）
- Test: `app/src/views/Imbox.test.ts`（新增 `describe` 块）
- Test: `app/src/stores/data.account-scope.test.ts`（新增 `countImboxUnread` 的账户范围用例）

**Interfaces:**
- Produces:
  - `countImboxUnread(accountIds?: string[]): Promise<number>` —— `undefined` = 合并视图（无账户谓词），`[]` = 空选择返回 0。
  - `olderUnread(recentUnread: number, unreadTotal: number): number` —— 最近窗口之外的未读数。
  - `readTotal(unreadTotal: number, total: number): number` —— 已读数。

- [ ] **Step 1: 写失败测试（纯函数）**

在 `app/src/views/Imbox.test.ts` 末尾追加：

```ts
describe("olderUnread / readTotal", () => {
  it("subtracts the recent window from the unread total", () => {
    expect(olderUnread(5, 8)).toBe(3);
  });

  it("clamps to zero when the recent count exceeds the total", () => {
    // 30 天窗口内的计数与全量计数来自两次查询，并发写入时可能短暂不一致。
    expect(olderUnread(9, 8)).toBe(0);
  });

  it("says nothing when the recent count is capped", () => {
    // RECENT_UNREAD_CAP 之后两个数字不再对应，减法就是猜。
    expect(olderUnread(RECENT_UNREAD_CAP, 5000)).toBe(0);
  });

  it("derives the read total", () => {
    expect(readTotal(8, 56)).toBe(48);
  });

  it("never returns a negative read total", () => {
    expect(readTotal(60, 56)).toBe(0);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd app && pnpm exec vitest run src/views/Imbox.test.ts`
Expected: FAIL —— `olderUnread is not defined`（并把 `RECENT_UNREAD_CAP` 加入 import 失败）。

- [ ] **Step 3: 实现两个纯函数**

`app/src/views/Imbox-helpers.ts` 末尾追加（`RECENT_UNREAD_CAP` 从 `../stores/data` 引入）：

```ts
/** 最近窗口之外的未读数。计数被截断时返回 0 —— 两个数字不再对应，减法就是猜。 */
export function olderUnread(recentUnread: number, unreadTotal: number): number {
  if (recentUnread >= RECENT_UNREAD_CAP) return 0;
  return Math.max(0, unreadTotal - recentUnread);
}

/** 已读数 = 总数 - 未读，下界 0。 */
export function readTotal(unreadTotal: number, total: number): number {
  return Math.max(0, total - unreadTotal);
}
```

`app/src/views/Imbox.test.ts` 的 import 改为
`import { groupItemsByDate, isImboxListMessage, olderUnread, readTotal } from "./Imbox-helpers";`
并新增 `import { RECENT_UNREAD_CAP } from "../stores/data";`。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd app && pnpm exec vitest run src/views/Imbox.test.ts`
Expected: PASS（4 个既有 describe + 1 个新 describe）。

- [ ] **Step 5: 写失败测试（数据层计数）**

在 `app/src/stores/data.account-scope.test.ts` 末尾追加（沿用文件既有的 seed 辅助函数与 `getDb` 用法）：

```ts
describe("countImboxUnread", () => {
  it("counts unread imbox rows across every account when no scope is given", async () => {
    // seed 同文件既有 fixture：w1 有 1 封未读、w2 有 1 封已读
    expect(await countImboxUnread()).toBe(1);
  });

  it("scopes the count to the given accounts", async () => {
    expect(await countImboxUnread(["work2"])).toBe(0);
    expect(await countImboxUnread(["work1"])).toBe(1);
  });

  it("returns zero for an empty selection instead of querying", async () => {
    expect(await countImboxUnread([])).toBe(0);
  });
});
```

- [ ] **Step 6: 跑测试确认失败**

Run: `cd app && pnpm exec vitest run src/stores/data.account-scope.test.ts`
Expected: FAIL —— `countImboxUnread is not exported`。

- [ ] **Step 7: 实现 `countImboxUnread`**

在 `app/src/stores/data.ts` 的 `countRecentUnreadImbox` 之后插入：

```ts
/** 整个 Imbox 的未读数，任何时间范围。头部用它把「未读 / 已读 / 总数」
 *  三个数字摆在一起；列表本身已合并，这个数只服务于文案。
 *
 *  与 countRecentUnreadImbox 共用同一个上限：olderUnread() 是两者的减法，
 *  上限不同会让 999+ 的邮箱算出负数。 */
export async function countImboxUnread(
  accountIds?: string[],
): Promise<number> {
  if (accountIds && accountIds.length === 0) return 0;
  const db = await getDb();
  const accountWhere = accountIds
    ? ` AND ac IN (${accountIds.map(() => "?").join(", ")})`
    : "";
  const rows = await db.select<Array<{ id: ID }>>(
    `SELECT id FROM messages
      WHERE bucket = 'imbox' AND direction = 'in' AND unread = 1
        AND deleted_at IS NULL${accountWhere}
      LIMIT ${RECENT_UNREAD_CAP}`,
    accountIds ?? [],
  );
  return rows.length;
}
```

- [ ] **Step 8: 跑测试确认通过**

Run: `cd app && pnpm exec vitest run src/stores/data.account-scope.test.ts`
Expected: PASS。

- [ ] **Step 9: 类型检查 + 提交**

```bash
cd app && pnpm typecheck
git add app/src/stores/data.ts app/src/stores/data.account-scope.test.ts app/src/views/Imbox-helpers.ts app/src/views/Imbox.test.ts
git commit -m "feat(imbox): bound the unread-total count and add header arithmetic"
```

---

### Task 2: Imbox 合并为单列表

**Files:**
- Modify: `app/src/views/Imbox.tsx`（主要改动）
- Modify: `app/src/components/AccountTabs.tsx`（`mode` 联合收窄为 `"all" | "unread"`）
- Test: `app/e2e/imbox.spec.ts`、`app/e2e/scenarios.spec.ts`、`app/e2e/workflows.spec.ts`（选择器跟随）

**Interfaces:**
- Consumes: Task 1 的 `countImboxUnread` / `olderUnread` / `readTotal`，`RECENT_UNREAD_CAP`。
- Produces: 快筛态 `quickFilter: Accessor<"all" | "unread" | "newsletter" | "pending">`；
  DOM 钩子 `data-imbox-chip="all|unread|newsletter|pending"`（带 `aria-pressed`），
  替代已删除的 `data-imbox-tab`。

- [ ] **Step 1: 合并分页资源与快筛状态**

在 `app/src/views/Imbox.tsx` 中：

1. 删除 `type ImboxTabId = "new" | "seen";`（第 144 行）。
2. 把 `newPaged` / `seenPaged` 两个 `usePaginatedMessages` 调用（第 172-191 行）替换为一个：

```ts
const [quickFilter, setQuickFilter] = createSignal<
  "all" | "unread" | "newsletter" | "pending"
>("all");
const unreadOnly = () => quickFilter() === "unread";

const paged = usePaginatedMessages(
  () => ({
    bucket: "imbox" as const,
    direction: "in" as const,
    lightweight: true,
    // false 也照传：切 chip 时源对象变化，第 1 页与 loadMore 同时换筛选。
    unreadOnly: unreadOnly(),
    ...queryScope(),
  }),
  PAGE_SIZE,
);
```

3. 删除原第 192 行的 `activeTab` 信号与第 227 行的 `paged()` 派生访问器（新 `paged` 是 handle，文件其余 `paged().xxx` 调用无需改动）。
4. 删除第 319-321 行原有的 `quickFilter` 信号声明（已上移合并）。

- [ ] **Step 2: 已读落地**

1. 删除 `keepScrollStill`（第 820-837 行）与 `openAndMarkRead`（第 839-863 行），改用：

```ts
/** 打开一封邮件。标已读、写库、列表内 patch 都由 MessagePanel 的既有链路
 *  （notifyMessageUpdated → patchMessage）完成 —— 这里只负责在「未读」筛选
 *  开着时把不再满足条件的行移出列表。 */
const openMessage = (m: Message) => {
  open(m.id);
};
```

2. 把所有 `openAndMarkRead` 调用点（第 1355 行 `onOpen`、第 972 / 974 行 Enter 键）改为 `openMessage`。
3. 在 `registerPrepend` 附近新增一处订阅：

```ts
// 「打开时标已读」「u 键」「批量标已读」三条路径都走 notifyMessageUpdated。
// 未读筛选开着时，变成已读的行必须真的移出列表，否则筛选条件在撒谎；
// 筛选关着时 patchMessage 已经就地把它改成不粗，行留在原位。
onCleanup(
  registerMessageUpdated((id, patch) => {
    if (patch.unread === undefined) return;
    if (patch.unread === false && unreadOnly()) paged.removeByIds([id]);
    refreshUnreadCounts();
  }),
);
```

4. `toggleUnread`（第 784-806 行）改写为：

```ts
const toggleUnread = async (m: Message) => {
  try {
    const next = !m.unread;
    await markMessageUnread(m.id, next);
    if (!next && unreadOnly()) paged.removeByIds([m.id]);
    else paged.patchMessage(m.id, { unread: next });
    refreshUnreadCounts();
  } catch (err) {
    console.error("[imbox] toggleUnread failed:", err);
    await paged.refresh();
    showToast({ message: "操作失败，请重试", kind: "error" });
  }
};
```

5. `removeFromBoth`（第 579-582 行）改名为 `removeRow`，函数体只剩 `paged.removeByIds([id]);`，全部调用点同步改名。`refreshAll`（第 584-588 行）改为只 `await paged.refresh()` 后跟着 `await refetchPiles()`。

- [ ] **Step 3: 刷新链路与派生**

1. 第 213-222 行的 `refreshTick` effect：`newPaged.refresh()` + `seenPaged.refresh()` 两步改为一次 `void paged.refresh()`。
2. 第 256-266 行的 `useRefreshEffect`：同样合并为 `void paged.refresh()`，其余 `refetchPiles` / `refetchContacts` / `refetchRecentUnread` / 新增 `void refetchUnreadTotal()` 保留。
3. `syncNow`（第 1067-1077 行）两个 refresh 合成一个。
4. `hasAny`（第 1057-1062 行）改为 `paged.total() > 0 || piles().length > 0`。
5. 新增未读总数资源（放在 `recentUnread` 旁边）：

```ts
const [unreadTotal, { refetch: refetchUnreadTotal }] = createResource(() =>
  countImboxUnread(accountFilter()),
);
```

并在两个刷新 effect 里各加一次 `void refetchUnreadTotal()`（硬刷 + 软刷都要，账户切换由 `accountFilter()` 源驱动自动重查）。
6. `items()` 改为 `paged.items()`；`activeList = renderList` 上方那段解释两个 tab 的注释（第 412-423 行）改写为「单一列表，bundle 分组作用于整条列表」。

- [ ] **Step 4: 头部、账户徽标与渲染**

1. `<ImboxHeader>` 的 props 改为：

```tsx
total={paged.total()}
unreadTotal={unreadTotal.latest ?? 0}
recentUnread={recentUnread.latest ?? 0}
syncing={syncing()}
```

`ImboxHeader` 内把 `newCount` / `previouslySeenCount` 两个 prop 换成 `unreadTotal`，
`olderUnread()` 改为调用 Task 1 的纯函数 `olderUnread(props.recentUnread, props.unreadTotal)`，
桌面文案的 `{props.previouslySeenCount} 已读` 改为 `{readTotal(props.unreadTotal, props.total)} 已读`
（保持 `最近 30 天 N 封待读 · M 已读 · T 总数` 的字面格式，`app/e2e/imbox.spec.ts:218` 的
正则依赖它）。
2. `<AccountTabs>` 的 `mode` 改为 `unreadOnly() ? "unread" : "all"`，`total` 改为 `() => paged.total()`。
3. 删除 `<ImboxTabs …>` 整个元素（第 1173-1184 行）。
4. 删除 `<Show when={activeTab() === "new"}>` 外层包裹（第 1243 行与第 1310 行），让 chip 行常驻。
5. 抽出一个 `<ImboxChip>` 组件替换三段复制粘贴的内联 JSX：

```tsx
function ImboxChip(props: {
  label: string;
  count: number | string;
  active: boolean;
  chip: "all" | "unread" | "newsletter" | "pending";
  title: string;
  onClick: () => void;
}) // 渲染 <button data-imbox-chip={props.chip} aria-pressed={props.active} …>
```

chip 行按 `全部 / 未读 / 订阅 / 新面孔` 顺序渲染，各自 `onClick` 把 `quickFilter` 设为
对应值、已是该值时回到 `"all"`。计数分别来自 `paged.total()` / `unreadTotal.latest ?? "…"` /
`newsletterCount()` / `pendingSenderCount()`。「一起读」按钮留在行尾不变。
6. 错误 / 骨架 / 空状态：`paged().resource.error` → `paged.resource.error`，
   `paged().resource.loading` → `paged.resource.loading`，`paged().items()` → `paged.items()`，
   `paged().total()` / `hasMore()` / `loadingMore()` / `loadMore()` 同理。
7. 空状态：删除 `TabEmpty`（第 1475-1506 行），新增

```tsx
function FilterEmpty(props: {
  hasAccount: boolean;
  unreadOnly: boolean;
  filterActive: boolean;
  total: number;
  onClearFilters: () => void;
})
```

按 Spec §7.5 的四行表格渲染 `Empty`（`components/Empty.tsx`，props：`icon` / `title` /
`description` / `action`）。`onClearFilters` 设为 `setQuickFilter("all")`。
8. 删除 `ImboxTabs`（第 2520-2562 行）与 `ImboxTabButton`（第 2564-2632 行）两个组件。

- [ ] **Step 5: 跑类型检查与单测**

Run: `cd app && pnpm typecheck && pnpm exec vitest run`
Expected: PASS，且无 `activeTab` / `newPaged` / `seenPaged` / `openAndMarkRead` / `keepScrollStill` /
`TabEmpty` / `ImboxTabs` 的残留引用（`grep -n "activeTab\|newPaged\|seenPaged\|openAndMarkRead\|keepScrollStill\|TabEmpty\|ImboxTabs" app/src/views/Imbox.tsx` 输出为空）。

- [ ] **Step 6: 更新 e2e 选择器**

1. `app/e2e/scenarios.spec.ts:328` —— `[data-imbox-tab='new']` 改为 `[data-imbox-chip='unread']`，断言仍是 `toContainText("8")`。
2. `app/e2e/imbox.spec.ts:225-226` —— 改为断言 `[data-imbox-chip='all']` 与 `[data-imbox-chip='unread']` 均可见，并把上一段的注释改写为「合并列表 + 一个折叠 bundle 是数据集渲染正常的信号」。
3. `app/e2e/imbox.spec.ts:324-334` —— 删掉点击 seen tab 的三行，改为：断言 `[data-imbox-chip='all'][aria-pressed='true']`，点 `[data-imbox-chip='unread']`，断言 `aria-pressed='true'`，再断言 `[data-feed-card='bundle']` 仍可见（合并列表第一页就含已读行）。
4. `app/e2e/imbox.spec.ts:439` —— 删掉 `[data-imbox-tab='seen']` 点击，bundle 现在直接在第一页。
5. `app/e2e/workflows.spec.ts:653` —— 删掉 tab 点击与上方解释它的注释，直接断言恢复后的邮件可见；若该 id 落在第一页之外，改为先点 `[data-imbox-chip='unread']` 排除未读干扰后再断言，并把原因写进注释。

- [ ] **Step 7: 新增核心回归 e2e**

在 `app/e2e/imbox.spec.ts` 新增：

```ts
test("opening an unread mail keeps the row in place and only drops the unread mark", async ({
  page,
}) => {
  // 本次改造的核心承诺：行不搬家。旧模型下点开会把它从「新邮件」删掉、
  // 插到「已读」顶部，于是必须靠 keepScrollStill 掩盖跳动。
  const card = page.locator("[data-feed-card='message'].unread").first();
  await expect(card).toBeVisible({ timeout: 10_000 });
  const id = await card.getAttribute("data-message-id");
  await card.click();
  await expect(page.locator("#detail-panel.open")).toBeVisible();
  const same = page.locator(`[data-message-id="${id}"]`);
  await expect(same).toBeVisible();
  await expect(same).not.toHaveClass(/unread/);
});
```

- [ ] **Step 8: 跑 e2e**

Run: `cd app && pnpm e2e -- imbox.spec.ts scenarios.spec.ts workflows.spec.ts`
Expected: PASS。若有失败，先确认是数据假设（bundle 折叠、第一页条数）而不是选择器写错。

- [ ] **Step 9: 提交**

```bash
git add app/src/views/Imbox.tsx app/src/components/AccountTabs.tsx app/e2e/imbox.spec.ts app/e2e/scenarios.spec.ts app/e2e/workflows.spec.ts
git commit -m "feat(imbox): merge the read/unread tabs into one list, unread becomes a visual"
```

---

### Task 3: 删除 `readOnly`（零调用者的数据层能力）

**Files:**
- Modify: `app/src/stores/data.ts`
- Modify: `app/src/components/AccountTabs.tsx`（若 Task 2 未删干净）
- Test: `app/src/stores/data.account-scope.test.ts`（删除对应的 `readOnly` 用例）

**Interfaces:**
- Produces: `ListMessagesOptions` 不再有 `readOnly`；`countMessagesByAccount` 的 options 只剩 `unreadOnly`。

- [ ] **Step 1: 确认零调用者**

Run: `cd app && grep -rn "readOnly" src/`
Expected: 只剩 `data.ts` 的定义与分支，以及测试里的用例。（`Settings.tsx:3247` 的 `readOnly` 是 `<input>` 的 HTML 属性，不属于本项，不要动。）

- [ ] **Step 2: 删除实现与用例**

1. `data.ts` 删除 `countMessagesByAccount` 里 `options.readOnly` 的三元分支（第 1080-1084 行改回单行 `const unreadClause = options.unreadOnly ? " AND unread = 1" : "";`），options 类型收窄为 `{ unreadOnly?: boolean }`。
2. `data.ts` 删除 `listMessagesPaged` 的 `else if (options.readOnly)` 整个分支（第 1434-1438 行）与 `ListMessagesOptions` 上的 `readOnly?: boolean;` 字段及注释（第 1298-1303 行）。
3. 删除 `data.account-scope.test.ts` 里断言 `readOnly: true` 的那一例（第 133 行附近）。

- [ ] **Step 3: 跑全量**

Run: `cd app && pnpm typecheck && pnpm exec vitest run`
Expected: PASS，用例数比 Task 2 结束时少 1。

- [ ] **Step 4: 提交**

```bash
git add app/src/stores/data.ts app/src/stores/data.account-scope.test.ts
git commit -m "refactor(data): drop the unused readOnly list filter"
```

---

### Task 4: 文档与教训

**Files:**
- Modify: `docs/PROGRESS.md`
- Modify: `AGENTS.md`（追加 §11.19）

- [ ] **Step 1: PROGRESS 记录**

在 `docs/PROGRESS.md` 顶部按既有格式追加一条：改造内容、删掉的符号、测试数变化（293 → 新值）、
e2e 覆盖。

- [ ] **Step 2: AGENTS §11.19**

在 `AGENTS.md` 的 §11.18 之后追加 `### 11.19 Lessons learned (Session 2026-11-12 — Imbox 合并单列表)`，三条：

1. **一个只为掩盖「行跑掉了」而存在的函数，说明数据模型错了。** `keepScrollStill` 18 行全在处理
   浏览器因内容变矮/焦点丢失/预览换行而自动滚动——根因是把「已读」当成容器而非视觉属性。
2. **区分维度应该是用户做的决定，不是被动状态。** 已读是被动的，归档/稍后/搁置才是决定。
   Imbox 的容器只该跟着决定走；HEY 的 Imbox 从不因为你「看过」而移走邮件。
3. **合并列表的头部算术要共用同一个计数上限。** `COUNT(*)` 无上限、`LIMIT 999`、`LIMIT 2000`
   三种上限混用时，「更早 N 封未读」会算出负数；任何相减而得的 UI 数字，两侧必须同源同限。

- [ ] **Step 3: 提交**

```bash
git add docs/PROGRESS.md AGENTS.md
git commit -m "docs: record the Imbox single-list change and its lesson"
```

---

## Self-Review

**Spec coverage:** §7.1 → Task 2 Step 1；§7.2 → Task 2 Step 2；§7.3 → Task 1 + Task 2 Step 4（1-2）；§7.4 → Task 2 Step 4（3-5）；§7.5 → Task 2 Step 4（7）；§7.6 → 无改动即覆盖；§8 删除清单 → Task 2 Step 4（8）+ Task 3；§9 测试 → Task 1 Steps 1-8 + Task 2 Steps 6-8；§10 验证 → Task 2 Step 5 / 8；§11 实施者判断项 → Task 2 Step 4（5）与 Step 8 的失败归因说明。

**Type consistency:** `countImboxUnread(accountIds?: string[])` 在 Task 1 定义、Task 2 以 `accountFilter()` 调用（`resolveAccountFilter` 的返回值正是 `string[] | undefined`）。`olderUnread` / `readTotal` 的参数顺序在定义与 `ImboxHeader` 调用处一致。DOM 钩子 `data-imbox-chip` 在 Task 2 Step 4 产生、Step 6 消费。快筛联合类型在 Task 2 的全文件统一为四值。

**Proportion:** 计划约与 Spec 等长；代码块只包含签名、精确 SQL 形状与迁移前后的孤儿调用点，实现体留给执行者。

---

## Ledger（执行记录）

Ruling: Task 1 的计数用例数值按真实 fixture 写 —— 计划里举的 `work1`/`work2` 在
`data.account-scope.test.ts` 的 beforeEach 里并不存在，实际账户是 `work`/`private`
（w1 未读、w2 已读、p1 未读、f1 属 feed）。按实际 fixture 断言 2 / 1 / 1 / 0。
代价：无（只是把计划的示意值换成真值）。

Ruling: 基线不是计划写的 293 例，实际是 90 文件 / 873 例（计划沿用了一个过时的数字）。
代价：无。

Task 1: complete (commits 3ce361f, tests: vitest 90 files / 874 cases → 874 pass)

Task 2: Ruling: 计数也按账户范围查 —— 计划只加了 `countImboxUnread`，但
`countRecentUnreadImbox` 原本没有账户谓词，而它和未读总数在同一句话里做减法。
同一次修改把 `countRecentUnreadImbox(nowIso, days)` 改成
`countRecentUnreadImbox(nowIso, { days?, accountIds? })`。代价：4 个调用点要改。

Task 2: Ruling: 测试抓到两个真 bug，都已修 ——
(a) `countRecentUnreadImbox` 里 `$1` 与账户 `?` 占位符混用时 SQLite 把 cutoff
   绑进了 `ac IN (…)` 的第一个槽，带账户范围时永远返回 0；
(b) `refreshUnreadCounts()` 没有 refetch 新的未读总数，「未读」chip 的数字在
   标已读后不动。两条都是 e2e 断言先红后绿。

Task 2: Ruling: `no-refetch-storm` 的预算 36 → 42 —— 合并列表需要第三个计数
（全量未读，供 chip 与头部「已读」行），它和 30 天计数各是一次 IPC。该测试真正
的守卫（不拉 agent 表、面板稳定后 0 查询）都还在。代价：若未来再叠加计数，
预算会继续涨，需要重新审视是否该把三个计数合成一次查询。

Task 3: complete (commit cf06e40, tests: vitest → 873 pass, 用例减少 1 例即删除的 readOnly 用例)

Task 4: complete.

Final review (fresh reviewer) found 2 Critical + 2 Important; all fixed in ONE pass,
each RED→GREEN:

- **C1 chips died with their own empty result** — `hasAny()` gated the whole
  feed-list, so the 未读 filter (a *server-side* filter: `paged.total()` → 0) took the
  chip row and `FilterEmpty` down with it. The only route back to 全部 lived in that
  row. Now the gate is `hasAny() || quickFilter() !== "all"`, and `FilterEmpty` puts
  the filter explanation ahead of the cold-start one (a seeded/imported mailbox can
  have mail without an `accounts` row). New e2e `an emptied unread filter keeps the
  chips and offers a way back`.
- **C2 capped counts printed a precise wrong number** — `olderUnread` only guarded the
  *recent* side; `countImboxUnread` is `LIMIT 2000` too, so a 3,762-unread mailbox read
  「更早 1995 封未读」. Both sides guarded now; the header and the 未读 chip say `2000+`.
  Unit test pins the number it used to print (1995).
- **I1 `u` key and row actions left the chips stale** — the subscription only sees
  `notifyMessageUpdated`, and `markMessageUnread` does not emit it, so `u` never
  refreshed the counts; `removeRow` had the same hole after archive/trash/spam/pile
  (which made 已读 go *down* when you archived an unread mail). Added `afterRowAction`.
- **I2 opening a mail stopped pushing `\Seen` to IMAP** — `markMessageUnread` is the
  only function that mirrors the flag (`imap_set_seen`); the old path used the
  local-only `upsertMessage`. Mail read in SendPalm stayed unread in webmail forever.
  Restored via `MessagePanel.markOpenedRead`, with a per-id guard (the resource's
  "refreshing" state returns the previous `unread: true` value, which fired the effect
  — and the IMAP push — twice; that also cost +12 queries per open).

Minors taken while in there: the chip row is `position: sticky` again (the deleted tab
bar was), stale comments pointing at the two-tab model, the spec's `data-imbox-filter`
selector typo, and the first-frame 已读 number.
Minors deferred (ledger only): 订阅 chip counts unread newsletters while the filter
lists all of them, and none of the three chip counters are account-scoped; the
`Imbox-helpers` → `stores/data` import of `RECENT_UNREAD_CAP`; the ≤768px "does the
clicked row keep its screen y" assertion (only `scrollTop` is pinned today).

Final: 875 unit tests / 90 files, 184 e2e (1 skipped live-Feishu), typecheck + lint clean.
