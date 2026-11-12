from __future__ import annotations

import csv
import io
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
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
    NoteCandidate,
    NoteCandidatesResponse,
    NoteCleanupBatchInfo,
    NotePresetDeleteResponse,
    NotePresetRequest,
    NotePresetResponse,
    NoteReclassifyRequest,
    NoteReclassifyResponse,
    NoteUndoRequest,
    NoteUndoResponse,
    QuickInputsResponse,
    QuickNameCandidate,
    TransactionCreateRequest,
    TransactionUpdateRequest,
)
from app.services.merchant_stats import suggest_note_kind
from app.services.note_cleanup import (
    get_or_create_batch,
    latest_cleanup_batch,
    record_item,
    undo_cleanup_batch,
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
        'client_id': item.client_id,
        'recurring_rule_id': item.recurring_rule_id,
        'amount': _to_float(item.amount),
        'type': item.type.value,
        'category': item.category,
        'note': item.note,
        'merchant': item.merchant,
        'item': item.item,
        'note_kind': item.note_kind,
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
    def find_existing() -> Transaction | None:
        if not payload.client_id:
            return None
        return db.scalar(
            select(Transaction).where(
                Transaction.user_id == current_user.id,
                Transaction.client_id == payload.client_id,
            )
        )

    existing = find_existing()
    if existing is not None:
        # 离线队列重试：同一 client_id 已经落库，直接返回已有记录，不重复插入。
        return success_response(data=_serialize_transaction(existing), message='已存在')

    item = Transaction(
        user_id=current_user.id,
        client_id=payload.client_id,
        amount=payload.amount,
        type=payload.type,
        category=payload.category,
        note=payload.note,
        merchant=payload.merchant,
        item=payload.item,
        note_kind='evaluation' if payload.note else None,
        date=payload.date,
    )
    db.add(item)
    try:
        db.commit()
    except IntegrityError:
        # 并发重试：另一个请求先插入了同一个 (user_id, client_id)。
        db.rollback()
        existing = find_existing()
        if existing is not None:
            return success_response(data=_serialize_transaction(existing), message='已存在')
        raise
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

    header_index: dict[str, int] | None = None

    def _header_index_for(*names: str, default: int | None = None) -> int | None:
        if header_index is None:
            return default
        for name in names:
            index = header_index.get(name.lower())
            if index is not None:
                return index
        return default

    try:
        reader = csv.reader(text_stream)
        for row_number, row in enumerate(reader, start=1):
            if not row or not any(column.strip() for column in row):
                continue

            if row_number == 1 and row[0].strip().lower() in {'日期', 'date'}:
                header_index = {
                    cell.strip().lower(): index
                    for index, cell in enumerate(row)
                    if cell.strip()
                }
                continue

            date_index = _header_index_for('日期', 'date', default=0)
            note_index = (
                _header_index_for('备注', '评价', 'note')
                if header_index is not None
                else 4
            )
            merchant_index = _header_index_for('merchant', '商家')
            item_index = _header_index_for('item', '项目', '吃了什么', '菜品')

            required_columns = max(
                5,
                (date_index or 0) + 1,
                (note_index + 1) if note_index is not None else 0,
                (merchant_index + 1) if merchant_index is not None else 0,
                (item_index + 1) if item_index is not None else 0,
            )
            if len(row) < required_columns:
                skipped_rows.append({'row': row_number, 'reason': '列数不足'})
                continue

            def _cell(index: int | None) -> str:
                if index is None or index >= len(row):
                    return ''
                return row[index].strip()

            date_str = _cell(date_index)
            type_str = _cell(1)
            category_str = _cell(2)
            amount_str = _cell(3)
            note_str = _cell(note_index)
            merchant_str = _cell(merchant_index)[:50]
            item_str = _cell(item_index)[:50]

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
                    merchant=(merchant_str or None),
                    item=(item_str or None),
                    note_kind='evaluation' if note_str else None,
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
            Transaction.note_kind == 'evaluation',
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


def _named_usage_by_category(
    db: Session,
    user_id: int,
    column,
    window_start: date,
    window_end: date,
    limit: int,
) -> dict[str, list[QuickNameCandidate]]:
    """按分类聚合商家/菜品候选，次数降序、最近使用降序。"""
    label = func.trim(column)
    rows = db.execute(
        select(
            func.trim(Transaction.category),
            label,
            func.count(),
            func.max(Transaction.date),
        )
        .where(
            Transaction.user_id == user_id,
            column.is_not(None),
            label != '',
            Transaction.date >= window_start,
            Transaction.date <= window_end,
        )
        .group_by(func.trim(Transaction.category), label)
    ).all()

    grouped: dict[str, list[tuple[int, date, str]]] = {}
    for category, name, count, last_used in rows:
        grouped.setdefault(category, []).append((count, last_used, name))

    serialized: dict[str, list[QuickNameCandidate]] = {}
    for category, entries in grouped.items():
        entries.sort(key=lambda entry: (-entry[0], -entry[1].toordinal(), entry[2]))
        serialized[category] = [
            QuickNameCandidate(name=name, count=count, last_used=last_used)
            for count, last_used, name in entries[:limit]
        ]
    return serialized


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
            Transaction.note_kind == 'evaluation',
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
        merchants_by_category=_named_usage_by_category(
            db=db,
            user_id=current_user.id,
            column=Transaction.merchant,
            window_start=window_start,
            window_end=today,
            limit=min(per_category, 6),
        ),
        items_by_category=_named_usage_by_category(
            db=db,
            user_id=current_user.id,
            column=Transaction.item,
            window_start=window_start,
            window_end=today,
            limit=min(per_category, 6),
        ),
    )
    return success_response(data=data.model_dump(mode='json'))


@router.get('/note-candidates')
def list_note_candidates(
    limit: int = Query(default=50, ge=1, le=200),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """列出尚未整理的旧备注，按次数与金额降序。"""
    label = func.trim(Transaction.note)
    base_filter = (
        Transaction.user_id == current_user.id,
        Transaction.note_kind.is_(None),
        Transaction.note.is_not(None),
        label != '',
    )

    total = int(
        db.scalar(select(func.count(func.distinct(label))).where(*base_filter)) or 0
    )
    amount_sum = func.coalesce(func.sum(Transaction.amount), Decimal('0'))
    rows = db.execute(
        select(
            label,
            func.count(Transaction.id),
            amount_sum,
            func.max(Transaction.date),
        )
        .where(*base_filter)
        .group_by(label)
        .order_by(
            func.count(Transaction.id).desc(),
            amount_sum.desc(),
            label.asc(),
        )
        .limit(limit)
    ).all()

    items = [
        NoteCandidate(
            note=note,
            count=int(count or 0),
            total_amount=_to_float(amount),
            last_used=last_used,
            suggestion=suggest_note_kind(note),
        )
        for note, count, amount, last_used in rows
    ]
    last_batch = latest_cleanup_batch(db, current_user.id)
    last_cleanup = (
        NoteCleanupBatchInfo(
            batch_id=last_batch.id,
            created_at=last_batch.created_at,
            affected_count=last_batch.affected_count,
        )
        if last_batch is not None
        else None
    )
    data = NoteCandidatesResponse(total=total, items=items, last_cleanup=last_cleanup)
    return success_response(data=data.model_dump(mode='json'))


@router.post('/notes/reclassify')
def reclassify_note(
    payload: NoteReclassifyRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """把同名旧备注批量归为商家/菜品/评价；只影响统计字段。"""
    if payload.action == 'skip':
        data = NoteReclassifyResponse(affected=0, batch_id=None)
        return success_response(data=data.model_dump(mode='json'), message='已跳过')

    label = func.trim(Transaction.note)
    items = list(
        db.scalars(
            select(Transaction).where(
                Transaction.user_id == current_user.id,
                Transaction.note_kind.is_(None),
                Transaction.note.is_not(None),
                label == payload.note,
            )
        ).all()
    )
    if not items:
        data = NoteReclassifyResponse(affected=0, batch_id=None)
        return success_response(data=data.model_dump(mode='json'), message='没有需要整理的旧备注')

    batch = get_or_create_batch(db, current_user.id, payload.batch_key)
    for item in items:
        old_merchant = item.merchant
        old_item = item.item
        old_note = item.note
        old_note_kind = item.note_kind

        if payload.action == 'merchant':
            new_merchant, new_item = payload.merchant, None
            new_note, new_note_kind = None, None
        elif payload.action == 'item':
            new_merchant, new_item = None, payload.item
            new_note, new_note_kind = None, None
        elif payload.action == 'both':
            new_merchant, new_item = payload.merchant, payload.item
            new_note, new_note_kind = None, None
        else:  # evaluation
            new_merchant, new_item = old_merchant, old_item
            new_note, new_note_kind = old_note, 'evaluation'

        record_item(
            db,
            batch,
            item,
            old_merchant=old_merchant,
            old_item=old_item,
            old_note=old_note,
            old_note_kind=old_note_kind,
            new_merchant=new_merchant,
            new_item=new_item,
            new_note=new_note,
            new_note_kind=new_note_kind,
        )
        item.merchant = new_merchant
        item.item = new_item
        item.note = new_note
        item.note_kind = new_note_kind

    db.commit()
    data = NoteReclassifyResponse(affected=len(items), batch_id=batch.id)
    return success_response(data=data.model_dump(mode='json'), message='整理完成')


@router.post('/notes/undo')
def undo_note_cleanup(
    payload: NoteUndoRequest | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """撤销最近一次整理；不传 batch_id 时自动撤销最近一批。"""
    try:
        result = undo_cleanup_batch(
            db, current_user.id, payload.batch_id if payload is not None else None
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail='没有可撤销的整理'
        )
    batch, restored, skipped = result
    data = NoteUndoResponse(batch_id=batch.id, restored=restored, skipped=skipped)
    message = f'已撤销 {restored} 条'
    if skipped:
        message += f'，{skipped} 条因后续修改跳过'
    return success_response(data=data.model_dump(mode='json'), message=message)


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
    if 'note' in updates:
        item.note_kind = 'evaluation' if updates['note'] else None

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
