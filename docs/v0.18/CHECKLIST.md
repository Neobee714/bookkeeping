# v0.18 清单：商家、吃了什么与评价

起点 2.7.0 / 233 → 2.8.0 / 234。**本次按用户要求发布 OTA。**

## 阶段 1　后端数据与记账

- [x] `transactions` 加 `merchant` / `item` / `note_kind` 三列 + 迁移 `c7f1a2b3d4e5`
- [x] 模型 / schema / 序列化 / 创建 / 更新 / CSV 导入 / 循环生成写三字段
- [x] `note_kind` 规则：新备注 = evaluation；迁移存量 = NULL
- [x] `tests/test_transactions_merchant_item.py`
- [x] 迁移 upgrade/downgrade 验证

## 阶段 2　后端统计与整理

- [x] `quick-inputs` 增加 `merchants_by_category` / `items_by_category`；备注 chips 只保留 evaluation
- [x] `GET /stats/breakdown`（merchant/item、self/partner、日期、category、limit、legacy_note_count、last_cleanup）
- [x] `GET /transactions/note-candidates`（旧备注去重、金额、建议、last_cleanup）
- [x] `POST /transactions/notes/reclassify`（merchant/item/both/evaluation/skip；batch_key 归批）
- [x] `reports.build_content` 增加 merchants/items/dining/dining_insights（仅餐饮分类）
- [x] `top_expenses` / 洞察优先用商家 / 菜品，避免把评价当最大单笔
- [x] 测试：quick inputs、breakdown、cleanup、report content

## 阶段 3　撤销整理

- [x] 迁移 `d8e2f4a6b9c1`：`note_cleanup_batches` + `note_cleanup_items`
- [x] `models/note_cleanup.py`、`services/note_cleanup.py`
- [x] `POST /transactions/notes/undo`（指定 batch_id 或最近一批）
- [x] 同一保存共用一个 `batch_key`；逐行记录 old/new 值
- [x] 撤销只恢复仍匹配 new 值的行；整理后编辑过的行跳过
- [x] 候选 / breakdown 返回 `last_cleanup`
- [x] 迁移 upgrade/downgrade 在临时 SQLite 通过

## 阶段 4　App 数据层

- [x] `types`：Transaction / QuickInputs / BreakdownItem / NoteCandidate / CleanupBatchInfo / ReportContent
- [x] `api/transactions`：payload 三字段 + note-candidates + reclassify + undo
- [x] `api/stats`：fetchBreakdown（category=餐饮）
- [x] `offline/queue`：商家/菜品随 payload 入队

## 阶段 5　App 界面

- [x] `AddTransactionSheet`：商家（chips）、吃了什么（chips + 自定义）、评价；编辑回填
- [x] `TransactionItem`：标题 merchant/item/category，副标题 item/评价
- [x] `StatsScreen`：支出分布三档；商家/菜品排行（仅餐饮）；旧备注整理 / 上次整理撤销入口
- [x] `NoteCleanupScreen`：候选列表、商家/菜品可同选、评价/跳过、批量保存、撤销上次整理、离线只读
- [x] `ReportDetailScreen`：吃喝洞察 + 常去的店 Top3（旧报告缺字段隐藏）
- [x] 导航注册 `NoteCleanup`
- [x] 四套皮肤渲染测试（记一笔 / 整理页 / 财报吃喝卡）

## 阶段 6　门禁与收尾

- [x] `npx tsc --noEmit`
- [x] `npx jest`（18 suites / 132 tests）
- [x] `npx eslint .`（0 errors；warnings 与基线一致）
- [x] 后端 `pytest -q`（308 passed）
- [x] 主 Agent 审查完整 diff（个人隔离、旧数据未误改、无越界）
- [x] `build.gradle` 2.8.0 / 234；`app.json` displayName 仍为「拾光」
- [x] 发布/回滚手册 `docs/v0.18/ROLLBACK.md`
- [x] commit + push（`cbf3e27` 代码、`61403c9` docs）
- [x] 后端部署 + `/reports` nginx 白名单（16:49 部署，16:50 nginx）
- [x] 构建 release APK（76,987,569 B / SHA-256 `e991fd2f…5b35`）
- [x] 发布 OTA 并验证 info.json / latest.apk（2.8.0，force false）
- [ ] 真机验收（发布时无 adb 设备，待补）

## 主 Agent 复核修正

- `TransactionUpdateRequest` 允许显式 null 后，补了「金额/类型/分类/日期不可置空」校验，避免 500。
- 商家/菜品排行与财报洞察限定「餐饮」分类，避免超市/房租混进「常去的店 / 爱吃的」。
- `quick-inputs` 的备注 chips 只统计 `note_kind='evaluation'`，旧备注不会再次出现在「评价」候选。
- 整理旧备注的入口在商家/菜品无数据时也可见；整理页补 `KeyboardAvoidingView` 与 `ScrollView flex:1`。
- 整理建议对长词更保守（「和府捞面」不再误判为菜品）。
- 撤销按批次记录 old/new 值；相同 batch_key 的多条 reclassify 归为一批，撤销时跳过后续编辑过的行。

## 已知边界

- 整理页默认不预选建议，需逐条确认；超过 50 条时先展示前 50 个，保存后可再次进入。
- 语音记账仍把识别文本放进「评价」，不会自动拆商家/菜品。
- 旧备注整理前不进入商家/菜品排行；旧报告快照不会被改写。
- 撤销不回溯已生成的财报快照；只恢复账单字段。
- 四皮肤用 jest 渲染 + 真机目检；真机验收结果以 DEPLOY-RELEASE 记录为准。


## 2.8.1 补丁（用户反馈）

- [x] 循环规则创建 / 修改后立即生成今天到期的账单（`generate_rule_now`）
- [x] 创建 / 恢复的 `next_run_date` 改用北京时间 `beijing_today()`
- [x] 调度器 `generate_due` 改用北京时间
- [x] 首页从其它 tab 返回、App 回前台时静默刷新账单
- [x] 项目字段文案：餐饮「吃了什么」/ 娱乐「玩了什么」/ 购物「买了什么」/ 其它「项目」
- [x] 整理旧备注页统一改用「项目」
- [x] 后端 308 passed；App 18 suites / 133 tests；tsc / eslint 通过
- [ ] 构建 2.8.1 / 235 并发 OTA
- [ ] 真机复测循环创建与切换首页
