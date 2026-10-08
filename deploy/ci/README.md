# 金流 · 推送即自动部署（CI/CD）v0.6

把「改了代码 → 线上生效」压缩成一次 push：VPS 每 2 分钟自己 `git fetch` 一次 `main`，
有新提交就按**变更目录**决定动作（后端重建+迁移 / 前端重建+发布 / nginx 校验后 reload），
没有新提交就零开销退出；任何一步失败就**停下来写 ALERT 并停止重试该提交**，等人工处理。

- 需求与验收：`docs/v0.6/REQ.md`、`docs/v0.6/ARCH.md`、`docs/v0.6/CHECKLIST.md`
- 本目录是流水线的**版本存档**；服务器上真正运行的是 `/opt/bookkeeping/ci/` 里的副本

## 1. 文件组成

| 文件 | 作用 |
| --- | --- |
| `deploy.sh` | 主脚本：锁 → 拉取 → 变更判定 → 后端/前端/nginx 部署 → 状态与失败处理 |
| `install.sh` | 幂等安装：建目录、拷脚本、生成 `ci.env`、克隆仓库、装 systemd 单元、首跑 `--status` |
| `uninstall.sh` | 停用并删除单元（`--purge` 才删 `/opt/bookkeeping/ci`） |
| `bk-deploy.service` | oneshot 服务：`ExecStart=/opt/bookkeeping/ci/deploy.sh`，日志 append 到 `/var/log/bk-deploy.log` |
| `bk-deploy.timer` | 定时器模板：开机后 3 分钟首跑，之后每 `POLL_INTERVAL`（默认 2min）一次 |
| `ci.env.example` | 配置模板（安装时复制为 `/opt/bookkeeping/ci/ci.env`） |

## 2. 架构

```
 你的开发机 ──git push──▶ GitHub: Neobee714/bookkeeping (public, main)
                                   │  git fetch（每 2 分钟，匿名 HTTPS，无凭据）
                                   ▼
 ┌──────────────── VPS（生产服务器，IP 见运维文档）──────────────┐
 │ systemd: bk-deploy.timer ──▶ bk-deploy.service (oneshot)      │
 │                                   │ ExecStart                 │
 │                                   ▼                           │
 │  /opt/bookkeeping/ci/deploy.sh （在仓库之外，不随仓库自更新）    │
 │    1 flock 互斥（上一轮没结束就跳过）                           │
 │    2 fetch → 目标 SHA；与 state/last-deployed.txt 相同即返回    │
 │    3 变更路径集合（git diff --name-only 上次成功..目标）        │
 │    4a backend/**  → rsync(保留 .env) → compose build           │
 │                     → pg_dump 快照 → alembic upgrade head     │
 │                     → compose up -d backend → /health 探活     │
 │    4b frontend/** → rsync(保留 node_modules) → 按需 npm ci     │
 │                     → 复用 deploy-build-frontend.sh → /var/www │
 │    4c deploy/nginx.conf → 复制 → nginx -t 通过才 reload（否则回滚）│
 │    5 成功：写 last-deployed.txt、清 failed-sha/ALERT            │
 │      失败：写 failed-sha.txt + ALERT.txt，退出 1，不再自动重试   │
 │                                                                │
 │  /opt/bookkeeping/repo          git 工作副本（reset --hard 镜像）│
 │  /opt/bookkeeping/ci/state/     状态文件                        │
 │  /opt/bookkeeping/stack/        既有 compose 运行目录（部署产物）│
 │  /opt/bookkeeping/dumps/        迁移前快照（保留最近 5 份）      │
 │  /var/www/frontend              前端静态产物（nginx 服务）       │
 └────────────────────────────────────────────────────────────────┘
```

## 3. 安装

```bash
# 方式一：服务器上已有本目录副本（推荐，先从本机上传 deploy/ci/）
sudo bash /opt/bookkeeping/ci/install.sh

# 方式二：仓库里已提交 deploy/ci/，直接让服务器自己拉
sudo bash install.sh --from-github
```

安装脚本做的事（**可重复执行，幂等**）：

1. 建 `/opt/bookkeeping/ci`、`ci/state`、`/opt/bookkeeping/dumps`
2. 拷脚本与单元文件（`chmod +x`），**已存在的 `ci.env` 永不覆盖**
3. `ci.env` 缺失时由 `ci.env.example` 生成
4. 克隆仓库到 `/opt/bookkeeping/repo`（已存在则只确认 `origin`，并确保属主是 `ubuntu`）
5. 创建 `/var/log/bk-deploy.log` 并 `chown ubuntu:ubuntu`
6. 用 `ci.env` 的 `POLL_INTERVAL` 渲染 `bk-deploy.timer`（模板占位符 `__POLL_INTERVAL__`）
7. `systemctl daemon-reload` → `enable --now bk-deploy.timer` → `restart`（让新周期立即生效）
8. 首跑 `deploy.sh --status`（只读，不改任何东西）

## 4. 配置（`/opt/bookkeeping/ci/ci.env`）

| 键 | 默认值 | 说明 |
| --- | --- | --- |
| `BRANCH` | `main` | 只部署这个分支 |
| `REPO_URL` | `https://github.com/Neobee714/bookkeeping.git` | 公开仓库，匿名拉取 |
| `REPO_DIR` | `/opt/bookkeeping/repo` | git 工作副本 |
| `STATE_DIR` | `/opt/bookkeeping/ci/state` | 状态文件目录 |
| `STACK_DIR` | `/opt/bookkeeping/stack` | compose 运行目录 |
| `FRONTEND_SRC` | `/opt/bookkeeping/frontend` | 前端源码（含 `node_modules`） |
| `FRONTEND_PUBLISH` | `/var/www/frontend` | 前端静态发布目录 |
| `PUBLIC_HOST` | `api.bookkeeping.neobee.top` | 烘焙进前端产物的 API 域 |
| `DUMP_DIR` | `/opt/bookkeeping/dumps` | 迁移前快照目录 |
| `KEEP_DUMPS` | `5` | 保留最近几份自动快照（只清理 `pre-deploy_*`） |
| `LOG_FILE` | `/var/log/bk-deploy.log` | 部署日志 |
| `HEALTH_URL` | `http://127.0.0.1:18080/health` | 后端探活地址 |
| `POLL_INTERVAL` | `2min` | timer 周期（改完要重跑 `install.sh` 才生效） |

改完 `ci.env` 后执行 `sudo bash /opt/bookkeeping/ci/install.sh` 让周期等设置生效（不会覆盖你的 `ci.env`）。

**高级覆盖项**（一般不用，仅测试/迁移时用环境变量传；不写进 `ci.env`）：
`CI_CONFIG`（配置文件路径）、`BK_DEPLOY_LOG_TO_FILE`（`0`=脚本不写日志文件，交给 systemd 的 `append:`；
`1`=脚本自己追加写；不设则自动判定，规则见第 9 节第 7 条）、`FRONTEND_BUILD_SCRIPT`（默认 `/opt/bookkeeping/deploy-build-frontend.sh`）、
`NGINX_SITE`（默认 `/etc/nginx/sites-available/bookkeeping`）、`NGINX_SERVICE`（默认 `nginx`）、`UNIT_DIR`（默认 `/etc/systemd/system`）。

## 5. 日常运维

```bash
# 看状态：仓库 HEAD / origin 分支 / 最近成功 / 失败记录 / 是否需要部署 / timer / 最近快照
sudo /opt/bookkeeping/ci/deploy.sh --status

# 不等下一个周期，立刻部署一轮
sudo systemctl start bk-deploy.service

# 看日志（systemd 与脚本都写同一个文件）
tail -f /var/log/bk-deploy.log
journalctl -u bk-deploy -n 50 --no-pager

# 看下一次触发时间
systemctl list-timers bk-deploy.timer

# 临时停掉 / 恢复自动部署（比如手动调试服务器时）
sudo systemctl disable --now bk-deploy.timer
sudo systemctl enable --now bk-deploy.timer

# 只想看这一轮会做什么（不产生任何副作用：不 clone/reset/rsync/build/迁移/重启/写状态）
sudo /opt/bookkeeping/ci/deploy.sh --dry-run
```

退出码：`0` = 成功或无事可做（含「无需部署」「另一轮进行中，跳过」）；`1` = 部署失败（已写 ALERT）；`2` = 参数或配置错误。

## 6. 失败处理（重要）

失败语义是**停手**：某次提交失败后，脚本写下 `state/failed-sha.txt` 与 `state/ALERT.txt`，
之后每一轮看到目标提交仍是这个失败提交时，只打印一行「该提交上次部署失败，已停止自动重试（--retry 可重试）」并退出 1，
**不会反复重建/重启**（避免每 2 分钟折腾一次服务器）。

处理方式二选一：

```bash
# 1) 修好代码后 push 新提交（推荐）：下一轮会自动继续
#    注意：新提交会被拿来和「上次成功」比对，因此修好的那次改动会被一起重新部署
# 2) 想原地重试同一个提交（例如服务器侧偶发问题已排除）
sudo /opt/bookkeeping/ci/deploy.sh --retry
```

查看失败原因：`cat /opt/bookkeeping/ci/state/ALERT.txt`（一行摘要：时间 + 步骤 + 提交 + 日志位置 + 建议）。

数据库快照：每次后端部署在迁移前自动 `pg_dump` 到 `$DUMP_DIR/pre-deploy_<短SHA>_<时间>.sql.gz`，
只保留最近 `KEEP_DUMPS` 份；**基线 dump（`bookkeeping_20260527_194951.sql.gz` 之类）不会被清理，也不会被使用**。
本流水线**不自动回滚**数据库，恢复由人工执行（`gunzip -c <快照> | docker exec -i neobee-db psql -U neo -d bookkeeping` 之类，请先确认再执行）。

## 7. 卸载

```bash
sudo bash /opt/bookkeeping/ci/uninstall.sh          # 停用并删除 systemd 单元，保留仓库/状态/日志
sudo bash /opt/bookkeeping/ci/uninstall.sh --purge  # 再删掉 /opt/bookkeeping/ci（含状态文件）
```

卸载**不会**动：`/opt/bookkeeping/repo`、`/var/log/bk-deploy.log`、`/opt/bookkeeping/stack`、
`/var/www/frontend`、`/opt/bookkeeping/dumps`。要彻底还原线上，需另外手动处理这些目录。

## 8. 故障处理速查

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 日志每 2 分钟一行「该提交上次部署失败…」 | 失败提交处于停手状态（设计如此） | 看 `state/ALERT.txt`，修好后 push 新提交；或 `--retry` |
| 日志一行「另一轮部署进行中，跳过」 | 上一轮还没跑完（例如前端首次 `npm ci`） | 正常，等下一轮；若长期如此看 `journalctl -u bk-deploy` |
| 一直「无需部署」但线上没更新 | 该提交只改了 `mobile/`、`docs/` 等不部署路径 | 看 `--status` 的 `最近成功` 与 `git log`；需要部署就改 `backend/`/`frontend/` |
| 前端失败：目录不可写 / npm 报 EACCES | `/opt/bookkeeping/frontend` 属主不是 `ubuntu` | `sudo chown -R ubuntu:ubuntu /opt/bookkeeping/frontend` |
| 后端失败：`/opt/bookkeeping/stack/backend/.env` 丢失 | rsync 覆盖且备份还原失败（脚本会紧急还原并告警） | 检查 `state/.env.backup.*`，从服务器备份恢复 `.env` |
| nginx 失败：`nginx -t` 不通过 | `deploy/nginx.conf` 写错了 | 线上配置已自动回滚（备份留在 `/tmp/nginx-bookkeeping.<pid>.bak`），修好后 push |
| `--status` 里 `是否需要部署: 未知` | 服务器无法 fetch（网络/仓库权限） | 检查 `git -C /opt/bookkeeping/repo fetch origin main` 的报错 |
| 部署被 systemd 砍掉 | 超过 `TimeoutStartSec=1800`（30 分钟） | 日志里有「收到 TERM 信号」，并会写 ALERT；查是哪一步慢（通常是首次 `npm ci`） |
| 仓库目录不可写 / 提示运行 install.sh | `/opt/bookkeeping/repo` 属主不是 `ubuntu` | `sudo bash /opt/bookkeeping/ci/install.sh`（会修正属主） |
| 日志每行出现两遍 | `bk-deploy.service` 里的 `Environment=BK_DEPLOY_LOG_TO_FILE=0` 被删掉了 | 加回来（或 `--status` 看「日志」一行的判定依据是否为 `explicit`），重装：`sudo bash /opt/bookkeeping/ci/install.sh` |

## 9. 已知坑与边界

1. **脚本不随仓库自更新**（有意设计）：`deploy/ci/**` 有变更时日志只提示，运行中的脚本不会被替换
   —— 否则「仓库被改写」就等于「服务器自动执行任意代码」。要让新版本生效：`sudo bash /opt/bookkeeping/ci/install.sh`。
2. **`deploy/` 目录目前没有被 git 跟踪**：`--from-github` 和"仓库化"都需要先
   `git add deploy/ && git commit && git push`，否则仓库里没有这份脚本（服务器仍可用方式一手动上传安装）。
3. **APK 不在服务器构建**：只有 2 vCPU / 1.9GB 内存，且没有 JDK/Android SDK。APK 仍在本机构建后推送到
   `app.xyvora.me`（见 `deploy/app-distribute/README.md`）。这条流水线只管后端 + Web 前端 + nginx。
4. **`--dry-run` 不 clone、不 reset**：仓库还没克隆时只能告诉你「将会 clone」；仓库已存在时会
   `git fetch`（只读）并算出变更集合，但不改工作副本、不写状态。
5. **同一失败提交不会被自动重试**，但**推新提交会把「上次成功→新提交」之间的全部变更一起部署**
   （包括上次失败那次的改动）——这正好符合"修好再 push"的用法，但要知道这一点。
6. **`sudo VAR=val cmd` 在 sudoers 没开 `SETENV` 时会被拒**：所以脚本用 `sudo env VAR=val cmd` 传
   `PUBLIC_HOST`，不要改回 `sudo PUBLIC_HOST=... cmd`。
7. **日志由 systemd 落盘，脚本不要再写一遍（`BK_DEPLOY_LOG_TO_FILE=0` 不能删）**：
   `bk-deploy.service` 用 `StandardOutput/StandardError=append:` 归集日志，并显式设了
   `Environment=BK_DEPLOY_LOG_TO_FILE=0` 告诉脚本"这次不用你写文件"。
   **必须显式声明**：systemd（255 实测）把 fd1 接到一个 **pipe** 上，脚本里
   `readlink -f /proc/self/fd/1` 只会得到 `pipe:[...]`，`[ /proc/self/fd/1 -ef "$LOG_FILE" ]` 也判不出
   "同一个文件"，探测必然失效 → 脚本自己写一遍 + systemd 再写一遍 = **每行重复两次**（生产环境已踩到）。
   判定优先级：① `BK_DEPLOY_LOG_TO_FILE` 显式 `0/1`（其它值忽略并提示）→ ② `[ fd1 -ef $LOG_FILE ]`
   （同 inode/设备比较）→ ③ `readlink -f` 字符串比较（兜底）→ ④ 判不出来按 `1`（宁可重复一行也不丢日志）。
   手动 `sudo /opt/bookkeeping/ci/deploy.sh` 不带这个变量：输出到终端的同时脚本自己写一份日志文件。
   想确认当前判定：`--status` 的「日志」一行会写明（`脚本自己追加写` / `不写（由 systemd 的 append: 落盘）`）。
   注意 `| tee -a /var/log/bk-deploy.log` 这种写法会重复（管道算"另一个落点"，脚本仍会自己写一份）；
   要避免就显式关掉：`sudo env BK_DEPLOY_LOG_TO_FILE=0 /opt/bookkeeping/ci/deploy.sh 2>&1 | tee -a /var/log/bk-deploy.log`。
8. **绝不执行 `deploy/server-deploy.sh`**：那是从 dump 恢复数据库的全量重建，会覆盖线上数据；本流水线只跑
   `alembic upgrade head`（只做结构变更）。
9. **基线 dump 只读**：自动快照按 `pre-deploy_*` 前缀轮转，`$DUMP_DIR` 里其它 dump 脚本一律不碰。
10. **只跟踪 `BRANCH`（默认 main）**：其它分支（含 `codex/*`）不会被部署。
11. **服务器上没有任何 Git 凭据**：仓库公开、匿名 HTTPS 拉取；`grep -ri "ghp_\|github_pat_" /opt/bookkeeping` 应为空。
12. **报警只落日志与 `ALERT.txt`**：服务器未配置邮件/IM 通知通道，需要主动看 `--status` 或日志。
13. **源码同步用 `rsync -a --checksum --delete`**：rsync 默认只比"文件大小 + 秒级 mtime"，若某文件
    改动后**字节数不变**且 mtime 恰好落在同一秒，会被判为未变而漏同步（本地自测真的踩到过：同一秒内
    连续两次部署，`print("v10")` → `print("v11")` 没同步过去）。`--checksum` 按内容比对，代价是每次多读
    几 MB 源码，对这套目录完全可以接受。前端同步同理（`node_modules` 用 `--exclude` 保护、不参与比对）。
