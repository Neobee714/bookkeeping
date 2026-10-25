# v0.11 需求：小光输入框不被键盘遮挡

- 创建时间：2026-10-25 12:31
- 版本：2.4.2 / versionCode 226
- 现象：打开「小光」后点输入框，软键盘弹出并盖住输入框，用户看不到自己输入的内容。

## 1. 根因

- App 使用 RN 0.87 且 `edgeToEdgeEnabled=true`、targetSdk 36，Android 15+ 强制 edge-to-edge；
  `AndroidManifest.xml` 里的 `adjustResize` 已不能像旧版那样自动把页面顶上去。
- `AgentScreen` 的 `KeyboardAvoidingView` 只包住输入条，而且 Android 分支
  `behavior={undefined}`，等于完全不处理键盘高度。
- 输入条在页面最底部，键盘从屏幕底部覆盖上来，正好盖住它。

## 2. 需求

- FR-01：键盘弹出时，输入框始终在键盘上方，可看到输入内容。
- FR-02：消息列表随键盘缩小，不遮挡、不溢出；键盘收起后恢复。
- FR-03：键盘弹出时底部 Tab 栏自动收起，避免和输入条争空间。
- FR-04：iOS 保持 `padding` 行为，不回归。
- FR-05：不改动其他页面的键盘逻辑（避免引入新的 modal 布局问题）。

## 3. 验收

- 真机打开小光 → 点输入框 → 键盘弹出后输入框完整可见，能边输入边看到文字。
- 键盘弹出时 Tab 栏隐藏；收起后恢复。
- 输入多行时输入框最高 100，列表可滚动。
- `tsc` 0 错误、jest 全过、release APK 可安装。
