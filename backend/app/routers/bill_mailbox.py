from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import SECRET_KEY_IS_EPHEMERAL
from app.core.database import get_db
from app.core.response import success_response
from app.core.security import get_current_user
from app.models.bill_mailbox import BillMailbox
from app.models.user import User
from app.schemas.bill_mailbox import MailboxIn
from app.services.bill_mail.client import PROVIDERS, BillMailClient, MailError
from app.services.bill_mail.crypto import CipherError, decrypt, encrypt
from app.services.bill_mail.sync import sync_mailbox

router = APIRouter(prefix="/transactions/import/mailbox", tags=["import"])


def _get_box(db: Session, user_id: int) -> BillMailbox | None:
    return db.execute(
        select(BillMailbox).where(BillMailbox.user_id == user_id)
    ).scalar_one_or_none()


def _serialize(box: BillMailbox | None) -> dict:
    if box is None:
        return {
            "configured": False,
            "secret_stable": not SECRET_KEY_IS_EPHEMERAL,
        }
    return {
        "configured": True,
        "provider": box.provider,
        "host": box.host,
        "port": box.port,
        "username": box.username,
        "folder": box.folder,
        "enabled": box.enabled,
        "has_password": bool(box.password_enc),
        "last_sync_at": box.last_sync_at.isoformat() if box.last_sync_at else None,
        "last_status": box.last_status,
        "last_error": box.last_error,
        "last_summary": box.last_summary,
        "secret_stable": not SECRET_KEY_IS_EPHEMERAL,
    }


@router.get("")
def get_mailbox(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    return success_response(_serialize(_get_box(db, current_user.id)))


@router.put("")
def save_mailbox(
    payload: MailboxIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    preset = PROVIDERS[payload.provider]
    box = _get_box(db, current_user.id)
    if not payload.password and (box is None or not box.password_enc):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="请填写邮箱授权码"
        )

    if box is None:
        box = BillMailbox(user_id=current_user.id)
        db.add(box)
    box.provider = payload.provider
    box.host = str(preset["host"])
    box.port = int(preset["port"])
    box.username = payload.username.strip()
    box.folder = payload.folder.strip() or "INBOX"
    box.enabled = payload.enabled
    if payload.password:
        box.password_enc = encrypt(payload.password)
    db.commit()
    db.refresh(box)
    return success_response(_serialize(box), message="已保存")


@router.delete("")
def delete_mailbox(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    box = _get_box(db, current_user.id)
    if box is not None:
        db.delete(box)
        db.commit()
    return success_response({"configured": False}, message="已删除")


def _resolve_password(
    db: Session, user_id: int, payload: MailboxIn
) -> tuple[str, str, int]:
    if payload.password:
        password = payload.password
    else:
        box = _get_box(db, user_id)
        if box is None or not box.password_enc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="请填写邮箱授权码"
            )
        try:
            password = decrypt(box.password_enc)
        except CipherError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="已保存的授权码无法解密，请重新填写",
            ) from exc
    preset = PROVIDERS[payload.provider]
    return password, str(preset["host"]), int(preset["port"])


@router.post("/test")
def test_mailbox(
    payload: MailboxIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    password, host, port = _resolve_password(db, current_user.id, payload)
    try:
        client = BillMailClient(host, port, payload.username.strip(), password, payload.folder)
        with client:
            pass
    except MailError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return success_response({"ok": True}, message="连接成功")


@router.post("/sync")
def sync_now(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    box = _get_box(db, current_user.id)
    if box is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="还没有配置账单邮箱")
    result = sync_mailbox(db, box)
    return success_response(result, message=result.get("summary") or "")
