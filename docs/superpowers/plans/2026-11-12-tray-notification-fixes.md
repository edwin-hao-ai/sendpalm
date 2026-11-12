# 托盘 / 通知 / 账户浮层 三个面的一致性修复

日期：2026-11-12 · 分支：main

用户报告（截图证据）：

1. 从托盘菜单点「payments at SendPalm」进入，右侧详情打开了，**左侧列表既没有选中，
   也没有滚动到那一行**。
2. 顶栏「1 个账户」的浮层**被详情面板/列表盖住**。
3. 托盘图标在菜单栏里是**一块白/黑方板**，不好看。
4. 「新邮件的推送问题」——用户记不清具体表现，要求自测。

## 根因（证据）

| # | 根因 | 证据 |
|---|---|---|
| 1 | 列表高亮用 Imbox 自己的 `cursorIndex`，外部只写 `selectedMessageId`，两者没有桥接 | `app/src/views/Imbox.tsx:562-590`（cursor 只在 j/k 里移动）vs `app/src/bootstrap.ts:129-135`、`app/src/notifications/NotificationPanel.tsx:288` |
| 2 | `#topbar` 自身是 `z-index: var(--z-sticky)`=20 的层叠上下文，浮层写在它内部；`#detail-panel`=30、`#agent-panel`=40 是它的兄弟 | `app/src/components/Topbar.tsx:63`、`app/src/styles/base.css:218-236`、`tokens.css:186-193` |
| 3 | 模板图是 44×44 的实心圆角方板 + 镂空纸飞机；16pt 下镂空细节全丢，只剩一块方板 | `app/src-tauri/icons/tray-icon-template.png`（sips 实测 44×44），菜单栏截图 |
| 4a | 通知偏好只在用户改设置时通过 IPC 同步给 Rust；**启动时不发**，Rust 用默认值（desktop=true）→ 关掉通知重启后又弹 | `app/src/services/notifications.ts` 只被 Settings 调用；`app/src-tauri/src/services/state.rs:94` |
| 4b | 系统通知权限从未授予：`com.apple.ncprefs` 里没有任何 SendPalm 条目；所有 `show()` 失败都被 `let _ =` 吞掉，用户与日志都看不到 | `defaults read com.apple.ncprefs | grep -i palm` → 0 命中；`desktop_notifier.rs:103`、`sync_loop.rs:1858` |
| 4c | 权限提示只有首次启动那一次 toast（`permissionPrompted` 已置 true）；Settings 的开关已经是开的状态，UI 从不显示「系统未授予」 | `app/src/services/notifications.ts:39-59` |

## 改动

- **A 列表定位**：`Imbox-helpers.ts` 加纯函数 `rowIndexForItem(items, id)`（返回 bundle 内命中的
  行锚点）；`Imbox.tsx` 加一个 `createEffect` 监听 `selectedMessageId()`：命中就设
  `cursorIndex` + `scrollIntoView`，未加载就 `prependByIds`（该函数已按时间重排，不会把旧邮件钉在顶部），
  若被账户/快筛过滤掉则先放开筛选。
- **B 层叠**：新增 token `--z-topbar: 50`（高于 detail 30 / agent 40，低于 modal 80），
  顶栏改用它，浮层继续用自己的 45。
- **C 图标**：重画为透明背景、实心纸飞机的模板字形（32×32，16pt @2x），去掉方板。
- **D 通知**：启动时把 JS 侧偏好同步给 Rust；Settings 显示真实权限状态并提供「去开启」；
  Rust 的 `show()` 失败改为记录日志；首次发件人（Gate 待审）不弹的规则在 UI 文案里写明。

## 验证

- `pnpm typecheck` ✓
- `pnpm lint --max-warnings=0` ✓
- `pnpm exec vitest run` ✓ — 882/882（新增 `rowAnchorForMessage` 4 例 + 权限/意图 5 例）
- `cargo test --lib` ✓ — 183/183（新增「同一失败原因只记一次日志」）
- `pnpm exec playwright test` ✓ — 190 passed / 1 skipped
  - `e2e/notification-reveal.spec.ts`（新，2 例）：外部打开 → 行获得 `.cursor` 且在 `#main` 视口内；
    bundle 内的信件先展开抽屉再定位。**禁用修复后两例都红**（已验证）。
  - `e2e/topbar-popover-stacking.spec.ts`（新）：`elementFromPoint` 断言浮层拥有自己的像素。
    **把 `--z-topbar` 换回 `--z-sticky` 后变红**（已验证）。
- 视觉：菜单栏截图前后对比（before `/tmp/menubar-before.png` / after `/tmp/band-after2.png`）。

## 仍需人工确认

- 系统通知权限只能在带 bundle id 的 `.app` 里授予（`pnpm tauri dev` 是裸二进制，永远不会登记到
  通知中心）。步骤：构建/安装 app → 设置 → 通知 → 若显示「系统还没有允许」→「再次请求权限」→
  允许 → 给自己发一封邮件。
- Gate 待审的首次发件人默认不弹（`should_ping_os` 的产品决定）。用户 291 位待审时这条相当于
  「大部分新邮件不弹」。是否要给它一个开关，待产品决定。
