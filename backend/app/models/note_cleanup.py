from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class NoteCleanupBatch(Base):
    """一次「整理旧备注」保存批次，支持整批撤销。"""

    __tablename__ = "note_cleanup_batches"
    __table_args__ = (
        UniqueConstraint(
            "user_id", "batch_key", name="uq_note_cleanup_batches_user_key"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # App 在一次保存里生成同一个 key，多条 reclassify 调用归入同一批次。
    # 老客户端不传时留空，每次调用单独成批。
    batch_key: Mapped[str | None] = mapped_column(String(64), nullable=True)
    affected_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(), nullable=False)
    undone_at: Mapped[datetime | None] = mapped_column(DateTime(), nullable=True)

    items = relationship(
        "NoteCleanupItem", back_populates="batch", cascade="all, delete-orphan"
    )


class NoteCleanupItem(Base):
    """批次内每个被改写账单的原值与新值。"""

    __tablename__ = "note_cleanup_items"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    batch_id: Mapped[int] = mapped_column(
        ForeignKey("note_cleanup_batches.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    transaction_id: Mapped[int] = mapped_column(
        ForeignKey("transactions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    old_merchant: Mapped[str | None] = mapped_column(String(50), nullable=True)
    old_item: Mapped[str | None] = mapped_column(String(50), nullable=True)
    old_note: Mapped[str | None] = mapped_column(String(255), nullable=True)
    old_note_kind: Mapped[str | None] = mapped_column(String(12), nullable=True)
    new_merchant: Mapped[str | None] = mapped_column(String(50), nullable=True)
    new_item: Mapped[str | None] = mapped_column(String(50), nullable=True)
    new_note: Mapped[str | None] = mapped_column(String(255), nullable=True)
    new_note_kind: Mapped[str | None] = mapped_column(String(12), nullable=True)

    batch = relationship("NoteCleanupBatch", back_populates="items")
