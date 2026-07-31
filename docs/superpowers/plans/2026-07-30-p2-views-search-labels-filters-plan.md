# P2 视图与导航增强 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 SendPalm prototype-v11 P1 基础上，扩展联系人详情、新增公司 Account 页、全局搜索页、标签管理、高级筛选，把只读列表升级为可探索的信息架构。

**Architecture:** 继续复用 P1 的共享表单/Modal 基础设施与 `renderMain()` 全量刷新模式；新增视图走 `state.view` 切换，搜索/筛选状态保存在 `state.*`，数据仍全部来自内存 `D.*`。

**Tech Stack:** Vanilla JS, CSS, HTML modal containers, in-memory data.

## Global Constraints

- 继续用 P1 共享 helper：`openModalCard`, `renderFormGroup`, `renderPillInput`, `renderToggle`, `confirmDestructive`, `elAttr`。
- 所有 modal 支持 `Esc`、点击遮罩、`×` 关闭。
- 移动端 modal 全屏，底部固定操作栏。
- 表单风格沿用 HEY 大疏单栏、iOS toggle、主按钮右下。
- 数据仍在 `D.*`，无持久化/API 层。
- 每完成一个任务需通过 WebBridge 或 headless 截图 + 运行时错误检查验证。

---

## Task 6: 联系人详情标签扩展

**Files:**
- Modify: `js/prototype-v11.js` — `renderContactPanel`
- Modify: `css/prototype-v11.css` — tab styles
- Modify: `prototype-data.js` — enrich messages/files with channel/insights data if needed
- Test: WebBridge screenshot of contact detail with each tab

**Interfaces:**
- Consumes: existing `renderContactPanel`, P1 helpers
- Produces: contact tab rendering for Timeline / Files / Insights / Network / Calendar

- [ ] **Step 1: Refactor `renderContactPanel` to use tabs**

In `js/prototype-v11.js`, find `renderContactPanel`. Currently it likely renders two sections (Timeline + Files). Replace with a tab bar:

```js
const tabs = ['Timeline', 'Files', 'Insights', 'Network', 'Calendar'];
const activeTab = state.contactTab || 'Timeline';
// render tab buttons; on click set state.contactTab and renderMain()
```

Add CSS:
```css
.contact-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--border); margin-bottom: 12px; }
.contact-tab { padding: 8px 12px; font-size: 13px; font-weight: 600; color: var(--text-secondary); background: none; border: none; cursor: pointer; }
.contact-tab.active { color: var(--text-primary); border-bottom: 2px solid var(--accent); }
```

- [ ] **Step 2: Timeline tab**

Move existing communication timeline here. Add follow-up markers per message (Todo / Waiting / Done). Allow clicking a marker to cycle status.

- [ ] **Step 3: Files tab**

Move existing file list here.

- [ ] **Step 4: Insights tab**

Compute and render:
- Average reply time this month vs last month (simple avg of `message.responseTime` if present, else estimate from timestamps).
- Top topics (from `contact.topics` or extracted from message subjects).
- 3-month communication frequency (bar chart simulated with divs).
- Best contact time (day/hour with most messages).

- [ ] **Step 5: Network tab**

Render three sections:
- **共同联系人**：contacts who appear in messages with this contact.
- **同事**：contacts with same `company`.
- **相似联系人**：contacts with similar `topics` or communication patterns.

- [ ] **Step 6: Calendar tab**

List upcoming and past meetings where this contact is an attendee.

- [ ] **Step 7: Test and commit**

```bash
git add js/prototype-v11.js css/prototype-v11.css prototype-data.js
git commit -m "feat(contacts): five-tab detail panel with insights and network"
```

---

## Task 7: 公司 / Account 详情页

**Files:**
- Modify: `js/prototype-v11.js` — add `renderCompanyView`, `openCompanyView`
- Modify: `js/prototype-v11.js` — contacts list grouping toggle
- Modify: `css/prototype-v11.css` — company view styles
- Test: WebBridge screenshot

**Interfaces:**
- Consumes: `D.contacts` grouped by `company`
- Produces: `renderCompanyView(companyName)`

- [ ] **Step 1: Add company aggregation helper**

```js
function getCompanyContacts(company) {
  return D.contacts.filter(c => (c.company || '').toLowerCase() === (company || '').toLowerCase());
}
function getCompanyDomain(company) { ... }
```

- [ ] **Step 2: Add "Group by company" toggle in Contacts view**

In `renderPeople`, add a segmented control or button: "All contacts" / "By company". When "By company", render company rows with aggregated health and people count.

- [ ] **Step 3: Add `renderCompanyView(companyName)`**

New main view (set `state.view = 'company'`). Layout:
- Header: company initials, name, domain, health score, active people count.
- Tabs: People / Communications / Files / Meetings / Insights.
- People tab: list contacts with roles.
- Communications/Files/Meetings tabs: aggregate from company contacts.
- Insights tab: aggregate reply times, top topics, communication frequency.

- [ ] **Step 4: Wire entry points**

- Contacts list "By company" rows click → `renderCompanyView`.
- Contact detail company name click → `renderCompanyView`.

- [ ] **Step 5: Test and commit**

```bash
git add js/prototype-v11.js css/prototype-v11.css
git commit -m "feat(companies): company account detail view and group-by-company"
```

---

## Task 8: 全局搜索页

**Files:**
- Modify: `js/prototype-v11.js` — add `renderSearchView`, wire top search
- Modify: `css/prototype-v11.css` — search results styles
- Test: WebBridge screenshot

**Interfaces:**
- Consumes: `D.contacts`, `D.messages`, `D.files`, `D.events`, `D.tasks`
- Produces: `renderSearchView()`

- [ ] **Step 1: Wire global search input**

Find the top search input. On Enter/Return, set `state.view = 'search'` and `state.searchQuery = input.value`.

- [ ] **Step 2: Add `renderSearchView()`**

Layout:
- Left sidebar: filter types All / People / Messages / Files / Meetings / Tasks.
- Center: grouped result list.
- Right: preview of selected result (reuse detail-panel).

- [ ] **Step 3: Implement search functions**

```js
function searchContacts(q) { ... }
function searchMessages(q) { ... }
function searchFiles(q) { ... }
function searchMeetings(q) { ... }
function searchTasks(q) { ... }
```

Use simple lowercase substring matching. Highlight query in results.

- [ ] **Step 4: Result row interactions**

Click a result to set `state.selectedSearchResult` and render preview in right panel.

- [ ] **Step 5: Add `/` keyboard shortcut**

In global key handler, if `/` pressed and not in input, focus search input.

- [ ] **Step 6: Test and commit**

```bash
git add js/prototype-v11.js css/prototype-v11.css
git commit -m "feat(search): global search page across people, messages, files, meetings, tasks"
```

---

## Task 9: 标签 / Label 管理

**Files:**
- Modify: `js/prototype-v11.js` — add Labels tab in Settings, `openLabelModal`
- Modify: `css/prototype-v11.css` — label manager styles
- Modify: `prototype-data.js` — ensure label colors
- Test: WebBridge screenshot

**Interfaces:**
- Consumes: `D.labels` array of `{id,name,color}`
- Produces: CRUD for labels

- [ ] **Step 1: Enable Labels tab in Settings**

In `renderSettings`, activate the Labels tab (currently P2/P3 stub).

- [ ] **Step 2: Render label list**

Show color dot, name, usage count. Add "New label" button.

- [ ] **Step 3: Add `openLabelModal(labelId)`**

Fields:
- Name (text)
- Color (12 preset color dots)

Save: push new or update existing in `D.labels`. Update contacts using old name/id if id changed.
Delete: confirmDestructive, remove from `D.labels`, remove label id from all `contact.labels`.

- [ ] **Step 4: Test and commit**

```bash
git add js/prototype-v11.js css/prototype-v11.css prototype-data.js
git commit -m "feat(labels): settings label manager with create, edit, delete"
```

---

## Task 10: 高级筛选

**Files:**
- Modify: `js/prototype-v11.js` — add filter panel to Inbox/Contacts/Files/Calendar
- Modify: `css/prototype-v11.css` — filter panel styles
- Test: WebBridge screenshot

**Interfaces:**
- Consumes: view-specific data
- Produces: filtered list rendering

- [ ] **Step 1: Add "More filters" button**

In Inbox, Contacts, Files, Calendar list headers, add "More filters" next to existing filter pills.

- [ ] **Step 2: Add filter panel modal/drawer**

Use `openModalCard` or a right-side drawer. Fields:
- Date range (from/to)
- Channel (Email/Slack/WeChat/Calendar) — Inbox only
- Contacts multi-select pills
- Status toggles: unread, has attachment, followed up
- Sort: newest/oldest/most relevant

- [ ] **Step 3: Apply filters**

Store filters in `state.filters[viewId]`. Modify each view's render function to apply filters before rendering the list.

- [ ] **Step 4: Clear filters**

Add "Clear all" button.

- [ ] **Step 5: Test and commit**

```bash
git add js/prototype-v11.js css/prototype-v11.css
git commit -m "feat(filters): advanced filter panel for inbox, contacts, files, calendar"
```

---

## P2 验收

- [ ] 联系人详情有 5 个可切换标签。
- [ ] Contacts 可按公司分组，点击公司进入公司详情。
- [ ] 全局搜索页可跨类型搜索并预览。
- [ ] Settings Labels 可增删改标签。
- [ ] Inbox/Contacts/Files/Calendar 有高级筛选面板。
- [ ] WebBridge 截图验证各视图无运行时错误。
- [ ] 所有改动已提交并 push 到 main。
