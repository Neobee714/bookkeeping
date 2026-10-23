# v0.9 落地记录：四套主题皮肤 + 2.4.0 发布

- 创建时间：2026-10-23 16:30
- 最终状态：**已随 2.4.0 / versionCode 224 发布（2026-10-23 16:25）**。
  与 v0.8 离线能力合并；APK 签名、哈希、OTA 细节见
  [`docs/v0.8/DEPLOY-RELEASE.md`](../v0.8/DEPLOY-RELEASE.md)。
  四套主题的逐屏视觉走查与明暗冷启动仍需真机确认。

## 1. 提交

| 提交 | 内容 |
| --- | --- |
| `65914bd` feat(theme): 四套皮肤与外观页（v0.9） | 主题类型/skins/useSkin/useTheme/useIsDarkMode、AppearanceScreen、全页面 skin 适配、版本 2.4.0/224 |
| `2a626ee` perf(backend): 交易列表复合索引 | 与主题无关的后端性能维护，随同一轮部署上线 |

## 2. 主题能力

- 四套皮肤：
  - `aurora` 流动极光：白卡、彩雾与渐变，默认外观，最接近旧版。
  - `candy` 糖果马卡龙：奶油粉橙、圆角最软。
  - `neon` 暗夜霓虹：近黑底、紫青光晕，暗色优先。
  - `neu` 柔和浮雕：同色系软阴影，仅亮色成立。
- 明暗三选一：跟随系统 / 亮色 / 暗色；`themeStore` 持久化 `skinId` 与 `scheme`，
  App 启动调用 `loadStoredTheme()` 恢复。
- 新 API：`useSkin()` 提供 `surfaces`、`gradient`、`onHero`、`onAccent` 等语义色；
  `useTheme()` 保留兼容；`useIsDarkMode()` 供图表/状态栏使用。
- 入口：「我的」→「外观」（`AppearanceScreen`），4 套预览 + 明暗三选一。
- 迁移范围：登录/注册、首页、记一笔、统计、规划、小光、我的、分类、管理页、
  弹窗/按钮/分段控件/更新弹窗等；删除 `theme/colors.ts`，不再直接引用旧 `gradient`。

## 3. 与离线的合并

主题重构期间，v0.8 已提交离线能力（`5f328a1`）。合并时保留了：
- 首页 `displaySummary` / `pendingItems` / 乐观插入 / 待同步徽标；
- 统计页缓存降级与「网络不可用，显示上次缓存」；
- `OfflineBanner` 底部悬浮横幅；
- 记一笔的分类缓存与离线入队；
- `useOfflineSync()` 的启动/联网/回前台触发。

## 4. 验证

| 项 | 结果 |
| --- | --- |
| `tsc --noEmit` | 0 错误 |
| `jest` | 8 suites / 37 tests 全过 |
| `eslint` | 0 errors / 43 warnings |
| backend `pytest` | 91 passed |
| release APK | `BUILD SUCCESSFUL in 2m 28s`，76,835,237 bytes，2.4.0/224 |
| 模拟器 | 2.4.0 安装成功，登录页正常渲染，无 FATAL/RN error |
| OTA | `info.json` 2.4.0、`latest.apk` 200、sha256 一致 |

## 5. 待真机确认

- [ ] 四套主题逐屏走查：首页 / 图表 / 规划 / 小光 / 我的 / 记一笔 / 外观页。
- [ ] 明暗切换 + 冷启动恢复（跟随系统、亮色、暗色各一次）。
- [ ] 暗夜霓虹下的图表、状态栏、底部导航对比度。
- [ ] 柔和浮雕在暗色下应自动回退（仅亮色成立）。
- [ ] 与离线功能叠加：离线横幅、待同步徽标在四套皮肤下都清晰。

## 6. 回退

- App 回退到 2.2.2 即可；主题偏好存在 AsyncStorage，旧版忽略。
- 后端索引迁移可保留，不影响旧版。
- 无历史数据改写。

## 7. 后续

1. 用户在 vivo 上完成第 5 节视觉走查与 v0.8 的离线验收。
2. 若发现对比度/间距问题，记录具体皮肤 + 页面 + 截图，下一版修正。
3. 后续可考虑：主题跟随时间自动切换、自定义强调色；不在 2.4.0 范围内。
