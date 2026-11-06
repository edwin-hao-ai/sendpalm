# Handoff — 2026-11-06

> 会话交接。任务全部提交在 `feat/ui-polish-round`（未合并 main、未 push）。
> 下次会话从这里继续；完成后删掉本文件。

## 状态

- **分支**：`feat/ui-polish-round`（本轮新增 11 个提交；`git rev-list --count main..HEAD` 查总数），工作树干净
  （只剩仓库里本来就有的未跟踪文件：`.superpowers/.superpowers/`、`dist/.mddock/`、
  `kimi-export-session_*.md`、`prototypes/`）。
- **测试**：typecheck / lint 干净；vitest 663；Playwright 145 通过 / 1 skipped；
  Rust 34 套件全绿（`cargo +stable test`）。
- **机器状态（不在 git 里）**：
  - `rustup default stable` —— 我设的（Xcode 构建阶段读不到 `RUSTUP_TOOLCHAIN`）。
    要还原就 `rustup default <别的>`。
  - 磁盘清理：删了 `iOS DeviceSupport`(20G)、`DerivedData`(6G)、iOS 26.5 runtime(10G)；
    装了 iOS 27.2 模拟器 runtime。现在 40G 可用。
  - 桌面 `pnpm tauri dev` 和 iOS 模拟器在本会话结束时已停掉。

## 本会话做了什么（按时间）

1. 首次导入过渡（历史发件人静默通过）+ 导入反馈 + 72h 降噪 + 未读 30 天口径
2. 一起读 > 500 批量模式
3. 手机首屏去掉重复 H1
4. 侧栏常开（≥1024 两级列表，Mail 组默认展开）
5. 一个 Body 渲染所有正文（`components/EmailBody.tsx`）
6. HTML-only 邮件不再把源码当正文（`services/html_text.rs` + 一次性回填）
7. 底部 pile 条还原（revert 掉「待处理」pill）
8. 筛选台：渲染 HTML + 左右滑 + ←→ 键 + 批准可撤销
9. **同步游标越过 UIDNEXT 导致新邮件永不导入**（用户报「日期又错了」的真相）
10. iOS：四道构建门 + 托盘/自启按平台切开

细节都在 `docs/PROGRESS.md` 末尾几节。

## 下一步（优先级）

1. **iOS 首帧黑屏**（唯一开着的构建问题）
   - 现状：`scripts/verify-ios.sh` 能 archive → install → launch，
     `simctl launch` 返回 PID、进程活着、无崩溃报告，但窗口全黑
     （截图 `docs/ios-screenshots/iphone-17-02-ready.png`）。
   - 待查：WKWebView 是否加载到内置前端资源（`frontendDist`）、CSP 是否拦了
     入口脚本、`dist/` 是否打进 bundle。建议先
     `xcrun simctl spawn booted log stream --predicate 'process == "sendpalm-app"'`
     看 webview 日志，再核对 `SendPalm.app` 里的 `_up_` / `dist` 资源。
2. **326 位历史发件人仍卡在筛选台**（`first_seen=1 AND screened=0`）。
   导入过渡只对新账户生效，不追溯。要不要一次性放行是产品决定，需要用户点头。
3. **筛选台观感部分**：卡片厚度表达余量、滑动 5° 倾斜、滑完小结
   （放进 N / 转到 M / 拦下 K + 一键撤回）。手势已经能用。
4. **分类自动化**：协议头高置信度直接分桶 + 可撤销 toast；关键词只打标签不移动；
   「以后这个发件人都这样？」→ 写 `mail_rules`。
5. **UI 第二轮剩余**：设置三轴合一、日历事件条写标题 + 空闲时长、洞察等高、
   文件筛选条对齐、头像 CJK 单字、时间格式三级规则、快捷键帮助滚动提示、
   手机 chips 收进筛选。
6. **压测/长跑**：10 万封压测、24h 内存曲线、Windows/Linux 真机。

## 要注意的坑（本会话新踩到的）

- **迁移文件一个字节都不能改**，注释也不行：`tauri-plugin-sql` 会校验已应用
  迁移的 checksum，改了直接 `PluginInitialization("sql", "migration 14 was
  previously applied but has been modified")`，应用起不来。
- **cargo 游标类逻辑要能自愈**：服务器可以在 UIDVALIDITY 不变的情况下重建邮箱，
  持久化的 UID 游标会瞬间变成「比末尾还远」。任何 `cursor` 都要能和
  `uid_next` 对账。
- **列表数字要对得上自己那一行**：徽标数列表里的东西，头部再单独讲口径。
  实时数据打脸过一次（`0 待读` 挂在 3,762 条未读上面）。
- **计数器要同时订阅 hard + soft tick**，只订 soft 会在首次加载后一直是 0。
- **`shared-target` 锁**：`pnpm tauri dev` 和任何 `cargo build` 抢同一个锁，
  后台跑 iOS 构建会把 dev server 卡在 `Blocking waiting for file lock`。
- **Xcode 构建阶段不继承 shell 环境**，`RUSTUP_TOOLCHAIN=...` 传不进去。

## 未决问题

- 326 位历史发件人是否一次性放行（见上）。
- 未读红点口径：现在「新邮件」标签显示列表真实数量（`999+`），头部写「最近 30 天
  N 封待读」。要不要把标签也改成 30 天口径？
- `EmailBody` 的 iframe 仍是 `sandbox="allow-scripts allow-same-origin"`
  （沿用面板既有行为，为了 `contentDocument` 撑高）。彻底收紧需要改成
  iframe 内 postMessage 上报高度，是一次独立重构。
