from __future__ import annotations

from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.response import success_response
from app.core.security import get_current_user
from app.models.recurring import RecurringRule
from app.models.transaction import Transaction
from app.models.user import User
from app.schemas.recurring import RecurringCreateRequest, RecurringUpdateRequest
from app.services.recurring_dates import first_occurrence_on_or_after

router = APIRouter(prefix="/recurring", tags=["recurring"])

MAX_RULES_PER_USER = 50


def _to_float(value: Decimal | None) -> float:
    return float(value or Decimal("0"))


def _serialize_rule(rule: RecurringRule) -> dict:
    return {
        "id": rule.id,
        "amount": _to_float(rule.amount),
        "type": rule.type.value,
        "category": rule.category,
        "note": rule.note,
        "freq": rule.freq,
        "start_date": rule.start_date.isoformat(),
        "next_run_date": rule.next_run_date.isoformat(),
        "enabled": rule.enabled,
        "last_generated_date": (
            rule.last_generated_date.isoformat() if rule.last_generated_date else None
        ),
        "created_at": rule.created_at.isoformat() if rule.created_at else None,
    }


def _get_owned_rule(db: Session, rule_id: int, user_id: int) -> RecurringRule:
    rule = db.scalar(
        select(RecurringRule).where(
            RecurringRule.id == rule_id,
            RecurringRule.user_id == user_id,
        )
    )
    if rule is None:
        # 别人的规则同样返回 404，不泄露存在性。
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="循环规则不存在",
        )
    return rule


@router.get("")
def list_recurring(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    items = list(
        db.scalars(
            select(RecurringRule)
            .where(RecurringRule.user_id == current_user.id)
            .order_by(
                RecurringRule.enabled.desc(),
                RecurringRule.next_run_date.asc(),
                RecurringRule.id.asc(),
            )
        ).all()
    )
    return success_response(data=[_serialize_rule(item) for item in items])


@router.post("")
def create_recurring(
    payload: RecurringCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    existing_count = int(
        db.scalar(
            select(func.count(RecurringRule.id)).where(
                RecurringRule.user_id == current_user.id
            )
        )
        or 0
    )
    if existing_count >= MAX_RULES_PER_USER:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"循环规则最多 {MAX_RULES_PER_USER} 条",
        )

    rule = RecurringRule(
        user_id=current_user.id,
        amount=payload.amount,
        type=payload.type,
        category=payload.category,
        note=payload.note,
        freq=payload.freq,
        start_date=payload.start_date,
        next_run_date=first_occurrence_on_or_after(
            payload.freq, payload.start_date, date.today()
        ),
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return success_response(data=_serialize_rule(rule), message="循环规则创建成功")


@router.patch("/{rule_id}")
@router.put("/{rule_id}")
def update_recurring(
    rule_id: int,
    payload: RecurringUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    rule = _get_owned_rule(db, rule_id, current_user.id)

    old_freq = rule.freq
    old_start_date = rule.start_date
    old_enabled = rule.enabled

    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(rule, field, value)

    should_recalculate = (
        rule.freq != old_freq
        or rule.start_date != old_start_date
        or (rule.enabled and not old_enabled)
    )
    if should_recalculate:
        # 暂停恢复或锚点变化时从今天重新起算，不补暂停期间的账。
        rule.next_run_date = first_occurrence_on_or_after(
            rule.freq, rule.start_date, date.today()
        )

    db.commit()
    db.refresh(rule)
    return success_response(data=_serialize_rule(rule), message="循环规则修改成功")


@router.delete("/{rule_id}")
def delete_recurring(
    rule_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    rule = _get_owned_rule(db, rule_id, current_user.id)

    # 兼容未开启外键约束的 SQLite：显式置空，Postgres 侧还有 ON DELETE SET NULL 兜底。
    db.execute(
        update(Transaction)
        .where(Transaction.recurring_rule_id == rule.id)
        .values(recurring_rule_id=None)
    )
    db.delete(rule)
    db.commit()
    return success_response(data=None, message="循环规则已删除")
