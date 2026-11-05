# 首次导入过渡（Gate 不接收历史发件人）+ 分类自动化 · 实施规格

> 目标：一个用了 5 年 Gmail、10,000 联系人的用户，第一次登录 SendPalm 时，
> **不会**在筛选台看到 3,000 张待审卡片，**不会**被历史邮件的通知淹掉，
> 也不需要在一步里做 3,000 个决定。同时保证导入 10 万封邮件时 Shell 不卡。

## 1. 核心决定

| 问题 | 决定 | 理由 |
|---|---|---|
| 历史发件人进 Gate 吗 | **不进**（默认） | 3,000 个决定 = 劝退；Gate 的语义是「以后谁可以写信给我」 |
| 「历史」怎么界定 | 该账户**第一次成功同步**跑过的那批邮件 | 已有 `accounts.last_uid`，首轮为 0；不需要新表 |
| 历史发件人放在哪 | 直接 `screened = 1`，按启发式分桶 | 用户随时可以在联系人里改，不是不可逆 |
| 想重审历史的人 | 设置 → 账户 → 「回顾历史发件人」开关 | 显式开启，不做默认 |

## 2. 代码改动（4 处，按顺序）

### 2.1 给 `upsert_contact` 加一个批量导入标记

`src-tauri/src/services/sync_loop.rs:1770`

```rust
pub async fn upsert_contact(
    pool: &SqlitePool,
    email: &str,
    name: Option<&str>,
    is_self: bool,
    bulk_import: bool,   // 新增
) -> Result<ContactRouteInfo, String>
```

- `is_self` 分支不变。
- 否则 `let (first_seen, screened, default_bucket) = if bulk_import { (1, 1, "imbox") } else { (1, 0, "imbox") };`
- `ON CONFLICT` 已经保证「只升不降」，无需改。
- 调用点：`grep -n "upsert_contact(" src-tauri/src` —— 全部补第 5 个参数；只有同步路径传真实值，其余传 `false`。

### 2.2 首轮同步判定

`src-tauri/src/services/sync_loop.rs`（`sync_account` / `sync_folder` 入口）：

```rust
let is_initial_import = account.last_uid == 0;   // 该账户第一次拉到东西
```

把这个 bool 一路传到 `upsert_contact` 和消息落库处。**注意**：判定必须在写入第一封之前取，
否则第一轮跑完 `last_uid` 就不是 0 了。

### 2.3 历史邮件的分桶（导入时）

插入消息时，若 `is_initial_import`：

- `is_newsletter == 1` → `bucket = 'feed'`（报刊）
- 否则 `bucket = 'imbox'`

票据的关键词规则（invoice/receipt/order/验证码/物流）**先不做自动移动**，只打标签，
避免在用户不知情时把重要邮件藏进单据。等「执行+撤销」的 UI 上了再开。

### 2.4 Gate 计数与列表的规模防护（必做）

`src/stores/data.ts:774 countGateCandidates()` 目前是 `SELECT id FROM contacts WHERE first_seen=1 AND screened=0`
—— 1 万联系人就是 1 万行过 IPC。改成：

```sql
SELECT id FROM contacts WHERE first_seen = 1 AND screened = 0 LIMIT 500
```

计数显示 `500+`（>500 时），列表本身走分页。MockDb 不支持 `COUNT(*)`，所以仍用 id-only + LIMIT。

## 3. 导入完成的反馈（一个 toast + 一行设置）

- 首轮同步结束时（`last_uid` 从 0 变成非 0），发一次事件，前端 toast：
  「已静默导入 3,120 封历史邮件 · 其中 214 位发件人已自动通过，不会进入筛选台」
  带一个次要动作：「查看历史发件人」（先跳到联系人，未来做分组页）。
- 设置 → 账户 每行加一条状态：「历史导入 3,120 封 · 214 位发件人已通过」。

## 4. 验收（必须全部覆盖）

| 测试 | 类型 | 断言 |
|---|---|---|
| `tests/import_transition.rs` | Rust 集成 | 首轮 500 封 / 40 个新发件人 → `contacts.screened=1` 计 40，`countGateCandidates()==0` |
| `tests/import_transition.rs` | Rust 集成 | 第二轮新来 1 个发件人 → Gate 计数 1，只有这 1 个 |
| `src/stores/data.test.ts` | Vitest | `countGateCandidates` 的 SQL 含 `LIMIT`，返回 ≤500 |
| `e2e/scenarios.spec.ts` | Playwright | 播 300 封历史 + 3 个新发件人 → 筛选台只显示 3 张卡 |

## 5. 同批要做的「降噪」（导入后 72 小时）

- OS 通知：导入期间与结束后 72h 内只发应用内通知（`notify=1` 的联系人除外）。
- 未读口径：Imbox 头部显示「最近 30 天 N 封待读」，历史未读不计入红点。
- 一起读：待读 > 500 时默认进入批量模式，而不是逐封。

## 6. 不做

- 不做「全部通过」的批量按钮来糊弄历史（会让人以为系统没在管）。
- 不在导入时自动把关键词命中的邮件挪进单据（静默错误最伤信任）。
- 不为历史邮件生成 Gate 卡片再让用户「批量通过」——那只是把 3,000 个决定压缩成 1 个点不完的列表。
