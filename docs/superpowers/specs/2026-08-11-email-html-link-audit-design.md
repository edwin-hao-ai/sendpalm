# SendPalm 邮件收发 / HTML 渲染 / 链接可点击 — 审计设计稿

> Spec authored 2026-08-11. Status: Draft awaiting review. Scope: read-only audit + a lightweight build-isolation patch. No email / HTML / link code changes are part of this spec.

## 1. 背景与问题

用户在 2026-08-11 提出两件事:

1. **构建交叉触发**: 跑 `pnpm tauri dev` 时, SendPalm 的 dev 工具链与本仓库根目录的 `.mddock/` vault 互相触发 (mddock 的 Tantivy 索引 + audit/blobs SQLite 写入 → Vite rebuild / HMR 抖动; mddock 同时把本仓库当作 `host_git_root` overlay, 也跟着 reload)。
2. **邮件体验存疑**: 用户对当前 SendPalm 作为真实邮件客户端的"收发 / HTML 渲染 / 链接可点" 三项基本能力没有把握, 要求做一次**只读 + 跑现有测试**的审计。

## 2. 目标 (本 spec 范围内)

1. 让 SendPalm dev/build 工具链**对 `.mddock/` 透明** (只忽略, 不搬迁, 不动 mddock manifest)。
2. 在不修改任何邮件 / HTML / 链接代码的前提下, 输出一份可复现的审计报告。
3. 跑通现有测试 (前端 typecheck/test/lint/e2e + 后端 cargo build/test/clippy), 把实际输出写进报告。
4. 报告按风险排序给出"修复候选清单", 仅是候选, **不在本 spec 落地**。

## 3. 非目标 (本 spec 明确不做)

- ❌ 不修任何 `app/src/panels/MessagePanel.tsx`、后端 `services/{imap,smtp,parser,sync_loop,scheduled_send,tracker}.rs`、前端 `stores/data.ts` / `ipc/commands.ts` 的代码。
- ❌ 不接真实 feishu.cn 账号; 不读 `app/.env` 里的 `SENDPALM_TEST_PASSWORD`。
- ❌ 不重定位 `.mddock/`; 不重写 `host_git_root` / `mode: overlay`。
- ❌ 不写新的单测 / e2e / fixture; 不跑 `SENDPALM_E2E_NETWORK=1` 路径 (`tests/imap_real.rs`, `tests/smtp_roundtrip.rs`)。
- ❌ 不跑 `scripts/verify-ios.sh` (iOS bundle 构建)。
- ❌ 不在 `docs/PROGRESS.md` 写里程碑条目 (本任务非 M-编号, 只是 1 次审计)。

## 4. 隔离改动 (本 spec 唯一代码修改)

### 4.1 改动点 (3 处)

| # | 文件 | 改动 | 必要性 |
|---|---|---|---|
| 1 | `app/vite.config.ts` | 在 `server.watch.ignored` 追加 `"**/.mddock/**"` | 关键。当前只忽略 `**/src-tauri/**`, Vite/HMR 会被 mddock 的 tantivy 索引 + audit/blobs DB 写入触发 rebuild |
| 2 | `AGENTS.md` §11 (Lessons learned) | 追加一节 "本仓库被 mddock overlay", 明确 `.mddock/` 不得被 SendPalm 工具链观察/编译/提交; 任何新增 watcher/include/resources 必须显式排除 `.mddock/**` | 防回归 |
| 3 | `docs/superpowers/audit/2026-08-11-email-html-link-audit.md` | 新建最终报告 (本 spec 落地后) | 交付物 |

### 4.2 不改的项 (检查后已天然隔离, 在报告里注明即可)

| 文件 | 当前状态 | 结论 |
|---|---|---|
| `app/tsconfig.json` | `include: ["src"]` | 已天然不包含 `.mddock/` |
| `app/src-tauri/Cargo.toml` | `cargo build` 只看 `src/` + `migrations/` + `tests/` | 已天然隔离 |
| `app/src-tauri/tauri.conf.json` | `bundle.resources` 未声明, `csp: null` 仅影响 webview 不影响 bundle | 已天然隔离 (但 CSP 风险会在落地报告 §5.3 提) |
| `.gitignore` | `.mddock/*` + `!.mddock/mddock.md` | 已正确 |

### 4.3 改动示例 (实施时粘贴, 不在本 spec 落)

`app/vite.config.ts:23-26` 由:

```ts
watch: {
  // tell Vite to ignore watching `src-tauri`
  ignored: ["**/src-tauri/**"],
},
```

改为:

```ts
watch: {
  // tell Vite to ignore watching `src-tauri` and the mddock vault overlay
  // (AGENTS.md §11: this repo is overlaid by mddock at .mddock/)
  ignored: ["**/src-tauri/**", "**/.mddock/**"],
},
```

`AGENTS.md` §11 末尾追加:

```markdown
- **本仓库被 mddock overlay**。`.mddock/` 是 mddock vault 状态目录 (含 tantivy 索引、audit.db、blobs.db), **不得**被 SendPalm 工具链观察、编译、提交。Vite `server.watch.ignored` 已加 `**/.mddock/**`; 任何后续新增 watcher、tsc include、tauri resources 都必须显式排除 `.mddock/**`。
```

### 4.4 回退

- 隔离改动: `git checkout app/vite.config.ts AGENTS.md` 即可还原。
- 报告: `rm docs/superpowers/audit/2026-08-11-email-html-link-audit.md`。
- 三个改动彼此独立。

## 5. 审计方法

### 5.1 邮件收发 (Send / Receive)

| 层级 | 文件 | 检查点 |
|---|---|---|
| IMAP 拉取 | `app/src-tauri/src/services/imap.rs` | TLS / `SELECT INBOX` / UID fetch / 错误传播 |
| IMAP 编排 | `app/src-tauri/src/services/sync_loop.rs` | `last_uid` 推进 / UIDVALIDITY 失效 / backfill 块循环 (AGENTS §10.5: 不应单页) |
| MIME 解析 | `app/src-tauri/src/services/parser.rs` | `mailparse::parse_mail` → 头/正文/附件/多 part |
| 落库 | `app/src-tauri/src/db.rs` + `commands/` | messages / contacts / files 字段对齐 `D.*` |
| 发送 | `app/src-tauri/src/services/smtp.rs` | `lettre` 构造 / 编码 / TLS / 鉴权失败传播 |
| 调度发送 | `app/src-tauri/src/services/scheduled_send.rs` | 触发逻辑 + 错误落 audit |
| 前端触发 | `app/src/ipc/commands.ts` ↔ `commands::*` | `safeInvoke` 参数名 ↔ Rust `#[tauri::command]` 形参名一致性 (AGENTS §10.5 隐性 break) |

判定:

- ✅ 调用链存在 + 关键错误分支有处理 + 现有测试覆盖
- 🟡 调用链存在但有已知缺口 (无错误处理 / 死路径 / TODO) 且无测试覆盖
- ❌ 调用链断裂 / 编译错误 / 关键 IPC 参数名不一致 / e2e 该路径上红

### 5.2 HTML 渲染

| 层级 | 文件 | 检查点 |
|---|---|---|
| 后端提取 | `app/src-tauri/src/services/parser.rs` | `text/html` part 抽取策略; 多 part 选哪个; HTML 是否原样落库; 回退到 `text/plain` |
| 后端落库 | `migrations/0004_body_html.sql` + `db.rs` | `body_html` 列存在性 + 查询路径返回 |
| IPC | `app/src/ipc/commands.ts` ↔ `commands/message.rs` | `body_html` 序列化 |
| 前端读取 | `app/src/stores/data.ts` | `Message.bodyHtml` 字段 |
| 前端渲染 | `app/src/panels/MessagePanel.tsx` | `innerHTML` vs `textContent` vs 第三方 sanitizer; CSS 隔离 (scoped / shadow DOM / iframe sandbox) |
| 引用 | 同上 | `cid:` 内联图片是否解析为 `attachment://` 路径; 外链 `<img>` 是否 lazy/blocked/透传; `background-image: url(...)` |
| 排版 | `app/src/styles/base.css` | `<table>` `<blockquote>` 样式; 长 URL `overflow-wrap: anywhere` (AGENTS §11) |
| 切换 | 同上 | "纯文本 / HTML" 切换按钮 |

判定:

- ✅ HTML 完整渲染 + 链接可点 + CSS 隔离 + XSS 防护
- 🟡 HTML 渲染但有若干缺陷 (无 sanitizer / 不支持 `cid:` / 不渲染外链图片 / 长 URL 撑爆)
- ❌ 永远只显示纯文本 / `<script>` 漏到 DOM / 渲染崩溃

### 5.3 链接可点击

| 层级 | 文件 | 检查点 |
|---|---|---|
| 链接抽取 | `app/src-tauri/src/services/parser.rs` | HTML 链接是否在解析阶段被改写 (追踪 pixel / 链接跟踪) |
| 链接跟踪 | `app/src-tauri/src/services/tracker.rs` (AGENTS §5 提到) | 重写规则; 点击回写 |
| 前端渲染 | `app/src/panels/MessagePanel.tsx` | `<a>` 是否带 `href`; 是否拦截点击; 是否走 Tauri `opener.open_url` |
| 打开外部 | `app/src/ipc/commands.ts` ↔ `@tauri-apps/plugin-opener` | 桌面 `opener` → 系统浏览器; iOS WKWebView 行为差异 |
| 邮件型 | 同上 | `mailto:` 链接识别 + 默认邮件客户端 |
| 安全 | `app/src/panels/MessagePanel.tsx` | `href="javascript:..."` 过滤; `target="_blank"` 配 `rel="noopener noreferrer"`; `onclick` 阻止默认 |
| 纯文本 | 同上 | 自动识别裸 URL; 长 URL 截断 (AGENTS §11) |
| CSP | `app/src-tauri/tauri.conf.json` | `csp: null` 当前关闭, 意味着必须在 sanitizer 层兜 |

判定:

- ✅ `<a href>` 渲染时带 href + 点击走 opener + `javascript:` 被剥 + `target=_blank` 安全 + `mailto:` 可用 + 纯文本 URL 可点
- 🟡 部分支持 (能渲染但点击走 `window.open` 而非 opener, 或 `mailto:` 没单独处理)
- ❌ 链接渲染成纯文本 / 点击被吞掉走外链丢失 / 被 CSP block 后无 fallback

### 5.4 命令清单 (按顺序)

```bash
cd app
pnpm install --frozen-lockfile          # 仅 node_modules 缺失时
pnpm typecheck                          # tsc --noEmit
pnpm test                               # vitest run
pnpm e2e                                # playwright (已存在 16-view smoke; AGENTS §11: 等 body.app-ready)
pnpm lint                               # eslint --max-warnings=0

cd app/src-tauri
cargo build                             # 默认 features, 不联网
cargo test                              # 跳过 SENDPALM_E2E_NETWORK gated 测试
cargo clippy --all-targets -- -D warnings   # AGENTS §3.7
```

输出用 `2>&1 | tee qa-tmp/audit-2026-08-11-<name>.log` 抓全, 报告里只贴关键行 + 指向原始日志。

## 6. 报告结构 (落地文件)

`docs/superpowers/audit/2026-08-11-email-html-link-audit.md`:

```
# SendPalm 邮件 / HTML / 链接 审计 (2026-08-11)

## TL;DR
一段话结论: 邮件收发 / HTML 渲染 / 链接可点的总体 ✅/🟡/❌。

## 1. 改动摘要
本次实际写入磁盘的修改 (隔离 + AGENTS + 报告本身), 不含审计结论性代码改动。

## 2. 隔离验证
- 修改前 Vite 在 watch `.mddock/`: 证据 (配置文件 + 推理)
- 修改后 Vite 已忽略: 证据
- Cargo / tsc / tauri.conf.json 天然隔离情况

## 3. 邮件收发 (Send / Receive)
### 3.1 接收链路
imap.rs / sync_loop.rs / parser.rs / db / commands — 每条 ✅/🟡/❌ + file:line
### 3.2 发送链路
smtp.rs / scheduled_send.rs / send_message — 每条 ✅/🟡/❌ + file:line
### 3.3 IPC 一致性
safeInvoke 参数名 vs #[tauri::command] 形参 (grep 双向对照)

## 4. HTML 渲染
- body_html 抽取 / 落库 / IPC
- MessagePanel 渲染方式 (innerHTML / sanitizer / iframe)
- cid: / 外链 / tracking pixel
- 长 URL 折行 (AGENTS §11)

## 5. 链接可点击
- <a href> 渲染 / 点击
- mailto:
- opener 集成
- 安全 (javascript: / target=_blank / rel)

## 6. 测试运行结果
每条命令一行 + 关键输出 (pass/fail count, errors), 完整日志路径。

## 7. 风险排序的修复候选清单
列表: 风险等级 / 修复成本 / 涉及文件 — 仅候选, 本次不修。
```

## 7. 风险与边界

- **不修代码约束的代价**: 部分 🟡 项可能因为"暂不修"而显得报告"没用", 但用户明确要的是"先报告, 再决定" (回答 "报告 + 轻量隔离改动")。
- **`cargo build` 首次会慢**: 5–10 分钟, 接受不重试。
- **e2e 可能缺 Playwright 浏览器**: 报告里写明跳过原因, 不自动 `npx playwright install` (会下载 ~300MB, 未经允许)。
- **mddock overlay 不可消除**: 即使本次 Vite 不再 watch, mddock 自己仍会把本仓库当 `host_git_root` 监听; 本 spec 只解决"SendPalm dev 端不被 mddock 干扰"。反过来 (mddock 端被 SendPalm dev 干扰) 若有, 需 mddock 工具侧配合, 不在 SendPalm 范围。
- **`.env` 密码**: 跑测试时若 Rust 端 `dotenvy::dotenv()` 触发, `app/.env` 会被读入; 报告里**禁止**贴任何 `SENDPALM_TEST_PASSWORD` 字面值, 引用只到变量名。

## 8. Definition of Done (本 spec)

- [ ] `app/vite.config.ts` 改完, `pnpm typecheck` 仍绿
- [ ] `AGENTS.md` §11 补完
- [ ] §5.4 列出的 7 条非条件命令全部跑过 (typecheck / test / e2e / lint / cargo build / cargo test / cargo clippy); `pnpm install` 仅在 `node_modules` 缺失时跑; 关键输出粘贴进报告
- [ ] 报告落地 `docs/superpowers/audit/2026-08-11-email-html-link-audit.md`
- [ ] 报告里每条 ✅/🟡/❌ 都配 file:line 证据
- [ ] 报告里无 `SENDPALM_TEST_PASSWORD` 字面值
- [ ] 修复候选清单已按风险排序, 但未在本 spec 落地
- [ ] 一次 conventional commit: `docs(audit): sendpalm email+html+link audit 2026-08-11` (含隔离改动 + 报告)
- [ ] 不写 `docs/PROGRESS.md` (非 M-编号)

## 9. 后续 (出报告后)

- 用户根据 §7 修复候选清单挑选, 另起 spec/plan 走 TDD 实现流程 (per AGENTS §3.4: 任何修邮件逻辑的 PR 必须有测试)。
- 本 spec 文档保留在 `docs/superpowers/specs/` 作为历史。
