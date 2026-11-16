# v0.20 清单

样例（preview/ux-fix-sample.html）→ 用户确认 ✅ 2026-11-16

## 实现

- [x] FR-1 AddTransactionSheet 按钮移出滚动区 + footer 吸底 + errorMessage 随行 ✅ 2026-11-16（子任务实现；主审修正 footer 底距为 22+insets.bottom）
- [x] FR-1 补弹层结构断言测试 ✅ 2026-11-16（mobile/__tests__/addTransactionSheetFooter.test.tsx）
- [x] FR-2 MarkdownText 组件（加粗/列表/表格/行内代码/换行） ✅ 2026-11-16
- [x] FR-2 AgentScreen AI 气泡接入 ✅ 2026-11-16
- [x] FR-2 markdown 单测（解析 + 渲染） ✅ 2026-11-16（mobile/__tests__/markdown.test.tsx，17 例）

## 门禁（主 Agent 自跑，子任务的 done 不算数）

- [x] `cd mobile && npx tsc --noEmit` ✅ 2026-11-16 干净
- [x] `cd mobile && npx jest` ✅ 2026-11-16 20 suites / 153/153 全过
- [x] `cd mobile && npx eslint .`（与改动前逐条比对，只看新增） ✅ 2026-11-16 0 error；5 条 no-void warning 与 HEAD 同行代码一致，无新增
- [x] diff 审查：无越界改动、无颜色字面量进新文件、无第三方依赖 ✅ 2026-11-16
  （主审修正：测试文件从 src/__tests__/ 归位 mobile/__tests__/ 并改 jest.mock 相对路径；footer 底距补 insets.bottom）

## 收尾

- [x] 本 CHECKLIST 勾完并注时间戳 ✅ 2026-11-16
- [ ] 版本号与提交：默认停在本地（不发 OTA）；待用户指示再 bump versionCode/Name + commit + push

## 追加：APK 瘦身（用户 2026-11-16 批准，随 v0.20 一起推送）

- [x] 裁 ABI：`gradle.properties` 的 `reactNativeArchitectures=arm64-v8a`（RN 打包不认 ndk.abiFilters；四套 .so 占包体 74%，砍后预计 30MB 内）
- [x] 开 R8 + shrinkResources（`enableProguardInReleaseBuilds = true`，dex 17.9MB→预计 8-11MB）
- [x] proguard-rules.pro 补 RN 反射面保留（@ReactMethod、VoiceModule/UpdaterModule/ApkDownloadService）
- [x] 版本号：versionCode 236→237、versionName 2.9.0→2.9.1
- [ ] 出包验证（QA x86_64 包模拟器冒烟 → 正式 arm64 包 aapt2/尺寸/sha256/dexdump）
- [ ] 真机（vivo）验证待连接后补
- [ ] commit + push
