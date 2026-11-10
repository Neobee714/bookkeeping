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

---

# 2.5.2 补丁发布记录：分类宫格末行塌陷

- 发布：2026-11-10 07:37:51 UTC
- 版本：**2.5.2 / versionCode 230**
- 状态：**已发布 OTA**；真机（vivo V2339A）已安装并验收通过。
- 源码提交：`4fbc75e`（修复）、`77d06a6`（文档）

## 1. 问题与根因

记账弹层分类宫格里，第 13 个分类「旅游」独占最后一行。点击它之后该格从 228px 塌成 66px
细条，图标和文字都消失，看起来像被裁掉一半，再滑动也看不到它。

根因：选中态把图标与文字包进 `position:absolute` 的 `GradientView`（`catActiveFill`），
`Pressable` 自身没有任何正常流子元素，高度只剩 `paddingVertical`（22px + 边框）——
同行其它分类有未选中的兄弟项撑高度时看不出来，独占一行时立刻塌陷。
顺带：`cat` 的 `flex: 1` 让唯一一项被拉成整行宽，与 4 列宫格不一致。

## 2. 改动

- `GradientView` 只做绝对定位背景层，图标/文字始终留在正常流，选中/未选中高度一致。
- 末行不足 4 项时渲染 `catSpacer`（`flex: 1`）占位，单个分类保持 1/4 宽度。

## 3. APK

| 项 | 值 |
| --- | --- |
| 包名 | `com.neobee.bookkeeping` |
| 大小 | 76,876,489 bytes |
| SHA-256 | `caa6935b4141e2d444b3b893a76861cbd31004ed70e185e88b46e1c3abe679ea` |
| versionCode / versionName | 230 / 2.5.2 |
| 签名证书 SHA-256 | `d8d8202ec0c4b7065330b7d144ac2855113ab012dee1644ffa8c32e9fef6c06c` |
| OTA `updatedAt` | `2026-11-10T07:37:51.000Z`（`force=false`） |

## 4. 验证

| 项 | 结果 |
| --- | --- |
| TypeScript / Jest / ESLint | `tsc --noEmit` 通过；`jest` 9 套件 48 用例全通过；`eslint` 仅既存 `no-void` 警告 |
| Android | `assembleRelease` 成功；versionCode 230 / versionName 2.5.2 |
| 签名 | 证书 SHA-256 与既有发布密钥一致 |
| 真机复现（2.5.1） | 滚到末行「旅游」= 228px 可读；点击后变 66px 细条、文字消失，再滑动仍 66px |
| 真机验收（2.5.2） | 点击「旅游」保持 228px、渐变高亮、白字可读；宽度 207px 与同行一致 |
| 回归 | 点「餐饮」正常高亮；空金额提交弹出「请输入有效金额」；弹层滚动、日期、快捷 chips 均正常 |
| OTA | `info.json` version 2.5.2 / size 76,876,489 / `force=false`；公网 `latest.apk` SHA-256 与一致 |

## 5. 回退

纯 JS 改动，无后端/数据库变更。回退只需重发上一版 APK（`bookkeeping-2.5.1.apk` 仍在
`/var/www/apps/bookkeeping/`），`versionCode 229` 不能覆盖安装 230，需先卸载或重发 231。
