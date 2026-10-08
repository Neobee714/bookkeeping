# 架构文档：金流 v0.5 迭代（记账快捷输入）

- 创建时间：2026-10-07 23:37
- 版本：v0.5
- 状态：已确认

## 1. 技术栈与选型

| 层面 | 技术 | 选型理由 |
| --- | --- | --- |
| 移动端 | React Native 0.87（既有工程） | 保持不动，**不新增任何依赖** |
| 长按菜单 | RN 内置 `Alert.alert` 带按钮 | 现有代码已用 Alert 做确认（HomeScreen 删除），零新依赖 |
| 状态 | 弹层内 `useState` + 进入时一次性拉取 | 数据量极小，不引入 store / 缓存层 |
| 后端 | FastAPI + SQLAlchemy + Alembic（既有） | 只加一张表 + 三个接口，不改既有契约 |
| 数据库 | PostgreSQL | 沿用；新增 `user_note_presets` 表用**新增**迁移创建 |
| 测试 | Jest（mobile 既有 `__tests__/`）+ pytest（backend 既有 `tests/`） | 沿用现有测试框架 |

## 2. 系统架构

```
┌───────────────────────────────────────────────────────────────┐
│ Mobile (RN)                                                    │
│  AddTransactionSheet（弹层，visible=true 时拉一次快捷数据）      │
│   ├─ 日期行 + [同上次 MM-DD] chip ──► setDateStr(last_date)     │
│   ├─ 备注框 + [＋收藏]                                          │
│   └─ 备注框下方 chips（★收藏 + 当前分类推荐）──► setNote(note)   │
│        长按 chip ──► Alert：取消收藏 / 不再推荐                  │
└───────────────────────────┬───────────────────────────────────┘
                            │ HTTPS + JWT（现有 client）
┌───────────────────────────▼───────────────────────────────────┐
│ Backend (FastAPI)                                              │
│  GET  /transactions/quick-inputs   → last_date + pinned +       │
│                                      by_category（一次拿全）    │
│  POST /transactions/note-presets   → 收藏 / 不再推荐（upsert）  │
│  DELETE /transactions/note-presets → 删除收藏或隐藏记录          │
│  表：user_note_presets(user_id, note, kind)  ← 新增迁移         │
│  transactions 表 / 既有接口：完全不动                            │
└───────────────────────────────────────────────────────────────┘
```

## 3. 模块划分

| 模块 | 改动 |
| --- | --- |
| `mobile/src/components/AddTransactionSheet.tsx` | 新增：快捷数据拉取（visible 时一次）、日期行「同上次」chip、「＋收藏」按钮、备注 chips 行（含过滤/排序/截断）、长按菜单；失败静默降级 |
| `mobile/src/api/quickInputs.ts` | **新增**：`fetchQuickInputs()`、`setNotePreset(note, kind)`、`removeNotePreset(note)` |
| `mobile/src/types/index.ts` | 新增快捷输入相关类型（`QuickInputs`、`QuickNoteCandidate`、`NotePresetKind`） |
| `backend/app/models/note_preset.py` | **新增**：`UserNotePreset` 模型 |
| `backend/app/models/__init__.py` | 注册新模型（供 alembic autogenerate / import 链） |
| `backend/app/schemas/transaction.py` | 新增快捷输入的响应 / 请求 schema（`QuickInputsResponse`、`NotePresetRequest`） |
| `backend/app/routers/transactions.py` | 新增 3 个路由（见第 4 章）；不改动既有列表/创建/更新/删除路由 |
| `backend/alembic/versions/` | **新增**一个迁移：建 `user_note_presets` 表（不修改历史迁移） |
| `backend/tests/test_quick_inputs.py` | **新增**：last_date、分类推荐口径、收藏/隐藏 upsert、用户隔离 |
| `mobile/__tests__/quickNoteChips.test.ts` | **新增**：chip 合并去重 / 分类过滤 / 截断 8 个的纯函数测试 |
| `mobile/android/app/build.gradle` | versionCode 220 / versionName 2.2.0 |
| `frontend/`（Web 残留壳） | **不改** |

## 4. 数据与接口

### 4.1 数据表（新增）

```
user_note_presets
├─ id          serial PK
├─ user_id     FK users.id ON DELETE CASCADE, NOT NULL
├─ note        varchar(255) NOT NULL      -- 备注文本（首尾空白已 trim）
├─ kind        varchar(10)  NOT NULL      -- 'pinned' 收藏 / 'hidden' 不再推荐
├─ created_at  timestamptz  NOT NULL DEFAULT now()
└─ UNIQUE (user_id, note)                 -- 同一备注只有一条记录，kind 可覆盖
```

说明：`kind` 用 `String(10)` + 应用层校验，与项目现有 `category` 等字段风格一致（不新建 PG 枚举类型，避免迁移复杂度）。

### 4.2 接口清单

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/transactions/quick-inputs?days=90&per_category=6` | 一次返回弹层所需的全部快捷数据（见下方响应示例） |
| POST | `/transactions/note-presets` | body `{note, kind}`；按 `(user_id, note)` **upsert**，返回 `{note, kind}` |
| DELETE | `/transactions/note-presets?note=<备注>` | 删除该用户的这条记录；返回 `{note, deleted: bool}` |

**GET /transactions/quick-inputs 响应示例**

```json
{
  "success": true,
  "message": "ok",
  "data": {
    "last_date": "2026-10-06",
    "pinned": [
      { "note": "早餐", "count": 12, "last_used": "2026-10-07" }
    ],
    "by_category": {
      "餐饮": [
        { "note": "买菜", "count": 5, "last_used": "2026-10-05" },
        { "note": "咖啡", "count": 3, "last_used": "2026-10-04" }
      ],
      "交通": [
        { "note": "地铁", "count": 9, "last_used": "2026-10-06" }
      ]
    }
  }
}
```

计算口径：

- **统计窗口**：`window = [today - (days - 1), today]`，`days` 默认 90 → 含今天共 **90 个自然日**（`today-89` 计入、`today-90` 排除）。`days` 可调（1..365），窗口随参数同步变化。
- **响应包装**：沿用项目统一的 `app/core/response.py` 包装，即 `{"success": true, "message": ..., "data": {...}}`（前端按 `success` 解析，与既有 `unwrap` 一致）。
- `last_date`：当前用户 `transactions` 按 `created_at DESC, id DESC` 取第一条的 `date`（不限月份；`id DESC` 为同秒平局时的确定性次级排序）；无数据返回 `null`。编辑时若等于当前日期，前端把 chip 显示为选中态（不特殊处理数据）。
- `pinned`：`kind='pinned'` 的记录，按 `created_at DESC, id DESC` 排序；每条带统计窗口内的使用次数 `count` 与最近使用日期 `last_used`（可能为 0 / null）。
- `by_category`：统计窗口内 `note` 非空（trim 后非空）的账单，按 `(category, note)` 分组，仅保留 `count >= 2` 的，每组按「count DESC, max(date) DESC」排序后截取前 `per_category` 条；**排除** `pinned` 与 `hidden` 的备注。
- `days` 默认 90、`per_category` 默认 6，均带上下限校验（days ≤ 365，per_category ≤ 20）。

**前端合并规则**（`AddTransactionSheet` 内）：

```
chips = [ ...pinned(★) ] ++ by_category[当前分类] 排除已在 pinned 中的
排序：pinned 按收藏时间倒序在前；推荐保持后端顺序
截断：slice(0, 8)
分类切换 / 收支切换 → 仅本地重新过滤，不再请求接口
```

## 5. 前端风格

沿用 v0.1 风格 C「活力渐变」：主渐变紫 `#8B5CF6 → #EC4899`、浅紫底 `#F7F5FF`、深色底 `#171322`、圆角 16–24。本轮只新增两个小组件，**不重出整套风格原型**，给出组件级说明并请用户选定 chip 变体：

- **「同上次 MM-DD」chip（日期行右侧）**：胶囊 pill，高 ≈ 28，横向内边距 10，字号 12；未选中 = `surface` 底 + `primary` 描边 + `primary` 文字；选中（当前日期 == last_date）= 渐变填充 + 白字 + `✓ ` 前缀。位置：日期行内右侧、与现有「选择 ›」提示**同一行且提示保留**（chip 占最右位）——保留提示是为了不丢失「日期行可点开原生选择器」的可见入口，且无 chip 时日期行渲染与改动前完全一致。
- **备注 chips 行**：单行 `ScrollView horizontal`（不换行、不撑高弹层），chip 高 ≈ 26、字号 12、chip 间距 6。**已选定变体 A「轻柔描边」**（3 变体见 `docs/v0.5/preview/chip-styles.html`，用户 2026-10-07 23:47 选定）：
  - ★ 收藏 chip：白/卡片底 + 1.5px 主色描边 + 主色文字 + 加粗，文案前缀 `★ `，排序最前、不随分类过滤；
  - 自动推荐 chip：浅紫底 `#F4F0FF`、无描边、灰紫文字 `#6d5f9a`、常规字重；
  - 不使用渐变填充（避免与底部「确认新增」渐变按钮抢视线）。
- **「同上次」chip 选中态**：未选中 = 卡片底 + 1.5px 主色描边 + 主色文字；选中（当前日期 == last_date）= 渐变填充 + 白字 + `✓ ` 前缀。
- **「＋收藏」**：备注框右侧内联的 12px 文字按钮（`primary` 色），备注为空或已在 ★ 列表中时置灰不可点。
- **长按菜单**：`Alert.alert`，标题为备注文本，按钮「取消收藏」/「不再推荐」+「取消」，不使用新弹层组件。
- **失败反馈**：开场拉取快捷数据失败 → **完全静默**（不渲染 chip 区、不提示、不影响记账）；用户主动动作（＋收藏 / 取消收藏 / 不再推荐）失败 → `Alert.alert('操作失败', extractErrorMessage(...))` 轻提示，且不做本地乐观更新（本地列表保持与服务端一致）。
- **深色主题**：新增两个主题 token `chipSoftBg` / `chipSoftText`（浅色 `#F4F0FF` / `#6D5F9A`，深色 `#453A66` / `#C9BEF0`，对比度 ≈ 5.8:1），保证淡紫推荐 chip 在深色下可读。
- **空态**：无候选时不渲染 chips 行（不留空白占位）；接口失败时不渲染且不报错。

## 6. 后端设计（白话说明）

- **「同上次」怎么知道上次是哪天**：App 打开新增弹层时，问后端一句「我最近录的那一笔是哪天」。后端在账单表里按**录入时间**（不是账单日期）倒序找最新的一条，把它记录的「日期」返回。所以你补录一笔上月 20 号的账之后，下一次点开弹层，chip 就会变成上月 20 号 —— 这符合「上一次记的是哪天就用哪天」。
- **常用备注怎么算出来**：后端顺手把**最近 90 天**你自己的账单按「分类 + 备注」分组数一数，出现 **2 次以上**的备注，按「用得最多 → 最近用过」排序，每个分类取前 6 个，一起打包返回。App 里选中「餐饮」就只显示餐饮那一组，切到「交通」就换一组（用的是已经拿到的数据，不再请求，所以切换是瞬时的）。
- **收藏 / 不再推荐怎么存**：新增一张小表，一人一行一条备注，记两种状态 ——「收藏」（永远显示、带 ★、不随分类过滤）和「不再推荐」（算法再算出来也不要它）。这张表**只属于你自己的账号**，伴侣看不到你的收藏，你也看不到对方的（数据按用户 ID 隔离，接口只读写自己的）。
- **接口安全**：三个接口都走现有的登录令牌校验，只查/只改当前登录用户自己的数据；备注长度跟账单表一致限制 255 字。
- **改动面**：账单表和现有的增删改查接口**一行都不改**，只新增表和三接口。所以不会影响你现在记账、查询、图表、Agent 的任何功能。
- **数据库升级方式**：用一个新增的迁移脚本建表（不动历史迁移），部署时容器里跑一次升级即可，旧数据不受影响。

## 7. 部署与环境

- 后端：Vultr Tokyo VPS Docker（`api.bookkeeping.neobee.top`）→ 重新构建镜像 + 重启容器 + `python -m alembic upgrade head` 建新表。
- App：构建 release APK v2.2.0（versionCode 220）→ 走既有 OTA 通道（`app.xyvora.me` 的 info.json + latest.apk）→ 验证。
- 本地验证：backend `pytest`；mobile `npx tsc --noEmit`、`npm run lint`、`npm test`。
- Web 端（Vercel）本轮无改动，不需要重新部署。

## 8. 修订记录

| 时间 | 变更说明 |
| --- | --- |
| 2026-10-07 23:37 | 创建架构文档；确定新增 1 表 3 接口、前端 chip 合并规则与降级策略 |
| 2026-10-07 23:47 | 前端 chip 变体选定 A「轻柔描边」；后端设计经用户确认无修改 |
| 2026-10-08 00:25 | 后端实现完成后定稿契约细节：① 统计窗口明确为「恰好 days 个自然日」`[today-(days-1), today]`（days=90 → 含今天共 90 天）；② 修正第 4.2 章响应示例的包装字段为项目实际的 `{"success":true,...}`（原文误写 `code`）；③ `last_date`/`pinned` 排序补充 `id DESC` 次级排序，保证同秒平局时结果确定 |
| 2026-10-08 00:28 | 前端实现完成后对齐文档：① §3 测试文件名改为实际的 `quickNoteChips.test.ts`；② §5「同上次」chip 位置明确为「保留『选择 ›』提示、chip 占最右位」；③ §5 补充失败反馈策略（拉取静默 / 主动动作轻提示）与深色主题 token `chipSoftBg`/`chipSoftText` |
