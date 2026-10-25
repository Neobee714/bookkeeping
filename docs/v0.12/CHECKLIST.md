# v0.12 清单：分类刷新与弹层滚动

- 创建时间：2026-10-25 23:22
- 版本：2.4.3 / versionCode 227

## 阶段 1：定位

- [x] CategoryScreen 新增后只刷新自己，不写 `categories` 缓存 ✅
- [x] AddTransactionSheet `categoriesLoaded` 一次性门闩，重开不请求 ✅
- [x] HomeScreen 只在挂载时拉分类，返回首页不刷新 ✅
- [x] AddTransactionSheet `sheetWrap` 无 flex、ScrollView 无 flexShrink；Android KAV 未避让 ✅

## 阶段 2：修复

- [x] AddTransactionSheet：去掉 `categoriesLoaded`，每次 visible 拉分类 ✅
- [x] AddTransactionSheet：sheetWrap flex:1、sheet/ScrollView flexShrink:1 ✅
- [x] AddTransactionSheet：Android KAV 改 height；有缓存时不显示整块 spinner ✅
- [x] HomeScreen：改用 useFocusEffect 刷新分类 ✅
- [x] CategoryScreen：load() 写回 categories 缓存 ✅
- [x] 版本 2.4.3 / 227 ✅

## 阶段 3：门禁

- [x] `tsc --noEmit` 0 错误 ✅ 2026-10-25 23:18
- [x] `jest` 8 suites / 37 tests 全过 ✅
- [x] `eslint` 0 errors（12 warnings）✅
- [x] `assembleRelease` 成功（55s）✅
- [x] versionCode 227 / 2.4.3、label 拾光、v2 签名、证书一致 ✅
- [x] APK SHA-256 `cbd14a5a04a9882916b7628e2bf777109c61462fc0a34ca91adadae01651c802` ✅

## 阶段 4：发布

- [x] `publish.sh` 发布 2.4.3；info.json 回验 ✅ 2026-10-25 23:20
- [x] latest.apk content-length 76,853,169；归档 `bookkeeping-2.4.3.apk` ✅
- [ ] 真机验证：新增分类后立即出现在记一笔
- [ ] 真机验证：4-5 行分类可下滑到最后一行，键盘打开时也可选

## 阶段 5：收尾

- [x] `docs/v0.12/{REQ,ARCH,CHECKLIST}.md` ✅
- [x] `docs/v0.12/DEPLOY-RELEASE.md` ✅
- [x] 更新 skill（分类缓存刷新 + 弹层滚动/键盘坑）✅ 2026-10-25 23:24
- [ ] 用户确认后勾选真机项
