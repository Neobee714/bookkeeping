from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.agent.tools import (
    AgentToolError,
    CategoryBreakdownInput,
    CompareExpensesInput,
    SearchTransactionsInput,
    SummarizeExpensesInput,
    build_agent_tools,
    category_breakdown_data,
    compare_expenses_data,
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


def test_resolve_target_user_ids_rejects_both_without_binding() -> None:
    user = make_user(1)

    with pytest.raises(AgentToolError):
        resolve_target_user_ids(user, "both")


def test_date_window_excludes_end_date_and_rejects_invalid_window(db: Session) -> None:
    current_user = make_user(1)
    add_transaction(db, 1, "20.00", TransactionType.EXPENSE, "food", "in", date(2026, 5, 31))
    add_transaction(db, 1, "40.00", TransactionType.EXPENSE, "food", "out", date(2026, 6, 1))
    db.commit()

    result = summarize_expenses_data(
        db,
        current_user,
        SummarizeExpensesInput(target="self", start_date="2026-05-01", end_date="2026-06-01"),
    )

    assert result["total_expense"] == 20.0
    assert result["transaction_count"] == 1

    with pytest.raises(AgentToolError, match="start_date must be earlier than end_date"):
        summarize_expenses_data(
            db,
            current_user,
            SummarizeExpensesInput(
                target="self",
                start_date="2026-06-01",
                end_date="2026-06-01",
            ),
        )


def test_search_transactions_data_reports_truncated_when_matches_exceed_cap(db: Session) -> None:
    current_user = make_user(1)
    add_transaction(db, 1, "30.00", TransactionType.EXPENSE, "food", "a", date(2026, 4, 1))
    add_transaction(db, 1, "20.00", TransactionType.EXPENSE, "food", "b", date(2026, 4, 2))
    add_transaction(db, 1, "10.00", TransactionType.EXPENSE, "food", "c", date(2026, 4, 3))
    db.commit()

    result = search_transactions_data(
        db,
        current_user,
        SearchTransactionsInput(
            target="self",
            start_date="2026-04-01",
            end_date="2026-05-01",
            limit=10,
        ),
        max_limit=2,
    )

    assert result["truncated"] is True
    assert len(result["items"]) == 2


def test_compare_expenses_data_uses_plan_field_names(db: Session) -> None:
    current_user = make_user(1)
    add_transaction(db, 1, "100.00", TransactionType.EXPENSE, "food", "a", date(2026, 1, 5))
    add_transaction(db, 1, "50.00", TransactionType.INCOME, "salary", "a", date(2026, 1, 6))
    add_transaction(db, 1, "160.00", TransactionType.EXPENSE, "food", "b", date(2026, 2, 5))
    add_transaction(db, 1, "70.00", TransactionType.INCOME, "salary", "b", date(2026, 2, 6))
    db.commit()

    result = compare_expenses_data(
        db,
        current_user,
        CompareExpensesInput(
            target="self",
            start_date_a="2026-01-01",
            end_date_a="2026-02-01",
            start_date_b="2026-02-01",
            end_date_b="2026-03-01",
        ),
    )

    assert result["period_a"]["total_expense"] == 100.0
    assert result["period_b"]["total_income"] == 70.0
    assert result["expense_delta"] == 60.0
    assert result["income_delta"] == 20.0


def test_build_agent_tools_returns_expected_names() -> None:
    current_user = make_user(1)

    tools = build_agent_tools(None, current_user, max_transaction_limit=20)

    assert [tool.name for tool in tools] == [
        "summarize_expenses",
        "category_breakdown",
        "search_transactions",
        "top_expenses",
        "compare_expenses",
    ]


def test_category_breakdown_data_returns_ratios(db: Session) -> None:
    current_user = make_user(1)
    add_transaction(db, 1, "75.00", TransactionType.EXPENSE, "food", "a", date(2026, 7, 1))
    add_transaction(db, 1, "25.00", TransactionType.EXPENSE, "book", "b", date(2026, 7, 2))
    db.commit()

    result = category_breakdown_data(
        db,
        current_user,
        CategoryBreakdownInput(target="self", start_date="2026-07-01", end_date="2026-08-01"),
    )

    assert result["total_expense"] == 100.0
    assert result["categories"] == [
        {"category": "food", "amount": 75.0, "ratio": 0.75},
        {"category": "book", "amount": 25.0, "ratio": 0.25},
    ]


def test_summary_aggregates_have_stable_tie_ordering(db: Session) -> None:
    current_user = make_user(1)
    add_transaction(db, 1, "30.00", TransactionType.EXPENSE, "c", "z", date(2026, 8, 1))
    add_transaction(db, 1, "20.00", TransactionType.EXPENSE, "b", "b", date(2026, 8, 2))
    add_transaction(db, 1, "20.00", TransactionType.EXPENSE, "a", "a", date(2026, 8, 3))
    db.commit()

    result = summarize_expenses_data(
        db,
        current_user,
        SummarizeExpensesInput(target="self", start_date="2026-08-01", end_date="2026-09-01"),
    )

    assert list(result["category_expenses"]) == ["c", "a", "b"]
    assert [item["note"] for item in result["top_notes"]] == ["z", "a", "b"]
