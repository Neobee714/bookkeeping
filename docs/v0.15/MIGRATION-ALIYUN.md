# v0.15 迁移记录：全量迁到阿里云（上海）+ DNS 回迁云解析

- 执行日期：2026-11-10
- 源机：`206.237.5.95`（旧 VPS，保留为回滚机，`bk-deploy.timer` 已停、后端容器已停）
- 目标机：`8.159.138.36`（阿里云 ECS，`cn-shanghai`，2C / 1.7G / 40G，Ubuntu 22.04）
- 备案：`苏ICP备2026087438号`（主体 吴俊达；网站 `xyvora.me`、`neobee.top`）
- 域名 DNS：由 Cloudflare 迁回阿里云云解析（`dns19/20.hichina.com`、`dns21/22.hichina.com`）

## 1. 为什么迁

1. 备案接入商是阿里云，服务器却在外网 VPS 上，长期属于「接入不符」。
2. 旧机在 2026-11-10 05:29 起 DNS 解析整体失效（`systemd-resolved` 无法解析任何域名），
   导致 `bk-deploy.timer` 每轮 `git fetch` 报 `Could not resolve host: github.com` 并写 `ALERT.txt`；
   同一故障会让 `certbot` 续期失败。
3. 顺带解决两个遗留缺口：旧机没有每日数据库备份，没有防火墙。

## 2. 迁移了什么

| 项 | 内容 |
| --- | --- |
| 站点 | `/var/www/xyvora`（博客）、`/var/www/apps`（APK 分发）、`/srv/life-kitchen`（basic auth） |
| 后端 | Docker Compose 栈（`bookkeeping-backend` + `neobee-db`），端口仍只发布到 `127.0.0.1:18080` |
| 数据库 | `pg_dump` → 恢复演练 → 换库，`users`/`transactions`/`categories`/`alembic_version` 行数与被迁机一致 |
| Nginx | 四个 vhost：`api-neobee`（补建）、`app-xyvora`、`bookkeeping`、`xyvora.me` |
| 证书 | `api.neobee.top` 独立证书整体搬迁（含 archive/renewal）；`api.bookkeeping.neobee.top` 那条重签，去掉已废弃的 SAN |
| CI | `/opt/bookkeeping/{ci,repo,dumps,distribute}`，`last-deployed` 基线设为 `74e1b9b`，`PUBLIC_HOST` 改为 `api.neobee.top` |
| 备份 | 新增 `/opt/bookkeeping/backup/daily.sh` + `/etc/cron.d/bookkeeping-backup`，每天 03:30，保留 30 份 |
| 安全 | `ufw` 只放行 22/80/443；`fail2ban` 启用 sshd jail |
| 证书续期 | 新增 `renewal-hooks/deploy/50-reload-nginx.sh`（webroot 续期不会自动 reload nginx） |

部署用户 `ubuntu`（uid 1000 / gid 1001）与旧机一致，`ci.env`、unit 文件、脚本无需改写。

## 3. 验证矩阵（实测）

| 项 | 结果 |
| --- | --- |
| 权威解析 | 四个公共解析器（1.1.1.1 / 8.8.8.8 / 119.29.29.29 / 223.5.5.5）均返回 `8.159.138.36` |
| 回源确认 | 在目标机写入唯一探测文件，经公共 DNS（DoH）请求命中 200，且目标机 nginx 日志有对应记录 |
| 博客 | `https://xyvora.me/` 200 |
| 下载站 | `https://app.xyvora.me/` 200；`info.json` = 2.5.1（size 76,876,449） |
| APK 完整性 | 从目标机直连下载 `latest.apk`，SHA-256 = `f14a7f46…d0bc`，与本机构建一致 |
| API | `https://api.neobee.top/health` 返回 `{"success":true,...}` |
| life-kitchen | `/kitchen/` 401（basic auth 生效） |
| 证书 | `app.xyvora.me, neobee.top, www.neobee.top` 至 2027-02-08；`api.neobee.top` 至 2027-01-26；`xyvora.me` 至 2027-01-12 |
| 续期演练 | `certbot renew --dry-run`：三条 lineage 全部 `Congratulations` |
| ACME 通道 | 六个域名在目标机 80 端口的 `/.well-known/acme-challenge/` 全部 200 |
| CI | `git fetch` 成功，判定「无需部署」；`bk-deploy.timer` active |
| 备份 | 手工触发 `daily.sh` 成功，产出 56K dump，gzip 与内容校验通过 |

## 4. DNS 与邮箱

- 两个域名的注册局 NS 已指向阿里云：`xyvora.me → dns19/dns20.hichina.com`、`neobee.top → dns21/dns22.hichina.com`。
- 云解析中 6 条 A 记录全部为 `8.159.138.36`（apex / www / app / api）。
- **`neobee.top` 的邮件转发已废弃**：原方案是 Cloudflare Email Routing（`route1/2/3.mx.cloudflare.net`），
  它要求域名必须用 Cloudflare 做权威 DNS，NS 迁出后必然失效，因此按用户决定不再保留。
  现在该域没有 MX 记录，发往 `@neobee.top` 的信会直接退信。

## 5. 回滚

1. 旧机数据未删：`/opt/bookkeeping/stack` 保留，`neobee-db` 容器仍在运行，`bookkeeping-backend` 已停。
2. 恢复旧机服务：`cd /opt/bookkeeping/stack && docker compose up -d backend`。
3. 改回 NS（注册局）：`anuj.ns.cloudflare.com` / `leanna.ns.cloudflare.com`；Cloudflare 侧的 6 条 A 记录仍指旧 IP。
4. 等 NS 生效（委派 TTL 3600s）。
5. 注意：切流后写到新库的数据不会自动回流旧库，回滚前需按 `pg_dump` 反向同步。

## 6. 遗留

- 旧机 DNS 已坏，`certbot.timer` 与 `bk-deploy.timer` 均已停用；确认无需回滚后可退租。
- 备份仍只有本机 + 部署快照，**没有异地副本**（建议后续同步到 OSS 或本机 Mac）。
- 目标机没有 IPv6（`ip -6` 无全局地址），因此云解析不要加 AAAA。
