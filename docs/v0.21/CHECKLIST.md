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
- [ ] 版本 2.9.3(239) + 提交推送；真机冒烟（vivo 已连接）

## 收尾

- [ ] CHECKLIST 勾选时间戳；docs、代码分提交
