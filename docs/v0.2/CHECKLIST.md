# 开发清单：Bookkeeping App OTA 更新 v0.2

- 创建时间：2026-08-16 12:49
- 规则：每完成一个小点标记 ✅，并附完成时间戳 `YYYY-MM-DD HH:mm`。

## 阶段一：需求与设计

- [x] 需求澄清完成 ✅ 2026-08-16 12:49
- [x] 三文档创建 ✅ 2026-08-16 12:49
- [x] 后端设计确认（OTA 链路 + MCP force 增强白话说明，用户确认）✅ 2026-08-16 12:58
- [x] 前端风格确认（更新弹窗 3 风格原型 → 用户选定 A 活力渐变 → 已写入 ARCH.md）✅ 2026-08-16 12:58

## 阶段二：MCP 服务增强（app-distribute-mcp）

- [x] `remote.ts`：AppInfo 增加 `force?: boolean`；writeInfo/readInfo 读写 force（缺省 false）✅ 2026-08-16 13:10
- [x] `tools.ts`：`deploy_app` 与 `update_metadata` 增加 `force` 参数并写入 info ✅ 2026-08-16 13:10
- [x] `indexgen.ts`：下载页对 force=true 显示「强制更新」徽标 ✅ 2026-08-16 13:10
- [x] 重新构建 dist（tsc）并通过冒烟/回归验证（含 force 传递）✅ 2026-08-16 13:10（build 零错误；health/list 正常；老 info.json 缺省 false；服务器零改动）

## 阶段三：RN 工程配置（包名/签名/版本号）

- [x] `mobile/android/app/build.gradle`：applicationId 改 `com.neobee.bookkeeping`；versionName `2.0.0`、versionCode `200`；release 签名用 `bookkeeping-release.keystore` ✅ 2026-08-16 13:25（口令从 properties 读取不硬编码；路径已实测解析正确）
- [x] 新增 `react-native-device-info` 依赖并确认链接（读 getVersion）✅ 2026-08-16 13:25（^15.0.2，npm install 完成）
- [x] release APK 构建成功且签名/包名/版本号验证正确（aapt/apksigner）✅ 2026-08-16 13:45（com.neobee.bookkeeping / 200 / 2.0.0 / CN=Neobee 正式签名 / 72.5MB）

## 阶段四：检查更新逻辑

- [x] `src/config.ts` 增加 UPDATE_BASE_URL / UPDATE_APP_NAME ✅ 2026-08-16 13:10
- [x] `src/api/updates.ts`：拉取解析 info.json（version/size/changelog/apkUrl/force）+ semver 比较（含单元测试）✅ 2026-08-16 13:10（jest 7/7 通过）
- [x] 启动检查集成：登录态就绪后静默检查一次（失败静默）✅ 2026-08-16 13:35（UpdateGate 挂载根布局,未登录不检查;auto 静默/manual 提示）

## 阶段五：更新弹窗（选定风格后）

- [x] `src/components/UpdateModal.tsx`：版本/大小/changelog/按钮（立即更新/稍后）✅ 2026-08-16 13:15（风格 A 活力渐变,tsc/eslint 通过）
- [x] force 模式：无「稍后」按钮、不可关闭 ✅ 2026-08-16 13:15
- [x] 「稍后」内存标记：本次启动不再弹（入口集成任务实现）✅ 2026-08-16 13:35（useUpdateCheck store 的 reminded 标记,手动检查不受限）

## 阶段六：下载与安装（原生模块）

- [x] AndroidManifest：REQUEST_INSTALL_PACKAGES 权限 + FileProvider 声明 ✅ 2026-08-16 13:25
- [x] `res/xml/file_paths.xml` 暴露下载目录 ✅ 2026-08-16 13:25
- [x] `UpdaterModule.kt`：canRequestPackageInstalls / openInstallPermissionSettings / downloadAndInstall（DownloadManager + ACTION_VIEW）✅ 2026-08-16 13:25（assembleDebug 编译通过；RN 0.87 适配 reactApplicationContext）
- [x] RN 侧 `src/updater/index.ts` 桥接：权限引导流程 + 调起下载 ✅ 2026-08-16 13:25

## 阶段七：手动入口与联调验收

- [x] 「我的」页「检查更新」入口：有更新弹窗 / 无更新提示 / 失败提示 ✅ 2026-08-16 13:35（🔄 检查更新行,manual 场景三态齐全）
- [x] 模拟器联调：老版(com.neobee.bookkeeping) → 覆盖安装新版 → mock/临时发布 info.json 验证检查/弹窗/下载/安装全链路 ✅ 2026-08-16 14:10
  - 启动静默检查 → 弹窗(v2.0.1/大小/changelog)✅
  - 立即更新 → 安装权限引导 → DownloadManager 下载(通知栏)→ 系统安装器「Update」→ 覆盖安装成功,firstInstallTime 保留、登录态保留(Hi, OTATest)✅
  - 「我的」页手动检查:有更新弹窗 ✅;稍后按钮关闭弹窗、手动检查不受限 ✅
  - force 模式:标题「必须更新到新版本」、无「稍后」、红色强制提示、返回键不可关闭 ✅
  - 断网启动:无弹窗、无崩溃、正常进入已登录首页 ✅
  - 修复 2 个真实 bug:API 33+ 广播注册需显式 exported(RECEIVER_EXPORTED);applicationId 变更后 Manifest 类名需全限定(com.bookkeepingapp.MainActivity/Application)
- [x] 断网/异常场景：启动不报错、不弹窗 ✅ 2026-08-16 14:10
- [x] MCP force 端到端验证（发布 force 版本 → App 弹窗无「稍后」）✅ 2026-08-16 14:10（mock force=1 → 弹窗强制模式正确;MCP 侧 force 透传已由 build+代码走查验证）
- [x] 整体验收通过，向用户汇报（含 VPS 发布操作指引）✅ 2026-08-16 14:20

## 后续事项（本地完成后，不在本版本验收内）

- [x] 代码推送到 GitHub ✅ 2026-08-16 14:35（main 分支 8d0e324..dad267c；注：全局 .gitconfig 的 http.proxy 指向 SOCKS5 端口导致 git TLS 失败,禁用代理后直连推送成功）
- [x] VPS 自动部署确认 ✅ 2026-08-16 15:05（cron 每 5 分钟跑 /root/neobee-stack/deploy.sh：git pull + docker compose 重建 bookkeeping-backend；已自动拉取 dad267c 并重建后端容器）
- [x] bookkeeping v2.0.0 发布到 app.xyvora.me ✅ 2026-08-16 15:10
  - apkUrl https://app.xyvora.me/bookkeeping/latest.apk（HTTP 200，72.5MB）
  - info.json（version 2.0.0 / force false / 中文 UTF-8 正确）
  - 下载页 https://app.xyvora.me/#app-bookkeeping（卡片/下载按钮/二维码正常）
  - 注：MCP CLI 需直连 SSH（代理节点到 VPS 异常），通过 APP_MCP_SOCKS_PROXY='' 注入方式发布
- [ ] 手机上老版手动覆盖安装升级到 v2.0.0（用户操作：从下载页安装一次，之后自动 OTA）
- [x] 真机反馈网络连接失败 → 根因与修复 ✅ 2026-08-16 15:30
  - 根因：mobile/src/config.ts 的 API_BASE_URL 仍是本地联调地址 http://127.0.0.1:8000
  - 修复：改为线上 https://api.bookkeeping.neobee.top（health 验证正常）；版本升至 2.0.1/201 重新构建并发布到 app.xyvora.me（info.json/latest.apk 验证通过，中文 UTF-8 正确）；GitHub 推送 1f41073
