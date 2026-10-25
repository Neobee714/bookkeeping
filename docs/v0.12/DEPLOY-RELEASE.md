# v0.12 发布记录：2.4.3 分类刷新与弹层滚动

- 创建时间：2026-10-25 23:23
- 版本：**2.4.3 / versionCode 227**
- 状态：**已发布（2026-10-25 23:20）**；代码与门禁通过，真机确认待用户。

## 1. 修复内容

### 1.1 新增分类后记账页不刷新

- 分类管理新增/编辑/删除后写回 `categories` 缓存；
- 首页改为 `useFocusEffect`，从分类管理返回时重新拉分类；
- 记账弹层每次打开都重新拉分类（缓存先渲染、网络覆盖），不再等 App 重启。

### 1.2 分类多时不能下滑

- 弹层 `sheetWrap` 加 `flex:1`，`sheet` 与 `ScrollView` 加 `flexShrink:1`，
  4-5 行分类时内容区可正常滚动；
- Android `KeyboardAvoidingView` 改 `behavior="height"`，键盘弹出时弹层缩短，
  下方分类仍可滚动选择；
- 有缓存时不再因为 loading 整块替换分类区。

## 2. APK

| 项 | 值 |
| --- | --- |
| 路径 | `mobile/android/app/build/outputs/apk/release/app-release.apk` |
| 大小 | 76,853,169 bytes |
| SHA-256 | `cbd14a5a04a9882916b7628e2bf777109c61462fc0a34ca91adadae01651c802` |
| versionCode / versionName | 227 / 2.4.3 |
| 签名 | v2，证书 SHA-256 `d8d8202e…f6c06c`，与 2.4.0/2.4.1/2.4.2 一致 |

构建：`assembleRelease` 55s。

## 3. 验证

| 项 | 结果 |
| --- | --- |
| `tsc --noEmit` | 0 错误 |
| `jest` | 8 suites / 37 tests 全过 |
| `eslint` | 0 errors / 12 warnings |
| release APK | 227 / 2.4.3，签名正确 |
| OTA | info.json 2.4.3、latest.apk 200、size 76,853,169 |
| 真机分类刷新 | **待用户**：新增分类 → 返回 → 记一笔直接可见 |
| 真机弹层滚动 | **待用户**：4-5 行分类可滑到最后一行；键盘打开时可选 |

## 4. 获取

- 下载页：https://app.xyvora.me/
- 直链：https://app.xyvora.me/bookkeeping/latest.apk
- 2.4.1 及以上可在 App 内直接更新（应能看到通知栏进度）；
- 2.2.2/2.4.0 仍需手动安装一次。

## 5. 回退

- 回退安装 2.4.2 归档 `bookkeeping-2.4.2.apk`（分类刷新/滚动问题会回来）；
- 后端无改动。

## 6. 已知限制 / 后续

- 分类缓存按用户隔离；切换账号会读各自缓存。
- 如果真机上分类仍被键盘挡住，优先调 `keyboardVerticalOffset` 或改 `padding`，
  记录机型与输入法。
- 预算/分类表单弹层暂未按同一模式改造；若出现遮挡再处理。
