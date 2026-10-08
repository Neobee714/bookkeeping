from __future__ import annotations

import csv
import io
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.date_utils import resolve_date_window
from app.core.response import success_response
from app.core.security import get_current_user
from app.models.enums import CategoryEnum, TransactionType
from app.models.note_preset import UserNotePreset
from app.models.transaction import Transaction
from app.models.user import User
from app.schemas.transaction import (
    NotePresetDeleteResponse,
    NotePresetRequest,
    NotePresetResponse,
    QuickInputsResponse,
    TransactionCreateRequest,
    TransactionUpdateRequest,
)

router = APIRouter(prefix='/transactions', tags=['transactions'])

NOTE_PRESET_PINNED = 'pinned'
NOTE_PRESET_HIDDEN = 'hidden'


SHARK_CATEGORY_MAP: dict[str, CategoryEnum] = {
    '餐饮': CategoryEnum.FOOD,
    '零食': CategoryEnum.FOOD,
    '交通': CategoryEnum.TRANSPORT,
    '水': CategoryEnum.DAILY,
    '洗衣澡': CategoryEnum.DAILY,
    '理发': CategoryEnum.DAILY,
    '娱乐': CategoryEnum.ENTERTAINMENT,
    '游戏': CategoryEnum.ENTERTAINMENT,
    '医疗': CategoryEnum.MEDICAL,
    '学习': CategoryEnum.EDUCATION,
    '购物': CategoryEnum.SHOPPING,
    '礼物': CategoryEnum.SHOPPING,
    '旅游': CategoryEnum.OTHER,
    '工资': CategoryEnum.INCOME,
    '其他': CategoryEnum.OTHER,
    '其它': CategoryEnum.OTHER,
}

SHARK_TYPE_MAP: dict[str, TransactionType] = {
    '支出': TransactionType.EXPENSE,
    '收入': TransactionType.INCOME,
}


def _to_float(value: Decimal | None) -> float:
    return float(value or Decimal('0'))


def _serialize_transaction(item: Transaction) -> dict:
    return {
        'id': item.id,
        'user_id': item.user_id,
        'amount': _to_float(item.amount),
        'type': item.type.value,
        'category': item.category,
        'note': item.note,
        'date': item.date.isoformat(),
        'created_at': item.created_at.isoformat() if item.created_at else None,
    }


def _query_transactions_for_user(
    db: Session,
    user_id: int,
    month: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
) -> list[Transaction]:
    stmt = select(Transaction).where(Transaction.user_id == user_id)
    if month or start_date or end_date:
        try:
            _, start, end = resolve_date_window(
                month=month,
                start_date=start_date,
                end_date=end_date,
            )
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail='日期范围参数错误，month 应为 YYYY-MM，start_date/end_date 应为 YYYY-MM-DD',
            ) from exc
        stmt = stmt.where(Transaction.date >= start, Transaction.date < end)
    stmt = stmt.order_by(Transaction.date.desc(), Transaction.created_at.desc())
    return list(db.scalars(stmt).all())


@router.get('')
def list_transactions(
    month: str | None = Query(default=None, description='YYYY-MM'),
    start_date: str | None = Query(default=None, description='YYYY-MM-DD'),
    end_date: str | None = Query(default=None, description='YYYY-MM-DD'),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    items = _query_transactions_for_user(
        db=db,
        user_id=current_user.id,
        month=month,
        start_date=start_date,
        end_date=end_date,
    )
    return success_response(data=[_serialize_transaction(item) for item in items])


@router.get('/partner')
def list_partner_transactions(
    month: str | None = Query(default=None, description='YYYY-MM'),
    start_date: str | None = Query(default=None, description='YYYY-MM-DD'),
    end_date: str | None = Query(default=None, description='YYYY-MM-DD'),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    if not current_user.partner_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail='尚未绑定伴侣',
        )

    items = _query_transactions_for_user(
        db=db,
        user_id=current_user.partner_id,
        month=month,
        start_date=start_date,
        end_date=end_date,
    )
    return success_response(data=[_serialize_transaction(item) for item in items])


@router.post('')
def create_transaction(
    payload: TransactionCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    item = Transaction(
        user_id=current_user.id,
        amount=payload.amount,
        type=payload.type,
        category=payload.category,
        note=payload.note,
        date=payload.date,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return success_response(data=_serialize_transaction(item), message='创建成功')


@router.post('/import')
async def import_transactions(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    skipped_rows: list[dict[str, int | str]] = []
    imported_items: list[Transaction] = []

    await file.seek(0)
    text_stream = io.TextIOWrapper(file.file, encoding='gbk', newline='')

    try:
        reader = csv.reader(text_stream)
        for row_number, row in enumerate(reader, start=1):
            if not row or not any(column.strip() for column in row):
                continue

            if row_number == 1 and row[0].strip() == '日期':
                continue

            if len(row) < 5:
                skipped_rows.append({'row': row_number, 'reason': '列数不足'})
                continue

            date_str, type_str, category_str, amount_str, note_str = [
                column.strip() for column in row[:5]
            ]

            transaction_type = SHARK_TYPE_MAP.get(type_str)
            if transaction_type is None:
                skipped_rows.append({'row': row_number, 'reason': '收支类型错误'})
                continue

            try:
                parsed_date = datetime.strptime(date_str, '%Y年%m月%d日').date()
            except ValueError:
                skipped_rows.append({'row': row_number, 'reason': '日期格式错误'})
                continue

            try:
                amount = Decimal(amount_str).quantize(Decimal('0.01'))
            except (InvalidOperation, ValueError):
                skipped_rows.append({'row': row_number, 'reason': '金额格式错误'})
                continue

            imported_items.append(
                Transaction(
                    user_id=current_user.id,
                    amount=amount,
                    type=transaction_type,
                    category=SHARK_CATEGORY_MAP.get(category_str, CategoryEnum.OTHER),
                    note=(note_str[:255] or None),
                    date=parsed_date,
                )
            )

        if imported_items:
            db.add_all(imported_items)
            db.commit()

        return success_response(
            data={
                'imported': len(imported_items),
                'skipped': len(skipped_rows),
                'skipped_rows': skipped_rows,
            },
            message='导入完成',
        )
    except UnicodeDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='文件编码错误，请导出 GBK 编码的 CSV 文件',
        ) from exc
    finally:
        text_stream.detach()
        await file.close()


def _note_usage_in_window(
    db: Session,
    user_id: int,
    window_start: date,
    window_end: date,
) -> dict[str, tuple[int, date]]:
    """返回 {备注: (最近 days 天内使用次数, 最近使用日期)}，仅统计非空备注。"""
    stmt = (
        select(
            func.trim(Transaction.note),
            func.count(),
            func.max(Transaction.date),
        )
        .where(
            Transaction.user_id == user_id,
            Transaction.note.is_not(None),
            func.trim(Transaction.note) != '',
            Transaction.date >= window_start,
            Transaction.date <= window_end,
        )
        .group_by(func.trim(Transaction.note))
    )
    return {
        note: (count, last_used)
        for note, count, last_used in db.execute(stmt).all()
    }


@router.get('/quick-inputs')
def get_quick_inputs(
    days: int = Query(default=90, ge=1, le=365),
    per_category: int = Query(default=6, ge=1, le=20),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    today = date.today()
    # 窗口 = [today-(days-1), today]，含今天共 days 个自然日
    window_start = today - timedelta(days=days - 1)

    last_item = db.scalars(
        select(Transaction)
        .where(Transaction.user_id == current_user.id)
        .order_by(Transaction.created_at.desc(), Transaction.id.desc())
        .limit(1)
    ).first()

    preset_rows = db.execute(
        select(UserNotePreset.note, UserNotePreset.kind)
        .where(UserNotePreset.user_id == current_user.id)
        .order_by(UserNotePreset.created_at.desc(), UserNotePreset.id.desc())
    ).all()
    usage = _note_usage_in_window(
        db=db,
        user_id=current_user.id,
        window_start=window_start,
        window_end=today,
    )

    pinned: list[dict] = []
    excluded_notes: set[str] = set()
    for note, kind in preset_rows:
        excluded_notes.add(note)
        if kind != NOTE_PRESET_PINNED:
            continue
        count, last_used = usage.get(note, (0, None))
        pinned.append(
            {'note': note, 'count': count, 'last_used': last_used.isoformat() if last_used else None}
        )

    grouped = db.execute(
        select(
            func.trim(Transaction.category),
            func.trim(Transaction.note),
            func.count(),
            func.max(Transaction.date),
        )
        .where(
            Transaction.user_id == current_user.id,
            Transaction.note.is_not(None),
            func.trim(Transaction.note) != '',
            Transaction.date >= window_start,
            Transaction.date <= today,
        )
        .group_by(func.trim(Transaction.category), func.trim(Transaction.note))
        .having(func.count() >= 2)
    ).all()

    by_category: dict[str, list[tuple[int, date, str]]] = {}
    for category, note, count, last_used in grouped:
        if note in excluded_notes:
            continue
        by_category.setdefault(category, []).append((count, last_used, note))

    serialized_categories: dict[str, list[dict]] = {}
    for category, entries in by_category.items():
        entries.sort(key=lambda entry: (-entry[0], -entry[1].toordinal(), entry[2]))
        serialized_categories[category] = [
            {'note': note, 'count': count, 'last_used': last_used.isoformat()}
            for count, last_used, note in entries[:per_category]
        ]

    data = QuickInputsResponse(
        last_date=last_item.date if last_item else None,
        pinned=pinned,
        by_category=serialized_categories,
    )
    return success_response(data=data.model_dump(mode='json'))


@router.post('/note-presets')
def upsert_note_preset(
    payload: NotePresetRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    item = db.scalars(
        select(UserNotePreset).where(
            UserNotePreset.user_id == current_user.id,
            UserNotePreset.note == payload.note,
        )
    ).first()

    if item is None:
        item = UserNotePreset(user_id=current_user.id, note=payload.note, kind=payload.kind)
        db.add(item)
    else:
        item.kind = payload.kind

    db.commit()
    db.refresh(item)
    data = NotePresetResponse(note=item.note, kind=item.kind)
    return success_response(data=data.model_dump(mode='json'), message='保存成功')


@router.delete('/note-presets')
def delete_note_preset(
    note: str = Query(min_length=1, max_length=255),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    normalized = note.strip()
    if not normalized:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='备注不能为空',
        )

    item = db.scalars(
        select(UserNotePreset).where(
            UserNotePreset.user_id == current_user.id,
            UserNotePreset.note == normalized,
        )
    ).first()

    deleted = item is not None
    if item is not None:
        db.delete(item)
        db.commit()

    data = NotePresetDeleteResponse(note=normalized, deleted=deleted)
    return success_response(data=data.model_dump(mode='json'))


@router.put('/{transaction_id}')
def update_transaction(
    transaction_id: int,
    payload: TransactionUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    item = db.get(Transaction, transaction_id)
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='账单不存在',
        )
    if item.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail='只能修改自己的账单',
        )

    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(item, field, value)

    db.commit()
    db.refresh(item)
    return success_response(data=_serialize_transaction(item), message='修改成功')


@router.delete('/{transaction_id}')
def delete_transaction(
    transaction_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    item = db.get(Transaction, transaction_id)
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='账单不存在',
        )
    if item.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail='只能删除自己的账单',
        )

    db.delete(item)
    db.commit()
    return success_response(data={'id': transaction_id}, message='删除成功')
