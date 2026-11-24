# v0.23 ARCH：账单导入

## 数据流

```
zip/xlsx/csv ──> 识别 ──> 解压/解码 ──> 解析为 BillRow ──> 分类推断 ──> 预览(不落库)
                                                                    │
                                                    用户确认 / 改分类 / 勾选记住规则
                                                                    ▼
                                                            提交（去重 + 落库 + 学规则）
```

## 后端

新增 `app/services/bill_import/`：

| 文件 | 职责 |
| --- | --- |
| `unzip.py` | ZipCrypto 解压（先试密码，失败则穷举 6 位数字） |
| `crack.py` | numpy 向量化 6 位爆破，无 numpy 时纯 Python 退路 |
| `detect.py` | 类型嗅探、编码识别、分发到具体解析器 |
| `wechat.py` | 微信支付账单（xlsx / csv，11 列，前 N 行抬头） |
| `alipay.py` | 支付宝账单（GBK csv，16 列） |
| `categorize.py` | 商家归一 + 内置规则 + 用户规则 |
| `service.py` | 预览 / 提交的事务编排 |

新表 `import_rules`：`(user_id, source, merchant_key)` 唯一，`category` 存分类名，`hits` 计数。

## 接口

两个接口都在 `/transactions` 前缀下（nginx 白名单已覆盖，无需改配置）。

### POST /transactions/import/preview

`multipart/form-data`：`file`（必填）、`password`（可选，zip 密码）。

```json
{
  "source": "wechat",
  "summary": {
    "total": 166,
    "importable": 120,
    "skipped": 46,
    "expense_count": 120,
    "expense_amount": "5453.94",
    "income_count": 0,
    "income_amount": "0.00",
    "range": ["2026-10-23", "2026-11-22"],
    "account": "Dddd.",
    "skipped_reasons": [
      {"reason": "已全额退款", "count": 6, "amount": "470.90"},
      {"reason": "转账/红包", "count": 21, "amount": "6556.50"},
      {"reason": "中性交易", "count": 8, "amount": "880.30"},
      {"reason": "退款", "count": 10, "amount": "727.90"}
    ]
  },
  "categories": {
    "expense": [{"name": "餐饮", "icon": "🍜"}],
    "income": [{"name": "收入", "icon": "💰"}]
  },
  "rows": [
    {
      "client_id": "wx:4200003243202611220702889294",
      "date": "2026-11-22",
      "amount": "45.98",
      "type": "expense",
      "merchant": "淘宝平台商户",
      "note": "",
      "category": "购物",
      "match": "builtin",
      "existing": false
    }
  ],
  "skipped": [
    {"reason": "转账/红包", "date": "2026-11-09", "amount": "1000.00", "merchant": "j吴俊旺", "type": "expense"}
  ]
}
```

`match` 取值：`learned`（用户规则命中）、`builtin`（内置规则）、`default`（兜底）、`existing`（已入过账，分类取库里的值）。

### POST /transactions/import/commit

```json
{
  "source": "wechat",
  "rows": [
    {"client_id": "wx:...", "date": "2026-11-22", "amount": "45.98",
     "type": "expense", "category": "购物", "merchant": "淘宝平台商户", "note": ""}
  ],
  "learn": [{"merchant": "美团", "category": "餐饮"}]
}
```

返回：

```json
{"imported": 118, "duplicated": 2, "learned": 3, "invalid": 0}
```

## 分类策略（含用户自定义分类）

推断顺序：

1. **用户规则**（`import_rules`，按归一化商家精确匹配）→ 规则里的分类名。
2. **内置规则**（关键词 → 微信记账本同类目名 → 映射到本 App 默认分类名）。
3. **兜底**：支出→`其他`，收入→`收入`；若该用户没有这些分类，取同类型第一个分类。

要点：

- 规则存**分类名**而不是 id：与 `transactions.category` 一致，重命名分类时规则自然失效并回落，不会写坏数据。
- 用户新增分类后，只要在预览里改一次并勾「记住」，规则就指向这个自定义分类（例如「沉浸式小摔炮」→「小摔炮」）。内置规则永远不会凭空创建分类，避免污染分类列表。
- 商家归一化：去空格、截断到第一个括号、去掉「有限公司/有限责任公司」后缀、转小写。`南京大牌档（华采天地店）` → `南京大牌档`。

## 解析规则

微信：

- 抬头行解析账号与时间区间；`共N笔/收入/支出/中性` 用于校验。
- 列：交易时间、交易类型、交易对方、商品、收/支、金额(元)、支付方式、当前状态、交易单号、商户单号、备注。
- 跳过：`收/支 == "/"`（中性）、状态含「已全额退款」、交易类型含「退款」、交易类型 ∈ {转账, 微信红包, 零钱提现, 转入零钱通*, 零钱通转出*}。
- `商品` 为 `商户单号…` 或 `/` 时备注留空；其余作为备注（截断 255）。

支付宝：

- GBK 解码，前 4 行抬头，表头含「交易号 / 交易时间 / 收/支」。
- 跳过：`收/支 == 不计收支`、`交易状态` 含「退款」或「已关闭」。
- 去重键：`ali:<交易号>`。

## 去重

`client_id = f"{source}:{外部单号}"`，复用 `transactions.(user_id, client_id)` 唯一约束。提交时先查已存在集合，重复的直接计入 `duplicated`，不再插入。
