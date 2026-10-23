# v0.10 架构：应用内前台下载服务

- 创建时间：2026-10-23 16:57

## 1. 为什么替换 DownloadManager

DownloadManager 是系统组件，下载 Job 由 `DownloadJobService` 执行，网络条件固定为
`INTERNET & TRUSTED & VALIDATED & NOT_VCN_MANAGED`。国产 ROM 的 Wi-Fi 常因无法访问
Google 的 `generate_204` 被判定为「部分连通」，Job 永远不满足 CONNECTIVITY，
于是：

- `enqueue()` 成功，返回 id；
- 原生立即 `promise.resolve(true)`，JS 提示「已在后台下载」；
- 实际 `bytes_so_far=0`，没有通知，也没有错误。

DownloadManager 没有公开 API 放宽 VALIDATED 要求，因此只能绕开它。

## 2. 新流程

```
点「立即更新」
  → canRequestPackageInstalls()
      ├─ 否 → 引导系统设置
      └─ 是 → 请求 POST_NOTIFICATIONS（Android 13+，拒绝也继续）
          → UpdaterModule.downloadAndInstall()
              → startForegroundService(ApkDownloadService)
                  → startForeground(dataSync, 进度通知)
                  → HttpURLConnection GET apkUrl
                  → 写 <external-files>/updates/bookkeeping-2.4.1.apk.part
                  → 每 1%/1s 更新通知
                  → 校验 Content-Length、包名
                  → .part 重命名为正式文件
                  → 发「下载完成」通知 + PendingIntent 安装器
                  → 尝试 startActivity(安装器)，失败则等用户点通知
```

## 3. 组件

| 文件 | 职责 |
| --- | --- |
| `mobile/android/.../ApkDownloadService.kt` | 前台服务、下载线程、进度/完成/失败通知、安装 Intent |
| `mobile/android/.../UpdaterModule.kt` | 权限检查、启动服务、Promise 语义（启动成功即 resolve） |
| `mobile/src/updater/flow.ts` | 通知权限请求、更新流程编排、错误提示 |
| `mobile/src/updater/useUpdateCheck.ts` | 弹窗关闭 + 「已在后台下载」提示文案 |
| `AndroidManifest.xml` | POST_NOTIFICATIONS / FOREGROUND_SERVICE / DATA_SYNC 权限与服务声明 |
| `res/xml/file_paths.xml` | `external-files-path updates/` 供 FileProvider 读取 |

## 4. 通知

- 渠道：`app_update_download`，「应用更新」，IMPORTANCE_LOW，不响铃、不角标。
- 进度通知：`setOngoing(true)`、`setOnlyAlertOnce(true)`、
  `setProgress(100, percent, percent < 0)`；标题「正在下载拾光更新」，
  副标题「x MB / y MB」。
- 完成通知：`setAutoCancel(true)`，点击进入系统安装器。
- 失败通知：`setAutoCancel(true)`，点击回到 App。
- 通知权限被拒绝时 `NotificationManagerCompat.notify` 捕获 `SecurityException`，
  下载继续；JS 在开始前提示「通知栏看不到进度」。

## 5. 权限与 Android 版本

- `POST_NOTIFICATIONS`（API 33+，运行时请求）。
- `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_DATA_SYNC`（API 34+）。
- `foregroundServiceType="dataSync"`，`startForeground(..., FOREGROUND_SERVICE_TYPE_DATA_SYNC)`。
- `REQUEST_INSTALL_PACKAGES` 沿用；FileProvider authority 不变。
- Android 10+ 后台启动 Activity 可能被拦截，因此完成通知的 PendingIntent 是主路径，
  `startActivity` 只是尽力而为。

## 6. 失败处理

| 场景 | 行为 |
| --- | --- |
| URL 非 HTTPS | 服务拒绝，发失败通知 |
| HTTP 非 2xx | 失败通知「下载服务器返回 HTTP xxx」 |
| 网络中断/超时 | 失败通知；`.part` 删除，可重试 |
| Content-Length 不符 | 失败通知「下载不完整」 |
| 包名不匹配 | 失败通知「安装包校验失败」，不安装 |
| 通知权限被拒 | 下载继续，无通知；JS 已提示 |
| 用户杀进程 | 前台服务通常继续；若被 ROM 杀掉，下载中断，可重新点更新 |

## 7. 发布影响

- 版本 2.4.1 / 225，签名与 2.4.0 相同，可覆盖安装。
- 2.2.2/2.4.0 的旧更新器仍会被 DownloadManager 卡住，因此本次必须手动下载
  `https://app.xyvora.me/bookkeeping/latest.apk` 安装一次；之后恢复应用内更新。
- 后端无改动，无需迁移。
