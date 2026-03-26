from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.date_utils import month_range
from app.core.response import success_response
from app.core.security import get_current_user
from app.models.budget import Budget
from app.models.enums import CategoryEnum, TransactionType
from app.models.transaction import Transaction
from app.models.user import User
from app.schemas.budget import BudgetCreateRequest, BudgetUpdateRequest

router = APIRouter(prefix="/budget", tags=["budget"])


def _to_float(value: Decimal | None) -> float:
    return float(value or Decimal("0"))


def _serialize_budget(item: Budget, actual_spent: Decimal | None = None) -> dict:
    spent_value = _to_float(actual_spent)
    limit_value = _to_float(item.monthly_limit)
    return {
        "id": item.id,
        "user_id": item.user_id,
        "category": item.category.value,
        "monthly_limit": limit_value,
        "year_month": item.year_month,
        "actual_spent": spent_value,
        "remaining": round(limit_value - spent_value, 2),
        "created_at": item.created_at.isoformat() if item.created_at else None,
    }


@router.get("")
def get_budget(
    month: str | None = Query(default=None, description="YYYY-MM"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    try:
        month_text, start, end = month_range(month)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="month 参数格式错误，应为 YYYY-MM",
        ) from exc

    budget_items = list(
        db.scalars(
            select(Budget)
            .where(Budget.user_id == current_user.id, Budget.year_month == month_text)
            .order_by(Budget.created_at.asc())
        ).all()
    )

    expense_rows = db.execute(
        select(
            Transaction.category,
            func.coalesce(func.sum(Transaction.amount), Decimal("0")),
        )
        .where(
            Transaction.user_id == current_user.id,
            Transaction.type == TransactionType.EXPENSE,
            Transaction.date >= start,
            Transaction.date < end,
        )
        .group_by(Transaction.category)
    ).all()
    spent_map = {category: amount for category, amount in expense_rows}

    merged_categories = {
        item.category for item in budget_items
    } | set(spent_map.keys())
    budget_by_category = {item.category: item for item in budget_items}

    data_items: list[dict] = []
    for category in merged_categories:
        budget_item = budget_by_category.get(category)
        if budget_item:
            data_items.append(_serialize_budget(budget_item, spent_map.get(category, Decimal("0"))))
        else:
            data_items.append(
                {
                    "id": None,
                    "user_id": current_user.id,
                    "category": category.value,
                    "monthly_limit": 0.0,
                    "year_month": month_text,
                    "actual_spent": _to_float(spent_map.get(category, Decimal("0"))),
                    "remaining": 0.0,
                    "created_at": None,
                }
            )

    data_items.sort(key=lambda x: x["category"])
    total_budget = round(sum(item["monthly_limit"] for item in data_items), 2)
    total_spent = round(sum(item["actual_spent"] for item in data_items), 2)

    return success_response(
        data={
            "month": month_text,
            "items": data_items,
            "total_budget": total_budget,
            "total_spent": total_spent,
        }
    )


@router.post("")
def set_budget(
    payload: BudgetCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    existing = db.scalar(
        select(Budget).where(
            Budget.user_id == current_user.id,
            Budget.category == payload.category,
            Budget.year_month == payload.year_month,
        )
    )
    if existing:
        existing.monthly_limit = payload.monthly_limit
        db.commit()
        db.refresh(existing)
        return success_response(data=_serialize_budget(existing), message="预算已更新")

    item = Budget(
        user_id=current_user.id,
        category=payload.category,
        monthly_limit=payload.monthly_limit,
        year_month=payload.year_month,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return success_response(data=_serialize_budget(item), message="预算已创建")


@router.put("/{budget_id}")
def update_budget(
    budget_id: int,
    payload: BudgetUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    item = db.get(Budget, budget_id)
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="预算不存在",
        )
    if item.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="只能修改自己的预算",
        )

    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(item, field, value)

    db.commit()
    db.refresh(item)
    return success_response(data=_serialize_budget(item), message="预算修改成功")
