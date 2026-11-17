# v0.20 清单

样例（preview/ux-fix-sample.html）→ 用户确认 ✅ 2026-11-16

## 实现

- [x] FR-1 AddTransactionSheet 按钮移出滚动区 + footer 吸底 + errorMessage 随行 ✅ 2026-11-16（子任务实现；主审修正 footer 底距为 22+insets.bottom）
- [x] FR-1 补弹层结构断言测试 ✅ 2026-11-16（mobile/__tests__/addTransactionSheetFooter.test.tsx）
- [x] FR-2 MarkdownText 组件（加粗/列表/表格/行内代码/换行） ✅ 2026-11-16
- [x] FR-2 AgentScreen AI 气泡接入 ✅ 2026-11-16
- [x] FR-2 markdown 单测（解析 + 渲染） ✅ 2026-11-16（mobile/__tests__/markdown.test.tsx，17 例）

## 门禁（主 Agent 自跑，子任务的 done 不算数）

- [x] `cd mobile && npx tsc --noEmit` ✅ 2026-11-16 干净
- [x] `cd mobile && npx jest` ✅ 2026-11-16 20 suites / 153/153 全过
- [x] `cd mobile && npx eslint .`（与改动前逐条比对，只看新增） ✅ 2026-11-16 0 error；5 条 no-void warning 与 HEAD 同行代码一致，无新增
- [x] diff 审查：无越界改动、无颜色字面量进新文件、无第三方依赖 ✅ 2026-11-16
  （主审修正：测试文件从 src/__tests__/ 归位 mobile/__tests__/ 并改 jest.mock 相对路径；footer 底距补 insets.bottom）

## 收尾

- [x] 本 CHECKLIST 勾完并注时间戳 ✅ 2026-11-16
- [ ] 版本号与提交：默认停在本地（不发 OTA）；待用户指示再 bump versionCode/Name + commit + push

## 追加：APK 瘦身（用户 2026-11-16 批准，随 v0.20 一起推送）

- [x] 裁 ABI：`gradle.properties` 的 `reactNativeArchitectures=arm64-v8a`（RN 打包不认 ndk.abiFilters；四套 .so 占包体 74%，砍后预计 30MB 内）
- [x] 开 R8 + shrinkResources（`enableProguardInReleaseBuilds = true`，dex 17.9MB→预计 8-11MB）
- [x] proguard-rules.pro 补 RN 反射面保留（@ReactMethod、VoiceModule/UpdaterModule/ApkDownloadService）
- [x] 版本号：versionCode 236→237、versionName 2.9.0→2.9.1
- [x] 出包验证 ✅ 2026-11-16：QA x86_64 包模拟器冒烟通过（启动无崩溃、弹层按钮初屏可见、markdown 渲染正常）；正式 arm64 包 22.0MB、aapt2=2.9.1(237)、仅 arm64-v8a、签名 d8d8202e… 与旧版一致、包内 JS 含 v0.20 改动且为生产域名；dexdump 确认原生模块反射面保留
- [x] 真机（vivo V2339A）验证 ✅ 2026-11-17：2.9.1 arm64 包安装成功、启动无崩溃；记账弹层「确认新增」初屏可见（距底 48px 含手势区）；0.01 测试单写入 DB 确认（id 2312）后经长按删除清理；语音记账正常拉起（RECORD_AUDIO 已授予、进入「我在听」）；小光 markdown 渲染在历史回答上验证（圆点列表）
- 发现（既有问题，非 v0.20 引入）：小光单次请求偶发超时触发「AI 助手暂时不可用」，且容器 root logger 无 handler（`handlers=[]`），`logger.exception` 堆栈不落盘——排查需要给 main.py 加 logging.basicConfig

## 追加：小光 AI 日志补齐（用户 2026-11-17 批准）

- [x] main.py `logging.basicConfig`（`LOG_LEVEL` 可调，默认 INFO）：root logger 终于有 handler，`logger.exception` 堆栈进 docker logs
- [x] 路由层：agent request / agent response（user_id、msg_len、history、elapsed_ms、tool_calls）
- [x] graph 层：agent chat start（model/timeout/recursion_limit）/ done（steps、tool_calls、elapsed_ms）/ tool_error / tool_validation / failed（带堆栈）
- [x] 工具层 `_serialized_tool`：每次调用记 start(args)/ok(elapsed_ms、lock_wait_ms、result 摘要)/failed(堆栈)
- [x] `DEEPSEEK_TIMEOUT_SECONDS`（默认 60，env 可调；nginx proxy_read_timeout=120s）
- [x] 测试：test_agent_logging.py 4 例（caplog 断言 start/ok/failed/done 与 exc_info）；既有 timeout 断言改为跟随配置；backend pytest 329 全过
- [x] commit + push ✅ 2026-11-16（fix 9b9b59c / chore ea6302e / docs 82547bd；CI 已记录 82547bd，mobile-only 未重启服务，无 ALERT）
