# 需求文档：Bookkeeping App OTA 更新 v0.2

- 创建时间：2026-08-16 12:49
- 版本：v0.2
- 状态：已确认

## 1. 背景与目标

v0.1 已完成 React Native 原生 Android 重构（`mobile/`，RN 0.87 + TS），但**没有 OTA 更新能力**：线上老版（Capacitor 套壳，`com.neobee.bookkeeping`，versionName 1.0.29）部署在 VPS 容器（`/root/neobee-stack/bookkeeping-updates`，后端容器挂载目录），手机上仍为老版本；v0.1 新版包名为 `com.bookkeepingapp`，**包名不一致导致无法覆盖安装**。

目标：为 RN 版增加 OTA 更新：手机 App 启动/手动检查远端版本清单（app.xyvora.me），发现新版本自动弹窗提示，用户点击即可下载并**覆盖安装（无需卸载重装）**；同时将 RN 版包名统一为老版 `com.neobee.bookkeeping` 并启用正式签名，保证老版本可原地覆盖升级。

> 注：本次范围 = 本地工程改造 + MCP 服务增强。VPS 上发布 bookkeeping 应用（推 APK 到 app.xyvora.me）**在本地完成后进行**（用户操作或后续协助），本次不做线上发布。

## 2. 功能需求

| 编号 | 需求描述 | 优先级 |
| --- | --- | --- |
| FR-01 | 启动检查更新：App 启动（登录态就绪后）静默检查 `https://app.xyvora.me/bookkeeping/info.json`，对比远端 `version` 与本地 versionName，有新版本时弹出更新提示（启动检查失败不打扰用户） | 高 |
| FR-02 | 更新弹窗：展示新版本号、APK 大小、更新说明（changelog）；按钮「立即更新」+「稍后」；`force: true`（强制更新）时隐藏「稍后」、不可关闭 | 高 |
| FR-03 | 立即更新：校验/引导「安装未知来源应用」权限 → 系统 DownloadManager 下载（通知栏显示进度）→ 下载完成自动唤起系统安装器 → 覆盖安装（包名+签名一致，**不卸载、保留数据**） | 高 |
| FR-04 | 手动检查入口：「我的」页新增「检查更新」行；点击后检查：有更新弹窗；无更新提示「已是最新版本」；失败提示重试 | 中 |
| FR-05 | 包名与签名统一：RN 版 `applicationId` 改为 `com.neobee.bookkeeping`；release 构建改用 `keystore/bookkeeping-release.keystore`（alias `bookkeeping`）正式签名；versionName `2.0.0`、versionCode `200` | 高 |
| FR-06 | MCP 服务增强（`F:\Work\Program\MCP\app-distribute-mcp`）：`deploy_app`/`update_metadata` 支持 `force` 参数；`info.json` 增加 `force` 字段；下载页 index.html 对强制更新版本显示「强制更新」徽标 | 中 |
| FR-07 | 「稍后」行为：点击后本次启动不再弹窗（内存标记），下次启动重新检查；不做持久化忽略 | 低 |

## 3. 非功能需求

- **可用性**：启动检查静默失败（无网络/服务器异常不报错、不阻塞启动）；手动检查需明确反馈结果。
- **兼容性**：minSdk 24（Android 7.0）；Android 8.0+ 安装未知来源需动态引导；DownloadManager 下载文件落公共下载目录，通过 FileProvider 暴露给安装器。
- **安全**：下载走 HTTPS；APK 下载与安装沿用系统机制；签名使用正式 keystore（非 debug 签名）。
- **工程规范**：TS 严格模式；版本比较按 `X.Y.Z` semver；更新相关配置集中到 `mobile/src/config.ts`。
- **性能**：下载不阻塞 UI（系统下载服务）；检查更新仅一个轻量 GET 请求。

## 4. 验收标准

- [ ] RN 版 `applicationId` 为 `com.neobee.bookkeeping`，release APK 使用 `bookkeeping-release.keystore` 签名，versionName 2.0.0 / versionCode 200
- [ ] release APK 可覆盖安装到已装老版（com.neobee.bookkeeping）的手机/模拟器，无需卸载
- [ ] 启动后自动检查 info.json：本地版本 < 远端版本时弹出更新弹窗（版本/大小/changelog 正确）
- [ ] 点「立即更新」：权限引导 → 系统下载 → 完成后唤起安装器 → 覆盖安装成功
- [ ] 点「稍后」：本次启动不再弹；重启 App 后再次弹出
- [ ] force=true 时弹窗无「稍后」按钮且不可关闭
- [ ] 「我的」页「检查更新」：有更新弹窗 / 无更新提示已最新 / 失败提示
- [ ] 断网启动 App 不报错、不弹窗、正常使用
- [ ] MCP 服务：deploy_app 与 update_metadata 可传 force；info.json 含 force 字段；下载页显示强制徽标
- [ ] 后端 `/app-updates` 不动；VPS 发布 bookkeeping 应用为本地完成后的后续操作（不在本验收范围）

## 5. 约束与假设

- 仅 Android；不走后端 `/app-updates`（其 1.0.27~1.0.29 老记录保留不动）。
- 更新源固定 `https://app.xyvora.me/bookkeeping/info.json`（appName=`bookkeeping`，经 MCP `deploy_app` 发布创建）。
- VPS（45.63.124.218）/app.xyvora.me 在本地完成后发布；本地联调用 mock info.json 或临时发布测试版本。
- 老版（Capacitor 1.0.29）无检查更新功能，首次升级为手动下载覆盖（用户已确认接受）。
- 版本比较按字符串 semver（`2.0.0` > `1.0.29`）；versionCode 200 保证覆盖老版任意历史编码。

## 6. 待确认 Q&A

| 问题 | 用户回答 | 时间 |
| --- | --- | --- |
| MCP 服务位置/机制 | `F:\Work\Program\MCP\app-distribute-mcp`，经 SSH 推 APK 到 45.63.124.218，下载页 app.xyvora.me；info.json 契约 {name,version,description,changelog,updatedAt,size,apkUrl} | 2026-08-16 12:49 |
| 更新源 | app.xyvora.me 静态托管（info.json + latest.apk） | 2026-08-16 12:49 |
| appName | bookkeeping（线上尚无此应用，发布时创建） | 2026-08-16 12:49 |
| 更新策略 | 可选更新 + 可设置强制（force 字段）；MCP 服务加 force 支持 | 2026-08-16 12:49 |
| 检查时机 | 启动时自动检查一次 + 「我的」页手动入口；点「稍后」本次启动不再弹 | 2026-08-16 12:49 |
| 包名统一 | 本地 RN 工程改 `com.neobee.bookkeeping`；VPS 上的发布等本地完成后进行 | 2026-08-16 12:49 |
| 版本号 | versionName 2.0.0 / versionCode 200 | 2026-08-16 12:49 |
| 首次升级 | 接受：老版无检查功能，第一次手动下载覆盖安装，之后自动 OTA | 2026-08-16 12:49 |

## 7. 修订记录

| 时间 | 变更说明 |
| --- | --- |
| 2026-08-16 12:49 | 创建需求文档；完成澄清（更新源/策略/时机/包名/版本号/首次升级方式） |
| 2026-08-16 14:15 | 联调完成：全链路（检查/弹窗/下载/安装/覆盖）验证通过；修复 API 33+ 广播 exported 与 Manifest 全限定类名两个 bug；确认 config.ts 联调后已恢复线上更新地址 |
