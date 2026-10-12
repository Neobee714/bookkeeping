# v0.5 发布记录（金流 2.2.0：记账快捷输入）

- 创建时间：2026-10-08 01:10
- 状态：**后端已上线并验证通过**；App 端 APK 待构建（本机缺 JDK/Android SDK，见第 3 节）

## 1. 后端发布（已完成）

| 项 | 值 |
| --- | --- |
| 目标 | 腾讯云生产服务器（IP 见本机运维文档，不随仓库公开）/ `api.bookkeeping.neobee.top` |
| 方式 | 增量：只更新 `backend/` 源码 + 重建 backend 容器 + 执行新迁移（**未动** nginx / compose / 前端 / 数据库数据） |
| 打包 | `powershell -File deploy/pack.ps1` → `bookkeeping-deploy.tar.gz`（0.25 MB，脚本自带泄漏校验） |
| 上传 | `scp -i <本机 SSH 密钥>` → `/tmp/bk-pkg-v05.tar.gz` |
| 同步 | `rsync -a --delete /tmp/bk-pkg-v05/backend/ /opt/bookkeeping/stack/backend/`（服务器侧若有 `backend/.env` 会先备份再还原） |
| 重建 | `sudo -E docker compose up -d --build backend` |
| 迁移 | `sudo -E docker compose run --rm backend python -m alembic upgrade head` |
| 迁移前备份 | `/opt/bookkeeping/dumps/bookkeeping_pre_v05_<时间戳>.sql.gz` |

发布脚本与探针脚本保存在本机临时目录（`%TEMP%\bk-v05\`），未入库；仓库里的
`deploy/pack.ps1`、`deploy/server-deploy.sh`、`deploy/app-distribute/README.md` 为既有链路，未改动。

### 线上验证结果（2026-10-08 01:05~01:10）

| 项 | 结果 |
| --- | --- |
| alembic 版本 | `67f2f7585bb7` → **`d4e6f7a8b9c0`** |
| `user_note_presets` 表 | 已建（`to_regclass` 非空） |
| 账单数据 | `transactions` 仍 **2091** 条，未变化 |
| `/health` | 200（公网 `https://api.bookkeeping.neobee.top/health`） |
| 无令牌访问新接口 | **401**（鉴权生效；公网实测 `quick-inputs` 401 而非 404） |
| `GET /transactions/quick-inputs`（带令牌） | 200，返回 `{success:true,data:{last_date,pinned,by_category}}` |
| 参数边界 | `days=0`/`366`、`per_category=21` → 422；`days=1`/`365&per_category=20` → 200 |
| `POST /transactions/note-presets`（pinned） | 200，备注出现在 `pinned` |
| 同备注 upsert 改 `hidden` | 200，且不再出现在 `pinned` |
| `DELETE /transactions/note-presets` | 首次 `deleted:true`，再次 `deleted:false` |
| 非法入参 | `kind=wrong`、`note=""` → 422 |
| 探针残留 | 探针备注已删除，`user_note_presets` 恢复 0 行 |

> 探针方式：在线上容器内用 `app.core.security.create_access_token` 为既有账号签发临时令牌，
> 通过 `127.0.0.1:8080` 直接调用三个接口，结束后清理。运行探针需
> `docker exec -w /app -e PYTHONPATH=/app`（按路径执行脚本时 `sys.path[0]` 是脚本目录，不带 `/app` 会 `ModuleNotFoundError`）。

### 回滚

- 代码回滚：把上一版 `backend/` 源码重新 `rsync` 回 `/opt/bookkeeping/stack/backend/` 并
  `docker compose up -d --build backend`。
- 迁移回滚：`sudo -E docker compose run --rm backend python -m alembic downgrade 67f2f7585bb7`
  （只删新建的空表 `user_note_presets`，不影响业务数据）。
- 数据回滚：使用第 1 节表格里那份迁移前 dump。

## 2. App 发布（**暂缓** —— 用户 2026-10-08 决定暂不构建 APK）

- 版本号已改好：`mobile/android/app/build.gradle` → `versionCode 220` / `versionName "2.2.0"`。
- 签名链路完整：`keystore/release-signing.properties`（4 个字段齐全）+ `build.gradle` release 已接。

## 3. App 构建工具链与 APK 现状（2026-10-08 更新）

**结论：用户决定暂缓发布 APK（"暂时不要APK"，2026-10-08 16:45）**，因此 2.2.0 未构建、未推 OTA，
`app.xyvora.me` 上仍是 **2.1.2**：手机端暂时看不到本次新增的两个快捷功能（后端已就绪，旧 App 不受影响）。
App 侧代码已随提交 `d81b77a` 推到 GitHub `main`，只等构建发布。

原始阻塞情况（2026-10-08 01:00 实测）：本机无 `java`、无 Android Studio、`local.properties` 指向的 SDK 目录不存在、无 `.gradle` 缓存 → 当时无法构建。

**现已就绪（为下次构建铺好路）：**

| 项 | 位置 / 值 |
| --- | --- |
| JDK | Temurin 17.0.20.1+1 → `C:\Users\13212\tools\jdk-17` |
| Node（RN release 必需） | v24.21.0 → `C:\Users\13212\tools\node`（`settings.gradle` 的 autolink 与 JS bundle 都要 node） |
| Android SDK | `C:\Users\13212\AppData\Local\Android\Sdk`：platform-tools、**platforms;android-37.0**（目录名带 `.0`）、build-tools;37.0.0、ndk;28.2.13676358、cmake;3.22.1 |
| Gradle | wrapper 9.4.1 已下载；代理写在用户级 `C:\Users\13212\.gradle\gradle.properties`（不污染仓库） |
| 签名 | `keystore/release-signing.properties` 齐全，`build.gradle` release 已接（无需改动） |

**已排除的关键坑（否则 `assembleRelease` 必然失败）：**

1. **构建缓存里的陈旧绝对路径**：工程此前在 `F:` 盘构建过，缓存残留 `F:\Work\...` ——
   `mobile/android/build/generated/autolinking/autolinking.json` 内 32 处，且该文件只在
   `package.json` / `package-lock.json` 的 hash 变化时才重新生成，会持续复用旧路径。首次构建报
   `Configuring project ':react-native-safe-area-context' without an existing directory is not allowed` 即由此而来。
   已清除 git-ignored 的 `app/build`、`build`、`app/.cxx`、`.gradle` 让缓存重建（复验 `F:\Work` 残留 0 处）。
2. **⚠️ Windows 260 字符路径上限（MAX_PATH）** —— 本机最致命的坑：RN 新架构的 CMake 对象目录很长，
   而工程路径从 `F:\Work\Program\Python\bookkeeping`（**34** 字符）搬到了 `C:\Users\13212\Work\Program\Python\bookkeeping`
   （**46** 字符），多出的 12 字符让某条 `mkdir` 路径达到 **282 字符**，超限后报
   `ninja: error: mkdir(safeareacontext_autolinked_build/.../C_/Users/13212/.../react-native-safe-area-context): No such file or directory`。
   这也解释了"`arm64-v8a` 编过、名字更长的 `armeabi-v7a` 挂掉"（只差几个字符）。
   **解决**：建目录联接 `C:\bk` → 工程根（`New-Item -ItemType Junction`），从 `C:\bk\mobile\android` 构建，
   前缀从 46 降到 5 字符（该 `mkdir` 路径回到约 200 字符）。联接在仓库之外、不改任何项目文件，
   产物仍落在同一物理目录（`mobile\android\app\build\outputs\apk\release\app-release.apk`）。
   同理：清 `.cxx` 时用 `cmd /c rd /s /q`（长路径 + 只读属性会让 `Remove-Item` 半途而废）。

**下次发布步骤**（工具链已在位；内存紧张时先关掉占内存的程序）：

```powershell
$env:JAVA_HOME = 'C:\Users\13212\tools\jdk-17'
$env:PATH = "C:\Users\13212\tools\node;$env:JAVA_HOME\bin;$env:PATH"
cd mobile\android
.\gradlew.bat assembleRelease          # 产物：app\build\outputs\apk\release\app-release.apk
# 校验：build-tools\37.0.0\apksigner.bat verify --print-certs + aapt2 dump badging
# 期望：com.neobee.bookkeeping / versionCode 220 / versionName 2.2.0 / 签名 CN=Neobee
```

⚠️ **发布前必须重新校验**：`mobile\android\app\build\outputs\apk\release\` 里 2026-08-16 那个
76,728,113 字节的 APK 是 **2.1.2（versionCode 212）**，不要误当成 2.2.0 发出去。

## 4. 后续 OTA 发布命令（工具链就绪后）

```bash
# 1) 构建（本机 mobile/android 目录）
.\gradlew.bat assembleRelease
# 产物：mobile/android/app/build/outputs/apk/release/app-release.apk

# 2) 上传到服务器
scp -i <本机 SSH 密钥> app-release.apk ubuntu@<生产服务器 IP>:/tmp/

# 3) 发布（服务器端一条命令；详见 deploy/app-distribute/README.md）
sudo bash /opt/bookkeeping/distribute/publish.sh /tmp/app-release.apk 2.2.0 \
  --app bookkeeping --name "金流" --desc "双人记账" \
  --changelog "新增：记账时一键套用上次日期；备注常用项快捷选择（自动推荐+收藏，可长按管理）"

# 4) 验证
curl -s https://app.xyvora.me/bookkeeping/info.json | head -20
```

建议真机重点验证（无模拟器环境的已知风险点）：

1. 日期行内点击「同上次」chip **不会同时打开**原生日期选择器（嵌套 Pressable 命中）。
2. 备注 chips 行在窄屏**不换行**、不撑高弹层。
3. 深色主题下淡紫推荐 chip 可读（`chipSoftBg`/`chipSoftText`）。
4. 断网/500 时点「＋收藏」「取消收藏」「不再推荐」→ 出现提示且列表**不发生变更**。

## 5. 附：发布日服务器巡检（2026-10-08 01:14，只读）

| 项 | 现状 |
| --- | --- |
| 主机 | Ubuntu 24.04 VM，up 8 天，load 0.23；内存 1.9G（用 708M，可用 1.2G）+ swap 3.9G；磁盘 40G 用 27% |
| Docker | `bookkeeping-backend`（新镜像 467MB，up 数分钟）、`neobee-db`（PostgreSQL 16，healthy 8 天）；卷 `stack_postgres_data`、`stack_releases_data` |
| 磁盘占用 | `/var/lib/docker` 689M、`/opt/bookkeeping` 2.9M、`/var/www` 148M；**构建缓存 932MB（可回收 464MB）** |
| 数据 | users=6、transactions=2091、categories=49、note_presets=0 |
| 后端日志 | 无 error/traceback；仅有本次探针请求记录 |
| 配置项 | 除 **`DEEPSEEK_API_KEY` 为空** 外全部已设置（`DATABASE_URL`/`SECRET_KEY`/`CORS_EXTRA_ORIGINS`/`APP_RELEASES_*` 等） |
| nginx | `nginx -t` 通过；启用 `bookkeeping`、`app-xyvora` 两个站点 |
| 证书 | `api.bookkeeping.neobee.top` 有效期至 **2026-12-28**，`certbot.timer` 正常（下一次 01:29） |
| 监听 | 80/443（nginx）、`127.0.0.1:18080`（docker-proxy→后端）；5432 未对外暴露；ufw inactive（入站由腾讯云安全组控制） |
| 对外接口 | `health` 200、`transactions/quick-inputs` 无令牌 401 |
| OTA 站 | `/var/www/apps/bookkeeping/` 仅 `2.1.2`（76.7MB，含 `latest.apk`/`info.json`/`meta.json`/`qr.png`），`info.json` = 2.1.2 |
| 备份 | `/opt/bookkeeping/dumps/`：基线 `bookkeeping_20260527_194951.sql.gz` + 本次 `bookkeeping_pre_v05_20261008_010320.sql.gz` |

### 巡检发现的待办（未擅自改动）

1. ✅ **残留失败单元已清理**（`bookkeeping-relay.service`，2026-10-08 12:42 `systemctl reset-failed`；现 `systemctl --failed` 为 0 项）。
2. **Docker 构建缓存 932MB（可回收 464MB）**，需要时 `sudo docker builder prune`。
3. ✅ **`DEEPSEEK_API_KEY` 已填入并验证**（2026-10-08 16:30）：写入 `/opt/bookkeeping/stack/.env`（先备份）后
   `sudo -E docker compose up -d --force-recreate backend`；实测基础对话正常，且能调用 `search_transactions`
   回答"最近一笔账"。备份在服务器 `/tmp/stack-env-backup-*`（含数据库口令，勿外传，可自行删除）。

## 10. 修订记录

| 时间 | 变更说明 |
| --- | --- |
| 2026-10-08 01:10 | 创建发布记录（后端增量上线 + 线上验证 + 回滚说明） |
| 2026-10-08 01:14 | 追加服务器巡检记录与 3 项待办 |
| 2026-10-08 16:50 | 更新 APK 现状：用户决定**暂缓发布 2.2.0**；补记已装好的构建工具链与已排除的 F: 盘缓存坑；两项待办（残留失败单元、DeepSeek 密钥）标记完成 |

