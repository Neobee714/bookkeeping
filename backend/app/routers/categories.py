from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.response import success_response
from app.core.security import get_current_user
from app.models.category import Category
from app.models.transaction import Transaction
from app.models.user import User
from app.schemas.category import CategoryCreate, CategoryUpdate

router = APIRouter(prefix="/categories", tags=["categories"])


def _serialize_category(category: Category) -> dict:
    return {
        "id": category.id,
        "user_id": category.user_id,
        "name": category.name,
        "icon": category.icon,
        "color": category.color,
        "type": category.type,
        "is_default": category.is_default,
        "created_at": category.created_at.isoformat() if category.created_at else None,
    }


@router.get("")
def list_categories(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    categories = db.scalars(
        select(Category)
        .where(Category.user_id == current_user.id)
        .order_by(Category.type, Category.id)
    ).all()
    return success_response(data=[_serialize_category(c) for c in categories])


@router.post("")
def create_category(
    payload: CategoryCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    category = Category(
        user_id=current_user.id,
        name=payload.name,
        icon=payload.icon,
        color=payload.color,
        type=payload.type.value,
        is_default=False,
    )
    db.add(category)
    db.commit()
    db.refresh(category)
    return success_response(data=_serialize_category(category), message="分类创建成功")


@router.put("/{category_id}")
def update_category(
    category_id: int,
    payload: CategoryUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    category = db.get(Category, category_id)
    if not category:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="分类不存在")
    if category.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权修改此分类")
    if category.is_default:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="默认分类不可修改")

    if payload.name is not None:
        category.name = payload.name
    if payload.icon is not None:
        category.icon = payload.icon
    if payload.color is not None:
        category.color = payload.color

    db.commit()
    db.refresh(category)
    return success_response(data=_serialize_category(category), message="分类更新成功")


@router.delete("/{category_id}")
def delete_category(
    category_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    category = db.get(Category, category_id)
    if not category:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="分类不存在")
    if category.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权删除此分类")
    if category.is_default:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="默认分类不可删除")

    has_transactions = db.scalar(
        select(Transaction.id).where(
            Transaction.user_id == current_user.id,
            Transaction.category == category.name,
        ).limit(1)
    )
    if has_transactions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="该分类下存在账单，无法删除",
        )

    db.delete(category)
    db.commit()
    return success_response(message="分类删除成功")
