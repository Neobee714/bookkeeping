from __future__ import annotations

import logging
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.recurring import RecurringRule
from app.models.transaction import Transaction
from app.services.recurring_dates import (
    due_dates,
    first_occurrence_on_or_after,
    next_occurrence,
)

logger = logging.getLogger("bookkeeping.recurring")

LOOKBACK_DAYS = 90
MAX_PER_RUN = 400


def generate_due(db: Session, today: date | None = None) -> int:
    """把到期规则落成真实账单，返回新增条数。幂等。"""
    reference = today or date.today()
    cutoff = reference - timedelta(days=LOOKBACK_DAYS)

    rule_ids = list(
        db.scalars(
            select(RecurringRule.id)
            .where(
                RecurringRule.enabled.is_(True),
                RecurringRule.next_run_date <= reference,
            )
            .order_by(RecurringRule.next_run_date.asc(), RecurringRule.id.asc())
        ).all()
    )

    created_total = 0
    for rule_id in rule_ids:
        try:
            rule = db.get(RecurringRule, rule_id)
            if rule is None or not rule.enabled or rule.next_run_date > reference:
                continue
            created = _generate_rule(db, rule, reference, cutoff)
            db.commit()
            created_total += created
        except Exception:
            db.rollback()
            logger.exception("循环规则生成失败 recurring_rule_id=%s", rule_id)

    return created_total


def _generate_rule(db: Session, rule: RecurringRule, today: date, cutoff: date) -> int:
    if rule.next_run_date < cutoff:
        # 停机太久：直接跳到回溯窗口内，更早的到期日不再补账。
        rule.next_run_date = first_occurrence_on_or_after(rule.freq, rule.start_date, cutoff)
        if rule.next_run_date > today:
            return 0

    dates = due_dates(rule.freq, rule.start_date, rule.next_run_date, today, MAX_PER_RUN)
    if not dates:
        return 0

    existing_dates = set(
        db.scalars(
            select(Transaction.date).where(
                Transaction.recurring_rule_id == rule.id,
                Transaction.date.in_(dates),
            )
        ).all()
    )

    created = 0
    for due_date in dates:
        if due_date in existing_dates:
            continue
        db.add(
            Transaction(
                user_id=rule.user_id,
                amount=rule.amount,
                type=rule.type,
                category=rule.category,
                note=rule.note,
                merchant=None,
                item=None,
                note_kind='evaluation' if rule.note else None,
                date=due_date,
                recurring_rule_id=rule.id,
            )
        )
        created += 1

    rule.last_generated_date = dates[-1]
    rule.next_run_date = next_occurrence(rule.freq, rule.start_date, dates[-1])
    return created
