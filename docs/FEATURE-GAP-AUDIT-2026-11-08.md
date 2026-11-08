# SendPalm 功能缺口审计 — 2026-11-08

## 0. 要回答的原话

> 还有什么功能性的东西我们是没做完的？比如说多邮件账户。多邮件账户的话，我们怎么
> 合并这些邮件？以及怎么切换这些邮件的账户？这些都是我们要思考的问题。
>
> 然后你也审计一下，看看还有哪些功能性的东西我们是没有完成好的。然后把它一起完成
> 了吧。

> 触发：用户问"还有哪些功能性的东西是没做完的？比如多邮件账户怎么合并、怎么切换"，
> 并要求"审计一下……然后把它一起完成"。
>
> 范围：`app/src/**`、`app/src-tauri/src/**`、`app/e2e/**`，对照 `docs/PRD-v1.md` §3.19
> 与 `prototypes/sendpalm-suite.html`。本文是**审计记录 + 完成状态**，不是计划。

严重度：**H** = 用户可感知的主功能缺失/错误；**M** = 局部功能不可用或说错话；
**L** = 体验/一致性。

---

## 1. 多邮件账户（用户点名的部分）

| # | 缺口 | 严重度 | 证据（改前） | 状态 |
|---|---|---|---|---|
| A1 | 邮件只能全部混在一起，无法按账户查看 | H | `stores/data.ts` `ListMessagesOptions` 无账户字段；`listMessagesPaged` 的 WHERE 从不引用 `messages.ac` | ✅ 已修 |
| A2 | 没有账户切换入口 | H | `Sidebar.tsx` 只渲染 `NAV_GROUPS`；`Topbar.tsx` 账户菜单只有设置/快捷键/错误日志 | ✅ 已修 |
| A3 | `accounts.privacy`（`unified`/`isolated`）是死字段 | H | 唯一写入点是 `Settings.tsx:1113` 硬编码 `"unified"`，全仓无读取方 | ✅ 已修 |
| A4 | 合并后分不清邮件来自哪个账户 | H | 所有账户的 `color` 都写死 `#0a8f63`；行内无账户标识 | ✅ 已修 |
| A5 | 侧栏未读徽章与当前账户无关 | M | `countUnreadByBucket()` 全表计数，不接账户过滤 | ✅ 已修 |
| A6 | 中途新增账户要重启才出现在 tab 条 | H | `createResource(listAccounts)` 只订阅 soft tick，而账户增删不 bump 任何 tick（e2e 测出） | ✅ 已修 |

**设计取舍**（写在代码里）：合并是默认，因为合并零成本（同一张表）；切换是过滤。
「隔离」用已有的 `privacy` 字段而不是新字段。判据统一为"徽章必须描述它下面那个列表"。

## 2. 其他功能缺口

| # | 缺口 | 严重度 | 证据（改前） | 状态 |
|---|---|---|---|---|
| B1 | 文件夹里的邮件打不开 | H | `views/Folders.tsx` 展开后的行是 `<div>`，只有"移出文件夹"按钮 | ✅ 已修 |
| B2 | 文件夹分不清"空"和"读失败" | M | `listLabels` 失败时落到"还没有文件夹"空态 | ✅ 已修 |
| B3 | `b`/`v` 把用户从 Stream/Records/Trash 拽回收件箱 | M | `utils/shortcuts.ts` 的 `message:label` / `message:move` 无条件 `setView("imbox")` | ✅ 已修 |
| B4 | ⌘K「新建联系人/任务/日程」只导航不新建 | M | `search/CommandPalette.tsx` 三个命令只 `setView`；"新建任务"还跳去 `followUps` | ✅ 已修 |
| B5 | 定时发送丢线程与 HTML | M | `services/scheduled_send.rs` 给 `smtp.send` 传 `None`(html)/`None`(in-reply-to)；草稿表无对应列 | ✅ 已修（迁移 0031） |
| B6 | `syncFrequency: "manual"` 仍每小时轮询 | M | `sync_loop.rs` 把 `manual` 映射成 1 小时 IDLE 超时 | ✅ 已修 |
| B7 | 通知「摘要」模式不存在 | M | `preferences.notifications.digest` 无任何读取方；Rust `NotificationPrefs` 无该字段 | ✅ 已修 |
| B8 | 单个附件上限写死 25MB | L | `Compose.tsx` `MAX_ATTACHMENT_BYTES` 常量，`maxAttachmentMb` 无读取方 | ✅ 已修 |
| B9 | 回信失败被文案说成"功能没做" | M | `panels/MeetingPanel.tsx` 对 `safeInvoke` 的 null 统一提示"当前环境暂不支持回信" | ✅ 已修 |
| B10 | 一起读（ReadTogether）不跟随账户 | M | 直接 `listMessagesPaged({bucket:"imbox"})`，无账户过滤 | ✅ 已修 |
| B11 | Agent 草稿"批准"后哪里都不出现 | H | `agent/useAgent.ts` `approveDraft` 只改 `agent_drafts.status` 并提示"可在草稿箱中发送"；草稿箱读的是另一张 `drafts` 表，所以批准=石沉大海 | ✅ 已修（批准时物化一行 `drafts`） |
| B13 | 缺失头像名字会让整个 App 变黑屏 | H | `components/Avatar.tsx` `hashHue(undefined)` 抛 `Cannot read properties of undefined (reading 'length')`；`index.html` 的全局错误处理器把任意 `error` 事件渲染成 `z-index:99999` 的全屏黑块，于是"某个联系人没有名字"= 整个界面点不动 | ✅ 已修（`hashHue`/`initials` 容忍空名字 + 渲染占位） |
| B14 | 浏览器的无害警告也会让整个 App 变黑屏 | H | 同上处理器接住了 `ResizeObserver loop completed with undelivered notifications`（规范允许的良性警告），3x 数据滚动时必现，把界面整个盖住 | ✅ 已修（过滤良性消息，其余照旧） |
| B15 | e2e 里 `page.evaluate(import('/src/stores/ui.ts'))` 是空操作 | M | dev 下动态 `import()` 可能拿到与 App 不同的模块实例，信号改了界面不动；`workflows.spec.ts` 的 `setDetailOpen(false)` 与 `bumpSoftRefreshTick()` 都无效，"375px 详情面板挡导航"这条长期失败其实源于此 | ✅ 已修（改走真实返回按钮；删掉冗余 poke） |
| B12 | 「自动起草回复」「自动生成简报」是死开关 | M | `agent.autoDraft` / `agent.autoSummarize` 只被自己的开关读取，无任何消费方；`autoSummarize` 默认还是 `true` | ❌ 删除（无消费场景，不留在界面上撒谎） |

## 3. PRD §3.19「安全」

| # | 项 | 严重度 | 处理 | 说明 |
|---|---|---|---|---|
| C1 | 应用锁 `appLock` | H | ✅ 实装 | 4–8 位 PIN（加盐拉伸摘要）、一次性恢复码、忘记两者的手动重置路径写在锁屏上；启动套锁 + 手动锁定；锁屏 z-index 高于 toast。**威胁模型在 UI 里写明：不加密磁盘。** |
| C2 | 禁止截图 `screenshotAllowed` | L | ❌ 删除 | macOS 需 `NSWindow.sharingType` 原生调用 + 新增 objc2 直接依赖（AGENTS §3.1 要求先做选型检索）。 |
| C3 | 剪贴板同步 `clipboardSync` | L | ❌ 删除 | 语义依赖多设备同步，当前无后端。 |
| C4 | 自动下载附件 `autoDownloadAttachments` | L | ❌ 删除 | 应用里没有"自动下载"路径（附件字节始终按需取）；补预取反而违反 §11.7 的省内存方向。 |
| C5 | Agent「自动起草 / 自动简报」 | M | ❌ 删除 | 见 B12：两个开关没有任何读取方，简报连展示位置都没有定义。 |

删除理由与恢复路径同时记录在 `docs/TODOS.md`「未实装（有意为之）」。

## 4. 明确不在本次范围

| 项 | 原因 |
|---|---|
| Gmail / Outlook 的 OAuth | `docs/OAUTH-DECISION.md` 定为 v4 范围；v3 用应用专用密码/授权码覆盖 ≥90% 用户 |
| iOS 首帧黑屏 | 既存问题，记录在 `docs/PROGRESS.md` 2026-11-06 条目；属于构建/WKWebView 资源加载 |
| `x` 多选只在收件箱可用 | 提示语如实告知（"多选暂只在 Inbox 可用"），不是假装可用 |
| 筛选面板的日期/联系人/附件维度 | `FilterPanel.tsx` 头注释已注明需要查询支持；未做但不撒谎 |

## 5. 验证

| 层 | 命令 | 结果 |
|---|---|---|
| TS 单测 | `pnpm exec vitest run` | **723 passed / 79 files**（起点 663） |
| Rust 单测 | `cargo test --lib` | **157 passed** |
| 类型 | `pnpm exec tsc --noEmit` | 干净 |
| Lint | `pnpm exec eslint . --max-warnings=0` | 干净 |
| 构建 | `pnpm build` | 成功 |
| 端到端 | `pnpm exec playwright test` | **153 passed，0 failed，1 skipped**（4.9 分钟） |

两条长期失败的用例原本在 base commit `43527a0` 上也能复现，本轮查明都是**真 bug** 并修掉：

1. `workflows.spec.ts` @375px —— 不是面板挡导航，而是测试里的
   `page.evaluate(import(...).setDetailOpen(false))` 根本没生效（B15）。改成点真实的
   返回按钮后三个宽度全绿。
2. `perf-2-pass.spec.ts` 3x 压测 —— `Avatar.hashHue` 收到 `undefined` 名字抛
   `TypeError`（B13）；修掉后暴露第二层：良性的 `ResizeObserver loop` 警告同样会被
   渲染成全屏黑块（B14）。两个都修完，这条 6.7 分钟跑不完的用例现在 19 秒通过。

新增端到端覆盖：

- `e2e/accounts.spec.ts`（4 条）：合并视图列出两个邮箱；tab 收窄到单个邮箱；
  隔离邮箱不进「全部账户」但可从自己的 tab 进入；单邮箱不渲染 tab 条。
- `e2e/app-lock.spec.ts`（3 条）：从设置页开启应用锁、立即锁定后锁屏盖住 shell、
  错 PIN 不放行、恢复码可解锁。全部走真实点击，不用 `page.evaluate` 戳 store
  （dev 下 `import()` 可能拿到与 App 不同的模块实例，信号改了但界面无反应）。
- `e2e/agent-drafts.spec.ts`（1 条）：批准 Agent 草稿后它真的出现在草稿箱。
  该用例在去掉修复后**确认失败**（`git stash` 复跑验证），是真正的回归守卫。

## 6. 完成状态（结论）

**所有检查全绿。**

- TypeScript 单测：**723 passed**（起点 663，新增 60 条）
- Rust lib 测试：**157 passed**
- `tsc --noEmit` / `eslint . --max-warnings=0` / `pnpm build`：干净，无警告
- Playwright 端到端：**153 passed / 0 failed / 1 skipped**，4.9 分钟
- 上一轮被判"既存失败"的两条用例已查明是**真 bug**（B13/B14/B15）并修掉，
  3x 压测从 6.7 分钟超时变成 19 秒通过

**用户问的两个问题都有可运行的答案：**

1. 「怎么合并」—— 默认就合并：所有邮箱写进同一张 `messages` 表，每行 `ac` 标明来源；
   同一发件人跨账户仍聚合为一个会话组；`accounts.privacy = isolated` 的邮箱不进合并。
2. 「怎么切换」—— 邮件列表上方的账户 tab（收件箱/报刊/单据/回收站/垃圾邮件/一起读），
   选中即就地重新分页；单邮箱用户不显示这排 tab。

**没有遗留的待办功能**：审计出的 15 项全部修完；PRD §3.19 里 5 项（禁止截图 /
剪贴板同步 / 自动下载附件 / Agent 自动起草 / Agent 自动简报）是**明确删除**而非遗漏，
理由与恢复路径见第 3 节和 `docs/TODOS.md`「未实装（有意为之）」。OAuth 按
`docs/OAUTH-DECISION.md` 属 v4 范围。

## 7. 相关提交

```
72c9e2b fix(ui): a missing avatar name must not blank the whole app
d7185a2 test(lock): drive the app lock through the real settings UI
4902f90 fix(agent): an approved draft actually reaches 草稿箱
d1557f6 docs(audit): write down the 2026-11-08 functional gap audit
d9f5988 fix(sidebar): the unread badge describes the mailbox you're in
170444b docs(progress): record the app lock landing
bd80472 feat(security): ship app lock instead of deleting it
8b8768e feat(read-together): follow the selected mailbox
2f51464 fix(accounts): a mailbox added mid-session appears without a restart
af7845c feat(notify): digest mode plumbing on the Rust side
37c6cb2 feat(settings): 通知摘要、可配附件上限，并删掉四个死开关
563c055 fix(meeting): describe a failed RSVP honestly
ffe742b fix(palette): "新建联系人 / 任务 / 日程" now creates
7d7e557 fix(sync): "手动" finally means no background sync
573dcfd fix(compose): scheduled replies keep their thread and formatting
9d73e08 fix(shortcuts): label/move no longer drag you out of the current view
25218fb fix(folders): messages in a folder can be opened again
9ee7525 feat(accounts): merge every mailbox, and let the user switch between them
```

## 8. 一句话结论（纯文本，便于引用）

审计覆盖 app/src、app/src-tauri/src、app/e2e，逐项记录在本文，15 项功能缺口全部修复。
多账户合并：默认就合并，所有邮箱写入同一张 messages 表，每行 ac 标明来源，隔离账户除外。
多账户切换：邮件列表上方提供账户 tab，选中即就地重新分页，单邮箱用户不显示这排 tab。
应用锁已实装，含 PIN、一次性恢复码与手动重置路径，界面写明它不加密本地数据。
放弃的五项设置已删除并写明理由：禁止截图、剪贴板同步、自动下载附件、Agent 自动起草、Agent 自动简报。
验证结果：TypeScript 单测 723 通过，Rust lib 测试 157 通过，类型检查与 lint 与构建均干净。
Playwright 端到端 153 通过、0 失败、1 跳过，用时 4.9 分钟。
工作树干净，共 19 个提交。

---

## 9. 第二轮（同日）：错误状态 / loading 状态 / 黑屏

用户补充："还有我们的错误状态。以及 loading 状态这些东西最好都补全一下，因为之前
测试我也遇到过黑屏的问题。"

### 9.1 黑屏的三条来路（都堵掉了）

| # | 来路 | 修法 |
|---|---|---|
| E1 | 渲染期任何异常直接冲出 Solid 树，窗口留白 | `components/AppErrorBoundary.tsx`：包住 shell 与视图切换，保留侧栏/顶栏，给「重试 / 重新载入 / 技术详情」，异常同时进错误日志。`Main` 传 `resetKey={view()}`，切走视图即清空，不会被一个坏视图钉死 |
| E2 | `index.html` 把**任何** window error 渲染成 `z-index:99999` 全屏黑块 | 按阶段拆开：`body.app-ready` 之前仍是全屏诊断面板（启动失败没东西可救）；之后就一条可关闭的底部提示条 + 「重新载入」，界面照常可用 |
| E3 | 惰性加载的视图 chunk 拉取失败（离线首次进入）→ Suspense 永远挂着或抛错 | E1 的边界同时接住 lazy 拒绝，给重试 |

另外把 `ResizeObserver loop…` 这类规范允许的良性警告滤掉——它此前同样会把整个界面糊死。

### 9.2 loading / 错误状态补齐

2026-08-18 那轮只给**视图**加了 `ResourceGate`；面板、浮层、设置分区仍然「加载中什么都没有、失败也什么都没有」。新增面板形制的孪生组件 `components/PanelState.tsx`（紧凑骨架 / 带重试的错误 / 可选的空态），接到：

`TaskPanel`、`DraftPanel`、`NotificationPanel`、`Compose`（账户读取）、`LiveSearch`、`CommandPalette`、`RulesSettings`、`LabelPicker`、`LlmProviderSettings`、`AgentConnectionPanel`。

其中两处是**在说假话**，不只是空白：

- 通知面板在查询进行中/失败时都显示「暂无新通知」。
- Agent 连接面板在探测过程中显示「没有检测到已安装的 Agent 客户端」——对用户自己的机器给出错误结论。

`components/data-states.test.ts` 是回归守卫：23 个资源消费方必须同时具备 loading 标记与 error 标记。

### 9.3 本轮验证

| 层 | 结果 |
|---|---|
| TS 单测 | **774 passed**（新增 51：错误边界 5 + 状态矩阵 46） |
| Playwright | **155 passed / 0 failed / 1 skipped**，5.3 分钟 |
| Rust | 157 passed（本轮未改 Rust） |
| `tsc` / `eslint --max-warnings=0` / `pnpm build` | 干净 |

新增 e2e `error-surface.spec.ts`（2 条）：运行期报错只出提示条、黑块不出现、界面仍可导航；良性 ResizeObserver 警告完全不出现在界面。
