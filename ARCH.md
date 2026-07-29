# Relay Architecture v5

## 核心创新: AI + 知识图谱 + 跨账户统一

### 1. 数据接入层 (Data Ingestion)

不同邮件系统有不同的接入方式，Relay 需要一个统一的抽象层:

| 系统 | 协议 | 认证 | 特点 |
|------|------|------|------|
| Gmail | Gmail API (REST) | OAuth 2.0 | 标签系统, Pub/Sub 推送, 配额严格 |
| Outlook/365 | Microsoft Graph API | OAuth 2.0 (Azure AD) | Delta Sync, Webhooks, 企业级 |
| 通用 IMAP | IMAP4rev1 | OAuth 2.0 / PLAIN | Yahoo, iCloud, 自建服务器 |
| Slack | Slack API (WebSocket) | OAuth 2.0 | 实时消息, 频道, 线程 |
| 微信 | 微信官方 API | OAuth 2.0 | 限制多, 只有企业版 |
| 企业微信 | 企微 API | OAuth 2.0 | 消息存档可读 |
| 钉钉 | 钉钉 API | OAuth 2.0 | 类似企微 |
| WhatsApp Business | WhatsApp Cloud API | OAuth 2.0 | Meta 生态 |
| Telegram | Telegram Bot API | Token | 简单直接 |

**架构决策**: 采用抽象同步引擎 + 统一事件总线
- 每个 Provider 实现 `SyncEngine` 接口
- 统一转换为 `RelayMessage` 规范格式
- WebSocket/PubSub 实时推送新消息

### 2. 实体解析 (Entity Resolution)

同一人出现在不同平台 (Gmail + Slack + 微信) → 合并为统一联系人:

```
输入: zhanglei@huawei.com + Slack "张磊" + 微信 "Lei Zhang"
                              ↓
          实体解析引擎 (AI + 规则)
                              ↓
输出: { id: "zl", name: "张磊", emails: [...], slack: "...", wechat: "..." }
```

**解析策略**:
- 确定性匹配: 相同邮箱地址, 相同手机号
- 模糊匹配: 名字相似度 (拼音, 英文名)
- AI 辅助: LLM 从邮件签名提取职位/公司/电话/地址
- 人工确认: 低置信度时提示用户合并

### 3. 知识图谱 (Knowledge Graph)

```
节点类型:
  - Person (联系人)
  - Company (公司)
  - Topic (话题, 如 "Q4合同")
  - File (文件/附件)
  - Meeting (会议)
  - Account (用户账户)
  - EmailThread (邮件线程)

边类型:
  - WORKS_AT → (Person → Company)
  - SENT_EMAIL → (Person → EmailThread)
  - HAS_TOPIC → (EmailThread/File → Topic)
  - ATTENDED → (Person → Meeting)
  - HAS_FILE → (EmailThread → File)
  - CONTEXT_LINK → (Topic → Person/File/Meeting)
  - COMMUNICATES_WITH → (Person → Person, 加权)
```

**图能力**:
- 关系路径发现: "张磊" → Q4合同 → 陈欣 (间接连接)
- 关系度计算: 基于邮件频率, 回复时间, 情感分析
- 社区检测: 自动发现业务圈子 (华为圈子, 字节圈子)
- 冷启动推荐: "和張磊有关的人你可能也认识"

### 4. AI 提取器 (AI Extraction Pipelines)

从非结构化通信中自动提取结构化数据:

**邮件签名解析**:
```
输入: "Best regards,
张磊 | 战略合作总监
华为技术有限公司
手机: 138-0000-0000
邮箱: zhanglei@huawei.com"
                              ↓
输出: { name, title, company, phone, email }
```

**邮件正文提取**:
```
输入: "明天下午2点开会讨论Q4合同付款条款"
                              ↓
输出: { action: "meeting", datetime: "明天14:00", topic: "Q4合同", participants: [] }
```

**联系人字段提取**:
- 从邮件历史中提取: 时区, 工作模式 (什么时候回复最快)
- 从附件中提取: 合同中的关键日期, 金额
- 从日历中提取: 会议偏好, 空闲时间

### 5. 统一收件箱 (Unified Inbox)

所有账户消息在一个视图中, 按时间线排序:
- 左侧: 统一时间线 (邮件 + Slack + 微信)
- 右侧: 选中消息详情
- 顶部: 账户筛选 / 跨账户搜索

### 6. 隐私架构

**模式一: 统一索引 (Unified)**
- 所有账户数据集中索引
- AI 可跨账户分析 (如: 张磊在Gmail和微信上都说Q4合同)
- 适合个人用户

**模式二: 隔离索引 (Isolated)**
- 每个账户数据独立索引
- AI 只在单账户内分析
- 适合企业合规需求

**模式三: 混合模式**
- 按联系人级别控制
- 工作联系人: 统一; 私人联系人: 隔离

### 7. Tauri + Rust 技术栈

```
┌─────────────────────────────────────────┐
│            Tauri Desktop App            │
│  ┌──────────┐  ┌────────────────────┐  │
│  │  Rust 核   │  │   Web UI (Svelte)  │  │
│  │  心引擎    │  │  知识图谱可视化     │  │
│  │  同步引擎  │  │  AI 对话界面       │  │
│  │  加密存储  │  │  联系人管理        │  │
│  │  本地 LLM  │  │  统一收件箱        │  │
│  └──────────┘  └────────────────────┘  │
└─────────────────────────────────────────┘
```

### 8. 竞品分析

| 产品 | 定位 | AI能力 | 图谱 | 跨账户 | 本地优先 |
|------|------|--------|------|--------|---------|
| **Relay** | AI通信副驾 | 深度(提取/分析/行动) | 自有知识图谱 | 是(邮件+IM+日历) | 是(Tauri) |
| Superhuman | 快邮件客户端 | 起草/摘要/分类 | 无 | 仅邮件 | 否 |
| Attio | AI原生CRM | 属性提取/自动化 | Graph模型 | 仅邮件同步 | 否 |
| Clay | 数据丰富平台 | 研究代理/丰富 | 外部图谱 | 邮件+LinkedIn | 否 |
| Front | 团队收件箱 | 回复建议/分类 | 无 | 邮件+聊天 | 否 |
| Affinity | 关系智能 | 关系自动发现 | 关系图 | 仅邮件 | 否 |

### 9. Demo 核心场景

1. **多账户连接** — 展示 Gmail + Outlook + Slack + 微信 同屏
2. **实体解析** — 同一个人跨平台自动合并
3. **AI提取** — 从邮件签名/正文提取联系人信息
4. **知识图谱** — 可视化关系网络
5. **统一搜索** — 跨账户搜索联系人/消息/文件
6. **关系洞察** — "张磊与陈欣通过Q4合同项目关联"
7. **AI 代理** — "总结本周沟通" / "提取所有联系人的手机号"
