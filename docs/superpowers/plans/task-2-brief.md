# Task 2: 实现左侧导航与顶部栏

> 完整设计文档：`docs/superpowers/specs/2026-07-20-relay-agentic-email-client-design.md`  
> 完整实施计划：`docs/superpowers/plans/2026-07-20-relay-agentic-email-client-plan.md`

## Global Constraints

- 左侧导航/Agent 背景色 `#08090d`，主内容区背景色 `#f8f8f6`。
- 强调色 `#5B4CDB`，禁用 AI 紫渐变、霓虹 glow、纯黑/纯白背景。
- 字体：`Geist Sans` 用于 UI 正文，`Geist Mono` 用于数据/标签/时间。
- 圆角系统：`--radius-sm: 6px`，`--radius-md: 10px`，`--radius-lg: 14px`。
- 过渡曲线：`cubic-bezier(0.16, 1, 0.3, 1)`。
- 不实现真实后端、本地 LLM、向量数据库；所有数据来自 `prototype-data.js`。
- 不用 `Inter` 作主字体，不用三列等宽功能卡，不用假截图。
- 每个按钮、卡片、输入框必须有 hover/active/focus 状态。

## Files

- Modify: `js/prototype-v8.js`
- Modify: `css/prototype-v8.css`

## Interfaces

- Consumes: `state.view`.
- Produces: `renderNav()`, `renderTopBar()`, `setView(view)` function.

## Notes

Task 1 已经创建了基础文件。本任务需要：
1. 把 `js/prototype-v8.js` 的内容替换为下面完整代码（保留相同的 state 结构）。
2. 把下面 CSS 追加到 `css/prototype-v8.css` 末尾。

## Steps

- [ ] **Step 1: 替换 `js/prototype-v8.js` 内容**

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

- [ ] **Step 2: 追加 CSS 到 `css/prototype-v8.css` 末尾**

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

- [ ] **Step 3: 本地验证**

Run:

```bash
python3 -m http.server 8080 &
open http://localhost:8080/prototype-v8.html
```

Expected: 左侧栏显示 5 个导航项 + Settings；点击导航项，顶部标题和主内容区同步切换；无 JS 报错。

## Report

完成后把结果写到 `docs/superpowers/plans/task-2-report.md`：
- 状态：DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED
- 修改了哪些文件
- 验证命令和结果
- 自审发现的问题（如有）
