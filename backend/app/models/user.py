from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.budget import Budget
    from app.models.savings_goal import SavingsGoal
    from app.models.transaction import Transaction


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    nickname: Mapped[str] = mapped_column(String(50), nullable=False)
    avatar: Mapped[str | None] = mapped_column(Text, nullable=True)
    reg_invite_code: Mapped[str] = mapped_column(String(8), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    partner_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    invited_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    partner: Mapped["User | None"] = relationship(
        "User",
        remote_side=[id],
        foreign_keys=[partner_id],
        uselist=False,
        post_update=True,
    )
    transactions: Mapped[list["Transaction"]] = relationship(back_populates="user")
    budgets: Mapped[list["Budget"]] = relationship(back_populates="user")
    savings_goals: Mapped[list["SavingsGoal"]] = relationship(back_populates="user")
