# SendPalm 邮件 / HTML / 链接 审计 (2026-08-11)

## TL;DR

邮件接收 ✅ / 发送 ✅ / **IPC 一致性 ❌ (6/12 命令静默断裂)** / HTML 渲染 🟡 / **链接可点击 ❌**. 关键 bug: Compose 的 `send_message` 因 snake_case↔camelCase 不匹配**实际不发送**(返回 `null`);邮件内 `<a>` 点击被 iframe 沙箱吞掉、无 `opener.openUrl` 接管、`mailto:` 完全失效;`<img src>` 跟踪像素随开随泄无 "Show Images" 拦截。CI 现状: vitest **137/137 pass** (19 文件) · e2e **44 pass + 1 skip** · cargo test **62/62 pass** (15 suites) · cargo clippy **clean** · pnpm lint **1 pre-existing ESLint error** (`app/e2e/views.spec.ts:1` `@typescript-eslint/no-unused-vars`,非本次引入) · pnpm typecheck **clean**.

## 1. 改动摘要

本次审计计划实际写入磁盘的改动共 3 处 (per spec §4.1):

| # | 文件 | 改动 | Commit |
|---|---|---|---|
| 1 | `app/vite.config.ts:23-26` | `server.watch.ignored` 增加 `"**/.mddock/**"`,让 Vite 不再 watch mddock vault 状态目录 | `14393a1` (build(isolation): exclude .mddock from Vite watcher) |
| 2 | `AGENTS.md` §11 (Lessons learned) | 追加"本仓库被 mddock overlay" 一节,明确 `.mddock/` 不得被 SendPalm 工具链观察/编译/提交 | `14393a1` (同一 commit) |
| 3 | `docs/superpowers/audit/2026-08-11-email-html-link-audit.md` | 本报告 (Task 8 落地,Task 9 commit) | see Task 9 commit |

未触碰任何 `app/src/**` / `app/src-tauri/src/**` / `app/package.json` / `app/src-tauri/Cargo.toml` 邮件/HTTP/链接相关代码。

## 2. 隔离验证

### 2.1 Vite watcher — 修改前 vs 修改后

**Before** (`app/vite.config.ts:23-26` 旧版):

```ts
watch: {
  ignored: ["**/src-tauri/**"],
},
```

后果: Vite 隐式 watch 仓库根目录,`.mddock/` 下 tantivy 索引重建 + `audit.db` / `blobs.db` 写入会触发 Vite rebuild / HMR 抖动。

**After** (`app/vite.config.ts:23-26`,commit `14393a1`):

```ts
watch: {
  // tell Vite to ignore watching `src-tauri` and the mddock vault overlay
  // (AGENTS.md §11: this repo is overlaid by mddock at .mddock/)
  ignored: ["**/src-tauri/**", "**/.mddock/**"],
},
```

Vite 不再触发 `.mddock/` 目录写入引起的 rebuild。

### 2.2 天然隔离 (无需修改,报告中注明)

| 配置 | 当前状态 | 结论 |
|---|---|---|
| `app/tsconfig.json:32` | `include: ["src"]` | ✅ 天然不包含 `.mddock/` |
| `app/src-tauri/Cargo.toml` | 无 `[[include]]` / 无 `[package] exclude` 字段,`cargo build` 只看 `src/` + `migrations/` + `tests/` | ✅ 天然隔离 |
| `app/src-tauri/tauri.conf.json:29-39` | `bundle.resources` 未声明 `.mddock/` 路径;`csp: null` 仅影响 webview CSP,不影响 bundle 包含 | ✅ 天然隔离 (但 CSP 关闭的风险在 §5 安全条目下提) |
| `.gitignore` | `.mddock/*` + `!.mddock/mddock.md` | ✅ 已正确 |

## 3. 邮件收发 (Send / Receive)

### 3.1 接收 (imap.rs / sync_loop.rs / parser.rs / db / commands)

**imap.rs:**

- ✅ TLS handshake 路径在 `app/src-tauri/src/services/imap.rs:90-93` (`.connect(...).map_err(|e| format!("imap tls: {e}"))?`),type alias `Session<TlsStream<Compat<TcpStream>>>` 在 `app/src-tauri/src/services/imap.rs:271`.
- 🟡 **TLS 实现与 AGENTS §10.5 spec 文字不符**: 用了 `async-native-tls` + `native-tls` (`app/src-tauri/Cargo.toml:32-33`),不是 spec 写的 `SslTunnel`. 功能等价 (都是 TLS),纯文字差异.
- ✅ `SELECT INBOX` 显式调用在 `app/src-tauri/src/services/imap.rs:193-197` (`session.select(&wire_name)...`),INBOX 是 sync 的默认 mailbox (`app/src-tauri/src/services/sync_loop.rs:562-563`).
- ❌ **`session.fetch` 应该是 `session.uid_fetch`**: `app/src-tauri/src/services/imap.rs:212-215` 传 UID range `"12345:12544"` 给的是 **sequence-FETCH**,不是 UID-FETCH. 全新邮箱(序列号≈UID)凑巧能用;**任何 expunge / 删除后,序列号 ≠ UID,会拉错消息**. 注释 `app/src-tauri/src/services/imap.rs:201-205` 自称 "async-imap interprets the range `a:b` as UID",与 async-imap 文档不符 (UID 语义需要 `uid_fetch`).
- ✅ `MAX_PER_TICK = 200` 常量在 `app/src-tauri/src/services/imap.rs:18`,符合 AGENTS §10.5 "chunked backfill" 要求.
- ✅ 错误传播: 11 个 `.map_err(...)?` 站点(`imap.rs:81, 85-86, 93, 99, 109, 128, 131, 197, 215, 218` 等)全部映射为描述性 `String` 并 `?` 传播.

**sync_loop.rs:**

- ✅ Cursor 推进通过 pure helper `advance_cursor` (`app/src-tauri/src/services/sync_loop.rs:672-689`),`sync_folder` 在 `app/src-tauri/src/services/sync_loop.rs:730-734` 调用,文档明确"never advances past a failed UID".
- ❌ **UIDVALIDITY 失效无检测**: `app/src-tauri/src/services/imap.rs:199` 捕获 `uid_validity` 存盘 (`app/src-tauri/src/services/sync_loop.rs:646-666` `save_folder_sync_state`),但**没有**任何 `if new_uv != old_uv { reset_cursor_to_0() }` 之类的检查 (`grep "invalidate" sync_loop.rs` → 0 matches). RFC 3501 §6.4.8 要求 UIDVALIDITY 变化时清空 UID 缓存;当前实现会**跨 validity 边界继续用旧 UID namespace**,静默拉错消息.
- ✅ backfill chunk loop 在 `app/src-tauri/src/services/sync_loop.rs:707-743` (显式 `loop { ... if bundle.messages.len() < MAX_PER_TICK { break } }`).
- 🟡 副作用: `app/src-tauri/src/services/sync_loop.rs:592` 失败时 `save_folder_sync_state(pool, &state_key, start_uid, 0)` 把 `uid_validity` 重置为 0,下次启动会误认为 validity 未设置.

**parser.rs:**

- ✅ `mailparse::parse_mail` 在 `app/src-tauri/src/services/parser.rs:8, 50`.
- ✅ 头/正文/附件/multipart 四类抽取齐全 (`parser.rs:61, 70, 77-78, 167-198, 200-219, 221-225, 305-340`):
  - `subject` — `app/src-tauri/src/services/parser.rs:70`
  - `from` — `app/src-tauri/src/services/parser.rs:61` (`parse_address_pair` helper at `parser.rs:107-135`)
  - `body_text` — `app/src-tauri/src/services/parser.rs:77` (`extract_text` at `parser.rs:167-198`)
  - `attachments` — `app/src-tauri/src/services/parser.rs:78` + `parser.rs:221-225` (`collect_attachments`) + `parser.rs:305-340` (`walk_attachments`)
  - `multipart/alternative` — `parser.rs:176, 187` 递归走 subparts
- ✅ `text/html` 抽取在 `app/src-tauri/src/services/parser.rs:79` (`extract_html(&parsed).map(|html| rewrite_inline_images(...))`),函数体在 `parser.rs:200-219`,测试 `parses_html_part` (`parser.rs:425-449`) 断言 `<p>hi</p>`.
- ✅ `text/plain` 优先, fallback 到 `text/html` (`parser.rs:167-198`),`multipart/alternative` 正确选 `text/plain`,测试 `parser.rs:443` 断言.
- ✅ 测试覆盖: `parses_basic_headers` (`parser.rs:384-393`)、`decodes_attachment` (`parser.rs:451-483`)、`parses_html_part` (`parser.rs:425-449`).

**db.rs + 0001_init.sql + 后续迁移:**

- ✅ 所有 `Message` DTO 字段 (`app/src/types/index.ts:142-172`) 被 m001 (`0001_init.sql:65-89`) + m002 (`0002_calendar.sql`) + m004 (`0004_body_html.sql`) + m006 (`0006_message_direction.sql`) + m010 (`0010_trash_expiry.sql`) 共同覆盖;接收 INSERT (`app/src-tauri/src/services/sync_loop.rs:781-784`) 写入所有字段.
- 🟡 风险: 任何未来迁移删除某列或 `lib.rs:22-113` 漏注册,接收 INSERT (`sync_loop.rs:782-783`) 会运行时炸;`0001_init.sql` 单文件不是最终 schema.
- ✅ `app/src-tauri/src/services/db.rs:6-21` `merge_json_array` helper 给 `sync_loop.rs:1127, 1201` 做 attachment 合并,接收链路正确.

**commands/message.rs:**

- ❌ **不存在** `app/src-tauri/src/commands/message.rs` (目录只有 `mod.rs` 和 `notification_settings.rs`).
- ✅/🟡 消息读取走 `tauri-plugin-sql` 直接 SQL,不经过 Rust command: `app/src-tauri/Cargo.toml:18` (`tauri-plugin-sql = { version = "2", features = ["sqlite"] }`),plugin 注册在 `app/src-tauri/src/lib.rs:132-136`,前端读路径 `app/src/stores/data.ts:687-692` (`db.select("SELECT * FROM messages ORDER BY st DESC")`) + `app/src/stores/data.ts:147-177` (`rowToMessage` 显式映射 `r.body` / `r.body_html` 等). 不是 bug,只是没按 brief 假设的"独立 Rust command"组织.
- ✅ `body_html` 在 IPC 响应: `data.ts:154` (`r.body_html as string | null` → `bodyHtml`).
- ✅ `body` 在 IPC 响应: `data.ts:153` (`r.body as string` → `body`).
- ✅ 序列化走 `serde_json` (`app/src-tauri/Cargo.toml:27`).

### 3.2 发送 (smtp.rs / scheduled_send.rs / send_message)

**smtp.rs:**

- ✅ `lettre::AsyncSmtpTransport<Tokio1Executor>` 构造: `app/src-tauri/Cargo.toml:34` (`lettre = { ..., features = ["tokio1-rustls-tls", "ring", "rustls-native-certs", "builder", "smtp-transport"] }`),`app/src-tauri/src/services/smtp.rs:147-166` (`transport()` 方法按 `smtp_implicit_tls` 选 `relay` 或 `starttls_relay`),handle 缓存在 `app/src-tauri/src/services/smtp.rs:22-26` (`Arc<Mutex<Option<...>>>`).
- ✅ 完整编码: `Message::builder()` headers (`app/src-tauri/src/services/smtp.rs:118-137`) + `MultiPart::alternative()` text+html (`smtp.rs:100-104`) + `MultiPart::mixed()` 包 attachments (`smtp.rs:105-116`),pre-built `Message-ID: <sendpalm-{uuid}@sendpalm>` 在 `smtp.rs:58, 121`. From / Reply-To 走 `lettre::message::Mailbox` parse (`smtp.rs:54-64`).
- ✅ TLS 路径符合 AGENTS §10.5: rustls provider + ring crypto + OS native certs,implicit-TLS (port 465) 走 `relay`,STARTTLS (port 587) 走 `starttls_relay`. provider preset (`app/src-tauri/src/services/providers.rs:103-141`) 默认 `smtp_port: 465, smtp_implicit_tls: true`. 无 `dangerous_skip_tls` 覆盖.
- ✅ 鉴权 / relay / send 错误全部 `?` 传播并 `format!("...: {e}")` (10 个 `.map_err(...)?` 站点,主发送路径 `app/src-tauri/src/services/smtp.rs:84` 把 `SmtpError` (含 535) 渲染为 `"smtp send: ..."`).
- 🟡 错误全部扁平化为 `String` (`smtp.rs:54, 55, 56, 57, 63-64, 84, 111, 136, 155, 158` 全部 `format!("...: {e}")`),JS caller 只能文本匹配,不能区分 auth/DNS/TLS (Tauri `Result<_, String>` 接口,可接受).

**scheduled_send.rs:**

- ✅ 触发: `app/src-tauri/src/services/scheduled_send.rs:16` (`POLL_INTERVAL: Duration = from_secs(60)`),`start()` (`scheduled_send.rs:19-25`) 用 `tauri::async_runtime::spawn`,`run_loop` (`scheduled_send.rs:27-36`) 是 `loop { tick(...).await; sleep(60s).await }`,启动于 `app/src-tauri/src/lib.rs:127` (`services::scheduled_send::start(app.handle().clone())`).
- 🟡 **错误只写 stderr,无 persisted audit**: `app/src-tauri/src/services/scheduled_send.rs:22, 32, 51, 143` 4 处 `eprintln!`,release build stderr 被丢弃. 无 `audit` 表、无 `log::error!` / `tracing` 框架. 用户**无法发现**失败的 scheduled send.
- 🟡 **无 retry counter / `failed` status**: `app/src-tauri/src/services/scheduled_send.rs:50-54` 注释自己承认 ("we may want a retry counter / 'failed' status"),坏 credentials 的 draft 每 60 s 重试一次,stderr 一行/分钟,无穷无尽.

**commands/mod.rs::send_message:**

- ❌ **JS 用了 snake_case keys 但 Tauri 2 macro 默认期望 camelCase** (`app/src/services/backend.ts:66-79` ↔ `app/src-tauri/src/commands/mod.rs:84-95`): 9 个 snake_case Rust 形参 (`to`, `subject`, `body`, `html_body`, `account_id`, `attachments`, `cc`, `bcc`, `from_override`) 中,前 6 个与 camelCase 同形可 deserialize,后 3 个 (`html_body` / `account_id` / `from_override` → 期望 `htmlBody` / `accountId` / `fromOverride`) 反序列化失败 → `Err(String)` → `safeInvoke` 吞 → 返回 `null` → **Compose 点 Send 邮件没发**. 见 §3.3 item 1 完整配对分析 — 这是本次审计的 headline finding 之一.
- ✅ 错误传播: 8 处 `?` 站点 (`commands/mod.rs:100, 102, 108, 117, 121-122, 162, 174-185`) 把 credential / settings / address parse / base64 decode / SMTP send 错误一路送回 `Result<SendResult, String>`.
- 🟡 **本地 Sent 副本吞错**: `commands/mod.rs:189-212` 用 `.ok()` 默默吞掉 `open_pool` / `app_data_dir` / `save_sent_message` 失败. SMTP 成功 + 本地副本失败时,前端拿到 `local_message_id: None` 无法区分"SMTP + 本地都成功" vs "SMTP 成功本地失败".

### 3.3 IPC 一致性 (safeInvoke ↔ #[tauri::command] — 6 of 12 silently broken)

> **Headline finding**: 6 of 12 active `#[tauri::command]` handlers 因 JS payload key 用 snake_case 而 Rust 期望 camelCase,反序列化失败;`safeInvoke` shim 吞错返回 `null`,**调用方无报错**,用户看不出坏. 这是 AGENTS §10.5 明文警告的"silently broken"陷阱的活样本.

Tauri 2 macro 默认 auto-rename Rust `snake_case` 参数 → JS 期望 camelCase keys (`https://v2.tauri.app/develop/calling-rust/`). 已比对 12 对 call sites (`app/src/services/backend.ts` 11 + `app/src/services/notifications.ts:44` 1) 与 12 个 Rust handlers (`app/src-tauri/src/commands/mod.rs:24-360` + `app/src-tauri/src/commands/notification_settings.rs:5-12`).

| # | Command | Status | Bug location | JS 发送 | Rust 期望 (camelCase) |
|---|---|---|---|---|---|
| 1 | `send_message` | ❌ MISMATCH | `backend.ts:66-79` (调用), `commands/mod.rs:84-95` (形参) | `html_body`, `account_id`, `from_override` | `htmlBody`, `accountId`, `fromOverride` |
| 2 | `list_mailboxes` | ❌ MISMATCH | `backend.ts:83-85` ↔ `commands/mod.rs:69` | `account_id` | `accountId` |
| 3 | `sync_now` | ❌ MISMATCH | `backend.ts:93` ↔ `commands/mod.rs:24-27` | `account_id` | `accountId` |
| 4 | `get_sync_state` | ✅ MATCH | `backend.ts:97` ↔ `commands/mod.rs:221` | `accountId` | `accountId` |
| 5 | `list_email_providers` | ✅ MATCH | `backend.ts:110` ↔ `commands/mod.rs:234` | (no args) | — |
| 6 | `vault_save` | ✅ MATCH | `backend.ts:120` ↔ `commands/mod.rs:239` | `accountId`, `password` | `accountId`, `password` |
| 7 | `vault_load` | ✅ MATCH | `backend.ts:125` ↔ `commands/mod.rs:244` | `accountId` | `accountId` |
| 8 | `vault_delete` | ✅ MATCH | `backend.ts:129` ↔ `commands/mod.rs:249` | `accountId` | `accountId` |
| 9 | `add_calendar_event` | ⚠️ TYPES-DISAGREE / RUNTIME-OK | `backend.ts:150` ↔ `commands/mod.rs:255-258`, nested `IcalEvent` 在 `services/ical.rs:24-35` | `contactId` (top-level ✅); nested fields: `dtstartTzid`/`dtendTzid`/`all_day` 类型分歧 (`types/index.ts:174-183` 用 camelCase,`backend.ts:135-144` 用 snake_case) | `contactId` (✅); nested serde 字段无 `rename_all`,按 Rust 字段名 (snake_case) deserialize |
| 10 | `get_attachment_content` | ✅ MATCH | `backend.ts:156` ↔ `commands/mod.rs:304` | `fileId` | `fileId` |
| 11 | `get_attachment_path` | ✅ MATCH | `backend.ts:162` ↔ `commands/mod.rs:332` | `fileId` | `fileId` |
| 12 | `notify_settings_changed` | ❌ MISMATCH | `notifications.ts:44-48` ↔ `notification_settings.rs:5-12` | `desktop_enabled`, `quiet_hours_enabled`, `quiet_hours_start`, `quiet_hours_end` | `desktopEnabled`, `quietHoursEnabled`, `quietHoursStart`, `quietHoursEnd` |

**实际静默坏掉的命令 (用户视角)**:

- **❌ `send_message` (Compose 邮件发送)**: `backend.ts:72, 73, 77` 三个 snake_case key 不被 macro 识别,反序列化抛错 → `safeInvoke` 吞 → 返回 `null`. **用户点 Send,UI 没反应,邮件没发.** (这是 §3.2 提到的"参数名匹配 JS"那个 ✅ 判定的反转: Rust ↔ JS 形参名一致, 但 Tauri macro 的 rename 默认行为让一致变成了错.)
- **❌ `sync_now` (手动同步)**: `backend.ts:93` `account_id` snake_case → 反序列化失败 → 同步按钮是 no-op,用户看不出.
- **❌ `notify_settings_changed` (通知设置保存)**: `notifications.ts:45-48` 4 个 snake_case keys → 反序列化失败 → IPC throw → JS catch block 吞 (`notifications.ts` catch 注释自承 "Rust side will pick up the next store.set on app restart") → **设置要重启 app 才生效**.
- **❌ `list_mailboxes`**: `backend.ts:84` `account_id` snake_case → 返回 `null`,但 `backend.ts:86` 有 `r ?? []` fallback → UI 显示空 mailbox 列表,UI 无报错.
- **⚠️ `add_calendar_event`**: nested `IcalEvent` struct (`app/src-tauri/src/services/ical.rs:24-35`) 无 `rename_all`. 当前运行时 OK,因为 calendar data 是从 IMAP 解析出的 snake_case JSON → Rust serialize 写库 → 读出时已经是 snake_case → 直接走 snake_case deserialize. **类型谎言**: `app/src/types/index.ts:174-183` 用 camelCase (`dtstartTzid`/`dtendTzid`),`backend.ts:135-144` 用 snake_case (`dtstart_tzid`/`dtend_tzid`),且**两者都没有 `all_day` 字段** — Rust 端是 `all_day: bool` (非 Option),未来 JS 构造 invite 时缺 `all_day` 会默认 false (凑巧可工作),但若有人**新建**一个 IcalEvent,会用 `types/index.ts` 的 camelCase 形 → Rust 端 deserialize 不到 `all_day` 键 → 默认 false,且若字段将来改成非 Option 立刻炸.
- ❌/🟡 `greet` (`app/src/ipc/commands.ts:12`): 无 Rust handler,死代码,应删除 (非 correctness issue).

**修复路径** (两种一致方案,任选其一):

- **A. JS 改名 camelCase** (推荐 — 与已工作的 4 条命令一致: `get_sync_state`, `vault_*`, `get_attachment_*`):

  ```ts
  // send_message: backend.ts:72-77
  { htmlBody: htmlBody, accountId: accountId, ..., fromOverride: fromOverride }
  // sync_now / list_mailboxes
  { accountId: accountId, mailbox }
  // notify_settings_changed: notifications.ts:45-48
  { desktopEnabled, quietHoursEnabled, quietHoursStart, quietHoursEnd }
  ```

- **B. Rust 加 `#[tauri::command(rename_all = "snake_case")]`** (替代 — JS diff 少,但 `get_sync_state` / `vault_*` / `get_attachment_*` 已用 camelCase JS keys,加这条 attr 会反向炸掉它们): 仅加在 `send_message`, `sync_now`, `list_mailboxes`, `notify_settings_changed`.
- 对 `IcalEvent` (item 9): `services/ical.rs:24-35` struct 加 `#[serde(rename_all = "camelCase")]`,或者修正 TS interface 到 `dtstart_tzid` / `all_day` 并加注释警告 `all_day` 缺失默认 false.

## 4. HTML 渲染 (iframe srcdoc + cid: data: URL + tracking gate missing + no table/blockquote styles)

> **渲染方式**: `<iframe srcdoc sandbox="allow-same-origin">`,非 `innerHTML`. **Sanitizer 状态**: 无 DOMPurify / sanitize-html,全靠 sandbox 隔离 (无 `allow-scripts`). **cid:** Rust parser 重写为 `data:` base64 URL (无 `attachment://` scheme). **外链 `<img>`**: 无拦截 / proxy / "Show Images" 闸. **长 URL**: 全局 `p { overflow-wrap: anywhere }` 已覆盖.

**MessagePanel.tsx 渲染入口:**

- ✅ **iframe srcdoc 渲染,非 innerHTML**: `app/src/panels/MessagePanel.tsx:62-77` `htmlEmailSrcdoc(html)` 拼字符串到 `<body>${html}</body>` (不转义、不 sanitize,但由 sandbox 隔离);iframe 使用在 `MessagePanel.tsx:1052-1075` (`srcdoc={...} sandbox="allow-same-origin"`,无 `name`).
- 🟡 **Sanitizer 缺失**: `app/package.json:23-35` 依赖列表无 DOMPurify / sanitize-html / jsdom-as-browser. 当前 sandbox 已拦脚本,但任何未来加 `allow-scripts` 或迁移渲染到主 DOM 都会立刻变 XSS sink (defense-in-depth 缺口).
- 🟡 **Sandbox 边界**: `MessagePanel.tsx:1067` 只给 `allow-same-origin`,全仓 grep `allow-popups` / `allow-top-navigation` / `allow-scripts` / `allow-forms` → **0 matches**. 有效屏障: `<script>` 不执行 ✅ / `<iframe src>` 不嵌套 ✅ / `<form>` 不提交 ✅ / `window.open()` 不弹窗 ✅ / 顶层导航不替换 webview ✅. 副作用: 父页 `el.contentDocument` 在 `MessagePanel.tsx:1056` 可读 iframe (`allow-same-origin`),未来加 `allow-scripts` 时 iframe 内脚本能读父 origin cookies/localStorage/Tauri APIs.
- 🟡 **`cid:` 重写为 `data:` base64 URL** (`app/src-tauri/src/services/parser.rs:227-247` `rewrite_inline_images`),inline 图片能渲染. 但: 全仓 `grep "attachment://"` → 0 matches (brief 假设的 scheme 不存在);base64 嵌入 `body_html` 列**无大小限制**,恶意邮件塞 10 MB inline 图会让 messages 表臃肿.
- ❌ **外链 `<img>` 无拦截 / proxy / lazy**: `MessagePanel.tsx:62-77` srcdoc `<style>` 只覆盖 `html/body/img/a/pre` 四个选择器,无外链拦截策略;`app/src/utils/trackers.ts:1-45` `detectTrackers` 只**展示** trackers 计数 (在 `MessagePanel.tsx:443-450`),不改 HTML. **跟踪像素、社交预览图、远程 logo 在打开邮件时自动加载**,泄露"已读 + UA + IP + 阅读时间"给第三方. HEY/Gmail 默认要求用户点 "Show images" 才显示 — SendPalm 无此开关.

**样式:**

- ✅ 长 URL 折行: `app/src/styles/base.css:48-51` 全局 `p { overflow-wrap: anywhere }` (per AGENTS §11 lesson);`MessagePanel.tsx:72` srcdoc 内联 `<style>` 也覆盖 `<pre>`;`MessagePanel.tsx:1033` plain text `<div>` 双保险 (`overflow-wrap: anywhere; word-break: break-word`);`MessagePanel.tsx:1014-1018` source mode `<pre>` 同样覆盖.
- 🟡 `a { ... }` (`base.css:53-57`) 无显式 `overflow-wrap: anywhere`,但继承父级 `<p>` 已声明,实际不溢出 — 未必要修.
- ❌ **`<table>` / `<blockquote>` 无样式**: `app/src/panels/MessagePanel.tsx` 中无 `table` / `blockquote` 字 (`grep "table\|blockquote" MessagePanel.tsx` → 0 matches);`app/src/styles/` 内无 `table` / `blockquote` 选择器 (3 处误命中 `grid-template-columns` × 2 + `--sidebar-width-tablet` × 1 已排除);`MessagePanel.tsx:62-77` srcdoc 内联 `<style>` 也未覆盖 `<table>` / `<th>` / `<td>` / `<blockquote>` / `<h1-h6>` / `<ul>` / `<ol>`. HTML 邮件 layout `<table>` 渲染成 1990s 默认样式 (无 padding / 无 border-collapse);`<blockquote>` 无左边框 / 缩进.

**类型 & 数据流:**

- ✅ `bodyHtml` 字段在 `app/src/types/index.ts:148` (`bodyHtml?: string | null`) + `app/src/stores/data.ts:154` (`rowToMessage` 显式映射 `r.body_html` → `bodyHtml`);SQL 写入 `data.ts:708-715` UPSERT `body_html=excluded.body_html`.
- ✅ 序列化手动 snake_case → camelCase (`data.ts:147-177`),不走 IPC macro `rename_all`,因为这条路径是 `tauri-plugin-sql` 直接 SQL.

**视图模式:**

- ✅ 三种 view mode (`rendered` / `plain` / `source`) 在 `MessagePanel.tsx:60, 97`;只在 `rendered` + `m.bodyHtml` 走 iframe (`MessagePanel.tsx:1024-1026`),其他 fallback 纯文本 (`MessagePanel.tsx:1024-1049`) 或 source (`MessagePanel.tsx:993-1022` <pre>). Plain / Source 模式无 XSS 风险 (默认转义).

**测试覆盖:**

- 🟡 无 `MessagePanel.tsx` 渲染路径的单元 / e2e 测试. `app/src/test/html.test.ts` 只测 `htmlToPlainText` / `plainTextToHtml` (Compose 路径);e2e (`app/e2e/workflows.spec.ts:77, 756`) 把 `bodyHtml` 设为 `null`,绕开 iframe 路径. 无"渲染含 cid: / 含 tracker / 含大 inline 图"用例.

## 5. 链接可点击 (clicks do nothing + mailto dead + plain-text no auto-link + no opener integration)

> **`<a href>` 渲染**: 原样保留,Rust 不重写 (`parser.rs:79, 227-247` 只动 `cid:`). **点击处理**: iframe `onload` 只设 `scrollHeight`,无 click 拦截 / 无 `opener.openUrl` 接管. **`mailto:`**: 全仓 0 matches,iframe 内 mailto 默认不触发 OS handler. **安全**: 无显式 `javascript:` 过滤;入站 `<a target="_blank">` 不补 `rel="noopener noreferrer"`. **plain-text**: 无 URL 自动识别. **`opener` 集成**: `openUrl` / `open_url` 全仓 0 matches,`plugin-opener` 只在 `FilePanel.tsx:11` 用于 `openPath`(本地文件).

**`<a href>` 渲染保留:**

- ✅ `app/src-tauri/src/services/parser.rs:79` `extract_html(&parsed).map(|html| rewrite_inline_images(&html, &attachments))` — 整个 HTML 写入 `body_html` 列前**只**过一次 `rewrite_inline_images`,**不**动 `<a>` 属性;`parser.rs:227-247` 只替换 `cid:` 为 `data:`,不动 `<a href>`;全仓 `grep "href\|<a\|target=\|rel=\|noopener\|noreferrer\|javascript:" parser.rs` → 0 matches;`MessagePanel.tsx:62-77` `htmlEmailSrcdoc` 直接 `${html}` 注入,无 `<a>` 重写. 邮件 HTML 里 `<a href="..." target="..." onclick="..." style="...">` 原样进 iframe.

**点击处理:**

- ❌ **iframe 内 `<a>` 点击无拦截**: `app/src/panels/MessagePanel.tsx:1052-1075` iframe `ref={(el) => { el.onload = () => { try { const doc = el.contentDocument; if (doc) { el.style.height = `${doc.body.scrollHeight + 16}px`; } } catch { /* sandboxed */ } } }}` — `onload` 回调**只**读 `scrollHeight` 设 iframe 高度,**不**注册 click 监听,**不**调 `opener.openUrl`;`MessagePanel.tsx` 全仓 `grep "opener"` → 0 matches;`app/src/ipc/commands.ts` 全文 13 行只有 `pingGreet`;`app/src/services/backend.ts` safeInvoke 命令列表**无 URL-opening 命令**;`@tauri-apps/plugin-opener` 全仓唯一 import 在 `app/src/panels/FilePanel.tsx:11` (`import { openPath } from "@tauri-apps/plugin-opener`),`openPath` 用于本地附件,**不**是 `openUrl`.
- 后果 (per sandbox 边界): iframe 沙箱**无** `allow-popups` → `<a target="_blank">` 不会真开新窗,只在 iframe 内导航;**无** `allow-top-navigation` → `<a target="_top">` 不替换 webview. 用户点邮件链接 → iframe 区域被替换成目标页/404,layout 错位,无 `history.back()` 回到邮件 (iframe 是 srcdoc 创建、无 `name`,**不**是顶层 window).

**`mailto:`:**

- ❌ 全仓 `grep "mailto:"` → 0 matches (`app/src/` 和 `app/src-tauri/src/`);`parser.rs` 不识别 `mailto:`;iframe 内 mailto 默认**不**触发 OS handler (iframe 内 mailto 在沙箱下 no-op). 用户**不能**从邮件里"回复发件人"或"加联系人". `@tauri-apps/plugin-opener` 也**没**用 `openUrl("mailto:...")`.

**`javascript:` 过滤:**

- ❌/🟡 全仓 `grep "javascript:" app/src/` → 0 matches. 前端 / Rust 都不清洗 `javascript:` scheme. **当前不构成漏洞** (sandbox 无 `allow-scripts`,浏览器对 `javascript:` 在 srcdoc iframe 中是 no-op),但**未来**给 iframe 加 `allow-scripts` 或迁移到主 DOM 时立刻变 XSS sink. Defense-in-depth 建议: parser 或 `htmlEmailSrcdoc` 加一行 `out.replace(/(href|src)\s*=\s*"\s*javascript:[^"]*"/gi, '$1="#"')`.

**`target="_blank"` + `rel="noopener noreferrer"`:**

- 🟡 **外发邮件 ✅ / 入站邮件 ❌**: `app/src/utils/html.ts:29` `plainTextToHtml` 给 Compose (外发) 自动加 `target="_blank" rel="noopener noreferrer"`;`MessagePanel.tsx` 不重写入站 `<a>`,已存在的 `target="_blank"` 原样进 iframe. **当前** sandbox 无 `allow-popups` → `target="_blank"` 不开新窗 → 无 `window.opener` 攻击面. **未来**一旦接"父页接管 click → opener.openUrl"设计 (Task 7 的预期修法),必须**在重写层**统一加 `rel="noopener noreferrer"`,否则新开浏览器 tab 可反向 `window.opener.location = ...` 篡改 opener URL.

**plain-text 视图 URL 自动识别:**

- ❌ `app/src/panels/MessagePanel.tsx:1024-1049` 纯文本 fallback 用 `<p>{p}</p>` 直接插字符串,无 URL → `<a>` 转换;`MessagePanel.tsx:1790-1798` `formatBodyParagraphs` 只按空行/换行切分,不识别 URL;`app/src/utils/html.ts:21-32` `plainTextToHtml` **有**自动链接逻辑但**只被 Compose 用** (`grep "plainTextToHtml" app/` → `Compose.tsx:108, 346`, `test/html.test.ts:2, 4, 18, 20, 25, 30`),incoming 渲染路径**不**调用此函数. 即便调用,也只匹配 `https?://` 前缀,`mailto:` / `tel:` / bare domain 都不识别.

**`opener.open_url` 整合:**

- ❌ 全仓 `grep "openUrl\|open_url"` → 0 matches;`@tauri-apps/plugin-opener` 全仓只 import 1 次 (`FilePanel.tsx:11` `openPath`);`app/src/ipc/commands.ts` 只有 `pingGreet`;`app/src/services/backend.ts` safeInvoke 无 URL 相关命令;`app/src-tauri/src/commands/` 无 `opener.rs` / `link.rs` 模块. SendPalm **有** opener plugin 但**没有任何路径**调用 `opener.openUrl(http_url)` 或 `opener.openUrl(mailto:...)`. HEY/Gmail/Outlook 默认"邮件链接 → 系统浏览器",SendPalm 完全缺失.

**`cursor: pointer` / `:visited` 样式:**

- 🟡 srcdoc 内联 `<style>` (`MessagePanel.tsx:71`) `a { color: #0A8F63 }` 不分状态,无 `:visited` / `:hover` / `cursor: pointer`. 浏览器默认给 `<a href>` `cursor: pointer` (UA stylesheet),但 `:visited` 紫色被 `a { color: ... }` 覆盖 → 所有 `<a>` 一种绿色,**已访问链接无视觉区分**,对识别钓鱼站无帮助. UX 细节,非安全/功能 bug.

**`tracker.rs` 不存在:**

- ❌ `find app -name "tracker.rs"` → 0 matches;`app/src-tauri/src/services/` 目录无 `tracker.rs` (`ls` → `db.rs`, `desktop_notifier.rs`, `ical.rs`, `imap.rs`, `mailbox_resolver.rs`, `mod.rs`, `parser.rs`, `providers.rs`, `scheduled_send.rs`, `smtp.rs`, `state.rs`, `sync_loop.rs`, `vault.rs`). `grep "tracker" app/src-tauri/src/` 仅 `sync_loop.rs:783, 1046` 中 `trackers_json` 列名引用,无 link rewriter. **链接重写在 Rust 侧完全不存在**,所有 link 重写 / 过滤 / 补 `rel` 责任都在前端 `MessagePanel.tsx` (目前**零**实现).

## 6. 测试运行结果

每条命令一行 + 关键输出;完整日志在 `qa-tmp/audit-2026-08-11-*.log`.

| 命令 | 状态 | 关键输出 | 日志 |
|---|---|---|---|
| `pnpm typecheck` | ✅ pass | 0 errors (`tsc --noEmit`, 无 stdout) | `qa-tmp/audit-2026-08-11-pnpm-typecheck.log` |
| `pnpm test` (vitest) | ✅ pass | **137 passed (137)**, 19 test files, 3.81s | `qa-tmp/audit-2026-08-11-pnpm-test.log` |
| `pnpm e2e` (Playwright) | 🟡 partial | **44 passed + 1 skipped**, 2.7m total (skip = `e2e/workflows.spec.ts:1147` Mobile reply flow) | `qa-tmp/audit-2026-08-11-pnpm-e2e.log` |
| `pnpm lint` (ESLint) | 🟡 1 pre-existing error | 1 error / 0 warnings in 1 file: `views.spec.ts:1` `@typescript-eslint/no-unused-vars` — **pre-existing**,非本次引入 | `qa-tmp/audit-2026-08-11-pnpm-lint.log` |
| `cargo build` | ✅ pass | 0 crates compiled (cache hit), `Finished dev profile in 1.04s` | `qa-tmp/audit-2026-08-11-cargo-build.log` |
| `cargo test` | ✅ pass | **62 passed (15 suites, 0.22s)** | `qa-tmp/audit-2026-08-11-cargo-test.log` |
| `cargo clippy` | ✅ clean | `cargo clippy: No issues found` | `qa-tmp/audit-2026-08-11-cargo-clippy.log` |

注: 跳过 `pnpm install` (`node_modules exists, skip`) 与 `SENDPALM_E2E_NETWORK=1` gated 测试 (`tests/imap_real.rs` / `tests/smtp_roundtrip.rs`) — per spec §3 不在本次范围.

## 7. 风险排序的修复候选清单

按风险 (HIGH / MED / LOW) × 修复成本 (S / M / L) 排序;**只列** §3-§5 中已确认存在的问题,不臆造.

### [HIGH] [cost-S] `send_message` 静默不发邮件 (Compose 邮件根本出不去)

- 涉及: `app/src/services/backend.ts:66-79` (JS snake_case keys), `app/src-tauri/src/commands/mod.rs:84-95` (Rust `snake_case` 形参)
- 修复路径 A (JS 改名): `backend.ts:72, 73, 77` `html_body`/`account_id`/`from_override` → `htmlBody`/`accountId`/`fromOverride`
- 修复路径 B (Rust 加 attr): `commands/mod.rs:84` `#[tauri::command(rename_all = "snake_case")]`,但会反向炸掉 `get_sync_state` / `vault_*` / `get_attachment_*` (已用 camelCase JS keys) — 不推荐
- 风险: 用户点 Compose "Send" → UI 无反应 → 邮件没发;**这是 AGENTS §10.5 明文警告的 "silently broken" 活样本**
- 估时: 30 min (改 3 个 key + 跑一次 `sendEmailViaBackend` e2e)

### [HIGH] [cost-S] `notify_settings_changed` 4 个 key snake_case → 设置要重启 app 才生效

- 涉及: `app/src/services/notifications.ts:44-48` ↔ `app/src-tauri/src/commands/notification_settings.rs:5-12`
- 修复: `notifications.ts:45-48` `desktop_enabled`/`quiet_hours_enabled`/`quiet_hours_start`/`quiet_hours_end` → `desktopEnabled`/`quietHoursEnabled`/`quietHoursStart`/`quietHoursEnd`
- 风险: 用户改通知设置 → IPC throw → JS catch block 吞 (`notifications.ts` 注释自承 "Rust side will pick up the next store.set on app restart") → 通知偏好**重启才生效**
- 估时: 15 min

### [HIGH] [cost-S] `sync_now` `account_id` snake_case → 手动同步按钮 no-op

- 涉及: `app/src/services/backend.ts:93` ↔ `app/src-tauri/src/commands/mod.rs:24-27`
- 修复: `backend.ts:93` `account_id: accountId` → `accountId: accountId`
- 风险: Sync 按钮是 no-op,用户看不出
- 估时: 5 min

### [HIGH] [cost-S] `list_mailboxes` `account_id` snake_case → mailbox 列表空

- 涉及: `app/src/services/backend.ts:83-85` ↔ `app/src-tauri/src/commands/mod.rs:69`
- 修复: `backend.ts:84` `account_id: accountId` → `accountId: accountId`
- 风险: UI 显示空 mailbox 列表 (`r ?? []` fallback 吞错),非 critical 但静默坏
- 估时: 5 min

### [HIGH] [cost-M] 邮件内 `<a>` 点击无响应 (iframe 沙箱吞 + 无 opener 接管)

- 涉及: `app/src/panels/MessagePanel.tsx:1052-1075` (iframe `onload` 只设 height), `app/src/ipc/commands.ts` (无 `openUrl` 命令)
- 修复: 在 `MessagePanel.tsx` iframe `onload` 里 `doc.addEventListener("click", e => { const a = e.target.closest("a[href]"); if (a) { e.preventDefault(); openUrl(a.href); } })`;`openUrl` 可直接用 `@tauri-apps/plugin-opener` 的 `openUrl()` (已装包,未接路径);`mailto:` 分支走 `openUrl("mailto:...")`
- 风险: 用户点邮件链接完全无响应 — SendPalm 作为邮件客户端**最基本的功能缺失**
- 估时: 2-3 小时 (含 `mailto:` 分支 + e2e)

### [HIGH] [cost-S] 外链 `<img>` 无 "Show Images" 拦截 → 跟踪像素泄露

- 涉及: `app/src/panels/MessagePanel.tsx:62-77` (srcdoc `<style>`), `app/src/stores/data.ts` (无 message-level `showImages` 标志)
- 修复: Message DTO 加 `showImages: boolean` 默认 false;`MessagePanel.tsx` srcdoc 注入前,把 `<img src="https://...">` 重写为 `<img src="data:image/svg+xml,..." data-orig-src="...">`,UI 加 "Show images" 按钮切换;`app/src/utils/trackers.ts:1-45` 已有 `detectTrackers`,可在切换时一次性预热真实 URL
- 风险: 打开任一邮件都向 tracker 第三方泄露"已读 + UA + IP";**默认行为违反用户隐私**
- 估时: 4-6 小时 (含 e2e + toggle UI)

### [HIGH] [cost-S] `imap.rs:212-215` `session.fetch` 应该是 `session.uid_fetch`

- 涉及: `app/src-tauri/src/services/imap.rs:212-215`
- 修复: `session.fetch(&range, "(FLAGS UID ENVELOPE BODY.PEEK[])")` → `session.uid_fetch(&range, "(FLAGS UID ENVELOPE BODY.PEEK[])")` (async-imap `Session::uid_fetch` 签名一致);同时修正注释 `imap.rs:201-205` (声称 "async-imap interprets the range `a:b` as UID" 不符文档)
- 风险: 全新邮箱凑巧能用;**任何 expunge / 删除后** sequence numbers ≠ UID numbers → 拉错消息
- 估时: 30 min (改 1 行 + 加 `imap_real.rs` UIDVALIDITY expunge 测试)

### [HIGH] [cost-S] `sync_loop.rs` 无 UIDVALIDITY 失效检测

- 涉及: `app/src-tauri/src/services/sync_loop.rs:193-201` (imap 捕获 `mailbox.uid_validity`), `sync_loop.rs:646-666` (`save_folder_sync_state` upsert), 无任何 `if new_uv != account.uid_validity { reset_cursor() }` 逻辑 (`grep "invalidate" sync_loop.rs` → 0 matches)
- 修复: `sync_folder` 进入时 `let new_uv = bundle.uid_validity; if new_uv != account.uid_validity { eprintln!("UIDVALIDITY changed for {}: {} → {}, resync", folder, account.uid_validity, new_uv); cursor = 0; account.last_uid = 0; }`,再写 `save_folder_sync_state`
- 风险: per RFC 3501 §6.4.8,UIDVALIDITY 变化时 UID 缓存必须清空;当前**跨 validity 边界静默用旧 UID namespace**,拉错消息
- 估时: 1 小时 (含 UIDVALIDITY 变化 e2e)

### [HIGH] [cost-S] 纯文本邮件 URL 不自动链接 → 用户复制粘贴 (尤其 iPad 体验差)

- 涉及: `app/src/panels/MessagePanel.tsx:1024-1049, 1790-1798`, `app/src/utils/html.ts:21-32` (有现成 `plainTextToHtml` 但只 Compose 用)
- 修复: `formatBodyParagraphs` 输出前先调用 `plainTextToHtml` 做 URL → `<a>` 自动链接,然后用 `htmlEmailSrcdoc` 包 iframe 渲染 (而非直接 `<p>{p}</p>`);或新增 `plainTextWithLinks` 工具函数,`formatBodyParagraphs` 输出 `<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>` 形式
- 风险: 长 URL 显示为纯文本,用户复制不到 (尤其移动端 select 体验差);违反 HEY/Gmail 基本行为
- 估时: 3-4 小时

### [MED] [cost-S] `mailto:` 链接完全不识别

- 涉及: `app/src/panels/MessagePanel.tsx` (无 mailto 处理), `app/src-tauri/src/` (无 mailto 重写)
- 修复: 跟随 §"邮件内 `<a>` 点击无响应" 修复,在 iframe click handler 里 `if (a.href.startsWith("mailto:")) { e.preventDefault(); openUrl(a.href); }` (plugin-opener `openUrl` 接受 mailto scheme);UI 也可加"加入联系人" CTA
- 风险: 用户点 "Contact me at foo@bar.com" → **无响应**;HEY/Gmail 都覆盖,SendPalm 完全缺失
- 估时: 包含在"`<a>` 点击无响应"修复内 (1 小时增量)

### [MED] [cost-S] 入站邮件 `target="_blank"` 不补 `rel="noopener noreferrer"`

- 涉及: `app/src/panels/MessagePanel.tsx` (入站不重写),对比 `app/src/utils/html.ts:29` (Compose 已做)
- 修复: 在 parser (`app/src-tauri/src/services/parser.rs`) 或 `htmlEmailSrcdoc` (`MessagePanel.tsx:62-77`) 加正则 `out.replace(/<a\s+([^>]*?)target="_blank"([^>]*)>/gi, '<a $1target="_blank"$2 rel="noopener noreferrer">')`
- 风险: 当前 sandbox 无 `allow-popups` → 无 tabnabbing 攻击面;**未来**接 "父页接管 click → opener.openUrl" 设计后立刻有反向 `window.opener.location = ...` 篡改 URL 风险
- 估时: 1 小时

### [MED] [cost-S] `javascript:` URL 无显式过滤 (defense-in-depth)

- 涉及: `app/src-tauri/src/services/parser.rs` (`rewrite_inline_images` 不洗 `javascript:`), `app/src/panels/MessagePanel.tsx:62-77` (`htmlEmailSrcdoc` 不洗)
- 修复: parser 加 `out = out.replace(/(href|src)\s*=\s*"\s*javascript:[^"]*"/gi, r#"$1="#""#)`;`htmlEmailSrcdoc` 同样在拼接前先 sanitize
- 风险: 当前 sandbox 无 `allow-scripts` → `javascript:` 不执行 (no-op);**未来**给 iframe 加 `allow-scripts` 或迁移渲染到主 DOM (compose preview / search snippet / notification card) 时立刻变 XSS sink
- 估时: 1 小时

### [MED] [cost-S] HTML 邮件 `<table>` / `<blockquote>` 无样式

- 涉及: `app/src/panels/MessagePanel.tsx:62-77` (srcdoc `<style>` 只覆盖 `html/body/img/a/pre`), `app/src/styles/base.css` (无 `table` / `blockquote` 选择器)
- 修复: srcdoc 内联 `<style>` 追加 `table { border-collapse: collapse; } th, td { padding: 6px 10px; vertical-align: top; } blockquote { margin: 0; padding-left: 12px; border-left: 3px solid #ccc; color: #555; }`
- 风险: HTML 邮件 layout 渲染成 1990s 默认样式;用户体验差 (非安全 bug)
- 估时: 30 min

### [MED] [cost-M] `add_calendar_event` nested `IcalEvent` 类型分裂 (camelCase vs snake_case)

- 涉及: `app/src/types/index.ts:174-183` (camelCase `dtstartTzid`), `app/src/services/backend.ts:135-144` (snake_case `dtstart_tzid`), `app/src-tauri/src/services/ical.rs:24-35` (Rust 字段 snake_case,无 `rename_all`)
- 修复: 二选一 — (a) `services/ical.rs:24-35` struct 加 `#[serde(rename_all = "camelCase")]` 让 TS 用 camelCase;或 (b) 修正 `types/index.ts:174-183` 到 snake_case 并加注释 `all_day` 缺失默认 false. 推荐 (b) — 改动小,与 `backend.ts:135-144` 一致
- 风险: 当前 runtime OK (calendar data 来自 IMAP snake_case JSON → 写库 snake_case);**未来** JS 构造 IcalEvent 时,`types/index.ts` camelCase 形会 deserialize 失败 `all_day` (默认 false 凑巧可工作) — 类型谎言
- 估时: 1-2 小时

### [MED] [cost-S] `scheduled_send` 无 retry counter / failed status / persisted audit

- 涉及: `app/src-tauri/src/services/scheduled_send.rs:50-54` (注释自承), 4 个 `eprintln!` 站点 (`scheduled_send.rs:22, 32, 51, 143`)
- 修复: 新建 `scheduled_send_audit` 表 (`id, scheduled_send_id, attempted_at, error_message`),失败时 INSERT 一行 + 增加 `scheduled_sends.attempts INT DEFAULT 0` 列;达到阈值 (e.g. 10) 改 status 为 `'failed'`;成功也写一行
- 风险: 坏 credentials 的 draft 每 60 s 重试,stderr 一行/分钟,无穷无尽;release build stderr 被丢弃,用户**无法发现**失败 scheduled send
- 估时: 4-6 小时 (含 schema migration + UI 表面"failed N times")

### [MED] [cost-S] `commands/mod.rs::send_message` Sent 副本失败静默吞错

- 涉及: `app/src-tauri/src/commands/mod.rs:189-212` (`.ok()` 吞错)
- 修复: 返回结构加 `local_copy: "saved" | "failed" | "skipped"` 字段,失败时 log 到 `audit` 表;UI 根据状态显示 "Sent copy may be incomplete"
- 风险: SMTP 成功 + 本地副本失败时,UI 无法区分"全成功" vs "SMTP 成功本地失败"
- 估时: 2-3 小时

### [MED] [cost-S] `scheduled_send` 成功 log 噪音 (`scheduled_send.rs:143` 每发一封一行 stderr)

- 涉及: `app/src-tauri/src/services/scheduled_send.rs:143-146`
- 修复: 把 `eprintln!("[scheduled-send] dispatched ...")` 降到 `log::debug!` (或只在 `--features=verbose` 时打)
- 估时: 15 min

### [LOW] [cost-S] `<a>:visited` 邮件内链接无视觉区分

- 涉及: `app/src/panels/MessagePanel.tsx:71` (`a { color: #0A8F63 }` 无 `:visited`)
- 修复: srcdoc 内联 `<style>` 追加 `a:visited { color: #557; } a:hover { text-decoration: underline; }`
- 风险: UX 细节,用户分不清"已访问"和"未访问"邮件链接;对识别钓鱼站无视觉帮助
- 估时: 15 min

### [LOW] [cost-S] DOMPurify / sanitizer 库引入 (defense-in-depth)

- 涉及: `app/package.json:23-35` (无 DOMPurify), `app/src/panels/MessagePanel.tsx:62-77` (`htmlEmailSrcdoc` 不 sanitize)
- 修复: `pnpm add dompurify` (Solid 生态有 adapter 或直接 import),`htmlEmailSrcdoc` 拼接前 `DOMPurify.sanitize(html, { USE_PROFILES: { html: true } })`
- 风险: 当前 sandbox 已拦脚本;**未来**若有人加 `allow-scripts` 或迁出 iframe,无 sanitizer 立刻 XSS
- 估时: 1 小时 (含 bundle size 影响评估)

### [LOW] [cost-S] `base.css` `a` 选择器显式 `overflow-wrap: anywhere`

- 涉及: `app/src/styles/base.css:53-57`
- 修复: `base.css:53` `a` rule 加 `overflow-wrap: anywhere;`
- 风险: 当前父级 `<p>` 已声明,继承生效,不溢出 — 实际不修也行
- 估时: 5 min

### [LOW] [cost-S] TLS impl 与 AGENTS §10.5 spec 文字不符 (`async-native-tls` vs `SslTunnel`)

- 涉及: `app/src-tauri/Cargo.toml:32-33`, `app/src-tauri/src/services/imap.rs:1, 7, 271`, AGENTS §10.5 spec 文字
- 修复: 二选一 — (a) 改 Cargo.toml 加 `rustls-native-certs` 给 IMAP 走 `SslTunnel` (功能等价但 cargo tree 更大);(b) 更新 AGENTS §10.5 文字为"async-native-tls over native-tls"
- 风险: 功能等价,无运行时差异;纯文字 spec vs impl 漂移
- 估时: (a) 半天; (b) 5 min

### [LOW] [cost-S] `cid:` inline 图片无大小限制 (`body_html` 列可被恶意邮件撑大)

- 涉及: `app/src-tauri/src/services/parser.rs:227-247` (`rewrite_inline_images` 直接 base64 嵌入)
- 修复: 加 `if data_url.len() > MAX_INLINE_IMAGE_BYTES (e.g. 1 MB) { skip rewrite; leave as cid: }`,前端 `cid:` 未解析时显示占位符 + "Download image" 按钮
- 风险: 恶意邮件塞 10 MB inline 图让 `messages` 表臃肿;SQLite TEXT 列默认能撑,但**未限大小**
- 估时: 2-3 小时

### [LOW] [cost-S] HTML email 渲染路径 0 测试覆盖

- 涉及: `app/src/test/html.test.ts` (只测 `htmlToPlainText` / `plainTextToHtml`), `app/e2e/workflows.spec.ts:77, 756` (`bodyHtml: null`)
- 修复: 加 3 个 e2e 用例 — (1) 渲染含 cid: 重写为 data: URL 的邮件;(2) 渲染含 `<img src="https://tracker/...">` 的邮件,断言**不**自动加载 (等 "Show images" 修完后);(3) 渲染含 mailto: 链接的邮件,断言 click → opener 调用
- 风险: 未来回归风险无测试守护
- 估时: 3-4 小时 (等 §5 / §4 fix 落地后再写)

### [LOW] [cost-S] `commands/mod.rs:592` 失败时 `uid_validity` 重置为 0

- 涉及: `app/src-tauri/src/services/sync_loop.rs:592` (`save_folder_sync_state(pool, &state_key, start_uid, 0)`)
- 修复: 失败时也保留 `uid_validity` (`save_folder_sync_state(pool, &state_key, start_uid, account.uid_validity)`),避免下次启动误判
- 风险: 与 UIDVALIDITY 检测联动的小副作用;单独修意义有限
- 估时: 15 min

### [LOW] [cost-S] `greet` 死代码 (`app/src/ipc/commands.ts:12`) 删除

- 涉及: `app/src/ipc/commands.ts:12` (`invoke<string>("greet", { name })` + `pingGreet`), 全仓无 importer
- 修复: 删除 `commands.ts:12` 行 + `pingGreet` 函数
- 风险: 无 (死代码)
- 估时: 5 min

### [LOW] [cost-S] ESLint pre-existing 1 error (`views.spec.ts:1` `no-unused-vars`)

- 涉及: `app/e2e/views.spec.ts:1`
- 修复: 删除 unused 变量 (per ESLint 报错)
- 风险: 无 (pre-existing,非本次引入)
- 估时: 5 min

### 总结

| 风险等级 | 数量 |
|---|---|
| **HIGH** | 9 (全是真实功能 / 安全 / 隐私 / 正确性问题) |
| **MED** | 6 (类型分裂 / 静默吞错 / observability / UX / spec 漂移) |
| **LOW** | 7 (UX 细节 / dead code / 测试覆盖 / spec 文字 / 顺手清理) |

最高优先级建议:**先修 HIGH 段前 5 条 IPC 修复 + "邮件 `<a>` 点击无响应" + "Show Images 拦截" + `imap.rs:212 uid_fetch`** — 这 8 条直接对应"邮件发送不出 / 链接点了无反应 / 跟踪像素泄露 / UID 拉错消息" 四个用户视角的 critical 场景,且每条估时都在 30 min – 半天内,合计约 2-3 天工作量.