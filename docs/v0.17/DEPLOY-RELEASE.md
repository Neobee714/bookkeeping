# v0.17 发布说明（尚未发布）

版本：**2.7.0 / versionCode 233**（`mobile/android/app/build.gradle`）
状态：**代码与文档已完成、门禁通过；未构建 APK、未发布 OTA、未 push、未部署**（用户要求「不慌推出 OTA」）。

## 发布前必须先做

1. **nginx 白名单加 `/reports`**（否则 App 请求会落进 `location /` 的 301 下载页，看起来像接口不存在）：
   线上文件 `/etc/nginx/sites-available/api-neobee` 的正则改成
   `location ~ ^/(auth|agent|transactions|budget|categories|savings|app-updates|reports)(/|$)`。
   改前 `cp -a` 备份，`nginx -t` 通过再 `systemctl reload nginx`。
2. **后端发布**：push `backend/**` 后由 `bk-deploy.timer` 自动 build / alembic upgrade / 重启。
   新迁移 `a4b7c2d9e6f1_add_report_tables.py` 建 `report_schedules` / `reports` 两表。
3. 探活：`curl https://api.neobee.top/health`；新前缀期望 401（未登录）而不是 301：
   `curl -o /dev/null -w '%{http_code}' https://api.neobee.top/reports`。
4. **APK**：构建 2.7.0/233，按 `bookkeeping-app-iteration` 的 APK 流程校验包名/签名/sha256，
   上传 OTA 后再在 vivo 真机走一遍：图表页入口 → 生成设置 → 立即生成 → 列表未读 → 详情 → 已读消失。
5. 四套皮肤真机目检：极光 / 糖果 / 霓虹 / 浮雕，重点看详情 hero 与设置弹层。

## 回退

- App：OTA 保留上一版 APK，重新发布旧 `versionCode` 的包不可行（versionCode 不能回退），
  必要时发一个更高 versionCode 的修复版。
- 后端：`sudo /opt/bookkeeping/ci/deploy.sh` 部署上一提交；迁移只新增两张表，
  回退代码不影响已有账单表。
- nginx：改前备份 `api-neobee`，失败立即 cp 回并 `nginx -t`。

## 已知边界

- 报告只统计个人账本，不含伴侣数据。
- 服务端每 3600 秒检查一次，生成时间可能比设置晚最多约 1 小时。
- 每月 N 日（N > 1）生成的月报覆盖「上一个月」，按完整自然月口径。
- 洞察由本地规则生成，不调用大模型。
