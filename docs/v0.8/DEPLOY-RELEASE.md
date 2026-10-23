# v0.8 落地记录：离线能力（只读缓存 + 离线新增）

- 创建时间：2026-10-23 16:00
- 状态：**后端已上线并验证；移动端代码与测试完成；release APK 构建被“缺少正式签名密钥”阻塞**，
  因此 OTA 发布与真机验收尚未完成。

## 1. 提交

| 提交 | 内容 |
| --- | --- |
| `5f328a1` feat: 离线能力（只读缓存 + 离线新增队列） | 后端幂等 + 移动端 offline 模块 + 首页/统计/分类接入 + 测试 |
| `7c4334f` docs: 新增 v0.8 离线能力文档 | `docs/v0.8/{REQ,ARCH,CHECKLIST}.md` |

代码统计：31 个文件，+1,712 / -29（不含 node_modules 与构建产物）。
版本：`versionCode 223` / `versionName "2.3.0"`；新增 `@react-native-community/netinfo@^12.0.1`。

## 2. 后端上线（已完成）

| 项 | 结果 |
| --- | --- |
| 部署时间 | 2026-10-23 15:52（CI 自动部署，总耗时 1m3s） |
| 迁移前快照 | `/opt/bookkeeping/dumps/pre-deploy_7c4334f_20261023_155247.sql.gz` |
| alembic | `e2f3a4b5c6d7`（head） |
| 表结构 | `transactions.client_id varchar(64) NULL`；`uq_transactions_user_client_id UNIQUE (user_id, client_id)` |
| 数据量 | transactions = 2,206（部署前后正常使用） |
| 线上 | `/health` 200、`/transactions` 无令牌 401、`/app-updates/latest` 200 |
| 失败标记 | 无 `ALERT.txt` / `failed-sha.txt` |

## 3. 移动端构建与测试

| 项 | 结果 |
| --- | --- |
| `tsc --noEmit` | 0 错误 |
| `jest` | 7 suites / 32 tests 全过（新增离线 4 个 suite） |
| `eslint` | 39 problems（1 个既存错误 / 38 warnings，低于原 48/10 基线，0 新增） |
| backend `pytest` | 91 passed（原 87 + 幂等 4） |
| debug APK | `BUILD SUCCESSFUL in 14m 5s`，166MB，versionCode 223 / 2.3.0，NetInfo 原生编译通过 |
| release JS bundle | Metro 打包成功，1.6MB（`offline-index.android.bundle`） |
| release APK | **未生成**：本机没有 `keystore/bookkeeping-release.keystore` 与 `release-signing.properties` |

## 4. 阻塞项

### 4.1 缺少正式发布密钥（硬阻塞）

本机只有 `mobile/android/app/debug.keystore`；`keystore/` 目录下没有正式的
`bookkeeping-release.keystore` 与 `release-signing.properties`（该目录被 gitignore，未随仓库同步）。
没有这把钥匙就无法生成可覆盖安装、可发布 OTA 的 2.3.0 APK。

需要：把 Windows 机器上的 `keystore/`（`bookkeeping-release.keystore` + `release-signing.properties`）
传到本机仓库根目录的 `keystore/`，然后重新执行：

```bash
cd mobile/android
export JAVA_HOME=$HOME/android-dev/jdk17
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$JAVA_HOME/bin:$PATH
bash gradlew assembleRelease --no-daemon
```

> 临时验证用的 `keystore/release-signing.properties` 目前指向 debug 证书（只用于本机编译验证），
> **不能用于发布**；拿到正式 keystore 后必须覆盖。

### 4.2 工作区有并行的 v0.9 主题重构（构建隔离）

主工作区里正在并行进行皮肤/主题重构（`docs/v0.9/`、`mobile/src/theme/skins/`、`themeStore` 等），
它修改了 `loadStoredThemeMode` / `gradient` 等接口。为保证离线功能可独立验证，release JS bundle
是在干净的 worktree `7c4334f` 里打的：

```
/Users/xyvora/.hermes/cache/scratch/bk-offline
```

在 v0.9 合并前，**不要直接用主工作区打 release APK**；应使用干净 worktree，或先完成主题重构并
把 `App.tsx`（`loadStoredThemeMode`）与 `HomeScreen`（`gradient` import）适配到新 API。

## 5. 验证矩阵（当前）

| 项 | 结果 |
| --- | --- |
| 后端幂等（pytest） | 同 client_id 只 1 条；跨用户隔离；缺省兼容；非法长度 422 |
| 队列纯函数 | 去重/用户隔离/移除/失败/上限/损坏清理 |
| 缓存纯函数 | 版本失效/损坏清理/用户隔离/登出清理 |
| 同步纯函数 | 成功/4xx failed/网络错误 pending/单飞 |
| 类型与 lint | tsc 0 错误；eslint 0 新增 |
| 线上 schema | client_id + 唯一约束已生效 |
| 真机离线 | **待 APK**：飞行模式看缓存 → 记 2 笔 → 杀进程 → 恢复网络 → 无重复 |
| 旧版兼容 | 2.2.2 仍可创建账单（client_id 可选） |

## 6. 回退

- 后端：迁移只加列/约束，旧版兼容；代码回退可恢复 router/schema，列可保留。
- App：回退到 2.2.2 即可；缓存/队列 key 旧版忽略。
- 数据：无历史数据改写；迁移前快照已在 dumps。

## 7. 后续步骤

1. 用户提供正式 keystore → 构建 release APK → `aapt2` / `apksigner` / `sha256` 复核
   （证书 SHA-256 应为 `d8d8202e…f6c06c`，签名与 2.2.2 一致）。
2. `scp` 上传，核对上传包 sha256 与本地逐位一致 → 服务器 `publish.sh` 发布 2.3.0。
3. 真机（vivo V2339A）飞行模式验收 7 项，确认服务端恰好新增 2 条、无重复。
4. 更新 `bookkeeping-app-iteration` skill（离线模块、同步触发、client_id 约束、构建隔离）。
