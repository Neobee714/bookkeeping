# 数据库维护计划：账单查询组合索引

## 目标

为账单列表、统计和小光的日期范围查询提供合适的索引，减少数据库按用户和日期筛选账单时的扫描量。

## 已确认样例

```sql
SELECT id, amount, type, category, note, date, created_at
FROM transactions
WHERE user_id = 42
  AND date >= '2026-09-01'
  AND date < '2026-10-01'
ORDER BY date DESC, created_at DESC;
```

候选索引：`(user_id, date, created_at)`。用户 ID 等值匹配在前，日期用于范围筛选，创建时间用于列表排序。

## 实施范围

1. 在 `Transaction` ORM 模型中声明 `ix_transactions_user_date_created_at`。
2. 新增 Alembic 迁移创建该索引，接在当前离线幂等迁移 `e2f3a4b5c6d7` 之后；降级时只删除该索引。
3. 保留现有 `(user_id, client_id)` 唯一约束；不改 API、查询逻辑或账单数据。

## 验收标准

- 模型元数据与迁移中的索引名称、列顺序一致。
- `alembic heads` 只有一条最新迁移链；升级和降级定义正确。
- 后端现有 pytest 全量通过。
- 使用有代表性数据检查查询计划；不把小型测试库强制使用索引作为验收条件，因为优化器可合理选择顺序扫描。

## 发布与版本

- 这是后端数据库性能维护，不改变移动端行为或 API 契约；APK 版本随本轮主题发布为 `2.4.0 / versionCode 224`。
- 部署时先执行 Alembic 迁移。普通规模表使用常规建索引；若生产表增长到建索引会明显阻塞写入，再单独评估 PostgreSQL 并发建索引。
