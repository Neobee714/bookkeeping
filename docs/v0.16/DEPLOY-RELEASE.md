# v0.16 发布记录：2.6.0 循环记账

- 发布：2026-11-10 11:48:28 UTC（APK 上传完成）
- 版本：**2.6.0 / versionCode 231**
- 状态：**后端已上线并完成迁移**；APK 已发布 OTA；**真机验收待手机插回 USB**
- 源码提交：`418cd73`（功能）、`fbe986e`（构建修复）；文档提交见 git log

## 1. 功能

- 规划页第三个分段「循环」：规则列表（图标 / 备注 / 频率 / 下期 / 金额 / 开关）、新建、编辑、删除、
  离线只读缓存。
- 服务端每天（每小时检查）把到期规则落成真实账单，关掉 App 也会生成；同一规则同一天最多一笔。
- 频率四种：每天 / 每周 / 每月 / 每年，具体日子由「首次日期」锚定；月末夹取、闰年 2-29 → 平年 2-28。
- 生成账单在首页带「循环」小标，可正常编辑与删除；删除规则只停未来，历史账单保留（关联置空）。
- 规则私有（伴侣不可见规则本身），生成的账单按既有双人账本规则共享可见。
- 单用户最多 50 条规则；补跑最多回溯 90 天；单规则单次最多 400 笔。

## 2. 后端上线

| 项 | 值 |
| --- | --- |
| 迁移版本 | `02a2d76c9a63`（新表 `recurring_rules` + `transactions.recurring_rule_id`） |
| 约束 | `uq_transactions_recurring_date (recurring_rule_id, date)`、`ON DELETE SET NULL` |
| 接口 | `GET/POST /recurring`、`PATCH|PUT /recurring/{id}`、`DELETE /recurring/{id}` |
| 调度 | FastAPI startup 起 asyncio 任务：启动即跑一次 + 每 3600 秒；`RECURRING_SCHEDULER=off` 可关 |
| 部署提交 | `fbe986e`，CI 自动 build → pg_dump → alembic upgrade → 重启 → `/health` 200 |
| 线上核对 | `alembic_version = 02a2d76c9a63`；`recurring_rules` 表与索引/外键/唯一约束均在 |

## 3. APK

| 项 | 值 |
| --- | --- |
| 包名 | `com.neobee.bookkeeping` |
| 大小 | 76,906,769 bytes |
| SHA-256 | `cfadace19064ced849523b6a3e978fb1198b9bd8e8b17910bddd1491bfd7bc78` |
| versionCode / versionName | 231 / 2.6.0 |
| 签名证书 SHA-256 | `d8d8202ec0c4b7065330b7d144ac2855113ab012dee1644ffa8c32e9fef6c06c` |
| OTA | version 2.6.0、size 76,906,769、`force=false`、`updatedAt 2026-11-10T11:48:28Z` |

## 4. 验证

| 项 | 结果 |
| --- | --- |
| 后端 pytest | `131 passed`（基线 91 + 新增 40：日期 14 / 生成器 7 / 接口 12 + 参数化） |
| App tsc | `npx tsc --noEmit` 通过 |
| App jest | 12 套件 **65 用例**全通过（新增 `recurringText` 13、`recurringSheet` 3、`planRecurring` 1） |
| App eslint | 0 error；45 warning 与改动前一致（PlanScreen 两条 `no-void` 为既存） |
| 组件渲染 | `recurringSheet` 覆盖新建/编辑/离线三态；`planRecurring` 覆盖切段后规则行与「已暂停」「下期 12-01」 |
| 生产接口 | 裸路径 `/recurring` 未登录返回 401（路由已挂载）；`/api/openapi.json` 含 `/recurring`、`/recurring/{rule_id}` |
| 生产库 | `recurring_rules` 表、`transactions.recurring_rule_id`、唯一约束与 SET NULL 外键全部存在 |
| OTA | `info.json` 2.6.0、字节数与 sha256 与本机构建一致 |
| 真机 | **未完成**：验收期间手机 USB 断开（`adb devices` 为空），2.6.0 未在真机安装 |

## 5. 发布期修的两个基础设施问题

1. **CI 构建后端镜像被 systemd 杀掉（退出码 143）**：ECS 直连 `pypi.org` 只有约 20KB/s，
   装 langchain 栈超过 `TimeoutStartSec=30min`。处理：
   - `backend/Dockerfile` 默认 `--index-url https://mirrors.aliyun.com/pypi/simple/`（`ARG PIP_INDEX_URL` 可覆盖）；
   - 服务器加 drop-in `/etc/systemd/system/bk-deploy.service.d/timeout.conf`，`TimeoutStartSec=3600`。
2. **裸路径 `/recurring` 返回 301**：`api.neobee.top` 的 vhost 用正则白名单转发 App 的裸路径
   （`(auth|agent|transactions|budget|categories|savings|app-updates)`），新增前缀必须同步加进去，
   否则 App 的循环接口会落到下载页。已改 `/etc/nginx/sites-available/api-neobee` 并 `nginx -t` + reload，
   备份在同目录 `api-neobee.bak.*`。

## 6. 回退

- App：重发 2.6.0 之前版本（`bookkeeping-2.5.2.apk` 仍在 `/var/www/apps/bookkeeping/`）；versionCode 231
  不能覆盖安装 230 以下的包，回退需卸载或发 232。
- 后端：`alembic downgrade -1` 会删 `transactions.recurring_rule_id` 与 `recurring_rules` 表；
  已生成的账单保留（只是失去规则关联）。调度可先 `RECURRING_SCHEDULER=off` 停掉再回退代码。
- Nginx：`cp /etc/nginx/sites-available/api-neobee.bak.<时间戳> /etc/nginx/sites-available/api-neobee && nginx -t && systemctl reload nginx`。

## 7. 待办

- 真机验收（插回 USB 后）：新建规则 → 重启后端触发 startup 生成 → 首页出现带「循环」小标的账单 →
  暂停/恢复 → 编辑 → 删除（确认历史账单保留）→ 飞行模式下的离线降级。
- 真机验收通过后把本节与 CHECKLIST 勾完，并补一张真机截图。
