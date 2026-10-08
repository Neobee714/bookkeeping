# 架构文档：金流 v0.6 —— 推送即自动部署（CI/CD）

- 创建时间：2026-10-08 01:35
- 版本：v0.6
- 状态：已确认

## 1. 技术栈与选型

| 层面 | 技术 | 选型理由 |
| --- | --- | --- |
| 触发 | **systemd timer**（每 2 分钟）+ oneshot service | 系统自带、无额外常驻进程、日志进 journal、`systemctl` 即可启停 |
| 拉取 | 服务器 `git clone` + `git fetch origin main` + `git reset --hard` | 仓库公开，匿名即可；无需在服务器放置任何凭据 |
| 变更判定 | `git diff --name-only <上次成功> <目标>` + 路径前缀匹配 | 精确到目录，避免无关改动触发重建 |
| 互斥 | `flock -n` 文件锁 | 防止上一轮未结束时下一轮叠加 |
| 后端发布 | 既有 compose：`docker compose build backend` → `alembic upgrade head` → `up -d backend` | 沿用现有部署方式，不引入新工具链 |
| 前端发布 | 既有 `/opt/bookkeeping/deploy-build-frontend.sh`（vite build + 发布到 `/var/www/frontend`） | 复用已验证脚本，不重复实现构建逻辑 |
| 状态与日志 | 纯文本状态文件 + `/var/log/bk-deploy.log`（journal 同步） | 无状态服务、可人肉排查、无外部依赖 |
| 安装 | 幂等 `install.sh` | 可重复执行，便于重建/迁移服务器 |

**不引入**：GitHub Actions、webhook 服务、容器编排、Jenkins/Drone 之类；不引入任何新增 Python/Node 依赖。

## 2. 系统架构

```
  你的开发机（本机无 git，用户上传/提交）
        │  git push
        ▼
  GitHub: Neobee714/bookkeeping (public, main)
        │  git fetch（每 2 分钟，匿名 HTTPS，34ms 延迟）
        ▼
┌──────────────────────── VPS（生产服务器，IP 见运维文档）────────────────────────┐
│  systemd: bk-deploy.timer (2min) → bk-deploy.service (oneshot)          │
│        │ ExecStart                                                      │
│        ▼                                                                │
│  /opt/bookkeeping/ci/deploy.sh   ← 仓库之外，不随代码自更新                │
│    1 flock 互斥                                                          │
│    2 git fetch → 目标 SHA → 与 state/last-deployed.txt 比对               │
│    3 变更路径集合（git diff --name-only）                                 │
│    4a backend/**  → rsync 源码 → stack/backend（保留 .env）              │
│                     → docker compose build backend                      │
│                     → pg_dump 快照（dumps/ 保留 5 份）                   │
│                     → alembic upgrade head                              │
│                     → docker compose up -d backend → /health 探活        │
│    4b frontend/** → rsync 源码（保留 node_modules）                      │
│                     → 需要时 npm ci → deploy-build-frontend.sh          │
│                     → /var/www/frontend（www-data）                      │
│    4c deploy/nginx.conf → 复制 → nginx -t → 通过才 reload（否则回滚）     │
│    5 成功：写 last-deployed.txt、清 failed-sha.txt                       │
│      失败：写 failed-sha.txt + state/ALERT.txt + 日志，并停止重试该提交    │
│                                                                         │
│  /opt/bookkeeping/repo      ← git 克隆（工作副本，只读镜像语义）          │
│  /opt/bookkeeping/ci/state/ ← last-deployed.txt / failed-sha.txt / ALERT │
│  /opt/bookkeeping/stack/    ← 既有 compose 运行目录（部署产物）            │
│  /var/www/frontend          ← 前端静态产物（nginx 服务）                  │
└─────────────────────────────────────────────────────────────────────────┘
```

## 3. 模块划分

| 模块 | 路径（仓库内 → 服务器） | 职责 |
| --- | --- | --- |
| 部署主脚本 | `deploy/ci/deploy.sh` → `/opt/bookkeeping/ci/deploy.sh` | 全流程：锁、拉取、判定、后端/前端/nginx 部署、状态与失败处理 |
| 安装脚本 | `deploy/ci/install.sh` → 一次性执行（也在 `/opt/bookkeeping/ci/install.sh` 留档） | 克隆仓库、建目录、装 systemd 单元、初始化状态、首跑 |
| 卸载脚本 | `deploy/ci/uninstall.sh` | 停用并删除 timer/service，保留仓库与状态（可选清理） |
| systemd 单元 | `deploy/ci/bk-deploy.service`、`deploy/ci/bk-deploy.timer` → `/etc/systemd/system/` | 定时触发与日志归集 |
| 配置 | `deploy/ci/ci.env.example` → `/opt/bookkeeping/ci/ci.env` | 可调项：分支、轮询周期、PUBLIC_HOST、快照保留数、日志路径 |
| 文档 | `deploy/ci/README.md` | 安装/运维/故障/已知坑 |

> 说明：仓库里保留一份副本便于版本管理；**运行中的脚本以服务器 `/opt/bookkeeping/ci/` 为准**（有意不随仓库自更新，避免"仓库被改写即自动执行任意代码"）。

## 4. 数据与接口

### 4.1 状态文件（纯文本，位于 `/opt/bookkeeping/ci/state/`）

| 文件 | 内容 | 生命周期 |
| --- | --- | --- |
| `last-deployed.txt` | 最近**成功**部署的提交 SHA | 每次成功覆盖 |
| `failed-sha.txt` | 最近**失败**的提交 SHA（存在即暂停自动重试该提交） | 成功一次后删除；`--retry` 时删除 |
| `ALERT.txt` | 失败时写给人看的一行摘要（时间 + 步骤 + 提交 + 日志位置） | 成功一次后删除 |
| `deploy.lock` | flock 用的锁文件 | 常驻 |

### 4.2 命令接口（脚本 CLI）

| 命令 | 行为 | 退出码 |
| --- | --- | --- |
| `deploy.sh` | 执行一轮检查+部署（timer 调用） | 0=无事/成功；非 0=失败（已记 ALERT） |
| `deploy.sh --status` | 打印仓库 HEAD / 最近成功 / 失败记录 / 待部署状态 / timer 状态 | 0 |
| `deploy.sh --retry` | 清除 `failed-sha.txt` 后立即执行一轮 | 同默认 |
| `deploy.sh --dry-run` | 只打印本轮会做什么（不落任何改动） | 0 |
| `deploy.sh --help` | 用法 | 0 |

### 4.3 关键配置（`ci.env`）

```ini
BRANCH=main
REPO_URL=https://github.com/Neobee714/bookkeeping.git
REPO_DIR=/opt/bookkeeping/repo
STATE_DIR=/opt/bookkeeping/ci/state
STACK_DIR=/opt/bookkeeping/stack
FRONTEND_SRC=/opt/bookkeeping/frontend
FRONTEND_PUBLISH=/var/www/frontend
PUBLIC_HOST=api.bookkeeping.neobee.top     # 烘焙进前端产物的 API 域（现网实测值）
DUMP_DIR=/opt/bookkeeping/dumps
KEEP_DUMPS=5
LOG_FILE=/var/log/bk-deploy.log
HEALTH_URL=http://127.0.0.1:18080/health
```

## 5. 前端风格

本次无前端界面改动（纯运维流水线）。前端部署复用的构建配置为现网已验证值：
`VITE_API_URL=https://api.bookkeeping.neobee.top/api`、`VITE_API_TIMEOUT_MS=30000`，与当前 `/var/www/frontend`
里已烘焙的地址一致（已实测比对）；发布后仍由既有 nginx 站点提供服务，视觉与行为不变。

## 6. 后端设计（白话说明）

- **为什么要"拉"而不是"推"**：VPS 在中国香港，到 GitHub 只有 34ms 延迟、2.2MB/s，拉取非常顺；反过来让 GitHub 主动连你的服务器，需要在 GitHub 存一把私钥，多一个泄密面。所以让服务器自己定时去"看有没有新东西"。
- **服务器怎么知道该做什么**：它记住"上一次成功部署的是哪个提交"，拿到新提交后，先问 git "这两个提交之间改了哪些文件" —— 只改 `backend/` 就只动后端，只改 `frontend/` 就只动前端；只改文档/App 代码时它什么都不重启（避免无意义的抖动）。
- **数据库迁移怎么保证安全**：执行迁移前先给数据库拍一张快照（现在的库很小，dump 只有一百多 KB），快照保留最近 5 份并带上提交号；万一迁移出问题，可以用它恢复。迁移命令本身可重复执行，不会因为跑两次而报错。
- **失败为什么要"停手"**：如果某个提交本身是坏的，每 2 分钟重试一次只会反复折腾服务器（前端重建还吃内存）。所以失败后把它记下来、写一条 ALERT，然后**不再自动重试这个提交**，等你修好再 push 新的（或手动 `--retry`）。
- **凭据与权限**：仓库是公开的，服务器**不需要任何 Git 令牌**（我不会把你本机那个令牌放到服务器上）。部署脚本放在仓库目录之外，避免"仓库被改动→自动执行新脚本"这种危险链；需要 root 的动作（写 `/etc/nginx`、`/var/www`、docker）通过既有的免密 sudo 显式执行。
- **对现有东西的影响**：沿用现有 compose 目录、`.env`、nginx 站点与证书，不重建、不覆盖数据；`stack/backend` 是部署产物目录，会被 rsync 覆盖（服务器侧若有 `.env` 会先备份再还原）。

## 7. 部署与环境

| 项 | 值 |
| --- | --- |
| 服务器 | 腾讯云生产服务器（IP 见本机运维文档 `docs/v0.4/DEPLOY-VPS-*.md`，不随仓库公开）（Ubuntu 24.04 / 2 vCPU / 1.9 GB + 3.9 GB swap / 28 GB 可用） |
| 依赖 | git 2.43、Node 22.23 + npm 10.9.9、Docker + compose、rsync、flock（均已具备） |
| 安装位置 | `/opt/bookkeeping/ci/`（脚本+状态）、`/opt/bookkeeping/repo`（克隆）、`/etc/systemd/system/bk-deploy.{service,timer}` |
| 日志 | `/var/log/bk-deploy.log` + `journalctl -u bk-deploy` |
| 备份 | 迁移前快照 `/opt/bookkeeping/dumps/pre-deploy_<sha>.sql.gz`（保留 5 份） |
| 回退 | 代码：`git reset --hard <上一提交>` + 重跑部署；数据：恢复对应快照；禁用自动部署：`systemctl disable --now bk-deploy.timer` |

## 8. 修订记录

| 时间 | 变更说明 |
| --- | --- |
| 2026-10-08 01:35 | 创建架构文档；确定 systemd timer 轮询 + 仓库外部署脚本 + 目录级变更判定 + 失败停手语义 |
