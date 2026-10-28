# v0.14 清单：API 主机名迁移

- 创建时间：2026-10-28
- App 版本：2.5.1 / versionCode 229

## 阶段 1：DNS 与服务器

- [x] `api.neobee.top` A 记录已指向新机并启用 Cloudflare 代理
- [x] Let's Encrypt 源站证书签发成功
- [x] Nginx HTTPS vhost 配置并通过 `nginx -t`
- [x] 源站 `/health` 返回 JSON 200
- [x] Certbot renewal dry-run 通过，Nginx deploy hook 已验证
- [x] Cloudflare Bot Fight Mode 关闭后，代理域名 `/health` 以 OkHttp UA 返回 JSON 200

## 阶段 2：App 与门禁

- [x] `API_BASE_URL` 改为 `https://api.neobee.top`
- [x] Android versionCode 229 / versionName 2.5.1
- [x] `npx tsc --noEmit` 通过
- [x] `npx jest --runInBand` 通过
- [x] `npx eslint .` 通过
- [x] `assembleRelease` 成功
- [x] aapt2、APK 内嵌 bundle、apksigner 签名检查通过
- [x] Git commit `8365f9f` 已推送到 main；VPS 轮询只记录 mobile 变更，没有重启 backend

## 阶段 3：OTA 发布

- [x] `publish.sh` 发布 2.5.1，`info.json` 显示 `force=false`
- [x] 公网 `latest.apk` 字节数与 SHA-256 和本机构建一致
- [ ] 真机安装并完成登录/记账 API 验收（当前 `adb devices -l` 未发现设备）
