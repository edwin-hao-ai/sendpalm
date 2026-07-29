# Task 1: 搭建页面骨架与基础 CSS tokens

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

- Create: `prototype-v8.html`
- Create: `css/prototype-v8.css`
- Create: `js/prototype-v8.js`

## Interfaces

- Produces: DOM root `#app`, CSS custom properties used by all later tasks, empty `js/prototype-v8.js` with `DOMContentLoaded` listener.

## Steps

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

## Report

完成后把结果写到 `docs/superpowers/plans/task-1-report.md`：
- 状态：DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED
- 创建了哪些文件
- 验证命令和结果
- 自审发现的问题（如有）
