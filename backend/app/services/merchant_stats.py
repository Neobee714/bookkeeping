from __future__ import annotations

from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.enums import TransactionType
from app.models.transaction import Transaction
from app.schemas.transaction import NoteSuggestion

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

    if any(text.endswith(suffix) for suffix in MERCHANT_SUFFIXES):
        return "merchant"
    if any(word in text for word in EVALUATION_WORDS):
        return "evaluation"
    return None


def _to_float(value: Decimal | None) -> float:
    return float(value or Decimal("0"))


def _avg(amount: Decimal, count: int) -> float:
    if count <= 0:
        return 0.0
    return float((amount / Decimal(count)).quantize(_CENT, rounding=ROUND_HALF_UP))


def _aggregate_by(
    db: Session,
    column,
    *,
    user_id: int,
    start: date,
    end_exclusive: date,
    tx_type: TransactionType,
    category: str | None,
    limit: int | None,
) -> list[dict[str, Any]]:
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


def aggregate_merchants(
    db: Session,
    *,
    user_id: int,
    start: date,
    end_exclusive: date,
    tx_type: TransactionType = TransactionType.EXPENSE,
    category: str | None = None,
    limit: int | None = 20,
) -> list[dict[str, Any]]:
    """按商家（店铺）聚合金额与次数，金额降序；空值不计入。"""
    return _aggregate_by(
        db,
        Transaction.merchant,
        user_id=user_id,
        start=start,
        end_exclusive=end_exclusive,
        tx_type=tx_type,
        category=category,
        limit=limit,
    )


def aggregate_channels(
    db: Session,
    *,
    user_id: int,
    start: date,
    end_exclusive: date,
    tx_type: TransactionType = TransactionType.EXPENSE,
    category: str | None = None,
    limit: int | None = 20,
) -> list[dict[str, Any]]:
    """按渠道（平台）聚合金额与次数，金额降序；没记渠道的账单不计入。"""
    return _aggregate_by(
        db,
        Transaction.channel,
        user_id=user_id,
        start=start,
        end_exclusive=end_exclusive,
        tx_type=tx_type,
        category=category,
        limit=limit,
    )


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
