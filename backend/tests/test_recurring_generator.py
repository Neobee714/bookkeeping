from __future__ import annotations

from collections.abc import Generator
from datetime import date, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401  确保模型注册进 Base.metadata
from app.core.database import Base
from app.models.enums import TransactionType
from app.models.recurring import RecurringRule
from app.models.transaction import Transaction
from app.models.user import User
from app.services.recurring import generate_due


@pytest.fixture()
def db() -> Generator[Session, None, None]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(engine)

    session = TestingSessionLocal()
    session.add(
        User(
            id=1,
            username="alice",
            nickname="Alice",
            password_hash="unused",
            reg_invite_code="ABCDEFGH",
        )
    )
    session.commit()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(engine)


def _add_rule(db: Session, **overrides: object) -> RecurringRule:
    values: dict[str, object] = {
        "user_id": 1,
        "amount": Decimal("3200.00"),
        "type": TransactionType.EXPENSE,
        "category": "居住",
        "note": "房租",
        "freq": "monthly",
        "start_date": date(2026, 1, 31),
        "next_run_date": date(2026, 2, 28),
        "enabled": True,
    }
    values.update(overrides)
    rule = RecurringRule(**values)
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


def _count(db: Session) -> int:
    return int(db.scalar(select(func.count(Transaction.id))) or 0)


def test_generate_once_then_idempotent(db: Session) -> None:
    rule = _add_rule(db)

    created = generate_due(db, today=date(2026, 2, 28))
    assert created == 1

    rows = list(db.scalars(select(Transaction)).all())
    assert len(rows) == 1
    transaction = rows[0]
    assert transaction.user_id == 1
    assert transaction.amount == Decimal("3200.00")
    assert transaction.type == TransactionType.EXPENSE
    assert transaction.category == "居住"
    assert transaction.note == "房租"
    assert transaction.date == date(2026, 2, 28)
    assert transaction.recurring_rule_id == rule.id
    assert transaction.client_id is None

    db.refresh(rule)
    assert rule.last_generated_date == date(2026, 2, 28)
    assert rule.next_run_date == date(2026, 3, 31)

    assert generate_due(db, today=date(2026, 2, 28)) == 0
    assert _count(db) == 1


def test_rewound_next_run_date_skips_existing_transaction(db: Session) -> None:
    rule = _add_rule(db)
    assert generate_due(db, today=date(2026, 2, 28)) == 1

    # 模拟历史数据不一致：到期日被回拨，但账单已经存在。
    rule.next_run_date = date(2026, 2, 28)
    db.commit()

    assert generate_due(db, today=date(2026, 2, 28)) == 0
    assert _count(db) == 1

    db.refresh(rule)
    assert rule.next_run_date == date(2026, 3, 31)


def test_disabled_rule_is_skipped(db: Session) -> None:
    rule = _add_rule(db, enabled=False, next_run_date=date(2026, 2, 28))

    assert generate_due(db, today=date(2026, 2, 28)) == 0
    assert _count(db) == 0

    db.refresh(rule)
    assert rule.next_run_date == date(2026, 2, 28)
    assert rule.last_generated_date is None


def test_lookback_is_limited_to_90_days(db: Session) -> None:
    rule = _add_rule(
        db,
        freq="daily",
        start_date=date(2024, 1, 1),
        next_run_date=date(2024, 1, 1),
    )

    today = date(2026, 3, 31)
    cutoff = today - timedelta(days=90)
    created = generate_due(db, today=today)

    expected_days = (today - cutoff).days + 1
    assert created == expected_days
    assert _count(db) == expected_days

    rows = list(db.scalars(select(Transaction).order_by(Transaction.date.asc())).all())
    assert rows[0].date == cutoff
    assert rows[-1].date == today
    assert all(row.date >= cutoff for row in rows)
    assert all(row.recurring_rule_id == rule.id for row in rows)

    db.refresh(rule)
    assert rule.next_run_date == today + timedelta(days=1)


def test_yearly_rule_without_occurrence_in_window_is_skipped(db: Session) -> None:
    rule = _add_rule(
        db,
        freq="yearly",
        start_date=date(2000, 6, 15),
        next_run_date=date(2000, 6, 15),
    )

    assert generate_due(db, today=date(2026, 11, 10)) == 0
    assert _count(db) == 0

    db.refresh(rule)
    assert rule.next_run_date == date(2027, 6, 15)


def test_income_rule_generates_income_transaction(db: Session) -> None:
    _add_rule(
        db,
        amount=Decimal("5000.00"),
        type=TransactionType.INCOME,
        category="收入",
        note="工资",
        freq="daily",
        start_date=date(2026, 1, 5),
        next_run_date=date(2026, 1, 5),
    )

    assert generate_due(db, today=date(2026, 1, 6)) == 2

    rows = list(db.scalars(select(Transaction).order_by(Transaction.date.asc())).all())
    assert [row.date for row in rows] == [date(2026, 1, 5), date(2026, 1, 6)]
    assert all(row.type == TransactionType.INCOME for row in rows)
    assert all(row.category == "收入" for row in rows)


def test_one_broken_rule_does_not_block_others(
    db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.services import recurring as recurring_service

    broken = _add_rule(db, freq="monthly", next_run_date=date(2026, 2, 28))
    healthy = _add_rule(
        db,
        freq="daily",
        start_date=date(2026, 2, 27),
        next_run_date=date(2026, 2, 28),
        note="宽带",
    )

    original_due_dates = recurring_service.due_dates

    def flaky_due_dates(
        freq: str,
        start: date,
        first: date,
        today: date,
        max_count: int = 400,
    ) -> list[date]:
        if freq == "monthly":
            raise RuntimeError("booom")
        return original_due_dates(freq, start, first, today, max_count)

    monkeypatch.setattr(recurring_service, "due_dates", flaky_due_dates)

    created = generate_due(db, today=date(2026, 2, 28))
    assert created == 1

    rows = list(db.scalars(select(Transaction)).all())
    assert len(rows) == 1
    assert rows[0].recurring_rule_id == healthy.id

    db.refresh(broken)
    assert broken.next_run_date == date(2026, 2, 28)
    assert broken.last_generated_date is None
