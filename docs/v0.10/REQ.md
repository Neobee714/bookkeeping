# v0.10 需求：修复 OTA 下载在国产 ROM 上卡住

- 创建时间：2026-10-23 16:55
- 版本：2.4.1 / versionCode 225
- 现象：线上 2.2.2/2.4.0 点「立即更新」后提示「已在后台下载」，但通知栏没有下载进度，
  安装包也没有真正下载。

## 1. 根因（已在模拟器复现）

系统 `DownloadManager` 的下载 Job 强制要求网络具备
`NET_CAPABILITY_VALIDATED`。国产 ROM / 部分 Wi-Fi 因为连不上 Google 的连通性探测，
网络被标记为 `PARTIAL_CONNECTIVITY`，DownloadManager 任务会一直停在
`STATUS_WAITING_FOR_NETWORK`：

- App 自己的 HTTPS 请求（info.json）正常，所以能弹出更新；
- DownloadManager 任务 `Unsatisfied constraints: CONNECTIVITY`，`bytes_so_far=0`；
- 不产生下载通知，也不报错，用户只看到「已在后台下载」。

模拟器证据：`dumpsys jobscheduler` 中 DownloadManager Job 的 `Satisfied constraints`
不含 CONNECTIVITY，`NetworkAgentInfo` 为 `PARTIAL_CONNECTIVITY`；`content query
content://downloads/my_downloads` 里 `status=190, bytes_so_far=0`。

## 2. 功能需求

- FR-01：更新下载不再依赖 DownloadManager，改用应用内前台服务 +
  `HttpURLConnection`，网络只要 App 自己能访问即可下载。
- FR-02：下载期间通知栏显示「正在下载拾光更新」及百分比/字节进度；通知常驻，
  不响铃。
- FR-03：下载完成发「拾光更新已下载」通知，点击通知进入系统安装器；
  下载失败发「更新下载失败」通知并带原因。
- FR-04：Android 13+ 首次更新前请求 `POST_NOTIFICATIONS`；用户拒绝时仍继续下载，
  但明确提示通知栏看不到进度。
- FR-05：安装包校验包名 `com.neobee.bookkeeping`，通过 FileProvider 暴露，
  覆盖安装、保留数据；校验失败不安装。
- FR-06：保留「安装未知来源应用」权限检查与引导。

## 3. 非功能需求

- 73MB 安装包下载期间 App 可切后台/锁屏，前台服务继续下载。
- 下载失败不产生半截 APK（用 `.part` 临时文件，成功后才重命名）。
- 不新增后端接口；OTA 清单契约不变。
- 旧版（2.2.2/2.4.0）无法通过应用内更新拿到本修复，需手动下载 2.4.1 安装一次；
  之后恢复应用内更新。

## 4. 验收

- 在 `PARTIAL_CONNECTIVITY` 的模拟器网络上，点「立即更新」后通知栏出现进度，
  字节数持续增长。
- 下载完成后能通过通知进入安装器，覆盖安装 2.4.1，数据保留。
- 拒绝通知权限时下载仍能完成（无通知，提示用户保持 App 打开）。
- `tsc` 0 错误、jest 全过、Kotlin 编译通过、release APK 签名与 2.4.0 一致。
