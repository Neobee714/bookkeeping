# v0.16 架构：循环记账

## 1. 数据模型

新表 `recurring_rules`（Alembic 新迁移，**不改历史迁移**）：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | int PK | |
| user_id | FK users.id ON DELETE CASCADE，index | 规则归属 |
| amount | Numeric(12,2) NOT NULL | > 0 |
| type | Enum(`transaction_type`) NOT NULL | expense / income |
| category | String(10) NOT NULL | 与账单同口径（分类名） |
| note | String(255) NULL | |
| freq | String(10) NOT NULL | `daily` / `weekly` / `monthly` / `yearly` |
| start_date | Date NOT NULL | 锚定日，决定每月几号 / 每周哪天 / 每年哪天 |
| next_run_date | Date NOT NULL，index | 下一次到期日 |
| enabled | Boolean NOT NULL default true | |
| last_generated_date | Date NULL | 最近一次生成日，便于排查 |
| created_at / updated_at | DateTime(tz) NOT NULL | updated_at 用 `onupdate=func.now()` |

`transactions` 增加：

- `recurring_rule_id`：`FK recurring_rules.id ON DELETE SET NULL`，可空。
- 唯一约束 `uq_transactions_recurring_date (recurring_rule_id, date)`：同一规则同一天只能一笔。
  （Postgres 允许多个 NULL，手动记账不受影响。）
- 新增索引 `ix_transactions_recurring_rule_id`。

迁移需要 up/down 都可重复执行；`downgrade` 删约束、索引、列，再删表。

## 2. 日期算法（纯函数，单独模块便于单测）

`backend/app/services/recurring_dates.py`

```python
FREQS = ("daily", "weekly", "monthly", "yearly")

def month_day(year: int, month: int, day: int) -> date:
    """把 (年, 月, day) 夹到该月最后一天。"""

def next_occurrence(freq: str, start: date, current: date) -> date:
    """给定当前到期日，返回下一次到期日（严格晚于 current）。"""

def first_occurrence_on_or_after(freq: str, start: date, floor: date) -> date:
    """返回 >= floor 的第一个到期日（用于创建/恢复规则）。"""

def due_dates(freq: str, start: date, first: date, today: date, max_count: int = 400) -> list[date]:
    """从 first 起取所有 <= today 的到期日，最多 max_count 个。"""
```

规则：

- `daily`：+1 天。
- `weekly`：+7 天（星期由 `start` 决定，不单独存 weekday）。
- `monthly`：下一次是 `start` 的「日」在下一个自然月的夹取结果；从 `start` 所在月起算。
- `yearly`：`start` 的「月-日」在下一个自然年；2-29 → 平年取 2-28。
- `first_occurrence_on_or_after` 从 `start` 开始按频率推进到 >= floor，最多迭代 500 次（防御）。

## 3. 生成服务

`backend/app/services/recurring.py`

```python
LOOKBACK_DAYS = 90
MAX_PER_RUN = 400

def generate_due(db: Session, today: date | None = None) -> int:
    """把到期规则落成真实账单，返回新增条数。幂等。"""
```

流程（逐个规则）：

1. `select ... where enabled is true and next_run_date <= today`（按 next_run_date 排序）。
2. 若 `next_run_date < today - 90 天`，先把 `next_run_date` 推到 `first_occurrence_on_or_after(freq, start_date, today - 90 天)`。
3. 用 `due_dates(...)` 取本次所有到期日。
4. 每个日期：若已存在 `(recurring_rule_id, date)` 的账单则跳过；否则插入
   `Transaction(amount, type, category, note, date=d, recurring_rule_id=rule.id)`（`client_id` 保持 NULL）。
5. 更新 `last_generated_date`、`next_run_date = next_occurrence(...)`。
6. 单规则最多插 400 条；每规则一个事务，异常只回滚该规则并记录日志。

## 4. 调度

`backend/app/services/scheduler.py`：FastAPI `startup` 事件里 `asyncio.create_task(_loop())`。

- 启动后立即跑一次（容器重启即补救），随后每 3600 秒一次。
- 自己开 `SessionLocal()`，不依赖请求上下文；整个循环体 `try/except Exception: logger.exception(...)`。
- 环境变量 `RECURRING_SCHEDULER=off` 可关闭（测试用）；模块级 `_started` 防重复启动。
- 运行的是单进程 uvicorn（compose 未设 `--workers`），无需分布式锁；幂等约束兜底。
- 关停：`app` 的 `shutdown` 事件 `task.cancel()`。

## 5. API 契约

前缀 `/recurring`，全部需要登录；规则一律按 `user_id == current_user.id` 过滤，
别人的规则一律 404（不泄露存在性）。

`GET /recurring` →

```json
{"success": true, "data": [
  {"id": 1, "amount": 3200.0, "type": "expense", "category": "居住", "note": "房租",
   "freq": "monthly", "start_date": "2026-11-01", "next_run_date": "2026-12-01",
   "enabled": true, "last_generated_date": null, "created_at": "2026-11-10T10:00:00+00:00"}
], "message": ""}
```

排序：`enabled DESC, next_run_date ASC, id ASC`。

`POST /recurring` body：`{amount, type, category, note?, freq, start_date}`

- 校验：amount > 0、category 1–10 字、note ≤ 255、freq ∈ 四种、start_date 为合法日期。
- `next_run_date = first_occurrence_on_or_after(freq, start_date, today)`（过去的到期日不回填）。
- 每用户最多 50 条，超出 400「循环规则最多 50 条」。

`PATCH /recurring/{id}` body：任意子集 `{amount?, type?, category?, note?, freq?, start_date?, enabled?}`

- `freq` 或 `start_date` 变化，或 `enabled` 由 false→true 时，重算
  `next_run_date = first_occurrence_on_or_after(...)`；其余情况保留原值。
- 空 body → 422（沿用项目 pydantic 校验风格）。

`DELETE /recurring/{id}` → `{"success": true, "data": null, "message": "循环规则已删除"}`；
已生成账单通过 `ON DELETE SET NULL` 保留。

错误一律走项目既有 `HTTPException` → 统一响应包裹。

## 6. App 结构

| 文件 | 变更 |
| --- | --- |
| `mobile/src/types/index.ts` | `RecurringRule`、`RecurringCreatePayload`、`RecurringUpdatePayload`；`Transaction` 加 `recurring_rule_id?: number \| null` |
| `mobile/src/api/recurring.ts` | 新增：`fetchRecurringRules / createRecurringRule / updateRecurringRule / deleteRecurringRule`（沿用 `client` + `unwrap`） |
| `mobile/src/utils/recurringText.ts` | 纯函数：`describeFreq(rule)` → 「每月 1 号」「每周二」「每天」「每年 11 月 1 日」；`nextRunLabel(rule)` → 「下期 12-01」/「已暂停」 |
| `mobile/src/components/RecurringSheet.tsx` | 新建/编辑弹层，复用记账弹层的结构（收支切换 / 金额 / 备注 / 分类宫格 / 日期选择器） |
| `mobile/src/screens/PlanScreen.tsx` | `PlanTab` 加 `'recurring'`；列表 + 开关 + 新建按钮 + 空态 + 离线提示 |
| `mobile/src/components/TransactionItem.tsx` | `item.recurring_rule_id` 非空时在分类名后渲染「循环」小标 |

细节：

- 分类列表复用 `fetchCategories()` 与缓存 key `bk.cache.v1.<uid>.categories`（与记账弹层同源）。
- 规则列表缓存 key：`bk.cache.v1.<userId>.recurring`，联网成功后写回；离线时读缓存渲染并显示提示。
- 弹层沿用 `KeyboardAvoidingView behavior="height"` + `sheetWrap flex:1` + `sheet flexShrink:1` 的既有约定。
- 分类宫格沿用 4 列、末行补 `catSpacer` 占位（2.5.2 的修复），选中态用渐变背景层而非绝对定位覆盖内容。
- 首页不需要改：`TransactionItem` 自己判断 `recurring_rule_id`。

## 7. 版本与部署

- `mobile/android/app/build.gradle`：versionCode 230 → **231**，versionName 2.5.2 → **2.6.0**。
- 后端有新迁移：push 后 CI 自动 `docker build → pg_dump → alembic upgrade → 重启 → /health`。
- 迁移必须能对现有数据（含 2.5.x 期间的手动账单）安全执行：新列可空、新表独立。

## 8. 测试计划

后端：

- `backend/tests/test_recurring_dates.py`：每月 31 号夹取（2 月 28 / 闰年 29 / 4 月 30）、
  每周跨月、每年 2-29、`first_occurrence_on_or_after` 的过去/当天/未来三种输入、`due_dates` 上限。
- `backend/tests/test_recurring_router.py`：CRUD、字段校验、别人的规则 404、50 条上限、
  暂停→恢复不补账、删除后账单保留且 `recurring_rule_id` 为 null。
- `backend/tests/test_recurring_generator.py`：生成一次、重复执行不重复、暂停跳过、90 天回溯上限。

App：

- `mobile/__tests__/recurringText.test.ts`：频率文案与下期文案。

门禁：

```
cd backend && python -m pytest -q
cd mobile && npx tsc --noEmit && npx jest && npx eslint .
```
