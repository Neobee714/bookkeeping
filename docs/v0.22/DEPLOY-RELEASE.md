# v0.22 发布记录：2.9.5(241)

- 发布日期：2026-11-19 17:11（CST）
- 版本：**2.9.5 / versionCode 241**（承接 2.9.4 / 240）
- 产物：`mobile/android/app/build/outputs/apk/release/app-release.apk`
- 字节数：**23,097,591**
- SHA-256：**8d6a1e7ad670ddf0913c25560395509cce92c351c20d834ab8af4e70842e136a**
- 签名证书 SHA-256：`d8d8202e…f6c06c`（与历史版本同一把 release key）
- 线上：`https://app.xyvora.me/bookkeeping/latest.apk`，`info.json` version=2.9.5，force=false

## 本轮内容

| 类型 | 内容 |
| --- | --- |
| 稳定性 | 顶层 ErrorBoundary：渲染异常落到可重试的兜底页，不再白屏 |
| 安全 | 登录失败限流（账号 15 次/15 分钟、IP 50 次，429 + Retry-After）；`SECRET_KEY` 默认值退化随机；Release 关闭明文流量 |
| 入口 | 桌面长按快捷方式：记一笔 / 语音记账 / 问小光（`bookkeeping://add\|voice\|agent`） |
| 运维 | 服务器 10 分钟巡检 + 异地副本修复与告警联动（不在 APK 内） |

## 构建与产物验证

```
cd mobile/android && export JAVA_HOME=/Users/xyvora/android-dev/jdk17
./gradlew assembleRelease                     # 冷启动约 15 分钟（bundle + R8）
BT=/Users/xyvora/Library/Android/sdk/build-tools/37.0.0
$BT/aapt2 dump badging app-release.apk | head -1
# package: name='com.neobee.bookkeeping' versionCode='241' versionName='2.9.5'
$BT/apksigner verify --print-certs app-release.apk      # 同一把发布钥匙
shasum -a 256 app-release.apk
```

已核验：

- `res/xml/shortcuts.xml`（线上被资源混淆为 `res/Eq.xml`）三个 shortcut 的 `data` 分别是
  `bookkeeping://add|voice|agent`，`targetClass=com.bookkeepingapp.MainActivity`。
- `AndroidManifest.xml`：`usesCleartextTraffic=false`、`VIEW/BROWSABLE` + `scheme=bookkeeping`、
  `meta-data android.app.shortcuts=@xml/shortcuts`。
- Hermes bundle 内含 `bookkeeping:\/\/` 与 `api.neobee.top`，不含 `127.0.0.1`。
- 上传后服务端 `sha256sum latest.apk` 与本地一致；`meta.json` 同步。

## 下载速度

- Mac 经本机 smart-proxy（127.0.0.1:7899）实测 7 KB/s，**不要据此判断线上带宽**；
- 绕过代理直连 `app.xyvora.me` 实测 **~506 KB/s**，23MB 约 50 秒，符合 ECS 固定带宽预期。

## 回退

- App：OTA 只能往前回滚——从上一个稳定提交重新构建，versionCode 递增到 242+ 再发。
- 后端：本轮是加法式改动（限流 + 密钥兜底 + headers 透传），revert 提交即可；
  无数据库迁移，**不需要**恢复 dump。
- 若限流误伤：账号桶 15 分钟窗口自然过期；应急可在 `/etc/default` 调阈值前先重启容器清空内存计数。

## 待办

- 真机验收：装上 2.9.5 后确认三个快捷方式可见、`bookkeeping://add` 打开记账弹层、
  `bookkeeping://agent` 切到小光档（手机未接 USB 时未能执行）。
- 告警即时推送通道仍未配置（需要 Bark / 企业微信机器人 / Telegram webhook）。
