# 开发清单：拾光 v0.8 —— 离线能力（只读缓存 + 离线新增）

- 创建时间：2026-10-23 14:48
- 规则：每完成一个小点标记 ✅，并附完成时间戳 `YYYY-MM-DD HH:mm`。

## 阶段一：需求与设计
- [x] 现状审计（首页/统计/分类均为纯网络请求；无 NetInfo/缓存/队列）✅ 2026-10-23 14:45
- [x] 范围确认（只读缓存 + 离线新增；编辑/删除要求联网）✅ 2026-10-23 14:48
- [x] 三文档创建（REQ / ARCH / CHECKLIST）✅ 2026-10-23 14:48

## 阶段二：后端幂等（先上线，兼容旧版）
- [x] be-1：`Transaction.client_id` + `UniqueConstraint(user_id, client_id)` 模型改动 ✅ 2026-10-23 14:55
- [x] be-2：alembic 迁移（down_revision `d4e6f7a8b9c0`），离线 SQL 验证 upgrade 语句 ✅ 2026-10-23 15:05
- [x] be-3：`TransactionCreateRequest.client_id`（可选，8-64 字符）✅ 2026-10-23 14:55
- [x] be-4：创建接口查重 + IntegrityError 兜底 + 序列化返回 client_id ✅ 2026-10-23 14:58
- [x] be-5：`tests/test_offline_idempotency.py`（重复/跨用户/缺省/非法长度）✅ 2026-10-23 15:02
- [x] be-6：`pytest -q` 全量 **91 passed**（原 87 + 新增 4）✅ 2026-10-23 15:05

## 阶段三：App 离线基础层
- [x] app-1：安装 `@react-native-community/netinfo@^12.0.1`（RN 0.87 兼容）✅ 2026-10-23 14:50
- [x] app-2：`offline/ids.ts`：clientId 生成 ✅ 2026-10-23 14:52
- [x] app-3：`offline/cache.ts`：带版本/用户隔离的读写与清理 ✅ 2026-10-23 14:53
- [x] app-4：`offline/queue.ts`：串行化队列、去重、上限、failed 标记 ✅ 2026-10-23 15:10
- [x] app-5：`offline/network.ts`：NetInfo 封装 ✅ 2026-10-23 15:12
- [x] app-6：`offline/sync.ts`：单飞、顺序上传、错误分类 ✅ 2026-10-23 15:14
- [x] app-7：`store/offlineStore.ts` + `offline/useOfflineSync.ts`：启动/联网/回前台触发 ✅ 2026-10-23 15:16

## 阶段四：页面接入
- [x] ui-1：首页 `load()` 缓存优先 + 网络刷新 + 离线保持缓存 ✅ 2026-10-23 15:18
- [x] ui-2：首页新增：clientId + 离线入队 + 本地乐观插入 + 待同步徽标 ✅ 2026-10-23 15:20
- [x] ui-3：`applyPendingToSummary`（收入/支出/结余/笔数/分类金额）✅ 2026-10-23 15:21
- [x] ui-4：分类缓存（首页 + 新增弹层共用同一 key）✅ 2026-10-23 15:22
- [x] ui-5：编辑/删除离线提示「需要联网」✅ 2026-10-23 15:22
- [x] ui-6：同步完成后刷新首页（queueVersion/pendingCount 变化）✅ 2026-10-23 15:23
- [x] ui-7：全局 `OfflineBanner`（离线/待同步/同步中/失败；底部悬浮，不压 header）✅ 2026-10-23 15:24
- [x] ui-8：统计页缓存降级（summary + 6 个月趋势）✅ 2026-10-23 15:26
- [x] ui-9：待同步行长按删除本地记录 ✅ 2026-10-23 15:24

## 阶段五：测试与回归
- [x] test-1：`offlineQueue.test.ts`（去重/隔离/移除/失败/上限/损坏清理）✅ 2026-10-23 15:30
- [x] test-2：`offlineCache.test.ts`（版本失效/损坏/用户隔离/清理）✅ 2026-10-23 15:30
- [x] test-3：`pendingSummary.test.ts`（增量计算）✅ 2026-10-23 15:30
- [x] test-4：`syncQueue.test.ts`（成功/4xx/网络错误/单飞）✅ 2026-10-23 15:32
- [x] test-5：mobile `tsc --noEmit` 0 错误、`jest` **7 suites / 32 tests** 全过、`eslint` 39 problems（1 个既存错误 / 38 warnings，低于原 48/10 基线）✅ 2026-10-23 15:35
- [x] test-6：backend `pytest -q` **91 passed** ✅ 2026-10-23 15:05

## 阶段六：构建与发布
- [x] rel-1：版本 2.3.0 / versionCode 223 ✅ 2026-10-23 15:28
- [ ] rel-2：release APK 构建 **【阻塞：本机缺正式 keystore】**
  - 已完成：debug APK `BUILD SUCCESSFUL in 14m5s`（166MB，NetInfo 原生编译通过）
  - 已完成：release JS bundle 1.6MB（干净 worktree `7c4334f`）
  - 缺：`keystore/bookkeeping-release.keystore` + `release-signing.properties`
- [ ] rel-3：aapt2 / apksigner / sha256 复核，签名与旧版一致（待 rel-2）
- [ ] rel-4：OTA 发布并回验 info.json / latest.apk / 归档（待 rel-2）
- [x] rel-5a：后端先部署（迁移 `e2f3a4b5c6d7`，2026-10-23 15:52，client_id + 唯一约束已在生产库验证）✅ 2026-10-23 15:53
- [ ] rel-5b：APK 发布（待正式 keystore）

## 阶段七：真机验收
- [ ] e2e-1：飞行模式看缓存月份 + 下拉刷新不白屏（待 APK）
- [ ] e2e-2：飞行模式新增 2 笔，列表/汇总立即变化，杀进程重开仍在（待 APK）
- [ ] e2e-3：恢复网络自动同步，服务端恰好 2 条（无重复）（待 APK）
- [ ] e2e-4：飞行模式编辑/删除提示需联网，数据不变（待 APK）
- [ ] e2e-5：飞行模式统计页显示缓存或空态（待 APK）
- [ ] e2e-6：旧版 2.2.2 创建账单仍正常（client_id 可选）（后端已兼容，待真机复核）

## 阶段八：收尾
- [x] acc-1：`docs/v0.8/DEPLOY-RELEASE.md` 记录版本、哈希、验证矩阵、回退 ✅ 2026-10-23 16:00
- [x] acc-2：更新 `bookkeeping-app-iteration` skill（离线模块、同步触发、幂等约束、构建隔离）✅ 2026-10-23 16:05
- [x] acc-3：向用户汇报，明确「编辑/删除离线」未做、后台同步未做、APK 发布被 keystore 阻塞 ✅ 2026-10-23 16:06
