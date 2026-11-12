# v0.18 架构：商家、吃了什么与评价

## 一、数据模型

在 `transactions` 表新增三个可空列（`note` 不动）：

| 列 | 类型 | 语义 |
| --- | --- | --- |
| merchant | String(50) | 商家；为空表示未填 |
| item | String(50) | 吃了什么 / 项目；为空表示未填 |
| note_kind | String(12) | `evaluation` = 已确认的评价；`NULL` = 旧备注未整理 |

规则：

- 新建/编辑账单时，`note` 非空 → `note_kind = 'evaluation'`；`note` 为空 → `NULL`。
- 迁移只给存量行加空列，**不写 note_kind**，所以存量备注全部是 `NULL`，进入「整理旧备注」候选。
- 整理为商家/菜品/两者时，写入 `merchant`/`item` 后把 `note` 清空，`note_kind` 置空；整理为评价时保留 `note`，置 `note_kind='evaluation'`。
- 旧备注在整理前：不计入商家/菜品排行，账单里仍显示原文。
- `item` 与 `note` 不互斥：一笔可以是商家「和府捞面」+ 菜品「面」+ 评价「有点咸」。

迁移：`backend/alembic/versions/c7f1a2b3d4e5_add_transaction_merchant_item.py`，`down_revision = "a4b7c2d9e6f1"`（v0.17 财报迁移）。upgrade 加三列，downgrade 删三列；用临时 SQLite/PG 验证可重复。

撤销批次另加两张表（迁移 `d8e2f4a6b9c1_add_note_cleanup_logs.py`，down_revision `c7f1a2b3d4e5`）：

| 表 | 字段 | 语义 |
| --- | --- | --- |
| note_cleanup_batches | id / user_id / batch_key / affected_count / created_at / undone_at | 一次保存 = 一批；batch_key 由 App 生成，同一保存的多条请求共用 |
| note_cleanup_items | id / batch_id / transaction_id / old_* / new_* | 每个被改写账单的商家、菜品、备注、note_kind 原值与新值 |

撤销时只恢复「当前值 == new_*」的行；整理后又被编辑过的行跳过，避免覆盖新改动。

## 二、接口

### 2.1 交易字段

`TransactionCreateRequest` / `TransactionUpdateRequest` 增加：

```python
merchant: str | None = Field(default=None, max_length=50)
item: str | None = Field(default=None, max_length=50)
```

`note` 仍是 `max_length=255`，语义改为评价。所有字段 trim，空串转 `None`。
Update 的 `validate_non_empty` 把 `merchant`/`item` 也纳入“至少一个字段”。
序列化增加 `merchant`、`item`、`note_kind`。

写入口径：

- `POST /transactions`：`note_kind = 'evaluation' if note else None`。
- `PUT /transactions/{id}`：`note` 在 `model_fields_set` 中时同步 `note_kind`；`merchant`/`item` 在集合中时允许置空。
- `POST /transactions/import`：CSV 若含 `merchant`/`item` 列则读取；没有则忽略；`note_kind` 按 note 是否为空设置。
- `services/recurring.py` 生成的账单：写 `merchant=None, item=None, note_kind='evaluation' if note else None`。

### 2.2 快速输入

`GET /transactions/quick-inputs` 响应增加：

```json
{
  "last_date": "2026-11-11",
  "pinned": [{"note": "好吃", "count": 4, "last_used": "2026-11-10"}],
  "by_category": {"餐饮": [{"note": "好吃", "count": 4, "last_used": "2026-11-10"}]},
  "merchants_by_category": {
    "餐饮": [{"name": "和府捞面", "count": 3, "last_used": "2026-11-10"}]
  },
  "items_by_category": {
    "餐饮": [{"name": "面", "count": 5, "last_used": "2026-11-09"}]
  }
}
```

- 90 天窗口；按分类分组；每类最多 6 个；按次数降序、最近使用降序。
- 只查当前用户；排除空值。
- `pinned` / `by_category` 备注候选只统计 `note_kind='evaluation'` 的新评价，避免旧备注再次出现在「评价」chips 里。

### 2.3 图表排行

`GET /stats/breakdown`

参数：

- `dimension`: `merchant` | `item`（必填）
- `month` / `start_date` / `end_date`：沿用 `resolve_date_window`
- `target`: `self` | `partner`，默认 `self`
- `type`: `expense` | `income`，默认 `expense`
- `category`: 可选分类过滤；App 的商家/菜品档固定传「餐饮」
- `limit`: 1–50，默认 20

响应：

```json
{
  "dimension": "merchant",
  "items": [
    {"name": "和府捞面", "amount": 96.0, "count": 3, "avg": 32.0}
  ],
  "legacy_note_count": 37,
  "last_cleanup": {"batch_id": 3, "created_at": "2026-11-12T16:40:00", "affected_count": 12}
}
```

- `partner` 未绑定时 403（沿用现有口径）。
- `legacy_note_count`：当前用户 `note_kind IS NULL` 的去重备注数，**不随月份变化**；用于「菜品」档的整理提示。
- 分组字段 trim 后非空；金额降序；`avg = round(amount/count, 2)`。

### 2.4 整理旧备注

`GET /transactions/note-candidates?limit=50`

```json
{
  "total": 37,
  "last_cleanup": {"batch_id": 3, "created_at": "2026-11-12T16:40:00", "affected_count": 12},
  "items": [
    {
      "note": "和府捞面",
      "count": 12,
      "total_amount": 384.0,
      "last_used": "2026-10-31",
      "suggestion": "merchant"
    }
  ]
}
```

- 只查当前用户、`note_kind IS NULL`、`trim(note)` 非空；按 count 降序、total_amount 降序。
- `suggestion`：`merchant` / `item` / `both` / `evaluation` / `null`，仅作 UI 提示，不自动应用。
  - 商家后缀：店/馆/餐厅/饭店/咖啡/茶/超市/商场/食堂/摊/铺/屋/记。
  - 菜品词表：面/粉/饭/火锅/烧烤/咖啡/奶茶/甜品/饺子/包子/粥/汤/烤肉/炸鸡/汉堡/披萨/寿司/米线/麻辣烫。
  - 评价词：好吃/难吃/一般/不错/咸/淡/辣/香/环境/服务/分量/性价比。
  - 同时命中商家与菜品 → `both`；都不命中 → `null`。

`POST /transactions/notes/reclassify`

```json
{"note": "和府捞面", "action": "merchant", "merchant": "和府捞面", "item": null,
 "batch_key": "cleanup-7-1762930000000-ab12cd"}
```

- `action`: `merchant` | `item` | `both` | `evaluation` | `skip`
- 只更新当前用户、`trim(note) == note`、`note_kind IS NULL` 的记录。
- merchant/item/both：对应字段必填；写字段后 `note = NULL`，`note_kind = NULL`。
- evaluation：保留 note，`note_kind = 'evaluation'`。
- skip：不改，返回 `affected=0`。
- 返回 `{"affected": 12, "batch_id": 3}`；不改金额/日期/分类。
- 同一保存的多条请求共用 `batch_key`，服务端复用同一个批次；不传时每次调用单独成批。
- 路由必须定义在 `PUT /{transaction_id}` 等动态路由之前，避免路径冲突。

`POST /transactions/notes/undo`

```json
{"batch_id": 3}
```

- 不传 `batch_id` 时撤销最近一批未撤销的整理。
- 只恢复当前值仍等于该批次 `new_*` 的账单；整理后被编辑过的账单计入 `skipped`，不覆盖。
- 成功返回 `{"batch_id": 3, "restored": 12, "skipped": 0}`；批次已撤销返回 400，没有可撤销批次返回 404。
- 撤销后重新进入旧备注候选；旧财报快照不变。

### 2.5 财报快照

`services/reports.build_content` 增加：

```json
{
  "merchants": [{"name": "和府捞面", "amount": 96.0, "count": 3, "avg": 32.0}],
  "items": [{"name": "面", "amount": 130.0, "count": 5, "avg": 26.0}],
  "dining": {"count": 12, "amount": 312.0, "avg": 26.0},
  "dining_insights": [
    "最常去 和府捞面，3 次共 ¥96",
    "最常吃 面，5 次共 ¥130",
    "餐饮 12 次，平均每次 ¥26"
  ]
}
```

- `merchants`/`items`：**餐饮分类**支出维度的 Top 5，按金额降序；`dining` 统计分类为「餐饮」的支出。
- `dining_insights`：最多 3 条；无数据时为空数组。
- 旧报告 content 没有这些字段，App 必须按可选字段处理。

## 三、App

### 3.1 文件

```
mobile/src/types/index.ts                  Transaction.merchant/item/note_kind；QuickInputs 扩展；BreakdownItem；NoteCandidate；ReportContent 扩展
mobile/src/api/transactions.ts             创建/更新 payload 带 merchant/item；note-candidates/reclassify
mobile/src/api/stats.ts                    fetchBreakdown
mobile/src/components/AddTransactionSheet.tsx   商家/吃了什么/评价三块；编辑回填；提交 payload
mobile/src/components/TransactionItem.tsx        列表展示商家/菜品/评价
mobile/src/screens/StatsScreen.tsx        支出分布三档 + 整理入口；移除旧的备注排行/趋势
backend/app/models/note_cleanup.py         整理批次 / 明细
backend/app/services/note_cleanup.py       批次、撤销
backend/alembic/versions/d8e2f4a6b9c1_add_note_cleanup_logs.py
mobile/src/screens/NoteCleanupScreen.tsx  新增：整理旧备注 + 撤销上次整理
mobile/src/navigation/types.ts / RootNavigator.tsx   NoteCleanup 路由
mobile/src/screens/ReportDetailScreen.tsx 新增「吃喝」卡（可选字段）
mobile/src/offline/queue.ts / types.ts    队列 payload 带 merchant/item
mobile/src/components/VoiceTransactionSheet.tsx / AddTransactionSheet  语音草稿仍进评价（不在本次自动拆分）
```

### 3.2 记一笔

- 商家：`TextInput` + 最近商家 chips（来自 `merchants_by_category[category]`）；选中 chip 填入。
- 吃了什么：固定 chips +「+ 自定义」；自定义打开小输入弹层或直接切到文本输入；单选。
- 评价：原 `note` 输入，label「评价（可选）」，placeholder「好吃 / 有点咸 / 环境不错」。
- 编辑：回填 merchant/item/note；提交带三字段。
- 非餐饮：`item` 的 label 可改为「项目（可选）」，placeholder「房租 / 地铁 / 日用品」；商家仍可选。
- 提交 payload：`merchant: merchant.trim() || undefined`，`item: item.trim() || undefined`，`note: note.trim() || undefined`。
- 离线：payload 原样进队列。

### 3.3 列表

`TransactionItem` 展示优先级：

```
标题：merchant || item || category
副标题：item && merchant ? `${item}${note ? ' · ' + note : ''}` : note || category
```

旧数据（无 merchant/item）保持现有「分类 + 备注」显示。

### 3.4 图表

- 支出分布卡标题行加 `SegmentedControl`：分类 / 商家 / 菜品。
- 分类档沿用现有 `category_expenses`。
- 商家/菜品档调用 `/stats/breakdown?category=餐饮`；显示金额、次数、人均；无数据时显示空态。
  排行只统计「餐饮」分类，避免超市/房租等混进「常去的店 / 爱吃的」。
- 菜品档底部：`legacy_note_count > 0` 时显示「旧备注 N 条未整理 · 去整理」，点击进 `NoteCleanup`。
- 原有「备注排行 + 备注趋势」卡片移除（评价不再参与排行）；`fetchNoteRanking`/`fetchNoteTrend` 保留在 api 层但页面不再调用，避免大范围删接口。
- 缓存 key：`bk.cache.v1.<uid>.breakdown.<dimension>.<self|partner>.<YYYY-MM>`；失败静默读缓存。

### 3.5 整理旧备注

- 顶部说明：共 N 条旧备注、去重后 M 个；整理只影响统计，不改金额/日期。
- 每条：备注原文、N 笔、金额、建议标签；选项 `商家` / `吃了什么` / `评价`，前两个可同时选中。
- 商家/菜品选中时显示输入框，默认填原备注；`both` 时两个输入框。
- 保存：逐条调用 `reclassify`，同一次保存生成一个 `batch_key` 传给所有请求；串行、显示进度；成功后返回并刷新统计。
- 撤销：顶部显示「上次整理 · 时间 · 条数」；确认后调用 `undo`，成功后刷新候选和统计，并提示恢复/跳过条数。
- 统计入口：菜品档在 `legacy_note_count > 0` 或无旧备注但存在 `last_cleanup` 时显示；
  有旧备注显示「去整理」，否则显示「上次整理 N 条 · 可撤销」。
- 离线：整页只读提示，保存/撤销禁用。
- 主题：全部 token。

### 3.6 财报

- `ReportContent` 新增可选 `merchants`、`items`、`dining`、`dining_insights`。
- 详情页在「本期洞察」后增加「吃喝」卡：显示 `dining_insights`（最多 3 条）+ 常去的店 Top3。
- 没有字段 / 空数组时整卡隐藏；旧报告不崩。

## 四、测试

后端：

- `test_transactions_merchant_item.py`：创建/更新/清空三字段；`note_kind` 规则；列表序列化；个人隔离。
- `test_quick_inputs_merchant_item.py`：90 天窗口、按分类、排除空值、6 个上限。
- `test_stats_breakdown.py`：self/partner、日期窗口、金额/次数/人均、空值排除、未绑定伴侣 403。
- `test_note_cleanup.py`：候选只含 `note_kind IS NULL`；五种 action；批量；不改金额/日期；他人数据不可改；
  撤销恢复原值、同 batch_key 归批、冲突跳过、重复撤销 400、无批次 404。
- `test_reports.py` 扩展：merchants/items/dining/dining_insights、无数据为空。
- 迁移 upgrade/downgrade。

App：

- `__tests__/transactionMerchantItem.test.tsx`：表单回填/提交 payload、列表展示优先级。
- `__tests__/noteCleanup.test.tsx`：候选渲染、选择切换、保存调用（含 batch_key）、上次整理撤销入口。
- `__tests__/reportText` 或新测试：吃喝洞察字段缺失时不崩。
- 四皮肤渲染：记一笔、整理页、财报吃喝卡。

门禁：

```
cd backend && python -m pytest -q
cd mobile && npx tsc --noEmit && npx jest && npx eslint .
```

## 五、实施顺序

1. 后端：迁移 + 模型/序列化 + 创建/更新/导入/循环 + 测试。
2. 后端：quick-inputs + stats breakdown + note cleanup + report content + 测试。
3. App：types/api/offline + AddTransactionSheet + TransactionItem + 测试。
4. App：Stats 三档 + NoteCleanup + ReportDetail 吃喝卡 + 导航 + 四皮肤测试。
5. 主 Agent 审查 diff、跑门禁、版本 2.8.0 / 234。
6. 构建 APK、部署后端/nginx、发布 OTA（用户明确要求）。

## 六、版本

`mobile/android/app/build.gradle`：`versionCode 233 → 234`，`versionName "2.7.0" → "2.8.0"`。
`mobile/app.json` 的 `displayName` 保持「拾光」。
