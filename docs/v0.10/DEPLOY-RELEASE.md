# v0.10 发布记录：2.4.1 修复 OTA 下载卡住

- 创建时间：2026-10-24 00:26
- 版本：**2.4.1 / versionCode 225**
- 状态：**已发布（2026-10-24 00:24）**；模拟器全链路验证通过；
  真机 HTTPS 验收待用户安装后确认。

## 1. 问题

线上 2.2.2/2.4.0 点「立即更新」后提示「已在后台下载」，但通知栏没有下载进度，
安装包也没有真正下载。

## 2. 根因

系统 `DownloadManager` 的下载 Job 强制要求网络具备
`NET_CAPABILITY_VALIDATED`。国产 ROM / 部分 Wi-Fi 因为连不上 Google 的连通性探测，
网络被标记为 `PARTIAL_CONNECTIVITY`，任务一直停在 `STATUS_WAITING_FOR_NETWORK`：

- App 自己的 HTTPS 请求（info.json）正常，所以能弹更新；
- DownloadManager Job `Unsatisfied constraints: CONNECTIVITY`，`bytes_so_far=0`；
- 不产生下载通知，也不报错。

模拟器证据：`dumpsys jobscheduler` 中 DownloadManager Job 的网络约束不满足；
`content query content://downloads/my_downloads` 返回 `status=190, bytes_so_far=0`。

## 3. 修复

- 新增 `ApkDownloadService.kt`：应用内前台服务，用 `HttpURLConnection` 直接下载
  （只要求 HTTPS，不要求系统 VALIDATED）。
- `UpdaterModule.downloadAndInstall` 改为 `startForegroundService`，不再用
  DownloadManager。
- 通知：渠道 `app_update_download`（LOW）；进度 7301、完成 7302、失败 7303。
- 完成通知点击进入系统安装器；Android 10+ 后台启动 Activity 被拦截时由通知兜底。
- 文件写入 `getExternalFilesDir("updates")`，`.part` 成功后重命名；校验
  Content-Length 与 APK 包名。
- Android 13+ 请求 `POST_NOTIFICATIONS`；拒绝时仍下载，JS 提示看不到进度。
- 版本 2.4.1 / 225。

## 4. APK

| 项 | 值 |
| --- | --- |
| 路径 | `mobile/android/app/build/outputs/apk/release/app-release.apk` |
| 大小 | 76,852,969 bytes |
| SHA-256 | `02418c3010d7d3914bf84291f38109739c32e019b8e2abd28ee6a7f1a7c6837d` |
| versionCode / versionName | 225 / 2.4.1 |
| label / package | 拾光 / `com.neobee.bookkeeping` |
| 签名 | v2，证书 SHA-256 `d8d8202e…f6c06c`（与 2.4.0/2.2.2 一致） |

构建：`assembleRelease` 增量 58s；Kotlin 编译通过。

## 5. 验证

| 项 | 结果 |
| --- | --- |
| `tsc --noEmit` | 0 错误 |
| `jest` | 8 suites / 37 tests 全过 |
| `eslint src/updater App.tsx` | 0 errors / 2 warnings |
| 前台服务启动 | `foregroundId=7301`、`types=00000001`（dataSync） |
| 下载 | 本机 HTTP 测试源完整下载 76,852,969 bytes |
| 完成通知 | 7302「拾光更新已下载」出现 |
| 通知点击 | 打开系统安装器 → Update → App installed |
| 最终 APK | 已移除临时 HTTP 放行，仅允许 HTTPS |
| 真机 HTTPS | **待用户**：vivo 安装 2.4.1 后点更新验证 |

> 模拟器的 DNS 在测试时为 `UnknownHostException`（无法解析 `app.xyvora.me`），
> 因此端到端下载用本机 HTTP 测试源验证，临时放行已在最终 APK 中删除。
> vivo 上 info.json 能正常拉取，说明 HTTPS/DNS 路径可用；真机需再确认一次。

## 6. OTA

| 项 | 值 |
| --- | --- |
| 发布 | 2026-10-24 00:24，`publish.sh` |
| 下载页 | https://app.xyvora.me/ |
| 直链 | https://app.xyvora.me/bookkeeping/latest.apk |
| info.json | version 2.4.1、size 76,852,969 |
| 归档 | `/var/www/apps/bookkeeping/bookkeeping-2.4.1.apk` |
| meta.json | sha256 与 APK 一致 |

## 7. 用户操作（重要）

2.2.2/2.4.0 的旧更新器仍会被 DownloadManager 卡住，**无法通过应用内更新拿到 2.4.1**。
需要在手机浏览器打开：

```
https://app.xyvora.me/bookkeeping/latest.apk
```

下载后直接安装（同一签名，覆盖安装、保留数据）。安装 2.4.1 后，再点「立即更新」
就会走新的前台下载服务；后续版本可正常应用内更新。

如果通知权限被拒绝：下载仍会继续，但通知栏没有进度；请在系统设置里允许「拾光」通知。

## 8. 回退

- App 回退安装 2.4.0（归档 `bookkeeping-2.4.0.apk`）；2.4.0 仍有本下载 bug。
- 更稳的回退是 2.2.2（归档仍在），但会失去离线与主题。
- 后端无改动；无需迁移。

## 9. 已知限制

- 前台服务被 ROM 强杀时下载会中断，重新点更新即可（无断点续传）。
- 通知被用户关闭时看不到进度；下载完成仍会尝试打开安装器。
- 安装包不校验签名，只校验包名；签名不一致时由系统安装器拒绝。
