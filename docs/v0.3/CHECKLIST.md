# 开发清单：挖孔屏(灵动岛)状态栏沉浸式适配 v0.3

- 创建时间：2026-08-16 15:52
- 规则：每完成一个小点标记 ✅，并附完成时间戳 `YYYY-MM-DD HH:mm`。

## 阶段一：需求与设计

- [x] 需求澄清完成（沉浸式方案确认）✅ 2026-08-16 15:52
- [x] 三文档创建 ✅ 2026-08-16 15:52

## 阶段二：Android 主题层

- [x] values/colors.xml：定义浅色/深色窗口背景色 ✅ 2026-08-16 16:05
- [x] values/styles.xml：AppTheme 加 windowBackground（浅色）✅ 2026-08-16 16:05
- [x] values-night/styles.xml：深色 windowBackground 变体 ✅ 2026-08-16 16:05
- [x] values-v27/styles.xml：windowLayoutInDisplayCutoutMode=shortEdges ✅ 2026-08-16 16:05（含 values-night-v27 深色变体）

## 阶段三：RN 层适配

- [x] App.tsx：根容器背景 theme.background 兜底；StatusBar 按主题 barStyle ✅ 2026-08-16 16:05（RN 0.87 已移除 translucent/backgroundColor,白色根源为 windowBackground）
- [x] AuthLayout.tsx：外层渐变铺满全屏（含状态栏），内层 SafeAreaView 内容；白色状态栏图标 ✅ 2026-08-16 16:05
- [x] 主界面各页：根容器已带 backgroundColor: colors.background（走查确认无需改）✅ 2026-08-16 16:05
- [x] RootNavigator：NavigationContainer theme 背景兜底已存在（走查确认）✅ 2026-08-16 16:05

## 阶段四：构建与验收

- [x] release APK 构建通过 ✅ 2026-08-16 16:10（tsc/eslint/assembleDebug/assembleRelease 全过）
- [x] 代码走查:浅色/深色 windowBackground + cutoutMode shortEdges + 登录页渐变铺满 + 主界面背景兜底 ✅ 2026-08-16 16:10
- [ ] 真机/挖孔模拟器视觉确认(挖孔区域无白色、渐变铺满)——待用户真机验证
- [x] 代码已提交到 Git(推送 GitHub 待网络恢复重试)✅ 2026-08-16 16:10
- [ ] 是否发布 2.0.2 上线由用户确认
