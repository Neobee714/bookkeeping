# 开发清单：金流 v0.6 —— 推送即自动部署（CI/CD）

- 创建时间：2026-10-08 01:35
- 规则：每完成一个小点标记 ✅，并附完成时间戳 `YYYY-MM-DD HH:mm`。

## 阶段一：需求与设计
- [x] 需求澄清完成（范围/触发/门禁/失败处理 4 项决策已确认）✅ 2026-10-08 01:35
- [x] 现状侦察完成（仓库公开、VPS 具备 git/Node/rsync/flock、GitHub 延迟 34ms、服务器无既有仓库副本）✅ 2026-10-08 01:35
- [x] 理解确认原型已出（`docs/v0.6/preview/understanding.html`）✅ 2026-10-08 01:35
- [x] 三文档创建（REQ.md / ARCH.md / CHECKLIST.md）✅ 2026-10-08 01:35
- [x] 流水线设计获用户确认（4 项决策 + 安全取舍 + 边界说明，用户回复"继续"）✅ 2026-10-08 01:40

## 阶段二：脚本与单元文件（本地产出，仓库化）
- [x] ci-1：`deploy/ci/ci.env.example`（分支/间隔/路径/PUBLIC_HOST/保留份数等）✅ 2026-10-08 12:15
- [x] ci-2：`deploy/ci/deploy.sh` 骨架：参数解析（`--status`/`--retry`/`--dry-run`/`--help`）+ 日志函数 + 读配置 ✅ 2026-10-08 12:15
- [x] ci-3：`deploy.sh`：flock 互斥 + `git fetch/reset` + 目标 SHA 与上次成功比对（含"无新提交零开销退出"）✅ 2026-10-08 12:15
- [x] ci-4：`deploy.sh`：变更路径判定（backend / frontend / nginx.conf / 其它）✅ 2026-10-08 12:15
- [x] ci-5：`deploy.sh`：后端部署（保留 .env 的 rsync → build → 迁移前快照 → alembic → 重启 → health 探活）✅ 2026-10-08 12:15
- [x] ci-6：`deploy.sh`：前端部署（保留 node_modules 的 rsync → 按需 npm ci → 复用 deploy-build-frontend.sh → 发布）✅ 2026-10-08 12:15
- [x] ci-7：`deploy.sh`：nginx.conf 变更处理（`nginx -t` 通过才 reload，否则回滚并失败）✅ 2026-10-08 12:15
- [x] ci-8：`deploy.sh`：成功/失败状态维护（`last-deployed.txt`、`failed-sha.txt`、`ALERT.txt`、失败提交不再自动重试、`--retry` 清标记）✅ 2026-10-08 12:15
- [x] ci-9：`deploy/ci/bk-deploy.service` + `bk-deploy.timer`（2 分钟、开机后 3 分钟首跑、日志 append 到文件）✅ 2026-10-08 12:15
- [x] ci-10：`deploy/ci/install.sh`（幂等：克隆仓库、建目录、装单元、启用 timer、首跑）+ `uninstall.sh` ✅ 2026-10-08 12:15
- [x] ci-11：`deploy/ci/README.md`（架构、安装/卸载、日常运维、故障处理、已知坑）✅ 2026-10-08 12:15

## 阶段三：脚本自检（本地，不碰服务器）
- [x] chk-1：`bash -n` 语法检查全部脚本通过（WSL bash 5.3.9 + 服务器 bash 5.2.21 双环境）✅ 2026-10-08 12:16
- [x] chk-2：无 shellcheck（WSL 未安装）→ 改为主 Agent 逐节复核 + 关键要素 grep 抽查（set -E / flock / CLI / 无令牌 / `rsync --checksum` ×2 / 绝不执行 server-deploy.sh）✅ 2026-10-08 12:16
- [x] chk-3：沙箱行为验证：主 Agent 独立复跑子 Agent 的测试套件 → **PASS=151 / FAIL=0**；服务器上 `--status`/`--dry-run` 输出符合预期 ✅ 2026-10-08 12:19

## 阶段四：服务器安装
- [x] inst-1：上传脚本到 `/opt/bookkeeping/ci/`、创建 `state/` 与日志文件（权限正确：脚本 0755 ubuntu:ubuntu，日志 0644）✅ 2026-10-08 12:19
- [x] inst-2：克隆仓库到 `/opt/bookkeeping/repo`（与 GitHub `main` 一致：`9b738c4`）✅ 2026-10-08 12:19
- [x] inst-3：安装并启用 `bk-deploy.timer`（enabled/active，下一次触发可见）✅ 2026-10-08 12:19
- [x] inst-4：`--status` 与 `--dry-run` 在服务器上输出符合预期（"是否需要部署: 否"）✅ 2026-10-08 12:19
- [x] inst-5：服务器无 Git 凭据（严格令牌正则无命中；README 里的命中是文档说明）、脚本位于仓库之外 `/opt/bookkeeping/ci`、remote 为无凭据 HTTPS ✅ 2026-10-08 12:27
- [x] inst-6（新增）：**时序保护**——安装时把 `last-deployed.txt` 预置为当时的 `main` SHA，避免"安装后第一轮就用 GitHub 上的旧代码覆盖线上手工部署的 v0.5 后端"；同时写入 `state/README-SEED.txt` 说明原因 ✅ 2026-10-08 12:19
- [x] inst-7（新增）：修复"日志每行重复两遍"缺陷（根因：systemd `append:` 下 `readlink -f /proc/self/fd/1` 返回 `pipe:[...]`，探测必然判 NO → 脚本与 systemd 各写一份）→ 改为显式 `BK_DEPLOY_LOG_TO_FILE=0`（单元内声明）+ `-ef` 同 inode 判定，并把判定挪到配置加载之后 ✅ 2026-10-08 12:40
  - 本地：`bash -n` 通过、测试套件 **PASS=173 / FAIL=0**（新增 22 条专测日志落点）
  - 线上隔离验证：清空日志后只等一轮自动轮询 → **恰好 5 行、零重复、"已加载配置"出现 1 次**；单元 `Environment=BK_DEPLOY_LOG_TO_FILE=0` 已生效；容器未被重启

## 阶段五：端到端验证
- [ ] e2e-1：用户 push v0.5+v0.6 代码到 `main` → ≤2 分钟内自动部署完成（后端迁移/前端构建按变更判定执行）
- [ ] e2e-2：线上 `/health` 200、新接口（`/transactions/quick-inputs`）生效、Web 首页产物更新
- [x] e2e-3：无新提交时日志显示"无需部署"且容器 CREATED 时间不变（无抖动）——实测 12:21 / 12:23 / 12:25 三轮，后端容器仍为 01:05 创建 ✅ 2026-10-08 12:27
- [ ] e2e-4：故意制造一次失败（错误 nginx.conf 或坏构建）→ ALERT 生成、失败提交不被自动重试、线上仍可用；`--retry` 行为正确（沙箱已覆盖，线上待验证）
- [ ] e2e-5：迁移前快照生成在 `dumps/`，保留策略生效（≤5 份自动快照）（沙箱已覆盖，线上待验证）

## 阶段六：验收与交付
- [ ] acc-1：对照 REQ 第 4 章逐条勾选，形成验收结论
- [ ] acc-2：更新 `docs/v0.6/DEPLOY-RELEASE.md`（或 README）记录流水线落地过程与运维入口
- [ ] acc-3：向用户汇报（含"APK 仍在本机构建"的边界说明与后续建议）
