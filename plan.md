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

### 阶段 8：添加鲨鱼导入

在现有的双人记账 App 中，为「我的」页面添加「导入历史账单」功能，
支持导入「鲨鱼记账」导出的 CSV 格式。

一、CSV 格式说明
文件编码：GBK（必须用 GBK 解码，否则中文乱码）
列顺序：日期, 收支类型, 类别, 金额, 备注
日期格式：YYYY年MM月DD日（例：2026年01月21日）
收支类型值：支出 / 收入
金额：字符串数字（如 "21" 或 "455.67"）

二、后端：新增导入接口

在 backend/app/routers/transactions.py 中添加：

POST /transactions/import
- 接受 multipart/form-data，字段名为 file
- 用 Python 内置 csv 模块 + encoding='gbk' 解析文件
- 日期解析：用 datetime.strptime(date_str, "%Y年%m月%d日")
- 类别映射规则（鲨鱼分类 → app分类）：
    餐饮 → 餐饮
    零食 → 餐饮
    交通 → 交通
    水 → 日用
    洗衣澡 → 日用
    理发 → 日用
    娱乐 → 娱乐
    游戏 → 娱乐
    医疗 → 医疗
    学习 → 教育
    购物 → 购物
    礼物 → 购物
    旅游 → 其他
    工资 → 收入
    其他 → 其他
    其它 → 其他
    （所有未匹配分类 → 其他）
- 收支类型映射：支出 → expense，收入 → income
- 批量插入到 transactions 表，user_id 为当前登录用户
- 跳过金额无法解析的行（try/except）
- 返回格式：
  {
    "success": true,
    "data": {
      "imported": 182,
      "skipped": 4,
      "skipped_rows": [{"row": 5, "reason": "金额格式错误"}]
    },
    "message": "导入完成"
  }

注意：不做重复检测，直接全量导入；若需防重复可由用户手动删除。

三、前端：导入按钮和交互

在 src/pages/ProfilePage.tsx 的「设置」区块中添加「导入历史数据」入口。

1. 在页面中添加一个列表项：
   - 左侧图标（上传箭头 SVG）+ 文字「导入账单（鲨鱼记账）」
   - 右侧「>」箭头
   - 点击触发隐藏的 <input type="file" accept=".csv" />

2. 在 src/components/ImportModal.tsx 中实现导入流程 UI：
   状态一：选择文件后，显示底部弹窗（bottom sheet），内容：
     - 文件名
     - 「开始导入」按钮（紫色）
     - 「取消」按钮
   状态二：导入中，显示加载动画 + 「正在导入...」文字
   状态三：导入完成，显示结果：
     - 绿色勾 +「成功导入 X 条记录」
     - 若有跳过：灰色文字「跳过 X 条（格式错误）」
     - 「完成」按钮（关闭弹窗并刷新首页账单列表）
   状态四：导入失败，显示红色错误信息 + 「重试」按钮

3. 在 src/api/transactions.ts 中添加：
   export async function importTransactions(file: File) {
     const form = new FormData()
     form.append('file', file)
     return apiClient.post('/transactions/import', form, {
       headers: { 'Content-Type': 'multipart/form-data' }
     })
   }

四、注意事项
- input[type=file] 使用 ref 触发，不直接渲染在页面上（隐藏）
- 文件编码由后端处理，前端只负责传输二进制文件
- 导入完成后调用全局状态更新，触发首页重新拉取账单
- bottom sheet 动画与现有的 AddTransactionSheet 保持一致
- 不要修改已有的任何路由和组件，只添加新代码

### 阶段 9：首页加伴侣 Tab 切换
在现有的双人记账 App 中，修改 frontend/src/pages/HomePage.tsx，
为首页添加「我 / 伴侣」切换 Tab，让用户可以在首页查看伴侣的账单明细。

当前情况：
- StatsPage（图表页）已有「我 / 伴侣」Tab 切换功能，逻辑可参考
- HomePage 目前只展示自己的账单，没有切换入口
- src/api/transactions.ts 中已有 getPartnerTransactions() 函数

需要修改 HomePage.tsx，完成以下内容：

1. 在组件顶部添加 state：
   const [viewMode, setViewMode] = useState<'mine' | 'partner'>('mine')

2. 在月份切换器下方、月度汇总卡片上方，添加「我 / 伴侣」Tab 切换组件：
   - 样式：胶囊形切换，激活项白色背景 + 紫色文字 #534AB7，非激活灰色
   - 背景色用 var(--color-background-tertiary)，圆角 10px
   - 只在 user?.partner_nickname 存在时显示（已绑定伴侣才显示）
   - 伴侣 Tab 的文字显示 user.partner_nickname

3. 修改账单拉取逻辑：
   - 在 useEffect 中，依赖 [viewMode, currentMonth]
   - viewMode === 'mine' 时调用 getTransactions(currentMonth)
   - viewMode === 'partner' 时调用 getPartnerTransactions(currentMonth)

4. 切换 Tab 时，重置账单列表为空并显示加载中状态

5. 月度汇总卡片（总收入/总支出/结余）也要跟着 viewMode 切换对应数据：
   - viewMode === 'mine' 调用 getMonthlySummary(currentMonth)
   - viewMode === 'partner' 调用 getPartnerMonthlySummary(currentMonth)

注意：
- 参考 StatsPage 中已有的 Tab 切换实现，保持 UI 风格完全一致
- 不要修改 StatsPage 或其他任何文件，只改 HomePage.tsx
- viewMode 切换回「我」时，恢复拉取自己的数据
- 伴侣视图下，右下角新增账单的浮动按钮应隐藏（不能替伴侣记账）
完成后确认点： 首页顶部出现「我 / 伴侣」Tab，切换后账单列表和月度汇总均更新为伴侣数据，浮动按钮在伴侣视图下消失

## 阶段 10：「关于记账本」页面
目标： 在「我的」页面添加关于入口，展示版本号、开发者等信息，版本号自动从 package.json 读取
在现有的双人记账 App 中，修改以下文件，添加「关于记账本」功能：

一、修改 frontend/vite.config.ts
在配置中添加自动读取版本号：
  import { readFileSync } from 'fs'
  const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))
在 define 中加入：
  __APP_VERSION__: JSON.stringify(pkg.version)
作用：之后每次只需改 package.json 的 version 字段，版本号自动同步到 App 内。

二、修改 frontend/src/pages/ProfilePage.tsx

1. 在文件顶部添加类型声明：
   declare const __APP_VERSION__: string

2. 添加 state：
   const [showAbout, setShowAbout] = useState(false)

3. 在「退出登录」区块上方，新增「关于记账本」列表项：
   - 样式与页面现有其他列表项完全一致（白色卡片 + 0.5px 边框 + 16px 圆角）
   - 左侧：紫色圆角方块图标（背景 #EEEDFE，内含 info SVG 图标，颜色 #534AB7）+ 文字「关于记账本」
   - 右侧：向右箭头「>」
   - 点击触发 setShowAbout(true)

4. 在 JSX 末尾添加「关于记账本」bottom sheet 弹窗，弹窗内容从上到下：
   - 顶部拖动条（36px 宽，4px 高，居中，灰色）
   - App 图标区域（64×64，圆角 18px，紫色背景 #534AB7，内含白色柱状图 SVG）
   - App 名称「记账本」（18px，500 weight，居中）
   - 副标题「两个人的记账小工具」（13px，灰色，居中）
   - 信息列表卡片（灰色背景，12px 圆角，每行左右布局）：
       当前版本 → `v${__APP_VERSION__}`
       开发者   → Langda
       技术栈   → React + FastAPI
   - 关闭按钮（紫色 #534AB7，白色文字，全宽，圆角 12px，padding 14px）
   - 点击遮罩层或点击关闭按钮均可关闭弹窗

注意：
- bottom sheet 的遮罩层、动画、样式与现有弹窗（AddTransactionSheet / ImportModal）保持完全一致
- 不要修改任何其他文件，只改 ProfilePage.tsx 和 vite.config.ts
- 信息列表中「当前版本」一行要加粗显示版本号值，其余值正常字重
完成后确认点： 「我的」页面出现「关于记账本」入口，点击后 bottom sheet 弹出，版本号显示与 frontend/package.json 中的 version 字段一致，修改 package.json 版本号后重新 build 验证自动同步

## 阶段 11: 个人资料编辑功能
目标： 让用户在「我的」页面能修改昵称，上传并展示头像，头像全局同步显示
这是双人记账 App 的第 11 阶段：个人资料编辑功能。

一、数据库改动
在 backend/app/models/user.py 的 User 模型中新增字段：
  avatar: TEXT（存储 base64 编码的头像图片，可为 null）

用 Alembic 生成并执行 migration：
  alembic revision --autogenerate -m "add avatar to users"
  alembic upgrade head

二、后端新增接口
在 backend/app/routers/auth.py 中新增：

PUT /auth/profile
- 请求体：{ "nickname": "新昵称" }（nickname 可选，1~16字符）
- 更新当前用户的 nickname 字段
- 返回更新后的完整 user 对象

POST /auth/avatar
- 请求体：{ "avatar": "data:image/jpeg;base64,..." }
- 验证 base64 字符串长度不超过 200KB（约 200000 字符）
- 更新当前用户的 avatar 字段
- 返回更新后的完整 user 对象

修改 GET /auth/me 返回值，确保包含 avatar 字段。
修改 partner 信息返回值，也包含 partner 的 avatar 字段。

三、前端改动

1. 修改 src/types/index.ts 中的 User 类型，添加 avatar?: string 字段

2. 修改 src/api/auth.ts，新增：
   export async function updateProfile(nickname: string)
   export async function updateAvatar(base64: string)

3. 修改 src/pages/ProfilePage.tsx：

   头像区域改造（顶部头像圆形）：
   - 已有头像：显示 <img> 标签渲染 base64
   - 无头像：保持原来的首字母圆形
   - 头像右下角加一个小相机图标按钮（紫色圆圈 + 相机SVG）
   - 点击触发隐藏的 <input type="file" accept="image/*" ref={avatarInputRef} />

   头像上传逻辑（在文件选择后触发）：
   - 用 Canvas 将图片压缩到最长边 300px
   - 转成 JPEG base64（quality 0.8）
   - 调用 updateAvatar() 接口上传
   - 上传中显示圆形加载动画覆盖在头像上
   - 上传成功后更新 authStore 中的 user.avatar

   昵称修改：
   - 点击昵称文字旁边的铅笔图标（SVG）进入编辑状态
   - 昵称文字变为 input 输入框（inline 样式，同款字号）
   - 右侧出现「✓ 确认」和「✕ 取消」两个小按钮
   - 确认后调用 updateProfile() 接口，成功后更新 authStore

4. 修改所有使用头像的地方（HomePage 顶部栏、ProfilePage 顶部），
   统一用如下逻辑渲染头像：
   - user.avatar 存在 → <img src={user.avatar} style={{...圆形样式}} />
   - 不存在 → 首字母圆形 div（保持原样）

注意：
- Canvas 压缩逻辑封装到 src/utils/imageUtils.ts 中，函数名 compressImage(file: File): Promise<string>
- 不要修改其他页面的任何功能，只改头像和昵称相关部分
- 更新成功后必须同步更新 zustand authStore 中的 user 对象，确保全局刷新.

完成后确认点： 能上传头像并在首页顶部和「我的」页面显示，能修改昵称并即时生效

## 阶段 12: 双码拆分（注册邀请码 vs 伴侣绑定码）
目标： 将现有邀请码拆分为两个独立的码：控制谁能注册 App 的「注册邀请码」，以及绑定伴侣关系的「绑定码」；之后所有新用户必须凭注册邀请码才能注册
这是双人记账 App 的第 12 阶段：双码系统改造。

背景：
- 现有系统中，「邀请码」用于两个用户互绑伴侣关系（partner_code）
- 新需求：增加「注册邀请码」控制 App 的注册权限，只有被邀请的人才能注册
- 两个码职责完全不同，命名和逻辑需要分开

一、数据库改动
在 User 模型中：
- 将现有的 invite_code 字段重命名为 partner_code（用于绑定伴侣，逻辑不变）
- 新增 reg_invite_code: VARCHAR(8)（该用户可分享给别人用于注册的邀请码，注册时自动生成，唯一）
- 新增 invited_by: INTEGER FK→users.id（记录是谁邀请注册的，可为 null 代表创始人）

用 Alembic 生成并执行 migration。

二、后端改动

1. 修改 backend/app/core/config.py（或 .env），新增环境变量：
   FOUNDER_INVITE_CODE=NEOBEE2025
   这是第一个用户注册时使用的特殊邀请码，硬编码到环境变量，绕过邀请校验。

2. 修改 POST /auth/register：
   请求体新增必填字段 reg_invite_code（注册邀请码）
   注册逻辑：
   a. 先校验 reg_invite_code：
      - 如果等于环境变量中的 FOUNDER_INVITE_CODE → 允许注册（创始人通道）
      - 否则在 users 表中查找 reg_invite_code 字段匹配的用户 → 找到则允许注册
      - 找不到 → 返回 400，message: "邀请码无效"
   b. 注册成功后，为新用户自动生成唯一的 reg_invite_code（8位大写字母+数字随机串）
   c. 如果注册时同时填了 partner_code，则仍然处理伴侣绑定（逻辑不变）

3. 修改 GET /auth/me 返回值，包含：
   - partner_code（绑定伴侣用）
   - reg_invite_code（邀请他人注册用）

4. 新增 POST /auth/bind-partner：
   - 请求体：{ "partner_code": "XXXXXX" }
   - 用于已注册用户事后绑定伴侣（解耦注册和绑定）
   - 逻辑与原注册时绑定相同

三、前端改动

1. 修改 src/pages/RegisterPage.tsx：
   - 新增「注册邀请码」输入框（必填，placeholder: "请输入邀请码"）
   - 将原来的「伴侣邀请码」输入框改为「伴侣绑定码」（可选，placeholder: "可选，稍后绑定"）
   - 两个输入框用分割线或标题分开，注明用途区别

2. 修改 src/pages/ProfilePage.tsx 中的「我的伴侣」区块：
   - 显示两个码，分两行：
     「注册邀请码：XXXXXXXX」（分享给想加入的朋友）
     「伴侣绑定码：XXXXXX」（用于和伴侣互绑）
   - 两个码都有「复制」按钮
   - 已绑定伴侣时隐藏伴侣绑定码，只显示注册邀请码

3. 修改 src/api/auth.ts，新增：
   export async function bindPartner(partnerCode: string)

注意：
- partner_code 的生成和绑定逻辑保持原有实现不变，只是字段名从 invite_code 改为 partner_code
- 前端 User 类型中同步更新字段名
- FOUNDER_INVITE_CODE 必须写入 backend/.env.example 和 Railway 环境变量说明
- 不改动任何其他功能
完成后确认点： 用 NEOBEE2025 能注册第一个用户；已有用户的 reg_invite_code 能让新用户注册；ProfilePage 显示两个独立的码

## 阶段 13：圈子后端 API
目标： 建立圈子的完整数据模型和 API，包括建圈、邀请成员、发帖、打分、评论
这是双人记账 App 的第 13 阶段：「圈子」功能后端 API。

一、数据库新增表（使用 SQLAlchemy ORM）

backend/app/models/circle.py，包含以下模型：

1. Circle（圈子）
   - id: INTEGER PK
   - name: VARCHAR(30)
   - description: VARCHAR(100) nullable
   - creator_id: INTEGER FK→users.id
   - created_at: DATETIME

2. CircleMember（圈子成员）
   - id: INTEGER PK
   - circle_id: INTEGER FK→circles.id
   - user_id: INTEGER FK→users.id
   - joined_at: DATETIME
   - 联合唯一约束：(circle_id, user_id)

3. CircleInviteCode（圈子邀请码）
   - id: INTEGER PK
   - circle_id: INTEGER FK→circles.id
   - code: VARCHAR(8) UNIQUE
   - created_by: INTEGER FK→users.id
   - used_by: INTEGER FK→users.id nullable（已使用则记录）
   - created_at: DATETIME

4. Post（帖子）
   - id: INTEGER PK
   - circle_id: INTEGER FK→circles.id
   - user_id: INTEGER FK→users.id
   - content: TEXT nullable（文字内容）
   - image: TEXT nullable（base64 图片，限制应用层 < 500KB）
   - created_at: DATETIME

5. PostRating（打分）
   - id: INTEGER PK
   - post_id: INTEGER FK→posts.id
   - user_id: INTEGER FK→users.id
   - score: FLOAT（0.0 ~ 10.0）
   - created_at: DATETIME
   - 联合唯一约束：(post_id, user_id)（每人每帖只能打一次）

6. PostComment（评论）
   - id: INTEGER PK
   - post_id: INTEGER FK→posts.id
   - user_id: INTEGER FK→users.id
   - content: TEXT
   - created_at: DATETIME

生成并执行 Alembic migration。

二、后端新增路由 backend/app/routers/circles.py

所有接口需要 JWT 认证。

圈子管理：
- POST /circles — 创建圈子（仅限 creator，通过环境变量 CIRCLE_CREATOR_USERNAME 指定唯一创建者用户名）
- GET /circles — 获取当前用户加入的所有圈子（含自己创建的）
- GET /circles/{id} — 获取圈子详情（需是成员）
- POST /circles/{id}/invite — 生成圈子邀请码（仅圈主可操作），返回 code
- POST /circles/join — 加入圈子，请求体 { "code": "XXXXXXXX" }

帖子：
- GET /circles/{circle_id}/posts — 获取圈子帖子列表（按时间倒序，分页：page/page_size）
  返回每条帖子时包含：用户信息、平均评分、评分人数、最新3条评论预览
- POST /circles/{circle_id}/posts — 发帖
  请求体：{ "content": "...", "image": "base64..." }（content 和 image 至少有一个）
  image base64 长度超过 600000 字符时拒绝，返回 400
- DELETE /circles/{circle_id}/posts/{post_id} — 删除帖子（只能删自己的，或圈主可删任意）

打分：
- POST /posts/{post_id}/rate — 打分，请求体 { "score": 8.5 }
  score 范围 0~10，超出返回 400
  同一用户对同一帖子已打分则更新（upsert）
- GET /posts/{post_id}/ratings — 获取该帖所有打分详情

评论：
- GET /posts/{post_id}/comments — 获取评论列表（按时间正序）
- POST /posts/{post_id}/comments — 发评论，请求体 { "content": "..." }
- DELETE /comments/{comment_id} — 删除评论（只能删自己的）

在 backend/app/main.py 中注册新路由：
  app.include_router(circles_router, prefix="/api/v1", tags=["circles"])

新增环境变量 CIRCLE_CREATOR_USERNAME 到 .env.example，用于限制建圈权限。

注意：
- 所有返回用户信息的接口，同时返回 nickname 和 avatar 字段
- 分页默认 page=1, page_size=20
- 不对图片做服务端处理，只做大小校验
完成后确认点： Swagger 中能创建圈子、生成邀请码、用邀请码加入、发帖、打分、评论，所有权限校验正确

## 阶段 14：圈子前端页面
目标： 实现完整的圈子 UI，包括帖子流、发帖弹窗、打分交互、评论列表
这是双人记账 App 的第 14 阶段：「圈子」功能前端页面。

一、底部导航改造
修改 src/components/Layout.tsx，将底部导航从 4 个 Tab 改为 5 个：
  首页 | 图表 | 圈子（新增，中间位置，图标用气泡/聊天SVG）| 规划 | 我的
圈子 Tab 对应路由 /app/circle

二、新增文件清单
- src/pages/CirclePage.tsx — 圈子主页面
- src/components/PostCard.tsx — 单条帖子卡片组件
- src/components/PostDetailSheet.tsx — 帖子详情 bottom sheet（含完整评论列表）
- src/components/NewPostSheet.tsx — 发帖 bottom sheet
- src/api/circles.ts — 封装所有圈子相关 API 调用

三、src/api/circles.ts 封装以下函数：
  getMyCircles()
  getCirclePosts(circleId, page)
  createPost(circleId, content, image?)
  deletePost(circleId, postId)
  ratePost(postId, score)
  getPostComments(postId)
  addComment(postId, content)
  deleteComment(commentId)
  generateInviteCode(circleId)
  joinCircle(code)

四、CirclePage.tsx 页面结构

状态 A：未加入任何圈子
- 居中显示：圈子图标 + 「还没有加入圈子」文字
- 「输入邀请码加入」输入框 + 按钮
- 若当前用户是 CIRCLE_CREATOR_USERNAME 对应的用户，额外显示「创建圈子」按钮

状态 B：已加入圈子，显示帖子流
- 顶部栏：圈子名称 + 右上角「邀请」按钮（仅圈主显示）
- 帖子列表（垂直滚动，上拉加载更多）
- 右下角浮动发帖按钮（紫色圆角方块，+ 图标）

五、PostCard.tsx 组件结构（每条帖子）

卡片内容（从上到下）：
1. 顶部：用户头像（圆形，有头像显示图片否则首字母）+ 昵称 + 发帖时间（相对时间：刚刚/X分钟前/X小时前/X天前）
2. 图片（如有）：圆角 12px，宽度 100%，点击查看大图
3. 文字内容（如有）：14px，行高 1.6
4. 底部操作栏：
   左侧：💬 评论数（点击打开 PostDetailSheet）
   右侧：打分区域
     - 已打分：显示「你给了 X 分」（紫色）+ 平均分「均分 X.X」（灰色）
     - 未打分：显示「均分 X.X」+ 「打分」按钮
     - 点击「打分」弹出 0~10 的半分滑块（Slider）

打分滑块交互（inline，不用弹窗）：
- 点击「打分」后，卡片底部展开一个滑块行
- 滑块范围 0~10，step=0.5，默认值 8
- 右侧显示当前分数（大字，紫色）
- 「确认」按钮提交，提交后立即更新卡片显示

六、NewPostSheet.tsx 发帖弹窗（bottom sheet）

内容从上到下：
- 拖动条
- 标题「新帖子」
- 图片选择区域：点击添加图片（最多1张），用 Canvas 压缩到最长边 800px，JPEG quality 0.75
  已选图片显示缩略图 + 右上角 × 删除
- 文字输入框（多行，placeholder: "分享今天的美食..."，最大 200 字）
- 字数计数器（右下角，灰色，如 「42/200」）
- 发布按钮（紫色，发布中显示加载状态）

七、PostDetailSheet.tsx 帖子详情（bottom sheet）

- 顶部：完整帖子内容（图片 + 文字）
- 评分汇总：平均分（大字）+ 参与人数
- 分割线 + 「评论」标题
- 评论列表：头像 + 昵称 + 内容 + 时间，自己的评论长按可删除
- 底部固定输入栏：输入框 + 发送按钮（发送后追加到列表末尾）

八、时间格式化工具
新增 src/utils/timeUtils.ts：
  export function relativeTime(dateStr: string): string
  逻辑：< 1分钟 → 「刚刚」，< 60分钟 → 「X分钟前」，< 24小时 → 「X小时前」，否则 → 「X天前」

注意：
- 整体风格与现有页面保持一致（紫色主色，白色卡片，0.5px 边框）
- 图片上传用 compressImage() 函数（阶段11已封装在 src/utils/imageUtils.ts）
- 所有 bottom sheet 动画与现有弹窗保持一致
- 发帖后自动刷新帖子列表，评论后更新评论数
- 不修改任何已有页面和组件，只新增文件 + 改 Layout.tsx
完成后确认点： 底部导航出现「圈子」Tab；用邀请码能加入圈子；能发图文帖；能滑动打分；能评论；帖子流上拉加载更多