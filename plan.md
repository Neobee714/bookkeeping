好，需求已经很清晰了！货币我默认人名币并支持美元，两个用户昵称默认「我」和「洗衣粉儿」（可以在设置里改）。app图标使用当前文件夹的logo.png ,下面是完整方案：

---

## 最终技术选型

| 层级 | 技术 | 理由 |
|------|------|------|
| 前端 | React + Vite + TypeScript | 类型安全 |
| UI 库 | shadcn/ui + Tailwind CSS | 组件质量高，高度可定制 |
| 图表 | Recharts | React 生态最佳，API 简单 |
| 移动打包 | Capacitor.js | Web → APK，不换技术栈 |
| 后端 | FastAPI | 你已熟悉 |
| 数据库 | PostgreSQL（Railway） | 结构化数据，Railway 原生支持 |
| 认证 | JWT + Refresh Token | 移动端标准方案 |
| 部署 | Vercel（前端）+ Railway（后端+DB） | 你已有订阅 |

---

## 架构概览

```
前端 (Vercel)              后端 (Railway)
React + Vite ──────────► FastAPI
Capacitor APK             ├── /auth  (登录/注册/刷新)
                          ├── /transactions (CRUD)
                          ├── /budget (预算管理)
                          ├── /savings (储蓄目标)
                          └── /stats (图表数据)
                                │
                           PostgreSQL (Railway)
                           ├── users
                           ├── transactions
                           ├── budgets
                           └── savings_goals
```

---

## 分阶段 Prompts

---

### 阶段 1：项目初始化 + 数据库结构

**交给 AI 的 Prompt：**

**目标：** 搭好前后端脚手架，建立完整的数据库 schema，配置环境变量

```
你正在帮我搭建一个双人记账 App 的基础架构，这是第 1 阶段（共 7 阶段）。

技术栈：
- 前端：React + Vite + TypeScript + Tailwind CSS + shadcn/ui
- 后端：FastAPI + Python
- 数据库：PostgreSQL
- 移动端打包：Capacitor.js（后期使用，本阶段先不配置）

请完成以下任务：

1. 初始化前端项目
   - 使用 `npm create vite@latest frontend -- --template react-ts`
   - 安装 tailwindcss、shadcn/ui、react-router-dom、axios、zustand、recharts
   - 创建目录结构：src/pages/, src/components/, src/api/, src/store/, src/types/

2. 初始化后端项目
   - 创建 backend/ 目录
   - 使用 Poetry 或 pip 管理依赖：fastapi, uvicorn, sqlalchemy, psycopg2-binary, python-jose[cryptography], passlib[bcrypt], alembic, python-dotenv
   - 创建目录结构：app/routers/, app/models/, app/schemas/, app/core/

3. 编写 PostgreSQL 数据库 schema（使用 SQLAlchemy ORM），包含以下表：
   - users(id, username, nickname, password_hash, partner_id, created_at)
   - transactions(id, user_id, amount, type[income/expense], category, note, date, created_at)
   - budgets(id, user_id, category, monthly_limit, year_month, created_at)
   - savings_goals(id, user_id, name, target_amount, current_amount, deadline, created_at)

4. 用 Alembic 生成初始 migration 文件

5. 创建 .env.example 文件，包含：DATABASE_URL, SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES

6. 创建 backend/app/main.py，包含 FastAPI 实例、CORS 配置（允许所有来源，便于开发）

注意：
- 这个阶段只做架构，不实现任何业务逻辑
- 不要写任何前端页面代码
- categories 枚举值：餐饮、交通、日用、娱乐、医疗、教育、购物、收入、其他
```

**完成后确认点：** 能跑 `uvicorn app.main:app --reload`，访问 `/docs` 看到 FastAPI Swagger 页面；前端能跑 `npm run dev`

---

### 阶段 2：后端 API 全部实现

**目标：** 完成所有后端接口，包括认证、账单 CRUD、统计数据、预算、储蓄目标

**交给 AI 的 Prompt：**
```
这是双人记账 App 的第 2 阶段：实现后端所有 API。

延续阶段 1 的代码结构（FastAPI + SQLAlchemy + PostgreSQL）。

请实现以下路由：

1. app/routers/auth.py
   - POST /auth/register — 注册（用邀请码绑定伴侣：用户 A 注册后生成邀请码，用户 B 注册时填入邀请码，完成 partner_id 互绑）
   - POST /auth/login — 返回 access_token + refresh_token
   - POST /auth/refresh — 用 refresh_token 换新 access_token
   - GET /auth/me — 返回当前用户信息（含 partner 信息）

2. app/routers/transactions.py
   - GET /transactions — 获取当前用户账单（支持 month 参数过滤，格式 YYYY-MM）
   - GET /transactions/partner — 获取伴侣账单（需要已绑定伴侣）
   - POST /transactions — 新建账单
   - PUT /transactions/{id} — 修改（只能改自己的）
   - DELETE /transactions/{id} — 删除（只能删自己的）

3. app/routers/stats.py
   - GET /stats/monthly-summary?month=YYYY-MM — 返回：总收入、总支出、结余、各分类支出金额
   - GET /stats/trend?months=6 — 返回近 N 个月的收支趋势数据
   - GET /stats/partner-summary?month=YYYY-MM — 伴侣的月度汇总

4. app/routers/budget.py
   - GET /budget?month=YYYY-MM — 获取当月各分类预算及实际支出
   - POST /budget — 设置某分类预算
   - PUT /budget/{id} — 修改预算

5. app/routers/savings.py
   - GET /savings — 获取所有储蓄目标
   - POST /savings — 新建储蓄目标
   - PUT /savings/{id} — 更新进度或信息
   - DELETE /savings/{id} — 删除

所有路由需要 JWT 认证（除了 /auth/register 和 /auth/login）。
统一返回格式：{"success": true, "data": ..., "message": ""}
错误返回：{"success": false, "data": null, "message": "错误原因"}

注意：partner 查看接口必须验证 partner_id 已绑定，否则返回 403。
```

**完成后确认点：** 在 `/docs` 中能测试所有接口，注册两个用户并互绑伴侣，能查到对方账单

---

### 阶段 3：前端认证 + 基础框架

**目标：** 实现登录/注册页面、路由守卫、全局状态、底部导航

**交给 AI 的 Prompt：**
```
这是双人记账 App 的第 3 阶段：前端认证系统和基础框架。

技术栈：React + Vite + TypeScript + Tailwind CSS + shadcn/ui + zustand + react-router-dom

设计风格：
- 主色调：紫色 #534AB7，亮色 #EEEDFE
- 成功/收入：绿色 #1D9E75
- 支出/警告：红色 #E24B4A
- 背景：白色，次要背景 #F8F7FE
- 圆角：16px（卡片），10px（按钮）
- 无阴影，使用 0.5px 浅色边框

请实现：

1. src/types/index.ts — 定义所有 TypeScript 类型（User, Transaction, Budget, SavingsGoal, ApiResponse 等）

2. src/api/client.ts — axios 实例，配置 baseURL（从环境变量读取），自动在 header 加 Authorization，401 时自动 refresh token

3. src/store/authStore.ts — zustand store，存储 user, accessToken，提供 login/logout/updateUser 方法

4. src/pages/LoginPage.tsx — 登录页，包含用户名 + 密码输入，调用 /auth/login

5. src/pages/RegisterPage.tsx — 注册页，包含用户名、昵称、密码，以及可选的「伴侣邀请码」输入框

6. src/components/Layout.tsx — 主布局，包含底部导航栏（4 个 tab：首页、图表、规划、我的），使用 SVG 图标，不使用第三方图标库

7. src/App.tsx — 配置路由，未登录重定向到 /login，已登录进入 /app/*

8. 底部导航激活状态使用紫色 #534AB7，非激活用灰色，活跃 tab 背景用 #EEEDFE 小圆角块

注意：
- 本阶段只做骨架，页面内容留空（显示页面名称占位即可）
- access_token 存 localStorage，refresh_token 存 localStorage
- 移动端优先，最大宽度 430px 居中
```

**完成后确认点：** 能登录、注册，登录后看到底部导航，退出后跳回登录页

---

### 阶段 4：首页 + 账单记录功能

**目标：** 实现首页卡片、账单列表、新增/编辑账单弹窗

**交给 AI 的 Prompt：**
```
这是双人记账 App 的第 4 阶段：首页和账单功能。

延续阶段 3 的代码，实现 src/pages/HomePage.tsx 和相关组件。

首页布局（从上到下）：
1. 顶部栏：左侧用户头像 + 昵称，右侧当前月份（可左右切换）
2. 月度汇总卡片（紫色背景 #534AB7，白色文字）：
   - 大字显示「本月支出」
   - 下方两列：本月收入 / 本月结余
3. 账单列表（按日期分组）：
   - 每条显示：分类 emoji 图标、名称、备注、日期、金额（收入绿色+，支出红色-）
   - 右滑删除（使用 CSS transition 模拟，或长按显示删除按钮）
4. 右下角浮动按钮（紫色圆角方块）：点击打开新增弹窗

新增/编辑弹窗（bottom sheet 样式，从底部滑出）包含：
- 收入/支出 Tab 切换
- 金额输入（大字，数字键盘风格）
- 分类选择（图标网格：餐饮🍜 交通🚇 日用🛒 娱乐🎮 医疗💊 教育📚 购物🛍️ 收入💰 其他📌）
- 日期选择（默认今天）
- 备注输入（可选）
- 确认按钮

请同时实现：
- src/api/transactions.ts — 封装账单相关 API 调用
- src/components/TransactionItem.tsx — 单条账单组件
- src/components/AddTransactionSheet.tsx — 新增/编辑弹窗组件

注意：
- 金额输入只允许数字和小数点
- 新增成功后刷新列表
- 加载中显示骨架屏（灰色占位条）
```

**完成后确认点：** 能新增账单、看到列表、删除账单，月度汇总数字正确

---

### 阶段 5：图表页

**目标：** 实现支出分类饼图、趋势折线图、与伴侣的对比

**交给 AI 的 Prompt：**
```
这是双人记账 App 的第 5 阶段：图表分析页。

在 src/pages/StatsPage.tsx 中实现以下内容，使用 Recharts 库。

页面布局（从上到下）：

1. 顶部：月份切换器 + 「我 / 伴侣」Tab 切换
   - 切换后重新加载对应数据

2. 本月数据卡片（2列网格）：
   - 总支出（红色）、总收入（绿色）、结余（紫色）、记录笔数（灰色）

3. 分类支出饼图（PieChart + Legend）：
   - 颜色对应各分类（固定颜色映射）
   - 中心显示总支出金额

4. 近6个月收支趋势（LineChart）：
   - 两条线：收入（绿色）、支出（红色）
   - X轴显示月份，Y轴显示金额

5. 本月分类支出排行（横向条形列表，不用图表库）：
   - 每行：分类名、进度条（紫色填充）、金额
   - 按金额从高到低排列

请同时实现：
- src/api/stats.ts — 封装统计 API 调用
- 图表颜色配置：餐饮#534AB7 交通#1D9E75 日用#EF9F27 娱乐#D4537E 医疗#378ADD 教育#639922 购物#BA7517 其他#888780

注意：
- 切换「伴侣」Tab 时，如果未绑定伴侣，显示「还没有绑定伴侣」提示
- 所有数字使用 toLocaleString() 格式化
- Recharts 图表高度：饼图 220px，折线图 200px
```

**完成后确认点：** 能看到饼图和趋势图，切换月份数据更新，切换「伴侣」Tab 显示对方数据

---

### 阶段 6：规划页 + 我的页

**目标：** 实现预算管理、储蓄目标、个人设置、邀请伴侣功能

**交给 AI 的 Prompt：**
```
这是双人记账 App 的第 6 阶段：规划页和个人中心。

1. src/pages/PlanPage.tsx — 规划页，包含两个 Tab：

Tab 1「预算」：
- 顶部显示本月总预算使用情况（已用/总额 进度条）
- 各分类预算卡片：分类名、预算金额、已花金额、进度条
  - 进度 < 80% 紫色，80~100% 橙色，> 100% 红色（超支提示）
- 右下角加号按钮 → 弹窗设置/编辑某分类预算

Tab 2「储蓄」：
- 储蓄目标卡片列表，每张卡片显示：
  - 目标名称（如「买 MacBook」）
  - 目标金额、当前金额
  - 圆形进度环（用 SVG 手写，不用库）
  - 预计完成日期
- 长按卡片 → 更新当前存入金额
- 右下角加号 → 新建储蓄目标弹窗

2. src/pages/ProfilePage.tsx — 个人中心：
- 顶部：头像（首字母圆形）、昵称、用户名
- 「我的伴侣」区块：
  - 已绑定：显示伴侣昵称 + 头像
  - 未绑定：显示「邀请码：XXXXXX」（从 /auth/me 获取）+ 复制按钮，以及「输入对方邀请码」输入框 + 绑定按钮
- 货币设置（目前只有 NT$，预留 UI）
- 退出登录按钮（红色文字）

注意：
- 储蓄目标的圆形进度环用 SVG stroke-dasharray 实现
- 预算超支时进度条变红并显示「超支 NT$ XXX」
- 所有弹窗使用 bottom sheet 样式（和阶段 4 保持一致）
```

**完成后确认点：** 能设置预算、创建储蓄目标、查看伴侣绑定状态、生成邀请码

---

### 阶段 7：部署配置 + APK 打包

**目标：** 配置 Vercel / Railway 部署，打包 Android APK

**交给 AI 的 Prompt：**
```
这是双人记账 App 的第 7 阶段：部署和打包。

1. 后端 Railway 部署配置：
   - 创建 backend/Dockerfile（Python 3.11-slim 基础镜像）
   - 创建 backend/railway.toml，指定启动命令：uvicorn app.main:app --host 0.0.0.0 --port $PORT
   - 确保 CORS 允许来自 Vercel 域名和 capacitor://localhost

2. 前端 Vercel 部署配置：
   - 创建 vercel.json，配置 build 命令和输出目录
   - 创建 frontend/.env.production，VITE_API_URL 指向 Railway 后端域名

3. Capacitor APK 打包配置：
   在 frontend/ 目录执行以下步骤（生成完整命令和配置）：
   - npm install @capacitor/core @capacitor/cli @capacitor/android
   - npx cap init "记账本" "com.neobee.bookkeeping"
   - 修改 capacitor.config.ts：
     - appId: "com.neobee.bookkeeping"
     - appName: "记账本"
     - webDir: "dist"
     - server.url 在开发时指向本地，生产时注释掉（使用打包的 Web 资源）
   - 创建 npx cap add android
   - 创建 scripts/build-apk.sh：自动执行 npm run build → npx cap sync → cd android → ./gradlew assembleRelease

4. 在 backend/app/main.py 的 CORS 配置中添加：
   - https://bookkeeping.neobee.top
   - capacitor://localhost
   - http://localhost（开发用）

5. 创建完整的 README.md，包含本地开发、Railway 部署、Vercel 部署、打包 APK 的完整步骤

注意：
- APK 打包需要本地安装 Android Studio，README 中说明这个前置条件
- 生产 APK 的 API_URL 在 capacitor.config.ts 的 server 里无法动态设置，
  需要确认 VITE_API_URL 在 build 时已正确写入
- Railway 的 PostgreSQL 连接字符串格式：postgresql://user:pass@host:port/db
```

**完成后确认点：** Railway 后端部署成功、Vercel 前端可访问、本地能打包出 APK 并安装到手机

---

**总计 7 个阶段，建议顺序执行，每个阶段完成测试再进入下一个。** 有任何阶段卡住随时来问我，特别是阶段 7 的 APK 打包环节坑比较多，我帮你排查。