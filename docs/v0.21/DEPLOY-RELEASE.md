# v0.21 发布记录：2.9.4（240）

- 时间：2026-11-17
- 版本：2.9.4 / versionCode 240 / 22 MB（23,087,567 字节）
- SHA-256：`d4b13d8678466e439f3c3e04c631691ae5d6de87330559b7a4b57b8c180e0243`
- 签名：d8d8202e…f6c06c（与 2.9.0 同一把发布钥匙，可覆盖安装）
- 架构：arm64-v8a（2.9.1 起只支持 64 位设备；armv7 老设备会报 INSTALL_FAILED_NO_MATCHING_ABIS）

## 本版内容（2.9.0 → 2.9.4）

1. 记账弹层「确认新增/保存修改」吸底常驻（v0.20）
2. 小光 AI：Markdown 渲染、后端超时 60s、客户端 90s、全链路日志（v0.20）
3. APK 瘦身：77MB → 22MB（arm64 单架构 + R8，v0.20）
4. 图表支出分布可点进分类/商家明细；明细含按日分组与「备注」聚合（含商家 chip）（v0.21）

## 验证矩阵

| 项 | 结果 |
| --- | --- |
| aapt2 版本/包名 | 2.9.4(240) / com.neobee.bookkeeping ✅ |
| 签名证书 | 与旧版一致 ✅ |
| 包内 bundle | api.neobee.top 引用；无 127.0.0.1；含 v0.21 代码 ✅ |
| 公网 API 探活（okhttp UA） | https://api.neobee.top/health → 200 application/json ✅ |
| 上传前后 sha256 | 两侧一致 ✅ |
| info.json | version 2.9.4 / size 23,087,567 / apkUrl / force=false ✅ |
| 公网全量下载 latest.apk | 23,087,567 字节，sha256 一致 ✅ |
| 真机（vivo）功能冒烟 | 2.9.4 已装，分类明细/备注商家 chip 实测通过 ✅ |
| 真机「检查更新」 | 未执行（发布时手机 USB 断开） |

## 回退

- 回滚 App = 用 2.9.4 之前一个稳定包重新构建、versionCode/Name 递增后重新 publish（Android 不接受降级）。
- 历史包保留在服务器 `/var/www/apps/bookkeeping/bookkeeping-<ver>.apk`。
