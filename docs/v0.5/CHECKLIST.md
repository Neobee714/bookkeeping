# 开发清单：金流 v0.5 迭代（记账快捷输入）

- 创建时间：2026-10-07 23:37
- 规则：每完成一个小点标记 ✅，并附完成时间戳 `YYYY-MM-DD HH:mm`。

## 阶段一：需求与设计
- [x] 需求澄清完成（Q1/Q2/Q3 已确认）✅ 2026-10-07 23:37
- [x] 理解确认原型已出并获用户确认（`docs/v0.5/preview/understanding.html`）✅ 2026-10-07 23:37
- [x] 三文档创建（REQ.md / ARCH.md / CHECKLIST.md）✅ 2026-10-07 23:37
- [x] 前端 chip 组件风格确认（变体 A 轻柔描边，`docs/v0.5/preview/chip-styles.html`）✅ 2026-10-07 23:47
- [x] 后端设计（新增表 + 3 接口）白话确认 ✅ 2026-10-07 23:47

## 阶段二：数据模型（后端）
- [x] db-1：新增 `UserNotePreset` 模型（user_id / note / kind / created_at + UNIQUE(user_id, note)）✅ 2026-10-08 00:25
- [x] db-2：新增 alembic 迁移建 `user_note_presets` 表并验证 upgrade 通过（`d4e6f7a8b9c0`，down_revision=`67f2f7585bb7`；临时库验证 upgrade/downgrade 均可重复执行）✅ 2026-10-08 00:25
- [x] db-3：模型注册到 `app/models/__init__.py`，import 链完整 ✅ 2026-10-08 00:25

## 阶段三：接口（后端）
- [x] api-1：`GET /transactions/quick-inputs` 返回 `last_date`（按 created_at DESC, id DESC 倒序第一条）✅ 2026-10-08 00:25
- [x] api-2：`quick-inputs` 返回 `pinned`（含窗口内 count / last_used）✅ 2026-10-08 00:25
- [x] api-3：`quick-inputs` 返回 `by_category`（窗口 `[today-(days-1), today]`=90 天、≥2 次、排除 pinned/hidden、每组取前 6）✅ 2026-10-08 00:25
- [x] api-4：`POST /transactions/note-presets` upsert（kind = pinned / hidden）✅ 2026-10-08 00:25
- [x] api-5：`DELETE /transactions/note-presets?note=` 删除记录 ✅ 2026-10-08 00:25
- [x] api-6：参数校验（days 1..365、per_category 1..20、note trim 后非空且 ≤255）+ 鉴权隔离（仅当前用户）✅ 2026-10-08 00:25

## 阶段四：前端（App）
- [x] fe-1：`mobile/src/api/quickInputs.ts` + 类型定义（三个接口封装）✅ 2026-10-08 00:28
- [x] fe-2：弹层打开时拉取一次快捷数据，失败静默降级（不渲染 chip、不报错、不影响记账）✅ 2026-10-08 00:28
- [x] fe-3：日期行右侧「同上次 MM-DD」chip：值 = last_date，点击填入日期，选中态渐变 + ✓，无历史账单/接口失败时隐藏；「选择 ›」提示保留、chip 占最右位 ✅ 2026-10-08 00:28
- [x] fe-4：备注 chips 行：★收藏在最前、按当前分类过滤推荐、去重、截断 8 个、横向可滑（单行不撑高）✅ 2026-10-08 00:28
- [x] fe-5：点击 chip 填入备注框（覆盖原内容）✅ 2026-10-08 00:28
- [x] fe-6：备注框「＋收藏」按钮（空 / 已收藏时置灰）+ 长按 chip 弹 Alert（取消收藏 / 不再推荐）；主动动作失败给轻提示且不改本地列表 ✅ 2026-10-08 00:28
- [x] fe-7：编辑模式下 chip 与日期 chip 同样可用（回显正确、不误改原值）✅ 2026-10-08 00:28

## 阶段五：测试与回归
- [x] test-1：backend `tests/test_quick_inputs.py`（last_date / 分类口径 / 窗口边界 / upsert / 用户隔离，共 23 项）✅ 2026-10-08 00:25
- [x] test-2：mobile 纯函数测试 `__tests__/quickNoteChips.test.ts`（7 项：合并去重 / 分类过滤 / 截断 / pinned 顺序 / 异常结构）✅ 2026-10-08 00:28
- [x] test-3：mobile `tsc --noEmit` exit 0、`jest` 3 suites / 15 tests 全通过、`eslint` 48 problems 与基线逐条一致（0 新增）✅ 2026-10-08 00:28
- [x] test-4：backend `pytest -q` 全量 **87 passed**（新增 23 + 既有 64，无回归）✅ 2026-10-08 00:25
- [x] test-5：确认未新增 npm / python 依赖（`package.json`、`package-lock.json`、`requirements.txt` 时间戳均未变）✅ 2026-10-08 00:28

## 阶段六：验收与发布
- [x] rel-1：版本号升至 2.2.0 / versionCode 220（`mobile/android/app/build.gradle`）✅ 2026-10-08 00:28
- [x] rel-2：后端镜像重建 + 迁移执行 + 线上接口自测（alembic → `d4e6f7a8b9c0`、表已建、账单 2091 条未变、带令牌实测三个接口 + 参数边界全过；详见 `docs/v0.5/DEPLOY-RELEASE.md`）✅ 2026-10-08 01:10
- [ ] rel-3：release APK 构建通过 + OTA 推送 + 真机验证两个快捷功能 —— **状态：用户 2026-10-08 17:3x 要求"暂停构建"（当前无 APK 产出、未发布）**
  - 过程：16:45 用户先决定暂缓 → 17:0x 确认"OTA 只分发 APK、无热更新"后批准构建 → 17:2x 子 Agent 定位并解决 MAX_PATH 问题后重新构建 → **17:3x 用户要求暂停**，已中断构建并结束全部构建进程（无残留），未产出 APK、未发布。
  - 恢复方式：`cd C:\bk\mobile\android` 后按第 3 节命令跑 `assembleRelease`（工具链、Gradle 依赖缓存、`app/.cxx` 部分原生编译产物均已保留 → 比首次冷启动快）。
  - ⚠️ 注意：`C:\bk` 是为绕开 MAX_PATH 建的目录联接（junction，指向工程根，仓库之外）。**若要删除必须用 `cmd /c rmdir C:\bk`**（PowerShell 的 `Remove-Item` 作用于 junction 有删除目标目录内容的风险）。
  - 现状：App 侧代码（同上次日期 chip / 常用备注 chips / 收藏与长按管理）已随提交 `d81b77a` 推到 GitHub `main`，后端已上线；**手机端仍是 2.1.2，等 APK 发布后即可看到新功能**。
  - 已就绪（构建成本已大幅降低）：工具链已装好 —— JDK 17 `C:\Users\13212\tools\jdk-17`、Node 24 `C:\Users\13212\tools\node`、SDK `C:\Users\13212\AppData\Local\Android\Sdk`（platform 37.0 / build-tools 37.0.0 / NDK 28.2.13676358 / cmake 3.22.1）、Gradle 9.4.1 已下载；Gradle 代理写在用户级 `~/.gradle/gradle.properties`（不污染仓库）。
  - 已排除的两个坑：① 构建缓存残留已不存在的 `F:\Work\...` 绝对路径（`autolinking.json`）；② **Windows 260 字符路径上限**（工程路径比旧的 `F:` 盘长 12 字符，导致 CMake `mkdir` 路径达 282 字符而失败）→ 用 `C:\bk` 联接缩短前缀解决（详见 `docs/v0.5/DEPLOY-RELEASE.md` 第 3 节）。
  - 发布前置已核对：`/opt/bookkeeping/distribute/{publish.sh,gen-index.sh}` 在位、`sudo` 免密、`/var/www` 剩余 28GB；旧包基线 `latest.apk` SHA-256 = `e0ecc64c684e01d6716657475ed28fe8fddffc56acca500b28f872afa3011afb`（2.1.2 / 76,728,113 字节），发布后须与新包不同。
  - 通道说明：App 只读 `https://app.xyvora.me/bookkeeping/info.json`（`mobile/src/config.ts`），**后端 `/app-updates/apk` 通道客户端从未实现消费**（实测其 APK 目录为空、返回 `has_update:false`）→ 本次只发静态站；如需归档可另用管理员账号 POST 到后端通道。
- [ ] rel-4：整体验收（对照 REQ.md 第 4 章逐条勾选）
