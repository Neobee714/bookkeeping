# v0.11 发布记录：2.4.2 小光键盘避让

- 创建时间：2026-10-25 12:34
- 版本：**2.4.2 / versionCode 226**
- 状态：**已发布（2026-10-25 12:31）**；代码与门禁通过，真机视觉确认待用户。

## 1. 问题

小光聊天页点输入框，键盘弹出后盖住输入框，看不到输入内容。

## 2. 根因

- RN 0.87 + `edgeToEdgeEnabled=true` + targetSdk 36：Android 15+ 强制 edge-to-edge，
  `adjustResize` 不再把页面顶上去。
- `AgentScreen` 的 `KeyboardAvoidingView` 只包输入条，且 Android `behavior=undefined`，
  等于没有避让。
- 输入条在页面最底部，正好被键盘覆盖。

## 3. 修复

- `KeyboardAvoidingView` 上移到包住 `FlatList + 输入条`，`flex:1`；
- Android `behavior="height"`，iOS 保持 `"padding"`；
- `FlatList` / KAV 都加 `flex:1`，键盘弹出时列表收缩、输入条保持在键盘上方；
- Tab.Navigator 增加 `tabBarHideOnKeyboard: true`，键盘弹出时底部 Tab 收起。

## 4. APK

| 项 | 值 |
| --- | --- |
| 路径 | `mobile/android/app/build/outputs/apk/release/app-release.apk` |
| 大小 | 76,853,021 bytes |
| SHA-256 | `8d997fe6da7d234531189ac07af1255278ad41eb8c462a41bfc1e44bf411bf8a` |
| versionCode / versionName | 226 / 2.4.2 |
| 签名 | v2，证书 SHA-256 `d8d8202e…f6c06c`，与 2.4.0/2.4.1 一致 |

构建：`assembleRelease` 1m7s。

## 5. 验证

| 项 | 结果 |
| --- | --- |
| `tsc --noEmit` | 0 错误 |
| `jest` | 8 suites / 37 tests 全过 |
| `eslint AgentScreen/RootNavigator` | 0 errors / 6 warnings |
| release APK | 226 / 2.4.2，签名正确 |
| OTA | info.json 2.4.2、latest.apk 200、size 76,853,021 |
| 真机键盘 | **待用户**：小光输入框是否完整可见、Tab 是否收起 |

> 本次没有在模拟器上做登录后的视觉验证（模拟器停在登录页，且 System UI 不稳定）；
> 代码路径是标准的 KeyboardAvoidingView + tabBarHideOnKeyboard，需真机确认一次。

## 6. 发布 / 获取

- 下载页：https://app.xyvora.me/
- 直链：https://app.xyvora.me/bookkeeping/latest.apk
- 2.4.2 同时包含 2.4.1 的 OTA 新下载器；旧版 2.2.2/2.4.0 仍需手动装一次。
- 已装 2.4.1 的用户可直接在 App 内点更新，应该能看到通知栏进度（同时验证 2.4.1 修复）。

## 7. 回退

- 回退安装 2.4.1 归档 `bookkeeping-2.4.1.apk`；2.4.1 键盘行为与 2.4.0 相同（旧 bug 仍在）。
- 后端无改动。

## 8. 后续

- 若真机仍被遮挡，优先调 `keyboardVerticalOffset`（Android 可尝试
  `keyboardVerticalOffset={64}` 或 `behavior="padding"`），并记录机型/输入法。
- 记一笔/预算/分类弹窗若出现同类问题，按同一模式逐个处理。
