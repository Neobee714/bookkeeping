# 架构文档：Bookkeeping App OTA 更新 v0.2

- 创建时间：2026-08-16 12:49
- 版本：v0.2
- 状态：已确认

## 1. 技术栈与选型

| 层面 | 技术 | 选型理由 |
| --- | --- | --- |
| 版本检查 | RN 侧 axios/fetch GET info.json + 手写 semver 比较 | 轻量，无额外依赖；URL 走 HTTPS |
| 本地版本读取 | react-native-device-info `getVersion()` | RN 标准库，新架构兼容，直接读 versionName |
| APK 下载 | 原生 Kotlin 模块 + Android 系统 DownloadManager | 系统级下载（通知栏进度、稳定），不引入第三方下载库的新架构兼容风险；RN 侧仅调起 |
| APK 安装 | 原生 Intent ACTION_VIEW + FileProvider content URI | Android 标准覆盖安装流程；REQUEST_INSTALL_PACKAGES 权限 |
| 强制更新 | info.json `force` 字段（MCP 增强后写入） | 弹窗行为控制，无需后端改动 |
| MCP 增强 | app-distribute-mcp（TS/hono/ssh2）加 force 参数 | 已有服务小幅扩展，保持契约向后兼容 |
| 构建 | Android Gradle，正式签名 keystore | 覆盖安装前提：包名+签名一致 |

## 2. 系统架构

```
┌──────────────────────────────┐        HTTPS         ┌──────────────────────────────┐
│   RN Android App (v2.0.0)     │  GET /bookkeeping/   │  app.xyvora.me (VPS nginx)   │
│  com.neobee.bookkeeping       │  info.json (检查)    │  /var/www/apps/bookkeeping/  │
│                              │ ───────────────────▶ │   ├ info.json {version,      │
│  src/api/updates.ts          │ ◀─────────────────── │   │   changelog, size,        │
│  UpdateModal (弹窗)           │                      │   │   apkUrl, force}          │
│  原生 UpdaterModule (下载安装) │  GET .../latest.apk  │   ├ latest.apk               │
│                              │ ───────────────────▶ │   └ bookkeeping-2.0.0.apk    │
└──────────────────────────────┘                      └──────────────────────────────┘
        ▲ 用户点「立即更新」                                     ▲ MCP deploy_app 发布
        │                                                     │ (app-distribute-mcp,
        └────────── 覆盖安装(包名+签名一致，不卸载) ──────────────┘  SSH → 45.63.124.218)
```

- 检查链路：App → `https://app.xyvora.me/bookkeeping/info.json` → 比较 `version` vs 本地 versionName → 有新版本弹窗。
- 下载安装链路：用户点「立即更新」→ 权限检查（`canRequestPackageInstalls`）→ DownloadManager 下载（通知栏进度）→ 完成广播 → FileProvider URI + ACTION_VIEW → 系统安装器 → 覆盖安装。
- 发布链路（本地完成后）：构建 release APK → MCP `deploy_app(appName=bookkeeping, version=2.0.0, changelog=..., force=...)` → 远端写 info.json + latest.apk + 下载页。

## 3. 模块划分

| 模块 | 职责 | 依赖 |
| --- | --- | --- |
| `src/config.ts` | 新增 `UPDATE_BASE_URL` / `UPDATE_APP_NAME`（可 mock 覆盖） | — |
| `src/api/updates.ts` | 拉取并解析 info.json（版本/大小/changelog/apkUrl/force）；semver 比较函数（可单测） | config, types |
| `src/components/UpdateModal.tsx` | 更新弹窗（版本/说明/大小/按钮；force 模式） | theme, types |
| `src/updater/index.ts` | 调原生模块：检查安装权限、发起下载安装 | NativeModule |
| `src/screens/ProfileScreen.tsx` | 新增「检查更新」入口行 + 结果反馈（已最新/失败） | api/updates, UpdateModal |
| `App.tsx` / `RootNavigator` | 登录态就绪后触发一次启动检查（静默） | api/updates |
| `android/.../UpdaterModule.kt` | 原生模块：DownloadManager 下载 + FileProvider 安装 + 权限判断 | Android SDK |
| `android/.../res/xml/file_paths.xml` | FileProvider 对外暴露下载目录 | — |
| `mobile/android/app/build.gradle` | applicationId、versionCode/Name、release 签名（keystore） | keystore |
| MCP 服务（外部项目） | `tools.ts`/`remote.ts`/`indexgen.ts` 加 force 支持 | 独立项目 |

## 4. 数据与接口

**info.json 契约（app.xyvora.me/bookkeeping/info.json，v0.2 扩展后）**：

```json
{
  "name": "bookkeeping",
  "version": "2.0.0",
  "description": "双人记账",
  "changelog": "RN 重构版，支持 OTA 更新",
  "updatedAt": "2026-08-16T05:00:00.000Z",
  "size": 72450000,
  "apkUrl": "https://app.xyvora.me/bookkeeping/latest.apk",
  "force": false
}
```

- `force` 为 MCP 增强后新增字段（缺省 false；老文件无此字段按 false 处理）。
- 版本比较：`X.Y.Z` 三段数字逐段比较。

**App 内接口/函数**：

| 函数 | 说明 |
| --- | --- |
| `checkForUpdate(opts)` | 拉 info.json → 比较 → 有更新返回更新信息；失败按调用场景处理（启动静默/手动提示） |
| `compareVersions(a, b)` | semver 比较（纯函数，单测） |
| `requestUpdate(updateInfo)` | 权限检查 → 调原生 `downloadAndInstall(url, filename)` |
| 原生 `UpdaterModule` | `canRequestPackageInstalls()` / `openInstallPermissionSettings()` / `downloadAndInstall(url, fileName)` + 完成/失败事件 |

## 5. 前端风格

**已确认：风格 A「活力渐变」**（用户于 2026-08-16 13:0x 从 3 个原型中选定，与 App 主体风格 C 一致）。

- 更新弹窗：紫粉渐变头部（`#8B5CF6 → #EC4899`）+ App 图标区 + 白色大圆角卡片（24px）+ 渐变主按钮「立即更新」+ 浅紫幽灵按钮「稍后」。
- 可选更新：两个按钮；强制更新：无「稍后」按钮、弹窗不可关闭、标题改「必须更新到新版本」+ 红色强制提示文案。
- 权限引导卡：白卡 + 渐变图标 + 「去开启」渐变按钮（引导到系统「允许安装未知来源」设置页）。
- 原型文件：`docs/v0.2/prototypes/update-style-a-gradient.html`（含可选/强制两种状态 + 权限引导演示）。

## 6. 后端设计（白话版，已确认）

本次"后端"有两块，都用大白话说明：

**A. 版本检查与下载（不动现有后端，用 app.xyvora.me）**

- 机制像"公告栏"：你（通过 MCP）把新 APK 和一张"版本小卡片"（info.json，写着版本号、更新说明、大小、是不是强制更新）贴到 app.xyvora.me 的 bookkeeping 目录。
- 手机上的 App 启动时去看一眼公告栏：如果公告栏的版本号比手机上的新，就弹窗提示"有新版本"；用户点更新后，App 通知系统下载 APK，下载完系统自动弹出安装界面，确认后覆盖安装（包名和签名一致，所以不用卸载，记账数据保留）。
- 强制更新：公告栏里标了"必须更新"时，弹窗没有"稍后"按钮，只能更新。

**B. MCP 服务小改动（app-distribute-mcp）**

- 现在发 APK 的工具（deploy_app）只支持"版本号/描述/更新日志"，没有"是否强制更新"这个开关 → 给它加一个 `force` 参数（可选，不传默认不强制），发布时勾选即写进公告栏小卡片，下载页也显示"强制更新"红标。

**安全性**：下载走 HTTPS；安装沿用系统安全机制（需要用户在手机上授权"允许安装未知来源应用"，首次点更新时 App 会引导去开启）；签名用你现有的正式 keystore，第三方伪造的包无法覆盖安装。

## 7. 部署与环境

- **本地联调**：mock 方式——`UPDATE_BASE_URL` 指向本地临时服务（或临时在 VPS 发布 bookkeeping 测试版）；模拟器验证：安装老版（com.neobee.bookkeeping）→ 覆盖安装新 APK → 走通检查/下载/安装流程。
- **构建**：`mobile/android/gradlew assembleRelease`，release 用 `keystore/bookkeeping-release.keystore`（口令见 `keystore/release-signing.properties`，别名 bookkeeping）。
- **线上发布（本地完成后）**：
  1. 构建 release APK（versionName 2.0.0 / versionCode 200）
  2. 通过 MCP `deploy_app`：appName=`bookkeeping`，version=`2.0.0`，changelog 按需，icon 可选
  3. 手机（已装老版）从 `https://app.xyvora.me` 下载页扫码/点击下载 → 覆盖安装 → 之后新版之间自动 OTA
- 现有后端 `/app-updates`、容器（neobee-nginx / bookkeeping-backend）不动。

## 8. 修订记录

| 时间 | 变更说明 |
| --- | --- |
| 2026-08-16 12:49 | 创建架构文档；确定 OTA 数据流（info.json + DownloadManager + FileProvider）、包名统一 com.neobee.bookkeeping、MCP force 增强 |
| 2026-08-16 13:05 | 后端设计（公告栏机制 + 系统下载安装 + MCP force 增强）经用户确认；前端风格确认为 A 活力渐变 |
| 2026-08-16 14:15 | 联调完成：UpdaterModule 广播注册 API 33+ 需 RECEIVER_EXPORTED（下载完成广播由非 system uid 的 downloads provider 发送）；Manifest 类名改为全限定（applicationId 与 namespace 分离）；release APK 最终构建通过（com.neobee.bookkeeping/200/2.0.0/正式签名） |
