# Handoff — 托盘/通知 + iOS + App Store Connect（2026-11-13 夜）

> 醒来先看「现在能直接用」和「需要你 1 分钟」两节，其余是细节。

## 现在能直接用

- `/Applications/SendPalm.app` 已替换为**签过名**的 debug 构建（见下），邮件同步和
  macOS 系统通知都在工作。旧的 `2026-11-11` 版本备份在 `/tmp/SendPalm-2026-11-11.app`。
- 系统通知已授权（`com.sendpalm.app` 已登记，`authorized=true`）。设置 → 通知里有
  「发送测试通知」按钮，随时可以自测。
- 分支 `main`，本地领先 origin **23 个 commit，尚未 push**。

## ASC：App 记录已建好，元数据已推

| 项目 | 值 |
|---|---|
| ASC App | `SendPalm`，id **6834244601** |
| Bundle ID（App Store ID） | `com.sendpalm.app` → `GNNTFW59LK` |
| 版本 | **`1.0`**（Apple 建 App 时自己建的，状态 PREPARE_FOR_SUBMISSION；不能再 POST 一个 1.0.0） |
| 元数据 | en-US + zh-Hans 已推送（名称/副标题/描述/keywords/support+marketing URL） |

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

踩到并修掉的两个坑（都在 AGENTS §11.23 里）：
- release 设备构建链接失败 `Undefined symbols _init_plugin_*` —— opener / clipboard-manager
  的 Swift 入口在 Xcode 27 下没导出，升到 2.5.0 / 2.7.3（notification 2.6.0 修过同一个问题）。
- 磁盘：iOS release 构建 + 之前所有 target 会把 `/` 写到 100%（`No space left on device`
  被 LLVM 报成 IO failure）。`rm -rf ~/.cargo/shared-target/aarch64-apple-ios-sim`
  + DerivedData 腾出 5G 才够。

## 域名 sendpalm.com

元数据里全部用 `https://sendpalm.com` 与 `https://sendpalm.com/support`。Apple 审核会
点开 Support URL，所以**提交审核前**要能访问（DNS 你说今天绑）。我没有改动 DNS。

## iOS

- **模拟器已验证**：iPhone 18 Pro（iOS 27.1）启动 → 引导页 → 收件箱真邮件
  （`docs/ios-screenshots/ios-20261113-imbox.png`）。顺带修掉一个老坑：`mobile_entry_point`
  属性又被插在 doc 注释后面（§11.12 第二次复发），iOS 启动 4.9 秒后 `main` 返回导致黑屏。
  现在有源码级守护测试 `entry_point_tests::mobile_entry_point_stands_directly_above_run`。
- **iPad 模拟器这台机器上不可用**：原有 iPad 设备的 data 目录缺失，新建的 iPad Pro +
  iOS 27.2 组合在 headless 下 WebKit 渲染超时（白屏）。iPad 布局由桌面 Playwright 的
  tablet viewport 覆盖。
- **iPhone 12 真机未做**：这台机器还没给 `com.sendpalm.app` 配 development team /
  描述文件。手机接上后：
  1. `tauri.conf.json` 的 `bundle.iOS.developmentTeam` 填 `5XNDF727Y6`
  2. `cd app && pnpm exec tauri ios build --debug --target aarch64 -- --allowProvisioningUpdates`
  3. `xcrun devicectl device install app --device <UDID> <path>/SendPalm.app`
  已连接的设备：`Edwin Hao的iPhone`(00008110-00140CA12611401E)、`iPhone`(00008101-001E69D03A63003A)。

## 这一夜修了什么

1. **托盘点开邮件 → 列表选中并滚到位置**（`rowAnchorForMessage` + reveal effect，含
   bundle 展开、分页外邮件按 id 拉取、快筛/账户 tab 自动放开）。真机和 e2e 都验证过。
2. **「N 个账户」浮层被详情面板盖住**（`--z-topbar: 50`，手机断点回落）。
3. **托盘图标**：方板 → 透明画布上的纸飞机（32×32 模板图）；菜单每行的 `✉` 去掉，
   超长主题用真省略号。
4. **通知链路**（最大的一块）：
   - 属性/偏好：启动时把偏好同步给 Rust（原来关掉通知、重启又弹）。
   - 权限：设置里显示真实状态 +「再次请求权限 / 打开系统设置」。
   - 横条点击能打开那封邮件（`notification_target` + `services/open-ref.ts`，与铃铛共用一套跳转）。
   - **真正的根因**：app 是 ad-hoc 签名（`Identifier=sendpalm_app-<hash>`、`Info.plist=not bound`），
     macOS 根本不登记它；插件那条 `notify-rust → NSUserNotificationCenter` 在当前 macOS 上也已失效。
     现在用 `services/mac_notify.rs`（UNUserNotificationCenter）+ **Developer ID 签名**，
     `authorized=true`、自检横幅和真邮件横幅都出得来。
5. **调试构建不再碰钥匙串**（先读 `.env`）：签名一变，钥匙串条目就读不到，而
   `get_password` 会弹系统对话框要登录密码 —— 同步循环就卡在那个模态后面，且没有任何日志。

## 已知未处理

1. **横条点击"打开那封邮件"这一步我没有肉眼验证**（横幅只停留几秒，抓不准点击时机）。
   代码路径：delegate → `notification:action` → `openNotificationTarget(row)` →
   `notification_target` → 与铃铛同一个跳转（该跳转有单测和 e2e）。你下次点一下就知道了。
2. Gate 待审的首次发件人默认不弹（`should_ping_os` 的产品决定）。291 位待审时等于大部分
   新邮件静默。要不要给开关，你定。
3. 菜单栏徽标仍是 `99+`（Gate 待审数）。
4. Release 构建（`/Users/edwinhao/.cargo/shared-target/release/bundle/macos/SendPalm.app`，
   已签名）需要你**在设置里重新输入一次邮箱密码**（钥匙串条目绑定签名），之后再用
   `scripts/build-macos.sh` 重建就一直是同一个签名、不会再丢。当前 `/Applications` 里放的是
   debug 构建（读 `.env`，不需要密码）。
