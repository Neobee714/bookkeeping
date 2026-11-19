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

结论：**暂不做桌面小组件**。理由与代价见 `docs/v0.22/WIDGET.md`。

## 4. 静态快捷方式（用户 2026-11-19 追加：「执行静态快捷方式」）

- [x] 深链入口：`bookkeeping://add | voice | agent`，MainActivity 加 VIEW intent-filter（BROWSABLE）✅ 2026-11-19
- [x] `src/store/intentStore.ts`：`parseIntentUrl` / `isIntentFresh` / `take`（60 秒 TTL，只认三个动作）✅ 2026-11-19
- [x] `src/navigation/useDeepLinks.ts`：`getInitialURL`（冷启动）+ `url` 事件（singleTask onNewIntent）✅ 2026-11-19
- [x] 首页消费 add/voice：不在首页先切回 Home 再弹层；小光由 MainTabs 切 Agent 档 ✅ 2026-11-19
- [x] `res/xml/shortcuts.xml` + 三个 vector 图标 + 文案（记一笔 / 语音记账 / 问小光）✅ 2026-11-19
- [x] 单测 `__tests__/intentDeepLink.test.ts` 18 例（URL 解析 15 + TTL + take 语义）✅ 2026-11-19
- [x] 门禁：tsc 干净 / jest 186 passed / eslint 0 error（新文件零告警）✅ 2026-11-19
- [ ] 真机验证：`adb shell am start -a android.intent.action.VIEW -d bookkeeping://add` 打开记账弹层；长按图标三个快捷方式可见（**待手机接上后执行**）
- [x] 随 2.9.5(241) 一起发 OTA ✅ 2026-11-19（published 17:11，info.json version=2.9.5，sha256 8d6a1e7a…136a，latest.apk 23,097,591 字节，服务端哈希一致）

## 待用户决定

- 告警即时推送通道：需要 Bark / 企业微信机器人 / Telegram 任一 webhook 才能脱离「Mac 打开才看得到通知」。
- 桌面小组件仍未做（本轮只做了静态快捷方式）。
