# v0.18 发布说明

版本：**2.8.0 / versionCode 234**
本版本与 v0.17（2.7.0，财报总结）一起发布；用户已明确要求发 OTA。

> 2.8.0 之后的补丁见 `docs/v0.18/PATCH-2.8.1.md`（循环记账即时同步、项目文案、版本 2.8.1 / 235）。

## 发布前

1. **nginx 白名单**：`api.neobee.top` 的 vhost 加 `/reports`，否则财报接口会落进 301 下载页。
   `/transactions`、`/stats` 已存在，无需新增。改前 `cp -a` 备份，`nginx -t` 通过再 reload。
2. 后端 push 后由 `bk-deploy.timer` 自动执行三条迁移：
   - `a4b7c2d9e6f1_add_report_tables`（v0.17 财报）
   - `c7f1a2b3d4e5_add_transaction_merchant_item`（v0.18 商家/菜品/评价）
   - `d8e2f4a6b9c1_add_note_cleanup_logs`（v0.18 整理撤销）
3. 探活：`curl https://api.neobee.top/health` 期望 200；`/reports`、`/transactions/notes/undo`
   期望 401（未登录）而不是 301。
4. APK 2.8.0 / 234 构建后按 `bookkeeping-app-iteration` 流程校验包名/签名/sha256，上传 OTA。
5. 真机验收：
   - 记一笔填商家、吃了什么、评价 → 保存 → 列表显示三项；
   - 图表切商家/菜品 → 金额/次数/人均；菜品档出现「旧备注 N 条未整理」；
   - 整理一条旧备注为商家 → 排行出现该店、账单金额/日期不变；
   - 顶部出现「上次整理 · N 条」→ 点撤销 → 账单恢复、排行回退；
   - 整理后编辑其中一条再撤销 → 被编辑的条目跳过；
   - 财报详情出现「吃喝」卡；
   - 四套皮肤目检（极光/糖果/霓虹/浮雕）。

## 发布命令

```bash
# 1. 本地门禁
cd backend && .venv/bin/python -m pytest -q
cd mobile && npx tsc --noEmit && npx jest && npx eslint .

# 2. 后端（push 后 CI 自动；或手动立即触发）
git push origin main
sudo systemctl start bk-deploy.service

# 3. APK
cd mobile/android && ./gradlew assembleRelease
aapt2 dump badging app/build/outputs/apk/release/app-release.apk | head
apksigner verify --print-certs app/build/outputs/apk/release/app-release.apk
shasum -a 256 app/build/outputs/apk/release/app-release.apk

# 4. OTA（APK 已上传服务器后）
sudo bash /opt/bookkeeping/distribute/publish.sh <apk> 2.8.0 \
  --app bookkeeping --name "拾光" --desc "双人记账" \
  --changelog "财报总结；商家/吃了什么/评价；旧备注整理可撤销"
curl -s https://app.xyvora.me/bookkeeping/info.json

# 5. 回验
curl -s -o /dev/null -w '%{http_code}' https://api.neobee.top/health   # 200
curl -s -o /dev/null -w '%{http_code}' https://api.neobee.top/reports  # 401
```

## 本次发布记录（2026-11-12）

| 项 | 结果 |
| --- | --- |
| 后端提交 | `61403c9`，CI 2026-11-12 16:49:51 部署成功（总耗时 1m 3s） |
| 数据库迁移 | `a4b7c2d9e6f1` / `c7f1a2b3d4e5` / `d8e2f4a6b9c1`，`alembic current` = `d8e2f4a6b9c1` |
| 迁移前快照 | `/opt/bookkeeping/dumps/pre-deploy_61403c9_20261112_164926.sql.gz`，已另存到本机 `~/bookkeeping-backups/` |
| nginx | `api-neobee` / `bookkeeping` 均加 `reports`；备份 `*.bak.20261112_165010`；`nginx -t` 通过后 reload |
| 探活 | `/health` 200；`/reports` 401；`POST /transactions/notes/undo` 401（未登录）；`/stats/breakdown` 401 |
| APK | 76,987,569 字节；versionCode 234 / versionName 2.8.0；label「拾光」 |
| APK SHA-256 | `e991fd2f75d3b93f784b93729a7af007f978551aa150835177de3084c53c5b35` |
| 签名 | `CN=Neobee`，证书 SHA-256 `d8d8202e…f6c06c`，与旧版一致 |
| OTA | `info.json` version 2.8.0、size 76987569、force false；`latest.apk` 与归档 `bookkeeping-2.8.0.apk` 哈希一致 |
| 真机 | 发布时 `adb devices` 无设备连接，**未完成真机验收**；需在 vivo 上补跑更新、记账、整理、撤销、财报五项 |

## 回退

完整的回滚矩阵、App 回滚包构建步骤和数据库恢复注意事项见 `docs/v0.18/ROLLBACK.md`。

- App：OTA 保留上一版；versionCode 不回退，必要时发更高 versionCode 的修复版。
- 后端：部署上一提交。v0.17/v0.18 迁移只加表/加可空列，回退代码不会破坏账单数据；
  `downgrade` 会删用户已填的商家/菜品和撤销日志，**不要为了回滚代码去 downgrade**。
- 整理动作现在有批次日志，整理页顶部可撤销；整理后又被编辑过的行会跳过。

## 已知边界

- 商家/菜品排行与财报吃喝洞察只统计「餐饮」分类。
- 旧备注整理前不计入排行；整理不自动猜，需用户逐条确认。
- 语音记账仍把识别文本放进「评价」。
- 整理页每次最多展示 50 个旧备注，保存后可再次进入。
- 撤销不回溯已生成的财报快照，只恢复账单字段。
- 发布后请在下面记录实际字节数、SHA-256、发布时间和真机验收结果。
