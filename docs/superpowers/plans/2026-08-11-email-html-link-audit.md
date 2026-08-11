# SendPalm 邮件/HTML/链接审计 + 轻量隔离 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 输出 `docs/superpowers/audit/2026-08-11-email-html-link-audit.md` (邮件收发 / HTML 渲染 / 链接可点击审计报告), 并落 1 个轻量隔离改动 (Vite watch.ignored 排除 `.mddock/**` + AGENTS.md §11 补一条防回归), 用一次 conventional commit 收尾。

**Architecture:** 全程只读 + 跑现有测试 + 写报告. 不写新单测/不修邮件代码/不接真实 feishu. 按 spec §5.4 跑 7 条非条件命令 + 1 条条件命令, 抓全输出到 `qa-tmp/audit-2026-08-11-*.log`, 报告里只贴关键行 + 引用 log. 7 个任务分两次 commit: 任务 1 是隔离 patch, 任务 7 是报告 + 文档 (按 spec §8 用同一次 commit 也可, 但拆开 review 更清晰).

**Tech Stack:** Tauri 2 + SolidJS (只读), Vitest + Playwright (跑现成), cargo + clippy (跑现成), `mailparse` / `lettre` / `async-imap` (只读源码), bash tee (抓全输出).

## Global Constraints

Verbatim from spec + AGENTS.md:

- AGENTS.md §3.2: no `any` in TS, no magic strings, all colors in `tokens.css`.
- AGENTS.md §3.4: 任何修改邮件逻辑的 PR 必须有测试; 本次不修邮件逻辑.
- AGENTS.md §3.5: conventional commits; one logical change per commit.
- AGENTS.md §3.6: 自审 checklist.
- AGENTS.md §3.7: verification-before-completion; 跑过 + 看输出再下结论.
- AGENTS.md §7: 报告完成 ≠ 写 PROGRESS (本任务非 M-编号, **不**写 PROGRESS).
- AGENTS.md §10.5: `.env` 密码 `SENDPALM_TEST_PASSWORD` 永远不贴字面值到任何文件/日志/报告; 引用只到变量名.
- AGENTS.md §10.5: 网络集成测试 (`tests/imap_real.rs`, `tests/smtp_roundtrip.rs`) 必须 `SENDPALM_E2E_NETWORK=1` 才跑, 本次不设此环境变量.
- AGENTS.md §11: 本仓库被 mddock overlay, `.mddock/` 不得被 SendPalm 工具链观察; 任务 1 落该约束.
- Spec: 隔离改动 = 3 处 (`app/vite.config.ts` + `AGENTS.md` + 报告本身). 报告路径 = `docs/superpowers/audit/2026-08-11-email-html-link-audit.md`. 日志路径 = `qa-tmp/audit-2026-08-11-<command>.log`.

---

## Task 1: 落隔离 patch (Vite watch.ignored + AGENTS.md §11)

**Files:**
- Modify: `app/vite.config.ts:23-26` (在 `server.watch.ignored` 数组里追加 `"**/.mddock/**"`)
- Modify: `AGENTS.md` (在 §11 Lessons learned 末尾追加一条 bullet)
- Read first: `app/vite.config.ts`, `AGENTS.md` §11

**Interfaces:**
- Consumes: 当前 `vite.config.ts` 的 `server.watch.ignored` 数组 = `["**/src-tauri/**"]`; AGENTS.md §11 已有若干 lessons bullets.
- Produces: `vite.config.ts` 的 `server.watch.ignored` = `["**/src-tauri/**", "**/.mddock/**"]`; AGENTS.md §11 末尾多 1 条 bullet, 字面值见 step 3.

- [ ] **Step 1: 读现状, 确认 patch 锚点**

读 `app/vite.config.ts` 全文, 确认 `server.watch.ignored` 当前只含 `"**/src-tauri/**"` (line 25). 同时读 `AGENTS.md` §11 末尾 (大约第 190 行以后), 找到最后一个 lesson bullet.

- [ ] **Step 2: 改 `app/vite.config.ts`**

将 line 23-26:

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

- [ ] **Step 3: 在 `AGENTS.md` §11 末尾追加 bullet**

在 §11 最后一个 bullet 之后, 末尾加一行空行 + 1 个 bullet, 原文:

```markdown
- **本仓库被 mddock overlay**。`.mddock/` 是 mddock vault 状态目录 (含 tantivy 索引、audit.db、blobs.db), **不得**被 SendPalm 工具链观察、编译、提交。Vite `server.watch.ignored` 已加 `**/.mddock/**`; 任何后续新增 watcher、tsc include、tauri resources 都必须显式排除 `.mddock/**`。
```

- [ ] **Step 4: 跑 `pnpm typecheck` 验证**

```bash
cd app && pnpm typecheck
```

预期: 通过 (改动不影响 TS 类型). 如果失败, 检查 `app/vite.config.ts` 改写是否破坏了 `defineConfig` 返回值; `watch.ignored` 是 `string[]`, 加一个元素不破坏类型.

- [ ] **Step 5: 单独 commit 隔离 patch**

```bash
cd /Users/edwinhao/sendpalm
git add app/vite.config.ts AGENTS.md
git commit -m "build(isolation): exclude .mddock from Vite watcher" \
  -m "AGENTS.md §11 note: this repo is overlaid by mddock.
.mddock/ is mddock vault state (tantivy index + audit.db +
blobs.db); its frequent writes previously triggered Vite
rebuild/HMR. Explicit ignore prevents the cross-process loop.

Per spec 2026-08-11 §4.1. No email/HTML code changes."
```

---

## Task 2: 跑全部测试命令 + 抓全输出

**Files:**
- Read first: `app/package.json` (确认 scripts), `app/src-tauri/Cargo.toml` (确认 deps)
- Create: `qa-tmp/audit-2026-08-11-*.log` (8 个日志)
- Does not modify: 任何源码

**Interfaces:**
- Consumes: 7 条非条件命令 + 1 条条件命令 (`pnpm install`).
- Produces: 8 个日志文件, 每个 ≤1MB (clippy 警告多). 命令失败也要 tee (报告里要写"failed").

- [ ] **Step 1: 条件命令 — `pnpm install`**

```bash
ls -d app/node_modules 2>/dev/null && echo "node_modules exists, skip" || (cd app && pnpm install --frozen-lockfile 2>&1 | tee qa-tmp/audit-2026-08-11-pnpm-install.log)
```

- [ ] **Step 2: 跑 `pnpm typecheck`**

```bash
cd app && pnpm typecheck 2>&1 | tee qa-tmp/audit-2026-08-11-pnpm-typecheck.log
```

- [ ] **Step 3: 跑 `pnpm test` (vitest)**

```bash
cd app && pnpm test 2>&1 | tee qa-tmp/audit-2026-08-11-pnpm-test.log
```

- [ ] **Step 4: 跑 `pnpm e2e` (playwright)**

```bash
cd app && pnpm e2e 2>&1 | tee qa-tmp/audit-2026-08-11-pnpm-e2e.log
```

如果 Playwright 浏览器未装 (`Error: browserType.launch: Executable doesn't exist`), 报告里写"e2e skipped: Playwright browsers not installed; user did not approve `npx playwright install` (~300MB download)", 不自动安装.

- [ ] **Step 5: 跑 `pnpm lint`**

```bash
cd app && pnpm lint 2>&1 | tee qa-tmp/audit-2026-08-11-pnpm-lint.log
```

- [ ] **Step 6: 跑 `cargo build`**

```bash
cd app/src-tauri && cargo build 2>&1 | tee /Users/edwinhao/sendpalm/qa-tmp/audit-2026-08-11-cargo-build.log
```

首次会 5–10 分钟; 不重试. 失败也要 tee, 报告里要写"cargo build FAILED with <error count> errors".

- [ ] **Step 7: 跑 `cargo test` (不开 `SENDPALM_E2E_NETWORK`)**

```bash
cd app/src-tauri && cargo test 2>&1 | tee /Users/edwinhao/sendpalm/qa-tmp/audit-2026-08-11-cargo-test.log
```

预期: 跑过 `src/services/parser_test.rs` + 其他不依赖网络的测试, 跳过 `imap_real.rs` / `smtp_roundtrip.rs`.

- [ ] **Step 8: 跑 `cargo clippy`**

```bash
cd app/src-tauri && cargo clippy --all-targets -- -D warnings 2>&1 | tee /Users/edwinhao/sendpalm/qa-tmp/audit-2026-08-11-cargo-clippy.log
```

如果 `-D warnings` 太严 (`error: too many warnings`), 退一步跑 `cargo clippy --all-targets` (不带 `-D warnings`) 然后 tee, 报告里注明"clippy 全量有 N 个 warning, 详见 log".

- [ ] **Step 9: 汇总 8 个日志的 pass/fail 行**

每个日志用 `tail -20` 抓最后 20 行, 写进一个临时汇总 `qa-tmp/audit-2026-08-11-summary.txt`, 任务 6 写报告时引用. 命令:

```bash
cd /Users/edwinhao/sendpalm
for f in qa-tmp/audit-2026-08-11-*.log; do
  echo "===== $f ====="
  tail -20 "$f"
  echo ""
done | tee qa-tmp/audit-2026-08-11-summary.txt
```

---

## Task 3: 审计邮件接收链路

**Files:**
- Read: `app/src-tauri/src/services/imap.rs`, `app/src-tauri/src/services/sync_loop.rs`, `app/src-tauri/src/services/parser.rs`, `app/src-tauri/src/db.rs`
- Read: `app/src-tauri/migrations/0001_init.sql` (messages / contacts / files 表)
- Read: `app/src-tauri/src/commands/message.rs` (如存在, 否则读 `commands/mod.rs`)
- Write: `qa-tmp/audit-2026-08-11-findings-receive.md` (草稿, 任务 6 合并到最终报告)

**Interfaces:**
- Produces: 1 份草稿 findings 文件, 含每条 ✅/🟡/❌ + file:line 证据. 任务 6 会读它.

- [ ] **Step 1: 读 imap.rs, 验证 4 个检查点**

```bash
wc -l app/src-tauri/src/services/imap.rs
```

读全文, 验证:
- [ ] TLS 路径 (检查是否走 `SslTunnel` / `rustls`)
- [ ] `SELECT INBOX` 调用存在
- [ ] UID fetch 用 `UID` 命令 (非 sequence)
- [ ] 错误是否 `?` 传播或显式 match

逐条用 `grep -n` 抓证据行号, 写进 findings.

- [ ] **Step 2: 读 sync_loop.rs, 验证 3 个检查点**

读全文, 验证:
- [ ] `last_uid` 推进逻辑 (搜索 `last_uid` / `MAX_UID` / `max_uid`)
- [ ] UIDVALIDITY 失效处理 (搜索 `UIDVALIDITY` / `uid_validity`)
- [ ] Backfill 块循环 (搜 `MAX_PER_TICK` / `chunk` / `while`; 引用 AGENTS §10.5 "walks chunks, not a single page")

- [ ] **Step 3: 读 parser.rs, 验证 4 个检查点**

读全文, 验证:
- [ ] `mailparse::parse_mail` 调用
- [ ] 头/正文/附件/多 part 抽取 (搜 `subject` / `from` / `body` / `attachment`)
- [ ] `text/html` part 抽取 (搜 `text/html` / `body_html` / `html_body`)
- [ ] `text/plain` 回退 (搜 `text/plain` / `plain_body`)

- [ ] **Step 4: 读 db.rs + 0001_init.sql, 验证字段对齐**

读 `db.rs` 和 `0001_init.sql`, 列出 `messages` 表实际列名, 与 `D.*` 数据模型 (读 `app/src/types/message.ts` 如存在, 否则 `app/src/seed/demo.ts` 找 `D.messages[0]`) 字段对照. 不一致 = 🟡 或 ❌.

- [ ] **Step 5: 读 commands/message.rs (或 mod.rs 里的 message 命令)**

```bash
ls app/src-tauri/src/commands/ | head
```

找到消息查询命令, 验证:
- [ ] `body_html` 是否在响应里 (grep `body_html`)
- [ ] `body` 字段是否在响应里
- [ ] IPC 序列化是否走 `serde_json` (基本一定, 但确认)

- [ ] **Step 6: 写 findings 草稿**

创建 `qa-tmp/audit-2026-08-11-findings-receive.md`, 结构:

```markdown
# 接收链路审计 findings (草稿)

## imap.rs
- ✅/🟡/❌ TLS — file:line 证据
- ✅/🟡/❌ SELECT INBOX — file:line 证据
- ...

## sync_loop.rs
- ...

## parser.rs
- ...

## db.rs + 0001_init.sql
- ...

## commands/message.rs
- ...
```

每条判定必须配 1 行 file:line 证据. 没找到证据不写"✅", 标 🟡 或 ❌.

---

## Task 4: 审计邮件发送链路

**Files:**
- Read: `app/src-tauri/src/services/smtp.rs`, `app/src-tauri/src/services/scheduled_send.rs`
- Read: `app/src-tauri/src/commands/send_message.rs` (或 `commands/mod.rs` 里的 send_message 命令)
- Write: `qa-tmp/audit-2026-08-11-findings-send.md` (草稿)

- [ ] **Step 1: 读 smtp.rs, 验证 4 个检查点**

读全文, 验证:
- [ ] `lettre` 构造 (`SmtpTransport::relay` / `builder`)
- [ ] 编码 (`MIME` / `MultiPart` / `MessageBuilder`)
- [ ] TLS (`rustls` / `starttls` / `tls`)
- [ ] 鉴权失败传播 (`SmtpError` / `?` 传播)

- [ ] **Step 2: 读 scheduled_send.rs, 验证 2 个检查点**

读全文, 验证:
- [ ] 触发逻辑 (tokio interval / sleep loop)
- [ ] 错误落 audit (搜 `audit` / `eprintln!` / `log::error!`)

- [ ] **Step 3: 读 commands/send_message**

找到 send_message `#[tauri::command]`, 验证:
- [ ] 形参名 (用 `grep -A 5 "fn send_message"`)
- [ ] 错误传播

- [ ] **Step 4: 写 findings 草稿**

创建 `qa-tmp/audit-2026-08-11-findings-send.md`, 结构同 Task 3 step 6.

---

## Task 5: 审计 IPC 一致性 (前端 ↔ 后端)

**Files:**
- Read: `app/src/ipc/commands.ts`
- Read: `app/src-tauri/src/commands/mod.rs` 或 `app/src-tauri/src/lib.rs` (`invoke_handler!` 列表)
- Write: `qa-tmp/audit-2026-08-11-findings-ipc.md` (草稿)

- [ ] **Step 1: 列前端所有 `safeInvoke<...>(` 调用点**

```bash
grep -rn "safeInvoke" app/src --include="*.ts" --include="*.tsx" > qa-tmp/audit-2026-08-11-safeinvoke.txt
```

读 `qa-tmp/audit-2026-08-11-safeinvoke.txt`, 列出每个 `safeInvoke` 的命令名 + 参数对象字段名.

- [ ] **Step 2: 列后端所有 `#[tauri::command]` 形参**

```bash
grep -B 1 "fn " app/src-tauri/src/commands/*.rs | grep -A 1 "pub async fn\|pub fn" > qa-tmp/audit-2026-08-11-tauri-commands.txt
```

读 `app/src-tauri/src/lib.rs` 的 `invoke_handler![...]` 块 (大约 line 144-157), 列出已注册命令.

- [ ] **Step 3: 双向对照**

对每个被调用的命令:
- [ ] 后端是否有同名 #[tauri::command]
- [ ] 形参名是否完全一致 (rust `snake_case` ↔ TS `camelCase`, Tauri 2 默认自动转; 但**自定义 struct 字段**仍需手动对齐)

AGENTS §10.5 提醒: `cli.send_email_via_backend` 类型 break 是经典坑.

- [ ] **Step 4: 写 findings 草稿**

创建 `qa-tmp/audit-2026-08-11-findings-ipc.md`, 列出每条 `safeInvoke<CommandName>({ ... })` ↔ `#[tauri::command] fn command_name( ... )` 的对照, 不一致处标 ❌.

---

## Task 6: 审计 HTML 渲染

**Files:**
- Read: `app/src/panels/MessagePanel.tsx` (68K, 必读)
- Read: `app/src/styles/base.css` (找 `overflow-wrap: anywhere`)
- Read: `app/src/stores/data.ts` (找 `Message.bodyHtml` 字段)
- Read: `app/src-tauri/src/services/parser.rs` (task 3 已读, 这里只看 html 抽取部分)
- Write: `qa-tmp/audit-2026-08-11-findings-html.md` (草稿)

- [ ] **Step 1: 读 MessagePanel.tsx, 找到 body 渲染点**

```bash
grep -n "body\|innerHTML\|sanitize\|dangerouslySetInnerHTML" app/src/panels/MessagePanel.tsx | head -40
```

找具体的 body 渲染 JSX. SolidJS 没有 `dangerouslySetInnerHTML`, 通常用 `innerHTML` (ref + 赋值) 或第三方 sanitizer (DOMPurify).

- [ ] **Step 2: 验证 5 个检查点**

逐条判定:
- [ ] 渲染方式 (`innerHTML` ref vs `textContent` vs sanitizer)
- [ ] 是否有 sanitizer 库依赖 (查 `package.json` `dependencies`)
- [ ] CSS 隔离 (scoped class / shadow DOM / iframe sandbox)
- [ ] `cid:` 内联图片是否解析为 `attachment://` 路径
- [ ] 外链 `<img>` 处理 (lazy / blocked / proxy)

- [ ] **Step 3: 读 base.css, 验证长 URL 折行**

```bash
grep -n "overflow-wrap\|word-break" app/src/styles/base.css
```

预期: AGENTS §11 提醒过 `overflow-wrap: anywhere` 应在 `p { }` 全局规则里. 验证是否在.

- [ ] **Step 4: 读 stores/data.ts, 找 Message 类型 + bodyHtml 字段**

```bash
grep -n "bodyHtml\|body_html" app/src/stores/data.ts
```

确认前端 type 里有 `bodyHtml: string` 字段.

- [ ] **Step 5: 写 findings 草稿**

创建 `qa-tmp/audit-2026-08-11-findings-html.md`, 每条判定配 file:line 证据.

---

## Task 7: 审计链接可点击

**Files:**
- Read: `app/src/panels/MessagePanel.tsx` (task 6 已读, 这里只看 link 处理)
- Read: `app/src/ipc/commands.ts` (找 `opener` / `openUrl` 调用)
- Read: `app/src-tauri/src/services/tracker.rs` (如存在)
- Write: `qa-tmp/audit-2026-08-11-findings-link.md` (草稿)

- [ ] **Step 1: 读 MessagePanel.tsx, 找 `<a>` 渲染和点击处理**

```bash
grep -n "<a\|onClick\|href\|opener" app/src/panels/MessagePanel.tsx | head -40
```

- [ ] **Step 2: 验证 7 个检查点**

逐条:
- [ ] `<a>` 渲染时带 `href`
- [ ] 是否拦截点击 (onClick preventDefault)
- [ ] 点击是否走 `opener.open_url` (Tauri plugin)
- [ ] `mailto:` 是否识别
- [ ] `href="javascript:..."` 过滤
- [ ] `target="_blank"` 是否配 `rel="noopener noreferrer"`
- [ ] 纯文本 URL 自动识别

- [ ] **Step 3: 读 tracker.rs (如存在) 验证链接重写规则**

```bash
ls app/src-tauri/src/services/tracker.rs 2>/dev/null && grep -n "href\|rewrite" app/src-tauri/src/services/tracker.rs
```

- [ ] **Step 4: 写 findings 草稿**

创建 `qa-tmp/audit-2026-08-11-findings-link.md`, 每条判定配 file:line 证据.

---

## Task 8: 写最终审计报告

**Files:**
- Read: 任务 3–7 的 4 个 findings 草稿 + 任务 2 的 `qa-tmp/audit-2026-08-11-summary.txt`
- Create: `docs/superpowers/audit/2026-08-11-email-html-link-audit.md`

**Interfaces:**
- Consumes: 4 份 findings 草稿 + 1 份测试汇总.
- Produces: 1 份最终报告, 严格按 spec §6 的 7 节结构.

- [ ] **Step 1: 起草 TL;DR**

读 5 份 findings (receive / send / ipc / html / link), 写一段话 (≤ 5 行) 总结 ✅/🟡/❌ 数量, e.g. "邮件接收 ✅ / 发送 🟡 / HTML 渲染 🟡 / 链接 ❌". 引用总测试数, e.g. "vitest 142 pass / 0 fail; cargo test 38 pass / 0 fail".

- [ ] **Step 2: 起草 §1 改动摘要**

列出本计划实际写入磁盘的 3 处: `app/vite.config.ts`, `AGENTS.md`, 报告本身. 引用 commit SHA (任务 1 + 任务 9).

- [ ] **Step 3: 起草 §2 隔离验证**

- 修改前: 引用 `app/vite.config.ts:23-26` 原文 (任务 1 step 1 之前).
- 修改后: 引用 step 5 之后的版本.
- Cargo / tsc / tauri.conf.json 天然隔离: 引用 `app/tsconfig.json:32` (`include: ["src"]`), `app/src-tauri/Cargo.toml` 无 `[[include]]`, `app/src-tauri/tauri.conf.json:29-39` 无 `bundle.resources` 声明.

- [ ] **Step 4: 起草 §3 邮件收发**

合并任务 3 + 4 + 5 的 findings, 重组为:
- §3.1 接收: imap / sync_loop / parser / db / commands (直接搬任务 3 findings)
- §3.2 发送: smtp / scheduled_send / send_message (直接搬任务 4 findings)
- §3.3 IPC 一致性: 搬任务 5 findings, 列出每对 safeInvoke ↔ #[tauri::command]

- [ ] **Step 5: 起草 §4 HTML 渲染**

搬任务 6 findings, 加一行"渲染方式 + sanitizer 状态 + cid: + 外链 + 长 URL 折行" 总结.

- [ ] **Step 6: 起草 §5 链接可点击**

搬任务 7 findings, 加一行"href 渲染 + 点击处理 + mailto + 安全 + opener 集成" 总结.

- [ ] **Step 7: 起草 §6 测试运行结果**

表格, 7 行:

| 命令 | 状态 | 关键输出 | 日志 |
|---|---|---|---|
| pnpm typecheck | ✅ pass | 0 errors | qa-tmp/audit-2026-08-11-pnpm-typecheck.log |
| pnpm test | ✅ pass | 142/142 | qa-tmp/audit-2026-08-11-pnpm-test.log |
| pnpm e2e | 🟡 skipped | browsers not installed | qa-tmp/audit-2026-08-11-pnpm-e2e.log |
| pnpm lint | ✅ pass | 0 errors | qa-tmp/audit-2026-08-11-pnpm-lint.log |
| cargo build | ✅ pass | 0 errors | qa-tmp/audit-2026-08-11-cargo-build.log |
| cargo test | ✅ pass | 38/38 | qa-tmp/audit-2026-08-11-cargo-test.log |
| cargo clippy | 🟡 12 warnings | clippy::needless_borrow 等 | qa-tmp/audit-2026-08-11-cargo-clippy.log |

(数字按实际跑出来的填. 跑出啥就写啥, **不** 改实际数字.)

- [ ] **Step 8: 起草 §7 风险排序的修复候选清单**

按风险 (高/中/低) × 修复成本 (小/中/大) 排序. 每条:

```markdown
- [HIGH] [cost-S] `MessagePanel` 无 sanitizer, 邮件 HTML 直插 DOM — XSS 风险
  涉及: app/src/panels/MessagePanel.tsx
  建议: 引入 DOMPurify (前端, 已有 SolidJS 生态适配)
```

只列**确认存在的**问题 (来自 findings 的 ❌/🟡), **不**臆造.

- [ ] **Step 9: 自审 — 报告每条 ✅/🟡/❌ 都有 file:line 证据**

```bash
grep -E "^- (✅|🟡|❌)" docs/superpowers/audit/2026-08-11-email-html-link-audit.md
```

对每条判定, 在原文里搜配对的 `file:line` 引用. 没引用的补上.

- [ ] **Step 10: 自审 — 报告无 `SENDPALM_TEST_PASSWORD` 字面值**

```bash
grep -rn "SENDPALM_TEST_PASSWORD" docs/superpowers/audit/2026-08-11-email-html-link-audit.md
```

预期: 只命中变量名引用, 不命中密码值. 如有, 删除密码值.

---

## Task 9: 提交报告 + 收尾

**Files:**
- Create: `docs/superpowers/audit/2026-08-11-email-html-link-audit.md` (任务 8 已写)
- Stage: 报告 + 8 个日志 + 4 个 findings 草稿

- [ ] **Step 1: 检查 git 状态**

```bash
cd /Users/edwinhao/sendpalm
git status --short
```

预期: 看到 `M app/vite.config.ts`, `M AGENTS.md` (已 commit, 任务 1), `?? docs/superpowers/audit/2026-08-11-email-html-link-audit.md`, `?? qa-tmp/audit-2026-08-11-*.log`, `?? qa-tmp/audit-2026-08-11-*.txt`, `?? qa-tmp/audit-2026-08-11-*.md`.

- [ ] **Step 2: 检查无 `.env` 文件被误 stage**

```bash
git diff --cached --name-only | grep -E "\.env$|password|secret" || echo "ok no secrets"
```

预期: 无. 如果有, 立刻 `git reset` + 报告里说明.

- [ ] **Step 3: 提交报告**

```bash
cd /Users/edwinhao/sendpalm
git add docs/superpowers/audit/2026-08-11-email-html-link-audit.md \
        qa-tmp/audit-2026-08-11-*.log \
        qa-tmp/audit-2026-08-11-*.txt \
        qa-tmp/audit-2026-08-11-*.md
git commit -m "docs(audit): sendpalm email+html+link audit 2026-08-11" \
  -m "Read-only audit per spec 2026-08-11. No email/HTML/link code
changes. Findings include send/receive (imap+sync_loop+parser
+smtp+scheduled_send), IPC consistency (safeInvoke ↔
#[tauri::command]), HTML rendering (MessagePanel sanitizer
state, cid:, long-URL wrapping), and link clickability
(opener integration, mailto, javascript: filter, target=_blank
rel). 7 test commands run; raw logs under qa-tmp/.

Per AGENTS §10.5: no SENDPALM_TEST_PASSWORD literal in any
file. Per spec §3: no PROGRESS.md update (non-milestone)."
```

- [ ] **Step 4: 验证 commit**

```bash
git log --oneline -3
git show --stat HEAD
```

预期: 看到 2 个 commit (任务 1 + 任务 9), HEAD 包含报告 + 12 个 audit artifact.

- [ ] **Step 5: 收尾 — 报告链接发回给用户**

向用户报告:
- 报告路径: `docs/superpowers/audit/2026-08-11-email-html-link-audit.md`
- 隔离 commit SHA: (任务 1)
- 报告 commit SHA: (任务 9)
- TL;DR 摘要 (从任务 8 step 1 抄)
- "请审 §7 修复候选清单, 决定修哪个; 本计划不修任何代码."

---

## Self-Review (per writing-plans skill)

**1. Spec coverage:**
- Spec §1 (背景) → 报告 §1 改动摘要 / 报告 §2 隔离验证 (任务 8 step 2-3) ✅
- Spec §2 (目标) → 报告 §TL;DR / §1-7 (任务 8 step 1-8) ✅
- Spec §3 (非目标) → 报告 §1 不写修改邮件代码; plan 全部任务零代码改动 (除任务 1 vite.config.ts + AGENTS.md) ✅
- Spec §4 (隔离改动) → 任务 1 (vite.config.ts) + 任务 1 (AGENTS.md) + 任务 8 (报告) ✅
- Spec §5.1 (邮件收发审计) → 任务 3 + 4 + 5 ✅
- Spec §5.2 (HTML 渲染审计) → 任务 6 ✅
- Spec §5.3 (链接可点击审计) → 任务 7 ✅
- Spec §5.4 (命令清单) → 任务 2 ✅
- Spec §6 (报告结构) → 任务 8 step 1-8 严格按 7 节结构 ✅
- Spec §7 (风险) → 任务 2 step 4 (e2e skip 注释), step 6 (cargo build 慢注释), step 8 (clippy 退一步注释) ✅
- Spec §8 (Definition of Done) → 任务 9 step 4 验证 + 报告每条引用证据由任务 8 step 9 自审 ✅
- Spec §9 (后续) → 任务 9 step 5 把修复候选清单路径告诉用户 ✅

**2. Placeholder scan:**
- "TBD" / "TODO" / "implement later" / "fill in details" → 0 (已 grep 整份 plan)
- "Similar to Task N" → 0
- 模糊动作 ("add appropriate error handling") → 0

**3. Type/接口 一致性:**
- 任务 3/4 写 `findings-{receive,send}.md`; 任务 8 step 4 引用相同路径 — 一致 ✅
- 任务 5 写 `findings-ipc.md`; 任务 8 step 4 引用 — 一致 ✅
- 任务 6/7 写 `findings-{html,link}.md`; 任务 8 step 5-6 引用 — 一致 ✅
- 任务 2 写 `qa-tmp/audit-2026-08-11-summary.txt`; 任务 8 step 7 引用 — 一致 ✅
- 任务 1 commit message 引用 spec 锚点 §4.1; 任务 8 step 2 commit message 引用 spec 锚点 §5/§3 — 一致 ✅
