# 架构文档：挖孔屏(灵动岛)状态栏沉浸式适配 v0.3

- 创建时间：2026-08-16 15:52
- 版本：v0.3
- 状态：已确认

## 1. 技术栈与选型

| 层面 | 技术 | 说明 |
| --- | --- | --- |
| 窗口背景 | Android 主题 `windowBackground`（values 浅色 + values-night 深色） | 替代默认白色，edge-to-edge 下状态栏/挖孔区域直接显示主题背景 |
| 挖孔适配 | `windowLayoutInDisplayCutoutMode=shortEdges`（values-v27 变体） | API 27+ 内容/背景延伸到挖孔两侧；低版本自动忽略 |
| 状态栏 | RN `StatusBar`（translucent + transparent） | 沉浸式：状态栏不占色，由页面背景接管；图标颜色按页面切换 |
| 页面背景 | SafeArea 结构调整：外层背景（渐变/主题色）铺满全屏，内层 SafeArea 处理内容安全区 | 渐变/背景延伸到状态栏，内容不被遮挡 |

## 2. 系统架构

```
┌────────────────────────────────────────────┐
│ 窗口(windowBackground 主题色,含挖孔区域)     │  ← 兜底:状态栏背后不再是白色
├────────────────────────────────────────────┤
│ 页面外层背景(铺满全屏,含状态栏):             │
│   登录/注册 → GradientView 全屏渐变          │
│   主界面     → View backgroundColor=theme  │
├────────────────────────────────────────────┤
│ SafeAreaView(edges=[top,bottom]) 内容区     │  ← 内容避让状态栏/底部,保证可读
└────────────────────────────────────────────┘
```

- `App.tsx`：`StatusBar` 设 translucent + transparent，根容器背景跟随主题。
- `AuthLayout`：外层 GradientView 全屏（延伸至状态栏），内层 SafeAreaView 包内容。
- Tab 页/栈页：根容器补 `backgroundColor: theme.background`；顶部渐变卡（如有）同样延伸。

## 3. 模块划分

| 模块 | 改动 |
| --- | --- |
| `mobile/android/app/src/main/res/values/styles.xml` | AppTheme 加 `android:windowBackground=@color/...`（浅色） |
| `mobile/android/app/src/main/res/values-night/styles.xml` | 深色 windowBackground 变体 |
| `mobile/android/app/src/main/res/values-v27/styles.xml` | windowLayoutInDisplayCutoutMode=shortEdges |
| `mobile/android/app/src/main/res/values/colors.xml`（如无则新建） | 定义 bg_light / bg_dark 颜色 |
| `mobile/App.tsx` | StatusBar translucent + transparent；根容器背景 theme.background |
| `mobile/src/components/AuthLayout.tsx` | 外层渐变铺满全屏，内层 SafeAreaView 内容 |
| `mobile/src/navigation/RootNavigator.tsx` | 根容器/导航背景 theme.background（兜底） |
| 各 Tab 页/栈页（Home/Stats/Agent/Plan/Profile/Login 等） | 根容器补 backgroundColor: theme.background；顶部渐变元素延伸至状态栏 |

## 4. 数据与接口

无接口/数据改动。

## 5. 前端风格

沿用 v0.1 风格 C「活力渐变」：主渐变紫 `#8B5CF6 → #EC4899`；浅紫底 `#F7F5FF`；深色底 `#171322`；主界面状态栏区域 = 主题背景色；登录页 = 渐变铺满顶部。

## 6. 后端设计

无后端改动（纯移动端 UI 适配）。

## 7. 部署与环境

- 本地构建 `assembleRelease` 验证编译；模拟器/真机验证视觉效果（挖孔机如 Pixel 系列可配置 cutout 模拟）。
- 验证后如需上线：构建 release → MCP deploy（版本 2.0.2 / versionCode 202）→ 手机 OTA。

## 8. 修订记录

| 时间 | 变更说明 |
| --- | --- |
| 2026-08-16 15:52 | 创建架构文档；确定 windowBackground + cutout mode + StatusBar translucent + 页面背景铺满方案 |
