# v0.19 清单

## 阶段一：后端

- ✅ 2026-11-16 删除 `Transaction.item` 模型列与 `note_cleanup_items.old_item/new_item`
- ✅ 2026-11-16 新迁移 `b7c4d9e2a610`：item 合并进 note → 删列；SQLite 验证 upgrade/downgrade/upgrade
- ✅ 2026-11-16 schemas：create/update 去 item；quick-inputs 去 items_by_category；reclassify 只留 merchant/evaluation/skip
- ✅ 2026-11-16 `aggregate_named_dimension` → `aggregate_merchants`；`suggest_note_kind` 去掉菜品判断
- ✅ 2026-11-16 财报：去 items，dining_insights 去「最常吃」
- ✅ 2026-11-16 `/stats/breakdown?dimension=item` 兼容返回空排行
- ✅ 2026-11-16 CSV 导入把项目列合并进备注
- ✅ 2026-11-16 后端测试按新口径更新，`pytest` 全绿

## 阶段二：App

- ✅ 2026-11-16 记一笔：删除吃了什么/项目块，评价改名备注，placeholder 提示写明细
- ✅ 2026-11-16 账单列表：标题商家 || 分类，副标题备注
- ✅ 2026-11-16 图表：分类 / 商家两档，整理旧备注入口移到商家档
- ✅ 2026-11-16 整理旧备注：商家 / 备注 / 跳过，互斥
- ✅ 2026-11-16 财报吃喝卡与最大单笔文案调整
- ✅ 2026-11-16 types / api / offline / HomeScreen 去 item
- ✅ 2026-11-16 jest 更新：transactionMerchantItem、noteCleanup、statsBreakdown、merchantSkins、offlineQueue

## 阶段三：门禁

- ✅ 2026-11-16 `cd backend && .venv/bin/python -m pytest -q`
- ✅ 2026-11-16 `cd mobile && npx tsc --noEmit`
- ✅ 2026-11-16 `cd mobile && npx jest`（18 suites / 134 tests）
- ✅ 2026-11-16 `cd mobile && npx eslint .`（0 error，警告与基线一致）
- ⬜ 版本 2.9.0 / versionCode 236（已改，未构建）
- ⬜ 用户确认后再 push 与构建 APK / OTA

## 真机验收（发布时执行）

- ⬜ 记一笔只有商家 + 备注
- ⬜ 旧账单 item 已出现在备注
- ⬜ 图表商家档有旧备注整理入口
- ⬜ 财报吃喝卡无「最常吃」
