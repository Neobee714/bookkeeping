# v0.13 架构：首页语音记账

- 创建时间：2026-10-25 23:36

## 1. 链路

```
首页 FAB
  ├─ 单击 → AddTransactionSheet（原手动记账）
  └─ 长按 380ms → VoiceTransactionSheet
        → 请求 RECORD_AUDIO
        → VoiceModule.startListening('zh-CN')  [Android SpeechRecognizer]
        → 实时 VoicePartial 事件（显示部分转写）
        → 最终转写 Promise<string>
        → parseVoiceTransaction()  [本地规则，无网络]
        → VoiceDraft
        → 关闭语音弹层
        → AddTransactionSheet(initialDraft)  [确认页，可改]
        → 用户点「确认新增」→ 原 handleSubmit（在线/离线队列）
```

## 2. 原生层（Android）

- `VoiceModule.kt`：
  - 使用 `SpeechRecognizer`，语言 `zh-CN`，`EXTRA_PARTIAL_RESULTS=true`；
  - Promise 在 `onResults` 时 resolve 最终文本，`onError` reject 中文错误；
  - 事件：`VoiceState`、`VoicePartial`、`VoiceLevel`（音量，暂未用于 UI）；
  - `stopListening()` 手动结束、`cancel()` 取消；
  - 创建/启动/销毁都切到 UI 线程。
- `VoicePackage.kt` 注册；`MainApplication` 手动 `add(VoicePackage())`。
- Manifest：`RECORD_AUDIO`；`<queries>` 声明 `android.speech.RecognitionService`
  以适配 Android 11+ 包可见性。

## 3. 本地解析

`mobile/src/voice/parseTransaction.ts`：

- 金额：优先「X块/X元」，其次「花了/买了/工资…+数字」，最后取句末数字；
  过滤“3个人/两杯/7月”等数量与日期；支持中文数字、口语省略、千分位。
- 分类：先精确匹配用户自定义分类名，再匹配静态关键词表；
  匹配不到回退「其他」，确认页可改。
- 日期：今天/昨天/前天/大前天/明天、`YYYY年M月D日`、`M月D日`。
- 类型：工资/收入/收到/报销/奖金/红包/退款等为收入，其余为支出。
- 备注：去掉日期、金额、常见动词后的原话，最长 255。
- 纯函数，有 11 个 jest 用例；不依赖网络与后端。

## 4. 确认页复用

- `AddTransactionSheet` 新增可选 `initialDraft`：
  - 编辑模式优先用 `editingItem`；
  - 否则有草稿则预填金额/类型/分类/日期/备注；
  - 顶部显示语音提示条；
  - 用户保存仍走原 `onSubmit`，保留校验、离线队列、client_id 幂等。
- 不在语音弹层里做第二套确认 UI，避免重复表单与逻辑分叉。

## 5. 交互与失败

- FAB 单击/长按冲突：`longPressFiredRef` 标记，长按后 onPress 不打开手动弹层；
  300ms 后复位，避免下一次点击被吞。
- 权限：`PermissionsAndroid.RECORD_AUDIO`；`NEVER_ASK_AGAIN` 时给「去设置」。
- 系统无识别服务/无网络/没听清：显示中文错误 + 「重说」/「取消」。
- iOS：`isVoiceSupported=false`，提示暂未开放，不影响手动记账。

## 6. 影响面

- 新增：`src/voice/{index,parseTransaction}.ts`、`components/VoiceTransactionSheet.tsx`、
  `android/.../VoiceModule.kt`、`VoicePackage.kt`；
- 修改：`HomeScreen`（FAB 长按 + 草稿状态）、`AddTransactionSheet`（initialDraft）、
  `MainApplication`、`AndroidManifest.xml`；
- 后端、数据库、OTA 清单不变。
