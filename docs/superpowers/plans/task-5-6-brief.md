# Task 5 + 6: People 联系人目录 + 联系人详情滑出面板

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

- Consumes: `D.contacts`, `D.getMsgs(pid)`, `D.getFiles(pid)`, `D.getMeetings(pid)`, `D.getConnections(pid)`, `D.stageLabel`.
- Produces: `renderPeople()`, `renderPersonCard(contact)`, `filterContacts(contacts)`, `openContact(id)`, `closePanel()`, `renderContactPanel(contact)`, tab content functions.

## Notes

Task 1-4 已完成。`renderPeople()` 当前是 Task 3 里的 placeholder stub，需要替换为真实实现。`copyContactContext(c)` 会在 Task 10 中完整实现；本任务先用 stub 避免报错：

```javascript
function copyContactContext(c) { showToast('Contact context copied (stub)'); }
```

## Steps

- [ ] **Step 1: 在 `js/prototype-v8.js` 里添加 People 渲染函数**

把这些函数添加到 `renderForYou` 之后：

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

- [ ] **Step 2: 在 `js/prototype-v8.js` 里添加联系人详情面板函数**

继续添加：

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

  // Stub for context export; full implementation in Task 10
  function copyContactContext(c) {
    showToast('Contact context copied (stub)');
  }
```

- [ ] **Step 3: 追加 CSS 到 `css/prototype-v8.css` 末尾**

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

- [ ] **Step 4: 本地验证**

Run:

```bash
python3 -m http.server 8080 &
open http://localhost:8080/prototype-v8.html
```

Expected:
- 点击 People 导航，显示联系人卡片网格。
- 点击 `Active` / `Need Follow Up` / `Cold` 过滤正确。
- 每个卡片显示健康度分数和最近联系时间。
- 点击联系人卡片，右侧滑出详情面板；面板显示头像、姓名、健康度、5 个标签页。
- 点击 Timeline/Files/Insights/Network/Calendar 标签切换内容。
- 点击 X 关闭面板。
- 无 JS 报错。

## Report

完成后把结果写到 `docs/superpowers/plans/task-5-6-report.md`：
- 状态：DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED
- 修改了哪些文件
- 验证命令和结果
- 自审发现的问题（如有）
