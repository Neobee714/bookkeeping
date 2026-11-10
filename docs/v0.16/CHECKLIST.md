# v0.16 清单：循环记账

- 创建时间：2026-11-10
- 起点版本：2.5.2 / versionCode 230
- 目标版本：2.6.0 / versionCode 231

## 阶段 1：后端数据层

- [x] `app/models/recurring.py`：`RecurringRule` 模型（字段见 ARCH §1）
- [x] `app/models/transaction.py`：加 `recurring_rule_id` + `uq_transactions_recurring_date` + 索引
- [x] `app/models/__init__.py` 注册新模型
- [x] 新 Alembic 迁移：建表 + 加列/约束/索引，`upgrade` 与 `downgrade` 可重复执行

## 阶段 2：后端逻辑与接口

- [x] `app/services/recurring_dates.py`：日期纯函数
- [x] `app/services/recurring.py`：`generate_due()`（幂等、90 天回溯、单规则 400 上限）
- [x] `app/services/scheduler.py`：启动即跑 + 每小时，`RECURRING_SCHEDULER=off` 可关
- [x] `app/schemas/recurring.py`：创建/更新请求模型
- [x] `app/routers/recurring.py`：GET / POST / PATCH / DELETE，50 条上限，别人的规则 404
- [x] `app/main.py`：注册路由 + startup/shutdown 挂调度

## 阶段 3：App

- [x] `src/types/index.ts`：规则类型 + `Transaction.recurring_rule_id`
- [x] `src/api/recurring.ts`：四个接口封装
- [x] `src/utils/recurringText.ts`：频率/下期文案纯函数
- [x] `src/components/RecurringSheet.tsx`：新建/编辑弹层（含删除确认）
- [x] `src/screens/PlanScreen.tsx`：第三个分段「循环」，列表 + 开关 + 新建 + 空态 + 离线提示 + 缓存
- [x] `src/components/TransactionItem.tsx`：`recurring_rule_id` 非空时显示「循环」小标

## 阶段 4：测试与门禁

- [x] `backend/tests/test_recurring_dates.py`（月末夹取、跨月、闰年）
- [x] `backend/tests/test_recurring_router.py`（CRUD、校验、404、50 上限）
- [x] `backend/tests/test_recurring_generator.py`（生成/幂等/暂停/回溯）
- [x] `mobile/__tests__/recurringText.test.ts`
- [x] `cd backend && python -m pytest -q` 通过（131 passed）
- [x] `cd mobile && npx tsc --noEmit && npx jest` 通过（12 套件 / 65 用例）
- [x] `npx eslint .` 与改动前逐条对比，无新增问题（0 error / 45 warning）

## 阶段 5：版本与发布

- [x] `build.gradle`：versionCode 231 / versionName 2.6.0
- [x] `assembleRelease` 成功，aapt2 与 apksigner 校验通过
- [ ] 真机验收：新建规则 / 暂停恢复 / 编辑 / 删除 / 首页小标 / 离线降级
- [x] 推送后 CI 自动迁移与重启后端，`/health` 200，无 ALERT（提交 `fbe986e`）
- [x] `docs/v0.16/DEPLOY-RELEASE.md` 记录字节数、SHA-256、验收矩阵与回退方式

## 阶段 6：发布期发现的基础设施问题

- [x] `backend/Dockerfile` 默认走阿里云 PyPI 镜像（直连 pypi.org 仅 ~20KB/s，构建超 30 分钟）
- [x] 服务器 drop-in `bk-deploy.service.d/timeout.conf`：`TimeoutStartSec=3600`
- [x] `api.neobee.top` vhost 正则白名单加 `recurring`（裸路径否则 301 到下载页），`nginx -t` + reload
- [ ] 真机验收：手机 USB 未连接（`adb devices` 为空），2.6.0 尚未在 V2339A 上安装
