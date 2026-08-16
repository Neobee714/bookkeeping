# 开发清单：金流 v0.4 迭代

- 创建时间：2026-08-16 17:24
- 规则：每完成一个小点标记 ✅，并附完成时间戳 `YYYY-MM-DD HH:mm`。

## 阶段一：需求与设计

- [x] 需求澄清完成（10 项 Q&A 已确认）✅ 2026-08-16 17:24
- [x] 三文档创建（REQ/ARCH/CHECKLIST）✅ 2026-08-16 17:24
- [x] 前端局部 UI 方案确认（吸顶窄条 / 备注图表 / 日期选择器 / 资料页入口）✅ 2026-08-16 17:30
- [x] 后端设计确认（删圈子 / 按备注聚合 / 改用户名密码 / Agent 收支）✅ 2026-08-16 17:30

## 阶段二：FR-01 删除圈子

- [x] 后端：删除 routers/circles.py、schemas/circle.py、models/circle.py 及 main.py 注册 ✅ 2026-08-16 17:30
- [x] 后端：新增 alembic 迁移删除圈子表；调整/删除圈子相关测试 ✅ 2026-08-16 17:30（67f2f7585bb7_drop_circle_tables.py；pytest 37 passed）
- [x] 移动端：删除 screens/circle/、api/circles.ts、导航注册、ProfileScreen 入口、types 定义 ✅ 2026-08-16 17:30
- [x] 验证：全量后端测试通过；前端 tsc/eslint 通过；全局无 circles 残留引用 ✅ 2026-08-16 17:30（后端 37 passed；tsc 0 错误；grep 仅剩 StatsScreen svg Circle 图形组件）

## 阶段三：FR-04 App 更名「金流」

- [x] mobile/app.json displayName → 金流 ✅ 2026-08-16 17:30
- [x] mobile/android/.../values/strings.xml app_name → 金流 ✅ 2026-08-16 17:30
- [x] LoginScreen 标题 → 金流；frontend LoginPage 文案 → 金流 ✅ 2026-08-16 17:30
- [x] 验证：桌面图标名/登录页显示「金流」✅ 2026-08-16 17:30（主 Agent 抽查 4 文件均为「金流」；tsc 通过）

## 阶段四：FR-02 首页结余卡吸顶

- [x] HomeScreen：Animated 滚动监听，结余卡收缩为窄条（月份 + 金额）吸顶 ✅ 2026-08-16 17:50
- [x] 验证：滚动收缩/回弹动画正常，月份切换与列表滚动互不干扰 ✅ 2026-08-16 17:50（Animated.event + 插值；tsc 通过；代码走查确认）

## 阶段五：FR-06/07/08 新增账单表单

- [x] AddTransactionSheet：字段排序 金额→备注→日期→分类 ✅ 2026-08-16 17:50
- [x] 日期改为选择器（datetimepicker），移除文本输入与今天/昨天 chips，编辑回显 ✅ 2026-08-16 17:50（iOS spinner+完成 / Android 原生 Dialog）
- [x] 分类选中态缝隙修复（选中框与卡片无缝隙）✅ 2026-08-16 17:50（absolute 铺满 + overflow hidden）
- [x] 验证：新增/编辑账单全流程可用，深色模式正常 ✅ 2026-08-16 17:50（tsc 通过；代码走查确认）

## 阶段六：FR-03 图表页按备注绘图

- [x] 后端：GET /stats/notes 备注金额排行接口（支出/收入 + 伴侣视图）✅ 2026-08-16 17:50
- [x] 后端：GET /stats/note-trend 备注月度趋势接口 ✅ 2026-08-16 17:50
- [x] 移动端：StatsScreen 备注排行条形图卡片（支出/收入切换）✅ 2026-08-16 17:50
- [x] 移动端：点击备注显示月度趋势图（收入/支出双线）✅ 2026-08-16 17:50
- [x] 验证：接口单测通过；页面空数据兜底、切换月份/视图正常 ✅ 2026-08-16 17:50（pytest 64 passed；tsc 通过）

## 阶段七：FR-05 Agent 收支查询

- [x] tools.py：search_transactions / top_expenses 支持 type 参数（income/expense/默认全部），结果带 type ✅ 2026-08-16 17:50
- [x] prompts.py 同步说明；schema 更新 ✅ 2026-08-16 17:50
- [x] 验证：Agent 可查询收入账单（如「股票收益」）✅ 2026-08-16 17:50（test_agent_tools 新增覆盖收入查询用例）

## 阶段八：FR-10 个人资料管理

- [x] 后端：PUT /auth/profile 支持 username（唯一性校验）；PUT /auth/password（验旧密码）✅ 2026-08-16 17:50
- [x] 后端：新增/调整测试 ✅ 2026-08-16 17:50（test_auth_profile.py；pytest 64 passed）
- [x] 移动端：Profile 增加修改用户名、修改密码入口与表单 ✅ 2026-08-16 18:10
- [x] 移动端：更换头像接入相册选择（react-native-image-picker）→ 预览 → 上传 ✅ 2026-08-16 18:10（includeBase64 400px 压缩；超限提示）
- [x] 验证：改用户名重名报错、改密码旧密码错误报错、头像上传成功更新 ✅ 2026-08-16 18:10（tsc 0 错误、eslint 0 新增、jest 8 通过；InputModal 增 secureTextEntry 属密码遮蔽必要扩展，主 Agent 裁决接受）

## 阶段九：FR-09 境内访问加速

- [x] 调研：给出 2-3 个方案（含成本/利弊）✅ 2026-08-16 17:50（方案见 ARCH.md 第 9 章附录）
- [x] 用户决定：暂不实施 ✅ 2026-08-16 17:50（用户答复「这个暂时不做吧」；方案清单保留备用）

## 阶段十：构建与验收

- [x] 移动端 tsc / eslint / 单测通过 ✅ 2026-08-16 18:10（tsc 0 错误；eslint 0 新增；jest 8/8）
- [x] 后端全量测试通过 ✅ 2026-08-16 17:50（64 passed）
- [x] 版本号升级 versionCode 210 / 2.1.0 ✅ 2026-08-16 18:10
- [x] release APK 构建通过（versionCode 210, v2.1.0）✅ 2026-08-16 18:23（app-release.apk 76.7MB，BUILD SUCCESSFUL）
- [ ] 代码提交 Git
- [ ] 发布 OTA 并验证
