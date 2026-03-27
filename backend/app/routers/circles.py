from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.config import CIRCLE_CREATOR_USERNAME
from app.core.database import get_db
from app.core.invite import generate_registration_code
from app.core.response import success_response
from app.core.security import get_current_user
from app.models.circle import (
    Circle,
    CircleApplication,
    CircleInviteCode,
    CircleMember,
    Post,
    PostComment,
    PostRating,
)
from app.models.user import User
from app.schemas.circle import (
    CircleApplicationCreateRequest,
    CircleCommentCreateRequest,
    CircleCreateRequest,
    CircleApplicationReviewRequest,
    CircleJoinRequest,
    CirclePostCreateRequest,
    CircleRateRequest,
)

router = APIRouter()

POST_IMAGE_LIMIT = 600000


def _is_admin(user: User) -> bool:
    return bool(CIRCLE_CREATOR_USERNAME and user.username == CIRCLE_CREATOR_USERNAME)


def _require_admin(user: User) -> None:
    if not _is_admin(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="只有管理员可以执行该操作",
        )


def _serialize_user(user: User) -> dict:
    return {
        "id": user.id,
        "username": user.username,
        "nickname": user.nickname,
        "avatar": user.avatar,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }


def _ensure_circle_member(db: Session, circle_id: int, user_id: int) -> CircleMember:
    membership = db.scalar(
        select(CircleMember).where(
            CircleMember.circle_id == circle_id,
            CircleMember.user_id == user_id,
        )
    )
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="你还不是圈子成员",
        )
    return membership


def _get_circle_or_404(db: Session, circle_id: int) -> Circle:
    circle = db.scalar(
        select(Circle)
        .where(Circle.id == circle_id)
        .options(
            selectinload(Circle.creator),
            selectinload(Circle.members).selectinload(CircleMember.user),
        )
    )
    if not circle:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="圈子不存在",
        )
    return circle


def _get_post_or_404(db: Session, post_id: int) -> Post:
    post = db.scalar(select(Post).where(Post.id == post_id).options(selectinload(Post.user)))
    if not post:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="帖子不存在",
        )
    return post


def _generate_unique_circle_code(db: Session) -> str:
    for _ in range(20):
        code = generate_registration_code()
        existing = db.scalar(select(CircleInviteCode.id).where(CircleInviteCode.code == code))
        if existing is None:
            return code
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="邀请码生成失败，请稍后重试",
    )


def _serialize_circle(circle: Circle, current_user_id: int) -> dict:
    members = sorted(circle.members, key=lambda item: item.joined_at or datetime.min)
    return {
        "id": circle.id,
        "name": circle.name,
        "description": circle.description,
        "creator": _serialize_user(circle.creator),
        "creator_id": circle.creator_id,
        "is_creator": circle.creator_id == current_user_id,
        "member_count": len(members),
        "members": [
            {
                "id": item.id,
                "joined_at": item.joined_at.isoformat() if item.joined_at else None,
                "user": _serialize_user(item.user),
            }
            for item in members
        ],
        "created_at": circle.created_at.isoformat() if circle.created_at else None,
    }


def _serialize_circle_overview(circle: Circle, member_user_ids: set[int], is_admin_view: bool) -> dict:
    members = getattr(circle, "members", []) or []
    return {
        "id": circle.id,
        "name": circle.name,
        "description": circle.description,
        "creator_id": circle.creator_id,
        "member_count": len(members),
        "my_status": "creator" if is_admin_view else ("member" if circle.id in member_user_ids else "not_member"),
        "created_at": circle.created_at.isoformat() if circle.created_at else None,
    }


def _serialize_comment(comment: PostComment) -> dict:
    return {
        "id": comment.id,
        "post_id": comment.post_id,
        "content": comment.content,
        "created_at": comment.created_at.isoformat() if comment.created_at else None,
        "user": _serialize_user(comment.user),
    }


def _serialize_rating(rating: PostRating) -> dict:
    return {
        "id": rating.id,
        "post_id": rating.post_id,
        "score": rating.score,
        "created_at": rating.created_at.isoformat() if rating.created_at else None,
        "user": _serialize_user(rating.user),
    }


def _serialize_application(application: CircleApplication) -> dict:
    return {
        "id": application.id,
        "circle_name": application.circle_name,
        "circle_description": application.circle_description,
        "message": application.message,
        "status": application.status,
        "created_circle_id": application.created_circle_id,
        "created_at": application.created_at.isoformat() if application.created_at else None,
        "reviewed_at": application.reviewed_at.isoformat() if application.reviewed_at else None,
        "user": _serialize_user(application.user),
    }


def _serialize_post(
    post: Post,
    stats_by_post_id: dict[int, dict[str, float | int | None]],
    my_scores: dict[int, float],
    comments_preview: dict[int, list[dict]],
) -> dict:
    post_stats = stats_by_post_id.get(post.id, {})
    average_score = post_stats.get("average_score")
    return {
        "id": post.id,
        "circle_id": post.circle_id,
        "content": post.content,
        "image": post.image,
        "created_at": post.created_at.isoformat() if post.created_at else None,
        "user": _serialize_user(post.user),
        "average_score": round(float(average_score), 2) if average_score is not None else 0.0,
        "rating_count": int(post_stats.get("rating_count", 0) or 0),
        "comment_count": int(post_stats.get("comment_count", 0) or 0),
        "my_score": my_scores.get(post.id),
        "comments_preview": comments_preview.get(post.id, []),
    }


def _build_post_payloads(
    db: Session,
    posts: list[Post],
    current_user_id: int,
) -> list[dict]:
    if not posts:
        return []

    post_ids = [item.id for item in posts]

    rating_rows = db.execute(
        select(
            PostRating.post_id,
            func.avg(PostRating.score),
            func.count(PostRating.id),
        )
        .where(PostRating.post_id.in_(post_ids))
        .group_by(PostRating.post_id)
    ).all()
    stats_by_post_id: dict[int, dict[str, float | int | None]] = {
        row[0]: {
            "average_score": row[1],
            "rating_count": row[2],
        }
        for row in rating_rows
    }

    my_rating_rows = db.execute(
        select(PostRating.post_id, PostRating.score).where(
            PostRating.post_id.in_(post_ids),
            PostRating.user_id == current_user_id,
        )
    ).all()
    my_scores = {row[0]: float(row[1]) for row in my_rating_rows}

    comment_count_rows = db.execute(
        select(PostComment.post_id, func.count(PostComment.id))
        .where(PostComment.post_id.in_(post_ids))
        .group_by(PostComment.post_id)
    ).all()
    for post_id, comment_count in comment_count_rows:
        stats_by_post_id.setdefault(post_id, {})["comment_count"] = comment_count

    preview_comments = db.scalars(
        select(PostComment)
        .where(PostComment.post_id.in_(post_ids))
        .options(selectinload(PostComment.user))
        .order_by(PostComment.post_id.asc(), PostComment.created_at.desc(), PostComment.id.desc())
    ).all()

    preview_by_post_id: dict[int, list[dict]] = defaultdict(list)
    for comment in preview_comments:
        items = preview_by_post_id[comment.post_id]
        if len(items) < 3:
            items.append(_serialize_comment(comment))

    return [
        _serialize_post(
            post=item,
            stats_by_post_id=stats_by_post_id,
            my_scores=my_scores,
            comments_preview=preview_by_post_id,
        )
        for item in posts
    ]


@router.post("/circles")
def create_circle(
    payload: CircleCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    _require_admin(current_user)

    name = payload.name.strip()
    if not name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="圈子名称不能为空",
        )

    circle = Circle(
        name=name,
        description=payload.description.strip() if payload.description else None,
        creator_id=current_user.id,
    )
    db.add(circle)
    db.commit()

    created_circle = _get_circle_or_404(db, circle.id)
    return success_response(
        data=_serialize_circle(created_circle, current_user.id),
        message="创建成功",
    )


@router.get("/circles")
def list_circles(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    circles = db.scalars(
        select(Circle)
        .join(CircleMember, CircleMember.circle_id == Circle.id)
        .where(CircleMember.user_id == current_user.id)
        .options(
            selectinload(Circle.creator),
            selectinload(Circle.members).selectinload(CircleMember.user),
        )
        .order_by(Circle.created_at.desc(), Circle.id.desc())
    ).all()

    return success_response(
        data=[_serialize_circle(circle, current_user.id) for circle in circles]
    )


@router.get("/circles/all")
def list_all_circles(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    stmt = (
        select(Circle)
        .options(selectinload(Circle.members))
        .order_by(Circle.created_at.desc(), Circle.id.desc())
    )
    admin_view = _is_admin(current_user)
    if admin_view:
        stmt = stmt.where(Circle.creator_id == current_user.id)

    circles = db.scalars(stmt).all()
    member_user_ids: set[int] = set()
    if not admin_view:
        member_circle_ids = db.scalars(
            select(CircleMember.circle_id).where(CircleMember.user_id == current_user.id)
        ).all()
        member_user_ids = set(member_circle_ids)

    return success_response(
        data=[
            _serialize_circle_overview(circle, member_user_ids, admin_view)
            for circle in circles
        ]
    )


@router.get("/circles/applications/pending-count")
def get_admin_pending_count(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    _require_admin(current_user)
    pending_count = db.scalar(
        select(func.count(CircleApplication.id))
        .where(CircleApplication.status == "pending")
    ) or 0
    return success_response(data={"pending_count": int(pending_count)})


@router.get("/circles/{circle_id}")
def get_circle_detail(
    circle_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    circle = _get_circle_or_404(db, circle_id)
    _ensure_circle_member(db, circle_id, current_user.id)
    return success_response(data=_serialize_circle(circle, current_user.id))


@router.post("/circles/{circle_id}/invite")
def create_circle_invite(
    circle_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    _require_admin(current_user)
    circle = _get_circle_or_404(db, circle_id)
    if circle.creator_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="只能管理自己创建的圈子",
        )

    code = _generate_unique_circle_code(db)
    invite = CircleInviteCode(circle_id=circle.id, code=code, created_by=current_user.id)
    db.add(invite)
    db.commit()
    db.refresh(invite)
    return success_response(
        data={
            "id": invite.id,
            "circle_id": invite.circle_id,
            "code": invite.code,
            "created_at": invite.created_at.isoformat() if invite.created_at else None,
        },
        message="邀请码生成成功",
    )


@router.post("/circles/join")
def join_circle(
    payload: CircleJoinRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    code = payload.code.strip().upper()
    invite = db.scalar(
        select(CircleInviteCode)
        .where(CircleInviteCode.code == code)
        .options(selectinload(CircleInviteCode.circle).selectinload(Circle.creator))
    )
    if not invite:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="圈子邀请码无效",
        )
    if invite.used_by is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="圈子邀请码已使用",
        )

    existing_member = db.scalar(
        select(CircleMember).where(
            CircleMember.circle_id == invite.circle_id,
            CircleMember.user_id == current_user.id,
        )
    )
    if existing_member:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="你已加入该圈子",
        )

    member = CircleMember(circle_id=invite.circle_id, user_id=current_user.id)
    invite.used_by = current_user.id
    db.add(member)
    db.commit()

    circle = _get_circle_or_404(db, invite.circle_id)
    return success_response(
        data=_serialize_circle(circle, current_user.id),
        message="加入成功",
    )


@router.delete("/circles/{circle_id}/leave")
def leave_circle(
    circle_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    circle = _get_circle_or_404(db, circle_id)
    membership = db.scalar(
        select(CircleMember).where(
            CircleMember.circle_id == circle_id,
            CircleMember.user_id == current_user.id,
        )
    )
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="你还不是圈子成员",
        )
    if circle.creator_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="圈主不能退出圈子",
        )

    db.delete(membership)
    db.commit()
    return success_response(
        data={"circle_id": circle_id},
        message="已退出圈子",
    )


@router.post("/circles/apply-create")
def apply_create_circle(
    payload: CircleApplicationCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    if _is_admin(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="管理员无需申请",
        )

    pending_application = db.scalar(
        select(CircleApplication).where(
            CircleApplication.user_id == current_user.id,
            CircleApplication.status == "pending",
        )
    )
    if pending_application:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="已有待审批申请，请等待",
        )

    latest_application = db.scalar(
        select(CircleApplication)
        .where(CircleApplication.user_id == current_user.id)
        .order_by(CircleApplication.created_at.desc(), CircleApplication.id.desc())
    )

    if latest_application and latest_application.status == "rejected":
        latest_application.circle_name = payload.circle_name.strip()
        latest_application.circle_description = (
            payload.circle_description.strip() if payload.circle_description else None
        )
        latest_application.message = payload.message.strip() if payload.message else None
        latest_application.status = "pending"
        latest_application.created_circle_id = None
        latest_application.reviewed_by = None
        latest_application.reviewed_at = None
        latest_application.created_at = datetime.now(timezone.utc)
        application = latest_application
    else:
        application = CircleApplication(
            user_id=current_user.id,
            circle_name=payload.circle_name.strip(),
            circle_description=payload.circle_description.strip() if payload.circle_description else None,
            message=payload.message.strip() if payload.message else None,
            status="pending",
        )
        db.add(application)

    db.commit()
    db.refresh(application)
    db.refresh(current_user)
    application.user = current_user
    return success_response(data=_serialize_application(application), message="申请已提交")


@router.get("/circles/my-application")
def get_my_application(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    if _is_admin(current_user):
        return success_response(data=None)

    application = db.scalar(
        select(CircleApplication)
        .where(CircleApplication.user_id == current_user.id)
        .options(selectinload(CircleApplication.user))
        .order_by(CircleApplication.created_at.desc(), CircleApplication.id.desc())
    )
    return success_response(data=_serialize_application(application) if application else None)


@router.delete("/circles/my-application")
def delete_my_application(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    application = db.scalar(
        select(CircleApplication)
        .where(CircleApplication.user_id == current_user.id)
        .order_by(CircleApplication.created_at.desc(), CircleApplication.id.desc())
    )
    if not application:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="申请不存在",
        )
    if application.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="当前申请无法撤回",
        )

    db.delete(application)
    db.commit()
    return success_response(data={"id": application.id}, message="申请已撤回")


@router.get("/circles/applications")
def list_circle_applications(
    status_filter: str | None = Query(default="pending", alias="status"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    _require_admin(current_user)

    normalized_status = (status_filter or "pending").strip().lower()
    stmt = (
        select(CircleApplication)
        .options(selectinload(CircleApplication.user))
        .order_by(CircleApplication.created_at.desc(), CircleApplication.id.desc())
    )
    if normalized_status in {"pending", "approved", "rejected"}:
        stmt = stmt.where(CircleApplication.status == normalized_status)

    applications = db.scalars(stmt).all()
    return success_response(data={"items": [_serialize_application(item) for item in applications]})


@router.put("/circles/applications/{application_id}/review")
def review_circle_application(
    application_id: int,
    payload: CircleApplicationReviewRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    _require_admin(current_user)

    application = db.scalar(
        select(CircleApplication)
        .where(CircleApplication.id == application_id)
        .options(selectinload(CircleApplication.user))
    )
    if not application:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="申请不存在",
        )
    if application.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="该申请已处理",
        )

    if payload.action == "approve":
        circle = Circle(
            name=application.circle_name,
            description=application.circle_description,
            creator_id=current_user.id,
        )
        db.add(circle)
        db.flush()
        db.add(CircleMember(circle_id=circle.id, user_id=application.user_id))
        application.status = "approved"
        application.created_circle_id = circle.id
        success_message = "已通过申请"
    else:
        application.status = "rejected"
        application.created_circle_id = None
        success_message = "已拒绝申请"

    application.reviewed_by = current_user.id
    application.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(application)

    return success_response(data=_serialize_application(application), message=success_message)


@router.get("/circles/{circle_id}/posts")
def list_circle_posts(
    circle_id: int,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    _get_circle_or_404(db, circle_id)
    _ensure_circle_member(db, circle_id, current_user.id)

    offset = (page - 1) * page_size
    posts = db.scalars(
        select(Post)
        .where(Post.circle_id == circle_id)
        .options(selectinload(Post.user))
        .order_by(Post.created_at.desc(), Post.id.desc())
        .offset(offset)
        .limit(page_size)
    ).all()

    total = db.scalar(select(func.count(Post.id)).where(Post.circle_id == circle_id)) or 0
    return success_response(
        data={
            "items": _build_post_payloads(db, posts, current_user.id),
            "page": page,
            "page_size": page_size,
            "total": int(total),
            "has_more": offset + len(posts) < int(total),
        }
    )


@router.post("/circles/{circle_id}/posts")
def create_post(
    circle_id: int,
    payload: CirclePostCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    _get_circle_or_404(db, circle_id)
    _ensure_circle_member(db, circle_id, current_user.id)

    content = payload.content.strip() if payload.content else None
    image = payload.image.strip() if payload.image else None
    if image and len(image) > POST_IMAGE_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="图片过大，请重新选择",
        )

    post = Post(
        circle_id=circle_id,
        user_id=current_user.id,
        content=content or None,
        image=image or None,
    )
    db.add(post)
    db.commit()

    created_post = db.scalar(
        select(Post).where(Post.id == post.id).options(selectinload(Post.user))
    )
    return success_response(
        data=_build_post_payloads(db, [created_post], current_user.id)[0],
        message="发布成功",
    )


@router.delete("/circles/{circle_id}/posts/{post_id}")
def delete_post(
    circle_id: int,
    post_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    circle = _get_circle_or_404(db, circle_id)
    _ensure_circle_member(db, circle_id, current_user.id)
    post = db.get(Post, post_id)
    if not post or post.circle_id != circle_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="帖子不存在",
        )
    if post.user_id != current_user.id and circle.creator_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="没有删除该帖子的权限",
        )

    db.delete(post)
    db.commit()
    return success_response(data={"id": post_id}, message="删除成功")


@router.post("/posts/{post_id}/rate")
def rate_post(
    post_id: int,
    payload: CircleRateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    post = _get_post_or_404(db, post_id)
    _ensure_circle_member(db, post.circle_id, current_user.id)

    rating = db.scalar(
        select(PostRating).where(
            PostRating.post_id == post_id,
            PostRating.user_id == current_user.id,
        )
    )
    if rating:
        rating.score = payload.score
    else:
        rating = PostRating(post_id=post_id, user_id=current_user.id, score=payload.score)
        db.add(rating)

    db.commit()
    db.refresh(rating)
    db.refresh(post)

    return success_response(data=_serialize_rating(rating), message="打分成功")


@router.get("/posts/{post_id}/ratings")
def list_post_ratings(
    post_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    post = _get_post_or_404(db, post_id)
    _ensure_circle_member(db, post.circle_id, current_user.id)

    ratings = db.scalars(
        select(PostRating)
        .where(PostRating.post_id == post_id)
        .options(selectinload(PostRating.user))
        .order_by(PostRating.created_at.asc(), PostRating.id.asc())
    ).all()
    return success_response(data=[_serialize_rating(item) for item in ratings])


@router.get("/posts/{post_id}/comments")
def list_post_comments(
    post_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    post = _get_post_or_404(db, post_id)
    _ensure_circle_member(db, post.circle_id, current_user.id)

    comments = db.scalars(
        select(PostComment)
        .where(PostComment.post_id == post_id)
        .options(selectinload(PostComment.user))
        .order_by(PostComment.created_at.asc(), PostComment.id.asc())
    ).all()
    return success_response(data=[_serialize_comment(item) for item in comments])


@router.post("/posts/{post_id}/comments")
def create_post_comment(
    post_id: int,
    payload: CircleCommentCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    post = _get_post_or_404(db, post_id)
    _ensure_circle_member(db, post.circle_id, current_user.id)
    content = payload.content.strip()
    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="评论内容不能为空",
        )

    comment = PostComment(
        post_id=post_id,
        user_id=current_user.id,
        content=content,
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    db.refresh(current_user)
    comment.user = current_user

    return success_response(data=_serialize_comment(comment), message="评论成功")


@router.delete("/comments/{comment_id}")
def delete_comment(
    comment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    comment = db.scalar(
        select(PostComment)
        .where(PostComment.id == comment_id)
        .options(selectinload(PostComment.post))
    )
    if not comment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="评论不存在",
        )
    if comment.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="只能删除自己的评论",
        )

    db.delete(comment)
    db.commit()
    return success_response(data={"id": comment_id}, message="删除成功")
