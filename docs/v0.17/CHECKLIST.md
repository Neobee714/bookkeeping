# v0.17 清单：财报总结

起点 2.6.1 / 232 → 目标 2.7.0 / 233。完成后不构建 APK、不发布 OTA。

## 阶段 1　后端基础

- [x] `models/report.py`：`ReportSchedule` + `Report`（唯一键、索引、级联）
- [x] `models/__init__.py` 注册两个模型
- [x] alembic 迁移（down_revision `5c1d9e7a4b32`），upgrade / downgrade 可重复
- [x] `services/report_periods.py`：北京时间、周期边界、标签、上次周期、下次生成
- [x] `tests/test_report_periods.py`：周/月/季/年、跨年、闰年、季度、月末

## 阶段 2　后端生成与接口

- [x] `services/reports.py`：聚合、环比、分类、Top3、洞察、趋势、空周期
- [x] `ensure_report` 幂等 + `generate_due_reports` 只补最近一期
- [x] `services/report_scheduler.py` + `main.py` 启停（保留 CRLF）
- [x] `schemas/report.py`（设置请求校验）
- [x] `routers/reports.py`：settings GET/PUT、列表、详情、已读、立即生成
- [x] `routers/__init__.py` 与 `main.py` include
- [x] `tests/test_reports.py`：数字、隔离、幂等、已读、校验、空周期
- [x] `pytest -q` 全绿（235 passed）

## 阶段 3　App 数据层

- [x] `types/index.ts`：ReportKind / ReportSettings / ReportListItem / ReportDetail / ReportContent
- [x] `api/reports.ts`：六个函数（settings GET/PUT、列表、详情、已读、立即生成）
- [x] `utils/reportText.ts`：describeKind / describeSchedule / formatDelta / kindBadge
- [x] `__tests__/reportText.test.ts`（31 例）

## 阶段 4　App 界面

- [x] `ReportSettingsSheet.tsx`：周期、星期/日、时点、开关、保存、立即生成
- [x] `ReportsScreen.tsx`：规则卡、列表、未读、空态、离线
- [x] `ReportDetailScreen.tsx`：hero、环比、洞察、分类、趋势、Top3、页脚
- [x] `navigation/types.ts` + `RootNavigator.tsx` 注册
- [x] `StatsScreen.tsx` 入口 + 未读提示条（静默失败）
- [x] 四套皮肤 / 亮暗模式检查：无写死颜色、hero 对比可读（jest 四皮肤渲染 + 颜色字面量 grep 为空）

## 阶段 5　门禁与收尾

- [x] `npx tsc --noEmit`
- [x] `npx jest`（14 suites / 109 tests）
- [x] `npx eslint .`（45 warnings / 0 errors，与改动前基线一致）
- [x] 后端 `pytest -q`（235 passed）
- [x] 主 Agent 审查完整 diff（无越界改动、无伴侣数据）
- [x] `build.gradle` 2.7.0 / 233；`app.json` displayName 仍为「拾光」
- [ ] 文档提交（docs 单独 commit）——用户未要求提交，留在工作区
- [x] 明确不做：APK 构建、OTA 发布、线上部署、git push

## 审查记录

- 主 Agent 复核后修正：列表响应补 `total`（避免只显示已加载条数）、`generate-now` 支持
  `kind` 覆盖（弹层内按当前选中周期生成）、hero 分隔线改用 `onHeroMuted`、
  洞察环比文案排版、`savings_rate` 空值保护。
- 已知边界：每月 28 日生成的月报覆盖「上一个月」而不是当月（按 REQ 的完整自然周期口径）。
- 未做设备侧验证：本轮不构建 APK，四皮肤用 jest 渲染 + token 审查代替真机目检。
