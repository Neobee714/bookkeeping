from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.admin import is_admin_username
from app.core.config import FOUNDER_INVITE_CODE
from app.core.database import get_db
from app.core.invite import generate_invite_code, generate_registration_code, parse_invite_code
from app.core.response import success_response
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    get_current_user,
    get_password_hash,
    verify_password,
)
from app.models.user import User
from app.schemas.auth import (
    BindPartnerRequest,
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    UpdateAvatarRequest,
    UpdateProfileRequest,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _normalize_code(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip().upper()
    return normalized or None


def _resolve_partner_code(*values: str | None) -> str | None:
    for value in values:
        normalized = _normalize_code(value)
        if normalized:
            return normalized
    return None


def _generate_unique_reg_invite_code(db: Session) -> str:
    for _ in range(20):
        code = generate_registration_code()
        existing = db.scalar(select(User.id).where(User.reg_invite_code == code))
        if existing is None:
            return code
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="邀请码生成失败，请稍后重试",
    )


def _resolve_registration_inviter(payload: RegisterRequest, db: Session) -> User | None:
    registration_code = _normalize_code(payload.reg_invite_code)
    if not registration_code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="邀请码无效",
        )

    if registration_code == FOUNDER_INVITE_CODE:
        user_count = db.scalar(select(func.count()).select_from(User)) or 0
        if user_count == 0:
            return None
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="邀请码无效",
        )

    inviter = db.scalar(select(User).where(User.reg_invite_code == registration_code))
    if not inviter:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="邀请码无效",
        )
    return inviter


def _serialize_user(user: User, partner: User | None) -> dict:
    partner_data = None
    if partner:
        partner_data = {
            "id": partner.id,
            "username": partner.username,
            "nickname": partner.nickname,
            "avatar": partner.avatar,
        }

    return {
        "id": user.id,
        "username": user.username,
        "nickname": user.nickname,
        "avatar": user.avatar,
        "is_admin": is_admin_username(user.username),
        "partner_id": user.partner_id,
        "partner": partner_data,
        "partner_code": generate_invite_code(user.id),
        "invite_code": generate_invite_code(user.id),
        "reg_invite_code": user.reg_invite_code,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }


@router.post("/register")
def register(payload: RegisterRequest, db: Session = Depends(get_db)) -> dict:
    existing_user = db.scalar(select(User).where(User.username == payload.username))
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="用户名已存在",
        )

    inviter = _resolve_registration_inviter(payload, db)
    user = User(
        username=payload.username,
        nickname=payload.nickname,
        reg_invite_code=_generate_unique_reg_invite_code(db),
        invited_by=inviter.id if inviter else None,
        password_hash=get_password_hash(payload.password),
    )
    db.add(user)
    db.flush()

    partner_code = _resolve_partner_code(payload.partner_code, payload.invite_code)
    if partner_code:
        try:
            partner_id = parse_invite_code(partner_code)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="邀请码无效",
            ) from exc

        partner = db.get(User, partner_id)
        if not partner:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="邀请码无效",
            )
        if partner.id == user.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="不能绑定自己",
            )
        if partner.partner_id is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="对方已绑定伴侣",
            )

        user.partner_id = partner.id
        partner.partner_id = user.id

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="注册失败，请检查输入信息",
        ) from exc

    db.refresh(user)
    partner = db.get(User, user.partner_id) if user.partner_id else None
    return success_response(
        data={
            "user": _serialize_user(user, partner),
        },
        message="注册成功",
    )


@router.post("/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> dict:
    user = db.scalar(select(User).where(User.username == payload.username))
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误",
        )

    partner = db.get(User, user.partner_id) if user.partner_id else None
    return success_response(
        data={
            "access_token": create_access_token(user.id),
            "refresh_token": create_refresh_token(user.id),
            "token_type": "bearer",
            "user": _serialize_user(user, partner),
        },
        message="登录成功",
    )


@router.post("/refresh")
def refresh_token(payload: RefreshRequest, db: Session = Depends(get_db)) -> dict:
    token_payload = decode_token(payload.refresh_token)
    if token_payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="刷新令牌无效",
        )

    try:
        user_id = int(token_payload.get("sub", "0"))
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="刷新令牌无效",
        ) from exc

    user = db.get(User, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户不存在",
        )

    return success_response(
        data={
            "access_token": create_access_token(user.id),
            "token_type": "bearer",
        },
        message="刷新成功",
    )


@router.get("/me")
def me(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    partner = db.get(User, current_user.partner_id) if current_user.partner_id else None
    return success_response(data=_serialize_user(current_user, partner))


@router.put("/profile")
def update_profile(
    payload: UpdateProfileRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    if payload.nickname is not None:
        nickname = payload.nickname.strip()
        if not nickname:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="昵称不能为空",
            )
        if len(nickname) > 16:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="昵称长度需在 1 到 16 个字符之间",
            )
        current_user.nickname = nickname

    db.commit()
    db.refresh(current_user)
    partner = db.get(User, current_user.partner_id) if current_user.partner_id else None
    return success_response(
        data=_serialize_user(current_user, partner),
        message="资料更新成功",
    )


@router.post("/avatar")
def update_avatar(
    payload: UpdateAvatarRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    avatar = payload.avatar.strip()
    if not avatar:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="头像不能为空",
        )
    if len(avatar) > 200000:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="头像文件过大，请重新选择",
        )
    if not avatar.startswith("data:image/") or ";base64," not in avatar:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="头像格式不支持",
        )

    current_user.avatar = avatar
    db.commit()
    db.refresh(current_user)
    partner = db.get(User, current_user.partner_id) if current_user.partner_id else None
    return success_response(
        data=_serialize_user(current_user, partner),
        message="头像更新成功",
    )


@router.post("/bind-partner")
@router.post("/bind-invite")
def bind_partner(
    payload: BindPartnerRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    if current_user.partner_id is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="你已绑定伴侣",
        )

    partner_code = _resolve_partner_code(payload.partner_code, payload.invite_code)
    if not partner_code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="绑定码无效",
        )

    try:
        partner_id = parse_invite_code(partner_code)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="绑定码无效",
        ) from exc

    partner = db.get(User, partner_id)
    if not partner:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="绑定码无效",
        )
    if partner.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="不能绑定自己",
        )
    if partner.partner_id is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="对方已绑定伴侣",
        )

    current_user.partner_id = partner.id
    partner.partner_id = current_user.id
    db.commit()
    db.refresh(current_user)

    return success_response(
        data=_serialize_user(current_user, partner),
        message="绑定成功",
    )
