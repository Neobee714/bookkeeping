from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class BillMailbox(Base):
    """每个用户一个账单收件邮箱（QQ / 163）。

    授权码用 SECRET_KEY 派生的 Fernet 密钥加密存储；接口永远不回传明文。
    """

    __tablename__ = "bill_mailboxes"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True, index=True
    )
    provider: Mapped[str] = mapped_column(String(10), nullable=False, default="qq")
    host: Mapped[str] = mapped_column(String(80), nullable=False)
    port: Mapped[int] = mapped_column(Integer, nullable=False, default=993)
    username: Mapped[str] = mapped_column(String(120), nullable=False)
    password_enc: Mapped[str] = mapped_column(String(512), nullable=False)
    folder: Mapped[str] = mapped_column(String(40), nullable=False, default="INBOX")
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # 增量同步游标：只处理 UID 更大的邮件，不依赖「未读」标记
    last_uid: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    uidvalidity: Mapped[int | None] = mapped_column(Integer, nullable=True)

    last_sync_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_status: Mapped[str | None] = mapped_column(String(12), nullable=True)
    last_error: Mapped[str | None] = mapped_column(String(255), nullable=True)
    last_summary: Mapped[str | None] = mapped_column(String(120), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
