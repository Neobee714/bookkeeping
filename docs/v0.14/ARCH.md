# v0.14 架构：拾光 API 主机名迁移

- 创建时间：2026-10-28

## 1. 流量链路

```text
Android App
  → https://api.neobee.top
  → Cloudflare 橙云 / Universal SSL
  → Let's Encrypt 源站证书
  → Nginx api.neobee.top HTTPS vhost
  → 既有 bookkeeping_api upstream
  → 原 backend 容器与数据库
```

## 2. 主机名与证书

- Cloudflare DNS：`api.neobee.top` A 记录指向 `206.237.5.95`，橙云代理开启。
- 源站证书：`/etc/letsencrypt/live/api.neobee.top/`，由 webroot HTTP-01 签发；Certbot dry-run 通过。
- Nginx 为 `api.neobee.top` 建立独立 TLS vhost，复用既有 API 路由和 backend upstream。
- HTTP-01 challenge 由 `/var/www/certbot` 服务；部署 hook 在证书续期后 reload Nginx。

## 3. Cloudflare 防护

事件日志确认 `neobee.top` 区域的 Bot Fight Mode 对 API 客户端返回 Managed Challenge。经用户确认，已关闭该区域 Bot Fight Mode；此设置影响该区域内所有代理主机名。API 现经 Cloudflare 返回 JSON 200。

## 4. 客户端与部署

- `mobile/src/config.ts` 中 API_BASE_URL 改为 `https://api.neobee.top`。
- Android `versionCode=229`、`versionName=2.5.1`；包名及签名密钥保持不变。
- Git 主分支提交 `8365f9f` 只改 mobile 文件，目标机轮询确认仅记录提交，没有重启 backend。
- APK 由本机 Gradle 构建，再经 `/opt/bookkeeping/distribute/publish.sh` 发布到 OTA 站点。

## 5. 回退注意

2.5.0 仍请求旧的深层域名；该主机名经当前 Cloudflare Universal SSL 路径不可用。回退客户端前必须先恢复旧域名的可用边缘 TLS（例如配置覆盖该完整主机名的边缘证书），不能只安装旧 APK。
