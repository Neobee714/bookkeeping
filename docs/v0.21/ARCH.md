# v0.21 设计

## 改动面（纯 mobile，无后端/无迁移）

```
src/navigation/types.ts        + CategoryDetail 路由参数
src/navigation/RootNavigator.tsx  + 注册 CategoryDetailScreen
src/screens/CategoryDetailScreen.tsx   新增（汇总卡 + 明细/备注）
src/screens/StatsScreen.tsx    分类/商家行改为可点 + ›
src/utils/categoryDetail.ts    纯函数：过滤/分组/聚合
__tests__/categoryDetail.test.ts       新增单测
```

## 路由参数

```ts
CategoryDetail: {
  dimension: 'category' | 'merchant';
  name: string;
  month: string;          // YYYY-MM，继承图表页
  tab: 'self' | 'partner'; // 继承我的/伴侣
};
```

## 数据流

- 账单：`fetchTransactions(month)` / `fetchPartnerTransactions(month)`（已存在）。
- 缓存：`cacheKey(userId, 'tx', tab, month)` 先读后写（与首页同 key，数据同形）。
- 过滤：`type === 'expense'` 且（category===name 或 merchant===name）。
- 计算（`utils/categoryDetail.ts` 纯函数）：
  - `filterCategoryTransactions(txs, dimension, name)`
  - `buildDayGroups(txs)` → `[{ date, total, items }]`，日期倒序、日内小计
  - `aggregateNotes(txs)` → `[{ note, amount, count, avg }]`，金额降序，空备注→「未备注」
  - `elapsedDaysOfMonth(month, today)` → 日均分母（本月=今天几号；上月=整月天数；未来=1）
- 占比 = 分类合计 / 该 tab 当月支出合计（未过滤的账单求和）。

## UI 结构（对齐样例）

```
SafeAreaView
├─ 自定义头：‹ 返回 | 标题 | （占位）
├─ 汇总卡(heroGradient + onHero)：合计 / 笔数 / 占比 / 日均 / 笔均
├─ SegmentedControl：明细 | 备注
└─ ScrollView
    ├─ 明细：日期头(日期 + 当日合计) + TransactionItem(只读 no-op)
    └─ 备注：备注行(名称/金额/次数/平均/进度条, 点击展开) + 附注
```

样式全部走 theme hooks（useTheme/useSkin），不写死颜色；空/错/加载用现有 EmptyView/ErrorView/LoadingView。

## 测试

`__tests__/categoryDetail.test.ts`：过滤（分类/商家、收入排除）、日期分组与小计、备注聚合（trim/未备注/排序/平均）、elapsedDaysOfMonth（本月/上月/未来）。
