# v0.17 架构：财报总结

## 一、总体设计

```
后端                                     App
├── report_schedules（每用户 1 条设置）    ├── api/reports.ts
├── reports（生成后的快照）                ├── ReportsScreen（列表 + 设置弹层）
├── services/report_periods.py（纯日期）   ├── ReportDetailScreen（财报详情）
├── services/reports.py（聚合 + 洞察）     ├── utils/reportText.ts（纯函数 + jest）
├── services/report_scheduler.py（每小时） ├── 图表页入口 + 未读提示
└── routers/reports.py                     └── 离线缓存
```

报告在服务端生成并落库；App 只负责展示、配置与标记已读。生成后数据固化，后续记账不改变历史报告。

## 二、时间语义

- 业务时区固定 `Asia/Shanghai`。容器为 UTC，**禁止使用 `date.today()` / `datetime.now()` 直接取业务时间**，
  统一用 `services/report_periods.beijing_now()`（naive datetime，已换算到北京时间）。
- 存储的 `next_run_at`、`generated_at` 均为 **北京时间 naive datetime**（避免 SQLite/PG 的时区差异）；
  API 输出时补 `+08:00`。
- 「上一个完整自然周期」：
  - 周报：`本周一 - 7 天` 至 `本周日 - 7 天`（当前周未结束，永远取上一周）。
  - 月报：上月 1 日 至 上月最后一天。
  - 季报：上一季度首日 至 上一季度最后一天。
  - 年报：上一年 1 月 1 日 至 12 月 31 日。
- 下次生成时点：按设置字段计算严格晚于 `now` 的下一个时点（周报按星期几，月/季/年按 1–28 日，
  季报只在 1/4/7/10 月，年报只在 1 月）。

## 三、数据模型

### `report_schedules`

| 列 | 类型 | 约束 |
| --- | --- | --- |
| id | int | PK |
| user_id | int | FK users.id ON DELETE CASCADE，UNIQUE，NOT NULL |
| kind | String(16) | weekly / monthly / quarterly / yearly，NOT NULL |
| anchor_weekday | int | 1=周一 … 7=周日；weekly 用；其它存 1 |
| anchor_day | int | 1–28；weekly 存 1 |
| anchor_hour | int | 0–23 |
| enabled | bool | default false |
| next_run_at | DateTime | nullable；禁用时为空 |
| last_period_end | Date | nullable |
| created_at / updated_at | DateTime | server_default now() / onupdate |

### `reports`

| 列 | 类型 | 约束 |
| --- | --- | --- |
| id | int | PK |
| user_id | int | FK users.id ON DELETE CASCADE，索引 |
| kind | String(16) | NOT NULL |
| label | String(32) | 如「2026 年 10 月」「2026 年第 3 季度」「2025 年」 |
| period_start / period_end | Date | **均为闭区间**（period_end 是最后一天） |
| generated_at | DateTime | 北京时间 |
| read_at | DateTime | nullable |
| content | Text | JSON 字符串（快照） |
| UNIQUE(user_id, kind, period_start) | | 幂等核心 |
| INDEX(user_id, generated_at) | | 列表排序 |

`app/models/__init__.py` 注册 `ReportSchedule`、`Report`。新增 alembic 迁移，
`down_revision = "5c1d9e7a4b32"`；upgrade 建两表，downgrade 删两表。

## 四、报告内容（content JSON）

```json
{
  "headline": "10 月，你存下了 34%",
  "total_income": 8420.0,
  "total_expense": 5559.5,
  "balance": 2860.5,
  "savings_rate": 34.0,
  "transaction_count": 68,
  "active_days": 27,
  "period_days": 31,
  "daily_expense": 179.34,
  "prev_label": "2026 年 9 月",
  "prev": {
    "total_income": 8600.0,
    "total_expense": 5235.0,
    "expense_delta_pct": 6.2,
    "income_delta_pct": -2.1
  },
  "categories": [
    {"name": "餐饮", "amount": 1683.0, "share": 30.3}
  ],
  "top_expenses": [
    {"amount": 899.0, "category": "购物", "note": "羽绒服", "date": "2026-10-21"}
  ],
  "insights": [
    "餐饮花了 ¥1,683，占支出的 30%，是本期最大开销",
    "最大单笔是 10 月 21 日的「羽绒服」¥899",
    "收入 ¥8,420，支出 ¥5,560，结余 ¥2,861（储蓄率 34%）"
  ],
  "trend": {
    "unit": "week",
    "points": [{"label": "W1", "expense": 1120.0}]
  }
}
```

规则：

- 金额 float 保留 2 位；`share`/`savings_rate`/`*_delta_pct` 为百分数 0–100，保留 1 位。
- `savings_rate`：收入 > 0 时 `balance / income * 100`，否则 `null`。
- `daily_expense`：`total_expense / period_days`，保留 2 位。
- `active_days`：该周期内有账单的**不同日期数**（本人）。
- `categories`：按金额降序，全部分类；无支出时为空数组。
- `top_expenses`：金额降序 Top 3，只取支出。
- `prev`：上一个同类型周期（相邻周期）的本人数据；无数据时 `prev` 为 `null`。
- `trend`：周报按天（7 点）、月报按 7 天分桶（4–5 点，标签 W1…）、季报按月（3 点）、年报按月（12 点）。
- `insights`：2–4 条中文，按以下优先顺序生成，缺数据则跳过：
  1. 分类第一占比与金额；
  2. 最大单笔支出（含日期与备注/分类）；
  3. 收支结余与储蓄率（或超支金额）；
  4. 支出环比增减（有 prev 时）。
- `headline`：
  - `balance >= 0 && savings_rate != null` → `{周期词}，你存下了 {rate}%`；
  - `balance < 0` → `{周期词}，你超支了 ¥{abs(balance)}`；
  - 无账单 → `{周期词}，还没有记账`。
  - 周期词：周报「这一周」、月报「10 月」、季报「第 3 季度」、年报「2025 年」。
- 空周期也允许生成（FR-10），所有数字为 0、数组为空、headline 用空态文案。

## 五、服务层

### `services/report_periods.py`（纯函数，无 DB）

- `beijing_now() -> datetime`
- `period_bounds(kind, today) -> tuple[date, date]`：最近一个完整周期（闭区间）
- `period_label(kind, start) -> str`
- `previous_period(kind, start) -> (start, end)`
- `next_run_at(kind, anchor_weekday, anchor_day, anchor_hour, after) -> datetime`
- `report_kind_word(kind) -> str`（这一周 / 10 月 / 第 3 季度 / 2025 年）

### `services/reports.py`

- `build_content(db, user_id, kind, start, end) -> dict`：聚合 + 洞察 + 趋势。
- `ensure_report(db, user_id, kind, start, end) -> Report`：先查唯一键，存在直接返回；否则插入。
- `generate_due_reports(db, now=None) -> int`：查 `enabled=true AND next_run_at <= now` 的
  设置，逐条生成最近一期，更新 `last_period_end` 与 `next_run_at`，返回生成数量。
  单条失败不阻塞其它设置（捕获异常记日志）。
- 聚合 SQL 必须同时带 `Transaction.user_id == user_id` 和日期范围；`period_end` 闭区间，
  查询用 `date <= period_end`。

### `services/report_scheduler.py`

与 `services/scheduler.py` 同构：`start()` / `stop()`，间隔 3600 秒，启动即跑一次；
环境变量 `REPORT_SCHEDULER=off` 可关。`app/main.py` startup/shutdown 同时启动/停止
recurring 与 report 两个调度。main.py 是 CRLF，改动保留原换行。

## 六、API

统一响应 `{"success": true, "data": ...}`；路由前缀 `/reports`。**上线新前缀需同步 nginx 白名单**
（本轮不部署，但文档记录）。

### `GET /reports/settings`

```json
{
  "exists": true,
  "enabled": true,
  "kind": "monthly",
  "anchor_weekday": null,
  "anchor_day": 1,
  "anchor_hour": 9,
  "next_run_at": "2026-12-01T09:00:00+08:00",
  "last_period_end": "2026-10-31"
}
```

无设置时返回默认值：`exists=false, enabled=false, kind=monthly, anchor_weekday=null,
anchor_day=1, anchor_hour=9, next_run_at=null`。

### `PUT /reports/settings`

请求：

```json
{"kind": "monthly", "anchor_weekday": null, "anchor_day": 1, "anchor_hour": 9, "enabled": true}
```

校验：kind 枚举；weekly 必须给 `anchor_weekday` 1–7；非 weekly 的 `anchor_day` 1–28；
`anchor_hour` 0–23。保存后按 `enabled` 计算或清空 `next_run_at`。返回同 GET。

### `GET /reports?limit=30`

```json
{
  "unread_count": 1,
  "total": 14,
  "items": [
    {
      "id": 12, "kind": "monthly", "label": "2026 年 10 月",
      "period_start": "2026-10-01", "period_end": "2026-10-31",
      "generated_at": "2026-11-01T09:00:00+08:00",
      "total_income": 8420.0, "total_expense": 5559.5, "balance": 2860.5,
      "transaction_count": 68, "read_at": null
    }
  ]
}
```

`limit` 1–100，默认 30；只查本人。

### `GET /reports/{id}`

```json
{
  "id": 12, "kind": "monthly", "label": "2026 年 10 月",
  "period_start": "2026-10-01", "period_end": "2026-10-31",
  "generated_at": "2026-11-01T09:00:00+08:00",
  "read_at": null,
  "content": { "...见第四节..." }
}
```

别人的报告返回 404（不泄露存在性）。

### `POST /reports/{id}/read`

返回 `{"id": 12, "read_at": "2026-11-12T13:00:00+08:00"}`；已读重复调用保持原值。

### `POST /reports/generate-now?kind=yearly`

`kind` 可选（weekly / monthly / quarterly / yearly）：传了就按该周期生成，不传按当前设置（无设置则月报）。
用于设置弹层里「立即生成上一期看看」跟随当前选中的周期。已存在则返回已有报告，不改动设置。
返回同 `GET /reports/{id}`，不自动标记已读。

## 七、App

### 文件

```
mobile/src/api/reports.ts                   接口 + 类型导入
mobile/src/types/index.ts                    ReportKind / ReportSettings / ReportListItem / ReportDetail / ReportContent
mobile/src/utils/reportText.ts               describeKind / describeSchedule / formatDelta / kindMeta
mobile/src/components/ReportSettingsSheet.tsx
mobile/src/screens/ReportsScreen.tsx
mobile/src/screens/ReportDetailScreen.tsx
mobile/src/navigation/types.ts               Reports / ReportDetail
mobile/src/navigation/RootNavigator.tsx      注册两个 stack screen
mobile/src/screens/StatsScreen.tsx           标题右侧入口 + 未读提示条
mobile/src/offline/cache.ts                  复用现有 cacheKey，不新增机制
```

### 列表页

- 自定义导航：`‹ 返回` / `财报` / `⚙`。
- 规则卡：`月报 · 每月 1 日 09:00`，副文案「下次生成：12 月 1 日 09:00」或「自动生成已关闭」；
  开关直接调 `PUT /reports/settings`（离线置灰）。
- 报告条目：左侧类型徽标（周/月/季/年，用 `skin.gradient` 与语义色），中间标签 + 起止日期 +
  「N 笔 · 储蓄率 x%」，右侧结余（正 income / 负 expense），未读红点。
- 空态：`还没有财报` + 说明 + 「立即生成上一期」按钮。
- 点击条目：先 `POST /read`（失败静默），再导航详情。
- 设置弹层：周期 4 段、星期（周报）或 1–28 日（横向滚动）、时点（08/09/12/20/21 常用 + 说明）、
  自动生成开关、保存、立即生成；写操作离线禁用。
- 缓存：列表 `cacheKey(userId, 'reports')`；设置 `cacheKey(userId, 'report-settings')`。

### 详情页

- `‹` 返回；内容可滚动。
- 头部：类型标签、headline（大标题）、周期与生成时间。
- Hero：`GradientView colors={skin.heroGradient ?? [colors.card, colors.card]}`；
  结余大字 + 储蓄率角标 + 收入/支出/笔数；文字用 `skin.colors.onHero / onHeroMuted`。
- 三格环比：支出环比、收入环比、日均支出；涨跌用 `colors.expense`（对支出上涨不利）与
  `colors.textSecondary`，不要用写死红绿。
- 洞察卡：2–4 条，编号圆点用 `colors.chipSoftBg / chipSoftText`。
- 支出分布：条形用固定分类色（与 `StatsScreen` 的 `CATEGORY_COLORS` 一致），文字用 theme token。
- 趋势卡：纯 View 柱状图（不引第三方库），柱色 `colors.primary`，标签 `colors.textTertiary`。
- 最大单笔：金额 + 分类 + 备注 + 日期。
- 页脚：`本期共 N 笔账单 · 数据截至 MM-DD`。
- 缓存：`cacheKey(userId, 'report', id)`；离线读缓存并提示。

### 入口

- `StatsScreen` 标题行改为左右布局：左「图表」，右 Pressable「📄 财报」+ 未读红点。
- `useFocusEffect` 拉 `fetchReports({limit: 1})`（失败静默，走缓存）；
  未读时标题下方显示提示条「{label} 已生成 · 查看」，点击进列表。
- 入口与提示条不得阻塞现有统计请求。

### 主题

- 禁止写死 `#fff` / `#000` / 灰色；卡片 `skin.surfaces.card`，输入/芯片 `skin.surfaces.chip`，
  弹层 `skin.surfaces.sheet`，overlay `colors.overlay`。
- `neu` 锁定亮色、`neon` 锁定暗色，测试时四套皮肤都要过一遍；`heroGradient === null` 时
  用 `[card, card]` + `onHero` 深色文字（与 HomeScreen 一致）。

## 八、测试

后端：

- `tests/test_report_periods.py`：四种周期的最近完整周期、跨年/闰年/季度边界、下次生成时点
  （含周日、月末 28 日、季度 1/4/7/10 月、12 月→次年 1 月）。
- `tests/test_reports.py`：聚合数字、环比、分类占比、Top3、洞察、空周期、幂等、个人隔离
  （伴侣账单不计入）、已读接口、设置校验、generate-now 不重复。
- 临时 SQLite 库跑 upgrade/downgrade 各一次（同现有迁移验证方式）。

App：

- `__tests__/reportText.test.ts`：`describeKind` / `describeSchedule` / `formatDelta`。
- `__tests__/reportsScreen.test.tsx`（可选中）：列表渲染未读与空态，mock api。

门禁：

```
cd backend && python -m pytest -q
cd mobile && npx tsc --noEmit && npx jest && npx eslint .
```

## 九、实施顺序

1. 后端：模型 + 迁移 + 周期纯函数 + 测试。
2. 后端：聚合 / 洞察 / 幂等 + 调度 + 路由 + 测试。
3. App：类型 / api / 纯函数 + jest。
4. App：列表 + 设置弹层 + 详情 + 导航 + 入口 + 离线。
5. 主 Agent 审查 diff、跑门禁、四主题静态检查。
6. 版本 2.7.0 / 233；**不构建 APK、不发布 OTA、不 push**。
