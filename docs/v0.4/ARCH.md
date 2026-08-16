# 架构文档：金流 v0.4 迭代

- 创建时间：2026-08-16 17:24
- 版本：v0.4
- 状态：已确认

## 1. 技术栈与选型

| 层面 | 技术 | 选型理由 |
| --- | --- | --- |
| 移动端 | React Native (Expo, RN 0.8x) | 既有工程，保持不动 |
| 移动端新增依赖 | `@react-native-community/datetimepicker`（日期选择器）、`react-native-image-picker`（相册选头像） | RN 社区标准方案，与现有 RN 版本兼容 |
| Web 端 | React + Vite + TS（Capacitor 残留壳） | 仅改文案/标题，不引入新依赖 |
| 后端 | FastAPI + SQLAlchemy + Alembic | 既有工程 |
| 图表 | 手写 SVG 折线/条形图（react-native-svg） | 延续 v0.3 方案，不引入图表库 |
| 吸顶交互 | 原生 `Animated`（useNativeDriver）+ 滚动监听 | 轻量、无新依赖 |

## 2. 系统架构

```
┌────────────────────────────────────────────────┐
│ Mobile (RN)                                     │
│  HomeScreen: FlatList 滚动 + Animated 结余卡吸顶 │
│  StatsScreen: 汇总卡 + 分类分布 + 备注排行/趋势  │
│  AddTransactionSheet: 金额→备注→日期→分类 + 日期 │
│   选择器 + 分类选中态修复                        │
│  ProfileScreen: 用户名/密码/头像 资料管理        │
└──────────────┬─────────────────────────────────┘
               │ HTTPS
┌──────────────▼─────────────────────────────────┐
│ Backend (FastAPI, Vultr Tokyo)                  │
│  /auth/profile(昵称/用户名) /auth/password      │
│  /auth/avatar  /stats/notes(按备注聚合)         │
│  Agent: search_transactions 支持 type 参数      │
│  圈子路由/模型/表 删除                          │
└────────────────────────────────────────────────┘
```

## 3. 模块划分

| 模块 | 改动 |
| --- | --- |
| `mobile/src/screens/HomeScreen.tsx` | 结余卡 Animated 吸顶（滚动缩小为窄条） |
| `mobile/src/screens/StatsScreen.tsx` | 新增备注排行榜条形图 + 单备注月度趋势（复用 TrendChart 思路） |
| `mobile/src/screens/ProfileScreen.tsx` | 资料卡增加用户名/密码/头像入口；头像相册选择 |
| `mobile/src/components/AddTransactionSheet.tsx` | 字段重排（金额→备注→日期→分类）、日期选择器、分类选中态样式修复 |
| `mobile/src/api/` | 新增 profile.ts（改用户名/密码）或扩展 auth.ts；stats.ts 增加备注聚合接口；删除 circles.ts |
| `mobile/src/navigation/RootNavigator.tsx` | 移除圈子 3 个 Screen 注册 |
| `mobile/src/screens/circle/` | 整目录删除 |
| `mobile/app.json` / `mobile/android/.../strings.xml` | displayName / app_name → 金流 |
| `mobile/src/screens/LoginScreen.tsx` | 标题 → 金流 |
| `frontend/src/pages/LoginPage.tsx` | 文案「登录后进入双人记账」→ 金流 |
| `backend/app/routers/` | 删除 circles.py；auth.py 增加改用户名/改密码；stats.py 增加按备注聚合接口 |
| `backend/app/models/circle.py`、`schemas/circle.py` | 删除 |
| `backend/app/agent/tools.py` | search/top 工具支持 type 参数；prompts.py 同步 |
| `backend/alembic/` | 新迁移：删圈子表 |
| `backend/tests/` | 圈子相关测试删除/调整；新增按备注聚合、改用户名/密码测试 |

## 4. 数据与接口

### 接口变更

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| DELETE | （无） | 圈子路由整组移除：`/circles/*` |
| PUT | `/auth/profile` | 扩展支持 `username` 字段（可选，唯一性校验）；`nickname` 保持 |
| PUT | `/auth/password` | 新增：`old_password` + `new_password`，验旧密码后更新 |
| POST | `/auth/avatar` | 已有（base64），不变，前端接入相册 |
| GET | `/stats/notes?month=YYYY-MM&target=self\|partner&type=income\|expense` | 新增：按备注聚合金额排行（Top N） |
| GET | `/stats/note-trend?note=&start=YYYY-MM&end=YYYY-MM&target=...` | 新增：某备注的月度收支趋势 |
| POST | `/agent/chat` | 工具层变化（search_transactions 增加 type 参数），接口形态不变 |

### 数据表变更

- 删除 `circle_posts` / `circle_likes` 等圈子相关表（以实际 model 为准），用新 alembic 迁移执行，不修改历史迁移。

## 5. 前端风格

延续 v0.1 风格 C「活力渐变」：主渐变紫 `#8B5CF6 → #EC4899`；浅紫底 `#F7F5FF`；深色底 `#171322`；圆角 16–24、渐变强调色。本轮新增/改动界面组件级说明：

- **结余卡吸顶（Home）**：滚动时卡片高度收缩（完整卡 ≈ 200px → 窄条 ≈ 56px），窄条保留：月份切换 + 「本月结余 ¥金额」，收入/支出 chips 隐藏；渐变背景保留，阴影减弱；动画 200ms，回到顶部自动复原。
- **备注排行榜（Stats）**：新卡片「备注排行」，顶部 SegmentedControl（支出/收入）；条形图横向（备注名 + 金额 + 百分比进度条），点击行进入该备注的月度趋势图（卡片内切换，或二级状态）；空数据展示 EmptyView。
- **备注趋势图（Stats）**：复用 TrendChart 折线样式，收入/支出双线 + 图例；标题「备注「XX」月度趋势」。
- **日期选择器（AddTransactionSheet）**：点击日期行弹出 `@react-native-community/datetimepicker`（Android 默认 spinner/calendar），选择后回填 `YYYY-MM-DD`；移除文本框与今天/昨天 chips。
- **分类选中态（AddTransactionSheet）**：选中态渐变框与卡片对齐（去掉导致缝隙的 borderWidth/width:100% 组合，改为卡片内层绝对填充或背景色覆盖），选中无缝隙。
- **个人资料（Profile）**：资料设置卡新增「修改用户名」「修改密码」入口（复用 InputModal）；「更换头像」改为相册选择（底部 ActionSheet：相册/取消），选中后预览并上传；沿用现有 InfoRow/EntryRow 组件样式。

## 6. 后端设计（白话说明）

- **删除圈子**：后端删除圈子相关的接口、数据表和代码。相当于把整个「圈子」模块从服务器上拆掉，App 里也不再有任何入口。已发的数据表会通过数据库迁移删除（旧数据不可恢复，确认无价值）。
- **按备注统计**：新增两个查询接口——一个把某月所有账单按「备注」分组求和，返回金额排行（支出/收入分别统计）；另一个输入一个备注名和月份范围，返回该备注每月的收入、支出金额，用于画趋势线。都是只读查询，走现有登录鉴权，伴侣视图与我的视图规则一致。
- **修改用户名/密码**：`PUT /auth/profile` 扩展支持改用户名（后端检查是否被占用，占用则报错）；新增 `PUT /auth/password`，必须带旧密码验证通过才能改。改完用户名后，下次登录用新用户名。
- **Agent 查收入**：Agent 的账单查询工具原本写死「只查支出」，这是查不到「股票收益」这类收入账单的原因。改成支持指定收支类型（默认收入支出都查），并在结果里带收支标记，提示词同步说明。

## 7. 部署与环境

- 后端：Vultr Tokyo VPS Docker（api.bookkeeping.neobee.top）；数据库随容器迁移（alembic upgrade head）。
- 前端 Web：Vercel（bookkeeping 项目）。
- OTA 更新：app.xyvora.me 静态托管（info.json + latest.apk）。
- FR-09 加速方案实施后按选定方案调整 DNS/CDN，另行记录。
- 发布：构建 release APK（v2.1.0 / versionCode 210）→ 推送 OTA → 验证。

## 8. 修订记录

| 时间 | 变更说明 |
| --- | --- |
| 2026-08-16 17:24 | 创建架构文档；确定 10 项改动方案与新增接口/依赖 |
| 2026-08-16 17:50 | 记录 FR-09 加速方案调研结论（用户决定暂不实施，方案保留备查，见第 9 章附录） |

## 9. 附录：FR-09 中国大陆访问加速方案（调研结论，暂不实施）

现状：Web 前端部署 Vercel（海外节点直连不稳）；后端 API `api.bookkeeping.neobee.top` 在 Vultr Tokyo VPS（直连延迟一般、无缓存）；OTA 静态托管 `app.xyvora.me`。大陆慢的根因：Vercel 海外节点 + 东京线路质量波动 + 无 CDN 缓存。

| 方案 | 做法 | 提速效果 | 成本 | 备案 | 复杂度 |
| --- | --- | --- | --- | --- | --- |
| A. 腾讯云 EdgeOne 免费版 | 域名接入 EdgeOne，对 Vercel 前端做边缘加速（「EdgeOne+Vercel 双域回源」社区方案），API 一并接入 | 较好（亚太/优选 IP 实测明显改善） | 免费额度内 0 元 | 免备案 | 低-中 |
| B. 自建香港/东京反代 | 在现用 Vultr 或新开香港 VPS 部署 Nginx 反代 + 缓存，DNS 指向反代 | 最好最可控（香港到大陆 30-80ms） | 复用现有 VPS 0 元 / 新开约 ¥35-70/月 | 免备案 | 中 |
| C. Cloudflare 免费版 | 域名接入 CF 开代理 | 不稳定（大陆无节点，常更慢；需优选 IP 且易失效） | 0 元 | 免备案 | 中-高 |
| D. 国内云 + ICP 备案 | 迁至阿里云/腾讯云国内节点 | 最优 | 较高 | 需备案（1-2 周） | 高 |

推荐优先级：A > B > C；D 除非长期重度使用不建议。用户 2026-08-16 决定**暂不实施**，方案保留，后续可随时按此表选择实施。
