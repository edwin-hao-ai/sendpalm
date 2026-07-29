# Task 9 + 10: Agent 面板 + Markdown 上下文导出

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

- Consumes: `D.agentTasks`, `D.agentDrafts`, `D.getP`, `D.getMsgs(pid)`, `D.getMeetings(pid)`, `D.stageSuggest`, `state.selectedContactId`, `state.agentOpen`.
- Produces: `renderAgentFab()`, `renderAgentPanel()`, `toggleAgent()`, `copyToClipboard(text, label)`, `copyContactContext(c)`, `copyMessageContext(m, c)`, `copyMeetingContext(m)`.

## Notes

Task 1-8 已完成。当前 `copyContactContext`, `copyMessageContext`, `copyMeetingContext` 是 stub（来自 Task 5-8）。本任务需要：
1. 添加 Agent 浮动按钮和面板。
2. 用真实实现替换三个 context-copy stub。

## Steps

- [ ] **Step 1: 在 `js/prototype-v8.js` 的 `DOMContentLoaded` 中添加 Agent 初始化**

把 Task 2 的 `DOMContentLoaded` 内容从：

```javascript
  document.addEventListener('DOMContentLoaded', () => {
    renderNav();
    renderTopBar();
    renderMain();
  });
```

改为：

```javascript
  document.addEventListener('DOMContentLoaded', () => {
    renderNav();
    renderTopBar();
    renderMain();
    renderAgentFab();
    renderAgentPanel();
  });
```

- [ ] **Step 2: 在 `js/prototype-v8.js` 里添加 Agent 函数**

在文件末尾（仍然 IIFE 内）添加：

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

- [ ] **Step 3: 在 `js/prototype-v8.js` 里替换 context stub 为真实实现**

找到并删除 Task 5-8 里的三个 stub：

```javascript
function copyContactContext(c) { showToast('Contact context copied (stub)'); }
function copyMessageContext(m, c) { showToast('Message context copied (stub)'); }
function copyMeetingContext(m) { showToast('Meeting context copied (stub)'); }
```

替换为：

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

- [ ] **Step 4: 追加 Agent 样式到 `css/prototype-v8.css` 末尾**

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

- [ ] **Step 5: 本地验证**

Run:

```bash
python3 -m http.server 8080 &
open http://localhost:8080/prototype-v8.html
```

Expected:
- 右下角出现 Agent 按钮，有进行中的任务时带小红点。
- 点击展开 Agent 面板，显示建议芯片、进行中的任务、输入框；点击 X 或再次点击按钮关闭。
- 打开联系人详情、邮件详情、会议详情，点击 `Copy context` 按钮后，底部出现 toast。
- 在支持 clipboard 的环境中，点击后剪贴板内容是 Markdown 格式。
- 无 JS 报错。

## Report

完成后把结果写到 `docs/superpowers/plans/task-9-10-report.md`：
- 状态：DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED
- 修改了哪些文件
- 验证命令和结果
- 自审发现的问题（如有）
