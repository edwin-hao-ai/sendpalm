# Task 11 + 12: 视觉打磨、Files/Drafts 视图、最终 QA

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

- Produces: refined hover/active/focus/empty states, `renderFiles()`, `renderDrafts()`.

## Notes

Task 1-10 已完成。本任务做最后打磨：
1. 补全全局 focus/active 状态。
2. 添加 ESC 键盘关闭面板/Agent。
3. 实现 Files 和 Drafts 占位视图。
4. 跑最终 QA 清单。

**不要运行 `git commit`**（当前仓库无 commit，用户选择直接在当前目录工作）。

## Steps

- [ ] **Step 1: 追加全局 focus/active/empty 样式到 `css/prototype-v8.css` 末尾**

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

.filter-pill:active, .panel-tab:active, .nav-item:active {
  transform: scale(0.97);
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

- [ ] **Step 2: 在 `js/prototype-v8.js` 的 `DOMContentLoaded` 中添加 ESC 快捷键**

把 `DOMContentLoaded` 内容改为：

```javascript
  document.addEventListener('DOMContentLoaded', () => {
    renderNav();
    renderTopBar();
    renderMain();
    renderAgentFab();
    renderAgentPanel();

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (state.agentOpen) toggleAgent();
        else if (document.getElementById('detail-panel').classList.contains('open')) closePanel();
      }
    });
  });
```

- [ ] **Step 3: 在 `js/prototype-v8.js` 里添加 `renderFiles` 和 `renderDrafts`**

把 Task 3 里的 placeholder stubs 替换为真实实现：

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

- [ ] **Step 4: 追加 Files / Drafts 样式到 `css/prototype-v8.css` 末尾**

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

- [ ] **Step 5: 最终 QA 清单**

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

- [ ] **Step 6: 本地验证**

Run:

```bash
python3 -m http.server 8080 &
open http://localhost:8080/prototype-v8.html
```

Expected: 所有视图、交互、动画流畅无卡顿；Files 和 Drafts 视图有内容；无 JS 报错。

## Report

完成后把结果写到 `docs/superpowers/plans/task-11-12-report.md`：
- 状态：DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED
- 修改了哪些文件
- QA 清单结果（通过/未通过项）
- 自审发现的问题（如有）
