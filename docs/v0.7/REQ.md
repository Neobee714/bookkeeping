# 需求文档：拾光 v0.7 —— 收敛为 App-only（下线 Web 端）

- 创建时间：2026-10-23 11:16
- 版本：v0.7
- 状态：已确认（用户 2026-10-23 明确「帮我删掉Web的吧」）

## 1. 背景与目标

**一句话理解**：仓库只保留手机 App（`mobile/`）与后端（`backend/`），删除平行维护的 Web 端
（`frontend/`、`vercel.json`）及其构建、部署、文档链路。App 自身功能与后端接口行为**不变**。

背景：

1. `mobile/` 已是完整独立端：50 个文件 9,656 行，8 个页面 + 管理后台，原生模块、Keychain、
   系统 DownloadManager OTA 都在；搜不到 `window.` / `document.` / `localStorage` 依赖。
2. `frontend/` 是平行的 Web 实现：44 个文件 6,894 行，页面与 App 一一对应，本质是第二套 UI。
   两套界面同时维护没有收益，且 Web 端一直跟不上 App 的迭代。
3. CI 仍为 `frontend/**` 保留构建与发布分支（`deploy_frontend` 59 行 + `ci.env` 三个变量），
   每次前端变更都要在 2 vCPU 的 VPS 上跑一次 vite 构建。
4. 线上 Web 目前还有两个入口：`bookkeeping.neobee.top`（Vercel）与
   `api.bookkeeping.neobee.top/`（VPS nginx 静态目录 `/var/www/frontend`）。

目标：把仓库收敛成「一个 App + 一个 API + 一条部署流水线」，减少维护面，不牺牲 App 能力。

## 2. 功能需求

| 编号 | 需求描述 | 优先级 |
| --- | --- | --- |
| FR-01 | **删除 Web 代码**：移除 `frontend/` 整目录与根目录 `vercel.json`；不改 `mobile/` 应用代码 | 高 |
| FR-02 | **CI 去前端分支**：`deploy/ci/deploy.sh` 删除前端变量、变更判定、`deploy_frontend()` 与调用；`ci.env.example` 删除 `FRONTEND_SRC` / `FRONTEND_PUBLISH` / `PUBLIC_HOST`；`deploy/ci/README.md` 架构图与配置表同步 | 高 |
| FR-03 | **服务器 Web 入口下线**：`api.bookkeeping.neobee.top/` 的 SPA 静态段改为 301 到 OTA 下载页 `https://app.xyvora.me/`；`/var/www/frontend` 保留 7 天观察后再删 | 高 |
| FR-04 | **文档同步**：根 `README.md` 改为 App-only（mobile + backend + deploy/ci），删除 Vercel / Capacitor 章节；新增 `docs/v0.7/` 三件套 | 中 |
| FR-05 | **保留后端导入接口**：`POST /transactions/import` 与 CSV 解析逻辑保留（Web UI 下线后暂无调用方），供日后 App 补导入入口时直接复用；不改后端代码 | 中 |
| FR-06 | **验证**：`bash -n` 三脚本通过；`deploy.sh` 中无 `FRONTEND` / `deploy_frontend` 残留；`--dry-run` 正常；线上 `/health` 200、App 裸路径接口 401、Web 入口 301、下载页 200；**不构建、不发布新 APK** | 高 |

## 3. 非功能需求

- **零停机**：只删 Web 静态段，nginx 中给 App 用的裸路径 API location（`/auth`、`/agent`、
  `/transactions`、`/budget`、`/categories`、`/savings`、`/app-updates`、`/stats/`、`/health`）
  一律不动；改完 `nginx -t` 通过才 reload。
- **可回退**：代码在 git 历史里；服务器 nginx 配置改动前备份；`/var/www/frontend` 不立即删除；
  CI 脚本改动前在 `/opt/bookkeeping/ci/` 留 `.bak.<时间戳>`。
- **部署顺序安全**（关键）：服务器运行的是 `/opt/bookkeeping/ci/deploy.sh`（不随仓库自更新）。
  必须**先把新脚本装到服务器，再 push 删除提交**；否则旧脚本会把 `frontend/**` 判为前端变更，
  而 `$REPO_DIR/frontend/` 已不存在，rsync 失败 → 写 ALERT 并停止重试该提交。
- **不碰数据**：无数据库迁移、无 `psql` 操作、无 dump 变更。
- **不动 App**：`mobile/` 一行不改，因此不需要升版本号、不需要重新构建或发布 APK。

## 4. 验收标准

- [ ] FR-01：`frontend/` 与 `vercel.json` 不存在；`git status` 只包含预期变更
- [ ] FR-02：`grep -n "FRONTEND\|deploy_frontend\|frontend" deploy/ci/deploy.sh deploy/ci/ci.env.example` 无输出
- [ ] FR-03：`curl -I https://api.bookkeeping.neobee.top/` 返回 301 → `https://app.xyvora.me/`；
      `curl https://api.bookkeeping.neobee.top/health` 仍 200；`/transactions` 无令牌仍 401
- [ ] FR-04：README 不再出现 Vercel / Capacitor / `frontend/` 构建步骤（历史 docs 除外）
- [ ] FR-05：`backend/app/routers/transactions.py` 的 import 路由与测试保持原样
- [ ] FR-06：CI 处理删除提交时日志为「只记录不动作」，后端容器未重启；App 更新检查仍正常
      （`https://app.xyvora.me/bookkeeping/info.json` 200）

## 5. 约束与假设

- VPS 上真正运行的是 `/opt/bookkeeping/ci/` 副本；仓库 `deploy/ci/` 只是版本存档（刻意不自更新）。
- `bookkeeping.neobee.top` 由 **Vercel** 托管（DNS CNAME → `cname.vercel-dns.com`），删仓库文件
  不会让它下线；本机没有 `vercel` CLI 与 `gh`，该项目需用户手动在 Vercel 控制台删除/解绑。
- `api.bookkeeping.neobee.top` 的证书只覆盖 `api.bookkeeping.neobee.top` / `neobee.top` / `www.neobee.top`；
  改 nginx 只动 `sites-available/bookkeeping` 的静态段。
- CSV 导入的 UI 能力随 Web 下线；后端接口保留，未来可在 App 补一个导入入口（约 1-2 天）。
- 已发布 APK（2.2.2 / versionCode 222）不受影响，OTA 清单与归档不动。

## 6. 待确认 Q&A

| 问题 | 用户回答 | 时间 |
| --- | --- | --- |
| 删除范围 | 删 Web 端（frontend/ + vercel.json + CI 前端分支），保留 App 与后端 | 2026-10-23 |
| CSV 导入怎么办 | 接受随 Web UI 一并下线；后端接口保留，日后需要再在 App 补 | 2026-10-23 |
| 线上 Web 域名 | VPS 上的 `/` 301 到 OTA 下载页 `https://app.xyvora.me/`；Vercel 的 `bookkeeping.neobee.top` 由用户在控制台删除 | 2026-10-23 |
| 要不要重发 APK | 不需要（`mobile/` 未改） | 2026-10-23 |

## 7. 修订记录

| 时间 | 变更说明 |
| --- | --- |
| 2026-10-23 11:16 | 创建需求文档；范围、导入接口取舍、域名处理、不发 APK 四项已确认 |
