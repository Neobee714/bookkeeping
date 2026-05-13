from __future__ import annotations

from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.date_utils import add_months, month_range, month_start
from app.core.response import success_response
from app.core.security import get_current_user
from app.models.enums import TransactionType
from app.models.transaction import Transaction
from app.models.user import User

router = APIRouter(prefix="/stats", tags=["stats"])


def _to_float(value: Decimal | None) -> float:
    return float(value or Decimal("0"))


_UNLABELED_NOTE = "未备注"


def _normalize_note(raw: str | None) -> str:
    if raw is None:
        return _UNLABELED_NOTE
    trimmed = raw.strip()
    return trimmed if trimmed else _UNLABELED_NOTE


def _aggregate_month_summary(
    db: Session,
    user_id: int,
    month: str | None,
) -> dict:
    month_text, start, end = month_range(month)
    base_filter = (
        Transaction.user_id == user_id,
        Transaction.date >= start,
        Transaction.date < end,
    )

    totals_stmt = (
        select(
            Transaction.type,
            func.coalesce(func.sum(Transaction.amount), Decimal("0")),
        )
        .where(*base_filter)
        .group_by(Transaction.type)
    )
    totals_rows = db.execute(totals_stmt).all()

    total_income = Decimal("0")
    total_expense = Decimal("0")
    for tx_type, amount_sum in totals_rows:
        if tx_type == TransactionType.INCOME:
            total_income = amount_sum
        elif tx_type == TransactionType.EXPENSE:
            total_expense = amount_sum

    category_stmt = (
        select(
            Transaction.category,
            func.coalesce(func.sum(Transaction.amount), Decimal("0")),
        )
        .where(*base_filter, Transaction.type == TransactionType.EXPENSE)
        .group_by(Transaction.category)
    )
    category_rows = db.execute(category_stmt).all()
    category_expenses = {category.value: _to_float(amount) for category, amount in category_rows}

    note_stmt = (
        select(
            Transaction.category,
            Transaction.note,
            func.coalesce(func.sum(Transaction.amount), Decimal("0")),
            func.count(Transaction.id),
        )
        .where(*base_filter, Transaction.type == TransactionType.EXPENSE)
        .group_by(Transaction.category, Transaction.note)
    )
    note_rows = db.execute(note_stmt).all()
    note_breakdown: dict[str, dict[str, dict[str, float | int]]] = {}
    for category, note_text, amount_sum, count in note_rows:
        label = _normalize_note(note_text)
        category_bucket = note_breakdown.setdefault(category.value, {})
        entry = category_bucket.setdefault(label, {"amount": 0.0, "count": 0})
        entry["amount"] = round(float(entry["amount"]) + _to_float(amount_sum), 2)
        entry["count"] = int(entry["count"]) + int(count or 0)

    note_breakdown_sorted = {
        category: sorted(
            (
                {"note": label, "amount": values["amount"], "count": values["count"]}
                for label, values in buckets.items()
            ),
            key=lambda item: item["amount"],
            reverse=True,
        )
        for category, buckets in note_breakdown.items()
    }

    count_stmt = select(func.count(Transaction.id)).where(*base_filter)
    total_count = int(db.scalar(count_stmt) or 0)

    return {
        "month": month_text,
        "total_income": _to_float(total_income),
        "total_expense": _to_float(total_expense),
        "balance": _to_float(total_income - total_expense),
        "transaction_count": total_count,
        "category_expenses": category_expenses,
        "note_breakdown": note_breakdown_sorted,
    }


@router.get("/monthly-summary")
def monthly_summary(
    month: str | None = Query(default=None, description="YYYY-MM"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    try:
        data = _aggregate_month_summary(db=db, user_id=current_user.id, month=month)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="month 参数格式错误，应为 YYYY-MM",
        ) from exc
    return success_response(data=data)


@router.get("/partner-summary")
def partner_monthly_summary(
    month: str | None = Query(default=None, description="YYYY-MM"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    if not current_user.partner_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="尚未绑定伴侣",
        )
    try:
        data = _aggregate_month_summary(db=db, user_id=current_user.partner_id, month=month)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="month 参数格式错误，应为 YYYY-MM",
        ) from exc
    return success_response(data=data)


@router.get("/trend")
def trend(
    months: int = Query(default=6, ge=1, le=24),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    current_month_start = month_start(date.today())
    start_month = add_months(current_month_start, -(months - 1))
    end_month = add_months(current_month_start, 1)

    month_keys = [
        add_months(start_month, idx).strftime("%Y-%m")
        for idx in range(months)
    ]
    buckets: dict[str, dict[str, float]] = {
        key: {"income": 0.0, "expense": 0.0} for key in month_keys
    }

    stmt = (
        select(Transaction.date, Transaction.type, Transaction.amount)
        .where(
            Transaction.user_id == current_user.id,
            Transaction.date >= start_month,
            Transaction.date < end_month,
        )
        .order_by(Transaction.date.asc())
    )
    rows = db.execute(stmt).all()
    for tx_date, tx_type, amount in rows:
        month_key = tx_date.strftime("%Y-%m")
        if month_key not in buckets:
            continue
        amount_float = _to_float(amount)
        if tx_type == TransactionType.INCOME:
            buckets[month_key]["income"] += amount_float
        elif tx_type == TransactionType.EXPENSE:
            buckets[month_key]["expense"] += amount_float

    data = [
        {
            "month": key,
            "income": round(buckets[key]["income"], 2),
            "expense": round(buckets[key]["expense"], 2),
            "balance": round(buckets[key]["income"] - buckets[key]["expense"], 2),
        }
        for key in month_keys
    ]
    return success_response(data=data)
