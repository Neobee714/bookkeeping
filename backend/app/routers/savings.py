from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.response import success_response
from app.core.security import get_current_user
from app.models.savings_goal import SavingsGoal
from app.models.user import User
from app.schemas.savings import SavingsCreateRequest, SavingsUpdateRequest

router = APIRouter(prefix="/savings", tags=["savings"])


def _to_float(value: Decimal | None) -> float:
    return float(value or Decimal("0"))


def _serialize_saving(item: SavingsGoal) -> dict:
    return {
        "id": item.id,
        "user_id": item.user_id,
        "name": item.name,
        "target_amount": _to_float(item.target_amount),
        "current_amount": _to_float(item.current_amount),
        "deadline": item.deadline.isoformat() if item.deadline else None,
        "created_at": item.created_at.isoformat() if item.created_at else None,
    }


@router.get("")
def list_savings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    items = list(
        db.scalars(
            select(SavingsGoal)
            .where(SavingsGoal.user_id == current_user.id)
            .order_by(SavingsGoal.created_at.desc())
        ).all()
    )
    return success_response(data=[_serialize_saving(item) for item in items])


@router.post("")
def create_saving(
    payload: SavingsCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    item = SavingsGoal(
        user_id=current_user.id,
        name=payload.name,
        target_amount=payload.target_amount,
        current_amount=payload.current_amount,
        deadline=payload.deadline,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return success_response(data=_serialize_saving(item), message="储蓄目标创建成功")


@router.put("/{saving_id}")
def update_saving(
    saving_id: int,
    payload: SavingsUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    item = db.get(SavingsGoal, saving_id)
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="储蓄目标不存在",
        )
    if item.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="只能修改自己的储蓄目标",
        )

    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(item, field, value)

    db.commit()
    db.refresh(item)
    return success_response(data=_serialize_saving(item), message="储蓄目标修改成功")


@router.delete("/{saving_id}")
def delete_saving(
    saving_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    item = db.get(SavingsGoal, saving_id)
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="储蓄目标不存在",
        )
    if item.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="只能删除自己的储蓄目标",
        )

    db.delete(item)
    db.commit()
    return success_response(data={"id": saving_id}, message="储蓄目标删除成功")
