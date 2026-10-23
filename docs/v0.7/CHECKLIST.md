# 开发清单：拾光 v0.7 —— App-only 收敛（删除 Web 端）

- 创建时间：2026-10-23 11:16
- 规则：每完成一个小点标记 ✅，并附完成时间戳 `YYYY-MM-DD HH:mm`。

## 阶段一：审计与确认
- [x] 现状审计完成（两端规模、App 无 Web 运行时依赖、功能差集、线上入口）✅ 2026-10-23 11:10
- [x] 删除范围确认（用户：「帮我删掉Web的吧」；接受 CSV 导入 UI 随之下线）✅ 2026-10-23 11:16
- [x] 三文档创建（REQ.md / ARCH.md / CHECKLIST.md）✅ 2026-10-23 11:16

## 阶段二：仓库清理
- [x] rm-1：删除 `frontend/` 整目录（44 文件 / 6,894 行）✅ 2026-10-23 11:19
- [x] rm-2：删除根目录 `vercel.json` ✅ 2026-10-23 11:19
- [x] rm-3：`.gitignore` 清理只服务 `frontend/` 的条目 ✅ 2026-10-23 11:19
- [x] rm-4：全仓搜索 `frontend/` / `vercel` 残留（排除 `.git`、`docs/v0.*`、构建产物）✅ 2026-10-23 11:19
  - 仅剩 `mobile/src/types/index.ts` 一条历史注释、`mobile/package-lock.json` 的 npm 包名，均为非功能性引用

## 阶段三：CI 改造
- [x] ci-1：`deploy/ci/deploy.sh` 删前端变量（`FRONTEND_SRC` / `FRONTEND_PUBLISH` / `FRONTEND_BUILD_SCRIPT` / `PUBLIC_HOST`）✅ 2026-10-23 11:19
- [x] ci-2：删 `FRONTEND_CHANGED` / `LOCK_CHANGED`、前端变更判定分支与 npm ci 日志 ✅ 2026-10-23 11:19
- [x] ci-3：删 `deploy_frontend()` 函数与调用；no-op 判定改为 `BACKEND+NGINX = "00"` ✅ 2026-10-23 11:19
- [x] ci-4：`ci.env.example` 删 `FRONTEND_SRC` / `FRONTEND_PUBLISH` / `PUBLIC_HOST` ✅ 2026-10-23 11:19
- [x] ci-5：`deploy/ci/README.md` 架构图、文件表、配置表同步 ✅ 2026-10-23 11:19
- [x] ci-6：`bash -n deploy/ci/{deploy,install,uninstall}.sh` 通过；grep 无前端残留（服务器上复验同样通过）✅ 2026-10-23 11:20

## 阶段四：文档
- [x] doc-1：根 `README.md` 重写为 App-only（mobile + backend + deploy/ci）✅ 2026-10-23 11:19
- [x] doc-2：删除 Vercel / Capacitor / Web 构建章节；APK 章节注明「本机 macOS 构建，VPS 不构建」✅ 2026-10-23 11:23
- [x] doc-3：历史 `docs/v0.1..v0.6` 保持不动 ✅ 2026-10-23 11:19

## 阶段五：服务器切换（顺序不可颠倒）
- [x] srv-1：备份 `/opt/bookkeeping/ci/deploy.sh` → `.bak.20261023_112012` ✅ 2026-10-23 11:20
- [x] srv-2：上传新版 `deploy.sh` / `ci.env.example` / `README.md` 到 `/opt/bookkeeping/ci/`（sha256 与本地逐位一致）✅ 2026-10-23 11:20
- [x] srv-3：服务器上 `bash -n` 通过、`grep -c deploy_frontend` = 0、`--dry-run`/`--status` 正常 ✅ 2026-10-23 11:20
- [x] srv-4：timer 保持 enabled/active，下一轮自动使用新脚本 ✅ 2026-10-23 11:20
- [x] srv-5：备份 `/etc/nginx/sites-available/bookkeeping` → `.bak.20261023_112620` ✅ 2026-10-23 11:26
- [x] srv-6：静态段替换为 301 → `nginx -t` 通过 → `systemctl reload nginx` ✅ 2026-10-23 11:26
- [x] srv-7：`/var/www/frontend` 保留，不删除（观察 7 天）✅ 2026-10-23 11:26

## 阶段六：发布与验证
- [x] rel-1：本地提交（`1cf55bb` 代码 + `40880f7` 文档）✅ 2026-10-23 11:19
- [x] rel-2：push `main` → 等一轮轮询 ✅ 2026-10-23 13:22
  - 用 Neobee714 账号密钥（`github-neobee714` 别名）推送成功：`9787eda..40880f7 main -> main`
  - 本地 remote 的 fetch 保持 `git@github.com`，push 改为 `git@github-neobee714:Neobee714/bookkeeping.git`
- [x] rel-3：日志确认「只记录不动作」，`last-deployed` 前进，后端容器未重启 ✅ 2026-10-23 13:22
  - 变更集合 75 个文件（frontend 删除 + docs + deploy/ci），判定 `backend=否 nginx=否 ci=是`
  - 日志：「只记录不动作（mobile/、docs/ 等）」→「本轮不需要部署」→「已标记为已处理」
  - `last-deployed=40880f7`；无 `ALERT` / `failed-sha`；后端容器 `StartedAt=2026-10-08T08:30:32Z` 未变
- [x] rel-4：`/health` 200；`/api/health` 200；`/transactions` 无令牌 401；`/app-updates/latest` 200 ✅ 2026-10-23 11:26
- [x] rel-5：`api.bookkeeping.neobee.top` / `neobee.top` / `www.neobee.top` 根路径均 301 → `https://app.xyvora.me/`；`info.json` 200、`latest.apk` 200、下载页 200 ✅ 2026-10-23 11:26
- [x] rel-6：`mobile/` 未改、版本仍 2.2.2（222），本次不发 APK ✅ 2026-10-23 11:19

## 阶段七：收尾
- [x] acc-1：写 `docs/v0.7/DEPLOY-RELEASE.md`（改动、验证矩阵、回退、Vercel 手动步骤、push 阻塞说明）✅ 2026-10-23 11:30
- [x] acc-2：更新 `bookkeeping-app-iteration` skill（仓库地图、坑、frontend 已不存在）✅ 2026-10-23 13:26
- [x] acc-3：向用户汇报，明确 Vercel 项目已下线、`/var/www/frontend` 观察期、push 权限已解除 ✅ 2026-10-23 13:36
