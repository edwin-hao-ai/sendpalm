# Handoff — 托盘/通知 + iOS + App Store Connect（2026-11-13 夜，第二段）

> 醒来先看「现在能直接用」和「需要你 1 分钟」两节，其余是细节。

## 现在能直接用

- `/Applications/SendPalm.app` 是**签过名**的 debug 构建：邮件同步和 macOS 系统通知都在工作。
  旧的 `2026-11-11` 版本备份在 `/tmp/SendPalm-2026-11-11.app`（重启后 `/tmp` 会清空）。
- 系统通知已授权（`com.sendpalm.app` 已登记，`authorized=true`）。设置 → 通知里有
  「发送测试通知」按钮，随时可以自测。
- 分支 `main`，**已 push 到 origin**（此前的提交也在这一轮一起推上去了）。
- 验证矩阵（本机，2026-11-13 夜）：`tsc` 干净、`eslint --max-warnings=0` 干净、
  `vitest` 890 通过（92 个文件）、`cargo test` 全套绿、`playwright` 见下。

| 套件 | 结果 |
|---|---|
| `pnpm typecheck` / `pnpm lint` | 干净 |
| `pnpm test`（vitest） | 890 passed / 92 files |
| `cargo +stable test` | 36 个 test binary 全部 ok、0 failed（lib 195：parser 16、e2e_seed 2） |
| `pnpm exec playwright test` | 193 passed / 2 failed / 1 skipped（见下） |

`mobile-ui-audit.spec.ts`（iPhone 13 视口）里两条断言当时是红的：**点击目标 < 44×44px**
（同步按钮 58×24、某个图标按钮 30×30）和**表单字号 < 16px**（iOS 会自动放大）。这两条是
同一棵工作树上另一个会话刚加的断言，而修复当时还只存在于工作区（未提交），所以没有随这次
push 上来。修的时候按 AGENTS §6 的 44×44 来，别去放宽断言。


## 需要你 1 分钟

1. **绑定 sendpalm.com**（DNS 你说今天绑）。元数据里 Support URL 是
   `https://sendpalm.com/support`，Apple 审核会点开，提交审核前必须能访问。
2. **在 `/Applications` 那个 debug 构建里点一下通知横幅**，确认点开的是那封邮件。
   这是 HANDOFF 上一版留下的唯一没肉眼验证的路径（横幅只停留几秒，脚本抓不准时机）。
   代码路径：delegate → `notification:action` → `openNotificationTarget(row)` →
   `notification_target`，与铃铛共用同一个跳转（有单测 + e2e）。

## ASC：App 记录已建好，元数据已推，**build 还没上传**

| 项目 | 值 |
|---|---|
| ASC App | `SendPalm`，id **6834244601** |
| Bundle ID（App Store ID） | `com.sendpalm.app` → `GNNTFW59LK` |
| 版本 | **`1.0`**（Apple 建 App 时自己建的，PREPARE_FOR_SUBMISSION；不能再 POST 一个 1.0.0） |
| 元数据 | en-US + zh-Hans 已推送（名称/副标题/描述/keywords/support+marketing URL） |
| Build | **0 个**（`python3 scripts/asc.py builds` 返回空） |

```bash
python3 scripts/asc.py app            # 看记录
python3 scripts/asc.py builds         # 看上传过的 build
python3 scripts/asc.py push-metadata 1.0   # 改完 ios-metadata.json 再推一次
```

**上传 build**：
```bash
cd app && pnpm tauri ios build --target aarch64 --export-method app-store-connect --ci
xcrun altool --upload-app -f src-tauri/gen/apple/build/arm64/SendPalm.ipa -t ios \
  --apiKey DDG3CJL762 --apiIssuer a28bcef1-d045-49f2-b86e-81aebe6b6b25
```

**提交前还缺**（都不是代码，是素材/配置，所以这一轮没动）：

- **截图**：ASC 至少要 6.9"/6.5" iPhone 截图。模拟器能出图（`scripts/verify-ios.sh` 会截图到
  `docs/ios-screenshots/`），但要按 ASC 的尺寸要求单独出一套并上传。
- **隐私清单 `PrivacyInfo.xcprivacy`**：`app/src-tauri/gen/apple/` 是生成目录且在 `.gitignore` 里，
  加它需要把文件放到源码目录再由构建复制过去。属于"要动生成工程"的活，按"有风险先不做"跳过。
- **App 隐私问卷**（ASC 网页端填）。

踩到并修掉的两个坑（都在 AGENTS §11.23 里）：
- release 设备构建链接失败 `Undefined symbols _init_plugin_*` —— opener / clipboard-manager
  的 Swift 入口在 Xcode 27 下没导出，升到 2.5.0 / 2.7.3（notification 2.6.0 修过同一个问题）。
- 磁盘：iOS release 构建 + 之前所有 target 会把 `/` 写到 100%（`No space left on device`
  被 LLVM 报成 IO failure）。这一轮又撞了一次，见下面「磁盘」。

## iOS

- **模拟器已验证**：iPhone 18 Pro（iOS 27.1）启动 → 引导页 → 收件箱真邮件
  （`docs/ios-screenshots/ios-20261113-imbox.png`）。
- **iPhone 12 真机已验证到「加邮箱 + 钥匙串写入成功」**（`docs/ios-screenshots/ios-20261113-003713.png`）。
  之前的失败原因是 `keyring` v3 在 iOS 上根本没有实现：`set_password` 运行时失败，于是账户行写进去了、
  密码没存，首轮同步什么也没导入。现在 iOS 走 `security-framework` 的 generic-password。
- **真机怎么跑一遍（不用手点屏幕）**：debug 构建能用环境变量喂一个邮箱，
  走的是真实路径 `upsertAccount → vaultSave → syncNow`，只省掉打字。

  ```bash
  cd app && pnpm tauri ios build --debug --target aarch64
  xcrun devicectl device install app --device <UDID> <path>/SendPalm.app
  xcrun devicectl device process launch --console \
    --device <UDID> --terminate-existing com.sendpalm.app \
    --environment-variables '{"SENDPALM_E2E_SEED_EMAIL":"…","SENDPALM_E2E_SEED_PASSWORD":"…"}'
  # 判定：console 里出现 "RESULT: OK" / "RESULT: FAILED <code>"
  # 细节日志在 app 容器里：tmp/sync.log、tmp/keychain.log、e2e-seed.log
  ```

  该命令**只在 debug 构建生效**（release 里 `cfg!(debug_assertions)` 直接返回 None），
  否则等于给任何能启动 App 的进程一个塞凭据的后门。
- **iPad 模拟器这台机器上不可用**：原有 iPad 设备的 data 目录缺失，新建的 iPad Pro +
  iOS 27.2 组合在 headless 下 WebKit 渲染超时（白屏）。iPad 布局由桌面 Playwright 的
  tablet viewport 覆盖。
- **iPhone 12 的 development team / 描述文件**：`bundle.iOS.developmentTeam` = `5XNDF727Y6`。
  已连接设备：`Edwin Hao的iPhone`(00008110-00140CA12611401E)、`iPhone`(00008101-001E69D03A63003A)。

## 这一轮（2026-11-13 下午/傍晚）做了什么

1. **`cargo test` 当时根本编译不过** —— `NotificationPrefs` 新增了 `ping_first_senders`，
   `tests/desktop_notifier_test.rs` 还在手写结构体字面量。编译失败会把整套 Rust 验证挡住，
   这是最该先修的。顺手清掉 `cargo` 打的三条 unused 警告。
2. **附件的文件名**：`filename*=UTF-8''%E6%8A%A5%E5%91%8A.pdf`（QQ/163/飞书发 CJK 附件都这样）
   和 `=?utf-8?B?…?=` 以前原样落库，现在读 mailparse 已解好的参数；完全没有文件名时
   （退信、`message/rfc822`、部分扫描仪）从 `attachment-0`（没有扩展名，双击打不开）
   换成 `类型-日期.扩展名`，同一封里重名的加 `-2`/`-3`。
3. **预览模式谎报连接成功**（e2e 抓到的真回归）：浏览器 shim 对 `vault_save` 这类
   返回 `()` 的命令回答 `null`，而"成功"也是 `null`，于是添加邮箱在预览模式下直接说
   「已连接」。现在 shim 对三个 keychain 写入命令**拒绝**，`account-add.spec.ts` 转绿；
   新增 `tauri-shim.test.ts` 把 shim 的回答契约钉住。
4. **`e2e_seed_account` 收进 debug 构建**，并把"两半都有才建"的规则提成纯函数 + 2 个测试。
5. **真机诊断**：`sync_now` 的凭据/连接失败也写进 `tmp/sync.log`（手机没有 Mac 能读的 console）。
6. **性能报告里的隐测量 bug**：`readPerf` 读的是 `mem_usedJSHeapSize`（真实属性叫
   `usedJSHeapSize`），于是报告里的堆数字一直是 `null`、`heapStable` 永远是 false ——
   "24h 内存曲线"那条待办其实一直没有数据可用。修好后一次跑出 37.8 MB → 37.8 MB（Δ0）。
7. 文档：本文件、`docs/PROGRESS.md`、`docs/TODOS.md` 的过期条目、AGENTS §11.24。


## 磁盘

这台机器长期 100% 满（`/System/Volumes/Data` 只剩 117 MB），`cargo` 会报
`failed to write query cache … No space left on device`。这一轮删掉的都是可再生的：
`~/Library/Developer/Xcode/DerivedData/*`、`~/.cargo/shared-target/debug/incremental`、
`~/.cargo/shared-target/aarch64-apple-ios`（iOS 构建缓存，下次 iOS 构建要重编 ~30 min）、
`app/src-tauri/gen/apple/build`。腾出 8.8 GB。**下次 iOS release 构建前先看一眼 `df -h`。**

## 一个小坑：跑 e2e 会弄脏工作树

`app/qa-tmp/*.json` 是**被跟踪**的性能报告，而 `pnpm exec playwright test` 每次都会重写它们。
所以跑完全量 e2e 后 `git status` 一定有几行 M —— 那不是代码改动。要么 `git checkout -- app/qa-tmp`
复原，要么把新数字当基线提交。想彻底解决就把它挪进 `.gitignore`（历史里仍可查）。


## 已知未处理（有意跳过，按"有风险先不做"）

1. **`PrivacyInfo.xcprivacy`** —— 见上。要动 `gen/apple`（生成目录）和构建脚本。
2. **App Store 截图** —— 需要按 ASC 尺寸要求出一套并上传，属于素材工作。
3. **Gate 待审发件人的通知默认关**（`notifications.firstSenders`，设置 → 通知里有开关）。
   产品决定是"不打扰优先"，但 291 位待审时等于大部分新邮件静默。要不要默认开，你定。
4. **release 构建要重输一次邮箱密码**（钥匙串条目绑定签名）。`scripts/build-macos.sh` 重建后
   签名稳定就不会再丢。当前 `/Applications` 放的是 debug 构建（读 `.env`，不需要密码）。
5. **文件页仍然整表取 3740 行**（936 KB）再在前端窗口渲染；要彻底解决得把筛选下沉到 SQL
   并做 keyset 分页。属于动数据路径的活，跳过。
6. **两条移动端审计断言是红的**（见上表）：`mobile-ui-audit.spec.ts` 的 44×44 点击目标与
   16px 表单字号。断言本身是对的（AGENTS §6），缺的是 UI 修复。

