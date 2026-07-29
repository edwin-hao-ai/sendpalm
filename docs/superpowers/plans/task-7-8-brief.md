# Task 7 + 8: 邮件阅读视图 + Calendar 视图

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

- Consumes: message object, meeting object, `D.getP`.
- Produces: `openMessage(m)`, `renderMessagePanel(m)`, `renderCalendar()`, `openMeeting(m)`, `renderMeetingPanel(m)`.

## Notes

Task 1-6 已完成。当前 `js/prototype-v8.js` 中有 `openMessage(m)` 和 `openMeeting(m)` 的 console.log stub（来自 Task 3-4）。本任务需要把它们替换成真实实现。

`copyMessageContext(m, c)` 和 `copyMeetingContext(m)` 会在 Task 10 完整实现；本任务先用 stub：

```javascript
function copyMessageContext(m, c) { showToast('Message context copied (stub)'); }
function copyMeetingContext(m) { showToast('Meeting context copied (stub)'); }
```

## Steps

- [ ] **Step 1: 在 `js/prototype-v8.js` 里替换 `openMessage` 并添加 `renderMessagePanel`**

找到 Task 3-4 里的 `function openMessage(m) { console.log('openMessage', m.subj); }` 并替换为：

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

- [ ] **Step 2: 在 `js/prototype-v8.js` 里替换 `openMeeting` 并添加 Calendar 函数**

找到 Task 3-4 里的 `function openMeeting(m) { console.log('openMeeting', m.title); }` 并替换为：

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

- [ ] **Step 3: 在 `js/prototype-v8.js` 里添加 context stub 函数**

在文件末尾（仍然 IIFE 内）添加：

```javascript
  // Stubs for context export; full implementation in Task 10
  function copyMessageContext(m, c) {
    showToast('Message context copied (stub)');
  }

  function copyMeetingContext(m) {
    showToast('Meeting context copied (stub)');
  }
```

- [ ] **Step 4: 追加 CSS 到 `css/prototype-v8.css` 末尾**

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

- [ ] **Step 5: 本地验证**

Run:

```bash
python3 -m http.server 8080 &
open http://localhost:8080/prototype-v8.html
```

Expected:
- 在 For You 时间线点击普通邮件卡片，右侧滑出邮件详情面板，显示 From、Subject、正文预览、附件、操作按钮。
- 点击 Calendar 导航，显示会议列表；每个会议显示简报状态；点击会议卡片，右侧滑出会议详情和准备清单。
- 无 JS 报错。

## Report

完成后把结果写到 `docs/superpowers/plans/task-7-8-report.md`：
- 状态：DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED
- 修改了哪些文件
- 验证命令和结果
- 自审发现的问题（如有）
