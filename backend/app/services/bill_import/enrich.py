"""账单字段清洗：渠道（平台）识别与商品描述清理。

微信/支付宝账单只给「交易对方 + 商品 + 状态」：
- 交易对方 可能是平台（淘宝、美团）也可能是店铺（盒马、南京大牌档）；
- 商品 可能是真实店铺/门店（美团的团购单），也可能是订单号、支付方式说明这类噪声。

这里把三者拆成 `merchant`（店铺）+ `channel`（平台），噪声直接丢弃，
不再往 `note` 里塞商品原文——note 只放用户自己的话。
"""

from __future__ import annotations

import re

# 交易对方 / 商品里出现的平台关键字 → 统一渠道名
PLATFORMS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("淘宝", ("淘宝",)),
    ("天猫", ("天猫",)),
    ("京东", ("京东",)),
    ("拼多多", ("拼多多",)),
    ("美团", ("美团", "大众点评")),
    ("饿了么", ("饿了么",)),
    ("抖音", ("抖音", "抖店")),
    ("快手", ("快手",)),
    ("滴滴", ("滴滴",)),
    ("高德", ("高德",)),
    ("闲鱼", ("闲鱼",)),
    ("携程", ("携程",)),
    ("12306", ("12306", "铁路")),
)

# 这些「商品」文本不是店铺，是支付方式/订单结构说明
GENERIC_PRODUCTS = (
    "聚合支付",
    "先乘车后付款",
    "到店付",
    "扫码",
    "收款",
    "付款",
    "消费",
    "订单",
    "团购",
    "外卖",
    "商户单号",
    "平台商户",
    "服务费",
    "退款",
    "支付",
    "套餐",
    "新品",
    "买一送一",
    "优惠券",
    "代金券",
    "双人",
    "单人",
)

_PREFIX_TAG = re.compile(r"^【[^】]*】_?")
_PLATFORM_SUFFIX = re.compile(r"[-_]?(美团App|大众点评|饿了么App|抖音|快手)[-_].*$")
_LONG_NUMBER = re.compile(r"[_-]\d{4,}.*$")
_TRAILING_KIND = re.compile(r"[-_]?(消费|到店付|订单|点餐订单|团购订单).*$")


def detect_channel(counterparty: str | None) -> str:
    text = (counterparty or "").strip()
    if not text:
        return ""
    for channel, keywords in PLATFORMS:
        if any(word in text for word in keywords):
            return channel
    return ""


def clean_product(goods: str | None) -> str:
    """把「商品」洗成可能是店铺名的短语；不是店铺就返回空串。"""
    text = (goods or "").strip()
    if text in {"", "/", "None", "-"}:
        return ""

    text = _PREFIX_TAG.sub("", text)
    text = _PLATFORM_SUFFIX.sub("", text)
    text = _TRAILING_KIND.sub("", text)
    text = _LONG_NUMBER.sub("", text)
    text = text.strip(" _-·")

    if not text or len(text) > 30:
        return ""
    if any(word in text for word in GENERIC_PRODUCTS):
        return ""
    if not re.search(r"[\u4e00-\u9fffA-Za-z]", text):
        return ""
    return text


def resolve_party(
    counterparty: str | None, goods: str | None, channel: str
) -> tuple[str, str]:
    """返回 (merchant, note)。

    - 平台交易：商品里能认出店铺就用店铺，否则用平台名；
    - 线下/自营：只有「品牌 + 分店」结构才把分店并进商家；
    - 备注一律留空（导入不写用户备注）。
    """
    base = (counterparty or "").strip()[:50]
    hint = clean_product(goods)

    if channel:
        # 平台交易：认不出具体店铺就只留渠道，别把「淘宝平台商户」塞进商家
        if not hint or channel in hint:
            return "", ""
        return hint[:50], ""

    if not hint:
        return base, ""

    has_branch = "（" in base or "(" in base
    if hint.endswith("店") and len(hint) <= 12 and not has_branch and base and base not in hint:
        return f"{base}（{hint}）"[:50], ""

    return base, ""
