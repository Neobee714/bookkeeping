from __future__ import annotations

from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, Literal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.enums import TransactionType
from app.models.transaction import Transaction
from app.schemas.transaction import NoteSuggestion

Dimension = Literal["merchant", "item"]

MERCHANT_SUFFIXES = (
    "店",
    "馆",
    "餐厅",
    "饭店",
    "咖啡",
    "茶",
    "超市",
    "商场",
    "食堂",
    "摊",
    "铺",
    "屋",
    "记",
)

ITEM_WORDS = (
    "面",
    "粉",
    "饭",
    "火锅",
    "烧烤",
    "咖啡",
    "奶茶",
    "甜品",
    "饺子",
    "包子",
    "粥",
    "汤",
    "烤肉",
    "炸鸡",
    "汉堡",
    "披萨",
    "寿司",
    "米线",
    "麻辣烫",
)

EVALUATION_WORDS = (
    "好吃",
    "难吃",
    "一般",
    "不错",
    "咸",
    "淡",
    "辣",
    "香",
    "环境",
    "服务",
    "分量",
    "性价比",
)

_CENT = Decimal("0.01")


def suggest_note_kind(note: str | None) -> NoteSuggestion | None:
    """按关键字猜旧备注用途，仅作 UI 提示，不自动应用。"""
    text = (note or "").strip()
    if not text:
        return None

    merchant_hit = any(text.endswith(suffix) for suffix in MERCHANT_SUFFIXES)
    item_hit = any(word in text for word in ITEM_WORDS)
    evaluation_hit = any(word in text for word in EVALUATION_WORDS)

    if merchant_hit and item_hit:
        return "both"
    if merchant_hit:
        return "merchant"
    if item_hit:
        # 精确命中菜品词（面/粉/饭…）或很短（牛肉面/酸辣粉）才当菜品；
        # 「和府捞面」这类长词可能是店名，宁可返回 None 让用户自己选。
        if text in ITEM_WORDS or len(text) <= 3:
            return "item"
    if evaluation_hit:
        return "evaluation"
    return None


def _to_float(value: Decimal | None) -> float:
    return float(value or Decimal("0"))


def _avg(amount: Decimal, count: int) -> float:
    if count <= 0:
        return 0.0
    return float((amount / Decimal(count)).quantize(_CENT, rounding=ROUND_HALF_UP))


def aggregate_named_dimension(
    db: Session,
    *,
    user_id: int,
    dimension: Dimension,
    start: date,
    end_exclusive: date,
    tx_type: TransactionType = TransactionType.EXPENSE,
    category: str | None = None,
    limit: int | None = 20,
) -> list[dict[str, Any]]:
    """按商家/菜品聚合金额与次数，金额降序；空值不计入。"""
    column = Transaction.merchant if dimension == "merchant" else Transaction.item
    label = func.trim(column)

    filters = [
        Transaction.user_id == user_id,
        Transaction.date >= start,
        Transaction.date < end_exclusive,
        Transaction.type == tx_type,
        column.is_not(None),
        label != "",
    ]
    if category:
        filters.append(Transaction.category == category)

    rows = db.execute(
        select(
            label,
            func.coalesce(func.sum(Transaction.amount), Decimal("0")),
            func.count(Transaction.id),
        )
        .where(*filters)
        .group_by(label)
    ).all()

    items: list[dict[str, Any]] = []
    for name, amount_sum, count in rows:
        amount = Decimal(amount_sum or 0)
        item_count = int(count or 0)
        items.append(
            {
                "name": name,
                "amount": _to_float(amount),
                "count": item_count,
                "avg": _avg(amount, item_count),
            }
        )

    items.sort(key=lambda item: (-item["amount"], item["name"]))
    return items if limit is None else items[:limit]


def count_legacy_notes(db: Session, user_id: int) -> int:
    """去重统计尚未整理的旧备注数（note_kind IS NULL）。"""
    label = func.trim(Transaction.note)
    return int(
        db.scalar(
            select(func.count(func.distinct(label))).where(
                Transaction.user_id == user_id,
                Transaction.note_kind.is_(None),
                Transaction.note.is_not(None),
                label != "",
            )
        )
        or 0
    )


def dining_summary(
    db: Session, *, user_id: int, start: date, end_exclusive: date
) -> dict[str, Any]:
    """分类为「餐饮」的支出汇总。"""
    row = db.execute(
        select(
            func.coalesce(func.sum(Transaction.amount), Decimal("0")),
            func.count(Transaction.id),
        ).where(
            Transaction.user_id == user_id,
            Transaction.date >= start,
            Transaction.date < end_exclusive,
            Transaction.type == TransactionType.EXPENSE,
            Transaction.category == "餐饮",
        )
    ).one()
    amount = Decimal(row[0] or 0)
    count = int(row[1] or 0)
    return {"count": count, "amount": _to_float(amount), "avg": _avg(amount, count)}
