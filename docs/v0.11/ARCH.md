# v0.11 架构：小光键盘避让

- 创建时间：2026-10-25 12:32

## 1. 布局调整

原来：

```
SafeAreaView
├── Header
├── FlatList                 (flex 由内容撑开)
└── KeyboardAvoidingView     (只包输入条；Android behavior=undefined)
    └── InputBar
```

改为：

```
SafeAreaView
├── Header
└── KeyboardAvoidingView      (flex:1; iOS padding / Android height)
    ├── FlatList              (flex:1，键盘弹出时缩小)
    └── InputBar              (始终位于 KAV 底部)
```

- Android 用 `behavior="height"`：KAV 高度减去键盘高度，FlatList 收缩，输入条留在
  键盘上方。
- iOS 用 `behavior="padding"`：保持原有手感。
- `styles.body` / `styles.list` 都设为 `flex: 1`，确保 KAV 和列表参与弹性布局。
- `keyboardVerticalOffset` 不设置：KAV 已经在 Header 下方，按自身 frame 计算重叠即可。

## 2. Tab 栏

`Tab.Navigator` 增加 `tabBarHideOnKeyboard: true`：

- 键盘弹出时底部 Tab 收起，不再占用输入条下方的空间；
- 键盘收起后恢复；
- 对所有 Tab 页生效，但只影响键盘打开期间。

## 3. 为什么不改全局 adjustResize

`edgeToEdgeEnabled=true` 下，窗口不再随键盘 resize；全局改 `windowSoftInputMode` 也
无法覆盖 Android 15+ 的 edge-to-edge 行为。正确做法是让每个有底部输入的页面自己用
`KeyboardAvoidingView`（或键盘 controller）处理。

本次只改小光；记一笔/预算/分类弹窗仍走各自 Modal 的 resize 行为，若后续发现同样的
遮挡，再按同一模式逐个处理，避免一次性改动所有弹窗。

## 4. 影响面

- 仅 `AgentScreen.tsx` 与 `RootNavigator.tsx`；
- 不改 API、后端、主题 token；
- iOS 行为保持 `padding`，不影响其他页面。
