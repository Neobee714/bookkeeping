# v0.9 架构：皮肤 token 化

## 1. 现状

- `mobile/src/theme/`：`colors.ts`（亮/暗两套 ThemeColors）、`spacing.ts`、`typography.ts`、`index.ts`（`useTheme()` 返回颜色）
- 21 个界面文件已用 `useTheme()`；仍有 80 处硬编码色（多为分类调色板与渐变卡上的白字）和 54 处 `radius.*` 静态引用
- 9 处 `shadow*` 硬编码；无字体、无 blur 依赖；`react-native-svg`、`linear-gradient` 已有

## 2. token 模型

新增 `theme/types.ts`：

```
Skin {
  id, name, tagline, mode: 'light' | 'dark' | 'both'
  colors: ThemeColors & { onHero, onHeroMuted, onAccent }
  gradient:      [start, end]   // 主强调：按钮 / Tab 胶囊 / FAB / 选中态
  heroGradient:  [start, end] | null  // 月度汇总卡；null = 纯色浮雕卡
  authGradient:  [start, end]   // 登录/注册全屏底
  surfaces: { card, input, chip, sheet, tabBar, hero }  // ViewStyle，含圆角/边框/boxShadow
  fabShadow: ViewStyle
}
```

`useTheme()` 保持返回 `ThemeColors`（不破坏 21 个调用点）；新增 `useSkin()` 返回完整 Skin。
`useSkin().colors === useTheme()` 同一对象，避免两套来源。

## 3. 皮肤注册表

```
theme/skins/aurora.ts | candy.ts | neon.ts | neu.ts
theme/skins/index.ts  // SKINS 数组 + getSkin(id) + DEFAULT_SKIN
```

每套皮肤导出亮/暗（或单模式）变体；`mode` 决定 `resolveMode(skin, pref, system)` 的结果：

- `light`：永远是亮色（04）
- `dark`：永远是深色（06）
- `both`：按用户偏好 / 系统（08、10）

## 4. 持久化

`store/themeStore.ts` 增加 `skinId`，与 `mode` 一起存 AsyncStorage：
`bookkeeping.theme_skin`、`bookkeeping.theme_mode`。启动时 `loadStoredTheme()` 一次读完，`App.tsx` 在首帧前调用（沿用现有 effect）。

## 5. 组件迁移（只改样式挂载点）

| 组件 | 改动 |
| --- | --- |
| GradientView | 默认色取 `useSkin().gradient`，仍允许调用方覆盖 |
| GradientButton | 文字色取 `colors.onAccent` |
| SegmentedControl | 选中胶囊用 `gradient`，轨道用 `colors.surface` |
| TransactionItem | 行背景/阴影 → `surfaces.card` |
| HomeScreen | 月份卡按 `heroGradient` 分支（null 用 `surfaces.hero`）；文字用 `onHero` |
| AddTransactionSheet | 弹层 → `surfaces.sheet`；金额/备注/日期/分类 → `surfaces.input` / `surfaces.chip` |
| StatsScreen / PlanScreen / ProfileScreen / CategoryScreen / AgentScreen / AdminUsers | 卡片背景 → `surfaces.card` |
| 弹窗（Confirm/Input/Update） | 卡片 → `surfaces.card` |
| RootNavigator | Tab 栏 → `surfaces.tabBar`；新增 `Appearance` 路由 |
| AuthLayout | 背景 → `authGradient`，文字 → `onHero` |
| 新页面 AppearanceScreen | 4 张皮肤卡 + 模式选择 + 说明 |

圆角差异通过 `surfaces.*.borderRadius` 覆盖静态 StyleSheet，无需迁移 54 处 `radius.*`。

## 6. 风险与对策

| 风险 | 对策 |
| --- | --- |
| Android `boxShadow` 在长列表掉帧 | 仅卡片级使用；行内不加阴影；真机滚动实测 |
| 04 内凹阴影在部分 ROM 渲染异常 | 用 `boxShadow` inset；异常时退化为细边框 |
| 06 渐变文字不支持 | 金额用纯色 + 发光阴影，不做渐变字 |
| 08 浅色渐变对比度不足 | 渐变加深一档，白字加轻微阴影 |
| 切肤后旧页面残留旧色 | 颜色全部来自 hook，不走模块常量；切换时 zustand 触发重渲染 |

## 7. 发布

- `build.gradle` 2.4.0 / versionCode 224，`app.json` 名称不变
- 不触发后端部署（仅 mobile + docs）
- 真机验证后手工出 APK，按既有流程发布
