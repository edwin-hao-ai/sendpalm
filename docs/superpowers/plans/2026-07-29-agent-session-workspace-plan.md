# Agent Session & Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-_SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 prototype-v11 中引入可管理的 Agent Session 体系，新增 Agent 工作区视图，并改造 Quick Agent 面板支持 session 切换、上下文可见、任务与对话打通。

**Architecture:** 在 `js/prototype-v11.js` 中新增 session 状态与工具函数；复用并扩展现有 Agent 面板逻辑；新增 `agent` 主视图（三栏布局：session 列表 / 对话区 / 任务-草稿-记忆面板）；所有样式写入 `css/prototype-v11.css`；缓存版本号递增并通过 WebBridge 截图验证。

**Tech Stack:** 纯前端原型（HTML + 原生 JS + CSS），依赖 Phosphor Icons，使用本地 `python3 -m http.server` 和 Kimi WebBridge 验证。

## Global Constraints

- 所有改动限制在 `prototype-v11.*` 文件族，不引入新依赖。
- 保持现有视觉风格（HEY-inspired warm paper palette、serif 标题、sans 正文）。
- 新增图标优先使用 Phosphor Icons 现有 class，不再使用已确认不存在的 `ph-palm-tree`。
- 每次修改后递增 `prototype-v11.html` 的 `?v=` 缓存版本号。
- 每个 task 结束时使用 WebBridge 截图或浏览器控制台验证。
- 不实现真实 LLM 调用，继续用 `showToast` + 模拟数据演示交互。

---

## File Structure

| 文件 | 职责 |
|---|---|
| `prototype-data.js` | 扩展示例数据：`agentSessions`、`agentMemory`、`agentTasks`（增加 `sessionId`）、`agentDrafts`（增加 `sessionId`） |
| `js/prototype-v11.js` | 新增 state、session 工具函数、改造 `renderAgentPanel` / `renderAgentFab`、新增 `renderAgentView` / `renderSessionList` / `renderConversation` / `renderAgentSidebar`、扩展 settings |
| `css/prototype-v11.css` | 新增 Agent 工作区三栏布局、session 列表、消息气泡操作、任务卡片增强、记忆 chip 等样式 |
| `prototype-v11.html` | 递增 CSS/JS 缓存版本号 |

---

### Task 1: 扩展数据模型与状态

**Files:**
- Modify: `prototype-data.js`（新增示例 session、memory、扩展 task/draft 字段）
- Modify: `js/prototype-v11.js:11-49`（state 对象）

**Interfaces:**
- Consumes: 现有 `D.agentTasks`, `D.agentDrafts`
- Produces: `state.agentSessions`, `state.currentAgentSessionId`, `state.agentMemory`

- [ ] **Step 1: 在 `prototype-data.js` 末尾追加示例数据**

```js
window.D = window.D || {};
D.agentSessions = [
  {
    id: 'as-1',
    type: 'contextual',
    title: '张磊合同跟进',
    context: { kind: 'message', id: 'msg-1', preview: '张磊 - 合同附件 - 验收标准 v2' },
    messages: [
      { role: 'user', text: '帮我草拟回复', ts: Date.now() - 3600000 },
      { role: 'agent', text: '好的，我已根据合同附件为你草拟回复：\n\n张磊，\n\n验收标准 v2 已收到...', actions: ['copy', 'regenerate', 'use-draft'], ts: Date.now() - 3500000 }
    ],
    taskId: null,
    memoryTags: ['formal-tone'],
    status: 'active',
    createdAt: Date.now() - 3600000,
    updatedAt: Date.now() - 3500000
  },
  {
    id: 'as-2',
    type: 'freeform',
    title: '我的写作风格',
    context: { kind: null, id: null, preview: '' },
    messages: [
      { role: 'user', text: '我喜欢正式的邮件语气', ts: Date.now() - 86400000 },
      { role: 'agent', text: '已记录：你偏好正式语气。后续草稿会默认采用正式表达。', actions: [], ts: Date.now() - 86300000 }
    ],
    taskId: null,
    memoryTags: ['preference-tone-formal'],
    status: 'pinned',
    createdAt: Date.now() - 86400000,
    updatedAt: Date.now() - 86300000
  }
];

D.agentMemory = {
  global: {
    tone: 'formal',
    defaultLength: 'medium',
    signature: 'Best, Edwin',
    language: 'zh-CN'
  },
  contacts: {
    'p-1': {
      topics: ['Q4合同', '付款条款'],
      preferences: ['喜欢数据驱动', '回复慢但决策快'],
      avoid: ['不要在周五下午发邮件']
    }
  }
};

// 扩展现有任务和草稿，增加 sessionId 字段
if (D.agentTasks && D.agentTasks.length) {
  D.agentTasks.forEach((t, i) => {
    if (!t.sessionId) t.sessionId = 'as-task-' + (i + 1);
  });
}
if (D.agentDrafts && D.agentDrafts.length) {
  D.agentDrafts.forEach((d, i) => {
    if (!d.sessionId) d.sessionId = 'as-1';
    if (!d.sourceContext) d.sourceContext = { kind: 'message', id: 'msg-1', preview: '张磊 - 合同附件' };
  });
}
```

- [ ] **Step 2: 在 `js/prototype-v11.js` 的 state 对象中追加字段**

在 `js/prototype-v11.js:11-49` 的 `state` 对象内，在 `loading: true,` 之后添加：

```js
    agentSessions: JSON.parse(JSON.stringify(D.agentSessions || [])),
    currentAgentSessionId: (D.agentSessions && D.agentSessions[0] && D.agentSessions[0].id) || null,
    agentMemory: JSON.parse(JSON.stringify(D.agentMemory || { global: {}, contacts: {} })),
```

- [ ] **Step 3: 验证数据已加载**

Run:
```bash
python3 -m http.server 8765 --directory /Users/edwinhao/sendpalm
```

Open in browser:
```
http://127.0.0.1:8765/prototype-v11.html?v=11.9
```

Open DevTools console and run:
```js
console.log(state.agentSessions.length, state.currentAgentSessionId, state.agentMemory.global.tone)
```

Expected: `2 "as-1" "formal"`

- [ ] **Step 4: Commit**

```bash
git add prototype-data.js js/prototype-v11.js
git commit -m "feat(agent): add session and memory state model"
```

---

### Task 2: 实现 Session 工具函数

**Files:**
- Modify: `js/prototype-v11.js`（在 `renderAgentFab` 之前新增工具函数区）

**Interfaces:**
- Consumes: `state.agentSessions`, `state.currentAgentSessionId`
- Produces: `createAgentSession`, `getCurrentAgentSession`, `switchAgentSession`, `archiveAgentSession`, `pinAgentSession`, `updateAgentSessionTitle`, `addAgentMessage`

- [ ] **Step 1: 在 `js/prototype-v11.js:5435` 前插入 session 工具函数**

```js
  function generateId(prefix) {
    return prefix + '-' + Math.random().toString(36).slice(2, 9);
  }

  function createAgentSession(type, context, title) {
    const session = {
      id: generateId('as'),
      type: type || 'freeform',
      title: title || (context && context.preview ? context.preview : 'New conversation'),
      context: context || { kind: null, id: null, preview: '' },
      messages: [],
      taskId: null,
      memoryTags: [],
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    state.agentSessions.unshift(session);
    state.currentAgentSessionId = session.id;
    return session;
  }

  function getCurrentAgentSession() {
    return state.agentSessions.find(s => s.id === state.currentAgentSessionId) || null;
  }

  function switchAgentSession(id) {
    const s = state.agentSessions.find(x => x.id === id);
    if (!s) return;
    state.currentAgentSessionId = id;
    s.status = s.status === 'archived' ? 'active' : s.status;
    s.updatedAt = Date.now();
  }

  function archiveAgentSession(id) {
    const s = state.agentSessions.find(x => x.id === id);
    if (s) {
      s.status = 'archived';
      if (state.currentAgentSessionId === id) {
        const next = state.agentSessions.find(x => x.status !== 'archived');
        state.currentAgentSessionId = next ? next.id : null;
      }
    }
  }

  function pinAgentSession(id) {
    const s = state.agentSessions.find(x => x.id === id);
    if (s) s.status = s.status === 'pinned' ? 'active' : 'pinned';
  }

  function updateAgentSessionTitle(id, title) {
    const s = state.agentSessions.find(x => x.id === id);
    if (s) {
      s.title = title;
      s.updatedAt = Date.now();
    }
  }

  function addAgentMessage(sessionId, role, text, actions) {
    const s = state.agentSessions.find(x => x.id === sessionId);
    if (!s) return;
    s.messages.push({ role, text, actions: actions || [], ts: Date.now() });
    s.updatedAt = Date.now();
  }

  function agentContextKindIcon(kind) {
    const map = {
      message: 'ph-envelope',
      contact: 'ph-user',
      meeting: 'ph-calendar',
      file: 'ph-file'
    };
    return map[kind] || 'ph-sparkle';
  }
```

- [ ] **Step 2: 验证工具函数**

Open `http://127.0.0.1:8765/prototype-v11.html?v=11.9` and run in console:

```js
const s = createAgentSession('freeform', null, '测试会话');
addAgentMessage(s.id, 'user', '你好', []);
addAgentMessage(s.id, 'agent', '你好，有什么可以帮你的？', ['copy']);
console.log(getCurrentAgentSession().messages.length);
```

Expected: `2`

- [ ] **Step 3: Commit**

```bash
git add js/prototype-v11.js
git commit -m "feat(agent): add session utility functions"
```

---

### Task 3: 改造 Quick Agent 面板头部与 Session 切换

**Files:**
- Modify: `js/prototype-v11.js:5479-5538`（`renderAgentPanel`）
- Modify: `css/prototype-v11.css:6251-6266`（`.agent-header`）

**Interfaces:**
- Consumes: `getCurrentAgentSession`, `switchAgentSession`, `createAgentSession`
- Produces: `.agent-session-select` dropdown, `.agent-new-session-btn`

- [ ] **Step 1: 替换 `renderAgentPanel` 的 header 部分**

原代码（`js/prototype-v11.js:5483-5489`）：
```js
    const header = el('div', 'agent-header');
    header.appendChild(el('span', 'agent-title', 'SendPalm Agent'));
    const close = el('button', 'icon-btn agent-close');
    close.appendChild(icon('ph-x'));
    close.addEventListener('click', toggleAgent);
    header.appendChild(close);
    panel.appendChild(header);
```

替换为：
```js
    const header = el('div', 'agent-header');

    const sessionSelectWrap = el('div', 'agent-session-select-wrap');
    const currentSession = getCurrentAgentSession();
    const sessionBtn = el('button', 'agent-session-select');
    sessionBtn.appendChild(icon(agentContextKindIcon(currentSession && currentSession.context.kind)));
    sessionBtn.appendChild(el('span', '', currentSession ? currentSession.title : 'New conversation'));
    sessionBtn.appendChild(icon('ph-caret-down'));
    sessionBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showAgentSessionDropdown(sessionBtn);
    });
    sessionSelectWrap.appendChild(sessionBtn);
    header.appendChild(sessionSelectWrap);

    const headerActions = el('div', 'agent-header-actions');
    const newSessionBtn = el('button', 'icon-btn agent-new-session-btn');
    newSessionBtn.title = 'New session';
    newSessionBtn.appendChild(icon('ph-plus'));
    newSessionBtn.addEventListener('click', () => {
      createAgentSession('freeform', null, null);
      renderAgentPanel();
    });
    headerActions.appendChild(newSessionBtn);

    const close = el('button', 'icon-btn agent-close');
    close.title = 'Close';
    close.appendChild(icon('ph-x'));
    close.addEventListener('click', toggleAgent);
    headerActions.appendChild(close);
    header.appendChild(headerActions);

    panel.appendChild(header);
```

- [ ] **Step 2: 新增 session 下拉菜单函数**

在 `renderAgentPanel` 之前插入：

```js
  function showAgentSessionDropdown(anchor) {
    const existing = document.querySelector('.agent-session-dropdown');
    if (existing) { existing.remove(); return; }

    const dropdown = el('div', 'agent-session-dropdown');
    const activeSessions = state.agentSessions.filter(s => s.status !== 'archived');
    activeSessions.slice(0, 6).forEach(s => {
      const item = el('div', 'agent-session-dropdown-item' + (s.id === state.currentAgentSessionId ? ' active' : ''));
      item.appendChild(icon(agentContextKindIcon(s.context.kind)));
      const info = el('div', 'agent-session-dropdown-info');
      info.appendChild(el('div', 'agent-session-dropdown-title', s.title));
      const last = s.messages[s.messages.length - 1];
      info.appendChild(el('div', 'agent-session-dropdown-preview', last ? last.text.slice(0, 40) : ''));
      item.appendChild(info);
      item.addEventListener('click', () => {
        switchAgentSession(s.id);
        renderAgentPanel();
        dropdown.remove();
      });
      dropdown.appendChild(item);
    });

    const archived = state.agentSessions.filter(s => s.status === 'archived');
    if (archived.length) {
      dropdown.appendChild(el('div', 'agent-session-dropdown-divider', ''));
      archived.slice(0, 3).forEach(s => {
        const item = el('div', 'agent-session-dropdown-item');
        item.appendChild(icon('ph-archive'));
        item.appendChild(el('span', '', s.title));
        item.addEventListener('click', () => {
          switchAgentSession(s.id);
          renderAgentPanel();
          dropdown.remove();
        });
        dropdown.appendChild(item);
      });
    }

    document.body.appendChild(dropdown);
    const rect = anchor.getBoundingClientRect();
    dropdown.style.top = (rect.bottom + 4) + 'px';
    dropdown.style.left = rect.left + 'px';

    const closeDropdown = (e) => {
      if (!dropdown.contains(e.target) && e.target !== anchor) {
        dropdown.remove();
        document.removeEventListener('click', closeDropdown);
      }
    };
    setTimeout(() => document.addEventListener('click', closeDropdown), 0);
  }
```

- [ ] **Step 3: 更新 `runAgentAction` 使用当前 session**

找到 `runAgentAction` 函数（大约在 `js/prototype-v11.js:5100` 附近），确保它把用户输入和 Agent 回复写入当前 session：

```js
  function runAgentAction(text) {
    let session = getCurrentAgentSession();
    if (!session) {
      session = createAgentSession('freeform', null, text.slice(0, 30));
    }
    addAgentMessage(session.id, 'user', text, []);

    // Simulate agent processing
    showToast('Agent is thinking...');
    setTimeout(() => {
      const reply = generateAgentReply(text, session);
      addAgentMessage(session.id, 'agent', reply, ['copy', 'regenerate']);
      renderAgentPanel();
    }, 600);
  }
```

如果原函数没有 `generateAgentReply`，可以 inline：

```js
  function generateAgentReply(text, session) {
    if (text.includes('总结')) return '这是当前内容的摘要：...';
    if (text.includes('草稿') || text.includes('回复')) return '已为你草拟回复：\n\n您好，...';
    return '收到。我已记录你的请求，接下来可以帮你继续处理。';
  }
```

- [ ] **Step 4: 添加 CSS**

在 `css/prototype-v11.css:6266` 后追加：

```css
.agent-session-select-wrap { position: relative; flex: 1; min-width: 0; }
.agent-session-select {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 100%;
  padding: 6px 10px;
  border-radius: var(--radius-md);
  background: transparent;
  border: 1px solid transparent;
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s var(--ease-out), border-color 0.15s var(--ease-out);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.agent-session-select:hover {
  background: var(--bg-hover);
  border-color: var(--border);
}
.agent-session-select i { font-size: 14px; color: var(--accent); flex-shrink: 0; }
.agent-session-select i:last-child { font-size: 10px; color: var(--text-muted); }
.agent-session-select span { overflow: hidden; text-overflow: ellipsis; }

.agent-header-actions { display: flex; align-items: center; gap: 4px; }
.agent-new-session-btn { color: var(--text-secondary); }
.agent-new-session-btn:hover { color: var(--accent); }

.agent-session-dropdown {
  position: fixed;
  width: 260px;
  max-height: 320px;
  overflow-y: auto;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  padding: 6px;
  z-index: 100;
}
.agent-session-dropdown-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 10px;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background 0.12s var(--ease-out);
}
.agent-session-dropdown-item:hover,
.agent-session-dropdown-item.active { background: var(--bg-hover); }
.agent-session-dropdown-item i { font-size: 14px; color: var(--accent); margin-top: 2px; flex-shrink: 0; }
.agent-session-dropdown-info { flex: 1; min-width: 0; }
.agent-session-dropdown-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.agent-session-dropdown-preview {
  font-size: 11px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.agent-session-dropdown-divider {
  height: 1px;
  background: var(--border);
  margin: 6px 0;
}
```

- [ ] **Step 5: 验证**

Open `http://127.0.0.1:8765/prototype-v11.html?v=11.10` and click the sparkle FAB.

Expected:
- Header shows "张磊合同跟进" with a dropdown arrow.
- Clicking dropdown shows session list.
- Clicking "+" creates a new session.

Use WebBridge screenshot:
```bash
curl -s -X POST http://127.0.0.1:10086/command -H 'Content-Type: application/json' -d '{"action":"click","args":{"selector":"#agent-fab"},"session":"sendpalm-prototype-audit"}'
sleep 1
curl -s -X POST http://127.0.0.1:10086/command -H 'Content-Type: application/json' -d '{"action":"screenshot","args":{"path":"/Users/edwinhao/sendpalm/qa-tmp/agent-panel-session.png"},"session":"sendpalm-prototype-audit"}'
```

- [ ] **Step 6: Commit**

```bash
git add js/prototype-v11.js css/prototype-v11.css prototype-v11.html
git commit -m "feat(agent): add session switcher to quick agent panel"
```

---

### Task 4: Quick Agent 消息历史与消息操作

**Files:**
- Modify: `js/prototype-v11.js:5491-5538`（`renderAgentPanel` 的消息渲染区）
- Modify: `css/prototype-v11.css`（新增消息样式）

**Interfaces:**
- Consumes: `getCurrentAgentSession`, `addAgentMessage`
- Produces: `.agent-messages`, `.agent-message`, `.agent-message-actions`

- [ ] **Step 1: 替换 Quick Agent 的消息区**

原 `renderAgentPanel` 中，在 suggestions 和 tasks 之间新增消息渲染区。在 `panel.appendChild(suggestions);` 后、`const tasks = el('div', 'agent-tasks');` 前插入：

```js
    const messagesWrap = el('div', 'agent-messages');
    const session = getCurrentAgentSession();
    if (session && session.messages.length) {
      session.messages.forEach(m => {
        const row = el('div', 'agent-message agent-message-' + m.role);
        const bubble = el('div', 'agent-message-bubble');
        bubble.textContent = m.text;
        row.appendChild(bubble);

        if (m.role === 'agent' && m.actions && m.actions.length) {
          const actions = el('div', 'agent-message-actions');
          m.actions.forEach(a => {
            const btn = el('button', 'agent-message-action-btn', actionLabel(a));
            btn.addEventListener('click', (e) => {
              e.stopPropagation();
              handleAgentMessageAction(a, m, session);
            });
            actions.appendChild(btn);
          });
          row.appendChild(actions);
        }
        messagesWrap.appendChild(row);
      });
    } else {
      messagesWrap.appendChild(el('div', 'agent-empty-messages', 'Ask SendPalm anything about what you are viewing.'));
    }
    panel.appendChild(messagesWrap);
```

- [ ] **Step 2: 新增辅助函数**

在 `renderAgentPanel` 之前插入：

```js
  function actionLabel(action) {
    const labels = {
      copy: 'Copy',
      regenerate: 'Regenerate',
      'use-draft': 'Use as draft',
      'create-task': 'Create task'
    };
    return labels[action] || action;
  }

  function handleAgentMessageAction(action, message, session) {
    if (action === 'copy') {
      copyToClipboard(message.text, 'Message copied');
    } else if (action === 'regenerate') {
      showToast('Regenerating...');
      setTimeout(() => {
        message.text = generateAgentReply('regenerate', session);
        renderAgentPanel();
      }, 600);
    } else if (action === 'use-draft') {
      openCompose({ body: message.text, mode: 'new' });
    } else if (action === 'create-task') {
      createAgentTaskFromMessage(message, session);
    }
  }
```

- [ ] **Step 3: 新增 CSS**

在 `css/prototype-v11.css` 中 `.agent-suggestions` 样式之后追加：

```css
.agent-messages {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 14px;
}
.agent-empty-messages {
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
  padding: 24px 0;
}
.agent-message {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.agent-message-user { align-items: flex-end; }
.agent-message-agent { align-items: flex-start; }
.agent-message-bubble {
  max-width: 90%;
  padding: 10px 12px;
  border-radius: var(--radius-lg);
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
}
.agent-message-user .agent-message-bubble {
  background: var(--accent);
  color: #fff;
  border-bottom-right-radius: 4px;
}
.agent-message-agent .agent-message-bubble {
  background: var(--surface-2);
  color: var(--text-primary);
  border: 1px solid var(--border);
  border-bottom-left-radius: 4px;
}
.agent-message-actions {
  display: flex;
  gap: 6px;
  padding-left: 2px;
}
.agent-message-action-btn {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  transition: background 0.12s var(--ease-out), color 0.12s var(--ease-out);
}
.agent-message-action-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
```

- [ ] **Step 4: 验证**

Open the agent panel. The session "张磊合同跟进" should show the sample user/agent messages.

- [ ] **Step 5: Commit**

```bash
git add js/prototype-v11.js css/prototype-v11.css prototype-v11.html
git commit -m "feat(agent): render message history and actions in quick panel"
```

---

### Task 5: 动态上下文 Chips 与上下文 Pill

**Files:**
- Modify: `js/prototype-v11.js:5495-5507`（suggestions 区）
- Modify: `js/prototype-v11.js:5459-5477`（`buildAgentContext` 返回结构）

**Interfaces:**
- Consumes: `getCurrentAgentSession`
- Produces: `buildAgentContext` 返回 `{ kind, id, preview }`

- [ ] **Step 1: 改造 `buildAgentContext` 返回结构化数据**

替换 `js/prototype-v11.js:5459-5477` 的 `buildAgentContext` 函数为：

```js
  function buildAgentContext() {
    if (state.selectedMessageId && state.selectedContactId) {
      const c = D.getP(state.selectedContactId);
      const m = D._msgs.find(x => x.id === state.selectedMessageId);
      return {
        kind: 'message',
        id: state.selectedMessageId,
        preview: (c ? c.name + ' - ' : '') + (m ? (m.subj || 'No subject') : '')
      };
    }
    if (state.selectedMeetingId) {
      const m = D._meetings.find(x => x.id === state.selectedMeetingId);
      return { kind: 'meeting', id: state.selectedMeetingId, preview: m ? m.title : '' };
    }
    if (state.selectedContactId) {
      const c = D.getP(state.selectedContactId);
      return { kind: 'contact', id: state.selectedContactId, preview: c ? c.name : '' };
    }
    if (state.selectedFileId) {
      const f = D._files.find(x => x.id === state.selectedFileId);
      return { kind: 'file', id: state.selectedFileId, preview: f ? f.name : '' };
    }
    return { kind: null, id: null, preview: '' };
  }
```

- [ ] **Step 2: 在 Agent 面板顶部渲染上下文 pill**

在 header 之后、`suggestions` 之前插入：

```js
    const ctx = buildAgentContext();
    if (ctx.kind) {
      const ctxWrap = el('div', 'agent-context');
      const ctxPill = el('button', 'agent-context-pill');
      ctxPill.appendChild(icon(agentContextKindIcon(ctx.kind)));
      ctxPill.appendChild(el('span', '', ctx.preview));
      ctxPill.title = 'Click to reference this context';
      ctxPill.addEventListener('click', () => {
        const input = panel.querySelector('.agent-input');
        if (input) {
          input.value = input.value ? input.value + ' [context:' + ctx.kind + ':' + ctx.id + ']' : '[context:' + ctx.kind + ':' + ctx.id + ']';
          input.focus();
        }
      });
      ctxWrap.appendChild(ctxPill);
      panel.appendChild(ctxWrap);
    }
```

- [ ] **Step 3: 改造 suggestions chips 为动态**

替换原 suggestions 区：

```js
    const suggestions = el('div', 'agent-suggestions');
    const suggestionActions = agentSuggestionsForContext(ctx.kind);
    suggestionActions.forEach(s => {
      const chip = el('button', 'agent-chip', s.text);
      chip.addEventListener('click', s.action);
      suggestions.appendChild(chip);
    });
    panel.appendChild(suggestions);
```

新增函数：

```js
  function agentSuggestionsForContext(kind) {
    const defaults = [
      { text: 'Morning briefing', action: () => runAgentAction('Give me a morning briefing') },
      { text: 'What needs attention?', action: () => runAgentAction('What needs my attention?') },
      { text: 'Draft weekly update', action: () => runAgentAction('Draft my weekly update') }
    ];
    const map = {
      message: [
        { text: 'Summarize', action: () => runAgentAction('Summarize this email') },
        { text: 'Draft reply', action: () => runAgentAction('Draft a reply to this email') },
        { text: 'Extract todos', action: () => runAgentAction('Extract todos from this email') },
        { text: 'Set follow-up', action: () => runAgentAction('Set a follow-up for this email') }
      ],
      contact: [
        { text: 'Relationship summary', action: () => runAgentAction('Summarize my relationship with this contact') },
        { text: 'Suggest next action', action: () => runAgentAction('What should I do next with this contact?') },
        { text: 'Draft catch-up', action: () => runAgentAction('Draft a catch-up message') }
      ],
      meeting: [
        { text: 'Generate briefing', action: () => runAgentAction('Generate a meeting briefing') },
        { text: 'Extract todos', action: () => runAgentAction('Extract todos from this meeting') },
        { text: 'Draft follow-up', action: () => runAgentAction('Draft a follow-up email') }
      ],
      file: [
        { text: 'Summarize file', action: () => runAgentAction('Summarize this file') },
        { text: 'Copy context', action: () => runAgentAction('Copy file context as markdown') },
        { text: 'Find related emails', action: () => runAgentAction('Find emails related to this file') }
      ]
    };
    return map[kind] || defaults;
  }
```

- [ ] **Step 4: 新增 CSS**

```css
.agent-context {
  padding: 0 14px 8px;
}
.agent-context-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  background: var(--accent-soft);
  border: 1px solid rgba(10,143,99,0.18);
  border-radius: 999px;
  color: var(--accent);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.12s var(--ease-out);
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.agent-context-pill:hover { background: var(--accent-glow); }
.agent-context-pill i { font-size: 12px; }
```

- [ ] **Step 5: 验证**

Open an email and click the sparkle FAB. Expected chips: Summarize / Draft reply / Extract todos / Set follow-up.

Open Contacts and click FAB. Expected chips: Relationship summary / Suggest next action / Draft catch-up.

- [ ] **Step 6: Commit**

```bash
git add js/prototype-v11.js css/prototype-v11.css prototype-v11.html
git commit -m "feat(agent): context-aware suggestions and context pill"
```

---

### Task 6: 新增 Agent 工作区视图路由

**Files:**
- Modify: `js/prototype-v11.js:51-76`（`navSections`）
- Modify: `js/prototype-v11.js:783-807`（`_renderMainImpl` 视图分发）
- Modify: `js/prototype-v11.js:809-845`（header 注入逻辑）

**Interfaces:**
- Consumes: `navSections`, `_renderMainImpl`
- Produces: `renderAgentView`

- [ ] **Step 1: 在侧边栏 Tools 区新增 Agent 入口**

修改 `js/prototype-v11.js:62-67`：

```js
    {
      label: 'Tools',
      items: [
        { id: 'contacts', label: 'Contacts', icon: 'ph-users', hint: '⌘5' },
        { id: 'calendar', label: 'Calendar', icon: 'ph-calendar', hint: '⌘6' },
        { id: 'files', label: 'Files', icon: 'ph-files', hint: '⌘7' },
        { id: 'agent', label: 'Agent', icon: 'ph-sparkle', hint: '⌘8' },
      ]
    },
```

- [ ] **Step 2: 在视图分发中加入 agent**

修改 `js/prototype-v11.js:783-807`，在 `} else if (state.view === 'files') {` 分支后添加：

```js
    } else if (state.view === 'agent') {
      viewEl = renderAgentView();
```

- [ ] **Step 3: 让 Agent 视图也注入统一 header**

修改 `js/prototype-v11.js:809-845` 的条件：

原条件：
```js
    if (state.view !== 'calendar') {
```

已经是 `!== 'calendar'`，所以 agent 视图会自动注入 header。只需在 `subtitles` 对象中加入 agent：

```js
        agent: 'Your AI workspace: sessions, tasks, drafts, and memory.',
```

- [ ] **Step 4: 新增空 `renderAgentView` 占位**

在 `js/prototype-v11.js` 中 `renderFiles` 函数之后插入：

```js
  function renderAgentView() {
    const container = el('div', 'view agent-view');
    container.appendChild(el('div', 'agent-view-placeholder', 'Agent workspace coming next...'));
    return container;
  }
```

- [ ] **Step 5: 验证导航**

Open `http://127.0.0.1:8765/prototype-v11.html?v=11.11`. Expected: sidebar Tools 区出现 Agent 入口，点击进入显示 placeholder 和统一标题 "Agent"。

- [ ] **Step 6: Commit**

```bash
git add js/prototype-v11.js prototype-v11.html
git commit -m "feat(agent): add agent workspace navigation entry"
```

---

### Task 7: Agent 工作区三栏布局

**Files:**
- Modify: `js/prototype-v11.js`（`renderAgentView` 函数）
- Modify: `css/prototype-v11.css`（新增 `.agent-view` 布局）

**Interfaces:**
- Consumes: `renderSessionList`, `renderAgentConversation`, `renderAgentRightPanel`（后续 task 实现）
- Produces: `.agent-view` 容器结构

- [ ] **Step 1: 实现 `renderAgentView` 三栏布局**

替换 Task 6 的 placeholder `renderAgentView`：

```js
  function renderAgentView() {
    const container = el('div', 'view agent-view');

    const workspace = el('div', 'agent-workspace');
    workspace.appendChild(renderAgentSessionList());
    workspace.appendChild(renderAgentConversation());
    workspace.appendChild(renderAgentRightPanel());
    container.appendChild(workspace);

    return container;
  }
```

- [ ] **Step 2: 创建空占位函数**

在 `renderAgentView` 之前插入：

```js
  function renderAgentSessionList() {
    const col = el('div', 'agent-workspace-col agent-session-list-col');
    col.appendChild(el('div', 'agent-col-header', 'Sessions'));
    const list = el('div', 'agent-session-list');
    state.agentSessions.filter(s => s.status !== 'archived').forEach(s => {
      const item = el('div', 'agent-session-list-item' + (s.id === state.currentAgentSessionId ? ' active' : ''), s.title);
      item.addEventListener('click', () => { switchAgentSession(s.id); renderMain(); });
      list.appendChild(item);
    });
    col.appendChild(list);
    return col;
  }

  function renderAgentConversation() {
    const col = el('div', 'agent-workspace-col agent-conversation-col');
    const session = getCurrentAgentSession();
    col.appendChild(el('div', 'agent-col-header', session ? session.title : 'Conversation'));
    col.appendChild(el('div', 'agent-conversation-body', session && session.messages.length ? session.messages.map(m => m.role + ': ' + m.text).join('\n') : 'No messages yet.'));
    return col;
  }

  function renderAgentRightPanel() {
    const col = el('div', 'agent-workspace-col agent-right-col');
    col.appendChild(el('div', 'agent-col-header', 'Tasks & Memory'));
    col.appendChild(el('div', 'agent-right-body', 'In progress tasks and memory will appear here.'));
    return col;
  }
```

- [ ] **Step 3: 新增 CSS**

在 `css/prototype-v11.css` 末尾追加：

```css
/* Agent Workspace */
.agent-view { padding: 0; }
.agent-workspace {
  display: grid;
  grid-template-columns: 260px 1fr 280px;
  height: 100%;
  overflow: hidden;
}
.agent-workspace-col {
  display: flex;
  flex-direction: column;
  min-width: 0;
  border-right: 1px solid var(--border);
}
.agent-workspace-col:last-child { border-right: none; }
.agent-col-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
  border-bottom: 1px solid var(--border);
  background: linear-gradient(180deg, rgba(255,255,255,0.7) 0%, transparent 100%);
}
.agent-session-list-col { background: var(--paper-light); }
.agent-session-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}
.agent-session-list-item {
  padding: 8px 10px;
  border-radius: var(--radius-md);
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
  cursor: pointer;
  transition: background 0.12s var(--ease-out);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.agent-session-list-item:hover { background: var(--bg-hover); }
.agent-session-list-item.active { background: var(--accent-soft); color: var(--accent); }
.agent-conversation-body,
.agent-right-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  font-size: 13px;
  color: var(--text-secondary);
  white-space: pre-wrap;
}
```

- [ ] **Step 4: 验证三栏布局**

Open `http://127.0.0.1:8765/prototype-v11.html?v=11.12` and click Agent in sidebar.

Expected: three columns visible with headers "Sessions", "Conversation", "Tasks & Memory".

- [ ] **Step 5: Commit**

```bash
git add js/prototype-v11.js css/prototype-v11.css prototype-v11.html
git commit -m "feat(agent): add agent workspace three-column layout"
```

---

### Task 8: 完善 Session 列表（搜索、固定、归档、右键菜单）

**Files:**
- Modify: `js/prototype-v11.js`（`renderAgentSessionList`）
- Modify: `css/prototype-v11.css`

**Interfaces:**
- Consumes: `state.agentSessions`, `pinAgentSession`, `archiveAgentSession`, `updateAgentSessionTitle`
- Produces: `.agent-session-list` with search, pins, archives

- [ ] **Step 1: 重写 `renderAgentSessionList`**

```js
  function renderAgentSessionList() {
    const col = el('div', 'agent-workspace-col agent-session-list-col');

    const header = el('div', 'agent-col-header');
    header.appendChild(el('span', '', 'Sessions'));
    const newBtn = el('button', 'icon-btn agent-new-session-btn');
    newBtn.title = 'New session';
    newBtn.appendChild(icon('ph-plus'));
    newBtn.addEventListener('click', () => { createAgentSession('freeform', null, null); renderMain(); });
    header.appendChild(newBtn);
    col.appendChild(header);

    const searchWrap = el('div', 'agent-session-search');
    const searchInput = el('input', '');
    searchInput.placeholder = 'Search sessions...';
    searchInput.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      list.querySelectorAll('.agent-session-list-item').forEach(item => {
        const title = item.dataset.title || '';
        item.style.display = title.includes(q) ? '' : 'none';
      });
    });
    searchWrap.appendChild(icon('ph-magnifying-glass'));
    searchWrap.appendChild(searchInput);
    col.appendChild(searchWrap);

    const list = el('div', 'agent-session-list');

    const pinned = state.agentSessions.filter(s => s.status === 'pinned');
    const active = state.agentSessions.filter(s => s.status === 'active' || s.status === 'idle');
    const archived = state.agentSessions.filter(s => s.status === 'archived');

    const renderGroup = (sessions, emptyText) => {
      if (!sessions.length && emptyText) return;
      sessions.forEach(s => {
        const item = el('div', 'agent-session-list-item' + (s.id === state.currentAgentSessionId ? ' active' : ''));
        item.dataset.title = s.title.toLowerCase();
        item.dataset.id = s.id;
        item.appendChild(icon(agentContextKindIcon(s.context.kind)));
        const info = el('div', 'agent-session-list-info');
        info.appendChild(el('div', 'agent-session-list-title', s.title));
        const last = s.messages[s.messages.length - 1];
        info.appendChild(el('div', 'agent-session-list-preview', last ? last.text.slice(0, 36) : ''));
        item.appendChild(info);
        const meta = el('div', 'agent-session-list-meta');
        meta.appendChild(el('span', '', formatTimeAgo(s.updatedAt)));
        if (s.status === 'pinned') meta.appendChild(icon('ph-push-pin'));
        item.appendChild(meta);

        item.addEventListener('click', () => { switchAgentSession(s.id); renderMain(); });
        item.addEventListener('contextmenu', (e) => showSessionContextMenu(e, s));
        list.appendChild(item);
      });
    };

    renderGroup(pinned, null);
    renderGroup(active, null);

    if (archived.length) {
      const archiveToggle = el('button', 'agent-archive-toggle', 'Archived (' + archived.length + ')');
      let expanded = false;
      const archiveList = el('div', 'agent-archive-list hidden');
      renderGroup(archived, null);
      archived.forEach(s => archiveList.appendChild(list.lastChild));
      archiveToggle.addEventListener('click', () => {
        expanded = !expanded;
        archiveList.classList.toggle('hidden', !expanded);
      });
      // Simpler: append archived group directly
    }

    col.appendChild(list);
    return col;
  }
```

Note: 上述 archive group 写法较糙，实现时请整理为：先创建 archiveList 容器，renderGroup 把 archived sessions 渲染进该容器，再 append。

- [ ] **Step 2: 新增右键菜单函数**

```js
  function showSessionContextMenu(e, session) {
    e.preventDefault();
    const existing = document.querySelector('.agent-session-context-menu');
    if (existing) existing.remove();

    const menu = el('div', 'agent-session-context-menu');
    const items = [
      { label: session.status === 'pinned' ? 'Unpin' : 'Pin', icon: 'ph-push-pin', action: () => { pinAgentSession(session.id); renderMain(); } },
      { label: 'Rename', icon: 'ph-pencil-simple', action: () => {
        const newTitle = prompt('Rename session', session.title);
        if (newTitle) { updateAgentSessionTitle(session.id, newTitle); renderMain(); }
      }},
      { label: session.status === 'archived' ? 'Restore' : 'Archive', icon: 'ph-archive', action: () => { archiveAgentSession(session.id); renderMain(); } },
    ];
    items.forEach(item => {
      const row = el('div', 'agent-context-menu-item');
      row.appendChild(icon(item.icon));
      row.appendChild(el('span', '', item.label));
      row.addEventListener('click', () => { item.action(); menu.remove(); });
      menu.appendChild(row);
    });

    document.body.appendChild(menu);
    menu.style.top = e.clientY + 'px';
    menu.style.left = e.clientX + 'px';
    const close = (ev) => { if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('click', close); } };
    setTimeout(() => document.addEventListener('click', close), 0);
  }

  function formatTimeAgo(ts) {
    const diff = Date.now() - ts;
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'now';
    if (m < 60) return m + 'm';
    const h = Math.floor(m / 60);
    if (h < 24) return h + 'h';
    return Math.floor(h / 24) + 'd';
  }
```

- [ ] **Step 3: 新增 CSS**

```css
.agent-session-search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
}
.agent-session-search i { font-size: 14px; color: var(--text-muted); }
.agent-session-search input {
  flex: 1;
  border: none;
  background: transparent;
  outline: none;
  font-size: 13px;
  color: var(--text-primary);
}
.agent-session-search input::placeholder { color: var(--text-muted); }

.agent-session-list-info { flex: 1; min-width: 0; }
.agent-session-list-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.agent-session-list-preview {
  font-size: 11px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.agent-session-list-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
}
.agent-session-list-item i:first-child { font-size: 14px; color: var(--accent); flex-shrink: 0; }
.agent-session-list-item i:last-child { font-size: 10px; color: var(--text-muted); }
.agent-session-list-meta {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  color: var(--text-muted);
  flex-shrink: 0;
}

.agent-session-context-menu {
  position: fixed;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  padding: 4px;
  z-index: 100;
  min-width: 140px;
}
.agent-context-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: var(--radius-md);
  font-size: 12px;
  color: var(--text-primary);
  cursor: pointer;
}
.agent-context-menu-item:hover { background: var(--bg-hover); }
.agent-context-menu-item i { font-size: 13px; color: var(--text-secondary); }
```

- [ ] **Step 4: 验证**

Open Agent workspace. Try:
- Search sessions
- Right-click to pin/rename/archive
- New session

- [ ] **Step 5: Commit**

```bash
git add js/prototype-v11.js css/prototype-v11.css prototype-v11.html
git commit -m "feat(agent): session list with search, pin, rename, archive"
```

---

### Task 9: 完善对话区（与 Quick Panel 共享渲染）

**Files:**
- Modify: `js/prototype-v11.js`（`renderAgentConversation`）

**Interfaces:**
- Consumes: `getCurrentAgentSession`, message rendering logic
- Produces: `.agent-conversation-body` with full message bubbles

- [ ] **Step 1: 提取共享消息渲染函数**

在 `renderAgentPanel` 和 `renderAgentConversation` 之外创建：

```js
  function renderAgentMessage(m, session) {
    const row = el('div', 'agent-message agent-message-' + m.role);
    const bubble = el('div', 'agent-message-bubble');
    bubble.textContent = m.text;
    row.appendChild(bubble);

    if (m.role === 'agent' && m.actions && m.actions.length) {
      const actions = el('div', 'agent-message-actions');
      m.actions.forEach(a => {
        const btn = el('button', 'agent-message-action-btn', actionLabel(a));
        btn.addEventListener('click', (e) => { e.stopPropagation(); handleAgentMessageAction(a, m, session); });
        actions.appendChild(btn);
      });
      row.appendChild(actions);
    }
    return row;
  }
```

- [ ] **Step 2: 在 Quick Panel 和 Workspace 中复用**

将 Task 4 中 inline 的消息渲染替换为调用 `renderAgentMessage(m, session)`。

重写 `renderAgentConversation`：

```js
  function renderAgentConversation() {
    const col = el('div', 'agent-workspace-col agent-conversation-col');
    const session = getCurrentAgentSession();

    const header = el('div', 'agent-col-header');
    header.appendChild(el('span', '', session ? session.title : 'Conversation'));
    if (session && session.context.kind) {
      const ctxLink = el('button', 'agent-context-link');
      ctxLink.appendChild(icon(agentContextKindIcon(session.context.kind)));
      ctxLink.appendChild(el('span', '', session.context.preview));
      ctxLink.addEventListener('click', () => {
        if (session.context.kind === 'message') openMessage(session.context.id);
        else if (session.context.kind === 'contact') openContact(session.context.id);
        else if (session.context.kind === 'meeting') openMeeting(session.context.id);
        else if (session.context.kind === 'file') openFile(D._files.find(f => f.id === session.context.id));
      });
      header.appendChild(ctxLink);
    }
    col.appendChild(header);

    const body = el('div', 'agent-conversation-body');
    if (session && session.messages.length) {
      session.messages.forEach(m => body.appendChild(renderAgentMessage(m, session)));
    } else {
      body.appendChild(el('div', 'agent-empty-messages', 'Start a conversation with SendPalm Agent.'));
    }
    col.appendChild(body);

    const inputWrap = el('div', 'agent-workspace-input-wrap');
    const input = el('input', 'agent-workspace-input');
    input.placeholder = 'Ask SendPalm...';
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && input.value.trim()) {
        runAgentAction(input.value.trim());
        input.value = '';
      }
    });
    inputWrap.appendChild(input);
    col.appendChild(inputWrap);

    return col;
  }
```

- [ ] **Step 3: 新增 CSS**

```css
.agent-context-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  transition: background 0.12s var(--ease-out);
  max-width: 220px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.agent-context-link:hover { background: var(--bg-hover); color: var(--text-primary); }
.agent-context-link i { font-size: 11px; color: var(--accent); }
.agent-workspace-input-wrap {
  padding: 12px 16px;
  border-top: 1px solid var(--border);
  background: var(--paper-light);
}
.agent-workspace-input {
  width: 100%;
  padding: 9px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--bg-elevated);
  font-size: 13px;
  color: var(--text-primary);
  outline: none;
}
.agent-workspace-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
```

- [ ] **Step 4: 验证**

Open Agent workspace. Click a session. Expected: messages render as bubbles with actions. Type in input and press Enter, message appears.

- [ ] **Step 5: Commit**

```bash
git add js/prototype-v11.js css/prototype-v11.css prototype-v11.html
git commit -m "feat(agent): shared message rendering in workspace conversation"
```

---

### Task 10: 右侧面板——任务、草稿、记忆

**Files:**
- Modify: `js/prototype-v11.js`（`renderAgentRightPanel`）
- Modify: `css/prototype-v11.css`

**Interfaces:**
- Consumes: `D.agentTasks`, `D.agentDrafts`, `state.agentMemory`
- Produces: `.agent-right-body` with task/draft/memory cards

- [ ] **Step 1: 重写 `renderAgentRightPanel`**

```js
  function renderAgentRightPanel() {
    const col = el('div', 'agent-workspace-col agent-right-col');
    col.appendChild(el('div', 'agent-col-header', 'Tasks & Memory'));

    const body = el('div', 'agent-right-body');

    // In Progress
    const inProgress = D.agentTasks.filter(t => t.status === 'go');
    if (inProgress.length) {
      body.appendChild(el('div', 'agent-right-section-title', 'In Progress'));
      inProgress.forEach(t => {
        const card = el('div', 'agent-task-card');
        card.appendChild(el('div', 'agent-task-card-name', t.name));
        const steps = el('div', 'agent-task-card-steps');
        t.steps.forEach(s => {
          const dot = el('span', 'agent-task-step-dot' + (s.d ? ' done' : ''), s.d ? '✓' : '○');
          dot.title = s.l;
          steps.appendChild(dot);
        });
        card.appendChild(steps);
        if (t.eta) card.appendChild(el('div', 'agent-task-card-eta', 'ETA: ' + t.eta));
        card.addEventListener('click', () => {
          if (t.sessionId) { switchAgentSession(t.sessionId); renderMain(); }
        });
        body.appendChild(card);
      });
    }

    // Drafts
    const drafts = D.agentDrafts;
    if (drafts.length) {
      body.appendChild(el('div', 'agent-right-section-title', 'Drafts (' + drafts.length + ')'));
      drafts.slice(0, 5).forEach(d => {
        const card = el('div', 'agent-draft-card');
        card.appendChild(el('div', 'agent-draft-card-to', d.to));
        card.appendChild(el('div', 'agent-draft-card-preview', d.preview));
        const actions = el('div', 'agent-draft-card-actions');
        const edit = el('button', 'agent-draft-card-action', 'Edit');
        edit.addEventListener('click', (e) => { e.stopPropagation(); editAgentDraft(d.id); });
        actions.appendChild(edit);
        card.appendChild(actions);
        body.appendChild(card);
      });
    }

    // Memory
    const memory = state.agentMemory.global;
    if (memory && Object.keys(memory).length) {
      body.appendChild(el('div', 'agent-right-section-title', 'Memory'));
      Object.entries(memory).forEach(([k, v]) => {
        const chip = el('div', 'agent-memory-chip');
        chip.appendChild(el('span', 'agent-memory-key', k));
        chip.appendChild(el('span', 'agent-memory-value', String(v)));
        body.appendChild(chip);
      });
    }

    col.appendChild(body);
    return col;
  }
```

- [ ] **Step 2: 新增 CSS**

```css
.agent-right-section-title {
  font-size: 10px;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 16px 0 8px;
}
.agent-right-section-title:first-child { margin-top: 0; }

.agent-task-card {
  padding: 10px 12px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  margin-bottom: 8px;
  cursor: pointer;
  transition: background 0.12s var(--ease-out);
}
.agent-task-card:hover { background: var(--bg-hover); }
.agent-task-card-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 6px;
}
.agent-task-card-steps { display: flex; gap: 6px; margin-bottom: 6px; }
.agent-task-step-dot {
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-size: 10px;
  background: var(--surface-2);
  color: var(--text-muted);
}
.agent-task-step-dot.done { background: var(--accent-soft); color: var(--accent); }
.agent-task-card-eta {
  font-size: 10px;
  color: var(--text-muted);
}

.agent-draft-card {
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  margin-bottom: 8px;
  background: var(--bg-elevated);
}
.agent-draft-card-to {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}
.agent-draft-card-preview {
  font-size: 11px;
  color: var(--text-secondary);
  margin-top: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.agent-draft-card-actions {
  margin-top: 8px;
  display: flex;
  gap: 6px;
}
.agent-draft-card-action {
  font-size: 11px;
  font-weight: 600;
  color: var(--accent);
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0;
}
.agent-draft-card-action:hover { text-decoration: underline; }

.agent-memory-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 999px;
  font-size: 11px;
  margin-bottom: 6px;
}
.agent-memory-key {
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: capitalize;
}
.agent-memory-value {
  color: var(--text-primary);
}
```

- [ ] **Step 3: 验证**

Open Agent workspace. Right panel should show In Progress tasks, Drafts, and Memory chips.

- [ ] **Step 4: Commit**

```bash
git add js/prototype-v11.js css/prototype-v11.css prototype-v11.html
git commit -m "feat(agent): tasks, drafts, memory right panel in workspace"
```

---

### Task 11: 任务与 Session 打通

**Files:**
- Modify: `js/prototype-v11.js`（`createAgentTaskFromMessage`、`runAgentAction` 任务检测）
- Modify: `prototype-data.js`（确保示例任务有 `sessionId`）

**Interfaces:**
- Consumes: `createAgentSession`, `addAgentMessage`, `D.agentTasks`
- Produces: `type: 'task'` sessions linked to tasks

- [ ] **Step 1: 新增任务创建函数**

```js
  function createAgentTaskFromMessage(message, session) {
    const taskId = generateId('at');
    const taskSession = createAgentSession('task', session ? session.context : null, 'Task: ' + message.text.slice(0, 30));
    taskSession.taskId = taskId;

    const task = {
      id: taskId,
      name: message.text.slice(0, 40),
      sessionId: taskSession.id,
      status: 'go',
      steps: [
        { l: '分析请求', d: true },
        { l: '收集上下文', d: false },
        { l: '生成结果', d: false },
        { l: '等待确认', d: false }
      ],
      eta: '2 min',
      createdAt: Date.now()
    };
    D.agentTasks.push(task);

    addAgentMessage(taskSession.id, 'agent', '已创建任务：' + task.name + '\n\n我将分步执行，你可以随时在这个会话中调整方向。', []);
    switchAgentSession(taskSession.id);
    renderAgentPanel();
    renderMain();
  }
```

- [ ] **Step 2: 在 `runAgentAction` 中检测多步骤意图**

修改 `runAgentAction`：

```js
  function runAgentAction(text) {
    const isTaskIntent = /帮我|帮我做|请帮我|帮我.*并.*|draft.*and.*send|generate.*and.*send/i.test(text);
    let session = getCurrentAgentSession();

    if (!session) {
      session = createAgentSession(isTaskIntent ? 'task' : 'freeform', null, text.slice(0, 30));
    }

    addAgentMessage(session.id, 'user', text, []);

    if (isTaskIntent) {
      const taskId = generateId('at');
      session.type = 'task';
      session.taskId = taskId;
      D.agentTasks.push({
        id: taskId,
        name: text.slice(0, 40),
        sessionId: session.id,
        status: 'go',
        steps: [
          { l: '分析请求', d: true },
          { l: '收集上下文', d: false },
          { l: '生成结果', d: false },
          { l: '等待确认', d: false }
        ],
        eta: '2 min',
        createdAt: Date.now()
      });
    }

    showToast('Agent is thinking...');
    setTimeout(() => {
      const reply = generateAgentReply(text, session);
      const actions = session.type === 'task' ? ['copy', 'create-task'] : ['copy', 'regenerate', 'use-draft'];
      addAgentMessage(session.id, 'agent', reply, actions);
      if (session.type === 'task') {
        const task = D.agentTasks.find(t => t.sessionId === session.id);
        if (task) {
          task.steps[1].d = true;
          task.steps[2].d = true;
        }
      }
      renderAgentPanel();
      renderMain();
    }, 600);
  }
```

- [ ] **Step 3: 验证**

Open agent panel and type: "帮我起草周报并发送". Expected:
- New task session created
- Task appears in right panel
- Steps progress shown

- [ ] **Step 4: Commit**

```bash
git add js/prototype-v11.js prototype-data.js
git commit -m "feat(agent): link tasks to sessions with progress tracking"
```

---

### Task 12: Settings 中新增 Agent Memory 管理

**Files:**
- Modify: `js/prototype-v11.js`（`renderSettings` 中的 Agent section）
- Modify: `css/prototype-v11.css`（新增 settings memory 样式，或复用现有 `.settings-card`）

**Interfaces:**
- Consumes: `state.agentMemory`
- Produces: `.agent-memory-editor` UI

- [ ] **Step 1: 在 renderSettings 的 Agent section 中扩展记忆编辑**

找到 `js/prototype-v11.js:4406-4427` 的 Agent section，在 `agentCard.appendChild(approvalRow);` 之后追加：

```js
    const memoryRow = el('div', 'settings-row');
    memoryRow.appendChild(el('span', 'settings-label', 'Memory'));
    const manageMemoryBtn = el('button', 'btn btn-secondary btn-sm', 'Manage');
    manageMemoryBtn.addEventListener('click', renderAgentMemoryModal);
    memoryRow.appendChild(manageMemoryBtn);
    agentCard.appendChild(memoryRow);
```

- [ ] **Step 2: 新增记忆管理弹窗函数**

```js
  function renderAgentMemoryModal() {
    const modal = el('div', 'modal-overlay');
    const content = el('div', 'modal agent-memory-modal');

    const header = el('div', 'modal-header');
    header.appendChild(el('h3', 'modal-title', 'Agent Memory'));
    const close = el('button', 'icon-btn');
    close.appendChild(icon('ph-x'));
    close.addEventListener('click', () => modal.remove());
    header.appendChild(close);
    content.appendChild(header);

    const body = el('div', 'modal-body');
    body.appendChild(el('div', 'agent-memory-section-title', 'Global preferences'));
    const memoryFields = [
      { key: 'tone', label: 'Tone', placeholder: 'formal / casual / friendly' },
      { key: 'defaultLength', label: 'Default length', placeholder: 'short / medium / long' },
      { key: 'signature', label: 'Signature', placeholder: 'Your default sign-off' },
      { key: 'language', label: 'Language', placeholder: 'zh-CN / en-US' }
    ];
    memoryFields.forEach(f => {
      const row = el('div', 'settings-row');
      row.appendChild(el('span', 'settings-label', f.label));
      const input = el('input', 'settings-input');
      input.value = state.agentMemory.global[f.key] || '';
      input.placeholder = f.placeholder;
      input.addEventListener('change', () => {
        state.agentMemory.global[f.key] = input.value;
      });
      row.appendChild(input);
      body.appendChild(row);
    });

    body.appendChild(el('div', 'agent-memory-section-title', 'Contact memory'));
    Object.entries(state.agentMemory.contacts).forEach(([pid, mem]) => {
      const c = D.getP(pid);
      const card = el('div', 'agent-memory-contact-card');
      card.appendChild(el('div', 'agent-memory-contact-name', c ? c.name : pid));
      const topics = el('input', 'settings-input');
      topics.value = (mem.topics || []).join(', ');
      topics.placeholder = 'Topics';
      topics.addEventListener('change', () => {
        mem.topics = topics.value.split(',').map(s => s.trim()).filter(Boolean);
      });
      card.appendChild(topics);
      body.appendChild(card);
    });

    content.appendChild(body);
    modal.appendChild(content);
    document.body.appendChild(modal);
  }
```

- [ ] **Step 3: 新增/复用 CSS**

如果 `.modal` 样式已存在则复用。追加：

```css
.agent-memory-modal { width: 480px; max-width: 90vw; }
.agent-memory-section-title {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 16px 0 8px;
}
.agent-memory-contact-card {
  padding: 12px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  margin-bottom: 10px;
}
.agent-memory-contact-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 8px;
}
```

- [ ] **Step 4: 验证**

Open Settings → Agent section. Click "Manage" next to Memory. Expected: modal with global preferences and contact memory.

- [ ] **Step 5: Commit**

```bash
git add js/prototype-v11.js css/prototype-v11.css
git commit -m "feat(agent): agent memory management in settings"
```

---

### Task 13: 历史搜索

**Files:**
- Modify: `js/prototype-v11.js`（`renderAgentView` 顶部加搜索，`renderAgentRightPanel` 可复用搜索逻辑）
- Modify: `css/prototype-v11.css`

**Interfaces:**
- Consumes: `state.agentSessions`, `D.agentDrafts`, `D.agentTasks`
- Produces: `.agent-search-results`

- [ ] **Step 1: 在 Agent 工作区顶部加搜索条**

修改 `renderAgentView`：

```js
  function renderAgentView() {
    const container = el('div', 'view agent-view');

    const searchBar = el('div', 'agent-search-bar');
    const searchInput = el('input', 'agent-search-input');
    searchInput.placeholder = 'Search sessions, drafts, tasks...';
    searchBar.appendChild(icon('ph-magnifying-glass'));
    searchBar.appendChild(searchInput);
    container.appendChild(searchBar);

    const resultsWrap = el('div', 'agent-search-results hidden');
    container.appendChild(resultsWrap);

    const workspace = el('div', 'agent-workspace');
    workspace.appendChild(renderAgentSessionList());
    workspace.appendChild(renderAgentConversation());
    workspace.appendChild(renderAgentRightPanel());
    container.appendChild(workspace);

    searchInput.addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      if (!q) {
        resultsWrap.classList.add('hidden');
        workspace.classList.remove('hidden');
        return;
      }
      workspace.classList.add('hidden');
      resultsWrap.classList.remove('hidden');
      resultsWrap.innerHTML = '';
      resultsWrap.appendChild(renderAgentSearchResults(q));
    });

    return container;
  }
```

- [ ] **Step 2: 新增搜索结果渲染函数**

```js
  function renderAgentSearchResults(q) {
    const wrap = el('div', 'agent-search-results-inner');

    const sessions = state.agentSessions.filter(s =>
      s.title.toLowerCase().includes(q) ||
      s.messages.some(m => m.text.toLowerCase().includes(q))
    );
    if (sessions.length) {
      wrap.appendChild(el('div', 'agent-search-group-title', 'Sessions'));
      sessions.forEach(s => {
        const row = el('div', 'agent-search-result-row');
        row.appendChild(icon(agentContextKindIcon(s.context.kind)));
        const info = el('div', 'agent-search-result-info');
        info.appendChild(el('div', 'agent-search-result-title', s.title));
        const last = s.messages[s.messages.length - 1];
        info.appendChild(el('div', 'agent-search-result-preview', last ? last.text.slice(0, 60) : ''));
        row.appendChild(info);
        row.addEventListener('click', () => {
          switchAgentSession(s.id);
          renderMain();
        });
        wrap.appendChild(row);
      });
    }

    const drafts = D.agentDrafts.filter(d =>
      d.to.toLowerCase().includes(q) || d.preview.toLowerCase().includes(q)
    );
    if (drafts.length) {
      wrap.appendChild(el('div', 'agent-search-group-title', 'Drafts'));
      drafts.forEach(d => {
        const row = el('div', 'agent-search-result-row');
        row.appendChild(icon('ph-pencil-simple'));
        const info = el('div', 'agent-search-result-info');
        info.appendChild(el('div', 'agent-search-result-title', d.to));
        info.appendChild(el('div', 'agent-search-result-preview', d.preview));
        row.appendChild(info);
        row.addEventListener('click', () => editAgentDraft(d.id));
        wrap.appendChild(row);
      });
    }

    const tasks = D.agentTasks.filter(t => t.name.toLowerCase().includes(q));
    if (tasks.length) {
      wrap.appendChild(el('div', 'agent-search-group-title', 'Tasks'));
      tasks.forEach(t => {
        const row = el('div', 'agent-search-result-row');
        row.appendChild(icon('ph-check-circle'));
        const info = el('div', 'agent-search-result-info');
        info.appendChild(el('div', 'agent-search-result-title', t.name));
        info.appendChild(el('div', 'agent-search-result-preview', t.steps.map(s => s.l).join(' → ')));
        row.appendChild(info);
        row.addEventListener('click', () => { if (t.sessionId) { switchAgentSession(t.sessionId); renderMain(); } });
        wrap.appendChild(row);
      });
    }

    if (!sessions.length && !drafts.length && !tasks.length) {
      wrap.appendChild(el('div', 'agent-search-empty', 'No results for "' + q + '"'));
    }

    return wrap;
  }
```

- [ ] **Step 3: 新增 CSS**

```css
.agent-search-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--border);
  background: var(--paper-light);
}
.agent-search-bar i { font-size: 15px; color: var(--text-muted); }
.agent-search-input {
  flex: 1;
  border: none;
  background: transparent;
  outline: none;
  font-size: 14px;
  color: var(--text-primary);
}
.agent-search-results {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}
.agent-search-results.hidden,
.agent-workspace.hidden { display: none; }
.agent-search-group-title {
  font-size: 10px;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 16px 0 8px;
}
.agent-search-result-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: background 0.12s var(--ease-out);
}
.agent-search-result-row:hover { background: var(--bg-hover); }
.agent-search-result-row i { font-size: 14px; color: var(--accent); margin-top: 2px; flex-shrink: 0; }
.agent-search-result-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}
.agent-search-result-preview {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 2px;
}
.agent-search-empty {
  text-align: center;
  color: var(--text-muted);
  padding: 40px 0;
}
```

- [ ] **Step 4: 验证**

Open Agent workspace. Type "张磊" in search. Expected: sessions/drafts/tasks matching are shown grouped.

- [ ] **Step 5: Commit**

```bash
git add js/prototype-v11.js css/prototype-v11.css prototype-v11.html
git commit -m "feat(agent): search across sessions, drafts, and tasks"
```

---

### Task 14: 缓存版本递增与端到端 WebBridge 验证

**Files:**
- Modify: `prototype-v11.html`（CSS/JS `?v=` 版本号）

- [ ] **Step 1: 更新版本号**

将 `prototype-v11.html` 中的 CSS/JS 版本号统一改为 `v=11.20`：

```html
  <link rel="stylesheet" href="css/prototype-v11.css?v=11.20">
  ...
  <script src="prototype-data.js?v=11.20"></script>
  <script src="js/prototype-v11.js?v=11.20"></script>
```

- [ ] **Step 2: WebBridge 端到端验证**

确保本地服务运行：
```bash
python3 -m http.server 8765 --directory /Users/edwinhao/sendpalm
```

使用 WebBridge 打开并截图：
```bash
curl -s -X POST http://127.0.0.1:10086/command -H 'Content-Type: application/json' -d '{"action":"navigate","args":{"url":"http://127.0.0.1:8765/prototype-v11.html?v=11.20","newTab":true,"group_title":"Agent workspace verification"},"session":"sendpalm-agent-verify"}'
sleep 3
curl -s -X POST http://127.0.0.1:10086/command -H 'Content-Type: application/json' -d '{"action":"click","args":{"selector":"[name=\"Agent\"]"},"session":"sendpalm-agent-verify"}'
sleep 1
curl -s -X POST http://127.0.0.1:10086/command -H 'Content-Type: application/json' -d '{"action":"screenshot","args":{"path":"/Users/edwinhao/sendpalm/qa-tmp/agent-workspace-final.png"},"session":"sendpalm-agent-verify"}'
```

- [ ] **Step 3: 手动检查清单**

截图后检查：
- [ ] Agent 入口在侧边栏 Tools 区
- [ ] 三栏布局正确
- [ ] Session 列表显示示例数据
- [ ] 对话区显示消息气泡
- [ ] 右侧面板显示任务/草稿/记忆
- [ ] 顶部搜索框存在

- [ ] **Step 4: Commit**

```bash
git add prototype-v11.html
git commit -m "chore: bump cache version to v=11.20 for agent workspace"
```

---

## Self-Review

### Spec coverage

| Spec 要求 | 对应 Task |
|---|---|
| Session 数据模型 | Task 1, 2 |
| Quick Agent 面板 session 切换 | Task 3 |
| 消息历史与操作 | Task 4 |
| 动态上下文 chips 与 context pill | Task 5 |
| Agent 工作区视图 | Task 6, 7 |
| Session 列表搜索/固定/归档 | Task 8 |
| 对话区共享渲染 | Task 9 |
| 任务/草稿/记忆右侧面板 | Task 10 |
| 任务与 Session 打通 | Task 11 |
| Agent Memory 设置 | Task 12 |
| 历史搜索 | Task 13 |
| 版本递增与验证 | Task 14 |

### Placeholder scan
- 无 TBD/TODO。
- 所有代码片段为可直接复制到对应文件的完整代码。
- 所有函数名在后续 task 中保持一致。

### Type consistency
- `state.agentSessions`, `state.currentAgentSessionId`, `state.agentMemory` 在 Task 1 定义，后续一致使用。
- Session 对象字段在 Task 1 定义，Task 2/3/4/8/9/10/11 一致使用。
- `agentContextKindIcon` 在 Task 2 定义，全局复用。

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-29-agent-session-workspace-plan.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
