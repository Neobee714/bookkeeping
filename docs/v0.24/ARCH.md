# v0.24 分类 / 商家 / 备注适配微信账单（方案 A）

## 目标

让导入的账单不修就能看：列表标题、商家排行、分类统计都成立。

## 字段

`transactions` 新增 `channel`（平台/渠道，String(20)，可空）；`merchant` 收窄为「店铺」；`note` 只放用户自己的话，导入不再塞商品原文。

| 字段 | 含义 | 来源 |
| --- | --- | --- |
| category | 分类 | 规则推断 + 用户改 |
| merchant | 店铺 | 导入抽取 / 手填 |
| channel | 平台（淘宝/美团/滴滴…） | 导入按交易对方判定 |
| note | 用户备注 | 手填 |

## 导入清洗规则

- 交易对方是平台 → `channel`；商品里认得出店铺 → `merchant`，否则 `merchant` 留空、只显示平台。
- 商品里的订单号（`团购-美团App-…`）、支付方式说明（`万家聚合支付`、`先乘车后付款`）直接丢弃。
- 线下品牌 + 分店：`南京大牌档` + `华采天地店` → `南京大牌档（华采天地店）`；商家已有分店括号时不再套娃。
- 分类推断时渠道参与匹配：美团/饿了么→餐饮、淘宝/天猫/京东/拼多多/抖音→购物、滴滴/高德/12306→交通。

## 接口

- 预览行新增 `channel`；提交行接受 `channel`；`learn` 支持 `{merchant?, channel?, category}`（平台单用 channel 当规则键）。
- `GET /transactions/import/rules`、`PATCH /transactions/import/rules/{id}`、`DELETE /transactions/import/rules/{id}`。
- `GET /stats/breakdown?dimension=channel` 返回平台排行。

## App

- 列表行：标题 `店铺 || 平台 || 分类`，副标题 `备注`；有平台且有店铺时显示平台 chip。
- 图表支出分布三档：分类 / 商家 / 平台；分类明细页支持按平台进入。
- 导入预览行显示平台 chip；「记住规则」对平台单按 channel 学习。
- 我的 → 分类规则：列出学过的规则，可改分类、删除。

## 兼容

`channel` 可空，老 APK 忽略；迁移只加列。渠道排行只统计导入的账单，手记账单需要后续回填（方案 B）。
