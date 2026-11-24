# v0.25 账单邮箱自动导入（QQ / 163）

## 边界

微信侧仍需手动申请导出（我 → 服务 → 钱包 → 账单 → 常见问题 → 下载账单 → 填邮箱），
自动化从「邮件到达邮箱」开始：IMAP 收件 → 取 zip 附件 → 6 位密码穷举 → 解析 → 去重 → 入账。

## 后端

- 表 `bill_mailboxes`：每用户一条，`provider(qq/163)`、`host/port`、`username`、`password_enc`、
  `folder`、`enabled`、`last_sync_at/status/error/summary`。授权码用 SECRET_KEY 派生 Fernet 加密。
- IMAP：`imaplib.IMAP4_SSL` + 登录后发送 **IMAP ID**（163 不发会 `Unsafe Login`）。
  只处理未读、附件后缀为 zip/xlsx/csv 的邮件；处理完标记已读。
- 同步：复用 `bill_import.preview/commit`，按 `client_id` 去重；每封邮件的结果写回 `last_*`。
- 调度：`bill_mail_scheduler` 每 10 分钟一轮，`BILL_MAIL_SCHEDULER=off` 可关。
- 接口（都在 `/transactions/import/mailbox`）：
  - `GET` 查询配置（永不返回授权码，只回 `has_password`）
  - `PUT` 保存（provider/username/password?/folder/enabled）；password 留空表示沿用
  - `POST /test` 连接测试（失败 400 + 可读原因）
  - `POST /sync` 立即同步，返回 `{ok,messages,imported,duplicated,failed,error,summary}`
  - `DELETE` 删除配置

## App

我的 → 账单邮箱：提供商（QQ/163）、邮箱地址、授权码（密文输入，留空不改）、文件夹（高级）、
启用开关、测试连接、保存、立即同步、最近同步状态（时间/结果/错误）。
`secret_stable=false` 时提示「服务器 SECRET_KEY 不稳定，重启后需重新填写授权码」。

## 实测（2026-11-24，QQ 邮箱）

- **微信账单邮件没有附件**：正文里是 `tenpay.wechatpay.cn/...downloadfilefromemail?encrypted_file_data=…`
  的签名下载链接，无 Cookie 可直接 GET 到 zip（`Content-Type: application/zip`）。
  因此同步同时处理 **附件** 与 **正文下载链接** 两种形态。
- 下载链接有时效，过期返回 403/404，错误文案提示「请重新在微信里申请账单」。
- 拉取前先取 `From/Subject` 预过滤（发件人 wxpay/tenpay/alipay 或主题含「账单/交易记录/流水」），
  避免把整个收件箱下下来；英文 "bill" 不能作为关键词（会命中 Railway 等 newsletter）。
- 实测一轮：1 封账单邮件 → 下载 → 解 zip → 120 笔入账，耗时约 10–13 秒；第二轮 0 封（UID 游标）。

## 已知限制

- 163/QQ 需要在邮箱设置里开启 IMAP 并生成授权码；用登录密码会登录失败。
- 服务器 `SECRET_KEY` 必须是稳定的（线上 .env 已配置）；本地临时启动会导致已存授权码无法解密。
- 同一封邮件重复投递不会重复入账（client_id 去重），但会重复「解析一遍」。
