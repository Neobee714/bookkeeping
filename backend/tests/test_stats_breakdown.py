from __future__ import annotations

from collections.abc import Generator
from datetime import date
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.core.database import Base, get_db
from app.core.security import get_current_user
from app.main import app
from app.models.enums import TransactionType
from app.models.transaction import Transaction
from app.models.user import User


@pytest.fixture()
def client() -> Generator[tuple[TestClient, dict[str, User], sessionmaker], None, None]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(engine)

    holder: dict[str, User] = {
        "user": User(
            id=1,
            username="alice",
            nickname="Alice",
            password_hash="unused",
            reg_invite_code="ABCDEFGH",
        )
    }

    def override_get_db() -> Generator[Session, None, None]:
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    def override_get_current_user() -> User:
        return holder["user"]

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user
    try:
        yield TestClient(app), holder, TestingSessionLocal
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(engine)


def _seed_transactions(session_factory: sessionmaker, rows: list[dict]) -> None:
    db = session_factory()
    try:
        for row in rows:
            db.add(
                Transaction(
                    user_id=row["user_id"],
                    amount=Decimal(str(row["amount"])),
                    type=TransactionType(row.get("type", "expense")),
                    category=row.get("category", "餐饮"),
                    note=row.get("note"),
                    merchant=row.get("merchant"),
                    item=row.get("item"),
                    note_kind=row.get("note_kind"),
                    date=date.fromisoformat(row["date"]),
                )
            )
        db.commit()
    finally:
        db.close()


def _breakdown(test_client: TestClient, **params: str | int) -> dict:
    response = test_client.get("/stats/breakdown", params=params)
    assert response.status_code == 200, response.text
    return response.json()["data"]


# --- 聚合 ------------------------------------------------------------------


def test_merchant_breakdown_aggregates_sorts_and_excludes_blanks(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, session_factory = client
    _seed_transactions(
        session_factory,
        [
            {"user_id": 1, "amount": 30, "merchant": "和府捞面", "date": "2026-08-01"},
            {"user_id": 1, "amount": 30, "merchant": " 和府捞面 ", "date": "2026-08-05"},
            {"user_id": 1, "amount": 20, "merchant": "和府捞面", "date": "2026-08-09"},
            {"user_id": 1, "amount": 50, "merchant": "麦当劳", "date": "2026-08-02"},
            {"user_id": 1, "amount": 999, "merchant": None, "date": "2026-08-03"},
            {"user_id": 1, "amount": 888, "merchant": "", "date": "2026-08-04"},
            {"user_id": 1, "amount": 777, "merchant": "   ", "date": "2026-08-06"},
            {
                "user_id": 1,
                "amount": 100,
                "type": "income",
                "merchant": "工资",
                "date": "2026-08-07",
            },
        ],
    )

    data = _breakdown(test_client, dimension="merchant", month="2026-08")

    assert data["dimension"] == "merchant"
    assert data["items"] == [
        {"name": "和府捞面", "amount": 80.0, "count": 3, "avg": 26.67},
        {"name": "麦当劳", "amount": 50.0, "count": 1, "avg": 50.0},
    ]


def test_breakdown_filters_category(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, session_factory = client
    _seed_transactions(
        session_factory,
        [
            {"user_id": 1, "amount": 30, "category": "餐饮", "merchant": "和府捞面", "date": "2026-08-01"},
            {"user_id": 1, "amount": 50, "category": "餐饮", "merchant": "麦当劳", "date": "2026-08-02"},
            {"user_id": 1, "amount": 100, "category": "购物", "merchant": "超市", "date": "2026-08-03"},
        ],
    )

    food = _breakdown(
        test_client, dimension="merchant", month="2026-08", category="餐饮"
    )
    assert [item["name"] for item in food["items"]] == ["麦当劳", "和府捞面"]

    all_expenses = _breakdown(test_client, dimension="merchant", month="2026-08")
    assert all_expenses["items"][0]["name"] == "超市"


def test_item_breakdown_aggregates_and_sorts(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, session_factory = client
    _seed_transactions(
        session_factory,
        [
            {"user_id": 1, "amount": 20, "item": "面", "date": "2026-08-01"},
            {"user_id": 1, "amount": 40, "item": "面", "date": "2026-08-02"},
            {"user_id": 1, "amount": 50, "item": "饭", "date": "2026-08-03"},
            {"user_id": 1, "amount": 10, "item": None, "date": "2026-08-04"},
        ],
    )

    data = _breakdown(test_client, dimension="item", month="2026-08")

    assert data["items"] == [
        {"name": "面", "amount": 60.0, "count": 2, "avg": 30.0},
        {"name": "饭", "amount": 50.0, "count": 1, "avg": 50.0},
    ]


def test_breakdown_date_window_month_and_explicit_range(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, session_factory = client
    _seed_transactions(
        session_factory,
        [
            {"user_id": 1, "amount": 10, "merchant": "八月店", "date": "2026-08-31"},
            {"user_id": 1, "amount": 20, "merchant": "九月店", "date": "2026-09-01"},
        ],
    )

    august = _breakdown(test_client, dimension="merchant", month="2026-08")
    assert [item["name"] for item in august["items"]] == ["八月店"]

    explicit = _breakdown(
        test_client,
        dimension="merchant",
        start_date="2026-08-01",
        end_date="2026-09-01",
    )
    assert [item["name"] for item in explicit["items"]] == ["八月店"]


def test_breakdown_income_type(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, session_factory = client
    _seed_transactions(
        session_factory,
        [
            {
                "user_id": 1,
                "amount": 5000,
                "type": "income",
                "merchant": "公司",
                "date": "2026-08-01",
            },
            {
                "user_id": 1,
                "amount": 100,
                "type": "expense",
                "merchant": "公司",
                "date": "2026-08-02",
            },
        ],
    )

    expense = _breakdown(test_client, dimension="merchant", month="2026-08")
    income = _breakdown(
        test_client, dimension="merchant", month="2026-08", type="income"
    )

    assert expense["items"] == [
        {"name": "公司", "amount": 100.0, "count": 1, "avg": 100.0}
    ]
    assert income["items"] == [
        {"name": "公司", "amount": 5000.0, "count": 1, "avg": 5000.0}
    ]


# --- 参数与权限 -------------------------------------------------------------


def test_breakdown_requires_valid_dimension(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, _session_factory = client

    assert test_client.get("/stats/breakdown").status_code == 422
    assert (
        test_client.get("/stats/breakdown", params={"dimension": "note"}).status_code
        == 422
    )


def test_breakdown_invalid_month_returns_400(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, _session_factory = client

    response = test_client.get(
        "/stats/breakdown", params={"dimension": "merchant", "month": "2026-13"}
    )

    assert response.status_code == 400
    assert "YYYY-MM" in response.json()["message"]


def test_breakdown_limit_defaults_and_bounds(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, session_factory = client
    _seed_transactions(
        session_factory,
        [
            {
                "user_id": 1,
                "amount": amount,
                "merchant": f"店{amount:02d}",
                "date": "2026-08-01",
            }
            for amount in range(1, 26)
        ],
    )

    default = _breakdown(test_client, dimension="merchant", month="2026-08")
    assert len(default["items"]) == 20
    assert default["items"][0]["name"] == "店25"

    limited = _breakdown(
        test_client, dimension="merchant", month="2026-08", limit=5
    )
    assert [item["name"] for item in limited["items"]] == [
        "店25",
        "店24",
        "店23",
        "店22",
        "店21",
    ]

    for bad_limit in (0, 51):
        assert (
            test_client.get(
                "/stats/breakdown",
                params={
                    "dimension": "merchant",
                    "month": "2026-08",
                    "limit": bad_limit,
                },
            ).status_code
            == 422
        )


def test_breakdown_partner_requires_binding(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, _session_factory = client

    response = test_client.get(
        "/stats/breakdown",
        params={"dimension": "merchant", "target": "partner"},
    )

    assert response.status_code == 403
    assert response.json()["message"] == "尚未绑定伴侣"


def test_breakdown_partner_queries_partner_only(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, holder, session_factory = client
    holder["user"] = User(
        id=1,
        username="alice",
        nickname="Alice",
        password_hash="unused",
        reg_invite_code="ABCDEFGH",
        partner_id=2,
    )
    _seed_transactions(
        session_factory,
        [
            {"user_id": 2, "amount": 66, "merchant": "对方的店", "date": "2026-08-01"},
            {"user_id": 1, "amount": 1, "merchant": "自己的店", "date": "2026-08-01"},
        ],
    )

    partner = _breakdown(
        test_client, dimension="merchant", month="2026-08", target="partner"
    )
    mine = _breakdown(test_client, dimension="merchant", month="2026-08")

    assert [item["name"] for item in partner["items"]] == ["对方的店"]
    assert [item["name"] for item in mine["items"]] == ["自己的店"]


# --- legacy_note_count ------------------------------------------------------


def test_legacy_note_count_counts_distinct_unclassified_notes_only(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, session_factory = client
    _seed_transactions(
        session_factory,
        [
            {"user_id": 1, "amount": 1, "note": "旧A", "note_kind": None, "date": "2026-08-01"},
            {"user_id": 1, "amount": 1, "note": " 旧A ", "note_kind": None, "date": "2026-08-02"},
            {"user_id": 1, "amount": 1, "note": "旧B", "note_kind": None, "date": "2026-09-01"},
            {
                "user_id": 1,
                "amount": 1,
                "note": "好吃",
                "note_kind": "evaluation",
                "date": "2026-08-03",
            },
            {"user_id": 1, "amount": 1, "note": None, "date": "2026-08-04"},
            {"user_id": 1, "amount": 1, "note": "", "date": "2026-08-05"},
            {"user_id": 1, "amount": 1, "note": "   ", "date": "2026-08-06"},
            {"user_id": 2, "amount": 1, "note": "别人的", "date": "2026-08-07"},
        ],
    )

    august = _breakdown(test_client, dimension="item", month="2026-08")
    september = _breakdown(test_client, dimension="item", month="2026-09")

    assert august["legacy_note_count"] == 2
    # 不随月份变化
    assert september["legacy_note_count"] == 2


def test_breakdown_equal_amounts_sort_by_name(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, session_factory = client
    _seed_transactions(
        session_factory,
        [
            {"user_id": 1, "amount": 10, "merchant": "乙店", "date": "2026-08-01"},
            {"user_id": 1, "amount": 10, "merchant": "甲店", "date": "2026-08-01"},
        ],
    )

    data = _breakdown(test_client, dimension="merchant", month="2026-08")

    assert [item["name"] for item in data["items"]] == ["乙店", "甲店"]


def test_breakdown_exposes_last_cleanup_for_undo(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, session_factory = client
    _seed_transactions(
        session_factory,
        [
            {"user_id": 1, "amount": 30, "note": "小馆", "date": "2026-08-01"},
            {"user_id": 1, "amount": 20, "note": "小馆", "date": "2026-08-02"},
        ],
    )

    response = test_client.post(
        "/transactions/notes/reclassify",
        json={"note": "小馆", "action": "merchant", "merchant": "小馆"},
    )
    assert response.status_code == 200, response.text
    batch_id = response.json()["data"]["batch_id"]

    data = _breakdown(test_client, dimension="item", month="2026-08")
    assert data["last_cleanup"]["batch_id"] == batch_id
    assert data["last_cleanup"]["affected_count"] == 2
    assert data["last_cleanup"]["created_at"]
