# v0.19 设计：删除 item 维度

## 结论

`item` 从数据模型、接口、App 三处一并删除；存量数据在迁移里合并进 `note`，不做双写兼容层。
唯一保留的兼容点是 `/stats/breakdown?dimension=item`，给尚未升级的 2.8.x App 返回空排行。

## 数据模型

迁移 `b7c4d9e2a610_drop_transaction_item_field`（down_revision `d8e2f4a6b9c1`）：

```sql
UPDATE transactions
   SET note = CASE
           WHEN note IS NULL OR trim(note) = '' THEN substr(trim(item), 1, 255)
           ELSE substr(trim(item) || ' · ' || trim(note), 1, 255)
       END,
       note_kind = 'evaluation'
 WHERE item IS NOT NULL AND trim(item) <> '';

ALTER TABLE transactions DROP COLUMN item;
ALTER TABLE note_cleanup_items DROP COLUMN old_item, DROP COLUMN new_item;
```

- 合并后必须置 `note_kind='evaluation'`，否则这些账单会重新出现在「整理旧备注」候选里。
- 删除 `note_cleanup_items` 的两个 item 列，撤销逻辑同步只比对 `merchant / note / note_kind`。
- downgrade 只恢复列结构，不把备注拆回 item（旧版本也读不到这些值）。

## 接口

| 接口 | 变化 |
| --- | --- |
| `POST /transactions`、`PUT /transactions/{id}` | 去掉 `item`；多余字段被 pydantic 忽略 |
| `GET /transactions` | 序列化不再返回 `item` |
| `GET /transactions/quick-inputs` | 去掉 `items_by_category`，保留 `merchants_by_category` |
| `GET /stats/breakdown` | `dimension=merchant` 正常聚合；`dimension=item` 返回 `items: []` |
| `GET /transactions/note-candidates` | `suggestion` ∈ `merchant / evaluation / null` |
| `POST /transactions/notes/reclassify` | `action` ∈ `merchant / evaluation / skip`，请求体无 `item` |
| `POST /transactions/import` | 仍识别项目列，合并进 `note` |
| 财报 `content` | 删除 `items`；`dining_insights` 去掉了「最常吃」 |

服务层：`aggregate_named_dimension` 收敛为 `aggregate_merchants`（只聚合 `merchant`）；
`suggest_note_kind` 只剩店名后缀 / 备注词两类判断。

## App

- `AddTransactionSheet`：删除 item 状态、固定 chips、自定义输入与按分类的文案表；
  表单固定为「金额 → 分类 → 商家 → 备注 → 日期」，`备注(可选)` 紧随商家。
- `TransactionItem`：标题 `merchant || category`；副标题 `note || (merchant ? category : '无备注')`。
- `StatsScreen`：`DistributionDimension = 'category' | 'merchant'`；整理入口挂到商家档。
- `NoteCleanupScreen`：草稿只剩 `merchant / evaluation / merchantName`，商家与备注互斥。
- `ReportDetailScreen`：吃喝卡副标题「来自商家和餐饮账单」；最大单笔标题 商家 → 备注 → 分类。
- 类型：删除 `Transaction.item`、`TransactionCreatePayload.item`、`ReclassifyPayload.item`、
  `QuickInputs.items_by_category`、`ReportContent.items`；`BreakdownDimension = 'merchant'`。

## 发布顺序

1. 后端先上（迁移 + 接口），旧 App 不受影响（item 字段被忽略，菜品档空排行）。
2. 再发 2.9.0 APK；用户装上后表单才消失。
3. 回滚 App 时新后端仍可服务 2.8.x；不要为回滚执行 `alembic downgrade`，会丢备注里的明细。

## 风险

- 迁移会改写备注文本（合并项目），属于内容变更；已在 SQLite 上验证四类数据：
  只有项目、项目 + 备注、只有空白、无项目。
- 旧报告快照里的 `items` 字段保留原样，App 不读取。
