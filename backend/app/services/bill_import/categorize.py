"""商家归一化与分类推断。

推断顺序：用户规则 → 内置规则（关键词）→ 兜底。
规则存的是分类**名**，所以用户自建分类（「水」「小摔炮」）同样可以被规则命中；
内置规则永远不会创建新分类，只会落到用户已有的分类上。
"""

from __future__ import annotations

import re

DEFAULT_EXPENSE = "其他"
DEFAULT_INCOME = "收入"

# 归一化后的商家 → 目标分类（本 App 默认分类名）
BUILTIN_EXACT: dict[str, str] = {
    "美团": "餐饮",
    "美团平台商户": "餐饮",
    "饿了么": "餐饮",
    "淘宝平台商户": "购物",
    "淘宝": "购物",
    "天猫": "购物",
    "京东": "购物",
    "拼多多": "购物",
    "盒马": "日用",
    "盒马鲜生": "日用",
    "苏果超市": "日用",
    "永辉超市": "日用",
    "沃尔玛": "日用",
    "优宜便利店": "日用",
    "滴滴出行": "交通",
    "高德": "交通",
    "高德顺风车": "交通",
    "12306": "交通",
    "携程": "交通",
    "抖音": "购物",
    "快手": "购物",
    "闲鱼": "购物",
    "天猫": "购物",
    "京东": "购物",
    "拼多多": "购物",
    "饿了么": "餐饮",
    "蜜雪冰城": "餐饮",
    "达美乐": "餐饮",
    "达美乐比萨": "餐饮",
    "好想来": "零食",
    "喜茶": "餐饮",
    "申飞巴士": "交通",
    "中铁网络": "交通",
    "通行宝": "交通",
    "老乡鸡": "餐饮",
    "酵墅": "餐饮",
    "滴滴": "交通",
    "高德顺风车": "交通",
    "中国移动": "日用",
    "中国联通": "日用",
    "中国电信": "日用",
    "手机充值": "日用",
    "南京大牌档": "餐饮",
    "卡旺卡": "餐饮",
    "华顺碗碗香现炒自选快餐": "餐饮",
    "衢州鸭头": "餐饮",
    "蒸碗湘": "餐饮",
    "裕莲茶楼": "餐饮",
    "楠波炭炉鸡煲馆": "餐饮",
    "泽田": "餐饮",
    "金界台球": "娱乐",
}

# 关键词按顺序匹配，越靠前优先级越高
BUILTIN_KEYWORDS: list[tuple[str, tuple[str, ...]]] = [
    ("医疗", ("医院", "诊所", "药房", "药店", "口腔", "体检", "卫生服务")),
    (
        "餐饮",
        (
            "餐饮", "餐厅", "菜馆", "饭店", "食堂", "小吃", "快餐", "外卖",
            "火锅", "烧烤", "烤肉", "串", "麻辣烫", "面馆", "米线", "饺子",
            "包子", "粥", "早餐", "午餐", "晚餐", "烘焙", "蛋糕", "甜品",
            "奶茶", "咖啡", "茶楼", "茶饮", "饮料", "汉堡", "披萨", "寿司",
            "料理", "大牌档", "酒馆", "酒楼", "鸭头", "鸡煲", "烤鱼",
            "比萨", "披萨", "冰城", "米粉", "粉店", "酸汤",
            "猪脚饭", "砂锅", "粉丝汤", "油炸", "粑粑", "喜茶", "卤味",
        ),
    ),
    (
        "交通",
        (
            "地铁", "公交", "打车", "出行", "顺风车", "高铁", "火车", "机票",
            "航空", "加油", "充电桩", "停车", "出租车", "单车", "哈啰", "青桔",
            "高速", "etc", "顺风车", "景区", "巴士", "客运", "通行宝", "中铁",
            "火车票", "高铁票", "机场", "轮渡",
        ),
    ),
    (
        "日用",
        (
            "超市", "便利店", "百货", "生鲜", "菜场", "家居", "洗衣", "理发",
            "水费", "电费", "燃气", "话费", "充值", "快递", "清洁", "物业",
            "纸品", "日用", "造型", "食品",
        ),
    ),
    (
        "教育",
        ("学费", "培训", "课程", "教育", "学校", "文具", "书店", "图书", "考试", "驾校"),
    ),
    (
        "娱乐",
        (
            "电影", "影城", "游戏", "台球", "ktv", "酒吧", "网吧", "乐园",
            "门票", "演出", "会员", "视频", "音乐", "健身", "球馆", "游泳", "桌球", "台球馆",
            "k歌", "沐足", "按摩", "电竞", "棋牌", "洗浴", "足疗",
        ),
    ),
    (
        "购物",
        (
            "商城", "旗舰店", "得物", "服饰", "服装", "鞋", "女装", "男装", "美妆",
            "化妆", "眼镜", "数码", "电器", "手机店", "电子商务",
        ),
    ),
    ("零食", ("零食", "坚果", "水果", "糖果", "冰淇淋", "卤味")),
    ("居住", ("房租", "租金", "物业费", "房屋", "中介费", "酒店", "民宿")),
    ("收入", ("工资", "薪", "奖金", "报销", "退款")),
    ("红包", ("红包",)),
    ("理财", ("理财", "基金", "股票", "保险")),
]

_SUFFIXES = ("股份有限公司", "有限责任公司", "有限公司")
_BRACKETS = re.compile(r"[（(]")


def normalize_merchant(name: str | None) -> str:
    value = re.sub(r"\s+", "", name or "")
    if not value:
        return ""
    value = _BRACKETS.split(value)[0]
    for suffix in _SUFFIXES:
        if value.endswith(suffix) and len(value) > len(suffix):
            value = value[: -len(suffix)]
            break
    return value.lower()[:80]


def _fallback(type_: str, available: set[str]) -> str:
    preferred = DEFAULT_INCOME if type_ == "income" else DEFAULT_EXPENSE
    if preferred in available:
        return preferred
    if available:
        return sorted(available)[0]
    return preferred


def _match_builtin(merchant_key: str, haystack: str) -> str | None:
    if merchant_key in BUILTIN_EXACT:
        return BUILTIN_EXACT[merchant_key]
    for category, keywords in BUILTIN_KEYWORDS:
        if any(word in haystack for word in keywords):
            return category
    return None


def suggest(
    merchant: str | None,
    note: str | None,
    type_: str,
    rules: dict[str, str],
    categories: dict[str, set[str]],
    channel: str | None = None,
) -> tuple[str, str]:
    """返回 (分类名, 命中方式)。命中方式: learned / builtin / default。

    平台账单没有店铺时，用渠道名参与匹配（美团→餐饮、淘宝→购物、滴滴→交通）。
    """
    available = categories.get(type_, set())
    key = normalize_merchant(merchant) or normalize_merchant(channel)

    if key and key in rules:
        learned = rules[key]
        if learned in available:
            return learned, "learned"

    haystack = f"{key}{normalize_merchant(channel)}{(note or '').lower()}"
    builtin = _match_builtin(key, haystack)
    if builtin and builtin in available:
        return builtin, "builtin"

    return _fallback(type_, available), "default"
