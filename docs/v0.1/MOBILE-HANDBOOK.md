# 移动端(React Native)联调与交付说明

- 创建时间：2026-08-16 00:30
- 适用范围：`mobile/` RN 工程（双人记账 APP，Android）

## 1. 当前状态

- RN 0.87.0 + TypeScript，全项目 `npx tsc --noEmit` 零错误。
- 全部功能已实现：认证 / 首页账单流 / 记账弹层 / 分类管理 / 统计图表 / 预算 / 储蓄目标 / AI 记账助手 / 双人圈子（帖子/评分/评论）/ 个人页 / 管理后台。
- 后端零改动（FastAPI 原样），已用本地 SQLite 后端冒烟通过（注册→登录→记账→查账）。

## 2. 本地预览（当前配置）

`mobile/src/config.ts` 的 `API_BASE_URL = 'http://10.0.2.2:8000/'`（Android 模拟器访问宿主机专用回环地址）。

### 启动本地后端
```powershell
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000
# 验证: http://127.0.0.1:8000/health
```
数据库为 SQLite（`backend/dev.db`，已有 alice/bob 两个账号；注册新号需用现有账号的注册邀请码，如 ALICE001）。

### 模拟器运行
1. 启动 Android 模拟器（AVD: Pixel_6）。
2. 安装 APK：`adb install mobile\android\app\build\outputs\apk\debug\app-debug.apk`
3. 打开 APP → 注册（邀请码用 ALICE001 等现有账号的码）→ 登录 → 记账。

> 真机预览：手机与电脑连同一 WiFi，把 `config.ts` 的地址改为 `http://<电脑局域网IP>:8000/`，重新构建安装；手机需能访问该 IP。

## 3. 生产部署（上 VPS 后）

1. 把 `mobile/src/config.ts` 的 `API_BASE_URL` 改为线上 HTTPS 域名（如 `https://bookkeeping.neobee.top/`）。
2. 重新构建 APK：
```powershell
cd mobile
npm run build   # 若配置了 build 脚本; 或直接走 gradle
cd android
.\gradlew.bat assembleRelease
```
3. 正式 release 签名：`frontend/android/keystore/bookkeeping-release.keystore` 可用，但口令在环境变量 `BOOKKEEPING_UPLOAD_STORE_PASSWORD / BOOKKEEPING_UPLOAD_KEY_ALIAS / BOOKKEEPING_UPLOAD_KEY_PASSWORD`（当前未设置，需你提供或自行注入后构建）。无签名需求时用 debug APK 即可安装验证。

## 4. 已知遗留（TODO）

| 项 | 说明 |
| --- | --- |
| FR-11 交易导入 | API 层与首页「📥 导入」入口就绪；文件选择依赖 `react-native-document-picker` 未装，接入后调 `transactionsApi.importTransactions` |
| 更换头像 / 发帖配图 | 需装 `react-native-image-picker`，接入 `authApi.updateAvatar` / `createPost.image` |
| 日期选择器 | 当前为 chips + YYYY-MM-DD 输入；可换 `@react-native-community/datetimepicker` |
| 管理员审核圈子申请 | API 层就绪（applications/review），UI 未做，建议后续加入管理后台 |

## 5. 关键文件

- 入口：`mobile/App.tsx`；导航：`mobile/src/navigation/RootNavigator.tsx`
- API 层：`mobile/src/api/`（client 含 token 自动刷新）
- 主题：`mobile/src/theme/colors.ts`（活力渐变：#8B5CF6 → #EC4899）
- 接口依据：`docs/v0.1/API-REFERENCE.md`（注意 circles 前缀 `/api/v1`）

## 6. 模拟器端到端验证记录（2026-08-16 01:10 通过）

**环境**：Pixel_6 AVD + `adb reverse tcp:8000 tcp:8000` + 本地后端（uvicorn 0.0.0.0:8000）。

**验证链路**：注册（smoke4）→ 登录 → 自动登录（重装后仍保持会话）→ 记账（餐饮 -25）→ 首页汇总/列表回显 ✅。后端日志确认 `POST /transactions 200`。

**模拟器连接要点**：本机 AVD 的 10.0.2.2 NAT 曾不通，`adb reverse` 通道最稳（每次重连模拟器后需重新执行 `adb reverse tcp:8000 tcp:8000`）。

**已修复的真实问题**：
1. release 默认禁止明文 HTTP → `AndroidManifest.xml` 已设 `usesCleartextTraffic="true"`（本地联调必需；上生产 HTTPS 不受影响）。
2. 记账弹层确认按钮在部分设备被系统导航条遮挡 → sheet 已加 safe-area 底部 padding（`spacing.xl + max(insets.bottom, 56)`）；内容多时按钮在 ScrollView 内，滚动可见。
3. 首页账单分组顺序颠倒（卡片在上、日期头在下）→ `HomeScreen.tsx` rows 生成逻辑改为按日期 Map 分组，日期分组头在卡片组上方（2026-08-16 01:27 修复并模拟器验证；子 Agent 重构后曾回退，01:40 重新应用）。
4. token 刷新 URL 双斜杠（`//auth/refresh` 404）→ `config.ts` 的 `API_BASE_URL` 去尾斜杠（2026-08-16 01:45 修复）。
5. 用户验收修改（2026-08-16 01:40）：① 首页新增「我的/伴侣」视图切换（伴侣只读，403 提示绑定）；② 账单行删除「我/TA」标记；③ 删除导入功能（入口 + API + 类型）。
