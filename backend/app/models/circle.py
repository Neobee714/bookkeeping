from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    DateTime,
    Float,
    ForeignKey,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.user import User


class Circle(Base):
    __tablename__ = "circles"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(30), nullable=False)
    description: Mapped[str | None] = mapped_column(String(100), nullable=True)
    creator_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    creator: Mapped["User"] = relationship("User", foreign_keys=[creator_id])
    members: Mapped[list["CircleMember"]] = relationship(
        "CircleMember",
        back_populates="circle",
        cascade="all, delete-orphan",
    )
    invite_codes: Mapped[list["CircleInviteCode"]] = relationship(
        "CircleInviteCode",
        back_populates="circle",
        cascade="all, delete-orphan",
    )
    posts: Mapped[list["Post"]] = relationship(
        "Post",
        back_populates="circle",
        cascade="all, delete-orphan",
    )
    applications: Mapped[list["CircleApplication"]] = relationship(
        "CircleApplication",
        back_populates="circle",
        cascade="all, delete-orphan",
    )


class CircleMember(Base):
    __tablename__ = "circle_members"
    __table_args__ = (UniqueConstraint("circle_id", "user_id", name="uq_circle_members"),)

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    circle_id: Mapped[int] = mapped_column(
        ForeignKey("circles.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    circle: Mapped["Circle"] = relationship("Circle", back_populates="members")
    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])


class CircleInviteCode(Base):
    __tablename__ = "circle_invite_codes"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    circle_id: Mapped[int] = mapped_column(
        ForeignKey("circles.id", ondelete="CASCADE"),
        nullable=False,
    )
    code: Mapped[str] = mapped_column(String(8), unique=True, nullable=False)
    created_by: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    used_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    circle: Mapped["Circle"] = relationship("Circle", back_populates="invite_codes")
    creator: Mapped["User"] = relationship("User", foreign_keys=[created_by])
    used_by_user: Mapped["User | None"] = relationship("User", foreign_keys=[used_by])


class CircleApplication(Base):
    __tablename__ = "circle_applications"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    circle_id: Mapped[int] = mapped_column(
        ForeignKey("circles.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    circle: Mapped["Circle"] = relationship("Circle", back_populates="applications")
    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])


class Post(Base):
    __tablename__ = "posts"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    circle_id: Mapped[int] = mapped_column(
        ForeignKey("circles.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    content: Mapped[str | None] = mapped_column(Text, nullable=True)
    image: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    circle: Mapped["Circle"] = relationship("Circle", back_populates="posts")
    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])
    ratings: Mapped[list["PostRating"]] = relationship(
        "PostRating",
        back_populates="post",
        cascade="all, delete-orphan",
    )
    comments: Mapped[list["PostComment"]] = relationship(
        "PostComment",
        back_populates="post",
        cascade="all, delete-orphan",
    )


class PostRating(Base):
    __tablename__ = "post_ratings"
    __table_args__ = (UniqueConstraint("post_id", "user_id", name="uq_post_ratings"),)

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    post_id: Mapped[int] = mapped_column(
        ForeignKey("posts.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    score: Mapped[float] = mapped_column(Float, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    post: Mapped["Post"] = relationship("Post", back_populates="ratings")
    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])


class PostComment(Base):
    __tablename__ = "post_comments"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    post_id: Mapped[int] = mapped_column(
        ForeignKey("posts.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    post: Mapped["Post"] = relationship("Post", back_populates="comments")
    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])
