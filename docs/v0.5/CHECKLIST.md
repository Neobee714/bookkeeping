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
- [x] rel-3c：**应用改名「时光」→「拾光」并升版重发**（用户 2026-10-12 决定）✅ 2026-10-12 18:35
  - 改动 5 个文件（均为用户可见文案或版本号，字节级替换、UTF-8 无 BOM、行尾不变）：
    `mobile/android/app/src/main/res/values/strings.xml`（`app_name`）、`mobile/app.json`（`displayName`）、
    `mobile/src/screens/LoginScreen.tsx`（登录页标题）、`mobile/src/screens/HomeScreen.tsx`（首页标题）、
    `mobile/android/app/build.gradle`（`versionCode 220→221`、`versionName "2.2.0"→"2.2.1"`）。
    助手名「小光」未动；包名 `com.neobee.bookkeeping` 未动（保证可覆盖安装）。
  - 版本号必须递增的原因：App 更新判定为 `compareVersions(remote, local) > 0`（纯版本号比较），同版本号不会再提示更新。
  - 构建：`BUILD SUCCESSFUL in 3m 23s`，产物 **76,738,337 字节**（与 2.2.0 恰好同字节数，因全是等长替换），
    SHA-256 `E1046FFC31080E6734B5B1A33EA9F83BDCD2F43602769949686AC893E66828A0`（**与 2.2.0 的 `ACBF2DF3…` 不同**）。
  - **独立复核（主 Agent 亲自做，含二进制层）**：`aapt2` 的 label 原始字节 = `e6 8b be e5 85 89` = `U+62FE U+5149` = **拾光**；
    `resources.arsc` 内「拾光」×1、「时光」×0；`assets/index.android.bundle` 内（UTF-16LE）「拾光」×1、「时光」×0、
    「小光」×1（正向对照，证明检索方法有效）；`versionCode 221` / `versionName 2.2.1` / 包名不变；
    `apksigner` `Verifies`、证书 SHA-256 仍为 `d8d8202e…f6c06c`（同一把钥匙）。
  - 已发布 OTA：`info.json` = **2.2.1**、`latest.apk` SHA-256 = `e1046ffc…28a0`、归档保留 **2.1.2 / 2.2.0 / 2.2.1** 三版、
    下载页展示名「拾光」。发布前置校验：上传包 SHA-256 与本地逐位一致后才执行 `publish.sh`。
  - 坑记录：`Get-Content` 读重定向的 `aapt2` 输出会按本机 ANSI(GBK) 解码，导致中文显示成 `鎷惧厜` 这类乱码 —— **不要据此判定包内文案错误**，要按字节或指定 UTF-8 解码复核。
- [x] rel-3e：**修复真机验收发现的 bug：点「立即更新」后无任何提示**（用户 2026-10-12 报告）✅ 2026-10-12 19:0x
  - 现象：点更新弹窗的「立即更新」后，弹窗一直留在屏幕上、几十秒到几分钟内**零反馈**，用户以为没反应。
  - 根因（代码级定位）：`mobile/android/app/src/main/java/com/bookkeepingapp/UpdaterModule.kt` 的
    `downloadAndInstall` 在 `downloadManager.enqueue(request)` 之后**不 resolve**，promise 只在**下载完成**
    且 `handleDownloadComplete → launchInstaller` 时才 `promise.resolve(true)`（原第 219 行）；
    而 JS 侧 `mobile/src/updater/useUpdateCheck.ts` 的 `onUpdate` 是在 `.then()` 里才 `hide()` + 弹提示
    → 整个 76MB 下载期间既没关弹窗也没提示。**语义错配**（原生 resolve = 已唤起安装器 vs JS 理解为已开始下载）。
  - 修法：原生在 `enqueue()` 之后**立即 resolve(true)**（语义改为"已加入系统下载队列"），并把 promise 从完成路径
    彻底摘除（避免二次 resolve 抛错），下载失败改为记日志（系统下载通知本身会报错）；JS 成功分支改为
    `hide()` + 立即可见提示：标题「已在后台下载」、正文「安装包正在后台下载，可在通知栏查看进度，下载完成后会自动打开安装界面。现在可以关闭本应用。」；
    版本递增 **2.2.1 → 2.2.2（versionCode 222）**。
  - 影响面：`mobile/android/.../UpdaterModule.kt`、`mobile/src/updater/{index.ts,flow.ts,useUpdateCheck.ts}`、`build.gradle`。
  - 构建：`BUILD SUCCESSFUL in 3m 7s`，产物 **76,738,389 字节**，SHA-256 `7935DE27B79E0D7136D75F2E0D7CD486C13B456F7FF8ABA597D61C193FF6E0BD`（版本链 220 `ACBF2DF3…` → 221 `E1046FFC…` → 222 `7935DE27…`）。
  - **主 Agent 独立复核（自己算 + 自己查，且逐行通读被重建过的 Kotlin 文件）**：
    `aapt2` → `versionCode 222` / `versionName 2.2.2` / 包名不变 / label 字节 `e6 8b be e5 85 89`（拾光，改名未被弄回）；
    `apksigner` → `Verifies`、v2 有效、证书 SHA-256 仍 `d8d8202e…f6c06c`；
    **dex 常量核对** → 新增日志各 ×1，`E_DOWNLOAD_NOT_FOUND`/`E_DOWNLOAD_FAILED`/`E_QUERY_FAILED`/`E_OPEN_INSTALLER` 全部 ×0（reject 确已移除），入队前校验的 `E_INVALID_URL`/`E_NO_STORAGE` 保留 ×1；
    **JS bundle 核对** → 「已在后台下载」「安装包正在后台下载」「现在可以关闭本应用。」各 ×1，旧文案「后台更新中」×0，「拾光」「小光」各 ×1。
  - 已发布 OTA：`info.json` = **2.2.2**、`latest.apk` SHA-256 = `7935de27…e0bd`；归档保留 **2.1.2 / 2.2.0 / 2.2.1 / 2.2.2** 四版；四个归档与下载页均 200。
  - 过程记录（值得记的教训）：子 Agent 为一次改 14 处自写"按行号批量替换"，其多行排序有 bug，导致 `UpdaterModule.kt` 第 164 行后错乱、一度语法损坏；它自查发现并按原内容重建了 164–255 行（含被弄丢的 `Context.RECEIVER_EXPORTED`）。主 Agent 对该文件**逐行通读**确认逻辑完备（4 个 reject 各自紧跟 `return` 且均在 `enqueue` 之前、`resolve` 唯一、完成路径签名已无 `promise`），并额外确认 API 33+ 的 `RECEIVER_EXPORTED` 分支完好。
  - 次要观察（未改，风险可忽略）：注册广播的语句现在位于 `resolve(true)` 之后；76MB 下载不可能在微秒级完成，故不会漏广播。若日后要更稳妥，可把注册提前到 `resolve` 之前。
- [ ] rel-3d：**真机验证**（用户在手机上确认更新提示出现、安装后应用名显示「拾光」、两个快捷功能正常 + 本次的更新提示修复）
  - 预期路径：打开 App → 启动静默检查 `info.json` → 因 `2.2.2 > 本地版本` 弹更新窗 → 点「立即更新」→ **应立即关掉弹窗并弹出「已在后台下载」提示**（本次修复点）→ 通知栏可见下载进度 → 完成后自动打开安装界面。
  - 需验证的功能点：① 新增账单里日期行右侧「同上次 MM-DD」chip 点击可套用上次日期；
    ② 备注框下方常用备注 chips（★收藏 + 当前分类推荐）点击填入、「＋收藏」可用、长按可「取消收藏 / 不再推荐」；
    ③ 深色主题下淡紫 chip 可读；④ 断网时点这三个操作会有失败提示且不改本地状态。
- [ ] rel-4：整体验收（对照 REQ.md 第 4 章逐条勾选）
