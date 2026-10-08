# v0.6 落地记录：推送即自动部署（CI/CD）

- 创建时间：2026-10-08 12:35
- 状态：**已安装并在生产验证**（轮询运行中）；等待用户 push 后完成端到端验证

## 1. 交付物（仓库内 `deploy/ci/`）

| 文件 | 作用 |
| --- | --- |
| `deploy.sh` | 主脚本：flock 互斥 → `git fetch` → 与 `last-deployed.txt` 比对（相同则零开销退出）→ 变更目录判定 → 后端/前端/nginx 部署 → 状态与失败处理 |
| `ci.env.example` | 配置模板（分支、轮询周期、各路径、`PUBLIC_HOST`、`KEEP_DUMPS`、`LOG_FILE`、`HEALTH_URL`） |
| `bk-deploy.service` / `bk-deploy.timer` | oneshot + 定时器（`__POLL_INTERVAL__` 占位符由安装脚本渲染） |
| `install.sh` / `uninstall.sh` | 幂等安装（含 `--from-github`）/ 卸载（`--purge`） |
| `README.md` | 架构、配置表、安装/卸载、日常运维、故障速查、已知坑 |

> ⚠️ `deploy/` **目前未被 git 跟踪**（历史上从未提交）。仓库里这份是版本管理副本；**运行中的脚本以
> 服务器 `/opt/bookkeeping/ci/` 为准**，且**有意不随仓库自更新**（避免"仓库被改写→自动执行任意脚本"）。
> 若要把它纳入版本管理，需要 `git add deploy/ && git commit && git push`（本机没有 git，需你在有 git 的环境操作）。

## 2. 服务器落位（2026-10-08 12:19 安装）

| 路径 | 内容 |
| --- | --- |
| `/opt/bookkeeping/ci/` | `deploy.sh`(0755)、`install.sh`、`uninstall.sh`、`ci.env`、`ci.env.example`、`README.md`、两个单元文件副本（ubuntu:ubuntu） |
| `/opt/bookkeeping/ci/state/` | `last-deployed.txt`、`failed-sha.txt`（不存在=正常）、`ALERT.txt`（不存在=正常）、`deploy.lock`、`README-SEED.txt` |
| `/opt/bookkeeping/repo/` | GitHub 仓库克隆（ubuntu:ubuntu，匿名 HTTPS） |
| `/etc/systemd/system/bk-deploy.{service,timer}` | 单元（渲染后 `OnUnitActiveSec=2min`、`OnBootSec=3min`、`AccuracySec=15s`） |
| `/var/log/bk-deploy.log` | 部署日志（0644 ubuntu:ubuntu；systemd `append:` 归集） |

## 3. 安装时的时序保护（重要）

GitHub `main` 当时仍是 **2026-08-16 的提交 `9b738c4`**（用户的 v0.5 代码尚未 push），而生产后端运行的是
**手工部署的 v0.5 代码**。若把 `9b738c4` 当作"未部署"，安装完成后第一轮轮询（≤2 分钟）就会用 main 的旧代码
**回退线上后端**。因此安装时把 `state/last-deployed.txt` 预置为 `9b738c4`，并在 `state/README-SEED.txt`
写明了原因与时间：**在出现新提交之前，流水线不做任何动作**。此后完全由正常流程接管。

## 4. 验证结果

| 验证项 | 结果 |
| --- | --- |
| `bash -n`（WSL bash 5.3.9 + 服务器 bash 5.2.21） | 三个脚本全部通过 |
| 子 Agent 测试套件（桩替换 docker/npm/nginx/systemctl/curl/sudo，本地裸仓库当 GitHub） | **主 Agent 独立复跑：PASS=151 / FAIL=0** |
| `install.sh` 安装（幂等） | 成功；仓库克隆到 `/opt/bookkeeping/repo`；timer `enabled/active` |
| `deploy.sh --status` | 输出完整：仓库 HEAD、origin/main、最近成功、失败记录、是否需要部署、timer 状态、快照列表 → "是否需要部署: 否" |
| `deploy.sh --dry-run` | 只打印计划（含"远端 main = 9b738c4 / 无需部署"），零副作用 |
| **自动轮询零开销路径（线上实测）** | 12:21:24 / 12:23:25 / 12:25:35 三轮均为"无需部署"；`bookkeeping-backend` 的 CREATED 仍为 01:05（**未被重启**），`neobee-db` 仍 8 天 |
| 线上服务 | `https://api.bookkeeping.neobee.top/health` = 200；`/transactions/quick-inputs` 无令牌 = 401 |
| 安全基线 | 严格令牌正则（`ghp_`/`github_pat_` + 25 位以上）在 `/opt/bookkeeping` 下**无命中**；repo remote 为无凭据 HTTPS；脚本位于仓库之外 |
| 单元渲染 | `systemctl cat bk-deploy.timer` 显示 `OnUnitActiveSec=2min`，无残留占位符 |

## 5. 安装后发现并修复的缺陷（日志每行重复两遍）

- **现象**：`/var/log/bk-deploy.log` 每行出现两遍（同时间戳相邻两行）。
- **根因**（用 `systemd-run` 复刻同样 `StandardOutput=append:` 环境实测）：
  该环境下 `readlink -f /proc/self/fd/1` 返回 `/proc/<pid>/fd/pipe:[...]`（**不是**日志文件路径），
  `[ -f /proc/self/fd/1 ]` 也为 NO。脚本原有的"stdout 是否已指向日志文件"探测因此**必然判 NO**，
  于是脚本自己写一份文件、systemd 又把 stdout 追加一份 → 每行两遍。
- **修复**：日志落点判定改为**显式优先 + 可靠同文件比较**：
  1. 环境变量 `BK_DEPLOY_LOG_TO_FILE`（`0`/`1`）优先——`bk-deploy.service` 里显式设为 `0`（由 systemd 负责落盘）；
  2. 否则用 `[ /proc/self/fd/1 -ef "$LOG_FILE" ]` 做同 inode 判定；
  3. 最后才回落到 `readlink -f` 字符串比较；无法判定时默认由脚本写（宁可有、不可丢）。
  判定时机也挪到配置加载**之后**，避免"判定用的 `$LOG_FILE` 还是内置默认值"的隐患。
- **手动运行行为不变**：不带该环境变量时仍由脚本自己写文件（手动 `sudo .../deploy.sh` 有日志留痕）。

（修复实现与复验见第 8 节。）

## 6. 日常运维入口

```bash
# 当前状态（最近成功/失败/是否需要部署/timer 状态/快照列表）
sudo /opt/bookkeeping/ci/deploy.sh --status

# 不等下一个 2 分钟周期，立即部署一次
sudo systemctl start bk-deploy.service

# 只看这一轮会做什么（零副作用）
sudo /opt/bookkeeping/ci/deploy.sh --dry-run

# 日志
tail -f /var/log/bk-deploy.log
journalctl -u bk-deploy -n 50 --no-pager

# 失败后重试同一提交（清 failed-sha 后再跑一轮）
sudo /opt/bookkeeping/ci/deploy.sh --retry

# 暂停/恢复自动部署
sudo systemctl disable --now bk-deploy.timer
sudo systemctl enable  --now bk-deploy.timer

# 改轮询周期（改 ci.env 的 POLL_INTERVAL 后重跑安装脚本即可重新渲染 unit）
sudo nano /opt/bookkeeping/ci/ci.env && sudo bash /opt/bookkeeping/ci/install.sh

# 卸载（保留仓库与状态；--purge 连脚本目录一起删）
sudo bash /opt/bookkeeping/ci/uninstall.sh [--purge]
```

## 7. 回退与应急

- **停掉自动部署**：`sudo systemctl disable --now bk-deploy.timer`（不影响线上运行中的服务）。
- **代码回退**：`git -C /opt/bookkeeping/repo reset --hard <上一提交>` 后 `sudo systemctl start bk-deploy.service`
  （注意：`last-deployed.txt` 需相应改回，否则会被判为"无需部署"）。
- **数据回退**：使用 `dumps/` 里对应的迁移前快照（`pre-deploy_<sha>_<时间>.sql.gz`）；
  基线 `bookkeeping_20260527_194951.sql.gz` 与手工快照 `bookkeeping_pre_v05_*.sql.gz` **不会被自动清理**。
- **完全卸载**：见第 6 节 `uninstall.sh`。

## 8. 修复复验与端到端验证

- [x] 修复后重装并确认日志每行**只出现一次** ✅ 2026-10-08 12:40（见下方复验记录）
- [x] **用户 push 后自动部署** ✅ 2026-10-08 16:02（见下方首次自动部署记录）
- [ ] 故意失败一次：ALERT 生成、失败提交不再自动重试、线上仍可用、`--retry` 有效（沙箱 173 项断言已覆盖；生产未故意构造失败）
- [x] 迁移前快照生成且基线未被触碰 ✅ 2026-10-08 16:02

### 首次自动部署记录（2026-10-08 16:02，端到端）

推送内容：`9b738c4..ef20cbd main -> main`（两个提交：`d81b77a` v0.5 记账快捷输入、`ef20cbd` v0.6 CI/CD）。

流水线在下一个轮询周期自动完成：

```
[16:02:36]   迁移前数据库快照 → /opt/bookkeeping/dumps/pre-deploy_ef20cbd_20261008_160236.sql.gz
[16:02:36]   执行数据库迁移（docker compose run --rm backend python -m alembic upgrade head）
[16:02:39]   重启后端容器（docker compose up -d backend）
[16:02:54]   /health 探活通过（第 3 次尝试，HTTP 200）
[16:02:54] 已记录最近成功部署：ef20cbd
[16:02:54] 部署成功 ef20cbd（总耗时 8m 53s）
[16:02:55] 远端 main = ef20cbd
[16:02:55] 无需部署：main 仍为 ef20cbd      ← 下一轮零开销
```

| 验证项 | 结果 |
| --- | --- |
| 提交检测与部署 | ✅ 自动识别 `backend/**` 变更并部署；`frontend/**` 未变更 → **未重建前端**（按变更目录生效） |
| 迁移前快照 | ✅ `pre-deploy_ef20cbd_20261008_160236.sql.gz`（53 KB）；基线 dump 未动 |
| 后端容器 | ✅ 新镜像 16:02:26 构建、容器 16:02:39 重启 |
| 线上接口 | ✅ `/health` 200、`/transactions/quick-inputs` 无令牌 401、alembic `d4e6f7a8b9c0` |
| 业务数据 | ✅ transactions 2095 条（较昨日 2091 条为正常新增使用） |
| 状态文件 | ✅ `last-deployed = ef20cbd`；无 `failed-sha`；无 `ALERT.txt` |
| 服务器仓库 | ✅ HEAD = `ef20cbd`（含两个提交） |
| 部署耗时 | 8m53s（大头是 2 vCPU 上重建镜像安装 Python 依赖；代码同步与迁移本身仅数秒） |

> 说明：首次自动部署耗时较长属预期（服务器重建镜像）。后续仅改前端/文档的提交会明显更快；只改文档的提交不触发任何重建。

**「按变更目录」判定验证（只改 docs/ 的提交，生产实测）**：提交 `5ca0a7b`（仅 `docs/v0.6/*.md`）被处理为：

```
[16:05:03] 变更判定：backend=否  frontend=否  nginx=否  ci=否
[16:05:03] 只记录不动作（mobile/、docs/ 等）： docs/v0.6/CHECKLIST.md docs/v0.6/DEPLOY-RELEASE.md
[16:05:03] 本轮不需要部署（不涉及 backend/ frontend/ deploy/nginx.conf）
[16:05:03] 完成：无需部署，5ca0a7b 已标记为已处理（未重启任何服务）
```

后端容器 `StartedAt` 前后完全一致（`2026-10-08T08:02:50Z`），线上 `/health` 仍 200 —— **零抖动** ✅

### 推送方式说明（本机无法直连 GitHub）

本机（Windows 与 WSL）**直连 GitHub 超时**，用户代理仅监听 `127.0.0.1:10808`（WSL 为 NAT 模式，无法访问宿主机回环）。实际采用：
**WSL → SSH 到生产服务器 → SOCKS5 动态隧道（`ssh -D`）→ HTTPS 推送**（服务器到 GitHub 34ms）。
另外在服务器生成了 write 用途的 ed25519 Deploy Key（`~/.ssh/bk-deploy`，指纹
`SHA256:3kzgNokW5A0q3cuCB/fBrV3E27JS9CL06wSCCvM7Oa4`），仓库 `origin` 的 fetch 保持匿名 HTTPS、
push 走 `git@github.com:...`，供后续自动化使用（需在 GitHub 仓库 Deploy keys 中勾选 Allow write access）。

### 复验记录（日志重复修复）

- **本地**：`bash -n` 三脚本通过；主 Agent 独立重跑测试套件 → **PASS=173 / FAIL=0**（新增 22 条专测日志落点：
  显式 0/1、`-ef` 同 inode 判定、非法值忽略、管道场景、单元防回归）。
- **线上**：重新安装（`install.sh` 拷贝新脚本 + 新单元 → `daemon-reload` → 重启 timer）后：
  - `systemctl show bk-deploy.service -p Environment` → 含 `BK_DEPLOY_LOG_TO_FILE=0` ✅
  - **隔离验证**（清空日志，之后不手动调用、只等一轮自动轮询）：
    ```
    [12:40:39] 已加载配置 /opt/bookkeeping/ci/ci.env
    [12:40:39] === 开始一轮检查===
    [12:40:39]   拉取远端 main
    [12:40:40] 远端 main = 9b738c4
    [12:40:40] 无需部署：main 仍为 9b738c4
    ```
    总行数 5、**相邻重复行 0**、"已加载配置"出现 **1** 次 ✅
  - 容器未被重启（`bookkeeping-backend` 仍为 01:05 创建）
- 说明：12:38 那次检查里出现的两行相同"已加载配置"，是**安装脚本与我各自的两次手动 `--status`** 在同一秒各写一行所致，不是重复缺陷；隔离验证已排除该干扰。
- 含历史重复行的旧日志已归档为 `/var/log/bk-deploy.log.pre-dupfix.20261008_123832`（留作证据，可随时删除）。
- 另外顺手清理：服务器 `/tmp` 下本次所有临时文件已删；`bookkeeping-relay.service`（旧的 `not-found failed` 残留单元）已 `reset-failed`，现在 `systemctl --failed` 为 0 项。

## 9. 修订记录

| 时间 | 变更说明 |
| --- | --- |
| 2026-10-08 12:35 | 创建落地记录：安装、时序保护、验证结果、日志重复缺陷与修复方案、运维与回退入口 |
| 2026-10-08 12:45 | 追加修复复验记录（本地 173 项断言全通过 + 线上隔离验证零重复）、旧日志归档与服务器临时文件清理说明 |
| 2026-10-08 16:10 | 追加首次自动部署记录（push `ef20cbd` → 流水线自动部署成功、迁移前快照生成、线上验证通过）与推送方式说明（SSH 隧道 + 服务器 Deploy Key） |
