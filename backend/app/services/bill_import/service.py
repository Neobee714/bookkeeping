"""导入预览与提交。"""

from __future__ import annotations

from collections import defaultdict
from datetime import date
from decimal import Decimal, InvalidOperation

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.category import Category
from app.models.import_rule import ImportRule
from app.models.transaction import Transaction
from app.models.user import User

from . import categorize
from .bill_types import BillParseError
from .detect import parse_bill

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
_CHUNK = 500


def _load_category_sets(db: Session, user_id: int) -> dict[str, set[str]]:
    rows = db.execute(
        select(Category.name, Category.type).where(Category.user_id == user_id)
    ).all()
    result: dict[str, set[str]] = {"expense": set(), "income": set(), "transfer": set()}
    for name, type_ in rows:
        result.setdefault(type_, set()).add(name)
    return result


def _load_category_meta(db: Session, user_id: int) -> list[dict]:
    rows = db.execute(
        select(Category).where(Category.user_id == user_id).order_by(Category.id)
    ).scalars()
    return [{"name": item.name, "icon": item.icon, "type": item.type} for item in rows]


def _load_rules(db: Session, user_id: int, source: str) -> dict[str, str]:
    rows = db.execute(
        select(ImportRule.merchant_key, ImportRule.category, ImportRule.source).where(
            ImportRule.user_id == user_id, ImportRule.source.in_([source, "any"])
        )
    ).all()
    # 同一商家既有通用规则又有来源专用规则时，专用规则优先
    ordered = sorted(rows, key=lambda row: 0 if row[2] == "any" else 1)
    return {key: category for key, category, _ in ordered}


def _existing_categories(db: Session, user_id: int, ids: list[str]) -> dict[str, str]:
    found: dict[str, str] = {}
    for start in range(0, len(ids), _CHUNK):
        chunk = ids[start : start + _CHUNK]
        rows = db.execute(
            select(Transaction.client_id, Transaction.category).where(
                Transaction.user_id == user_id, Transaction.client_id.in_(chunk)
            )
        ).all()
        for client_id, category in rows:
            if client_id:
                found[client_id] = category
    return found


def _money(value: Decimal) -> str:
    return str(value.quantize(Decimal("0.01")))


def preview(db: Session, user: User, data: bytes, *, password: str | None = None) -> dict:
    if len(data) > MAX_UPLOAD_BYTES:
        raise BillParseError("文件过大（上限 10MB）")

    bill = parse_bill(data, password=password)
    categories = _load_category_sets(db, user.id)
    rules = _load_rules(db, user.id, bill.source)
    existing = _existing_categories(db, user.id, [row.client_id for row in bill.rows])

    rows: list[dict] = []
    seen: set[str] = set()
    for row in bill.rows:
        if row.client_id in seen:
            continue
        seen.add(row.client_id)

        if row.client_id in existing:
            category, match, already = existing[row.client_id], "existing", True
        elif row.category_hint and row.category_hint in categories.get(row.type, set()):
            # 账单本身能判定（转账/红包/提现），直接用
            category, match, already = row.category_hint, "builtin", False
        else:
            category, match = categorize.suggest(
                row.merchant, row.note, row.type, rules, categories, channel=row.channel
            )
            already = False

        rows.append(
            {
                "client_id": row.client_id,
                "date": row.date.isoformat(),
                "amount": _money(row.amount),
                "type": row.type,
                "merchant": row.merchant,
                "channel": row.channel,
                "note": row.note,
                "category": category,
                "match": match,
                "existing": already,
            }
        )

    importable = [row for row in rows if not row["existing"]]
    expense = [row for row in importable if row["type"] == "expense"]
    income = [row for row in importable if row["type"] == "income"]
    transfer = [row for row in importable if row["type"] == "transfer"]

    reasons: dict[str, dict] = defaultdict(lambda: {"count": 0, "amount": Decimal("0")})
    for item in bill.skipped:
        bucket = reasons[item.reason]
        bucket["count"] += 1
        bucket["amount"] += item.amount or Decimal("0")

    skipped_rows = [
        {
            "reason": item.reason,
            "date": item.date.isoformat() if item.date else "",
            "amount": _money(item.amount) if item.amount is not None else "",
            "merchant": item.merchant,
            "type": item.type,
        }
        for item in bill.skipped[:200]
    ]

    return {
        "source": bill.source,
        "summary": {
            "total": len(rows) + len(bill.skipped),
            "importable": len(importable),
            "skipped": len(bill.skipped),
            "expense_count": len(expense),
            "expense_amount": _money(sum((Decimal(r["amount"]) for r in expense), Decimal("0"))),
            "income_count": len(income),
            "income_amount": _money(sum((Decimal(r["amount"]) for r in income), Decimal("0"))),
            "transfer_count": len(transfer),
            "transfer_amount": _money(
                sum((Decimal(r["amount"]) for r in transfer), Decimal("0"))
            ),
            "range": [
                bill.start.isoformat() if bill.start else "",
                bill.end.isoformat() if bill.end else "",
            ],
            "account": bill.account,
            "declared": bill.declared,
            "skipped_reasons": [
                {"reason": reason, "count": value["count"], "amount": _money(value["amount"])}
                for reason, value in sorted(
                    reasons.items(), key=lambda item: -item[1]["count"]
                )
            ],
        },
        "categories": {
            "expense": [c for c in _load_category_meta(db, user.id) if c["type"] == "expense"],
            "income": [c for c in _load_category_meta(db, user.id) if c["type"] == "income"],
            "transfer": [c for c in _load_category_meta(db, user.id) if c["type"] == "transfer"],
        },
        "rows": rows,
        "skipped": skipped_rows,
    }


def _parse_date(value: str) -> date | None:
    try:
        return date.fromisoformat(value[:10])
    except ValueError:
        return None


def _parse_amount(value: object) -> Decimal | None:
    try:
        return Decimal(str(value)).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError):
        return None


def commit(db: Session, user: User, payload: dict) -> dict:
    source = (payload.get("source") or "any")[:12]
    categories = _load_category_sets(db, user.id)
    fallback_expense = categorize._fallback("expense", categories["expense"])
    fallback_income = categorize._fallback("income", categories["income"])
    fallback_transfer = categorize._fallback("transfer", categories["transfer"])

    incoming = payload.get("rows") or []
    ids = [row.get("client_id") for row in incoming if row.get("client_id")]
    existing = _existing_categories(db, user.id, list({i for i in ids if i}))

    imported = duplicated = invalid = 0
    seen: set[str] = set()

    for row in incoming:
        client_id = (row.get("client_id") or "")[:64]
        if not client_id or client_id in seen:
            invalid += 1
            continue
        seen.add(client_id)
        if client_id in existing:
            duplicated += 1
            continue

        day = _parse_date(str(row.get("date") or ""))
        amount = _parse_amount(row.get("amount"))
        type_ = row.get("type")
        if day is None or amount is None or amount <= 0 or type_ not in {
            "expense",
            "income",
            "transfer",
        }:
            invalid += 1
            continue

        available = categories[type_]
        category = row.get("category") or ""
        if category not in available:
            if type_ == "income":
                category = fallback_income
            elif type_ == "transfer":
                category = fallback_transfer
            else:
                category = fallback_expense

        note = (row.get("note") or "").strip()[:255] or None
        db.add(
            Transaction(
                user_id=user.id,
                client_id=client_id,
                amount=amount,
                type=type_,
                category=category[:10],
                merchant=((row.get("merchant") or "").strip()[:50] or None),
                channel=((row.get("channel") or "").strip()[:20] or None),
                note=note,
                note_kind="evaluation" if note else None,
                date=day,
            )
        )
        imported += 1

    learned = 0
    for item in payload.get("learn") or []:
        merchant_key = categorize.normalize_merchant(
            item.get("merchant") or item.get("channel")
        )
        category = item.get("category") or ""
        if not merchant_key or not category:
            continue
        if category not in categories["expense"] | categories["income"]:
            continue
        rule = db.execute(
            select(ImportRule).where(
                ImportRule.user_id == user.id,
                ImportRule.source == source,
                ImportRule.merchant_key == merchant_key,
            )
        ).scalar_one_or_none()
        if rule is None:
            db.add(
                ImportRule(
                    user_id=user.id,
                    source=source,
                    merchant_key=merchant_key,
                    category=category[:10],
                    hits=1,
                )
            )
        else:
            rule.category = category[:10]
            rule.hits += 1
        learned += 1

    db.commit()
    return {"imported": imported, "duplicated": duplicated, "learned": learned, "invalid": invalid}
