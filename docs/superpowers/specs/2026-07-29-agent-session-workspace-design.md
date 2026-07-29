# Agent Session & Workspace 优化设计（prototype-v11）

> 目标：在现有 prototype-v11 基础上完善 AI 服务体验，引入可管理的 Agent Session 体系，并新增 Agent 工作区视图。
> 状态：设计稿待实现

---

## 1. 背景与问题

当前 prototype-v11 的 Agent 能力已具备雏形：
- 右下角 sparkle FAB 打开浮层面板
- 支持上下文感知（当前邮件/联系人/会议/文件）
- 提供 Summarize / Draft reply / Schedule meeting / Extract todos 快捷 chip
- 显示进行中的 Agent 任务步骤
- 设置里有 Agent auto-approval 选项

但存在明显体验缺口：
1. **没有 Session 概念**：所有对话在一个面板里连续发生，上下文会互相污染。
2. **历史不可查**：之前的 Agent 交互、生成的草稿、提取的待办无法回顾。
3. **任务与对话割裂**：任务进度只显示步骤，用户不能在任务会话里继续追问或修改方向。
4. **记忆不可见**：Agent 不记得用户偏好，用户也不知道 Agent 记住了什么。
5. **缺少全局工作区**：Agent 相关的草稿、任务、记忆分散在不同视图，没有统一入口。

---

## 2. 设计原则

参考 AI Chat UX 与 Agent UX 最佳实践：
- **Session 隔离**：不同主题必须分开，避免上下文累积导致回答质量下降。
- **上下文可见**：用户始终知道 Agent 当前基于什么上下文在回答。
- **任务透明**：Agent 执行多步骤任务时，展示步骤、预计耗时、可中断/可修改。
- **记忆可控**：Agent 记忆对用户可见、可编辑、可删除。
- **快速与深度并存**：浮层面板负责“就地提问”，工作区负责“全面管理”。

---

## 3. 整体架构

```
┌──────────────────────────────────────────────────────────────┐
│                         SendPalm App                          │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────┐  │
│  │ Quick Agent │    │ Agent View  │    │ Settings Agent  │  │
│  │  Panel      │    │ (Workspace) │    │  Memory         │  │
│  └──────┬──────┘    └──────┬──────┘    └─────────────────┘  │
│         │                  │                                  │
│         └──────────┬───────┘                                  │
│                    ▼                                          │
│         ┌─────────────────────┐                               │
│         │   Session Store     │                               │
│         │  (in-memory + D.)   │                               │
│         └─────────────────────┘                               │
└──────────────────────────────────────────────────────────────┘
```

---

## 4. Session 数据模型

### 4.1 Session 对象

```js
{
  id: "as-uuid",
  type: "contextual" | "freeform" | "task",  // 会话来源类型
  title: "张磊合同跟进",                      // AI 自动生成，用户可编辑
  context: {
    kind: "message" | "contact" | "meeting" | "file" | null,
    id: "msg-123",
    preview: "张磊 - 合同附件 - 验收标准 v2"
  },
  messages: [
    { role: "user", text: "帮我草拟回复", ts: 1722261600000 },
    { role: "agent", text: "...", actions: ["copy", "regenerate", "use-draft"], ts: 1722261605000 }
  ],
  taskId: "at-456",      // type === "task" 时关联的任务 ID
  memoryTags: ["formal-tone", "contract-focus"],
  status: "active" | "idle" | "archived" | "pinned",
  createdAt: 1722261600000,
  updatedAt: 1722261605000
}
```

### 4.2 会话类型

| 类型 | 触发方式 | 生命周期 | 示例 |
|---|---|---|---|
| `contextual` | 用户在具体邮件/联系人/会议/文件上唤起 Agent | 用户主动归档或 7 天无交互后归档 | 看邮件时问“总结这封邮件” |
| `freeform` | 用户从 Agent 视图点击“New session” | 同上 | “帮我规划下周工作安排” |
| `task` | 用户委托多步骤任务时自动创建 | 任务完成且用户确认后归档 | “起草周报并发送给团队” |

### 4.3 状态流转

```
active ──(30min 无交互)──► idle ──(7天)──► archived
   │                          │
   └──── 用户 pinned ────────┘      用户可手动恢复
```

---

## 5. Quick Agent 面板改造

### 5.1 布局

```
┌────────────────────────────────────┐
│  [session title ▼]     [+] [×]     │  ← header：可切换/新建/关闭
├────────────────────────────────────┤
│  Context: 张磊 - 合同附件...        │  ← 上下文 pill，可点击引用
├────────────────────────────────────┤
│  [Summarize] [Draft reply]         │  ← 动态快捷 chips
│  [Extract todos] [Set follow-up]   │
├────────────────────────────────────┤
│  User: 帮我草拟回复                │  ← 消息区
│  Agent: ...                        │
│       [Copy] [Regenerate] [Draft]  │  ← 消息操作
├────────────────────────────────────┤
│  [@] [Ask SendPalm...] [Send]      │  ← 输入区，支持 @ 引用
└────────────────────────────────────┘
```

### 5.2 行为

- **Session 下拉**：显示最近 5 个 active/idle session，点击切换；底部“New session”。
- **上下文 pill**：展示 `buildAgentContext()` 返回的内容；点击后把该上下文引用插入输入框。
- **动态 chips**：根据 `context.kind` 变化：
  - `message`：`Summarize / Draft reply / Extract todos / Set follow-up`
  - `contact`：`Relationship summary / Suggest next action / Draft catch-up`
  - `meeting`：`Generate briefing / Extract todos / Draft follow-up`
  - `file`：`Summarize file / Copy context / Find related emails`
  - `null`：`Morning briefing / What needs attention? / Draft weekly update`
- **消息操作**：每条 AI 回复下方显示 `Copy / Regenerate / Use as draft / Create task`。
- **输入 @ 引用**：弹出联系人/邮件/会议/文件搜索下拉（prototype 中先实现简化版）。

---

## 6. Agent 工作区视图

### 6.1 入口

在侧边栏 `Tools` 区新增 `Agent` 导航项（icon `ph-sparkle`），位置在 Files 之后。

### 6.2 三栏布局

```
┌──────────────┬──────────────────────────────┬─────────────────┐
│ Sessions     │ Conversation                 │ Task / Draft /  │
│              │                              │ Memory          │
│ [+ New]      │ User: ...                    │                 │
│ ───────────  │ Agent: ...                   │ ▶ In Progress   │
│ ⭐ 我的风格   │                              │   • 周报草稿     │
│ 📧 张磊合同   │ [input]                      │   • 会议纪要     │
│ 📅 下周会议   │                              │ ─────────────── │
│ 📄 Q4提案    │                              │ 📝 Drafts (3)   │
│ ...          │                              │   • 周报 v1      │
│ [Archived]   │                              │   • 张磊回复     │
│              │                              │ ─────────────── │
│              │                              │ 🧠 Memory       │
│              │                              │   • 正式语气     │
└──────────────┴──────────────────────────────┴─────────────────┘
```

### 6.3 左栏：Session 列表

- 顶部搜索框，实时过滤 session 标题。
- 列表按 `updatedAt` 倒序，pinned 置顶。
- 每个 session 项显示：图标（由 context.kind 决定）、标题、最后一条消息摘要、时间。
- 右键菜单：`Rename / Pin / Archive / Delete`。
- 底部可展开 `Archived` 分组。

### 6.4 中栏：对话区

- 与 Quick Agent 面板共享消息渲染逻辑。
- 顶部显示 session 标题和上下文对象（可点击跳转）。
- 支持无限滚动加载历史消息。

### 6.5 右栏：任务 / 草稿 / 记忆

**In Progress**：
- 列出 `D.agentTasks` 中状态为 `go` 的任务。
- 每个任务卡片展示步骤进度条、当前步骤名称、预计剩余时间。
- 点击任务进入对应的 task session。

**Drafts**：
- 聚合 `D.agentDrafts` 中未发送的草稿。
- 显示来源 session、目标联系人、生成时间。
- 操作：`Edit / Send / Discard`。

**Memory**：
- 显示最近自动提取的记忆标签和偏好。
- 每个记忆可 `Edit / Delete`。
- 底部 `Manage memory` 跳转到 Settings。

---

## 7. 任务与 Session 打通

### 7.1 任务创建

当用户输入包含“帮我...并...”等多步骤意图时，Agent：
1. 创建一个 `task` 类型 session。
2. 在 `D.agentTasks` 添加任务记录：
   ```js
   {
     id: "at-456",
     name: "起草并发送周报",
     sessionId: "as-uuid",
     status: "go",
     steps: [
       { l: "分析历史邮件", d: true },
       { l: "起草周报", d: false },
       { l: "等待审批", d: false },
       { l: "发送给团队", d: false }
     ],
     eta: "2 min",
     createdAt: 1722261600000
   }
   ```
3. 在 task session 里实时更新进度消息。

### 7.2 任务交互

- 用户可在 task session 中发送消息修改方向，例如“换成更正式的语气”“先不要发送”。
- 任务完成后，Agent 在 session 中生成总结卡片，包含交付物和后续建议。
- 任务失败或卡住时，Agent 主动说明原因并给出下一步选项。

---

## 8. 记忆与偏好

### 8.1 数据模型

```js
{
  global: {
    tone: "formal",           // formal | casual | friendly
    defaultLength: "medium",  // short | medium | long
    signature: "Best, Edwin",
    language: "zh-CN"
  },
  contacts: {
    "p-zhanglei": {
      topics: ["Q4合同", "付款条款"],
      preferences: ["喜欢数据驱动", "回复慢但决策快"],
      avoid: ["不要在周五下午发邮件"]
    }
  }
}
```

### 8.2 注入规则

- 每个 session 开始时，把 `global` 记忆作为 system context。
- 如果 session 绑定联系人，额外注入该联系人的记忆。
- 用户可在 Settings 的 `Agent Memory` 区域查看和编辑。

### 8.3 自动提取

Agent 在生成回复或完成任务后，自动提取潜在记忆：
- “用户把这段改得更正式了” → 更新 `tone: formal`
- “用户拒绝了周五下午发送” → 添加 avoid 规则
- 用户可一键确认或忽略。

---

## 9. 历史搜索

### 9.1 搜索范围

Agent 工作区顶部搜索框支持搜索：
- Session 标题和消息内容
- 生成的草稿（按联系人和主题）
- 完成的任务
- 提取的待办

### 9.2 结果分组

```
Sessions (3)
  • 张磊合同跟进
  • 下周会议安排
Drafts (2)
  • 张磊回复草稿
Tasks (1)
  • 起草周报并发送
```

点击结果跳转到对应 session 并高亮匹配内容。

---

## 10. 数据改动

### 10.1 新增状态

```js
state: {
  // ...existing
  agentSessions: [],        // 所有 session
  currentAgentSessionId: null,
  agentMemory: { global: {}, contacts: {} }
}
```

### 10.2 扩展现有数据

- `D.agentTasks`：增加 `sessionId` 字段。
- `D.agentDrafts`：增加 `sessionId` 和 `sourceContext` 字段。

### 10.3 持久化（prototype 阶段）

- 先使用内存数据 + `prototype-data.js` 中的示例数据。
- 后续可接入 `localStorage` 保存用户创建的 session。

---

## 11. UI 细节

### 11.1 新增 CSS 模块

- `.agent-panel`：改造现有面板，增加 session header 和消息操作。
- `.agent-view`：新增三栏工作区布局。
- `.session-list` / `.session-item` / `.session-pill`
- `.agent-message` / `.agent-message-actions`
- `.task-card`（增强步骤进度展示）
- `.memory-chip`

### 11.2 图标映射

| Context kind | 图标 |
|---|---|
| message | `ph-envelope` |
| contact | `ph-user` |
| meeting | `ph-calendar` |
| file | `ph-file` |
| freeform | `ph-sparkle` |

---

## 12. 验收标准

- [ ] 右下角 Quick Agent 面板支持新建/切换 session。
- [ ] 不同 session 的消息历史互相隔离。
- [ ] Agent 工作区可从侧边栏进入，显示 session 列表、对话区、任务/草稿/记忆面板。
- [ ] 委托多步骤任务时自动生成 task session，并在右侧面板展示进度。
- [ ] Settings 中新增 Agent Memory 管理页。
- [ ] Agent 工作区顶部支持搜索历史 session、草稿、任务。
- [ ] 所有改动在 `prototype-v11.html?v=11.x` 中验证通过。

---

## 13. 后续可扩展

- 接入真实 LLM API 替换当前的 `showToast` 模拟。
- 会话持久化到本地存储或后端。
- 多模态附件（图片、文档）支持。
- Agent 主动推送（proactive notification）。
