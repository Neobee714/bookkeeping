from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.agent.tools import (
    AgentToolError,
    SearchTransactionsInput,
    SummarizeExpensesInput,
    resolve_target_user_ids,
    search_transactions_data,
    summarize_expenses_data,
)
from app.core.database import Base
from app.models.enums import TransactionType
from app.models.transaction import Transaction
from app.models.user import User


@pytest.fixture()
def db() -> Session:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(engine)


def make_user(user_id: int, partner_id: int | None = None) -> User:
    return User(
        id=user_id,
        username=f"user{user_id}",
        nickname=f"User {user_id}",
        partner_id=partner_id,
        password_hash="unused",
        reg_invite_code=f"CODE{user_id:04d}",
    )


def add_transaction(
    db: Session,
    user_id: int,
    amount: str,
    tx_type: TransactionType,
    category: str,
    note: str | None,
    tx_date: date,
) -> None:
    db.add(
        Transaction(
            user_id=user_id,
            amount=Decimal(amount),
            type=tx_type,
            category=category,
            note=note,
            date=tx_date,
        )
    )


def test_resolve_target_user_ids_rejects_partner_without_binding() -> None:
    user = make_user(1)

    with pytest.raises(AgentToolError, match="尚未绑定伴侣"):
        resolve_target_user_ids(user, "partner")


def test_resolve_target_user_ids_allows_only_self_partner_or_both() -> None:
    user = make_user(1, partner_id=2)

    assert resolve_target_user_ids(user, "self") == [1]
    assert resolve_target_user_ids(user, "partner") == [2]
    assert resolve_target_user_ids(user, "both") == [1, 2]

    with pytest.raises(AgentToolError, match="查询范围不支持"):
        resolve_target_user_ids(user, "someone_else")


def test_summarize_expenses_data_limits_to_allowed_users(db: Session) -> None:
    current_user = make_user(1, partner_id=2)
    add_transaction(db, 1, "100.00", TransactionType.EXPENSE, "餐饮", "午饭", date(2026, 1, 5))
    add_transaction(db, 2, "80.00", TransactionType.EXPENSE, "购物", "日用品", date(2026, 1, 6))
    add_transaction(db, 3, "999.00", TransactionType.EXPENSE, "其他", "别人", date(2026, 1, 7))
    add_transaction(db, 1, "300.00", TransactionType.INCOME, "工资", "工资", date(2026, 1, 8))
    db.commit()

    result = summarize_expenses_data(
        db,
        current_user,
        SummarizeExpensesInput(target="both", start_date="2026-01-01", end_date="2026-02-01"),
    )

    assert result["total_expense"] == 180.0
    assert result["total_income"] == 300.0
    assert result["transaction_count"] == 3
    assert result["category_expenses"] == {"购物": 80.0, "餐饮": 100.0}


def test_search_transactions_data_filters_and_caps_limit(db: Session) -> None:
    current_user = make_user(1, partner_id=2)
    add_transaction(db, 1, "120.00", TransactionType.EXPENSE, "餐饮", "奶茶", date(2026, 3, 1))
    add_transaction(db, 1, "60.00", TransactionType.EXPENSE, "餐饮", "面包", date(2026, 3, 2))
    add_transaction(db, 2, "150.00", TransactionType.EXPENSE, "餐饮", "奶茶", date(2026, 3, 3))
    add_transaction(db, 3, "500.00", TransactionType.EXPENSE, "餐饮", "奶茶", date(2026, 3, 4))
    db.commit()

    result = search_transactions_data(
        db,
        current_user,
        SearchTransactionsInput(
            target="both",
            start_date="2026-03-01",
            end_date="2026-04-01",
            category="餐饮",
            note_keyword="奶茶",
            min_amount=100,
            limit=10,
        ),
        max_limit=2,
    )

    assert result["truncated"] is False
    assert [item["amount"] for item in result["items"]] == [150.0, 120.0]
    assert {item["owner"] for item in result["items"]} == {"self", "partner"}
