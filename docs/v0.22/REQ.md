# v0.22 需求：先修三件（白屏兜底 / 备份可观测 / 认证与传输加固）

来源：2026-11-19 用户对「目前还需要什么功能」答复「先修」。版本线 2.9.4 → 2.9.5（versionCode 240 → 241）。
本轮不做新功能，只补「出错、丢数据、被爆破」这三类会让人真正难受的缺口。

## FR-1 白屏兜底

- FR-1.1 App 根节点（`App.tsx`）包一层 ErrorBoundary；任意页面在渲染/生命周期里抛错时展示兜底页，不再整屏白屏。
- FR-1.2 兜底页复用 `ErrorView`，跟随当前皮肤（四套皮肤下文字都可读），展示「页面出了点问题 + 已拦截，数据未受影响」并给一句可读的错误摘要。
- FR-1.3 兜底页提供「重试」：清空错误状态后重新渲染原子树，不要求用户杀进程或重装。
- FR-1.4 异常同时 `console.error` 到 logcat（`[ErrorBoundary]` 前缀），方便真机排查；不引入 crash 上报服务。

## FR-2 备份与巡检可观测

- FR-2.1 服务器新增 `/opt/bookkeeping/watchdog/check.sh` + systemd timer（每 10 分钟）：容器运行、`pg_isready`、本机 `/health`、公网 `api.neobee.top/health`、OTA `info.json`、两张证书剩余天数（<14 天报警）、最新每日快照年龄（>26 小时报警）。
- FR-2.2 发现问题写 `/opt/bookkeeping/state/ALERT-health.txt` 并记 `ALERT` 日志；恢复后删文件记 `RECOVERED`。
- FR-2.3 支持可选 `ALERT_WEBHOOK`（`/etc/default/bk-healthcheck`，POST JSON `{"text": …}`）；未配置时不推送。
- FR-2.4 修复异地副本脚本每天报「配置包拉取失败」：配置包改为只打包远端确实存在的路径（`.htpasswd-life-kitchen` 下线后 tar 整包非 0 退出）。新增打包巡检脚本、healthcheck unit 与告警文件。
- FR-2.5 异地副本加可观测性：快照超过 30 小时、rsync 失败、配置包不完整、服务端有近 24 小时告警时，弹 macOS 通知。

## FR-3 认证与传输加固

- FR-3.1 登录接口失败限流：同一账号 15 分钟内失败 15 次、同一 IP 50 次即返回 429（带 `Retry-After`）；成功登录清零该账号计数，正常用户不受影响。限流期间即使密码正确也不放行。
- FR-3.2 `SECRET_KEY` 不得使用仓库默认值：未配置或仍是默认值时改用进程内随机密钥，并在启动日志打 CRITICAL（重启后旧令牌失效）。线上 `.env` 已是 64 位随机值，行为不变。
- FR-3.3 HTTPException 处理透传 `headers`，429 的 `Retry-After` 才不被中间层丢掉。
- FR-3.4 release 包关闭明文流量：`usesCleartextTraffic="false"`；debug 用 `src/debug/AndroidManifest.xml` 覆盖，不影响 Metro 联调。

## 非目标

- 不引入 crash 上报 / APM；不接外部监控 SaaS；不新建告警 App 账号。
- 不做 bundle 热更新、不改业务接口、不改数据库结构。
- 不做小组件（见 CHECKLIST「小组件评估」结论）。

## 验收标准

1. `npx tsc --noEmit`、`npx jest`（全量）、`npx eslint .`（只对照新增告警）通过。
2. `backend` 全量 pytest 通过；新增限流 4 例覆盖：达阈值 429、成功后清零、窗口过期放行、默认密钥不再生效。
3. ErrorBoundary 3 例：正常渲染不兜底、抛错显示兜底页并带摘要、点重试恢复子树。
4. 服务器巡检可注入故障：假 API 地址 + 高证书阈值 → 退出 1 且写出告警；正常参数 → 退出 0 且清告警。
5. 异地副本手动执行一次：拉到当日快照、配置包含 `docker-compose.yml`、有告警时本地出现副本、恢复后副本被清掉。

## Q&A

| 问题 | 结论 |
| --- | --- |
| 每次启动都弹「检查更新」？ | 维持现状（已有 `检查更新` 入口 + 启动静默检查），本轮不动 |
| 限流会不会把家里人锁在外面？ | 阈值按账号 15 次/15 分钟，正常只有输错密码才会积累；成功登录即清零 |
| 是否需要给告警配通道？ | 未配 `ALERT_WEBHOOK` 时退化为「Mac 每天拉取时弹通知」，要即时推送需用户提供 Bark/企业微信 webhook |
