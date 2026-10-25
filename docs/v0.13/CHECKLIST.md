# v0.13 清单：首页语音记账

- 创建时间：2026-10-25 23:37
- 版本：2.5.0 / versionCode 228

## 阶段 1：方案确认

- [x] 用户选择方案 B：首页 + 号长按语音 ✅ 2026-10-25 23:28
- [x] 系统识别（不动后端）✅
- [x] 必须确认后入账 ✅
- [x] 第一版只记自己 ✅

## 阶段 2：本地解析

- [x] `voice/parseTransaction.ts`：金额/中文数字/日期/类型/分类/备注 ✅
- [x] `voiceParse.test.ts` 11 个用例全过 ✅ 2026-10-25 23:30
- [x] 千分位、数量词过滤、口语“一百八”处理 ✅

## 阶段 3：原生语音

- [x] `VoiceModule.kt`：SpeechRecognizer + Promise + 部分转写/状态事件 ✅
- [x] `VoicePackage.kt` 注册；`MainApplication` 添加 ✅
- [x] Manifest：RECORD_AUDIO + RecognitionService queries ✅
- [x] `compileReleaseKotlin` 通过 ✅ 2026-10-25 23:32

## 阶段 4：UI 接入

- [x] `VoiceTransactionSheet.tsx`：权限/识别/解析/错误/重说 ✅
- [x] 首页 FAB 长按打开，单击仍手动记账，防长按后误触 ✅
- [x] FAB 加麦克风小徽标 + accessibilityHint ✅
- [x] `AddTransactionSheet` 支持 `initialDraft` 预填 + 语音提示条 ✅

## 阶段 5：门禁

- [x] `tsc --noEmit` 0 错误 ✅
- [x] `jest` 9 suites / 48 tests 全过 ✅
- [x] `eslint` 0 errors（10 warnings）✅
- [x] `assembleRelease` 成功（36s）✅
- [x] versionCode 228 / 2.5.0、label 拾光、v2 签名、证书一致 ✅
- [x] APK SHA-256 `55ca8a5c1ad74d02b658cdc6d75727d7b36363f3a5d004497efc4e6d24957bcc` ✅

## 阶段 6：发布

- [x] `publish.sh` 发布 2.5.0；info.json 回验 ✅ 2026-10-25 23:34
- [x] latest.apk content-length 76,876,465；归档 `bookkeeping-2.5.0.apk` ✅
- [ ] 真机：长按 + 号说「早餐十八块」→ 确认页金额/分类/日期正确
- [ ] 真机：说「昨天打车花了35」「发工资5000」
- [ ] 真机：拒绝麦克风权限、系统无语音服务时的提示
- [ ] 真机：单击 + 号仍直接打开手动记账

## 阶段 7：收尾

- [x] `docs/v0.13/{REQ,ARCH,CHECKLIST}.md` ✅
- [x] `docs/v0.13/DEPLOY-RELEASE.md` ✅
- [x] 更新 skill（语音记账架构与坑）✅ 2026-10-25 23:39
- [ ] 用户确认后勾选真机项
