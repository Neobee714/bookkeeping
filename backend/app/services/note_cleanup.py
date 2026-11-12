from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.note_cleanup import NoteCleanupBatch, NoteCleanupItem
from app.models.transaction import Transaction
from app.services.report_periods import beijing_now


def latest_cleanup_batch(db: Session, user_id: int) -> NoteCleanupBatch | None:
    """当前用户最近一次尚未撤销的整理批次。"""
    return db.scalars(
        select(NoteCleanupBatch)
        .where(
            NoteCleanupBatch.user_id == user_id,
            NoteCleanupBatch.undone_at.is_(None),
        )
        .order_by(NoteCleanupBatch.id.desc())
    ).first()


def get_or_create_batch(
    db: Session, user_id: int, batch_key: str | None
) -> NoteCleanupBatch:
    """同一批保存共用一个 batch_key；老客户端不传时每次调用单独成批。"""
    key = batch_key.strip() if isinstance(batch_key, str) else None
    key = key or None
    if key:
        existing = db.scalars(
            select(NoteCleanupBatch).where(
                NoteCleanupBatch.user_id == user_id,
                NoteCleanupBatch.batch_key == key,
            )
        ).first()
        if existing is not None:
            # 极端情况下同一个 key 被复用（例如撤销后重试同一批），
            # 重新打开批次，撤销时只恢复仍匹配 new_* 的行。
            existing.undone_at = None
            return existing

    batch = NoteCleanupBatch(
        user_id=user_id,
        batch_key=key,
        affected_count=0,
        created_at=beijing_now(),
    )
    db.add(batch)
    db.flush()
    return batch


def record_item(
    db: Session,
    batch: NoteCleanupBatch,
    transaction: Transaction,
    *,
    old_merchant: str | None,
    old_item: str | None,
    old_note: str | None,
    old_note_kind: str | None,
    new_merchant: str | None,
    new_item: str | None,
    new_note: str | None,
    new_note_kind: str | None,
) -> None:
    db.add(
        NoteCleanupItem(
            batch_id=batch.id,
            transaction_id=transaction.id,
            old_merchant=old_merchant,
            old_item=old_item,
            old_note=old_note,
            old_note_kind=old_note_kind,
            new_merchant=new_merchant,
            new_item=new_item,
            new_note=new_note,
            new_note_kind=new_note_kind,
        )
    )
    batch.affected_count += 1


def undo_cleanup_batch(
    db: Session, user_id: int, batch_id: int | None = None
) -> tuple[NoteCleanupBatch, int, int] | None:
    """撤销一批整理；返回 (batch, restored, skipped)，没有可撤销批次时返回 None。"""
    if batch_id is None:
        batch = latest_cleanup_batch(db, user_id)
    else:
        batch = db.get(NoteCleanupBatch, batch_id)
        if batch is not None and batch.user_id != user_id:
            batch = None
    if batch is None:
        return None
    if batch.undone_at is not None:
        raise ValueError("这次整理已经撤销过了")

    items = list(
        db.scalars(
            select(NoteCleanupItem)
            .where(NoteCleanupItem.batch_id == batch.id)
            .order_by(NoteCleanupItem.id.asc())
        ).all()
    )

    restored = 0
    skipped = 0
    for item in items:
        transaction = db.get(Transaction, item.transaction_id)
        if transaction is None or transaction.user_id != user_id:
            skipped += 1
            continue
        current = (
            transaction.merchant,
            transaction.item,
            transaction.note,
            transaction.note_kind,
        )
        expected = (
            item.new_merchant,
            item.new_item,
            item.new_note,
            item.new_note_kind,
        )
        if current != expected:
            # 整理之后又被编辑过，不覆盖用户的新改动。
            skipped += 1
            continue
        transaction.merchant = item.old_merchant
        transaction.item = item.old_item
        transaction.note = item.old_note
        transaction.note_kind = item.old_note_kind
        restored += 1

    batch.undone_at = beijing_now()
    db.commit()
    return batch, restored, skipped
