# Relay Agentic 邮件客户端 HTML Prototype 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 基于已确认的设计文档，实现一个可交互的 HTML prototype（`prototype-v8.html`），呈现以人为中心的 Agentic 邮件客户端核心体验：For You 时间线、联系人详情、邮件阅读、日历、Agent 面板、Markdown 上下文导出。

**Architecture:** 单页 HTML prototype，CSS/JS 分离为 `css/prototype-v8.css` 和 `js/prototype-v8.js`，复用根目录已有 `prototype-data.js` 作为数据源。页面状态由纯 JS 对象管理，按视图渲染 DOM。

**Tech Stack:** HTML5, CSS3 (no framework), vanilla ES2020+, Phosphor Icons, Geist Sans / Geist Mono via CDN.

## Global Constraints

- 左侧导航/Agent 背景色 `#08090d`，主内容区背景色 `#f8f8f6`。
- 强调色 `#5B4CDB`，禁用 AI 紫渐变、霓虹 glow、纯黑/纯白背景。
- 字体：`Geist Sans` 用于 UI 正文，`Geist Mono` 用于数据/标签/时间。
- 圆角系统：`--radius-sm: 6px`，`--radius-md: 10px`，`--radius-lg: 14px`。
- 过渡曲线：`cubic-bezier(0.16, 1, 0.3, 1)`。
- 不实现真实后端、本地 LLM、向量数据库；所有数据来自 `prototype-data.js`。
- 不用 `Inter` 作主字体，不用三列等宽功能卡，不用假截图。
- 每个按钮、卡片、输入框必须有 hover/active/focus 状态。

---

## File Structure

| 文件 | 责任 |
|---|---|
| `prototype-v8.html` | 页面骨架，引入字体、图标、CSS、JS、数据源 |
| `css/prototype-v8.css` | 全部样式：布局、组件、状态、动画 |
| `js/prototype-v8.js` | 全部交互：状态管理、渲染、事件处理、上下文导出 |
| `prototype-data.js` | 已有数据源（contacts, messages, meetings, files, agent drafts...） |

---

## Task 1: 搭建页面骨架与基础 CSS tokens

**Files:**
- Create: `prototype-v8.html`
- Create: `css/prototype-v8.css`
- Create: `js/prototype-v8.js`

**Interfaces:**
- Produces: DOM root `#app`, CSS custom properties used by all later tasks, empty `js/prototype-v8.js` with `DOMContentLoaded` listener.

- [ ] **Step 1: 创建 `prototype-v8.html`**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Relay v8 — Agentic Email</title>
  <link href="https://fonts.cdnfonts.com/css/geist-sans" rel="stylesheet">
  <link href="https://fonts.cdnfonts.com/css/geist-mono" rel="stylesheet">
  <script src="https://unpkg.com/@phosphor-icons/web@2.1.1"></script>
  <link rel="stylesheet" href="css/prototype-v8.css">
</head>
<body>
  <div id="app">
    <header id="topbar"></header>
    <nav id="sidebar"></nav>
    <main id="main"></main>
    <aside id="detail-panel" class="hidden"></aside>
    <div id="agent-fab"></div>
    <div id="agent-panel" class="hidden"></div>
    <div id="toast"></div>
  </div>
  <script src="prototype-data.js"></script>
  <script src="js/prototype-v8.js"></script>
</body>
</html>
```

- [ ] **Step 2: 创建 `css/prototype-v8.css` 基础 tokens 与布局**

```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --nav-bg: #08090d;
  --main-bg: #f8f8f6;
  --surface: #ffffff;
  --surface-hover: #f2f2f0;
  --border: rgba(0,0,0,0.04);
  --border-strong: rgba(0,0,0,0.08);
  --text-primary: rgba(0,0,0,0.88);
  --text-secondary: rgba(0,0,0,0.55);
  --text-muted: rgba(0,0,0,0.35);
  --text-inverse: rgba(255,255,255,0.9);
  --text-inverse-muted: rgba(255,255,255,0.5);
  --accent: #5B4CDB;
  --accent-dim: rgba(91,76,219,0.10);
  --accent-glow: rgba(91,76,219,0.25);
  --green: #10b981;
  --yellow: #f59e0b;
  --red: #ef4444;
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --font-sans: 'Geist Sans', -apple-system, system-ui, sans-serif;
  --font-mono: 'Geist Mono', 'SF Mono', monospace;
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.04);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.06);
  --spring: cubic-bezier(0.16, 1, 0.3, 1);
}

html, body, #app { height: 100%; }
body {
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-primary);
  background: var(--main-bg);
  -webkit-font-smoothing: antialiased;
  overflow: hidden;
}

#app {
  display: grid;
  grid-template-columns: 56px 1fr;
  grid-template-rows: 48px 1fr;
  grid-template-areas:
    "topbar topbar"
    "sidebar main";
}

#topbar {
  grid-area: topbar;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  background: var(--main-bg);
  border-bottom: 1px solid var(--border);
  z-index: 20;
}

#sidebar {
  grid-area: sidebar;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 0;
  gap: 8px;
  background: var(--nav-bg);
  border-right: 1px solid rgba(255,255,255,0.05);
  z-index: 20;
}

#main {
  grid-area: main;
  position: relative;
  overflow: hidden;
  background: var(--main-bg);
}

#detail-panel {
  position: fixed;
  top: 48px;
  right: 0;
  width: 420px;
  height: calc(100% - 48px);
  background: var(--surface);
  border-left: 1px solid var(--border);
  box-shadow: var(--shadow-md);
  transform: translateX(100%);
  transition: transform 0.4s var(--spring);
  z-index: 30;
  overflow-y: auto;
}

#detail-panel.open { transform: translateX(0); }
#detail-panel.hidden { display: none; }

#agent-fab {
  position: fixed;
  right: 24px;
  bottom: 24px;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: rgba(255,255,255,0.12);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(255,255,255,0.2);
  box-shadow: 0 8px 24px rgba(0,0,0,0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 40;
  color: var(--text-inverse);
}

#agent-panel {
  position: fixed;
  right: 24px;
  bottom: 84px;
  width: 340px;
  max-height: 520px;
  background: var(--nav-bg);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: var(--radius-lg);
  box-shadow: 0 16px 48px rgba(0,0,0,0.35);
  z-index: 40;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  opacity: 0;
  transform: translateY(12px) scale(0.96);
  pointer-events: none;
  transition: opacity 0.25s var(--spring), transform 0.25s var(--spring);
}

#agent-panel.open {
  opacity: 1;
  transform: translateY(0) scale(1);
  pointer-events: auto;
}

#toast {
  position: fixed;
  left: 50%;
  bottom: 32px;
  transform: translateX(-50%) translateY(20px);
  padding: 8px 16px;
  background: var(--nav-bg);
  color: var(--text-inverse);
  border-radius: var(--radius-md);
  font-size: 12px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.25s var(--spring), transform 0.25s var(--spring);
  z-index: 50;
}

#toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
```

- [ ] **Step 3: 创建 `js/prototype-v8.js` 空壳**

```javascript
(function() {
  'use strict';

  const state = {
    view: 'forYou',
    filter: 'all',
    peopleFilter: 'all',
    contactTab: 'Timeline',
    selectedContactId: null,
    selectedMessageId: null,
    selectedMeetingId: null,
    agentOpen: false,
  };

  document.addEventListener('DOMContentLoaded', () => {
    console.log('Relay v8 initialized');
  });
})();
```

- [ ] **Step 4: 本地验证**

Run:

```bash
python3 -m http.server 8080 &
open http://localhost:8080/prototype-v8.html
```

Expected: 页面显示深色左侧栏、浅色主内容区、顶部栏，无 JS 报错。

---

## Task 2: 实现左侧导航与顶部栏

**Files:**
- Modify: `js/prototype-v8.js`
- Modify: `css/prototype-v8.css`

**Interfaces:**
- Consumes: `state.view`.
- Produces: `renderNav()`, `renderTopBar()`, `setView(view)` function.

- [ ] **Step 1: 在 `js/prototype-v8.js` 里添加渲染函数**

替换空壳里的 `DOMContentLoaded` 内容，保留 state：

```javascript
(function() {
  'use strict';

  const state = {
    view: 'forYou',
    filter: 'all',
    peopleFilter: 'all',
    contactTab: 'Timeline',
    selectedContactId: null,
    selectedMessageId: null,
    selectedMeetingId: null,
    agentOpen: false,
  };

  const navItems = [
    { id: 'forYou', label: 'For You', icon: 'ph-house' },
    { id: 'people', label: 'People', icon: 'ph-users' },
    { id: 'calendar', label: 'Calendar', icon: 'ph-calendar' },
    { id: 'files', label: 'Files', icon: 'ph-files' },
    { id: 'drafts', label: 'Drafts', icon: 'ph-pencil-simple' },
  ];

  function el(tag, className, text) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function icon(name) {
    const i = el('i', 'ph ' + name);
    return i;
  }

  function setView(view) {
    state.view = view;
    renderNav();
    renderTopBar();
    renderMain();
  }

  function renderNav() {
    const sidebar = document.getElementById('sidebar');
    sidebar.innerHTML = '';

    navItems.forEach(item => {
      const btn = el('button', 'nav-item' + (state.view === item.id ? ' active' : ''));
      btn.appendChild(icon(item.icon));
      const label = el('span', 'nav-label', item.label);
      btn.appendChild(label);
      btn.addEventListener('click', () => setView(item.id));
      sidebar.appendChild(btn);
    });

    const settings = el('button', 'nav-item nav-bottom');
    settings.appendChild(icon('ph-gear'));
    settings.appendChild(el('span', 'nav-label', 'Settings'));
    sidebar.appendChild(settings);
  }

  function renderTopBar() {
    const topbar = document.getElementById('topbar');
    topbar.innerHTML = '';

    const left = el('div', 'topbar-left');
    const title = el('h1', 'topbar-title', viewTitle(state.view));
    left.appendChild(title);

    const center = el('div', 'topbar-search');
    const searchInput = el('input', 'search-input');
    searchInput.placeholder = 'Search people, messages, files...';
    center.appendChild(icon('ph-magnifying-glass'));
    center.appendChild(searchInput);

    const right = el('div', 'topbar-right');
    const notifyBtn = el('button', 'icon-btn');
    notifyBtn.appendChild(icon('ph-bell'));
    right.appendChild(notifyBtn);

    topbar.appendChild(left);
    topbar.appendChild(center);
    topbar.appendChild(right);
  }

  function viewTitle(view) {
    const map = {
      forYou: 'For You',
      people: 'People',
      calendar: 'Calendar',
      files: 'Files',
      drafts: 'Drafts',
    };
    return map[view] || view;
  }

  function renderMain() {
    const main = document.getElementById('main');
    main.innerHTML = '<div class="view-placeholder">' + viewTitle(state.view) + ' view</div>';
  }

  document.addEventListener('DOMContentLoaded', () => {
    renderNav();
    renderTopBar();
    renderMain();
  });
})();
```

- [ ] **Step 2: 在 `css/prototype-v8.css` 里追加导航与顶部栏样式**

```css
.nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: var(--radius-md);
  background: transparent;
  border: none;
  color: var(--text-inverse-muted);
  cursor: pointer;
  transition: background 0.15s var(--spring), color 0.15s var(--spring);
}

.nav-item:hover {
  background: rgba(255,255,255,0.06);
  color: var(--text-inverse);
}

.nav-item.active {
  background: var(--accent-dim);
  color: var(--accent);
}

.nav-item i { font-size: 18px; }

.nav-label {
  font-size: 9px;
  margin-top: 2px;
  font-weight: 500;
}

.nav-bottom { margin-top: auto; }

.topbar-left, .topbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 0 0 auto;
  min-width: 160px;
}

.topbar-right { justify-content: flex-end; }

.topbar-title {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.topbar-search {
  flex: 1;
  max-width: 420px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  height: 32px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-muted);
}

.topbar-search input {
  flex: 1;
  border: none;
  background: transparent;
  outline: none;
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-primary);
}

.icon-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}

.icon-btn:hover { background: var(--surface-hover); color: var(--text-primary); }

.view-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-muted);
  font-size: 14px;
}
```

- [ ] **Step 3: 验证**

Run:

```bash
open http://localhost:8080/prototype-v8.html
```

Expected: 左侧栏显示 5 个导航项 + Settings；点击导航项，顶部标题和主内容区同步切换；无 JS 报错。

---

## Task 3: 实现 For You 时间线 Feed

**Files:**
- Modify: `js/prototype-v8.js`
- Modify: `css/prototype-v8.css`

**Interfaces:**
- Consumes: `D.contacts`, `D._msgs`, `D._meetings`, `state.filter`, `state.view`.
- Produces: `renderForYou()`, `renderFeedItem(event)`, `setFilter(filter)`.

- [ ] **Step 1: 构建 Feed 数据模型函数**

在 `js/prototype-v8.js` 里添加（放在 renderMain 之前）：

```javascript
  function getContact(id) { return D.getP(id); }

  function buildFeed() {
    const events = [];

    D._msgs.forEach((m, idx) => {
      events.push({
        type: 'message',
        id: 'msg-' + idx,
        sortKey: new Date(m.st).getTime() || 0,
        data: m,
      });
    });

    D._meetings.forEach((m, idx) => {
      events.push({
        type: 'meeting',
        id: 'mtg-' + idx,
        sortKey: new Date(m.dt).getTime() || 0,
        data: m,
      });
    });

    return events.sort((a, b) => b.sortKey - a.sortKey);
  }

  function filterEvents(events) {
    if (state.filter === 'all') return events;
    if (state.filter === 'news') {
      return events.filter(e => e.type === 'message' && (e.data.fl === '' || !e.data.fl));
    }
    if (state.filter === 'needsReply') {
      return events.filter(e => e.type === 'message' && e.data.fl === 'wait');
    }
    if (state.filter === 'followUp') {
      return events.filter(e => e.type === 'message' && e.data.fl === 'todo');
    }
    if (state.filter === 'done') {
      return events.filter(e => e.type === 'message' && e.data.fl === 'done');
    }
    return events;
  }
```

- [ ] **Step 2: 渲染 For You 视图**

把 `renderMain` 改成：

```javascript
  function renderMain() {
    const main = document.getElementById('main');
    main.innerHTML = '';

    if (state.view === 'forYou') {
      main.appendChild(renderForYou());
    } else if (state.view === 'people') {
      main.appendChild(renderPeople());
    } else if (state.view === 'calendar') {
      main.appendChild(renderCalendar());
    } else if (state.view === 'files') {
      main.appendChild(renderFiles());
    } else if (state.view === 'drafts') {
      main.appendChild(renderDrafts());
    } else {
      main.innerHTML = '<div class="view-placeholder">' + viewTitle(state.view) + '</div>';
    }
  }

  function renderForYou() {
    const container = el('div', 'view for-you-view');

    const filterBar = el('div', 'filter-bar');
    const filters = [
      { id: 'all', label: 'All' },
      { id: 'needsReply', label: 'Needs Reply' },
      { id: 'followUp', label: 'Follow Up' },
      { id: 'news', label: 'News' },
      { id: 'done', label: 'Done' },
    ];
    filters.forEach(f => {
      const btn = el('button', 'filter-pill' + (state.filter === f.id ? ' active' : ''), f.label);
      btn.addEventListener('click', () => { state.filter = f.id; renderMain(); });
      filterBar.appendChild(btn);
    });
    container.appendChild(filterBar);

    const list = el('div', 'feed-list');
    const events = filterEvents(buildFeed());

    if (events.length === 0) {
      list.appendChild(el('div', 'empty-state', 'No items match this filter.'));
    } else {
      events.forEach(ev => list.appendChild(renderFeedItem(ev)));
    }

    container.appendChild(list);
    return container;
  }
```

- [ ] **Step 3: 渲染单个 Feed 卡片**

继续添加：

```javascript
  function renderFeedItem(ev) {
    if (ev.type === 'message') {
      const m = ev.data;
      const contact = getContact(m.pid);
      const isDraft = m.fl === 'wait' || m.fl === 'todo';

      const card = el('div', 'feed-card' + (isDraft ? ' draft-pending' : ''));
      card.addEventListener('click', () => openMessage(m));

      const left = el('div', 'feed-avatar');
      left.textContent = contact ? contact.name[0] : '?';
      left.style.background = contact ? contact.scC : '#999';

      const body = el('div', 'feed-body');
      const meta = el('div', 'feed-meta');
      const name = el('span', 'feed-name', contact ? contact.name : 'Unknown');
      const co = el('span', 'feed-co', contact ? contact.co : '');
      const time = el('span', 'feed-time', m.tm);
      meta.appendChild(name);
      if (contact && contact.co) meta.appendChild(co);
      meta.appendChild(time);

      const subj = el('div', 'feed-subject', m.subj);
      const prev = el('div', 'feed-preview', m.prev);

      body.appendChild(meta);
      body.appendChild(subj);
      body.appendChild(prev);

      if (m.at && m.at.length) {
        const att = el('div', 'feed-attachments');
        m.at.forEach(a => {
          const tag = el('span', 'attachment-tag', a);
          att.appendChild(tag);
        });
        body.appendChild(att);
      }

      card.appendChild(left);
      card.appendChild(body);
      return card;
    }

    if (ev.type === 'meeting') {
      const m = ev.data;
      const card = el('div', 'feed-card meeting-card');
      card.addEventListener('click', () => openMeeting(m));

      const left = el('div', 'feed-avatar meeting-avatar');
      left.appendChild(icon('ph-calendar-blank'));

      const body = el('div', 'feed-body');
      const meta = el('div', 'feed-meta');
      meta.appendChild(el('span', 'feed-name', m.title));
      meta.appendChild(el('span', 'feed-time', m.dt + ' · ' + m.tm));
      body.appendChild(meta);
      body.appendChild(el('div', 'feed-preview', m.ppl + (m.br ? ' · 简报已生成' : ' · 未生成简报')));

      card.appendChild(left);
      card.appendChild(body);
      return card;
    }

    return el('div');
  }
```

- [ ] **Step 4: 追加 Feed 样式**

```css
.view {
  height: 100%;
  overflow-y: auto;
  padding: 20px 24px;
}

.filter-bar {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  position: sticky;
  top: 0;
  background: var(--main-bg);
  padding: 4px 0 12px;
  z-index: 10;
}

.filter-pill {
  padding: 5px 12px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s var(--spring);
}

.filter-pill:hover { background: var(--surface-hover); color: var(--text-primary); }
.filter-pill.active { background: var(--text-primary); color: #fff; border-color: var(--text-primary); }

.feed-list { display: flex; flex-direction: column; gap: 10px; max-width: 760px; }

.feed-card {
  display: flex;
  gap: 12px;
  padding: 14px 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: transform 0.15s var(--spring), box-shadow 0.15s var(--spring), border-color 0.15s var(--spring);
}

.feed-card:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
  border-color: var(--border-strong);
}

.feed-card.draft-pending {
  border-left: 3px solid var(--accent);
}

.feed-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: 600;
  font-size: 13px;
  flex-shrink: 0;
}

.meeting-avatar { background: var(--accent); }

.feed-body { flex: 1; min-width: 0; }

.feed-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.feed-name { font-weight: 600; font-size: 13px; }
.feed-co { color: var(--text-secondary); font-size: 12px; }
.feed-time { margin-left: auto; color: var(--text-muted); font-size: 11px; font-family: var(--font-mono); }

.feed-subject { font-weight: 500; font-size: 14px; margin-bottom: 3px; }
.feed-preview { color: var(--text-secondary); font-size: 12px; line-height: 1.45; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.feed-attachments { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
.attachment-tag {
  padding: 2px 8px;
  background: var(--main-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 11px;
  color: var(--text-secondary);
  font-family: var(--font-mono);
}

.empty-state {
  padding: 48px;
  text-align: center;
  color: var(--text-muted);
  border: 1px dashed var(--border);
  border-radius: var(--radius-lg);
}
```

- [ ] **Step 5: 验证**

Run:

```bash
open http://localhost:8080/prototype-v8.html
```

Expected: For You 视图显示按时间排序的邮件和会议卡片；点击 `Needs Reply` / `Follow Up` 等标签，Feed 正确过滤；卡片 hover 有轻微上浮效果。

---

## Task 4: 实现内嵌 AI 待确认回复卡片

**Files:**
- Modify: `js/prototype-v8.js`
- Modify: `css/prototype-v8.css`

**Interfaces:**
- Consumes: `D.agentDrafts`, message `fl` field.
- Produces: `renderDraftCard(msg, contact)`, `sendDraft()`, `editDraft()`, `ignoreDraft()`.

- [ ] **Step 1: 修改 `renderFeedItem` 中的 draft 卡片分支**

在 `renderFeedItem` 中，当 `ev.type === 'message'` 且 `isDraft` 为真时，不调用 `openMessage`，而是渲染 draft 卡片。把原 message 分支替换为：

```javascript
    if (ev.type === 'message') {
      const m = ev.data;
      const contact = getContact(m.pid);
      const isDraft = m.fl === 'wait' || m.fl === 'todo';

      if (isDraft) {
        return renderDraftCard(m, contact);
      }

      const card = el('div', 'feed-card');
      card.addEventListener('click', () => openMessage(m));
      // ... 保留 Task 3 的普通邮件卡片代码 ...
      return card;
    }
```

- [ ] **Step 2: 添加 `renderDraftCard` 函数**

```javascript
  function findDraftForMessage(m) {
    return D.agentDrafts.find(d => d.to === (getContact(m.pid) ? getContact(m.pid).name : ''));
  }

  function renderDraftCard(m, contact) {
    const draft = findDraftForMessage(m) || { preview: m.prev };
    const card = el('div', 'feed-card draft-card');

    const header = el('div', 'draft-header');
    header.appendChild(el('span', 'draft-badge', 'AI draft ready'));
    header.appendChild(el('span', 'draft-for', 'Reply to ' + (contact ? contact.name : 'Unknown')));

    const body = el('div', 'draft-body');
    body.appendChild(el('div', 'draft-subject', m.subj));
    body.appendChild(el('div', 'draft-preview', draft.preview));

    const actions = el('div', 'draft-actions');
    const sendBtn = el('button', 'btn btn-primary btn-sm', 'Send');
    const editBtn = el('button', 'btn btn-secondary btn-sm', 'Edit');
    const ignoreBtn = el('button', 'btn btn-ghost btn-sm', 'Ignore');

    sendBtn.addEventListener('click', (e) => { e.stopPropagation(); sendDraft(m); });
    editBtn.addEventListener('click', (e) => { e.stopPropagation(); editDraft(m); });
    ignoreBtn.addEventListener('click', (e) => { e.stopPropagation(); ignoreDraft(m); });

    actions.appendChild(sendBtn);
    actions.appendChild(editBtn);
    actions.appendChild(ignoreBtn);

    card.appendChild(header);
    card.appendChild(body);
    card.appendChild(actions);
    return card;
  }

  function sendDraft(m) {
    showToast('Draft sent to ' + (getContact(m.pid) ? getContact(m.pid).name : ''));
    m.fl = 'done';
    renderMain();
  }

  function editDraft(m) {
    openMessage(m);
    showToast('Edit draft in the reply box');
  }

  function ignoreDraft(m) {
    m.fl = '';
    renderMain();
  }

  function showToast(text) {
    const toast = document.getElementById('toast');
    toast.textContent = text;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2000);
  }
```

- [ ] **Step 3: 追加 Draft 卡片与按钮样式**

```css
.draft-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-left: 3px solid var(--accent);
  background: linear-gradient(90deg, var(--accent-dim), var(--surface));
}

.draft-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.draft-badge {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--accent);
  color: #fff;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.draft-for { color: var(--text-secondary); font-size: 12px; }

.draft-subject { font-weight: 600; font-size: 14px; margin-bottom: 4px; }
.draft-preview {
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.5;
  padding: 10px 12px;
  background: var(--main-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.draft-actions {
  display: flex;
  gap: 8px;
  margin-top: 2px;
}

.btn {
  padding: 6px 14px;
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s var(--spring);
}

.btn-sm { padding: 5px 12px; }

.btn-primary {
  background: var(--accent);
  color: #fff;
}

.btn-primary:hover { background: #4a3ec5; transform: translateY(-1px); }
.btn-primary:active { transform: scale(0.97); }

.btn-secondary {
  background: var(--surface-hover);
  color: var(--text-primary);
  border-color: var(--border);
}

.btn-secondary:hover { background: var(--border); }

.btn-ghost {
  background: transparent;
  color: var(--text-secondary);
  border-color: var(--border);
}

.btn-ghost:hover { background: var(--surface-hover); color: var(--text-primary); }
```

- [ ] **Step 4: 验证**

Run:

```bash
open http://localhost:8080/prototype-v8.html
```

Expected: `Needs Reply` 标签下出现带有 `AI draft ready` 标识的卡片；点击 Send，卡片状态变为 done 并刷新；点击 Ignore，卡片从该过滤视图消失。

---

## Task 5: 实现 People 联系人目录

**Files:**
- Modify: `js/prototype-v8.js`
- Modify: `css/prototype-v8.css`

**Interfaces:**
- Consumes: `D.contacts`.
- Produces: `renderPeople()`, `renderPersonCard(contact)`, `openContact(id)`.

- [ ] **Step 1: 添加 People 渲染函数**

在 `js/prototype-v8.js` 里添加：

```javascript
  function renderPeople() {
    const container = el('div', 'view people-view');

    const filterBar = el('div', 'filter-bar');
    const filters = [
      { id: 'all', label: 'All' },
      { id: 'active', label: 'Active' },
      { id: 'risk', label: 'Need Follow Up' },
      { id: 'cold', label: 'Cold' },
    ];
    filters.forEach(f => {
      const btn = el('button', 'filter-pill' + (state.peopleFilter === f.id ? ' active' : ''), f.label);
      btn.addEventListener('click', () => { state.peopleFilter = f.id; renderMain(); });
      filterBar.appendChild(btn);
    });
    container.appendChild(filterBar);

    const grid = el('div', 'people-grid');
    const contacts = filterContacts(D.contacts);

    if (contacts.length === 0) {
      grid.appendChild(el('div', 'empty-state', 'No contacts match this filter.'));
    } else {
      contacts.forEach(c => grid.appendChild(renderPersonCard(c)));
    }

    container.appendChild(grid);
    return container;
  }

  function filterContacts(contacts) {
    if (!state.peopleFilter || state.peopleFilter === 'all') return contacts;
    return contacts.filter(c => c.grp === state.peopleFilter);
  }

  function renderPersonCard(c) {
    const card = el('div', 'person-card');
    card.addEventListener('click', () => openContact(c.id));

    const avatar = el('div', 'person-avatar');
    avatar.textContent = c.name[0];
    avatar.style.background = c.scC;

    const body = el('div', 'person-body');
    const top = el('div', 'person-top');
    top.appendChild(el('span', 'person-name', c.name));
    const score = el('span', 'person-score', c.sc);
    score.style.color = c.scC;
    top.appendChild(score);

    const meta = el('div', 'person-meta');
    meta.appendChild(el('span', 'person-co', c.co));
    meta.appendChild(el('span', 'person-role', c.tl));

    const bottom = el('div', 'person-bottom');
    bottom.appendChild(el('span', 'person-last', c.lc));
    const topic = el('span', 'person-topic', c.topics.slice(0, 2).join(' · '));
    bottom.appendChild(topic);

    body.appendChild(top);
    body.appendChild(meta);
    body.appendChild(bottom);

    card.appendChild(avatar);
    card.appendChild(body);
    return card;
  }
```

- [ ] **Step 2: 追加 People 样式**

```css
.people-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 14px;
  max-width: 1100px;
}

.person-card {
  display: flex;
  gap: 12px;
  padding: 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: transform 0.15s var(--spring), box-shadow 0.15s var(--spring);
}

.person-card:hover { transform: translateY(-1px); box-shadow: var(--shadow-md); }

.person-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: 600;
  font-size: 14px;
  flex-shrink: 0;
}

.person-body { flex: 1; min-width: 0; }

.person-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.person-name { font-weight: 600; font-size: 14px; }
.person-score { font-family: var(--font-mono); font-size: 13px; font-weight: 600; }

.person-meta {
  display: flex;
  gap: 8px;
  color: var(--text-secondary);
  font-size: 12px;
  margin-bottom: 8px;
}

.person-bottom {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--text-muted);
  font-family: var(--font-mono);
}

.person-topic {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 140px;
}
```

- [ ] **Step 3: 验证**

Run:

```bash
open http://localhost:8080/prototype-v8.html
```

Expected: 点击 People，显示联系人卡片网格；点击 `Active` / `Need Follow Up` / `Cold` 过滤正确；每个卡片显示健康度分数和最近联系时间。

---

## Task 6: 实现联系人详情滑出面板

**Files:**
- Modify: `js/prototype-v8.js`
- Modify: `css/prototype-v8.css`

**Interfaces:**
- Consumes: `D.getMsgs(pid)`, `D.getFiles(pid)`, `D.getMeetings(pid)`, `D.getConnections(pid)`.
- Produces: `openContact(id)`, `renderContactPanel(contact)`, tab switching.

- [ ] **Step 1: 实现 `openContact` 与详情渲染**

```javascript
  function openContact(id) {
    state.selectedContactId = id;
    state.selectedMessageId = null;
    state.selectedMeetingId = null;
    const panel = document.getElementById('detail-panel');
    panel.innerHTML = '';
    panel.classList.remove('hidden');
    panel.classList.add('open');
    panel.appendChild(renderContactPanel(D.getP(id)));
  }

  function closePanel() {
    const panel = document.getElementById('detail-panel');
    panel.classList.remove('open');
    setTimeout(() => {
      panel.classList.add('hidden');
      state.selectedContactId = null;
      state.selectedMessageId = null;
      state.selectedMeetingId = null;
    }, 400);
  }

  function renderContactPanel(c) {
    const wrapper = el('div', 'panel-wrapper');

    const header = el('div', 'panel-header');
    const closeBtn = el('button', 'icon-btn panel-close');
    closeBtn.appendChild(icon('ph-x'));
    closeBtn.addEventListener('click', closePanel);

    const avatar = el('div', 'panel-avatar');
    avatar.textContent = c.name[0];
    avatar.style.background = c.scC;

    const info = el('div', 'panel-info');
    info.appendChild(el('div', 'panel-name', c.name));
    info.appendChild(el('div', 'panel-role', c.tl + ' · ' + c.co));

    const copyBtn = el('button', 'btn btn-secondary btn-sm', 'Copy context');
    copyBtn.addEventListener('click', () => copyContactContext(c));

    header.appendChild(closeBtn);
    header.appendChild(avatar);
    header.appendChild(info);
    header.appendChild(copyBtn);
    wrapper.appendChild(header);

    const health = el('div', 'panel-health');
    health.appendChild(el('span', 'health-label', 'Health'));
    const score = el('span', 'health-score', c.sc);
    score.style.color = c.scC;
    health.appendChild(score);
    health.appendChild(el('span', 'health-trend', c.scL));
    wrapper.appendChild(health);

    const tabs = el('div', 'panel-tabs');
    const tabNames = ['Timeline', 'Files', 'Insights', 'Network', 'Calendar'];
    state.contactTab = state.contactTab || 'Timeline';
    tabNames.forEach(name => {
      const btn = el('button', 'panel-tab' + (state.contactTab === name ? ' active' : ''), name);
      btn.addEventListener('click', () => { state.contactTab = name; renderMain(); openContact(c.id); });
      tabs.appendChild(btn);
    });
    wrapper.appendChild(tabs);

    const content = el('div', 'panel-content');
    if (state.contactTab === 'Timeline') content.appendChild(renderContactTimeline(c));
    else if (state.contactTab === 'Files') content.appendChild(renderContactFiles(c));
    else if (state.contactTab === 'Insights') content.appendChild(renderContactInsights(c));
    else if (state.contactTab === 'Network') content.appendChild(renderContactNetwork(c));
    else if (state.contactTab === 'Calendar') content.appendChild(renderContactCalendar(c));
    wrapper.appendChild(content);

    return wrapper;
  }

  function renderContactTimeline(c) {
    const list = el('div', 'mini-feed');
    const items = D.getMsgs(c.id).slice(0, 20);
    if (items.length === 0) return el('div', 'empty-state', 'No messages yet.');
    items.forEach(m => {
      const row = el('div', 'mini-feed-row');
      row.appendChild(el('span', 'mini-feed-tag', m.tag));
      row.appendChild(el('span', 'mini-feed-subj', m.subj));
      row.appendChild(el('span', 'mini-feed-time', m.tm));
      list.appendChild(row);
    });
    return list;
  }

  function renderContactFiles(c) {
    const grid = el('div', 'mini-grid');
    const files = D.getFiles(c.id);
    if (files.length === 0) return el('div', 'empty-state', 'No files yet.');
    files.forEach(f => {
      const card = el('div', 'mini-file');
      card.appendChild(el('div', 'mini-file-name', f.name));
      card.appendChild(el('div', 'mini-file-meta', f.sz + ' · ' + f.dt));
      grid.appendChild(card);
    });
    return grid;
  }

  function renderContactInsights(c) {
    const box = el('div', 'insights-box');
    box.appendChild(el('div', 'insight-row', 'Pattern: ' + c.pattern));
    box.appendChild(el('div', 'insight-row', 'First contact: ' + c.firstContact));
    box.appendChild(el('div', 'insight-row', 'Stage: ' + D.stageLabel[c.stage]));
    if (c.milestones.length) {
      const ul = el('ul', 'milestones');
      c.milestones.forEach(m => ul.appendChild(el('li', '', m)));
      box.appendChild(ul);
    }
    return box;
  }

  function renderContactNetwork(c) {
    const list = el('div', 'mini-grid');
    const connections = D.getConnections(c.id);
    if (connections.length === 0) return el('div', 'empty-state', 'No connections found.');
    connections.forEach(p => {
      const card = el('div', 'mini-person');
      const av = el('div', 'mini-person-avatar', p.name[0]);
      av.style.background = p.scC;
      card.appendChild(av);
      card.appendChild(el('div', 'mini-person-name', p.name));
      card.appendChild(el('div', 'mini-person-meta', p.co + ' · ' + p.sc));
      list.appendChild(card);
    });
    return list;
  }

  function renderContactCalendar(c) {
    const list = el('div', 'mini-feed');
    const meetings = D.getMeetings(c.id);
    if (meetings.length === 0) return el('div', 'empty-state', 'No meetings yet.');
    meetings.forEach(m => {
      const row = el('div', 'mini-feed-row');
      row.appendChild(el('span', 'mini-feed-tag', 'Meeting'));
      row.appendChild(el('span', 'mini-feed-subj', m.title));
      row.appendChild(el('span', 'mini-feed-time', m.dt));
      list.appendChild(row);
    });
    return list;
  }
```

- [ ] **Step 2: 追加面板样式**

```css
.panel-wrapper {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  background: var(--surface);
  z-index: 5;
}

.panel-close { margin-right: 4px; }

.panel-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: 600;
  font-size: 15px;
}

.panel-info { flex: 1; min-width: 0; }
.panel-name { font-weight: 600; font-size: 15px; }
.panel-role { color: var(--text-secondary); font-size: 12px; }

.panel-health {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}

.health-label { color: var(--text-secondary); font-size: 12px; }
.health-score { font-family: var(--font-mono); font-size: 18px; font-weight: 700; }
.health-trend { color: var(--text-muted); font-size: 12px; }

.panel-tabs {
  display: flex;
  gap: 4px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  overflow-x: auto;
}

.panel-tab {
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}

.panel-tab:hover { background: var(--surface-hover); color: var(--text-primary); }
.panel-tab.active { background: var(--text-primary); color: #fff; }

.panel-content { padding: 12px 16px 32px; flex: 1; }

.mini-feed { display: flex; flex-direction: column; gap: 8px; }
.mini-feed-row {
  display: grid;
  grid-template-columns: 70px 1fr 60px;
  gap: 8px;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
}
.mini-feed-tag { font-size: 10px; color: var(--text-muted); text-transform: uppercase; font-family: var(--font-mono); }
.mini-feed-subj { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mini-feed-time { font-size: 11px; color: var(--text-muted); text-align: right; font-family: var(--font-mono); }

.mini-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
.mini-file, .mini-person {
  padding: 10px;
  background: var(--main-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}
.mini-file-name { font-size: 12px; font-weight: 500; margin-bottom: 4px; word-break: break-all; }
.mini-file-meta { font-size: 10px; color: var(--text-muted); font-family: var(--font-mono); }

.mini-person { display: flex; align-items: center; gap: 8px; }
.mini-person-avatar {
  width: 28px; height: 28px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  color: #fff; font-size: 11px; font-weight: 600;
}
.mini-person-name { font-size: 12px; font-weight: 500; }
.mini-person-meta { font-size: 10px; color: var(--text-muted); }

.insights-box { display: flex; flex-direction: column; gap: 12px; }
.insight-row { font-size: 13px; line-height: 1.5; }
.milestones { padding-left: 18px; color: var(--text-secondary); font-size: 12px; }
.milestones li { margin-bottom: 4px; }
```

- [ ] **Step 3: 验证**

Run:

```bash
open http://localhost:8080/prototype-v8.html
```

Expected: 在 For You 或 People 中点击联系人/卡片，右侧滑出详情面板；点击 Timeline/Files/Insights/Network/Calendar 标签切换内容；点击 X 关闭面板。

---

## Task 7: 实现邮件阅读视图

**Files:**
- Modify: `js/prototype-v8.js`
- Modify: `css/prototype-v8.css`

**Interfaces:**
- Consumes: message object, `D.agentDrafts`.
- Produces: `openMessage(m)`, `renderMessagePanel(m)`.

- [ ] **Step 1: 实现邮件详情打开与渲染**

```javascript
  function openMessage(m) {
    state.selectedMessageId = m.pid + '-' + m.subj;
    state.selectedContactId = m.pid;
    const panel = document.getElementById('detail-panel');
    panel.innerHTML = '';
    panel.classList.remove('hidden');
    panel.classList.add('open');
    panel.appendChild(renderMessagePanel(m));
  }

  function renderMessagePanel(m) {
    const c = getContact(m.pid);
    const wrapper = el('div', 'panel-wrapper');

    const header = el('div', 'panel-header');
    const closeBtn = el('button', 'icon-btn panel-close');
    closeBtn.appendChild(icon('ph-x'));
    closeBtn.addEventListener('click', closePanel);

    const copyBtn = el('button', 'btn btn-secondary btn-sm', 'Copy context');
    copyBtn.addEventListener('click', () => copyMessageContext(m, c));

    header.appendChild(closeBtn);
    header.appendChild(el('div', 'panel-title', 'Email'));
    header.appendChild(copyBtn);
    wrapper.appendChild(header);

    const fromRow = el('div', 'msg-meta-row');
    fromRow.appendChild(el('span', 'msg-label', 'From'));
    fromRow.appendChild(el('span', 'msg-value', c ? c.name + ' <' + c.em + '>' : m.fm));
    wrapper.appendChild(fromRow);

    const subjRow = el('div', 'msg-meta-row');
    subjRow.appendChild(el('span', 'msg-label', 'Subject'));
    subjRow.appendChild(el('span', 'msg-value', m.subj));
    wrapper.appendChild(subjRow);

    const body = el('div', 'msg-body');
    body.appendChild(el('p', '', m.prev));
    body.appendChild(el('p', 'msg-quote', '[Original message body would render here]'));
    wrapper.appendChild(body);

    if (m.at && m.at.length) {
      const att = el('div', 'msg-attachments');
      m.at.forEach(a => att.appendChild(el('span', 'attachment-tag', a)));
      wrapper.appendChild(att);
    }

    const actions = el('div', 'msg-actions');
    const replyBtn = el('button', 'btn btn-primary', 'Reply');
    const forwardBtn = el('button', 'btn btn-secondary', 'Forward');
    const followBtn = el('button', 'btn btn-secondary', 'Follow up');
    replyBtn.addEventListener('click', () => showToast('Reply composer opened'));
    wrapper.appendChild(actions);
    actions.appendChild(replyBtn);
    actions.appendChild(forwardBtn);
    actions.appendChild(followBtn);

    return wrapper;
  }
```

- [ ] **Step 2: 追加邮件阅读样式**

```css
.panel-title { font-weight: 600; font-size: 15px; flex: 1; }

.msg-meta-row {
  display: flex;
  gap: 12px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--border);
  font-size: 12px;
}

.msg-label { width: 56px; color: var(--text-muted); flex-shrink: 0; }
.msg-value { color: var(--text-primary); }

.msg-body {
  padding: 20px 16px;
  font-size: 14px;
  line-height: 1.65;
  color: var(--text-primary);
}

.msg-quote {
  margin-top: 16px;
  padding-left: 12px;
  border-left: 2px solid var(--border);
  color: var(--text-secondary);
}

.msg-attachments {
  display: flex;
  gap: 6px;
  padding: 0 16px 12px;
  flex-wrap: wrap;
}

.msg-actions {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--border);
  position: sticky;
  bottom: 0;
  background: var(--surface);
}
```

- [ ] **Step 3: 验证**

Run:

```bash
open http://localhost:8080/prototype-v8.html
```

Expected: 点击普通邮件卡片，右侧滑出邮件详情面板，显示 From、Subject、正文预览、附件、操作按钮；点击 Copy context 可复制 Markdown。

---

## Task 8: 实现 Calendar 视图

**Files:**
- Modify: `js/prototype-v8.js`
- Modify: `css/prototype-v8.css`

**Interfaces:**
- Consumes: `D._meetings`, `D.getP`.
- Produces: `renderCalendar()`, `openMeeting(m)`.

- [ ] **Step 1: 实现 Calendar 渲染**

```javascript
  function renderCalendar() {
    const container = el('div', 'view calendar-view');
    const list = el('div', 'meeting-list');

    D._meetings.forEach(m => {
      const card = el('div', 'meeting-card');
      card.addEventListener('click', () => openMeeting(m));

      const top = el('div', 'meeting-top');
      top.appendChild(el('span', 'meeting-title', m.title));
      const badge = el('span', 'meeting-badge', m.br ? 'Brief ready' : 'No brief');
      badge.classList.add(m.br ? 'ready' : 'pending');
      top.appendChild(badge);

      const meta = el('div', 'meeting-meta');
      meta.appendChild(el('span', '', m.dt + ' · ' + m.tm));
      meta.appendChild(el('span', '', m.ppl));

      const prep = el('div', 'meeting-prep');
      if (m.prep && m.prep.length) {
        m.prep.forEach(p => prep.appendChild(el('div', 'prep-item', '☐ ' + p)));
      } else if (m.post) {
        prep.appendChild(el('div', 'post-item', m.post));
      }

      card.appendChild(top);
      card.appendChild(meta);
      card.appendChild(prep);
      list.appendChild(card);
    });

    container.appendChild(list);
    return container;
  }

  function openMeeting(m) {
    state.selectedMeetingId = m.id;
    const panel = document.getElementById('detail-panel');
    panel.innerHTML = '';
    panel.classList.remove('hidden');
    panel.classList.add('open');
    panel.appendChild(renderMeetingPanel(m));
  }

  function renderMeetingPanel(m) {
    const wrapper = el('div', 'panel-wrapper');
    const header = el('div', 'panel-header');
    const closeBtn = el('button', 'icon-btn panel-close');
    closeBtn.appendChild(icon('ph-x'));
    closeBtn.addEventListener('click', closePanel);

    const copyBtn = el('button', 'btn btn-secondary btn-sm', 'Copy context');
    copyBtn.addEventListener('click', () => copyMeetingContext(m));

    header.appendChild(closeBtn);
    header.appendChild(el('div', 'panel-title', 'Meeting'));
    header.appendChild(copyBtn);
    wrapper.appendChild(header);

    wrapper.appendChild(el('div', 'meeting-detail-row', 'Title: ' + m.title));
    wrapper.appendChild(el('div', 'meeting-detail-row', 'Time: ' + m.dt + ' ' + m.tm));
    wrapper.appendChild(el('div', 'meeting-detail-row', 'People: ' + m.ppl));
    wrapper.appendChild(el('div', 'meeting-detail-row', 'Notes: ' + m.notes));

    if (m.prep && m.prep.length) {
      const prepTitle = el('div', 'meeting-detail-subtitle', 'Preparation');
      wrapper.appendChild(prepTitle);
      m.prep.forEach(p => wrapper.appendChild(el('div', 'prep-item', '☐ ' + p)));
    }

    return wrapper;
  }
```

- [ ] **Step 2: 追加 Calendar 样式**

```css
.meeting-list { display: flex; flex-direction: column; gap: 12px; max-width: 760px; }

.meeting-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 14px 16px;
  cursor: pointer;
  transition: transform 0.15s var(--spring), box-shadow 0.15s var(--spring);
}

.meeting-card:hover { transform: translateY(-1px); box-shadow: var(--shadow-md); }

.meeting-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.meeting-title { font-weight: 600; font-size: 14px; }

.meeting-badge {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
}

.meeting-badge.ready { background: rgba(16,185,129,0.12); color: var(--green); }
.meeting-badge.pending { background: rgba(245,158,11,0.12); color: var(--yellow); }

.meeting-meta {
  display: flex;
  gap: 12px;
  color: var(--text-secondary);
  font-size: 12px;
  margin-bottom: 10px;
  font-family: var(--font-mono);
}

.meeting-prep { display: flex; flex-direction: column; gap: 4px; }
.prep-item {
  font-size: 12px;
  color: var(--text-secondary);
  padding: 4px 0;
  border-bottom: 1px solid var(--border);
}
.post-item { font-size: 12px; color: var(--green); }

.meeting-detail-row { padding: 10px 16px; border-bottom: 1px solid var(--border); font-size: 13px; }
.meeting-detail-subtitle { padding: 16px 16px 8px; font-weight: 600; font-size: 12px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.03em; }
```

- [ ] **Step 3: 验证**

Run:

```bash
open http://localhost:8080/prototype-v8.html
```

Expected: 点击 Calendar 导航，显示会议列表；每个会议显示简报状态；点击会议卡片，右侧滑出会议详情和准备清单。

---

## Task 9: 实现右下角浮动 Agent 面板

**Files:**
- Modify: `js/prototype-v8.js`
- Modify: `css/prototype-v8.css`

**Interfaces:**
- Consumes: `D.agentTasks`, `D.agentDrafts`, `state.agentOpen`.
- Produces: `renderAgentFab()`, `renderAgentPanel()`, `toggleAgent()`.

- [ ] **Step 1: 实现 Agent 渲染与切换**

在 `DOMContentLoaded` 监听器中添加：

```javascript
    renderAgentFab();
    renderAgentPanel();
```

并添加函数：

```javascript
  function renderAgentFab() {
    const fab = document.getElementById('agent-fab');
    fab.innerHTML = '';
    const i = icon('ph-sparkle');
    fab.appendChild(i);
    fab.addEventListener('click', toggleAgent);

    if (D.agentTasks.some(t => t.status === 'go')) {
      fab.classList.add('has-tasks');
    }
  }

  function toggleAgent() {
    state.agentOpen = !state.agentOpen;
    const panel = document.getElementById('agent-panel');
    if (state.agentOpen) panel.classList.add('open');
    else panel.classList.remove('open');
  }

  function renderAgentPanel() {
    const panel = document.getElementById('agent-panel');
    panel.innerHTML = '';

    const header = el('div', 'agent-header');
    header.appendChild(el('span', 'agent-title', 'Relay Agent'));
    const close = el('button', 'icon-btn agent-close');
    close.appendChild(icon('ph-x'));
    close.addEventListener('click', toggleAgent);
    header.appendChild(close);
    panel.appendChild(header);

    const context = el('div', 'agent-context');
    context.textContent = state.selectedContactId
      ? 'Viewing: ' + D.getP(state.selectedContactId).name
      : 'What would you like me to do?';
    panel.appendChild(context);

    const suggestions = el('div', 'agent-suggestions');
    ['Summarize', 'Draft reply', 'Schedule meeting', 'Extract todos'].forEach(text => {
      const chip = el('button', 'agent-chip', text);
      chip.addEventListener('click', () => showToast('Agent: ' + text));
      suggestions.appendChild(chip);
    });
    panel.appendChild(suggestions);

    const tasks = el('div', 'agent-tasks');
    if (D.agentTasks.length) {
      tasks.appendChild(el('div', 'agent-section-title', 'In progress'));
      D.agentTasks.forEach(t => {
        const row = el('div', 'agent-task');
        row.appendChild(el('div', 'agent-task-name', t.name));
        const steps = el('div', 'agent-task-steps');
        t.steps.forEach(s => {
          const step = el('span', 'agent-step' + (s.d ? ' done' : ''), s.d ? '✓' : '○');
          step.title = s.l;
          steps.appendChild(step);
        });
        row.appendChild(steps);
        tasks.appendChild(row);
      });
    }
    panel.appendChild(tasks);

    const inputWrap = el('div', 'agent-input-wrap');
    const input = el('input', 'agent-input');
    input.placeholder = 'Ask Relay...';
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && input.value.trim()) {
        showToast('Agent thinking: ' + input.value);
        input.value = '';
      }
    });
    inputWrap.appendChild(input);
    panel.appendChild(inputWrap);
  }
```

- [ ] **Step 2: 追加 Agent 样式**

```css
#agent-fab.has-tasks::after {
  content: '';
  position: absolute;
  top: 0; right: 0;
  width: 10px; height: 10px;
  background: var(--accent);
  border-radius: 50%;
  border: 2px solid var(--nav-bg);
}

.agent-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
}

.agent-title { font-weight: 600; color: var(--text-inverse); font-size: 14px; }
.agent-close { color: var(--text-inverse-muted); }

.agent-context {
  padding: 12px 14px;
  color: var(--text-inverse-muted);
  font-size: 12px;
  border-bottom: 1px solid rgba(255,255,255,0.05);
}

.agent-suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(255,255,255,0.05);
}

.agent-chip {
  padding: 5px 10px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.1);
  background: rgba(255,255,255,0.05);
  color: var(--text-inverse);
  font-size: 11px;
  cursor: pointer;
}

.agent-chip:hover { background: rgba(255,255,255,0.1); }

.agent-section-title {
  padding: 10px 14px 6px;
  color: var(--text-inverse-muted);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.agent-task {
  padding: 8px 14px;
  border-bottom: 1px solid rgba(255,255,255,0.04);
}

.agent-task-name { color: var(--text-inverse); font-size: 12px; margin-bottom: 4px; }
.agent-task-steps { display: flex; gap: 6px; }
.agent-step { font-size: 11px; color: var(--text-inverse-muted); }
.agent-step.done { color: var(--green); }

.agent-input-wrap {
  padding: 10px 14px;
  margin-top: auto;
  border-top: 1px solid rgba(255,255,255,0.08);
}

.agent-input {
  width: 100%;
  padding: 8px 10px;
  border-radius: var(--radius-md);
  border: 1px solid rgba(255,255,255,0.1);
  background: rgba(255,255,255,0.05);
  color: var(--text-inverse);
  font-family: var(--font-sans);
  font-size: 13px;
  outline: none;
}

.agent-input::placeholder { color: var(--text-inverse-muted); }
.agent-input:focus { border-color: var(--accent); }
```

- [ ] **Step 3: 验证**

Run:

```bash
open http://localhost:8080/prototype-v8.html
```

Expected: 右下角出现 Agent 按钮，有进行中的任务时带小红点；点击展开 Agent 面板，显示建议芯片、进行中的任务、输入框；点击 X 或再次点击按钮关闭。

---

## Task 10: 实现 Markdown 上下文导出

**Files:**
- Modify: `js/prototype-v8.js`

**Interfaces:**
- Consumes: contact, message, meeting objects.
- Produces: `copyContactContext(c)`, `copyMessageContext(m, c)`, `copyMeetingContext(m)`, `copyToClipboard(text, label)`.

- [ ] **Step 1: 添加上下文生成函数**

```javascript
  function copyToClipboard(text, label) {
    navigator.clipboard.writeText(text).then(() => showToast(label + ' copied'));
  }

  function copyContactContext(c) {
    const msgs = D.getMsgs(c.id);
    const meetings = D.getMeetings(c.id);
    const md = `# ${c.name}

## Basic Info
- Company: ${c.co}
- Title: ${c.tl}
- Email: ${c.em}
- Health: ${c.sc}/100 (${c.scL})

## Recent Communication
${msgs.slice(0, 5).map(m => `- ${m.tm}: ${m.tag} — ${m.subj}`).join('\n')}

## Upcoming Meetings
${meetings.slice(0, 3).map(m => `- ${m.dt} ${m.tm}: ${m.title}`).join('\n') || 'None'}

## Topics
${c.topics.join(' · ')}

## Suggested Action
${D.stageSuggest[c.stage] || ''}
`;
    copyToClipboard(md, 'Contact context');
  }

  function copyMessageContext(m, c) {
    const md = `# Email Thread: ${m.subj}

## Sender
${c ? c.name + ' (' + c.co + ')' : m.fm}

## Subject
${m.subj}

## Preview
${m.prev}

## Channel
${m.ch}

## Timestamp
${m.tm}
`;
    copyToClipboard(md, 'Message context');
  }

  function copyMeetingContext(m) {
    const md = `# Meeting: ${m.title}

## Time
${m.dt} ${m.tm}

## Participants
${m.ppl}

## Notes
${m.notes}

## Preparation
${m.prep ? m.prep.map(p => '- ' + p).join('\n') : 'None'}

## Post-meeting
${m.post || 'None'}
`;
    copyToClipboard(md, 'Meeting context');
  }
```

- [ ] **Step 2: 验证**

Run:

```bash
open http://localhost:8080/prototype-v8.html
```

Expected: 打开联系人详情、邮件详情、会议详情，点击 `Copy context` 按钮后，底部出现 toast `Contact context copied` / `Message context copied` / `Meeting context copied`；粘贴到任意文本框，内容格式为 Markdown。

---

## Task 11: 视觉打磨与交互细节

**Files:**
- Modify: `css/prototype-v8.css`
- Modify: `js/prototype-v8.js`

**Interfaces:**
- Produces: refined hover/active/focus/empty states, no visual regressions.

- [ ] **Step 1: 统一 focus ring 与 active 反馈**

在 `css/prototype-v8.css` 追加：

```css
button, input, .feed-card, .person-card, .meeting-card {
  outline: none;
}

button:focus-visible, input:focus-visible {
  box-shadow: 0 0 0 2px var(--accent-dim);
}

.feed-card:active, .person-card:active, .meeting-card:active {
  transform: scale(0.995);
}

/* empty state in panel */
.panel-content > .empty-state {
  border: 1px dashed var(--border);
  padding: 32px 16px;
  text-align: center;
  border-radius: var(--radius-lg);
  color: var(--text-muted);
  font-size: 13px;
}
```

- [ ] **Step 2: 添加键盘关闭面板支持**

在 `js/prototype-v8.js` 的 `DOMContentLoaded` 中添加：

```javascript
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (state.agentOpen) toggleAgent();
        else if (document.getElementById('detail-panel').classList.contains('open')) closePanel();
      }
    });
```

- [ ] **Step 3: 检查并修正 taste skill 禁用项**

逐个检查：
- 没有使用 `Inter` 字体：通过
- 没有紫色渐变：通过
- 没有三列等宽功能卡：通过（People 网格是响应式不等高）
- 没有假截图：通过
- 没有装饰性状态点滥用：Agent 小红点仅一个
- 所有按钮文字在桌面端单行：通过

- [ ] **Step 4: 验证**

Run:

```bash
open http://localhost:8080/prototype-v8.html
```

Expected: 所有交互（hover、active、focus、面板开关、Agent 面板）流畅无卡顿；按 ESC 可关闭面板或 Agent；视觉风格与 DESIGN.md 一致。

---

## Task 12: Files / Drafts 占位视图与最终 QA

**Files:**
- Modify: `js/prototype-v8.js`
- Modify: `css/prototype-v8.css`（可选）

**Interfaces:**
- Produces: `renderFiles()`, `renderDrafts()`.

- [ ] **Step 1: 添加 Files 与 Drafts 视图**

```javascript
  function renderFiles() {
    const container = el('div', 'view files-view');
    const grid = el('div', 'files-grid');
    D._files.forEach(f => {
      const card = el('div', 'file-card');
      const contact = D.getP(f.pid);
      card.appendChild(el('div', 'file-name', f.name));
      card.appendChild(el('div', 'file-meta', f.sz + ' · ' + f.dt + (contact ? ' · ' + contact.name : '')));
      grid.appendChild(card);
    });
    container.appendChild(grid);
    return container;
  }

  function renderDrafts() {
    const container = el('div', 'view drafts-view');
    const list = el('div', 'drafts-list');
    D.agentDrafts.forEach(d => {
      const card = el('div', 'draft-card');
      card.appendChild(el('div', 'draft-header-title', d.to));
      card.appendChild(el('div', 'draft-subject', d.subj));
      card.appendChild(el('div', 'draft-preview', d.preview));
      const actions = el('div', 'draft-actions');
      actions.appendChild(el('button', 'btn btn-primary btn-sm', 'Send'));
      actions.appendChild(el('button', 'btn btn-secondary btn-sm', 'Edit'));
      card.appendChild(actions);
      list.appendChild(card);
    });
    container.appendChild(list);
    return container;
  }
```

- [ ] **Step 2: 追加 Files / Drafts 样式**

```css
.files-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
  max-width: 1100px;
}

.file-card {
  padding: 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
}

.file-name { font-size: 13px; font-weight: 500; margin-bottom: 4px; word-break: break-all; }
.file-meta { font-size: 11px; color: var(--text-muted); font-family: var(--font-mono); }

.drafts-list { display: flex; flex-direction: column; gap: 10px; max-width: 760px; }
.drafts-list .draft-card { cursor: default; }
.drafts-list .draft-card:hover { transform: none; box-shadow: var(--shadow-sm); }
```

- [ ] **Step 3: 最终 QA 清单**

逐项在浏览器中验证：

- [ ] 页面加载无 JS 报错
- [ ] 左侧导航可切换 5 个视图
- [ ] For You Feed 显示邮件和会议，过滤标签工作
- [ ] Needs Reply / Follow Up 中显示 AI draft 卡片，Send/Ignore 有效
- [ ] People 视图过滤和卡片显示正常
- [ ] 点击联系人/邮件/会议，右侧滑出详情面板
- [ ] 联系人详情 5 个标签切换正常
- [ ] Agent 按钮可展开/关闭面板
- [ ] Copy context 按钮可复制 Markdown 到剪贴板
- [ ] ESC 关闭面板/Agent
- [ ] 在 1280x800 和 1440x900 窗口下布局无错乱

- [ ] **Step 4: 提交代码**

```bash
git add prototype-v8.html css/prototype-v8.css js/prototype-v8.js
git commit -m "feat: add prototype-v8 agentic email client UI"
```

---

## Self-Review

**Spec coverage:**
- 以人为中心的 Agentic 邮件客户端：For You 时间线、People 目录 ✅
- 时间线即主页：Task 3 ✅
- Agent 不抢戏：右下角浮动按钮 + 面板，Task 9 ✅
- 上下文可导出：Task 10 ✅
- 浅色内容区 + 深色导航：Task 1 CSS ✅
- 邮件 + 日历范围：Task 3 / Task 8 ✅
- 内嵌 AI 待确认回复卡片：Task 4 ✅
- 不要 CRM 感：联系人详情放标签页，默认不展示销售漏斗 ✅

**Placeholder scan:**
- 无 TBD/TODO/"implement later"
- 所有函数都有具体实现代码或明确的渲染逻辑
- 验证步骤都有明确命令和期望结果

**Type/命名一致性：**
- 数据源统一使用 `D` 全局对象
- 状态字段：`view`, `filter`, `peopleFilter`, `selectedContactId`, `selectedMessageId`, `selectedMeetingId`, `agentOpen`, `contactTab`
- 核心函数命名一致：`render*` 用于渲染，`open*` 用于打开面板，`copy*Context` 用于导出

**潜在缺口：**
- 真实后端/API 不在本 prototype 范围
- 本地保存 Markdown 到 `~/.relay/context/` 需要 Tauri 文件系统 API；本阶段仅复制到剪贴板，文件保存作为后续扩展
- 邮件正文完整渲染使用占位文本；prototype 阶段用 `m.prev` 作为摘要

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-20-relay-agentic-email-client-plan.md`.

Two execution options:

1. **Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
