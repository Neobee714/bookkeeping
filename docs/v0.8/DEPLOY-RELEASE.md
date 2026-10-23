# v0.8 落地记录：离线能力（只读缓存 + 离线新增）

- 创建时间：2026-10-23 16:00
- 最终状态：**已随 2.4.0 / versionCode 224 发布（2026-10-23 16:25）**。
  离线功能与 v0.9 主题皮肤合并进同一个 APK；后端幂等与索引迁移均已上线。
  真机（vivo V2339A）飞行模式验收仍待用户执行。

## 1. 提交

| 提交 | 内容 |
| --- | --- |
| `5f328a1` feat: 离线能力（只读缓存 + 离线新增队列） | 后端幂等 + 移动端 offline 模块 + 首页/统计/分类接入 + 测试 |
| `7c4334f` docs: 新增 v0.8 离线能力文档 | `docs/v0.8/{REQ,ARCH,CHECKLIST}.md` |
| `65914bd` feat(theme): 四套皮肤与外观页（v0.9） | 主题重构，同时把离线 UI 适配到新 skin API；版本升至 2.4.0/224 |
| `2a626ee` perf(backend): 交易列表复合索引 | `(user_id, date, created_at)` 索引 + 迁移 `f3a8b2c9d4e1` |

代码统计（离线提交）：31 个文件，+1,712 / -29（不含构建产物）。
版本：离线独立开发时为 `2.3.0 / 223`；与主题合并后最终发布 `2.4.0 / 224`。
新增依赖：`@react-native-community/netinfo@^12.0.1`。

## 2. 后端上线（已完成）

| 项 | 结果 |
| --- | --- |
| 幂等迁移 | `e2f3a4b5c6d7`，2026-10-23 15:52 部署，耗时 1m3s |
| 索引迁移 | `f3a8b2c9d4e1`，2026-10-23 16:22 部署，耗时 19s |
| 当前 alembic | `f3a8b2c9d4e1`（head） |
| 表结构 | `transactions.client_id varchar(64) NULL`；`uq_transactions_user_client_id UNIQUE (user_id, client_id)` |
| 索引 | `ix_transactions_user_date_created_at (user_id, date, created_at)` 已存在 |
| 数据量 | transactions = 2,206 |
| 快照 | `pre-deploy_7c4334f_20261023_155247.sql.gz`、`pre-deploy_2a626ee_20261023_162204.sql.gz` |
| 线上 | `/health` 200、`/transactions` 无令牌 401、`/app-updates/latest` 200 |
| 失败标记 | 无 `ALERT.txt` / `failed-sha.txt` |

## 3. 移动端测试

| 项 | 结果 |
| --- | --- |
| `tsc --noEmit` | 0 错误 |
| `jest` | 8 suites / 37 tests 全过（离线 4 个 suite + 主题/更新测试） |
| `eslint` | 0 errors / 43 warnings（低于原 48/10 基线，0 新增错误） |
| backend `pytest` | 91 passed（原 87 + 幂等 4） |
| debug APK | `BUILD SUCCESSFUL in 14m 5s`，166MB，NetInfo 原生编译通过 |
| release JS bundle | Metro 打包成功，1.6MB（`offline-index.android.bundle`） |
| release APK | `BUILD SUCCESSFUL in 2m 28s`（增量），76,835,237 bytes |

## 4. Release APK 与签名

| 项 | 结果 |
| --- | --- |
| 路径 | `mobile/android/app/build/outputs/apk/release/app-release.apk` |
| versionCode / versionName | `224` / `2.4.0` |
| application-label | `拾光` |
| package | `com.neobee.bookkeeping` |
| ABI | arm64-v8a / armeabi-v7a / x86 / x86_64 |
| 签名方案 | APK Signature Scheme v2（v1 false） |
| 证书 | `CN=Neobee, OU=Neobee, O=Neobee, L=Unknown, ST=Unknown, C=CN` |
| 证书 SHA-256 | `D8:D8:20:2E:C0:C4:B7:06:53:30:B7:D1:44:AC:28:55:11:3A:B0:12:DE:E1:64:4F:FA:8C:32:E9:FE:F6:C0:6C` |
| APK SHA-256 | `14a910def2b8635496d6061d151ef83cae570b3ff20872f3420c96e6ca29e64d` |

签名密钥：用户提供的 `keystore/bookkeeping-release.keystore`（别名 `bookkeeping`，PKCS12），
证书与 2.2.2 一致，可覆盖安装。`keystore/` 被 gitignore，口令不写入仓库与文档。

## 5. OTA 发布（已完成）

| 项 | 结果 |
| --- | --- |
| 发布时间 | 2026-10-23 16:25 |
| 上传校验 | 本地/服务器 sha256 均为 `14a910de…29e64d` |
| 发布脚本 | `/opt/bookkeeping/distribute/publish.sh /tmp/bookkeeping-2.4.0.apk 2.4.0 --app bookkeeping --name "拾光"` |
| `info.json` | version `2.4.0`、size `76,835,237`、changelog 已更新 |
| `latest.apk` | HTTP 200、`application/vnd.android.package-archive`、content-length 76,835,237 |
| 归档 | `/var/www/apps/bookkeeping/bookkeeping-2.4.0.apk`（2.2.2 等旧包保留） |
| `meta.json` | sha256 与 APK 一致，displayName `拾光` |

## 6. 验证矩阵

| 项 | 结果 |
| --- | --- |
| 后端幂等（pytest） | 同 client_id 只 1 条；跨用户隔离；缺省兼容；非法长度 422 |
| 队列纯函数 | 去重/用户隔离/移除/失败/上限/损坏清理 |
| 缓存纯函数 | 版本失效/损坏清理/用户隔离/登出清理 |
| 同步纯函数 | 成功/4xx failed/网络错误 pending/单飞 |
| 类型与 lint | tsc 0 错误；eslint 0 新增错误 |
| 线上 schema | client_id + 唯一约束 + 复合索引均已生效 |
| 模拟器启动 | 2.4.0 安装成功，登录页正常渲染，logcat 无 FATAL/RN error |
| 真机离线 | **待用户**：飞行模式看缓存 → 记 2 笔 → 杀进程 → 恢复网络 → 无重复 |
| 旧版兼容 | 2.2.2 仍可创建账单（client_id 可选）；2.4.0 可覆盖安装 |

## 7. 离线范围（明确未做）

- 只做「只读缓存 + 离线新增」。
- 编辑/删除仍要求联网；离线点击会提示。
- 没有后台同步：App 被杀后，下次启动、联网或回前台才继续上传。
- 首次使用必须先联网成功加载一次，否则没有缓存/分类可用。
- 队列上限 200 条；缓存结构版本 `v1`。

## 8. 回退

- 后端：迁移只加列/约束/索引，旧版兼容；代码回退可恢复 router/schema，列与索引可保留。
- App：回退安装 2.2.2（归档仍在）；缓存/队列 key 旧版忽略。
- 数据：无历史数据改写；迁移前快照已在 dumps。

## 9. 后续

1. 用户在 vivo V2339A 上通过 OTA 升级到 2.4.0，执行第 6 节的真机离线验收。
2. 验收通过后勾选 `docs/v0.8/CHECKLIST.md` 的 e2e 项。
3. 若后续要做离线编辑/删除或后台同步，另开版本，不在本版承诺范围内。
