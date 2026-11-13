# Handoff — 托盘/通知修复 + iOS + App Store Connect（2026-11-13 夜）

## 状态

- 分支：`main`（本地领先 origin 20 个 commit，**尚未 push**）
- 已提交：托盘点开定位、顶栏浮层层叠、托盘图标/菜单、通知权限与点击、iOS 启动修复、
  ASC 工具与双语元数据、iOS 模拟器截图
- 桌面端验证：Rust 191 tests / Vitest 887 / `eslint --max-warnings=0` / Playwright 190 passed
- iOS 模拟器：iPhone 18 Pro 启动、渲染、真 IMAP 同步均通过
  （`docs/ios-screenshots/ios-20261113-imbox.png`）

## 唯一硬阻塞：ASC 里还没有 SendPalm 这个 App

Apple 的公开 API **不能创建 App 记录**：

```
POST https://api.appstoreconnect.apple.com/v1/apps
403 FORBIDDEN_ERROR — The resource 'apps' does not allow 'CREATE'.
                 Allowed operations are: GET_COLLECTION, GET_INSTANCE, UPDATE
```

已经做完的部分：

- App Store ID（Bundle ID）`com.sendpalm.app` 已通过 API 注册成功（id `GNNTFW59LK`）
- 凭据可用：`~/.config/mddock/ios-release.env`（team `5XNDF727Y6`，key `DDG3CJL762`）
- 工具：`scripts/asc.py`（`whoami` / `bundle-ids` / `app` / `builds` / `version` / `push-metadata`）
- 元数据：`scripts/ios-metadata.json`（en-US + zh-Hans，URL 全部指向 sendpalm.com）

**需要你手动做一步（1 分钟）**：

1. 打开 https://appstoreconnect.apple.com/apps → 左上「+」→ 新建 App
   - 平台：iOS
   - 名称：`SendPalm`（若被占用，改成 `SendPalm 邮件`，我会同步改元数据里的 `name`）
   - 主要语言：English (U.S.)
   - Bundle ID：选 `com.sendpalm.app`
   - SKU：`sendpalm`
   - 用户访问权限：完全访问权限
2. 建好后告诉我，我执行：
   ```bash
   python3 scripts/asc.py version 1.0.0
   python3 scripts/asc.py push-metadata 1.0.0
   ```
   然后上传 build（见下）。

## 域名 sendpalm.com

元数据里用的都是 `https://sendpalm.com` 和 `https://sendpalm.com/support`。
Apple 审核时会点开 Support URL，所以 DNS 绑定 + 至少一个能打开的页面要在**提交审核前**就绪。
（现在 DNS 有没有 A 记录我没查——你说过明天绑到服务器。）

## iOS 真机（iPhone 12）

> 状态：**未做**。原因：这台机器上还没给 `com.sendpalm.app` 配 development team /
> 描述文件，而且真机第一次装需要在你手机上点「信任」。等手机接上后执行：
>
> 1. 在 `app/src-tauri/tauri.conf.json` 的 `bundle.iOS.developmentTeam` 填 `5XNDF727Y6`
>    （或 `gen/apple/project.yml` 里加 `DEVELOPMENT_TEAM`）
> 2. `cd app && pnpm exec tauri ios build --debug --target aarch64 -- --allowProvisioningUpdates`
> 3. `xcrun devicectl device install app --device <UDID> <path>/SendPalm.app`
>
> 已连接的两台设备：`Edwin Hao的iPhone`（00008110-00140CA12611401E）、`iPhone`
> （00008101-001E69D03A63003A）——其中一台应是你说的 iPhone 12。

## 上传 build 到 ASC（App 记录建好之后）

```bash
cd app && pnpm tauri ios build --target aarch64 -- --export-method app-store-connect
# 产物在 src-tauri/gen/apple/build/arm64/SendPalm.ipa
xcrun altool --upload-app -f <ipa> -t ios \
  --apiKey DDG3CJL762 --apiIssuer a28bcef1-d045-49f2-b86e-81aebe6b6b25
```

## 已知未处理 / 需要决策

1. **macOS 通知仍是 2.5 层的问题**：`tauri-plugin-notification` 在 macOS 上走
   `notify-rust → mac-notification-sys → NSUserNotificationCenter`（Apple 已废弃的 API）。
   release 构建里它会把通知归到 `com.sendpalm.app`，debug 构建里被硬编码归到
   `com.apple.Terminal`。因此：**只有 release 构建能真正弹系统通知**。
   我把 release .app 建好并装了 `/Applications`（备份在 `/tmp/SendPalm-2026-11-11.app`）。
   注意 release 构建不读 `.env`，邮件密码要走钥匙串：
   `cd app/src-tauri && cargo test --test install_mail_password -- --ignored`
2. **Gate 待审的首次发件人不弹通知**（`should_ping_os` 的产品决定）。291 位待审时这等于
   大部分新邮件静默。要不要给个开关，你定。
3. **iPad 模拟器在这台机器上不可用**：现有 iPad 设备的 data 目录缺失（`simctl` 报
   "device's data is no longer present"），新建的 iPad Pro + iOS 27.2 组合在 headless 下
   WebKit 渲染超时（白屏）。iPad 布局目前由桌面 Playwright 的 tablet viewport 覆盖。
4. **菜单栏徽标**仍是 `99+`（Gate 待审数）。想更安静可以改成只在有新未读时显示一个小圆点。
