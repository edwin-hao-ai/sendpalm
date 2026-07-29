# Task 3 + 4 实施报告

## 状态

DONE

## 修改文件

- `js/prototype-v8.js`
  - 在 `renderMain` 前添加 `getContact()`、`buildFeed()`、`filterEvents()`。
  - 替换 `renderMain()` 为支持 For You / People / Calendar / Files / Drafts 分支的版本。
  - 添加 `renderForYou()`、Filter Pill 渲染与切换逻辑。
  - 添加 `openMessage()` / `openMeeting()` stub。
  - 添加 `renderFeedItem()`，支持普通邮件卡片与会议卡片。
  - 添加 `findDraftForMessage()`、`renderDraftCard()` 及 `sendDraft()` / `editDraft()` / `ignoreDraft()`。
  - 添加 `showToast()`。
  - 为防止切换视图时 ReferenceError，额外添加了 `renderPeople()`、`renderCalendar()`、`renderFiles()`、`renderDrafts()` 四个最小占位 stub（仅显示 view-placeholder）。

- `css/prototype-v8.css`
  - 在文件末尾追加 brief 中指定的完整 CSS 块：`.view`、`.filter-bar`、`.filter-pill`、`.feed-list`、`.feed-card`、`.draft-card`、按钮样式等。

## 验证命令与结果

```bash
node --check js/prototype-v8.js
```

结果：通过（无输出，退出码 0）。

```bash
python3 -m http.server 8080 &
curl -s http://localhost:8080/prototype-v8.html | head -30
curl -s http://localhost:8080/css/prototype-v8.css | tail -20
```

结果：
- `prototype-v8.html` 返回 200，引用的 `prototype-data.js`、`js/prototype-v8.js`、`css/prototype-v8.css` 路径正确。
- `css/prototype-v8.css` 返回 200，末尾包含刚追加的 `.btn-ghost` 等规则，CSS 追加成功。

## 自审发现

1. **会议排序精度**：`buildFeed()` 中会议使用 `new Date(m.dt).getTime()` 计算 `sortKey`，但 `m.dt` 为 `"明天 7/19"` 等中文格式，`Date.parse` 会返回 `NaN`，导致所有会议 `sortKey` 为 0，排序时全部沉底。该实现与 brief 完全一致，未做修改；若需按真实时间排序，后续应将会议日期标准化为 ISO 字符串。
2. **draft 匹配逻辑**：`findDraftForMessage()` 按联系人姓名匹配 `D.agentDrafts`。数据中 `agentDrafts` 仅包含 `王洋`、`陈欣`，因此只有这两条消息的 `wait/todo` 卡片会显示完整 AI draft 预览；其余待回复/跟进卡片会回退到 `m.prev` 作为预览。
3. **新增占位 stub**：为避免切换左侧导航时 `renderMain()` 引用未定义函数导致 ReferenceError，我额外加入了 `renderPeople`/`renderCalendar`/`renderFiles`/`renderDrafts` 的最小占位实现。若后续任务有精确实现要求，可直接替换这些 stub。
