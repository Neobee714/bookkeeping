# 架构文档：拾光 v0.7 —— App-only 收敛

- 创建时间：2026-10-23 11:16
- 版本：v0.7
- 状态：已确认

## 1. 目标形态

```
  开发机（macOS）                          GitHub: Neobee714/bookkeeping (public, main)
  ├─ mobile/  RN App ── APK 手工构建 ──┐            │ git push / 每 2 分钟 fetch
  └─ backend/ FastAPI ────────────────┼────────────┘
                                      ▼
                         VPS /opt/bookkeeping（Ubuntu 24.04）
                         ├─ ci/deploy.sh      轮询 → 只处理后端/nginx/ci
                         ├─ repo/             git 工作副本
                         ├─ stack/            docker compose（backend + postgres）
                         ├─ dumps/            迁移前快照
                         └─ distribute/       OTA 发布工具（publish.sh）
                                      │
        App  ── HTTPS 裸路径 ──────────┘   api.bookkeeping.neobee.top/{auth,transactions,...}
        App  ── OTA 检查 ──────────────▶   app.xyvora.me/bookkeeping/info.json + latest.apk
```

删除后仓库只有三块：`mobile/`（App）、`backend/`（API）、`deploy/ci/`（部署脚本存档）。
`frontend/`、`vercel.json` 不再存在。

## 2. 改动面

| 层面 | 路径 | 动作 |
| --- | --- | --- |
| Web 代码 | `frontend/`（44 文件 / 6,894 行） | 整目录删除 |
| Vercel 配置 | `vercel.json` | 删除 |
| CI 脚本 | `deploy/ci/deploy.sh` | 删前端变量、变更判定、`deploy_frontend()` 与调用、相关日志 |
| CI 配置 | `deploy/ci/ci.env.example` | 删 `FRONTEND_SRC` / `FRONTEND_PUBLISH` / `PUBLIC_HOST` |
| CI 文档 | `deploy/ci/README.md` | 架构图、文件表、配置表改为 App-only |
| 根文档 | `README.md` | 重写为 mobile + backend + deploy/ci；删 Vercel / Capacitor |
| 后端 | `backend/**` | **不动**（CORS、`/transactions/import` 均保留） |
| App | `mobile/**` | **不动**（不升版本、不重发 APK） |
| 历史文档 | `docs/v0.1..v0.6` | **不动**（归档） |
| 新增文档 | `docs/v0.7/**` | REQ / ARCH / CHECKLIST / DEPLOY-RELEASE |

## 3. CI 的新判定逻辑

| 变更目录 | 动作 |
| --- | --- |
| `backend/**` | docker build → pg_dump 快照 → alembic upgrade → 重启 → `/health` 探活 |
| `deploy/nginx.conf` | 复制 → `nginx -t` 通过才 reload，失败回滚 |
| `deploy/ci/**` | 只提示（脚本刻意不自更新，线上副本为准） |
| 其它（`mobile/**`、`docs/**`、删除 `frontend/**`） | 只记录，不重启任何服务 |

删除提交中 `frontend/**` 属于「其它」：**不触发任何构建**。最终 no-op 判定从
`BACKEND+FRONTEND+NGINX = "000"` 改为 `BACKEND+NGINX = "00"`。

## 4. 服务器 nginx 变更

只改 `/etc/nginx/sites-available/bookkeeping` 的 HTTPS server 段：

- 删除静态段：`root /var/www/frontend; index index.html; location /assets/ {...}; location / { try_files ... }`
- 替换为：`location / { return 301 https://app.xyvora.me/bookkeeping; }`
- **保留**所有 API location：`/api/` 重写、裸路径正则（`/auth|/agent|/transactions|/budget|
  /categories|/savings|/app-updates`）、`/stats/`、`= /health`。

注意 location 优先级：正则 location 优先于前缀 `location /`，因此 API 不受 301 影响。
`neobee.top` / `www.neobee.top` 与 `api.bookkeeping.neobee.top` 共用一个 server 块，改后三者
根路径都 301 到下载页；OTA 链接不受影响。

## 5. 部署顺序（关键，不能颠倒）

1. **仓库改完但先不 push**：删 `frontend/`、改 CI、改文档、写 v0.7 三件套，本地验证。
2. **服务器先换脚本**：备份 `/opt/bookkeeping/ci/deploy.sh` → 上传新版 → `bash -n` →
   确认 `grep -c deploy_frontend` 为 0 → `systemctl restart bk-deploy.timer`（下一轮用新脚本）。
3. **再 push 删除提交**：等一轮轮询，确认日志为「只记录不动作」，`last-deployed` 前进，
   后端容器 `StartedAt` 不变。
4. **改 nginx**：先备份配置 → 写 301 → `nginx -t` → `systemctl reload nginx` → 回验
   301 / `/health` 200 / 裸路径 401。
5. **收尾**：写 `DEPLOY-RELEASE.md`，docs 单独提交 push（不触发部署）；`/var/www/frontend` 保留 7 天。

> 颠倒第 2、3 步的后果：旧 `deploy.sh` 把删除的 `frontend/**` 判为前端变更 →
> `rsync "$REPO_DIR/frontend/"` 源不存在 → 部署失败、写 `ALERT.txt`、该提交不再自动重试。
> 线上 Web 仍由旧静态文件提供服务，但流水线会停在失败状态。

## 6. 回退方案

| 对象 | 回退方式 |
| --- | --- |
| 仓库 | `git revert <删除提交>` 后 push；CI 会把 `frontend/**` 当普通文件记录，不会自动恢复 Web 部署，需同时还原 CI 脚本 |
| CI 脚本 | 恢复 `/opt/bookkeeping/ci/deploy.sh.bak.<时间戳>` 并重启 timer |
| nginx | 恢复 `/etc/nginx/sites-available/bookkeeping.bak.<时间戳>` → `nginx -t` → `reload` |
| Web 静态产物 | `/var/www/frontend` 保留 7 天，恢复 nginx 配置即可原样上线 |
| 数据 | 不涉及，无迁移 |

## 7. 风险与边界

1. **Vercel 入口不受本仓库控制**：`bookkeeping.neobee.top` 解析到 `cname.vercel-dns.com`，
   删除仓库文件不会让它下线；需用户在 Vercel 控制台删除项目或解绑域名。本机无 `vercel` / `gh` CLI。
2. **CSV 导入 UI 消失**：后端 `/transactions/import` 保留，但暂时没有调用方；App 需要时再补入口。
3. **App 无法回退到 Web**：若手机端出现严重问题，Web 不再是备用入口；`/var/www/frontend`
   与 nginx 备份保留 7 天作为窗口。
4. **CI 脚本双份**：仓库副本与服务器副本必须人工同步；本次改动以服务器副本为准。
5. **`bookkeeping.neobee.top` 的 CORS 条目**保留在 `backend/app/main.py`，删除后无副作用，
   不顺手清（避免无意义的后端部署）。

## 8. 验证矩阵

| 验证项 | 方法 | 期望 |
| --- | --- | --- |
| Shell 语法 | `bash -n` 三个脚本 | 全部通过 |
| 前端残留 | `grep -n "FRONTEND\|deploy_frontend\|frontend" deploy/ci/deploy.sh deploy/ci/ci.env.example` | 无输出 |
| CI 计划 | 服务器 `sudo deploy.sh --dry-run` | 只列后端/nginx/ci 判定，无 frontend |
| 删除提交 | 看 `/var/log/bk-deploy.log` | 「只记录不动作」，无重启 |
| Web 入口 | `curl -I https://api.bookkeeping.neobee.top/` | 301 → 下载页 |
| API | `/health` 200；`/transactions` 无令牌 401 | 与改动前一致 |
| OTA | `curl -s https://app.xyvora.me/bookkeeping/info.json` | 仍为 2.2.2，下载页 200 |
| App | 真机打开「拾光」 | 登录、记账、更新检查正常（无需重装） |
