# v0.7 落地记录：App-only 收敛（下线 Web 端）

- 创建时间：2026-10-23 11:30
- 状态：**仓库清理、CI 改造、服务器 nginx 切换已完成并验证**；
  **GitHub push 阻塞**（本机 SSH 身份 `Xyvora1` 对 `Neobee714/bookkeeping` 无写权限），
  因此「push → CI 自动处理删除提交」这一步尚未发生。

## 1. 改动清单（本地提交，未推送）

| 提交 | 内容 |
| --- | --- |
| `1cf55bb` chore: 下线 Web 端，仓库收敛为 App-only | 删除 `frontend/`（44 文件 / 6,894 行）与 `vercel.json`；CI 去前端分支；README / deploy 文档同步 |
| `c6c2931` docs: 新增 v0.7 App-only 收敛文档 | `docs/v0.7/{REQ,ARCH,CHECKLIST}.md`（本文件随后并入该提交） |

- 删除总量：69 个文件、19,012 行（含 `frontend/` 与 `vercel.json`）。
- `deploy/ci/deploy.sh`：删 `FRONTEND_SRC` / `FRONTEND_PUBLISH` / `FRONTEND_BUILD_SCRIPT` / `PUBLIC_HOST`、
  `FRONTEND_CHANGED` / `LOCK_CHANGED`、`deploy_frontend()` 与调用；no-op 判定改为
  `[ "$BACKEND_CHANGED$NGINX_CHANGED" = "00" ]`。
- `deploy/ci/ci.env.example`：删三个前端变量。
- `deploy/ci/README.md`：架构图、文件表、配置表、故障表改为 App-only；顺带修正两条过期说明
  （`deploy/` 已被跟踪、`app-distribute` 实际在服务器）。
- `deploy/ci/install.sh` / `uninstall.sh`：去掉 `$FRONTEND_PUBLISH` / `/var/www/frontend` 的注释与日志引用。
- 根 `README.md`：重写为 `mobile/` + `backend/` + `deploy/ci/`；补 macOS 本机构建 APK 的实际命令与校验步骤。
- **未动**：`backend/**`（CORS、`/transactions/import` 保留）、`mobile/**`（版本仍 2.2.2 / 222）、
  `docs/v0.1..v0.6`（历史归档）。

## 2. 服务器变更

### 2.1 CI 脚本（先于 push，顺序关键）

| 项 | 值 |
| --- | --- |
| 备份 | `/opt/bookkeeping/ci/deploy.sh.bak.20261023_112012`（旧 39,166 字节） |
| 新脚本 | `/opt/bookkeeping/ci/deploy.sh`，35,104 字节，sha256 `2da687d5…368e0c`（与本地逐位一致） |
| 同步文件 | `ci.env.example`、`README.md` 同步覆盖，均留 `.bak.20261023_112012` |
| 校验 | `bash -n` 通过；`grep -c "deploy_frontend\|FRONTEND_CHANGED"` = **0** |
| 行为 | `--dry-run` / `--status` 正常；timer 保持 `enabled/active`，下一轮直接用新脚本 |

> 为什么必须先换脚本：服务器运行的是 `/opt/bookkeeping/ci/deploy.sh`（不随仓库自更新）。
> 若先 push 删除提交，旧脚本会把 `frontend/**` 判为前端变更，`rsync "$REPO_DIR/frontend/"` 源不存在
> → 部署失败、写 `ALERT.txt`、该提交不再自动重试。

### 2.2 nginx（Web 入口下线）

| 项 | 值 |
| --- | --- |
| 备份 | `/etc/nginx/sites-available/bookkeeping.bak.20261023_112620` |
| 改动 | HTTPS server 段删 `root /var/www/frontend`、`location /assets/`、SPA `try_files`；`location /` 改 `return 301 https://app.xyvora.me/` |
| 保留 | `/api/` 重写、裸路径 API（`/auth` `/agent` `/transactions` `/budget` `/categories` `/savings` `/app-updates`）、`/stats/`、`= /health` |
| 校验 | `nginx -t` 通过 → `systemctl reload nginx` |
| 静态文件 | `/var/www/frontend` **保留**，计划 2026-10-30 后删除 |

注意：`bookkeeping.neobee.top` 是 **Vercel**（CNAME → `cname.vercel-dns.com`），不受本次 nginx 改动影响，
仍返回 200；需用户在 Vercel 控制台删除项目或解绑域名。本机没有 `vercel` CLI。

## 3. 验证结果（2026-10-23 11:20–11:27）

| 验证项 | 实际结果 |
| --- | --- |
| `bash -n` 三脚本（本地 + 服务器） | 通过 |
| `grep FRONTEND/deploy_frontend`（deploy.sh + ci.env.example） | 无输出 |
| `deploy.sh --dry-run`（服务器，新脚本） | 「远端 main = 9787eda / 无需部署」，无前端判定 |
| `deploy.sh --status` | 最近成功 9787eda；无失败记录；timer enabled/active |
| `https://api.bookkeeping.neobee.top/` | **301** → `https://app.xyvora.me/` |
| `https://neobee.top/` / `https://www.neobee.top/` | **301** → `https://app.xyvora.me/` |
| `/health` / `/api/health` | 200 / 200 |
| `/transactions`（无令牌） | 401 |
| `/app-updates/latest` | 200 |
| `info.json` / `latest.apk` | 200（2.2.2，`7935de27…e0bd`） |
| OTA 下载页 `https://app.xyvora.me/` | 200 |
| `bookkeeping.neobee.top`（Vercel） | 200（**待手动下线**） |
| `mobile/` 变更 | 无；`versionCode 222` / `2.2.2` 未动，本次不构建 APK |

## 4. push 阻塞与解除方式

本地 `git push origin main` 失败：

```
ERROR: Permission to Neobee714/bookkeeping.git denied to Xyvora1.
fatal: Could not read from remote repository.
```

已排查：

- `ssh -T git@github.com` → `Hi Xyvora1!`（本机密钥有效，但该账号对仓库无 write）
- HTTPS 推送 → `No anonymous write access`（本机 Keychain 无 GitHub 凭据）
- 服务器 `~/.ssh/bk-deploy` → `Permission denied (publickey)`（该 Deploy Key 已失效/未授权）
- 本机无 `gh`、无 `GITHUB_TOKEN`、无 `~/.git-credentials`、无 `~/.netrc`

解除方式（任选其一，由用户操作）：

1. **加 Deploy Key（推荐，最小权限）**：仓库 Settings → Deploy keys → Add deploy key，
   粘贴本机公钥并勾选 **Allow write access**：
   ```
   ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIONBBjAZsqmcnUWTc9RZe1DSxbr/oYQNyWnp/QsEbctG xyvora@XyvoradeMacBook-Pro
   指纹 SHA256:CltWB6OW3MzorcnnnRZ4BFi9bqgAIEZdKwyImMCsdDI
   ```
2. 或把 `Xyvora1` 加为仓库 collaborator（Write 权限）。
3. 或在有权限的机器上执行 `git push`（需先把本地两个提交带过去）。

解除后执行：

```bash
cd ~/Documents/Private/bookkeeping
git push origin main
# 等 ≤2 分钟，看流水线如何处理删除提交
ssh ubuntu@119.28.186.88 'tail -30 /var/log/bk-deploy.log'
```

预期日志：`变更判定：backend=否 nginx=否 ci=否` → `只记录不动作（mobile/、docs/ 等）` →
`本轮不需要部署` → `已标记为已处理`；后端容器 `StartedAt` 不变。

## 5. 回退

| 对象 | 方式 |
| --- | --- |
| 仓库 | `git revert`/`git reset` 本地两个提交；若已推送则 revert 后 push |
| CI 脚本 | `sudo cp -a /opt/bookkeeping/ci/deploy.sh.bak.20261023_112012 /opt/bookkeeping/ci/deploy.sh`；`systemctl restart bk-deploy.timer` |
| nginx | `sudo cp -a /etc/nginx/sites-available/bookkeeping.bak.20261023_112620 /etc/nginx/sites-available/bookkeeping && sudo nginx -t && sudo systemctl reload nginx` |
| Web 静态产物 | `/var/www/frontend` 未删；恢复 nginx 配置即原样上线 |
| 数据 | 无迁移、无 dump 变更 |

## 6. 后续待办

- [ ] 解除 GitHub 写权限 → push 两个本地提交 → 确认 CI 把删除提交记为「只记录不动作」
- [ ] 删除 Vercel 上的 `bookkeeping.neobee.top` 项目（或改 DNS），这是最后一个 Web 入口
- [ ] 2026-10-30 后删除 `/var/www/frontend` 与 nginx 备份（确认无回滚需求）
- [ ] 更新 `bookkeeping-app-iteration` skill：仓库地图去掉 `frontend/`，坑 5 改为「Web 已下线，导入接口保留」
- [ ] 若日后需要 CSV 导入：后端 `/transactions/import` 仍在，只需在 App 补入口

## 7. 修订记录

| 时间 | 变更说明 |
| --- | --- |
| 2026-10-23 11:30 | 创建落地记录：仓库/CI/nginx 变更、验证矩阵、push 权限阻塞与解除方式、回退与后续待办 |
