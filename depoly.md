# 账本 App 部署手册

目标：`ledger.neobee.top` 上跑你的记账 App，真实云同步，双人独立数据。

---

## 第一步：创建 GitHub 仓库

1. 打开 GitHub，新建仓库，命名 `ledger-app`，设为 **Private**
2. 本地新建文件夹，复制代码文件，目录结构如下：

```
ledger-app/
├── backend/
│   ├── main.py
│   ├── requirements.txt
│   └── Procfile
└── frontend/
    ├── package.json
    ├── index.html
    ├── vite.config.js
    └── src/
        ├── main.jsx
        └── App.jsx
```

3. 推送到 GitHub：
```bash
git init
git add .
git commit -m "init ledger app"
git branch -M main
git remote add origin https://github.com/你的用户名/ledger-app.git
git push -u origin main
```

---

## 第二步：Railway 新建项目 + PostgreSQL

1. 打开 railway.app，点击 **New Project**
2. 选择 **Empty Project**，命名为 `ledger`
3. 在项目里点 **+ Add Service** → **Database** → **PostgreSQL**
4. 数据库建好后，点进去 → **Variables** 标签 → 复制 `DATABASE_URL` 的值备用
postgresql://postgres:wnCZqjYojLNKkXzpyXjhqRNSchCvEIRD@postgres.railway.internal:5432/railway
---

## 第三步：部署后端（FastAPI）

1. 在同一个项目里，点 **+ Add Service** → **GitHub Repo** → 选 `ledger-app`
2. Railway 会问你 **Root Directory**，填 `backend`
3. 进入这个 Service → **Variables** 标签，添加以下环境变量：

| 变量名          | 值                               |
|----------------|----------------------------------|
| `DATABASE_URL` | （粘贴第二步复制的那个 URL）         |
| `SECRET_KEY`   | 随机字符串，例如 `a8f3k9x2m7qw`    |
| `PASSWORD_ME`  | 你自己的登录密码，自定义            |
| `PASSWORD_GF`  | 女友的登录密码，自定义              |

4. 点 **Deploy**，等待部署完成（约 1-2 分钟）
5. 进入 **Settings** → **Networking** → **Generate Domain**，记下这个地址，格式类似：
   `https://backend-xxxx.up.railway.app`
https://backend-8a41.up.railway.app
---

## 第四步：部署前端（React）

1. 再次点 **+ Add Service** → **GitHub Repo** → 选同一个 `ledger-app`
2. **Root Directory** 填 `frontend`
3. 进入 Variables，添加一条：

| 变量名          | 值                                        |
|----------------|-------------------------------------------|
| `VITE_API_URL` | `https://backend-xxxx.up.railway.app`     |

   （就是第三步记下的后端地址，注意不要加末尾斜杠）

4. 点 **Deploy**，等待完成

---

## 第五步：绑定域名（Cloudflare）

> 目标：`ledger.neobee.top` 指向前端

1. 打开 Cloudflare → 选 `neobee.top` → **DNS 记录**
2. 添加一条 CNAME：

| 类型  | 名称   | 目标值                                  |
|------|-------|-----------------------------------------|
| CNAME | ledger | `frontend-xxxx.up.railway.app`（前端域名） |

   注意：把 **Proxy status（橙色云朵）关掉**，设为 DNS only（灰色）

3. 回到 Railway 前端服务 → **Settings** → **Custom Domain** → 填入 `ledger.neobee.top`

4. 等待 5-10 分钟 DNS 生效

---

## 第六步：告诉女友怎么用

发给她这个地址：`https://ledger.neobee.top`

登录时：
- **我的账号**：选「我」，输入你设置的 `PASSWORD_ME`
- **她的账号**：选「她」，输入你设置的 `PASSWORD_GF`

两人数据**完全独立**，不会互看，但都存在同一个数据库里，换手机也能看历史。

---

## 后续如果要改代码

改完后 `git push`，Railway 检测到变化会**自动重新部署**，不需要手动操作。

---

## 常见问题

**Q: 登录后提示 "请求失败"？**
A: 检查前端的 `VITE_API_URL` 是否正确填了后端地址，重新 Deploy 前端。

**Q: 后端 Deploy 失败？**
A: 查看 Railway 的 Build Logs，通常是 `DATABASE_URL` 没填或格式错误。

**Q: Cloudflare 域名不生效？**
A: 确认 CNAME 记录的 Proxy 是灰色（DNS only），不是橙色。