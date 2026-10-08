# 需求文档：金流 v0.6 —— 推送即自动部署（CI/CD）

- 创建时间：2026-10-08 01:35
- 版本：v0.6
- 状态：已确认

## 1. 背景与目标

**一句话理解**：代码 push 到 GitHub `main` 之后，VPS 定时自己拉取并自动部署（重建后端容器、跑数据库迁移、重建并发布 Web 前端）；部署失败就停下来报警等人工处理，不需要在服务器上手动操作。

背景：本项目目前发布全靠手动 —— 本机 `deploy/pack.ps1` 打包 → `scp` 上传 → `rsync` 同步源码 →
`docker compose build` → `alembic upgrade head`。步骤多、依赖记忆、容易漏跑迁移（v0.5 发布就是按此流程人工执行的）。
另外本机**没有 git**，也没有 JDK/Android SDK，所以"从本机推送部署"的路径本身就不顺手。

目标：把"改了代码 → 线上生效"压缩为一次 push，中间环节由服务器自动完成，并留下可追溯的部署日志与可回退的快照。

## 2. 功能需求

| 编号 | 需求描述 | 优先级 |
| --- | --- | --- |
| FR-01 | **推送即部署**：VPS 每 2 分钟 `git fetch origin main`；有新提交则自动部署，无新提交则整轮零开销退出（不重建、不重启） | 高 |
| FR-02 | **按变更目录决定动作**：`backend/**` → 后端部署；`frontend/**` → 前端部署；`deploy/nginx.conf` → nginx 校验后 reload；`mobile/**`、`docs/**` 等仅记录不部署 | 高 |
| FR-03 | **后端自动部署**：同步源码到 `/opt/bookkeeping/stack/backend`（保留服务器侧 `.env`）→ 构建镜像 → 执行迁移 → 重启容器 → `/health` 探活 | 高 |
| FR-04 | **迁移安全**：执行迁移前自动生成数据库快照到 `/opt/bookkeeping/dumps/`（保留最近 5 份，命名含提交号），并确保 `alembic upgrade head` 为幂等可重复执行 | 高 |
| FR-05 | **前端自动部署**：同步源码（保留 `node_modules`）→ 仅当 `package-lock.json` 变化或依赖缺失时执行 `npm ci` → `vite build`（`PUBLIC_HOST=api.bookkeeping.neobee.top`）→ 发布到 `/var/www/frontend` 并归 www-data | 高 |
| FR-06 | **nginx 安全变更**：`deploy/nginx.conf` 变化时先复制并 `nginx -t`，**通过才 reload，不通过则回滚配置**并记为失败 | 中 |
| FR-07 | **失败处理（不停机重试风暴）**：任一步失败 → 写日志、写 `state/ALERT.txt`、记录失败提交号并**停止自动重试该提交**；成功一次后清空失败记录；提供 `--retry` 手动重试 | 高 |
| FR-08 | **运维命令**：`--status`（最近成功/失败/待部署提交）、`systemctl start bk-deploy.service`（立即部署）、日志查看、`systemctl enable/disable --now bk-deploy.timer`（启停自动部署） | 高 |
| FR-09 | **安全基线**：服务器上**不存放任何 Git 凭据**（仓库公开，匿名拉取）；部署脚本安装在仓库之外（`/opt/bookkeeping/ci/`）以免随仓库自更新；只跟踪 `main` 分支；部署脚本以最小权限运行（需要 sudo 的动作显式列出） | 高 |
| FR-10 | **一次安装、可重复执行**：提供安装脚本完成克隆仓库、安装 systemd 单元、初始化状态目录与日志、首次运行；重复执行不产生重复副作用（幂等） | 中 |
| FR-11 | **文档**：`deploy/ci/README.md` 记录架构、安装/卸载、日常运维、故障处理与已知坑 | 中 |

## 3. 非功能需求

- **排队与互斥**：用 `flock` 保证同一时刻只有一轮部署；轮询周期内若上一轮未结束，本轮直接跳过。
- **失败可诊断**：日志逐步骤带时间戳，失败行包含"哪一步、哪条命令、退出码"；`ALERT.txt` 是给人看的一行摘要。
- **可回退**：迁移前快照 + 上一版源码仍在 git 历史里（重建即回退）；本方案不自动回滚（用户已确认人工处理）。
- **资源占用**：轮询本身 < 1 秒、无网络流量（除 git fetch）；前端 `npm ci` 仅按需触发，避免每轮 342MB 重装。
- **不破坏现状**：沿用现有 `/opt/bookkeeping/stack`（compose/.env/nginx.conf）与 `/var/www/frontend`、`/opt/bookkeeping/frontend` 布局；不重装、不重建 nginx 站点与证书。
- **不碰数据**：除 `alembic upgrade head`（只做结构变更）外不改动业务数据；不做 `psql` 恢复类操作。

## 4. 验收标准

- [ ] FR-01：向 `main` push 后 ≤2 分钟线上生效；无新提交时日志显示"无需部署"且容器不重启（`docker ps` 的 CREATED 不变）
- [ ] FR-02：只改 `docs/` 或 `mobile/` 的提交不触发任何重启；只改 `backend/` 不触发前端重建，反之亦然
- [ ] FR-03：改后端（含新增路由）后线上接口生效，`/health` 返回 200
- [ ] FR-04：迁移前快照生成且可解压读取；重复部署不重复报错；dumps 目录最多 5 份自动快照
- [ ] FR-05：改前端后 `https://api.bookkeeping.neobee.top` 首页产物更新（bundle 文件名变化）；`package-lock.json` 未变时日志显示跳过 `npm ci`
- [ ] FR-06：故意放入一份错误 nginx 配置 → 部署记为失败且**线上配置保持可用**（`nginx -t` 之后才 reload，失败即回滚）
- [ ] FR-07：构造一次失败（如让构建报错）→ 日志有明确失败步骤、`ALERT.txt` 生成、失败提交不再被自动重试；`--retry` 可重新触发
- [ ] FR-08：`--status` 输出包含最近成功提交、失败提交（如有）、仓库 HEAD 与待部署状态
- [ ] FR-09：服务器上 `grep -ri "ghp_\|github_pat_" /opt/bookkeeping` 无命中；部署脚本位于 `/opt/bookkeeping/ci/`；仅 `main` 被部署
- [ ] FR-10：安装脚本可重复执行；`systemctl list-timers bk-deploy.timer` 正常显示下一次触发
- [ ] FR-11：文档齐全（安装、运维、故障、坑），且明确"APK 不在服务器构建"

## 5. 约束与假设

- 仓库 `github.com/Neobee714/bookkeeping` 为**公开**仓库，`main` 为默认分支（已实测匿名 `git ls-remote` 可用），因此 VPS 端无需凭据。
- 服务器：Ubuntu 24.04、2 vCPU、1.9 GB 内存 + 3.9 GB swap、磁盘 28 GB 可用；已装 git 2.43、Node 22.23、npm 10.9.9、Docker + compose。
- 服务器**不构建 APK**（无 JDK/Android SDK，内存也不足）——APK 仍本机构建后推 `app.xyvora.me`。
- 采用 systemd timer 轮询（非 GitHub Actions、非 webhook）；间隔 2 分钟可配。
- 报警仅落日志与 `ALERT.txt`（未配外部通知通道）。
- 本机（Windows 开发机）**没有 git**，推送动作由用户完成；VPS 拉取不依赖本机。

## 6. 待确认 Q&A

| 问题 | 用户回答 | 时间 |
| --- | --- | --- |
| 部署范围 | 后端 + Web 前端 + 自动跑数据库迁移 | 2026-10-08 01:28 |
| 触发方式 | VPS 定时轮询（服务器自动拉取） | 2026-10-08 01:28 |
| 测试门禁 | 不加门禁，直接部署 | 2026-10-08 01:28 |
| 失败处理 | 停下来报警，人工处理（不自动回滚） | 2026-10-08 01:28 |
| 轮询间隔 | 默认 2 分钟（可调） | 2026-10-08 01:35 |
| 代码提交方式 | 用户自行上传/提交到 GitHub（本机无 git） | 2026-10-08 01:30 |

## 7. 修订记录

| 时间 | 变更说明 |
| --- | --- |
| 2026-10-08 01:35 | 创建需求文档；理解确认原型已出（`docs/v0.6/preview/understanding.html`）；4 项设计决策已确认 |
