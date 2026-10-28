# v0.14 需求：拾光 API 主机名迁移

- 创建时间：2026-10-28
- App 版本：2.5.1 / versionCode 229
- 目标：将 Android 客户端从 `api.bookkeeping.neobee.top` 改为 `api.neobee.top`，避免 Cloudflare Universal SSL 对深层主机名的覆盖限制。

## 1. 背景与范围

旧 API 主机名经 Cloudflare 代理时 TLS 握手失败；源站自身健康。迁移为一级主机名后，Cloudflare 边缘证书覆盖 `api.neobee.top`。无后端、数据库或 API 契约变更。

## 2. 功能需求

- FR-01：Release APK 的 API_BASE_URL 为 `https://api.neobee.top`。
- FR-02：登录、记账和其他既有 API 请求继续使用相同路径及响应契约。
- FR-03：APK 版本递增至 2.5.1 / versionCode 229，保持包名和发布签名不变。

## 3. 非功能需求

- Cloudflare 橙云下的 API 请求不得返回浏览器交互式 challenge。
- Nginx 源站须为新主机提供有效 HTTPS 证书，并反代到既有 backend upstream。
- 不改数据库结构、后端代码或既有 OTA 清单契约。

## 4. 验收

- `https://api.neobee.top/health` 经 Cloudflare 返回 JSON 200，非浏览器客户端 UA 不触发 challenge。
- 本机 `tsc --noEmit`、Jest、ESLint 与 Android `assembleRelease` 通过。
- APK versionCode/versionName、签名证书及内嵌 API URL 经检查正确。
- OTA `info.json` 与 `latest.apk` 的版本、字节数和 SHA-256 与构建产物一致。
- 真机安装及记账流程待 USB ADB 设备可用后验收。
