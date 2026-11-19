# v0.22 清单

## 1. 白屏兜底（App）

- [x] `src/components/ErrorBoundary.tsx`（class 边界 + 默认兜底 `DefaultCrashFallback` 复用 ErrorView、跟皮肤） ✅ 2026-11-19
- [x] `App.tsx` 根部包裹 `RootNavigator` + `OfflineBanner` ✅ 2026-11-19
- [x] 单测 `__tests__/errorBoundary.test.tsx` 3 例（正常 / 抛错 / 重试恢复） ✅ 2026-11-19

## 2. 备份与巡检（服务器 + Mac）

- [x] `/opt/bookkeeping/watchdog/check.sh`：容器、pg_isready、本机与公网 `/health`、OTA `info.json`、双证书、快照年龄 ✅ 2026-11-19
- [x] `bk-healthcheck.service` / `.timer`（每 10 分钟，`OnBootSec=3min`）✅ 2026-11-19
- [x] 故障注入验证：假 API + `CERT_MIN_DAYS=9999` → exit 1 + `ALERT-health.txt`；正常参数 → exit 0 + 告警清除（日志 `ALERT` → `RECOVERED`）✅ 2026-11-19
- [x] 异地副本修复「配置包拉取失败」：远端路径先存在性过滤（根因 `.htpasswd-life-kitchen` 已下线导致 tar 整体失败）✅ 2026-11-19
- [x] 配置包纳入 watchdog/check.sh、healthcheck units；实测 39K、含 `docker-compose.yml` 校验通过 ✅ 2026-11-19
- [x] 异地副本加通知：快照 >30h / rsync 失败 / 配置包不完整 / 服务端近 24h 告警 → macOS 通知 ✅ 2026-11-19
- [x] 告警联动实测：服务端放告警文件 → 本地出现副本并记 `ALERT`；删除后本地副本被清掉 ✅ 2026-11-19
- [x] `deploy/ops/`（watchdog 脚本、units、offsite 脚本、README 安装说明）进仓库 ✅ 2026-11-19

## 3. 认证与传输（后端 + Android）

- [x] `app/core/ratelimit.py`：账号 15 次/15 分钟、IP 50 次，内存滑动窗口，无新依赖 ✅ 2026-11-19
- [x] `/auth/login` 接入限流（429 + `Retry-After`；成功清零账号计数）✅ 2026-11-19
- [x] `SECRET_KEY` 默认值不再生效：未配置时进程内随机 + 启动 CRITICAL（线上 `.env` 为 64 位随机值，行为不变）✅ 2026-11-19
- [x] HTTPException 处理器透传 `headers` ✅ 2026-11-19
- [x] `usesCleartextTraffic="false"` + `src/debug/AndroidManifest.xml` 覆盖（debug 联调不受影响）✅ 2026-11-19
- [x] `backend/tests/test_auth_throttle.py` 4 例 ✅ 2026-11-19

## 门禁

- [x] `npx tsc --noEmit` 干净 ✅ 2026-11-19
- [x] `npx jest` 168/168（165 + 新增 3）✅ 2026-11-19
- [x] `npx eslint .` 0 error，45 warning 全为既存 `no-void` 基线；新文件零告警 ✅ 2026-11-19
- [x] `backend/.venv/bin/python -m pytest -q` 333 passed（329 + 新增 4）✅ 2026-11-19
- [x] 版本 2.9.5(241) + 提交推送 ✅ 2026-11-19

## 小组件评估（本轮只评估，不实现）

结论：**暂不做**。理由与代价见 `docs/v0.22/WIDGET.md`。

## 待用户决定

- 告警即时推送通道：需要 Bark / 企业微信机器人 / Telegram 任一 webhook 才能脱离「Mac 打开才看得到通知」。
- 是否发 OTA 2.9.5：本轮 `mobile/` 有改动（ErrorBoundary + manifest），不发包则手机上仍是旧版。
