# Imbox 合并为单一列表：未读 = 视觉属性，不是容器

日期：2026-11-12
状态：待确认
关联：AGENTS §11.3（Imbox 分 tab 的由来）、§11.14（Suspense / 预取）、§11.17（refetch 抖动）

---

## 1. 为什么改

现在 Imbox 用两个 tab 把「新邮件」（未读）和「已读」切成两个容器。点开一封新邮件会
（`app/src/views/Imbox.tsx:839` `openAndMarkRead`）：

1. 从「新邮件」列表**删掉这一行**（`newPaged.removeByIds`）
2. 插到「已读」列表**最上面**（`seenPaged.prependByIds`）
3. 写库标记已读

用户点的那一行不是变灰，是从眼前消失。三个可以量化的后果：

- **最高频的动作在重排列表。** 打开邮件比归档、回复高一个数量级。任何「最高频动作会
  改变列表结构」的模型都站不住。
- **「已读」tab 是个只增不减的墓地。** 真实账号 4,500+ 封邮件，它装下每一封读过的。
  没人会去浏览它；它唯一真实的用途是**找回 App 刚刚从用户手里拿走的那封**。一个只有
  这个用途的 tab 不是功能，是对 bug 的补偿。
- **阅读变成了有代价的动作。** 点之前要犹豫「点了就没了」。

`keepScrollStill`（`Imbox.tsx:820`）是这件事的自证：18 行代码，唯一职责是掩盖
「行跑掉了」——浏览器在内容变矮时夹紧 `scrollTop`、WebKit 把失去焦点的行滚回视野、
打开阅读栏让每行预览重排变高，三件事都要在同一帧和布局稳定后各还原一次位置。

**Tab 也不是原型的东西。** `js/prototype-v11.js:3122-3149` 把 New for you 和
Previously seen 渲染成**同一条滚动列表的两个分区**。分 tab 来自一次真实 bug 修复
（AGENTS §11.3：已读邮件超过前 100 条就永远看不到），但那个 bug 的真正原因是**分页**，
不是**分区**；两个独立 paginated resource 已经修好了它，tab 是当时顺手加的装饰。

正确的区分维度是**用户做的决定**（归档 / 稍后回复 / 搁置 / 提醒），不是**被动状态**
（已读）。已读是视觉，不是容器。
`ReadTogether`（一起读）就是「隔离式已读」的正确形态：一个用户主动进入的模式，Next
意味着标记已读并前进，行离开是对的——因为那是模式声明的，不是点击的副作用。

## 2. 目标

- 打开一封邮件，**行不动**。只有加粗和蓝点消失。
- 未读仍然可筛：加一个「未读」快筛 chip，和现有的「订阅」「新面孔」并列。
- 删除 tab 栏、`openAndMarkRead`、`keepScrollStill`，两个分页资源合并成一个。
- 保持：bundle（同发件人 ≥3 封折叠）、日期分组、piles、多账户分割、无限滚动、
  j/k 光标、多选、拖拽、键盘 `u` 切换未读、`一起读` 入口。

## 3. 非目标

- 不改 `ReadTogether` / `FocusReply` / `PileBoard` 的已读语义。
- 不改 Sidebar、Topbar 的未读徽标来源。
- 不改 bundle 阈值、排序策略、日期分组规则。
- 不动原型。

## 4. 反目标（做出来就算失败）

- 列表在点击后仍会跳一下，于是又需要一个 `keepScrollStill` 之类的补丁。
- 「未读」chip 打开后列表和筛选条件不一致（筛选未读却显示已读行）。
- 已读邮件从 Imbox 消失（这是「已读 tab」被删后最容易踩的坑：合并后必须仍然全部可见）。
- 性能回退：合并后的单次查询不得比现在两次查询中的任意一次更重。

## 5. 约束

- AGENTS §11.7：任何跨 IPC 的列表必须是**有界的**。合并后仍是 `LIMIT 100` 分页 +
  keyset 游标，投影 `lightweight`（不含 `body` / `body_html`）。
- AGENTS §11.14：资源在 **user effect** 里读取或用 `.latest`，不得让 refetch 把视图
  打回 Suspense fallback（否则滚动位置丢失）。
- AGENTS §3.2 / §15.1：不留死代码。删除项见 §8。
- `mock-db`（Vitest 的浏览器替身）不能解析 `COUNT(*)`——新增计数查询沿用
  `SELECT id ... LIMIT N` 的形状（见 `data.ts:1017`）。

## 6. 三条路（已在对话中对齐，选 A）

**A. 未读 = 视觉属性（采纳）** — 一条列表，未读 = 加粗 + 左侧蓝点，打开就地变灰；
「未读」从容器降级为快筛 chip。坏处：删的东西比加的多，`新邮件/已读` 两个词从界面上消失。

**B. 保留分区、去掉 tab**（原型原样）— 一条滚动列表，上「新邮件」下「已读」，各自分页。
改动最小，但仍会在点击时把行从上面搬到下面，只是「看得见它跳过去了」。

**C. 保留 tab、点了不马上移走** — 就地变灰，切 tab 或下拉刷新时才归位。改动最小也最保险，
但 tab 会在一段时间里对筛选条件撒谎（半状态），必然带来「为什么已读里有未读邮件」。

选 A：它删代码而不是加代码，删掉的 `keepScrollStill` 就是它自己的证明。

## 7. 设计

### 7.1 状态

```
删除：ImboxTabId / activeTab / newPaged / seenPaged / paged() 派生访问器
新增：const [unreadOnly, setUnreadOnly] = createSignal(false)
      const paged = usePaginatedMessages(() => ({
        bucket: "imbox", direction: "in", lightweight: true,
        unreadOnly: unreadOnly(),   // false 也照传：切 chip 时源对象变化即重新查第 1 页
        ...queryScope(),
      }), PAGE_SIZE)
```

`usePaginatedMessages` 的 options 是 accessor 形状（`utils/paginated-messages.ts:81`
`readOptions`），所以 chip 切换会同时影响第 1 页和 `loadMore`，不会出现「第 2 页用旧
筛选」的拼接错误。`paged` 从函数变成 handle 后，文件里所有 `paged().xxx` 调用**无需改动**。

### 7.2 读状态如何落地

DB 写入和列表内 patch 已经存在，不重复实现：`MessagePanel.tsx:212-223` 在挂载时
`upsertMessage({...m, unread:false})` 然后 `notifyMessageUpdated(id, {unread:false})`，
`paginated-messages.ts:217` 把它接到 `patchMessage`。所以：

```
删除 openAndMarkRead + keepScrollStill
新增 openMessage(m) = { open(m.id); }        // 其余交给 MessagePanel 的既有链路
```

唯一新增的接线是一处，覆盖「打开时标已读」「u 键」「批量标已读」三条路径：

```ts
onCleanup(registerMessageUpdated((id, patch) => {
  if (patch.unread === undefined) return;
  // 未读筛选打开时，变成已读的行不再满足筛选条件，必须真的移出列表；
  // 筛选关闭时 patchMessage 已经就地改写成不粗，行继续留在原位。
  if (patch.unread === false && unreadOnly()) paged.removeByIds([id]);
  refreshUnreadCounts();
}));
```

`refreshUnreadCounts()`（`Imbox.tsx:598`，只 bump counts tick，不 bump soft tick）保持不变——
它存在的理由（§11.17：别让一次「打开邮件」重渲染整个列表）依然成立。

### 7.3 头部与账户徽标

合并后 `paged.total()` 是「总数」，不再等于「未读数」，需要一个新的有界计数：

```
data.ts 新增 countImboxUnread(accountIds?) -> number
  SELECT id FROM messages
   WHERE bucket='imbox' AND direction='in' AND unread=1 AND deleted_at IS NULL
   LIMIT RECENT_UNREAD_CAP        // 与 recent-unread 共用同一个上限
```

共用 `RECENT_UNREAD_CAP`（2000）是关键：`olderUnread()`
（`Imbox.tsx:1539`）= `max(0, 未读总数 - 最近30天未读)` 只有在两个数共享同一个上限时
才成立；现有 `countUnreadByBucket` 的 `LIMIT 999` 会让这个减法在 999+ 的邮箱上出错，
所以不复用它。

头部文案（`已读 M · 总数 T` 里的 M 由 `paged.total() - unreadTotal` 推出）：

| | 现在 | 之后 |
|---|---|---|
| 未读 | `newPaged.total()` | `countImboxUnread()` |
| 已读 | `seenPaged.total()` | `paged.total() - countImboxUnread()` |
| 总数 | 两者相加 | `paged.total()` |

`AccountTabs` 的 `mode` 从 `activeTab()==="seen" ? "read" : "unread"` 改为
`unreadOnly() ? "unread" : "all"`。

### 7.4 界面

```
┌────────────────────────────────────────────┐
│ 收件箱                                     │
│ 最近 30 天 12 封待读 · 更早 3 封未读 · 已读 41 · 总数 56 │
│ [筛选] [同步]                               │
├────────────────────────────────────────────┤
│ [全部 56] [未读 15] [订阅 3] [新面孔 1]   一起读 │  ← 常驻，可组合
├────────────────────────────────────────────┤
│ 今天                                       │
│ ● Sarah  Q3 预算确认           14:02       │  ← 未读：加粗 + 蓝点
│   Sarah  Re: 设计评审          13:40       │  ← 刚点开：不加粗，仍在原位
│   Tom    发票已发送            11:20       │
└────────────────────────────────────────────┘
```

- 三个 chip（未读 / 订阅 / 新面孔）合并成**一个互斥组 + 全部**，沿用现有
  `quickFilter` 单选语义（点亮再点一次回到全部），把「未读」并进同一个联合类型：
  `"all" | "unread" | "newsletter" | "pending"`。这样「未读 + 订阅」不会叠加成
  用户无法预测的交集——这是 §11.3 已经踩过的坑（两个独立开关会叠加）。
  技术实现上 `unreadOnly()` 由 `quickFilter() === "unread"` 派生，不需要第二个信号。
- 三个 chip 现在是**逐字复制的三段内联 JSX**（`Imbox.tsx:1252-1299`），加第四个之前先
  抽成一个 `<ImboxChip>`（§3.3 DRY，3 个调用者已达提取阈值）。
- chip 行从 `<Show when={activeTab()==="new"}>` 里提出来，常驻显示。注释里记着的真实
  用户报告（筛选把列表筛空后 chip 也消失，用户退不回去）现在对三个 chip 都成立，
  由新的空状态兜底。
- 「一起读」按钮留在 chip 行右端，`disabled={activeList().length === 0}` 不变。

### 7.5 空状态

`TabEmpty`（`Imbox.tsx:1475`）删除，换成 `FilterEmpty`，文案由「有没有筛选」和
「是不是冷启动」决定，而不是「哪个 tab」：

| 情况 | 标题 | 说明 | 行动 |
|---|---|---|---|
| 没有账户 | 还没有连接邮箱 | 连接你的第一个邮箱后… | 添加邮箱账户 |
| 有账户、无筛选、列表空 | 收件箱是空的 | 需要你处理的邮件会出现在这里 | — |
| 未读筛选、未读为 0 | 都读完了 🎉 | 「全部」里还有 N 封已读 | 查看全部 |
| 订阅/新面孔筛选空了 | 筛选条件下没有邮件 | 清除筛选即可看到全部 | 清除筛选 |

### 7.6 保持不变

`renderList` 的 bundle 分组、`priorityScore` 排序、`DateGroupedList` 日期分组、
`piles`、`removeFromBoth`（重命名为 `removeRow`，因为只剩一条列表）、
`registerPrepend`（新邮件永远未读，属于合并列表）、IntersectionObserver 无限滚动、
j/k/x/l/a/e/t/z/!/u 快捷键（`openAndMarkRead` 调用点改 `openMessage`）。

## 8. 删除清单

| 文件 | 删除 |
|---|---|
| `views/Imbox.tsx` | `ImboxTabs`、`ImboxTabButton`、`TabEmpty`、`ImboxTabId`、`activeTab`、`newPaged`/`seenPaged`、`paged()` 派生访问器、`openAndMarkRead`、`keepScrollStill` |
| `components/AccountTabs.tsx` | `mode: "read"` 分支；联合收窄为 `"all" \| "unread"` |
| `stores/data.ts` | `ListMessagesOptions.readOnly` 及其 SQL 分支（唯一调用者是上面那个 `"read"`） |

**我做的判断（可以否决）**：`readOnly` 删到数据层。依据 §15.1.5「没有 3 个真实调用者
就不要留抽象」——删掉 tab 后它零调用者，留着就是死代码。代价是同时删掉
`data.account-scope.test.ts:133` 那一例。如果你想保留这个数据能力，说一声，我只删 UI 侧。

## 9. 测试

**新增单元测试**（`views/Imbox-helpers.ts` + `Imbox.test.ts`，纯逻辑必须有测试）：

1. `olderUnread(recentUnread, unreadTotal)`：正常差、最近 > 总数时夹到 0、
   `recent >= CAP` 时返回 0（现在这段分支内联在组件里，无法测）。
2. `readTotal(unreadTotal, total)`：已读数 = 总数 - 未读，下界 0。
3. `shouldDropOnRead(unreadOnly, patch)`：筛选开 + 变已读 → true；筛选关 → false；
   patch 不含 `unread` → false。

**e2e 改动**（选择器跟随）：`imbox.spec.ts:225,226,324-328,439`、
`scenarios.spec.ts:328`、`workflows.spec.ts:653` 里的 `[data-imbox-tab='new'|'seen']`
改为 `[data-imbox-filter='unread']`、`[data-imbox-filter='all']`。

**新增 e2e**：点开一封未读 → 行仍在原位（同一 `data-message-id` 仍可见）→ 类名不再含
`unread` → 未读数减 1。这是本次改动的核心承诺，必须有回归守卫。

## 10. 验证

- `pnpm typecheck` / `pnpm lint` / `pnpm exec vitest run`（当前 293 例）
- `pnpm e2e`（Playwright，桌面视口）
- 真机 debug bundle 目视：点击不跳、未读筛选、bundle 展开、piles、移动端 375px 断点
- `docs/PROGRESS.md` 记录 + AGENTS §11.19 追加三条教训

## 11. 留给实施者的

- chip 的视觉是否与 `feed-section-action`（一起读）同一行在 375px 下换行——需要真机确认，
  必要时 chip 行允许横向滚动。
- `registerMessageUpdated` 的 Imbox 订阅与 `paginated-messages` 内部的 `patchMessage`
  订阅谁先执行不影响结果（幂等），但 `removeByIds` 必须在 `patchMessage` 之后仍安全
  （`patchMessage` 对已移除的 id 是 no-op，已验证）。
