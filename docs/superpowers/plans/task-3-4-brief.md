# Task 3 + 4: For You 时间线 Feed + 内嵌 AI 待确认回复卡片

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

- Consumes: `D.contacts`, `D._msgs`, `D._meetings`, `D.agentDrafts`, `state.filter`, `state.view`.
- Produces: `renderForYou()`, `renderFeedItem(event)`, `filterEvents(events)`, `renderDraftCard(msg, contact)`, `sendDraft()`, `editDraft()`, `ignoreDraft()`, `showToast(text)`.

## Notes

Task 1 和 Task 2 已完成。当前 `js/prototype-v8.js` 包含 `renderMain()`、`renderNav()`、`renderTopBar()`、`setView()` 等函数。本任务需要：
1. 在 `renderMain` 中加入 For You / People / Calendar / Files / Drafts 分支。
2. 添加 Feed 数据函数、渲染函数、draft 卡片函数。
3. 追加对应 CSS。

目前 `openMessage(m)` 和 `openMeeting(m)` 还未实现；在 draft 卡片里点击 Edit 会调用 `openMessage(m)`，但 Task 7 才会完整实现它。本任务里只需要声明这两个函数为 stub，避免报错：

```javascript
function openMessage(m) { console.log('openMessage', m.subj); }
function openMeeting(m) { console.log('openMeeting', m.title); }
```

## Steps

- [ ] **Step 1: 在 `js/prototype-v8.js` 里添加 Feed 数据函数**

把这些函数放在 `renderMain` 之前：

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

- [ ] **Step 2: 替换 `renderMain` 并添加 `renderForYou`**

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

- [ ] **Step 3: 添加 `renderFeedItem`、draft 相关函数和 stub**

在 `js/prototype-v8.js` 里继续添加：

```javascript
  function openMessage(m) { console.log('openMessage', m.subj); }
  function openMeeting(m) { console.log('openMeeting', m.title); }

  function renderFeedItem(ev) {
    if (ev.type === 'message') {
      const m = ev.data;
      const contact = getContact(m.pid);
      const isDraft = m.fl === 'wait' || m.fl === 'todo';

      if (isDraft) {
        return renderDraftCard(m, contact);
      }

      const card = el('div', 'feed-card');
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

- [ ] **Step 4: 追加 CSS 到 `css/prototype-v8.css` 末尾**

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

- [ ] **Step 5: 本地验证**

Run:

```bash
python3 -m http.server 8080 &
open http://localhost:8080/prototype-v8.html
```

Expected:
- For You 视图显示按时间排序的邮件和会议卡片。
- 点击 `Needs Reply` / `Follow Up` 等标签，Feed 正确过滤。
- `Needs Reply` / `Follow Up` 下出现带有 `AI draft ready` 标识的卡片；点击 Send，卡片状态变为 done 并刷新；点击 Ignore，卡片从该过滤视图消失。
- 卡片 hover 有轻微上浮效果，无 JS 报错。

## Report

完成后把结果写到 `docs/superpowers/plans/task-3-4-report.md`：
- 状态：DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED
- 修改了哪些文件
- 验证命令和结果
- 自审发现的问题（如有）
