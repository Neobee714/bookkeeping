# v0.18 回滚手册

结论先说：

- **基础设施层有回滚能力**：后端可按提交回退，迁移是加法式的；APK 历史包都在服务器；OTA 可以发「旧代码 + 更高版本号」的回滚包。
- **没有一键回滚按钮**，也没有远程功能开关；App 回滚要重新出包。
- **数据层已补**：v0.18 起整理旧备注按批次记录原值/新值，整理页顶部可以「撤销上次整理」；仍建议发布前手动 dump 一份。

## 现状盘点（2026-11-12）

| 项 | 状态 |
| --- | --- |
| 线上 App | 2.8.0（versionCode 234），`app.xyvora.me/bookkeeping/info.json` |
| 服务器 APK 归档 | `2.1.2` ～ `2.8.0` 全部保留，共 14 个包，约 1.2G |
| 线上后端 | `ce311ac`（2026-11-11 09:35 部署成功） |
| CI | `bk-deploy.timer` 每 2 分钟轮询 `main`；迁移前自动 `pg_dump`，保留最近 5 份 `pre-deploy_*` |
| 当前工作区 | 代码 `cbf3e27`、docs 已提交；App 2.8.0 已发 OTA |
| 远程开关 | 无。新 UI 是否出现取决于 APK 版本 |
| 旧备注整理 | 会把 `note` 移到 `merchant/item` 并清空；**有批次日志，可整批撤销** |

注意：CI 以 `ubuntu` 用户运行；`sudo /opt/bookkeeping/ci/deploy.sh --status` 用 root 读仓库会报
dubious ownership，应执行 `sudo -u ubuntu /opt/bookkeeping/ci/deploy.sh --status`。
2026-11-12 已用 ubuntu 身份验证 `git fetch origin main` 正常。

## 回滚矩阵

| 场景 | 回滚动作 | 数据影响 |
| --- | --- | --- |
| 新 UI 不好用 / 崩溃 / 交互太重 | **只回滚 App**：从 2.6.1 提交重新构建，版本号改成 2.8.1 / 235，发 OTA | 数据不动；后端保留新代码也兼容老 App |
| 新接口 500 / 性能差 | **回滚后端**：revert 发布提交并 push，CI 自动部署上一版 | 迁移是加列/加表，老代码可在新库上跑；**不要 downgrade** |
| 迁移本身有错 / 数据被写坏 | 用 `pre-deploy_<sha>_*.sql.gz` 恢复 | 会丢快照之后的写入；恢复前先另存当前库 |
| 整理旧备注点错 / 批量应用错 | 整理页顶部「撤销上次整理」；只恢复仍保持整理后状态的行 | 整理后又被编辑过的行会跳过；不会覆盖新改动 |
| nginx 配置改坏 | 恢复改前备份，`nginx -t` 通过再 reload | 无 |
| OTA 清单写坏 | 用服务器上的旧 APK/清单重新 `publish.sh`；或先修 `info.json` | 无 |

## App 回滚（推荐优先做这一层）

因为后端 v0.18 只加可空列，**老 App 可以继续用新后端**；所以「新 UI 不好用」时只需要回滚 App。

1. 不要在脏工作区直接切分支。用独立 worktree 取上一个稳定提交：

   ```bash
   cd ~/Documents/Private/bookkeeping
   git worktree add /tmp/bk-rollback ce311ac
   ```

2. 在 worktree 里只改版本号：

   ```bash
   cd /tmp/bk-rollback/mobile/android/app
   # versionCode 235 / versionName "2.8.1"
   ```

   版本号必须比出问题的版本**更高**：Android 不允许降级安装，OTA 也只认更高的
   `versionName`。回滚包会占掉一个版本号，下一个正常版本至少要是 2.8.2 / 236。

3. 用同一套 keystore 构建 release APK，校验签名和 SHA-256 与本地一致。
4. 把 APK 传到服务器，用既有发布脚本发 OTA：

   ```bash
   sudo bash /opt/bookkeeping/distribute/publish.sh <apk> 2.8.1 \
     --app bookkeeping --name "拾光" --desc "回滚到 2.6.1 界面" \
     --changelog "回滚：移除商家/菜品/评价入口，数据保留"
   ```

5. 回验 `info.json` 的 `version`、`latest.apk` 的 SHA-256、下载页；在自己的手机上走一遍
   「检查更新 → 下载 → 安装」。如果不强制，用户可以选择不升级；确认要全员回滚时再把
   `info.json` 的 `force` 设为 `true`（会打扰用户，慎用）。

服务器上的旧 APK（如 `bookkeeping-2.6.1.apk`）可以用于**手动**降级排障：
`adb install -r -d`，或卸载重装；普通用户不要走这条路，卸载会清本地缓存。

## 后端回滚

1. 先确认 CI 能拉到远端：`sudo /opt/bookkeeping/ci/deploy.sh --status`。
2. 用 revert 生成一个**新提交**，不要改写 main 历史：

   ```bash
   git revert --no-edit <发布提交>
   git push origin main
   ```

   如果发布包含多个提交，用 `git revert --no-commit <first>^..<last>` 后合并成一个
   `revert:` 提交再 push。CI 在 2 分钟内会按新提交部署。
3. 迁移不回退。v0.17 加的两张表、v0.18 加的三个可空列，对老代码都是透明列；
   `alembic downgrade` 会删掉用户已经填的商家/菜品，**不要为了回滚代码去 downgrade**。
4. 部署后看 `/health`、`docker compose logs -f backend`、`/var/log/bk-deploy.log`；
   `deploy.sh` 失败会写 `state/ALERT.txt` 并停止自动重试，修好后 `--retry`。

如果是**后端已经回滚、App 还是新版**：新 App 的商家/菜品统计、整理页、财报吃喝卡会
请求不存在的接口，表现为「暂时无法加载」或报错；账单本身不受影响。要彻底回到旧体验，
再按上一节发 App 回滚包。

## 数据库恢复（最后手段）

`deploy.sh` 每次后端部署前都会在 `/opt/bookkeeping/dumps/` 留
`pre-deploy_<sha>_<timestamp>.sql.gz`，另有每日 dump。恢复会覆盖当前库：

1. 先另存当前库（不要跳过）。
2. 停写入（停后端容器或切维护页）。
3. 按 `deploy/server-deploy.sh` 的恢复流程导入指定 dump；**不要**直接跑
   `server-deploy.sh`，它会做全量重建。
4. 起后端、跑 `/health`、抽查最近 7 天账单和报告。
5. 恢复后确认 `alembic current` 与代码版本匹配；不匹配时先 `upgrade head`。

现有 dump 全部在同一台服务器上，服务器整机故障时不可用。发布前应手动拉一份到本地或
另一台机器；这是当前备份策略的短板。

## 发布前的安全动作

- [ ] 手动 dump 一份并下载到本地（不要只留在 `/opt/bookkeeping/dumps`）
- [ ] 记录当前线上版本 / 提交 / APK SHA-256
- [ ] 保留 2.6.1 的 APK、keystore、`info.json` 备份
- [ ] 先发后端（加法迁移，老 App 不受影响），观察 1～2 天再发 APK
- [ ] 首次 APK 只给自己/家人装，`force: false`，跑一周再考虑全量
- [ ] 真出问题时**先回滚 App，再考虑回滚后端**；数据恢复放最后
- [ ] 回滚包发完后，确认下一次正常发布的版本号高于回滚包

## 已实现：整理旧备注的撤销

- 表 `note_cleanup_batches`：一次保存一条批次（user_id、batch_key、affected_count、created_at、undone_at）。
- 表 `note_cleanup_items`：每个受影响 transaction 的原值与新值（merchant/item/note/note_kind）。
- App 在一次保存里给多条 `reclassify` 传同一个 `batch_key`，服务端归入同一批次。
- `POST /transactions/notes/undo`：按 `batch_id` 恢复；不传则撤销最近一批。
- 只恢复「当前值 == 该批次 new_*」的行；整理后又被编辑过的行计入 `skipped`，不覆盖。
- 整理页顶部显示「上次整理 · 时间 · 条数」+「撤销」；离线时禁用。
- 撤销不回溯已生成的财报快照；只恢复账单字段。

因此「整理错了」不再需要恢复整库。发布前仍建议手动 dump 一份，作为整机/迁移故障的最后手段。
