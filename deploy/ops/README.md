# deploy/ops：备份、巡检与告警

这些脚本**不随 CI 自动部署**，需要在服务器 / 本机手工安装一次；仓库里保存的是当前线上版本，便于重装时复原。

## 服务器（阿里云 `8.159.138.36`，`ssh aliyun`）

| 文件 | 线上位置 | 作用 |
| --- | --- | --- |
| `watchdog/check.sh` | `/opt/bookkeeping/watchdog/check.sh` | 巡检：容器、`pg_isready`、本机 `/health`、公网 `api.neobee.top/health`、`app.xyvora.me/bookkeeping/info.json`、两张证书剩余天数、最新每日快照是否超过 26 小时 |
| `watchdog/bk-healthcheck.service` | `/etc/systemd/system/` | oneshot 执行上面的脚本 |
| `watchdog/bk-healthcheck.timer` | `/etc/systemd/system/` | 每 10 分钟触发一次 |

安装：

```bash
sudo mkdir -p /opt/bookkeeping/watchdog /opt/bookkeeping/state
sudo install -m 755 check.sh /opt/bookkeeping/watchdog/check.sh
sudo install -m 644 bk-healthcheck.service bk-healthcheck.timer /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now bk-healthcheck.timer
sudo systemctl start bk-healthcheck.service
```

- 全部通过：退出码 0，不写任何文件。
- 发现问题：写 `/opt/bookkeeping/state/ALERT-health.txt`，并把 `ALERT` / `RECOVERED` 追加到 `/var/log/bk-healthcheck.log`。
- 可选外部推送：在 `/etc/default/bk-healthcheck` 里写 `ALERT_WEBHOOK="https://…"`（POST JSON `{"text": "…"}`，Bark / 企业微信机器人 / Telegram bot 都吃这种体），未配置时不推送。
- 自测：`sudo API_PUBLIC=http://127.0.0.1:9/health /opt/bookkeeping/watchdog/check.sh` 应返回 1 并写出告警文件；再正常跑一次应清掉告警。

## 本机 Mac（异地副本）

`offsite-sync.sh` 由 launchd `com.xyvora.bookkeeping-backup` 每天 12:30 执行：

1. `rsync` 拉 `daily_*.sql.gz`（服务端保留 30 份，本地保留 30 份）；
2. 拉一个配置包（nginx / compose / `.env` / CI / 证书 / systemd / cron / 本脚本与巡检脚本），**只打包远端确实存在的路径**；
3. 拉服务器巡检告警文件，若有近 24 小时的告警就弹 macOS 通知；
4. 快照超过 30 小时没更新、或任何一步失败，都弹通知（不再只写日志）。

安装位置：`~/bookkeeping-backups/offsite-sync.sh` + `~/Library/LaunchAgents/com.xyvora.bookkeeping-backup.plist`（`StartCalendarInterval` 12:30）。
日志：`~/bookkeeping-backups/offsite-sync.log`。

> 放到家目录而不是 `~/Documents`：launchd 受 TCC 限制，读写 Documents 会 `Operation not permitted`，日志里只一行，很容易误判成 ssh 失败。
