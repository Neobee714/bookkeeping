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
- [x] rel-3a：**release APK 构建通过**（2026-10-12 18:06）✅ 2026-10-12 18:10
  - 产物：`mobile\android\app\build\outputs\apk\release\app-release.apk`，**76,738,337 字节**，
    SHA-256 `ACBF2DF3319EBDE8FA73903FF5B1ECB920CC446471122A1BA8B3C30E836F438A`，构建耗时 7m20s（`BUILD SUCCESSFUL`）。
  - 主 Agent 独立复核（自己算哈希 + 自己跑工具，非采信子 Agent 结论）：`aapt2 dump badging` → `com.neobee.bookkeeping` /
    `versionCode 220` / `versionName 2.2.0` / `targetSdk 36` / 4 个 ABI（arm64-v8a、armeabi-v7a、x86、x86_64）；
    `apksigner verify -v --print-certs` → `Verifies`、v2 方案有效、`CN=Neobee`、证书 SHA-256 `d8d8202e…f6c06c`
    与 `keystore/bookkeeping-release.keystore` 中 `bookkeeping` 别名指纹**逐位一致**（同一把发布钥匙，可覆盖安装）。
  - 说明：仅 v2 签名（无 v1）→ Android 6 及以下无法安装；本项目 `minSdk 24`，刚好安全（与上一版行为一致）。
- [x] rel-3b：**OTA 发布到 `app.xyvora.me`**（2026-10-12 18:14）✅ 2026-10-12 18:14
  - 上传包 SHA-256 与本地构建产物逐位一致后才发布（防止上传损坏）。
  - `info.json` → `version 2.2.0` / `size 76738337` / `updatedAt 2026-10-12T10:14:02Z`；
    `latest.apk` SHA-256 = `acbf2df3…f438a`（已由旧包 `e0ecc64c…` 换新）；新增归档 `bookkeeping-2.2.0.apk`，
    旧版 `bookkeeping-2.1.2.apk` 保留（可回退）。
  - 对外可达性：`info.json` 200 `application/json`、`latest.apk` 200/206 `application/vnd.android.package-archive`、
    两个版本归档 200、下载页 200；下载页展示名按用户要求设为 **拾光**。
  - 发布命令：`sudo bash /opt/bookkeeping/distribute/publish.sh <apk> 2.2.0 --app bookkeeping --name "拾光" --desc "双人记账" --changelog "…"`。
- [ ] rel-3c：**真机验证**（用户在手机上确认更新提示出现、安装后「同上次」日期 chip 与常用备注 chips 工作正常）
  - 预期路径：打开 App → 启动静默检查 `info.json` → 因 `2.2.0 > 2.1.2` 弹更新窗 → 「立即更新」经系统 DownloadManager 下载安装；
    也可在「我的」页手动检查更新。
  - ⚠️ 已知不一致（待用户决定）：**APK 内置应用名是「时光」**（`mobile/android/app/src/main/res/values/strings.xml`
    字节为 `U+65F6 U+5149`，`aapt2` 读出 `application-label:'时光'`），而下载页展示名本次按用户要求用「拾光」。
    若希望手机桌面也显示「拾光」，需改 `strings.xml` 后在下一个版本重新构建发布（缓存已热，约 7 分钟）。
- [ ] rel-4：整体验收（对照 REQ.md 第 4 章逐条勾选）
