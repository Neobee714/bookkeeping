from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.response import success_response
from app.core.security import get_current_user
from app.models.category import Category
from app.models.import_rule import ImportRule
from app.models.user import User
from app.schemas.imports import ImportCommitIn, ImportRuleUpdate
from app.services.bill_import.bill_types import BillParseError
from app.services.bill_import.service import MAX_UPLOAD_BYTES, commit, preview

router = APIRouter(prefix="/transactions/import", tags=["import"])


@router.post("/preview")
async def import_preview(
    file: UploadFile = File(...),
    password: str | None = Form(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    data = await file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="文件过大（上限 10MB）",
        )
    try:
        result = preview(db, current_user, data, password=password or None)
    except BillParseError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return success_response(result)


@router.post("/commit")
def import_commit(
    payload: ImportCommitIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    result = commit(db, current_user, payload.model_dump())
    return success_response(result, message=f"导入 {result['imported']} 笔")


@router.get("/rules")
def list_rules(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    rules = db.execute(
        select(ImportRule)
        .where(ImportRule.user_id == current_user.id)
        .order_by(ImportRule.hits.desc(), ImportRule.id.desc())
    ).scalars()
    return success_response(
        data=[
            {
                "id": rule.id,
                "source": rule.source,
                "merchant": rule.merchant_key,
                "category": rule.category,
                "hits": rule.hits,
            }
            for rule in rules
        ]
    )


@router.patch("/rules/{rule_id}")
def update_rule(
    rule_id: int,
    payload: ImportRuleUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    rule = db.get(ImportRule, rule_id)
    if rule is None or rule.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="规则不存在")
    exists = db.scalar(
        select(Category.id).where(
            Category.user_id == current_user.id, Category.name == payload.category
        )
    )
    if exists is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="分类不存在")
    rule.category = payload.category
    db.commit()
    return success_response(
        data={
            "id": rule.id,
            "source": rule.source,
            "merchant": rule.merchant_key,
            "category": rule.category,
            "hits": rule.hits,
        },
        message="已更新",
    )


@router.delete("/rules/{rule_id}")
def delete_rule(
    rule_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    rule = db.get(ImportRule, rule_id)
    if rule is None or rule.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="规则不存在")
    db.delete(rule)
    db.commit()
    return success_response(data={"id": rule_id}, message="已删除")
