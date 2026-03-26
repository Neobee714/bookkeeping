from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.date_utils import month_range
from app.core.response import success_response
from app.core.security import get_current_user
from app.models.transaction import Transaction
from app.models.user import User
from app.schemas.transaction import TransactionCreateRequest, TransactionUpdateRequest

router = APIRouter(prefix="/transactions", tags=["transactions"])


def _to_float(value: Decimal | None) -> float:
    return float(value or Decimal("0"))


def _serialize_transaction(item: Transaction) -> dict:
    return {
        "id": item.id,
        "user_id": item.user_id,
        "amount": _to_float(item.amount),
        "type": item.type.value,
        "category": item.category.value,
        "note": item.note,
        "date": item.date.isoformat(),
        "created_at": item.created_at.isoformat() if item.created_at else None,
    }


def _query_transactions_for_user(
    db: Session,
    user_id: int,
    month: str | None = None,
) -> list[Transaction]:
    stmt = select(Transaction).where(Transaction.user_id == user_id)
    if month:
        try:
            _, start, end = month_range(month)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="month 参数格式错误，应为 YYYY-MM",
            ) from exc
        stmt = stmt.where(Transaction.date >= start, Transaction.date < end)
    stmt = stmt.order_by(Transaction.date.desc(), Transaction.created_at.desc())
    return list(db.scalars(stmt).all())


@router.get("")
def list_transactions(
    month: str | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    items = _query_transactions_for_user(db=db, user_id=current_user.id, month=month)
    return success_response(data=[_serialize_transaction(item) for item in items])


@router.get("/partner")
def list_partner_transactions(
    month: str | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    if not current_user.partner_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="尚未绑定伴侣",
        )
    items = _query_transactions_for_user(db=db, user_id=current_user.partner_id, month=month)
    return success_response(data=[_serialize_transaction(item) for item in items])


@router.post("")
def create_transaction(
    payload: TransactionCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    item = Transaction(
        user_id=current_user.id,
        amount=payload.amount,
        type=payload.type,
        category=payload.category,
        note=payload.note,
        date=payload.date,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return success_response(data=_serialize_transaction(item), message="创建成功")


@router.put("/{transaction_id}")
def update_transaction(
    transaction_id: int,
    payload: TransactionUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    item = db.get(Transaction, transaction_id)
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="账单不存在",
        )
    if item.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="只能修改自己的账单",
        )

    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(item, field, value)

    db.commit()
    db.refresh(item)
    return success_response(data=_serialize_transaction(item), message="修改成功")


@router.delete("/{transaction_id}")
def delete_transaction(
    transaction_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    item = db.get(Transaction, transaction_id)
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="账单不存在",
        )
    if item.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="只能删除自己的账单",
        )

    db.delete(item)
    db.commit()
    return success_response(data={"id": transaction_id}, message="删除成功")
