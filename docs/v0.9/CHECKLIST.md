# v0.9 清单：四套主题落地

## 阶段 1：文档与 token 层

- [x] 1.1 `docs/v0.9/{REQ,ARCH,CHECKLIST}.md`
- [x] 1.2 `theme/types.ts`（ThemeColors + SkinPalette + SkinDefinition + Skin）
- [x] 1.3 `theme/skins/{aurora,candy,neon,neu}.ts` + 注册表
- [x] 1.4 `theme/index.ts` 改为 `useSkin()` / `useTheme()` / `useIsDarkMode()`
- [x] 1.5 `themeStore` 增加 skinId 与 `loadStoredTheme()`
- [x] 1.6 `App.tsx` 启动恢复皮肤
- [x] 1.7 删除 `theme/colors.ts`

## 阶段 2：组件迁移

- [x] 2.1 `GradientView` 默认取皮肤渐变
- [x] 2.2 `GradientButton` / `SegmentedControl` 用 onAccent
- [x] 2.3 `TransactionItem` 用 `surfaces.card`
- [x] 2.4 首页：hero 支持无渐变皮肤（浮雕）、onHero 文字、FAB 阴影
- [x] 2.5 记一笔：sheet / 输入框 / 分类格用皮肤表面，选中态文字 onAccent
- [x] 2.6 图表 / 规划 / 我的 / 分类 / 小光 / 管理后台卡片改用 `surfaces.card`
- [x] 2.7 三个弹窗卡片改用 `surfaces.card`
- [x] 2.8 登录 / 注册 / 更新弹窗渐变文字用 onAccent

## 阶段 3：外观入口

- [x] 3.1 `AppearanceScreen`（4 张预览卡 + 明暗三选一 + 锁定说明）
- [x] 3.2 路由 `Appearance` + 「我的」入口
- [x] 3.3 Tab 栏改用 `surfaces.tabBar`

## 阶段 4：门禁

- [x] 4.1 `npx tsc --noEmit` 0 错
- [x] 4.2 `npx jest` 7 suites / 32 tests 全过
- [x] 4.3 `npx eslint src App.tsx` 0 error / 42 warnings（改动前为 1 error / 38 warnings）

## 阶段 5：真机与发布

- [ ] 5.1 版本 2.4.0 / versionCode 224
- [ ] 5.2 构建 release APK 并在模拟器/真机安装
- [ ] 5.3 四套主题逐屏走查（首页/图表/规划/小光/我的/记一笔/外观页）
- [ ] 5.4 明暗切换 + 冷启动恢复
- [ ] 5.5 出 APK、校验 sha256、OTA 发布
- [ ] 5.6 更新 DEPLOY-RELEASE.md
