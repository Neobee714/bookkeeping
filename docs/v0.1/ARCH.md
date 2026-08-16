# 架构文档：Bookkeeping 原生 Android APP 重构 v0.1

- 创建时间：2026-08-15 22:10
- 版本：v0.1
- 状态：已确认（前端风格待定）

## 1. 技术栈与选型

| 层面 | 技术 | 选型理由 |
| --- | --- | --- |
| 移动端框架 | React Native（最新稳定版）+ TypeScript 严格模式 | 与现有 React 前端同生态，可复用类型定义与 API 层设计，团队上手成本低 |
| 导航 | React Navigation（底部 Tab + 原生栈） | RN 事实标准，支持底部 Tab（APP 主框架）与栈式页面跳转 |
| 状态管理 | Zustand | 与现有 Web 端一致，轻量无样板 |
| 网络请求 | Axios（拦截器实现 Token 自动刷新） | 与现有 Web 端一致，可平移拦截器逻辑 |
| 安全存储 | react-native-keychain（或 EncryptedStorage） | Token 不落明文 |
| 本地存储 | AsyncStorage | 缓存用户资料/主题等非敏感数据 |
| UI 组件 | 自研轻量组件 + 图标库（react-native-vector-icons / 或自定义 SVG） | 避免引入过重 UI 框架，风格可控 |
| 图表 | react-native-svg + 轻量图表实现（或 victory-native） | 统计趋势图/饼图 |
| 数据获取 | TanStack Query（可选，如需要）或直接 axios + store | 视复杂度决定，优先简单方案 |
| 构建 | Android Gradle（AGP），minSdk 24 | 仅 Android 目标 |

## 2. 系统架构

```
┌──────────────────────────────┐         HTTPS          ┌──────────────────────────────┐
│   React Native Android APP    │  ───────────────────▶  │  现有 FastAPI 后端(不变)      │
│                              │       REST JSON        │  PostgreSQL + JWT 鉴权        │
│  screens / components /       │  ◀───────────────────  │  /auth /transactions /stats  │
│  stores / api(axios+拦截器)   │                        │  /budget /savings /circles   │
│                              │                        │  /agent /app_updates /users   │
└──────────────────────────────┘                        └──────────────────────────────┘
```

- 客户端**只消费现有 REST API**，后端零改动。
- 鉴权：登录拿 access/refresh token → 持久化到安全存储 → 请求拦截器自动附带 → 401 时用 refresh token 换新 → 刷新失败则登出。
- 全部功能在线；网络错误统一转成友好提示。

## 3. 模块划分

| 模块 | 职责 | 依赖 |
| --- | --- | --- |
| src/api | 各资源 API 封装（auth/transactions/categories/stats/budget/savings/circles/agent/admin）+ 统一 client(axios 拦截器) | axios, types |
| src/types | 与后端对齐的类型定义（从现有 Web 端平移） | — |
| src/store | authStore / themeStore / billingCycleStore 等 | zustand, api |
| src/navigation | 底部 Tab（首页/统计/AI/预算/我的）+ 栈路由（登录、注册、分类管理、圈子、管理后台等） | React Navigation |
| src/screens | 各页面（Home/Stats/Agent/Plan/Categories/Profile/Login/Register/AdminUsers/Circle…） | components, store, api |
| src/components | 通用组件（交易卡片、金额输入、分类选择、图标选择、弹窗、加载/空/错误态等） | theme, types |
| src/theme | 配色、字体、间距、明暗主题 | — |

## 4. 数据与接口

数据模型：直接沿用后端结构（`User / Transaction / Budget / SavingsGoal / Circle / Post / MonthlySummary / TrendPoint / AgentChatMessage…`），类型定义以现有 `frontend/src/types/index.ts` 为基准平移并补充圈子相关类型。

接口清单（全部为现有后端接口，客户端只调用）：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | /auth/register, /auth/login, /auth/refresh, /auth/logout | 认证 |
| GET | /auth/me | 当前用户 |
| GET/POST/PUT/DELETE | /transactions | 交易 CRUD |
| GET | /transactions/partner | 伙伴交易 |
| POST | /transactions/import | 批量导入 |
| GET/POST/PUT/DELETE | /categories | 分类管理 |
| GET | /budget/monthly-summary | 月度预算汇总 |
| GET/POST/PUT/DELETE | /budget | 预算 CRUD |
| GET/POST/PUT/DELETE | /savings | 储蓄目标 CRUD |
| GET | /stats/monthly-summary, /stats/partner-summary, /stats/trend | 统计 |
| POST | /agent/chat | AI 助手对话 |
| GET/POST | /circles（含 invite/join/leave/apply/posts/ratings/comments） | 双人圈子 |
| GET/PUT/DELETE | /users（admin） | 用户管理（管理员） |

（完整路径以后端 routers 为准，编码时逐一核对。）

## 5. 前端风格

**已确认：风格 C「活力渐变」**（用户于 2026-08-15 22:33 选定）。

- 风格基调：年轻活力、热情有趣、视觉冲击强。
- 配色：主渐变紫 `#8B5CF6 → 粉 #EC4899`；浅紫底 `#F7F5FF`；白色大圆角卡片（18–24px）；收入绿 / 支出红沿用；选中态用渐变。
- 组件偏好：大按钮、渐变 FAB（右下角 60px）、分类宫格选中渐变、AI 气泡（用户渐变底 + AI 白底）、渐变字 Logo、emoji 图标点缀。
- 导航：底部 4–5 Tab（首页/图表/流金/规划/我的，与现有 Web 端对齐）。
- 避免：低饱和暗色大面积、小圆角硬朗卡片、纯黑白极简。
- 原型文件：`docs/v0.1/prototypes/style-c-gradient.html`（5 屏 + 组件规格）。

## 5.1 移动端工程布局

- RN 工程目录：项目根下新建 `mobile/`（与现有 `frontend/` Web 工程并存，互不干扰）。
- 页面结构对齐现有 Web 端路由：Login / Register / Home / Stats / Agent / Plan / Categories / Profile / AdminUsers + Circle 相关。

## 6. 后端设计

**无需改动**。白话说明：

- **数据库**：后端已建好"用户表、账单表、分类表、预算表、储蓄表、圈子表"等，相当于已经整理好的抽屉柜，我们只管取用。
- **接口**：像"服务员点菜"——APP 喊菜名（请求），后端出菜（JSON 响应）。现有接口已覆盖全部功能。
- **鉴权**：门禁卡机制——登录发卡（Token），之后每次请求刷卡；卡过期自动换新卡。
- 唯一需要客户端配合的点：**API 基础地址配置**（开发连本地/测试服务器，正式连线上域名），通过配置文件区分，不改后端。

## 7. 部署与环境

- 开发：RN 工程运行于 Android 模拟器/真机，通过 Metro 调试；API 指向本地或线上。
- 构建：`cd android && ./gradlew assembleRelease` 产出 APK；release 签名使用正式 keystore。
- 环境配置：`.env`/配置文件区分 `API_BASE_URL`（开发/生产）。
- 后端部署不变（VPS Docker / 线上域名），CORS 已允许移动端场景（移动端原生请求无 CORS 限制，但需确认后端允许的 Host 即可）。

## 8. 修订记录

| 时间 | 变更说明 |
| --- | --- |
| 2026-08-15 22:10 | 创建架构文档；确定 RN+TS / 仅 Android / 后端不变 / 在线 / 无推送的技术方案 |
| 2026-08-15 22:33 | 前端风格确认：用户选定风格 C「活力渐变」；新增 5.1 移动端工程布局（mobile/ 目录） |
