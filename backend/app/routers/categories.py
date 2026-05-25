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


DEFAULT_CATEGORIES = [
    {"name": "餐饮", "icon": "🍜", "color": "#FF6B6B", "type": "expense"},
    {"name": "交通", "icon": "🚌", "color": "#4F6EF7", "type": "expense"},
    {"name": "日用", "icon": "🛒", "color": "#5856D6", "type": "expense"},
    {"name": "购物", "icon": "🛍️", "color": "#AF52DE", "type": "expense"},
    {"name": "娱乐", "icon": "🎮", "color": "#9B59B6", "type": "expense"},
    {"name": "医疗", "icon": "💊", "color": "#36CFC9", "type": "expense"},
    {"name": "教育", "icon": "📚", "color": "#5AC8FA", "type": "expense"},
    {"name": "零食", "icon": "🍰", "color": "#FF8E53", "type": "expense"},
    {"name": "居住", "icon": "🏠", "color": "#607D8B", "type": "expense"},
    {"name": "其他", "icon": "📌", "color": "#8E8E93", "type": "expense"},
    {"name": "收入", "icon": "💰", "color": "#34C759", "type": "income"},
    {"name": "工资", "icon": "💼", "color": "#52C41A", "type": "income"},
    {"name": "生活费", "icon": "💵", "color": "#FFC93C", "type": "income"},
    {"name": "理财", "icon": "📈", "color": "#4F6EF7", "type": "income"},
    {"name": "红包", "icon": "🎁", "color": "#FF6B6B", "type": "income"},
    {"name": "其他", "icon": "📌", "color": "#8E8E93", "type": "income"},
]


def _ensure_default_categories(db: Session, user_id: int) -> None:
    existing = db.scalar(
        select(Category.id).where(Category.user_id == user_id).limit(1)
    )
    if existing is not None:
        return
    for cat in DEFAULT_CATEGORIES:
        db.add(Category(
            user_id=user_id,
            name=cat["name"],
            icon=cat["icon"],
            color=cat["color"],
            type=cat["type"],
            is_default=True,
        ))
    db.commit()


@router.get("")
def list_categories(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    _ensure_default_categories(db, current_user.id)
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
