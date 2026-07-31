# P3 产品与系统层 + 邮箱设置 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 SendPalm prototype-v11 P2 基础上，补齐 Onboarding、Insights 仪表盘、数据管理、快捷键自定义，并增强邮箱账号设置，使原型接近完整产品。

**Architecture:** 继续复用 P1/P2 的共享表单/Modal 基础设施与 `renderMain()` 全量刷新模式；新增视图走 `state.view` 切换，数据仍全部来自内存 `D.*`。

**Tech Stack:** Vanilla JS, CSS, HTML modal containers, in-memory data.

## Global Constraints

- 继续用 P1 共享 helper：`openModalCard`, `renderFormGroup`, `renderPillInput`, `renderToggle`, `confirmDestructive`, `elAttr`。
- 所有 modal 支持 `Esc`、点击遮罩、`×` 关闭。
- 移动端 modal 全屏，底部固定操作栏。
- 表单风格沿用 HEY 大疏单栏、iOS toggle、主按钮右下。
- 数据仍在 `D.*`，无持久化/API 层。
- 每完成一个任务需通过 WebBridge 或 headless 截图 + 运行时错误检查验证。

---

## Task 11: Onboarding 流程

**Files:**
- Modify: `js/prototype-v11.js` — add onboarding overlay/wizard
- Modify: `prototype-data.js` — add `D.onboarding` state
- Modify: `css/prototype-v11.css` — onboarding styles
- Test: WebBridge screenshot of each step

**Interfaces:**
- Consumes: existing render functions
- Produces: `renderOnboarding()`, `startOnboarding()`, `completeOnboardingStep()`

- [ ] **Step 1: Add onboarding state and entry points**

Add to `state`:
```js
onboardingStep: localStorage.getItem('sendpalm-onboarding') ? null : 0,
onboardingCompleted: !!localStorage.getItem('sendpalm-onboarding')
```

On app init, if `state.onboardingStep !== null`, render onboarding overlay instead of main app.
Add Settings → "Replay onboarding" button.

- [ ] **Step 2: Build onboarding wizard**

4 steps:
1. **Welcome**: brand value prop + "Get started".
2. **Connect channels**: cards for Gmail / Outlook / Slack / Calendar; user can select and "Connect" (simulated OAuth) or skip.
3. **Indexing**: fake progress bar 0-100% over 2-3 seconds, then show first insight preview.
4. **Done**: show "3 things to focus on this week" (top unread/important items) + "Open Inbox".

- [ ] **Step 3: Persist completion**

On step 4 "Open Inbox", set `localStorage.setItem('sendpalm-onboarding', '1')` and set `state.onboardingStep = null`.

- [ ] **Step 4: Test and commit**

```bash
git add js/prototype-v11.js css/prototype-v11.css prototype-data.js
git commit -m "feat(onboarding): 4-step first-run wizard"
```

---

## Task 12: Insights 仪表盘

**Files:**
- Modify: `js/prototype-v11.js` — add `renderInsightsView`
- Modify: `js/prototype-v11.js` — add Insights to sidebar nav
- Modify: `css/prototype-v11.css` — insights dashboard styles
- Test: WebBridge screenshot

**Interfaces:**
- Consumes: `D.contacts`, `D.messages`, `D.events`, `D.tasks`
- Produces: `renderInsightsView()`

- [ ] **Step 1: Add Insights nav item**

In sidebar navSections, add `Insights` with icon `ph-chart-bar` between Files and Agent (or after Calendar depending on current order).

- [ ] **Step 2: Add `renderInsightsView()`**

Layout: responsive grid of cards.

Cards:
- **本周沟通量 vs 上周**：number + trend arrow.
- **Top People**：list of top 5 contacts by message count + health.
- **平均回复时间趋势**：3-month line chart simulated with divs.
- **渠道占比**：Email / Slack / WeChat / Calendar bar/percent.
- **待跟进总数**：number with click to open Agent/tasks.
- **Agent 本周完成动作数**：number + list of recent agent actions.
- **关系健康度分布**：Healthy / At risk / Cold counts.

- [ ] **Step 3: Compute stats helpers**

```js
function computeWeeklyVolume() { ... }
function computeTopPeople(limit = 5) { ... }
function computeReplyTimeTrend() { ... }
function computeChannelShare() { ... }
function computeFollowUpCount() { ... }
function computeAgentActionsThisWeek() { ... }
function computeHealthDistribution() { ... }
```

- [ ] **Step 4: Test and commit**

```bash
git add js/prototype-v11.js css/prototype-v11.css
git commit -m "feat(insights): analytics dashboard view"
```

---

## Task 13: 导入 / 导出 & 数据管理

**Files:**
- Modify: `js/prototype-v11.js` — activate Data tab in Settings
- Modify: `css/prototype-v11.css` — data management styles
- Test: WebBridge screenshot + verify downloads

**Interfaces:**
- Consumes: `D.*`
- Produces: data export JSON/CSV, destructive operations

- [ ] **Step 1: Activate Data tab in Settings**

In `renderSettings`, enable the Data tab.

- [ ] **Step 2: Build Data management section**

Options:
- **Export mailbox backup**: generate JSON blob, trigger download `sendpalm-backup-YYYY-MM-DD.json`.
- **Export contacts CSV**: generate CSV, trigger download.
- **Export tasks JSON**: generate JSON, trigger download.
- **Empty Trash**: confirmDestructive, permanently delete messages in trash, renderMain.
- **Delete all data**: confirmDestructive with typed confirmation "delete all", reset `D.*` sample data to defaults, clear localStorage except onboarding flag.
- **Delete account**: simulated, show "This would delete your account" warning.

- [ ] **Step 3: Add export helpers**

```js
function downloadJSON(filename, data) { ... }
function downloadCSV(filename, rows) { ... }
function resetAllData() { ... }
```

- [ ] **Step 4: Test and commit**

```bash
git add js/prototype-v11.js css/prototype-v11.css
git commit -m "feat(data): import/export and data management settings"
```

---

## Task 14: 快捷键自定义

**Files:**
- Modify: `js/prototype-v11.js` — activate Shortcuts tab, add shortcut editor
- Modify: `prototype-data.js` — add default shortcuts
- Modify: `css/prototype-v11.css` — shortcut editor styles
- Test: WebBridge screenshot

**Interfaces:**
- Consumes: `D.shortcuts` or `D.user.shortcuts`
- Produces: editable shortcuts list

- [ ] **Step 1: Activate Shortcuts tab**

In `renderSettings`, enable Shortcuts tab.

- [ ] **Step 2: Add default shortcuts data**

In `prototype-data.js`, add:
```js
D.shortcuts = [
  { action: 'New message', key: 'n', modifier: 'cmd' },
  { action: 'Search', key: '/' },
  { action: 'Inbox', key: 'g i' },
  // ...
];
```

- [ ] **Step 3: Render shortcuts list**

List: action name, current shortcut, Edit button.
Click Edit → modal that listens for next key combination.
Detect conflicts (same shortcut used twice).
Restore defaults button.

- [ ] **Step 4: Wire shortcuts to global key handler**

Make sure the existing `keydown` handler reads from `D.shortcuts` dynamically.

- [ ] **Step 5: Test and commit**

```bash
git add js/prototype-v11.js css/prototype-v11.css prototype-data.js
git commit -m "feat(shortcuts): customizable keyboard shortcuts"
```

---

## Task 15: 邮箱设置增强

**Files:**
- Modify: `js/prototype-v11.js` — add per-account email settings modal
- Modify: `prototype-data.js` — add email account settings fields
- Modify: `css/prototype-v11.css` — email settings styles
- Test: WebBridge screenshot

**Interfaces:**
- Consumes: `D.accounts` entries with `type: 'email'`
- Produces: `openEmailAccountSettings(accountId)`

- [ ] **Step 1: Add settings fields to email account data**

In `prototype-data.js`, for each email account add:
```js
settings: {
  aliases: ['alias@example.com'],
  signature: '— Best, Edwin',
  replyTo: '',
  defaultFrom: 'edwin@example.com',
  syncFolders: ['INBOX', 'Sent', 'Drafts'],
  syncFrequency: '15min',
  autoBcc: false,
  vacationResponder: { enabled: false, subject: '', body: '' }
}
```

- [ ] **Step 2: Add "Settings" button to account cards**

In `renderAccountsSection`, for email accounts add a "Settings" button next to Sync/Reconnect/Disconnect that opens `openEmailAccountSettings(a.id)`.

- [ ] **Step 3: Implement `openEmailAccountSettings(accountId)`**

Modal with tabs or stacked sections:
- **Identity**: label, display name, default From address (select from email + aliases), reply-to.
- **Signature**: textarea, option to use global signature or override.
- **Aliases**: dynamic list of alias emails.
- **Sync**: folder checkboxes (INBOX, Sent, Drafts, Archive, Trash), sync frequency select (5min/15min/30min/1h/manual).
- **Automation**: vacation responder toggle + subject/body, auto-BCC toggle + address.

Save updates `D.accounts` directly.

- [ ] **Step 4: Use per-account signature in compose**

Update `renderComposeWindow` to use the selected From account's signature override if present, else fall back to `D.user.signature`.

- [ ] **Step 5: Test and commit**

```bash
git add js/prototype-v11.js css/prototype-v11.css prototype-data.js
git commit -m "feat(email): per-account settings for aliases, signature, sync, auto-responder"
```

---

## P3 验收

- [ ] Onboarding 4 步可完整走通，完成后进入 Inbox。
- [ ] Insights 仪表盘有至少 6 个数据模块。
- [ ] Settings Data 支持导出和清空/删除操作。
- [ ] Settings Shortcuts 可编辑、检测冲突、恢复默认。
- [ ] 邮箱账号可设置 aliases/signature/sync/vacation responder，compose 使用对应签名。
- [ ] WebBridge 截图验证无运行时错误。
- [ ] 所有改动已提交并 push 到 main。
