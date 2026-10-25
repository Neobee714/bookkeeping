# v0.11 清单：小光输入框键盘避让

- 创建时间：2026-10-25 12:33
- 版本：2.4.2 / versionCode 226

## 阶段 1：定位

- [x] 检查 AgentScreen：KeyboardAvoidingView 只包输入条，Android behavior=undefined ✅
- [x] 检查 AndroidManifest：adjustResize 存在，但 edgeToEdgeEnabled=true、targetSdk36 ✅
- [x] 确认 Android 15+ edge-to-edge 下 adjustResize 不再自动顶上页面 ✅

## 阶段 2：修改

- [x] AgentScreen：KAV 包住 FlatList + 输入条，flex:1 ✅
- [x] Android 使用 behavior="height"，iOS 保持 "padding" ✅
- [x] FlatList/body 增加 flex:1，键盘弹出时列表收缩 ✅
- [x] RootNavigator：Tab.Navigator 增加 tabBarHideOnKeyboard ✅
- [x] 版本 2.4.2 / 226 ✅

## 阶段 3：门禁

- [x] `tsc --noEmit` 0 错误 ✅ 2026-10-25 12:29
- [x] `jest` 8 suites / 37 tests 全过 ✅
- [x] `eslint AgentScreen/RootNavigator` 0 errors（6 warnings）✅
- [x] `assembleRelease` 成功（1m7s）✅
- [x] versionCode 226 / 2.4.2、label 拾光、v2 签名、证书一致 ✅
- [x] APK SHA-256 `8d997fe6da7d234531189ac07af1255278ad41eb8c462a41bfc1e44bf411bf8a` ✅

## 阶段 4：发布

- [x] `publish.sh` 发布 2.4.2；info.json 回验 ✅ 2026-10-25 12:31
- [x] latest.apk content-length 76,853,021；归档 `bookkeeping-2.4.2.apk` ✅
- [ ] 真机验证：小光点输入框，键盘不遮挡、Tab 收起
- [ ] 若真机仍有问题，记录机型/键盘/截图再调 keyboardVerticalOffset

## 阶段 5：收尾

- [x] `docs/v0.11/{REQ,ARCH,CHECKLIST}.md` ✅
- [x] `docs/v0.11/DEPLOY-RELEASE.md` ✅
- [x] 更新 skill（edge-to-edge 键盘坑）✅ 2026-10-25 12:35
- [ ] 用户确认后勾选真机项
