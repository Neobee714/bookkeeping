# 架构文档：拾光 v0.8 —— 离线能力

- 创建时间：2026-10-23 14:48
- 版本：v0.8
- 状态：已确认

## 1. 总体数据流

```
在线（现状）:
  首页 ── GET /transactions + /stats/monthly-summary ──▶ 后端
  新增 ── POST /transactions ──▶ 后端 ──▶ 重新拉取

离线（v0.8）:
  首页 ── 读 AsyncStorage 缓存 ──▶ 立即渲染 ──▶ 尝试网络（成功则覆盖缓存）
  新增 ── 生成 client_id ──▶ 写队列(AsyncStorage) ──▶ 本地乐观插入 + 待同步标识
  恢复网络 ── 队列逐条 POST（带 client_id）──▶ 成功后移除 + 刷新
                                 └─ 重复提交由后端 (user_id, client_id) 唯一约束去重
```

## 2. 后端：幂等新增

### 2.1 模型与迁移

| 文件 | 改动 |
| --- | --- |
| `backend/app/models/transaction.py` | 新增 `client_id: Mapped[str \| None] = mapped_column(String(64), nullable=True)`；`__table_args__` 增加 `UniqueConstraint("user_id", "client_id", name="uq_transactions_user_client_id")` |
| `backend/alembic/versions/<new>_add_transaction_client_id.py` | `down_revision = "d4e6f7a8b9c0"`；add_column + create_unique_constraint；downgrade 反向 |
| `backend/app/schemas/transaction.py` | `TransactionCreateRequest` 增加 `client_id: str \| None = Field(default=None, min_length=8, max_length=64)` |
| `backend/app/routers/transactions.py` | 创建前按 `(user_id, client_id)` 查重；命中直接返回已有记录；并发插入 `IntegrityError` 时回滚后再查一次；序列化增加 `client_id` |
| `backend/tests/test_offline_idempotency.py` | 重复 client_id、跨用户同 client_id、缺省 client_id、非法长度 |

PostgreSQL/SQLite 的唯一约束都允许多个 NULL，旧数据与旧客户端不受影响。

### 2.2 创建幂等伪代码

```
if payload.client_id:
    existing = select(Transaction).where(user_id=me, client_id=payload.client_id)
    if existing: return success(existing, message="已存在")
item = Transaction(..., client_id=payload.client_id)
try: commit
except IntegrityError:
    rollback
    existing = 再查一次
    if existing: return success(existing, message="已存在")
    raise
```

## 3. App：离线模块划分

新增 `mobile/src/offline/`：

| 文件 | 职责 |
| --- | --- |
| `types.ts` | `CachedEnvelope<T>`、`PendingTransaction`、`SyncResult` |
| `ids.ts` | `createClientId()`：时间戳 + 随机串（无需新增 uuid 依赖） |
| `cache.ts` | `readCache/writeCache/removeCache/clearUserCache`；key 带版本与 userId；JSON 解析失败自动清理 |
| `queue.ts` | 队列读写（串行化，避免并发覆盖）；enqueue/remove/markFailed/clear；上限 200 |
| `network.ts` | 封装 NetInfo：当前是否在线、订阅变化 |
| `sync.ts` | `syncQueue(userId)`：单飞（同一时刻只跑一轮）、顺序上传、错误分类、结果统计 |
| `useOfflineSync.ts` | App 根级 hook：启动/联网/回前台触发同步，维护 offlineStore |

新增 `mobile/src/store/offlineStore.ts`（zustand）：`isOnline`、`pendingCount`、`failedCount`、
`syncing`、`queueVersion`；队列变更后 `refreshCounts()`，首页据此合并待同步项。

新增 `mobile/src/components/OfflineBanner.tsx`：全局悬浮横幅（底部 Tab 上方），四种状态
（离线无待同步 / 离线有待同步 / 同步中 / 同步失败），点击重试。

### 3.1 缓存 key 与结构

```
bk.cache.v1.<userId>.tx.<self|partner>.<YYYY-MM>
bk.cache.v1.<userId>.summary.<self|partner>.<YYYY-MM>
bk.cache.v1.<userId>.categories
```

写入结构：`{ v: 1, at: 1761..., data: ... }`；读取时 `v` 不匹配直接删除并返回 null。
`clearUserCache(userId)` 在登出时清除该用户所有 `bk.cache.v1.<userId>.*`，队列不动。

### 3.2 队列结构

```
bk.offline.v1.queue.<userId> = [
  {
    clientId: "1761...-ab12cd",
    payload: { amount, type, category, note, date },
    createdAt: "2026-10-23T14:50:00.000Z",
    status: "pending" | "failed",
    attempts: 0,
    error?: "分类不存在"
  }
]
```

- 入队按 `clientId` 去重；超过 200 条拒绝并提示「待同步记录过多」。
- 所有修改走模块内 Promise 链串行化，避免两次 read-modify-write 互相覆盖。
- 失败分类：HTTP 400/422 → `failed`（保留，等人工重试/删除）；网络错误/5xx/401 → 保持 `pending`，停止本轮。

### 3.3 同步算法

```
syncQueue(userId):
  if (!online || syncing) return
  syncing = true
  items = readQueue(userId).filter(status == pending).sort(createdAt)
  for item in items:
     try:
        created = POST /transactions { ...payload, client_id: item.clientId }
        remove(item.clientId)          # 成功（含服务端返回“已存在”）
     catch e:
        if isHttp4xx(e): markFailed(item, message); continue
        else: break                    # 网络/5xx/401：本轮停止，保留 pending
  refreshCounts()
  syncing = false
  return { synced, failed, remaining }
```

触发点：`restoreSession` 完成后、NetInfo `isConnected` 变 true、AppState 变 `active`。
同一时刻只允许一轮（模块级单飞 Promise）。

### 3.4 首页接入

- `load()`：
  1. 计算 cache key；`readCache` 命中则先 `setTransactions/setSummary/setLoadedKey`（不转圈）。
  2. 请求网络；成功写缓存并覆盖状态；失败时若有缓存则保持缓存（横幅显示离线），无缓存才走现有错误态。
  3. `requestIdRef` 逻辑保留，避免旧月份结果覆盖新月份。
- `handleSubmit()`：
  - 编辑：离线直接提示「需要联网」，不调用 API。
  - 新增：生成 `clientId`；在线先 POST；若抛网络错误（无 response / timeout）则入队并本地插入；
    4xx 仍抛回弹层展示校验错误。
  - 本地插入：`pending` 项转为 Transaction 形状（负数临时 id + `pending: true`），按日期/创建时间合并进
    `rows`；`applyPendingToSummary` 调整 `total_income/total_expense/balance/transaction_count` 与
    `category_expenses`（`note_breakdown` 保持缓存值）。
- 待同步行：显示「待同步」小徽标；长按可「删除本地记录」（失败项也用它清理）。
- 同步完成：`queueVersion` 变化且 `pendingCount` 下降 → 重新 `load()` 获取服务端 id 与准确汇总。

### 3.5 分类与统计

- 分类：`loadCategories()` 先读缓存再请求；成功后写缓存。新增弹层已有「失败静默降级」，离线时用缓存分类。
- 统计：`fetchMonthlySummary` 网络失败时读 `summary.<view>.<month>` 缓存；趋势由 6 个月的
  summary 缓存拼出（全部命中才展示，否则保持空态）。页面顶部显示离线提示，不伪造数据。

## 4. 依赖与版本

- 新增 `@react-native-community/netinfo`（原生模块，autolinking；需要重新构建 APK）。
- `mobile/android/app/build.gradle`：`versionCode 223` / `versionName "2.3.0"`。
- 后端无新增 Python 依赖。

## 5. 失败模式与处理

| 场景 | 行为 |
| --- | --- |
| 离线打开首页，有缓存 | 显示缓存 + 离线横幅；下拉刷新提示离线，不清空列表 |
| 离线打开首页，无缓存 | 现有错误态 + 「暂无缓存」文案 |
| 离线新增，队列未满 | 入队 + 本地插入 + 待同步徽标；杀进程重开仍在 |
| 离线新增，队列已满 | 弹层提示「待同步记录过多，请联网同步后再试」，不丢输入 |
| 在线 POST 超时但服务端已写入 | 入队同一 client_id；重试时服务端返回已有记录，不重复 |
| 同步遇 400/422 | 标记 failed，保留错误原因；横幅显示失败数，可重试/删除 |
| 同步遇 401 | 客户端刷新 token；仍失败则停止本轮，等下次 |
| 用户登出 | 清缓存、保留队列；同用户重新登录后继续同步 |
| App 被杀 | 不保证后台同步；下次启动/回前台继续 |

## 6. 回退

- 后端：保留 `client_id` 列与唯一约束不影响旧版；代码回退只需恢复 router/schema，迁移可保留。
- App：回退到 2.2.2 即可（旧版不传 client_id，服务端兼容）；本地缓存/队列为新增 key，旧版忽略。
- 数据：不涉及历史数据改写；迁移只加列/约束。

## 7. 验证矩阵

| 项 | 方法 | 期望 |
| --- | --- | --- |
| 后端幂等 | pytest 新增用例 | 同 client_id 只 1 条；跨用户互不影响 |
| 队列 | jest 纯函数测试 | 去重/顺序/上限/失败标记/持久化 |
| 缓存 | jest（AsyncStorage mock） | 用户隔离、版本失效、损坏数据清理 |
| 类型/lint | `npx tsc --noEmit`、`npx eslint .` | 0 新增问题 |
| 真机离线 | 飞行模式：看缓存 → 记 2 笔 → 杀进程 → 恢复网络 | 2 笔自动同步且服务端恰好 2 条 |
| 旧版兼容 | 2.2.2 创建账单 | 正常，不受 client_id 影响 |

## 8. 已知限制

1. **首次离线不可用**：没有缓存时首页/分类/统计只能显示空态或错误，必须先联网成功加载一次。
2. **后台同步不保证**：App 被系统杀死后没有后台任务；下次打开/回前台继续上传。
3. **编辑/删除仍需联网**：离线时只提示，不进入队列。
4. **缓存未加密**：AsyncStorage 是应用私有目录，非加密存储；不做设备级加密。
5. **统计页备注排行**：离线时若网络请求失败，会保留上一次的排行数据（页面主体仍有「显示上次缓存」提示）。
6. **缓存不会主动过期**：按月份保存，直到被新数据覆盖或登出清理；离线看到的可能是几天前的数据。
