# v0.21 清单

样例确认 ✅ 2026-11-17（用户「就按照这样」）

## 实现

- [x] 路由参数 + RootNavigator 注册 CategoryDetail ✅ 2026-11-17
- [x] utils/categoryDetail.ts 纯函数（过滤/分组/聚合/日均天数） ✅ 2026-11-17
- [x] CategoryDetailScreen（汇总卡 + 明细/备注 + 空/错/加载态 + 缓存） ✅ 2026-11-17
- [x] StatsScreen 分类/商家行可点 + ›（顺带把分类 emoji 抽到 utils/categoryMeta 共用） ✅ 2026-11-17
- [x] 单测 __tests__/categoryDetail.test.ts（10 例） ✅ 2026-11-17

## 门禁（主 Agent 自跑）

- [x] npx tsc --noEmit ✅ 干净
- [x] npx jest（全量） ✅ 163/163（153 + 新增 10）
- [x] npx eslint（仅对照新增告警） ✅ 0 error；新文件零告警（既有 no-void 均为基线）
- [x] 版本 2.9.3(239) + 提交推送 ✅ 2026-11-17（feat ecb259e / docs 9fa7bcc）
- [x] 真机冒烟（vivo V2339A，2.9.3）✅ 2026-11-17：图表餐饮行 › 可点 → 明细页 ¥918.88/16 笔与 DB 一致；按日分组小计正确；备注档聚合（未备注 5 次 ¥432.33）展开子列表逐笔正确，合计与 DB 完全一致；版式 8.5/10

## 收尾

- [x] CHECKLIST 勾选时间戳；docs、代码分提交 ✅ 2026-11-17

## 追加：备注档加商家（用户选 A，2026-11-17）

- [x] `aggregateNotes` 增加 `merchants`（去重、次数降序、空商家剔除）；单测 +2
- [x] 备注行副行商家 chip（最多 2 + 「+N」，无商家虚线「未填商家」），聚合口径不变
- [x] 版本 2.9.4（240）
