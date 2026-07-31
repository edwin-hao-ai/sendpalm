# SendPalm prototype-v11 — 补齐缺失表单与页面，逼近完整产品设计

> 状态：待实现  
> 目标：在现有 v11.25 基础上，补全编辑表单、详情页、搜索、Onboarding、Insights、数据管理，使原型具备“可真实使用”的完整性。  
> 设计参考：hey.com / 37signals（大疏单栏、卡片 modal、iOS toggle、操作明确）。

---

## 1. 范围与阶段

本次设计覆盖 **C 方案（接近完整产品）**，分三个阶段实现，每阶段可独立 review、测试、截图验证。

| 阶段 | 范围 | 完成标志 |
|---|---|---|
| **P1 核心编辑闭环** | 编辑联系人、编辑会议、新建/编辑任务、手动草稿、账户与个人资料设置 | 所有核心实体可创建、编辑、删除；表单风格统一 |
| **P2 视图与导航增强** | 联系人详情标签扩展、公司 Account 页、全局搜索页、标签管理、高级筛选 | 信息架构从“只读列表”升级为“可探索关系” |
| **P3 产品与系统层** | Onboarding、Insights 仪表盘、导入导出、快捷键自定义 | 产品具备首次使用引导与系统级设置 |

---

## 2. 设计原则（沿用并扩展现有模式）

### 2.1 与现有代码保持一致
- 继续用原生 DOM：`el()` 辅助函数、`renderMain()` 全量刷新、`D.*` 内存数据。
- 视图切换：`state.view` 字符串；弹窗：HTML 里的 modal container。
- 详情面板：复用右侧 `#detail-panel`；移动端全屏化。

### 2.2 HEY 风格表单处理
- **大疏单栏**：表单字段 label 在输入框上方，每字段独占一行，输入框高度 `44px`，字号 `16px`。
- **卡片式 Modal**：新增/编辑表单使用居中卡片 modal，宽度 `540px`，圆角 `18px`，背景遮罩 `rgba(0,0,0,0.35)`。
- **操作位置固定**：主按钮在右下角（Save / Done），次按钮在左下角（Cancel / Delete）。
- **iOS 风格开关**：设置类用圆角 toggle，而不是原生 checkbox。
- **即时无废话**：保存后立即关闭 modal 并 `renderMain()`，用 toast 确认；删除需二次确认。
- **颜色克制**：背景延续现有 `#f6f5f2`，主按钮用品牌绿 `#3B8058`，危险操作用 `#DC2626`。

### 2.3 可访问与响应式
- 所有表单字段带 `label` 与 `name`。
- `Esc` 关闭 modal；`Enter` 在单字段场景触发保存（多行 textarea 除外）。
- 移动端：modal 宽度 `100%`、高度 `100%`，底部固定操作栏。

---

## 3. P1：核心编辑闭环

### 3.1 编辑联系人（Contact Edit Modal）

**触发入口**
- 联系人列表右键菜单 → Edit
- 联系人详情面板 → “Edit” 按钮
- 新建：Contacts 页面顶部 “New contact”

**字段**
| 字段 | 类型 | 说明 |
|---|---|---|
| Avatar | 图片 URL + 默认头像 | 输入框，支持清空后回退首字母 |
| First name / Last name | text | 必填 |
| Nickname | text | 可选 |
| Company | text | 自动联想现有公司 |
| Title | text | 职位 |
| Emails | 动态数组（text + label: work/personal/other） | 至少一个 |
| Phones | 动态数组（text + label） | 可选 |
| Stage | select | 探索 / 建立 / 活跃 / 维护 / 冷淡 / 重新激活 |
| Labels | multi-select pills | 从 `D.labels` 选择 |
| Topics | comma-separated tags | 沟通话题关键词 |
| Notes | textarea | 与现有 notes 合并 |

**操作**
- 右下角：Save（主按钮）
- 左下角：Cancel、Delete（红色，仅编辑时显示）
- 删除确认："Delete 张磊？此操作不可撤销。"

**数据**
- 新增：`D.contacts.push({...})`
- 编辑：直接修改 contact 对象
- 删除：`D.contacts = D.contacts.filter(...)`，同步清理相关 messages/tasks/drafts 的引用

### 3.2 编辑会议/事件（Event Edit Modal）

**触发入口**
- Calendar 点击空白时间 → 新建
- 会议卡片点击 → 详情面板 → “Edit”
- Calendar 右键菜单 → Edit

**字段**
| 字段 | 类型 | 说明 |
|---|---|---|
| Title | text | 必填 |
| Location | text | 可选 |
| Video link | text | 可选 |
| All day | toggle | 全天开关 |
| Date | date input | |
| Start / End | time input | 全天时隐藏 |
| People | multi-select contact pills | 参会人 |
| Color | color dots（6 色） | |
| Reminder | select | 无 / 5min / 15min / 30min / 1h / 1day |
| Description | textarea | 议程 |
| Linked task | select | 关联现有任务或新建 |

**数据**
- 编辑时传入 `event.id`，回填字段；保存时覆盖原对象。
- 删除时同步清理 `D.tasks` 中的 linkedEvent。

### 3.3 新建/编辑任务与跟进（Task Modal）

**触发入口**
- 现有 `prompt()` 场景全部替换：Calendar 的 Bubble Up / Sometime / time tracking
- 联系人详情 → “Add follow-up”
- Agent 右侧面板 → “New task”
- 会议详情 → “Add follow-up”

**字段**
| 字段 | 类型 | 说明 |
|---|---|---|
| Title | text | 必填 |
| Related to | select | Contact / Meeting / Message / None |
| Related entity | dependent select | 根据 Related to 选择具体对象 |
| Due date | date | 可选 |
| Due time | time | 可选 |
| Priority | select | Low / Medium / High |
| Status | select | Todo / In progress / Waiting / Done |
| Recurrence | select | 无 / 每天 / 每周 / 每月 |
| Description | textarea | |

**数据**
- `D.tasks` 数组；新增/编辑/删除直接操作数组。
- 完成后自动归档到联系人/公司的历史时间线。

### 3.4 手动草稿（Draft Modal）

**触发入口**
- Inbox / Drafts 页面 → “New draft”
- 消息详情 → “Save as draft”
- Agent 草稿 → “Edit manually”

**字段**
- 复用 Compose modal 的字段结构：From、To/Cc/Bcc pills、Subject、Body textarea、toolbar、attachments。
- 增加 “Link to session/task” 选择框。

**状态**
- `D.drafts` 数组新增/更新；状态字段：`manual` / `agent`。

### 3.5 账户与个人资料设置

**个人资料（Settings → Profile）**
| 字段 | 类型 |
|---|---|
| Display name | text |
| Avatar URL | text |
| Timezone | select |
| Language | select |
| Signature | textarea |

**账户连接（Settings → Accounts）**
- 账户卡片：图标、邮箱/服务名、状态（Connected / Syncing / Error）、最后同步时间
- 操作：Reconnect、Sync now、Disconnect、Manage scope
- “Add account” 按钮打开连接向导（模拟 OAuth 流程：选服务 → 授权 → 成功）

**偏好（Settings → Preferences）**
- 扩展现有 toggles 为可编辑：通知、安静时段、自动审批、剪贴板、截图等。
- Agent 行为：默认语气、长度、自动任务级别。

---

## 4. P2：视图与导航增强

### 4.1 联系人详情标签扩展

右侧 `#detail-panel` 从 2 个标签扩到 5 个：

1. **沟通记录**：跨渠道时间线 + 每条记录可标记“需要跟进/等待回复/已完成”。
2. **文件**：按人索引的文件列表（与 Files 视图联动）。
3. **洞察**：
   - 平均回复时间（本月 vs 上月）
   - 最常讨论话题 tag cloud
   - 近 3 个月沟通频率折线图（用 CSS/简单 div 模拟）
   - 最佳联系时段
4. **关系网络**：
   - 共同联系人（你和他都认识的人）
   - 同事（同公司其他人）
   - 相似联系人（沟通模式相似）
5. **日历**：与该联系人的 upcoming / past meetings 列表。

### 4.2 公司 / Account 详情页

**入口**
- Contacts 列表顶部切换 “Group by company”
- 联系人详情点击公司名

**结构**
- 头部：公司首字母/Logo、公司名、域名、健康度分数、活跃联系人数
- 标签：People / Communications / Files / Meetings / Insights
- 右侧边栏：公司级待跟进、关键里程碑、最近活动

**数据**
- 公司实体不独立存储，从 `D.contacts` 按 `company` 字段聚合。
- 健康度 = 该公司所有联系人健康度加权平均。

### 4.3 全局搜索页

**入口**
- 顶部搜索框回车
- 快捷键 `/`

**结构**
- 左侧筛选：All / People / Messages / Files / Meetings / Tasks
- 中间结果：按类型分组列表
- 右侧预览：选中项复用 detail-panel

**行为**
- 输入时实时过滤当前类型
- 支持语义占位提示：“找一下张磊关于付款条款的邮件”

### 4.4 标签 / Label 管理

**入口**
- Settings → Labels

**功能**
- 列表展示：颜色点、名称、关联数量
- 新建：名称 + 颜色选择（12 色预设）
- 编辑：改名/改色
- 删除：确认后删除；被使用的 label 从 contacts 中移除

### 4.5 高级筛选

**入口**
- Inbox / Contacts / Files / Calendar 列表页 filter pills 旁 “More filters”

**面板**
- 日期范围：From / To
- 渠道：Email / Slack / WeChat / Calendar
- 联系人：多选 pills
- 状态：已读/未读、有附件、已跟进
- 排序：Newest / Oldest / Most relevant

---

## 5. P3：产品与系统层

### 5.1 Onboarding 流程

**入口**
- 首次打开（可通过 localStorage 跳过）
- Settings → Replay onboarding

**步骤**
1. **欢迎**：品牌价值主张 + “开始”
2. **连接渠道**：邮箱、Calendar、Slack 卡片；可跳过
3. **索引中**：模拟进度条 + 第一个洞察卡片预览
4. **完成**：展示“本周需要关注的 3 件事” + 进入 Inbox

**数据**
- onboarding 状态写入 `state.onboardingStep` 和 `localStorage`。

### 5.2 Insights 仪表盘

**入口**
- 侧边栏新增 “Insights” 视图（图标 `ph-chart-bar`）

**模块**
- 本周沟通量 vs 上周（数字 + 趋势箭头）
- Top People 排名（频率 + 健康度）
- 平均回复时间趋势（3 个月）
- 渠道占比（饼图/条形图，CSS 模拟）
- 待跟进总数
- Agent 本周完成动作数

### 5.3 导入 / 导出 & 数据管理

**入口**
- Settings → Data

**功能**
- 导出邮箱备份（模拟生成 JSON）
- 导出联系人 CSV
- 导出任务 JSON
- 清空 Trash
- 删除所有数据（二次确认）
- 删除账号（模拟）

### 5.4 快捷键自定义

**入口**
- Settings → Shortcuts

**功能**
- 列表：动作名、当前快捷键、编辑按钮
- 编辑：记录按键组合，检测冲突
- 恢复默认

---

## 6. 共用工件

### 6.1 新增工具函数（建议放到 `js/prototype-v11.js` 顶部）

```js
function openModalCard(title, renderFn, opts = {})
function renderFormGroup(label, inputEl, hint)
function renderToggle(label, checked, onChange)
function renderPillInput(items, options, onChange)
function confirmDestructive(message, onConfirm)
```

### 6.2 新增 CSS 类（`css/prototype-v11.css`）

- `.modal-card` — 居中卡片
- `.form-stack` — 单栏字段堆叠
- `.form-group` — label + input + hint
- `.form-toggle` — iOS toggle
- `.form-actions` — 底部操作栏
- `.pill-input` — 多选 pills
- `.danger-btn` — 红色危险按钮

### 6.3 数据扩展

`prototype-data.js` 中补充：
- `D.labels`：完整 label 列表（颜色、ID、名称）
- `D.drafts`：包含 agent + manual 草稿样本
- `D.tasks`：更多样本任务，带 linkedContact / linkedEvent / linkedMessage
- `D.accounts`：账户连接样本

---

## 7. 验收标准

- [ ] P1：所有核心实体可通过表单创建、编辑、删除
- [ ] P1：表单视觉统一，符合 HEY 风格大疏单栏原则
- [ ] P2：联系人详情有 5 个可切换标签
- [ ] P2：可按公司分组并进入公司详情
- [ ] P2：全局搜索页可跨类型搜索并预览
- [ ] P3：Onboarding 可完整走通 4 步
- [ ] P3：Insights 仪表盘有至少 4 个数据模块
- [ ] P3：Settings 中 Labels / Data / Shortcuts 可交互
- [ ] 全阶段：WebBridge 截图验证无运行时错误

---

## 8. 风险与假设

- **代码体积**：`prototype-v11.js` 已接近 7000 行，新增大量功能会进一步膨胀。建议按阶段提交，并在每阶段结束后 review 是否有可抽离的辅助函数。
- **无持久化**：所有数据在内存中，刷新页面会丢失。这是原型可接受范围。
- **性能**：全量 `renderMain()` 在数据量大时可能卡顿。如遇到，可在后续阶段引入局部渲染优化。
