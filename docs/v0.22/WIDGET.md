# v0.22 评估：要不要做桌面小组件

结论：**暂不做桌面小组件**。如果确实想要「桌面入口」，先做成本 0.5–1 天的**静态快捷方式**（长按图标 → 记一笔 / 语音记账 / 小光），它和小组件共用同一套深链，做完再决定要不要往上加。

## 为什么不是「顺手加一个」

- **RN 不能直接渲染小组件**：Android 桌面小组件是 `RemoteViews`，由 launcher 进程绘制，没有 JS 运行时。必须有一个原生 `AppWidgetProvider` + 布局 XML，JS 只负责把数据递过去。
- **现成库要先把 Expo 装进来**：`react-native-android-widget` 的 peerDependency 是 `expo >= 54`（npm 2026-11）。本项目是裸 RN 0.87，没有 `expo`；接入它要把 `MainActivity` 换成 `ReactActivityDelegateWrapper`、`MainApplication` 换 `ExpoReactHostFactory`、`settings.gradle` 加 expo-autolinking 与 gradle 插件。为一个小组件动整条构建链，出问题会连带 OTA 更新与语音原件，风险与收益不成比例。
- **手写路线的工作量**：`AppWidgetProvider`（~120 行 Kotlin）+ 两套 RemoteViews 布局（4×2 / 2×2）+ `appwidget-provider` XML + manifest receiver（~80 行资源）+ 数据桥（JS 写 SharedPreferences，新原生模块 ~60 行）+ 刷新策略（`updatePeriodMillis` 最短 30 分钟，跨零点与切皮肤要额外 WorkManager/AlarmManager）。含真机 OriginOS 验证共 **2.5–3.5 天**。
- **目前没有深链入口**：`RootNavigator` 没有 `linking` 配置，`MainActivity` 也没有 `intent-filter`。所以小组件点击现在只能「打开 App」，做不到「点一下直接进记一笔」。

## 价值判断

- 记账入口已经被压到很短：+ 号长按语音、小光对话、手动弹层（分类/高频备注都是预填）。
- 小组件真正多出来的是「不解锁看一眼本月还剩多少」。App 未打开时 widget 的数据是上次同步的快照，跨天后会显示旧值，需要肉眼分辨。
- 还有个隐性成本：widget 只有一套颜色。四套皮肤下要么固定配色，要么在切皮肤时重绘并接受桌面上的短暂不一致。

## 如果要做，建议顺序

1. **深链**（`bookkeeping://add`、`bookkeeping://voice`、`bookkeeping://agent`）：`Linking` 监听 + 一个待处理动作的 store 标记，首页消费后打开对应弹层。~0.5 天，无新依赖。
2. **静态快捷方式**：`res/xml/shortcuts.xml` + manifest `<meta-data>`，长按图标出现「记一笔 / 语音记账 / 问小光」。**纯资源，0 行 Kotlin**，和 1 共用深链。~0.5 天（含真机验证）。
3. **桌面小组件**：在 1 之上再 +2 天；样式先只做一种（跟随 `aurora`），其他皮肤用同一套深色底。

先做 1+2 = 1 天，就能覆盖「一键进入记一笔」；3 解决的是「抬头看数字」，属于可选增强。
