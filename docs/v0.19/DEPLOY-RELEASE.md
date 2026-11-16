# 2.9.0 发布记录

发布日期：2026-11-16（CST）
发布人：Hermes（用户授权「可以推送」）

## 产物

| 项 | 值 |
| --- | --- |
| 版本 | 2.9.0 / versionCode 236 |
| 包名 | `com.neobee.bookkeeping` |
| APK | `mobile/android/app/build/outputs/apk/release/app-release.apk` |
| 字节数 | 76,985,005 |
| SHA-256 | `3e542db20a7f3d9df9d0bd9ae91418e87ed32f682e78facb7f6cf9094369c8de` |
| 签名证书 | `CN=Neobee`，SHA-256 `d8d8202ec0c4b7065330b7d144ac2855113ab012dee1644ffa8c32e9fef6c06c` |
| 下载页 | https://app.xyvora.me/ |
| 直链 | https://app.xyvora.me/bookkeeping/latest.apk |
| OTA 清单 | https://app.xyvora.me/bookkeeping/info.json（`force: false`） |

Bundle 校验（Hermes 字节码，字符串为 UTF-16LE，需按 utf-16-le 搜）：
`备注(可选)`、`商家(可选)` 存在；`吃了什么`、`评价(可选)` 不存在；
`api.neobee.top` 存在，无 `127.0.0.1`。

## 本次内容

- 记一笔删除「吃了什么/项目」，只留商家 + 备注；「评价」改名备注。
- 列表标题 商家 || 分类，副标题备注；图表支出分布改为 分类 / 商家。
- 整理旧备注只保留 商家 / 备注 / 跳过。
- 迁移 `b7c4d9e2a610`：存量 item 并入备注后删除 item 列（线上 8 笔）。
- AI 记账修复：并行工具调用共用 Session 崩溃（IllegalStateChangeError）、金额算式、
  自定义分类、商家字段、北京时间、异常日志（详见 `PATCH-AI.md`）。

## 后端部署状态

| 提交 | 时间 | 说明 |
| --- | --- | --- |
| `029d1df` | 09:40:45 | 删 item + 迁移 |
| `caaa93f` | 09:56:17 | AI 修复 |

`last-deployed.txt` = `caaa93f`（随后仅有 docs 提交，不重启），无 `ALERT.txt`。
线上核对：`alembic_version = b7c4d9e2a610`，`transactions` 无 `item` 列；
`/health` 200；旧 item 已合并进 note（如 2277「卤味 · 好吃」）。

## 验证矩阵

| 项 | 结果 |
| --- | --- |
| 后端 `pytest -q` | 325 passed |
| App `tsc --noEmit` | 通过 |
| App `jest` | 18 suites / 134 tests 通过 |
| App `eslint .` | 0 error（45 条既有 warning） |
| APK `aapt2 badging` | versionCode 236 / versionName 2.9.0 |
| APK `apksigner verify` | V2 签名，证书与旧版一致 |
| 两边 sha256 | 上传文件与本地逐位一致 |
| OTA `info.json` | version 2.9.0，size 76985005，sha256 一致 |
| 真机 | 未执行（构建时 `adb devices` 无设备）；待用户更新后按下方清单验收 |

## 真机验收清单

1. 打开 App → 我的 → 检查更新，应提示 2.9.0；下载安装后桌面仍是「拾光」。
2. 记一笔：只有「商家(可选)」「备注(可选)」，没有「吃了什么/项目」。
3. 任一旧账单（如 11-14 卤味）列表副标题能看到原 item 文本。
4. 图表 → 支出分布：只有「分类 / 商家」，商家档底部有「旧备注 N 条未整理」。
5. 小光（AI 记账）：贴一次 11-15/11-14 那 10 笔应全部记账成功；试「萍姐火锅消费 107+129」应记 236。
6. 财报 → 吃喝卡不再出现「最常吃」。

## 回退

- App 即时回退：二维不可能降级；需从 `3447b36`（2.8.1）重新构建 versionCode 237、versionName 2.9.1，
  再 `publish.sh`。历史 APK 保留在 `/var/www/apps/bookkeeping/bookkeeping-2.8.1.apk`，
  只能用于 `adb install -r -d` 排障，不能当 OTA。
- 后端回退：`git revert --no-edit caaa93f 029d1df` 后 push，CI 2 分钟内生效；
  **不要** `alembic downgrade`，会丢备注里合并进来的明细。
- 数据快照：发布前每日 dump 与 `pre-deploy_*.sql.gz` 均在 `/opt/bookkeeping/dumps`。

## 坑

- `apksigner` 与 `gradlew` 都要 `JAVA_HOME=/Users/xyvora/android-dev/jdk17`；不设会报
  「Unable to locate a Java Runtime」，即使 gradle 已单独设过。
- 构建前确认 `git status` 干净；本次构建使用的提交是 `23d7482`，`API_BASE_URL=https://api.neobee.top`。
- 验证 bundle 文案不要直接 grep：Hermes 字节码里中文是 UTF-16LE，用 Python `s.encode('utf-16-le')`。
