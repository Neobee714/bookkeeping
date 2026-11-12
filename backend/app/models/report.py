from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    false,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class ReportSchedule(Base):
    """每用户最多一条财报生成设置。"""

    __tablename__ = "report_schedules"
    __table_args__ = (
        UniqueConstraint("user_id", name="uq_report_schedules_user_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    kind: Mapped[str] = mapped_column(String(16), nullable=False, default="monthly")
    # 1=周一 … 7=周日，仅周报使用；其它周期固定存 1。
    anchor_weekday: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    # 1–28，仅月报 / 季报 / 年报使用；周报固定存 1。
    anchor_day: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    anchor_hour: Mapped[int] = mapped_column(Integer, nullable=False, default=9)
    enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
    )
    # 业务时间统一存北京时间 naive datetime，避免 SQLite / PG 时区差异。
    next_run_at: Mapped[datetime | None] = mapped_column(
        DateTime(), nullable=True, index=True
    )
    last_period_end: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    user = relationship("User")


class Report(Base):
    """生成后固化的财报快照。"""

    __tablename__ = "reports"
    __table_args__ = (
        UniqueConstraint(
            "user_id", "kind", "period_start", name="uq_reports_user_kind_period"
        ),
        Index("ix_reports_user_generated_at", "user_id", "generated_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    label: Mapped[str] = mapped_column(String(32), nullable=False)
    # 闭区间：period_end 是周期最后一天。
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    generated_at: Mapped[datetime] = mapped_column(DateTime(), nullable=False)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(), nullable=True)
    # JSON 字符串，生成后不再随账单变化。
    content: Mapped[str] = mapped_column(Text, nullable=False)

    user = relationship("User")
