# v0.20 设计

## 改动面

纯 `mobile/` JS/TSX，无后端、无原生代码、无迁移。

## FR-1 弹层按钮吸底

文件：`mobile/src/components/AddTransactionSheet.tsx`

现状结构（行号以 2.9.0 为准）：

```
KeyboardAvoidingView(sheetWrap)          ~L446
└─ View(sheet, maxHeight 92%, flexShrink)  ~L447
   └─ ScrollView(flexShrink)              ~L482 … L812
      ├─ …表单…
      ├─ errorMessage                      ~L798
      └─ GradientButton(确认新增/保存修改)  ~L806   ← 问题：在滚动区内
```

目标结构：

```
KeyboardAvoidingView(sheetWrap)
└─ View(sheet)
   ├─ ScrollView(flex:1)        ← 只含表单
   └─ View(sheetFooter, flex:none)
      ├─ errorMessage（可选）
      └─ GradientButton
```

- 样式：`sheetFooter: { flex: none; borderTopWidth: 1; borderTopColor: colors.border; paddingTop: 10; paddingHorizontal: 18; paddingBottom: 22; }`（颜色运行时注入，StyleSheet 不写死色值）。
- `styles.saveButton` 的外边距收敛进 footer，按钮本体视觉不变。
- 不动 sheetWrap/sheet/ScrollView 的 flex 关系（skill 坑 #18）；KAV 与 `behavior="height"` 不动。

## FR-2 Markdown 渲染

新文件：`mobile/src/components/MarkdownText.tsx`（解析 + 渲染一体，纯 RN，无第三方依赖）

- 解析器：逐行扫描 → 段落 / 列表项（`- `、`* `）/ 表格块（连续 `|` 行 + `|---|` 分隔行）；行内解析 `**bold**`、`` `code` ``。
  未识别语法保留原文输出（不丢字符）。
- 渲染：
  - 段落/行内 → `Text`（嵌套 `Text` 做粗体/行内代码样式）；
  - 列表 → `View` + `•` 前缀 `Text`；
  - 表格 → 外层 `ScrollView horizontal`，内层 `View` 行列布局；表头 `surface` 底 + `border` 描边，均取皮肤 token（通过 props 传入 colors，与 AgentScreen 现有做法一致）。
- 接口：`<MarkdownText content={string} color={string} baseStyle={TextStyle} />`。
- 消费方：`mobile/src/screens/AgentScreen.tsx` 的 AI 气泡（~L129）以 `<MarkdownText>` 替换纯 `<Text>{content}</Text>`；用户气泡不动。

## 测试

- `mobile/src/__tests__/markdown.test.tsx`：解析纯函数断言（加粗/列表/表格/行内代码/纯文本/未知语法直出/混合样例）+ `react-test-renderer` 渲染断言（既有 mock 约定：`jest.setup.js` 已 mock `react-native-linear-gradient`，测试数据写在 `jest.mock` 工厂内部——skill 坑 #27）。
- 弹层结构：既有 `__tests__/` 弹层先例（`recurringSheet.test.tsx`）可仿写一个「按钮在 ScrollView 之外」的结构断言。

## 兼容性

- 纯 JS 渲染层改动；JS bundle 打进 APK，生效需发新版 APK（本轮不发）。
- 离线/同步、离线队列、校验逻辑零改动。
