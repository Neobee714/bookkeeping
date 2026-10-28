# v0.14 发布记录：2.5.1 API 主机名迁移

- 发布：2026-10-28 05:22:48 UTC
- 版本：**2.5.1 / versionCode 229**
- 状态：**已发布 OTA**；真机安装验收待手机连接。
- 源码提交：`8365f9f441a2e724080637786094b5b4b476bd7a`

## 1. 改动

- App API 地址由 `https://api.bookkeeping.neobee.top` 改为 `https://api.neobee.top`。
- 后端、数据库、接口路径和响应结构不变。
- 配置 Cloudflare Bot Fight Mode 前，边缘向 API 请求返回 Managed Challenge；用户关闭了 `neobee.top` 区域的 Bot Fight Mode 后，Cloudflare API 健康检查恢复 200。该安全设置影响整个 `neobee.top` 区域。

## 2. APK

| 项 | 值 |
| --- | --- |
| 包名 | `com.neobee.bookkeeping` |
| 路径 | `mobile/android/app/build/outputs/apk/release/app-release.apk` |
| 大小 | 76,876,449 bytes |
| SHA-256 | `f14a7f46cbd786c402ea4ff8658fb93304030fab58d009bf6000228db567d0bc` |
| versionCode / versionName | 229 / 2.5.1 |
| 签名证书 SHA-256 | `d8d8202ec0c4b7065330b7d144ac2855113ab012dee1644ffa8c32e9fef6c06c` |
| OTA `updatedAt` | `2026-10-28T05:22:48.000Z` |

## 3. 验证

| 项 | 结果 |
| --- | --- |
| TypeScript | `npx tsc --noEmit` 通过 |
| Jest | `npx jest --runInBand` 通过 |
| ESLint | `npx eslint .` 通过 |
| Android | `assembleRelease` 成功；versionCode/name 与包名正确 |
| 签名 | `apksigner verify` 成功；证书 SHA-256 与既有发布密钥一致 |
| Bundle | 包含 `https://api.neobee.top`，不包含旧 API 主机名 |
| Cloudflare API | 以 `okhttp/4.12.0` 请求 `/health` 返回 JSON 200 |
| 源站 | Nginx HTTPS `/health` 返回 JSON 200；Certbot dry-run 通过 |
| OTA manifest | version 2.5.1、size 76,876,449、`force=false` |
| OTA 下载 | 公网 `latest.apk` SHA-256 与本机构建一致 |
| VPS 轮询 | main 指向 8365f9f；只记录 mobile 改动，无 backend 重启；无 ALERT |
| 真机 | 待用户接入设备；当前 ADB 无设备 |

## 4. 获取

- 下载页：<https://app.xyvora.me/>
- 直链：<https://app.xyvora.me/bookkeeping/latest.apk>
- 清单：<https://app.xyvora.me/bookkeeping/info.json>

旧版 App 仍请求 `api.bookkeeping.neobee.top`，需安装此更新版以使用新 API 主机名。

## 5. 回退

没有数据库迁移。**不要仅回装 2.5.0**：旧 API 主机名在当前 Cloudflare 边缘证书配置下仍不可用。若必须回退，先为旧的深层主机名恢复可用的 Cloudflare 边缘 TLS，再发布/安装旧 APK。
