from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ImportRule(Base):
    """账单导入的商家分类规则。

    merchant_key 是归一化后的商家名（见 services/bill_import/categorize.py）；
    category 存分类名，与 transactions.category 保持一致。
    """

    __tablename__ = "import_rules"
    __table_args__ = (
        UniqueConstraint(
            "user_id", "source", "merchant_key", name="uq_import_rules_user_source_merchant"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    source: Mapped[str] = mapped_column(String(12), nullable=False, default="any")
    merchant_key: Mapped[str] = mapped_column(String(80), nullable=False)
    category: Mapped[str] = mapped_column(String(10), nullable=False)
    hits: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
