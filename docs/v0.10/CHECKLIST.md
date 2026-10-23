# v0.10 清单：修复 OTA 下载卡住（应用内前台下载）

- 创建时间：2026-10-24 00:25
- 版本：2.4.1 / versionCode 225

## 阶段 1：复现与根因

- [x] 模拟器安装 2.2.2，点「立即更新」复现「已在后台下载但无进度」✅ 2026-10-23 22:25
- [x] 查 DownloadManager 行：`status=190`、`bytes_so_far=0`、`/sdcard/Download` 为空 ✅
- [x] 查 JobScheduler：DownloadManager Job `Unsatisfied constraints: CONNECTIVITY`，
      网络为 `PARTIAL_CONNECTIVITY`（无 `VALIDATED`）✅
- [x] 确认 App 自身 HTTPS（info.json）可用，DownloadManager 强制要求 VALIDATED ✅

## 阶段 2：实现

- [x] 新增 `ApkDownloadService.kt`：前台服务 + HttpURLConnection + 进度/完成/失败通知 ✅
- [x] `UpdaterModule.kt` 改为启动服务，不再 enqueue DownloadManager ✅
- [x] `AndroidManifest.xml`：POST_NOTIFICATIONS、FOREGROUND_SERVICE、
      FOREGROUND_SERVICE_DATA_SYNC、`dataSync` service 声明 ✅
- [x] `file_paths.xml`：`external-files-path updates/` ✅
- [x] `flow.ts`：Android 13+ 请求 POST_NOTIFICATIONS；拒绝不阻塞下载 ✅
- [x] `useUpdateCheck.ts` / `index.ts`：文案与注释改为「点击通知安装」✅
- [x] 版本 2.4.1 / versionCode 225 ✅

## 阶段 3：门禁与构建

- [x] `tsc --noEmit` 0 错误 ✅ 2026-10-24 00:24
- [x] `jest` 8 suites / 37 tests 全过 ✅
- [x] `eslint src/updater App.tsx` 0 errors（2 warnings）✅
- [x] `Kotlin compileReleaseKotlin` 通过（含新服务）✅
- [x] `assembleRelease` 成功（增量 58s），76,852,969 bytes ✅
- [x] versionCode 225 / 2.4.1、label 拾光、v2 签名、证书 d8d8202e…f6c06c ✅
- [x] APK SHA-256 `02418c3010d7d3914bf84291f38109739c32e019b8e2abd28ee6a7f1a7c6837d` ✅

## 阶段 4：服务验证（模拟器）

- [x] 前台服务启动成功：`foregroundId=7301`、`types=00000001` ✅
- [x] 用本机 HTTP 测试源验证下载：76,852,969 bytes 完整落盘 ✅
- [x] 完成通知 7302「拾光更新已下载」出现 ✅
- [x] 展开通知栏点击完成通知 → 系统安装器 → 「Update」→ App installed ✅
- [x] 临时 HTTP 测试放行已删除，最终 APK 仅允许 HTTPS ✅
- [ ] 真机 HTTPS 端到端（vivo）——待用户安装 2.4.1 后验证

## 阶段 5：发布

- [x] `publish.sh` 发布 2.4.1；info.json / latest.apk / meta.json 回验 ✅ 2026-10-24 00:24
- [x] SHA-256 本地/服务器一致；latest.apk content-length 76,852,969 ✅
- [ ] 用户手动下载 2.4.1 安装一次（旧版更新器仍会卡住）
- [ ] 用户真机验收：点更新 → 通知栏进度 → 完成后安装

## 阶段 6：收尾

- [x] `docs/v0.10/{REQ,ARCH,CHECKLIST}.md` ✅
- [x] `docs/v0.10/DEPLOY-RELEASE.md` ✅
- [x] 更新 `bookkeeping-app-iteration` skill（DownloadManager 坑 + 前台服务方案）✅ 2026-10-24 00:30
- [ ] 用户确认后勾选真机项
