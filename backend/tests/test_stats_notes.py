from __future__ import annotations

from collections.abc import Generator
from datetime import date
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app.core.security import get_current_user
from app.main import app
from app.models.enums import TransactionType
from app.models.transaction import Transaction
from app.models.user import User


def _seed_transactions(session_factory: sessionmaker, rows: list[dict]) -> None:
    db = session_factory()
    try:
        for row in rows:
            db.add(
                Transaction(
                    user_id=row["user_id"],
                    amount=Decimal(str(row["amount"])),
                    type=TransactionType(row["type"]),
                    category=row.get("category", "其他"),
                    note=row.get("note"),
                    date=date.fromisoformat(row["date"]),
                )
            )
        db.commit()
    finally:
        db.close()


@pytest.fixture()
def client(
    monkeypatch: pytest.MonkeyPatch,
) -> Generator[tuple[TestClient, dict[str, User], sessionmaker], None, None]:
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


def test_note_ranking_self_expense_aggregates_sorts_and_excludes_income(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, session_factory = client
    _seed_transactions(
        session_factory,
        [
            {"user_id": 1, "amount": 20, "type": "expense", "note": "午餐", "date": "2026-08-05"},
            {"user_id": 1, "amount": 30, "type": "expense", "note": "午餐", "date": "2026-08-10"},
            {"user_id": 1, "amount": 15, "type": "expense", "note": "打车", "date": "2026-08-03"},
            {"user_id": 1, "amount": 100, "type": "expense", "note": "购物", "date": "2026-08-01"},
            {"user_id": 1, "amount": 5000, "type": "income", "note": "工资", "date": "2026-08-01"},
        ],
    )

    response = test_client.get(
        "/stats/notes",
        params={"month": "2026-08", "target": "self", "type": "expense"},
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data == [
        {"note": "购物", "amount": 100.0, "count": 1},
        {"note": "午餐", "amount": 50.0, "count": 2},
        {"note": "打车", "amount": 15.0, "count": 1},
    ]


def test_note_ranking_type_income(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, session_factory = client
    _seed_transactions(
        session_factory,
        [
            {"user_id": 1, "amount": 5000, "type": "income", "note": "工资", "date": "2026-08-01"},
            {"user_id": 1, "amount": 300, "type": "income", "note": "红包", "date": "2026-08-02"},
            {"user_id": 1, "amount": 20, "type": "expense", "note": "午餐", "date": "2026-08-03"},
        ],
    )

    response = test_client.get(
        "/stats/notes",
        params={"month": "2026-08", "target": "self", "type": "income"},
    )

    assert response.status_code == 200
    assert response.json()["data"] == [
        {"note": "工资", "amount": 5000.0, "count": 1},
        {"note": "红包", "amount": 300.0, "count": 1},
    ]


def test_note_ranking_merges_blank_notes_into_unlabeled(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, session_factory = client
    _seed_transactions(
        session_factory,
        [
            {"user_id": 1, "amount": 10, "type": "expense", "note": None, "date": "2026-08-01"},
            {"user_id": 1, "amount": 20, "type": "expense", "note": "", "date": "2026-08-02"},
            {"user_id": 1, "amount": 30, "type": "expense", "note": "   ", "date": "2026-08-03"},
            {"user_id": 1, "amount": 5, "type": "expense", "note": "午餐", "date": "2026-08-04"},
        ],
    )

    response = test_client.get(
        "/stats/notes",
        params={"month": "2026-08", "target": "self", "type": "expense"},
    )

    assert response.status_code == 200
    assert response.json()["data"] == [
        {"note": "未备注", "amount": 60.0, "count": 3},
        {"note": "午餐", "amount": 5.0, "count": 1},
    ]


def test_note_ranking_limits_to_top_10(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, session_factory = client
    _seed_transactions(
        session_factory,
        [
            {"user_id": 1, "amount": amount, "type": "expense", "note": f"备注{amount}", "date": "2026-08-01"}
            for amount in range(1, 13)
        ],
    )

    response = test_client.get(
        "/stats/notes",
        params={"month": "2026-08", "target": "self", "type": "expense"},
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert len(data) == 10
    assert data[0] == {"note": "备注12", "amount": 12.0, "count": 1}
    assert data[-1] == {"note": "备注3", "amount": 3.0, "count": 1}


def test_note_ranking_defaults_to_current_month_and_expense(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, session_factory = client
    today = date.today()
    _seed_transactions(
        session_factory,
        [
            {"user_id": 1, "amount": 8, "type": "expense", "note": "早餐", "date": today.isoformat()},
            {"user_id": 1, "amount": 999, "type": "income", "note": "奖金", "date": today.isoformat()},
        ],
    )

    response = test_client.get("/stats/notes", params={"target": "self"})

    assert response.status_code == 200
    assert response.json()["data"] == [{"note": "早餐", "amount": 8.0, "count": 1}]


def test_note_ranking_empty_month_returns_empty_list(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, _session_factory = client

    response = test_client.get(
        "/stats/notes",
        params={"month": "2026-01", "target": "self", "type": "expense"},
    )

    assert response.status_code == 200
    assert response.json()["data"] == []


def test_note_ranking_invalid_month_returns_400(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, _session_factory = client

    response = test_client.get("/stats/notes", params={"month": "2026-13"})

    assert response.status_code == 400
    assert "YYYY-MM" in response.json()["message"]


def test_note_ranking_rejects_invalid_target(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, _session_factory = client

    response = test_client.get("/stats/notes", params={"target": "both"})

    assert response.status_code == 422


def test_note_ranking_partner_requires_binding(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, _session_factory = client

    response = test_client.get(
        "/stats/notes",
        params={"month": "2026-08", "target": "partner"},
    )

    assert response.status_code == 403
    assert response.json()["message"] == "尚未绑定伴侣"


def test_note_ranking_partner_queries_partner_data(
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
            {"user_id": 2, "amount": 66, "type": "expense", "note": "对方午餐", "date": "2026-08-01"},
            {"user_id": 1, "amount": 1, "type": "expense", "note": "自己的", "date": "2026-08-01"},
        ],
    )

    response = test_client.get(
        "/stats/notes",
        params={"month": "2026-08", "target": "partner", "type": "expense"},
    )

    assert response.status_code == 200
    assert response.json()["data"] == [{"note": "对方午餐", "amount": 66.0, "count": 1}]


def test_note_trend_buckets_by_month_with_income_and_expense(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, session_factory = client
    _seed_transactions(
        session_factory,
        [
            {"user_id": 1, "amount": 1000, "type": "expense", "note": "房租", "date": "2026-05-10"},
            {"user_id": 1, "amount": 200, "type": "income", "note": "房租", "date": "2026-06-05"},
            {"user_id": 1, "amount": 1100, "type": "expense", "note": "房租", "date": "2026-07-01"},
            {"user_id": 1, "amount": 50, "type": "expense", "note": "餐饮", "date": "2026-06-06"},
        ],
    )

    response = test_client.get(
        "/stats/note-trend",
        params={"note": "房租", "months": 6, "end_month": "2026-07", "target": "self"},
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert [point["month"] for point in data] == [
        "2026-02",
        "2026-03",
        "2026-04",
        "2026-05",
        "2026-06",
        "2026-07",
    ]
    assert data[3] == {"month": "2026-05", "income": 0.0, "expense": 1000.0, "balance": -1000.0}
    assert data[4] == {"month": "2026-06", "income": 200.0, "expense": 0.0, "balance": 200.0}
    assert data[5] == {"month": "2026-07", "income": 0.0, "expense": 1100.0, "balance": -1100.0}


def test_note_trend_matches_unlabeled_note(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, session_factory = client
    _seed_transactions(
        session_factory,
        [
            {"user_id": 1, "amount": 50, "type": "expense", "note": None, "date": "2026-06-01"},
            {"user_id": 1, "amount": 30, "type": "expense", "note": "", "date": "2026-06-02"},
            {"user_id": 1, "amount": 10, "type": "expense", "note": "午餐", "date": "2026-06-03"},
        ],
    )

    response = test_client.get(
        "/stats/note-trend",
        params={"note": "未备注", "months": 6, "end_month": "2026-06", "target": "self"},
    )

    assert response.status_code == 200
    data = response.json()["data"]
    june = next(point for point in data if point["month"] == "2026-06")
    assert june == {"month": "2026-06", "income": 0.0, "expense": 80.0, "balance": -80.0}


def test_note_trend_defaults_end_month_to_current_month(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, session_factory = client
    today = date.today()
    _seed_transactions(
        session_factory,
        [
            {"user_id": 1, "amount": 42, "type": "expense", "note": "咖啡", "date": today.isoformat()},
        ],
    )

    response = test_client.get("/stats/note-trend", params={"note": "咖啡", "target": "self"})

    assert response.status_code == 200
    data = response.json()["data"]
    assert len(data) == 6
    assert data[-1]["month"] == today.strftime("%Y-%m")
    assert data[-1]["expense"] == 42.0


def test_note_trend_requires_note_param(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, _session_factory = client

    response = test_client.get("/stats/note-trend", params={"target": "self"})

    assert response.status_code == 422


def test_note_trend_invalid_end_month_returns_400(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, _session_factory = client

    response = test_client.get(
        "/stats/note-trend",
        params={"note": "房租", "end_month": "2026-13"},
    )

    assert response.status_code == 400
    assert "YYYY-MM" in response.json()["message"]


def test_note_trend_partner_requires_binding(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, _session_factory = client

    response = test_client.get(
        "/stats/note-trend",
        params={"note": "房租", "target": "partner"},
    )

    assert response.status_code == 403
    assert response.json()["message"] == "尚未绑定伴侣"


def test_note_trend_partner_queries_partner_data(
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
            {"user_id": 2, "amount": 700, "type": "expense", "note": "房租", "date": "2026-06-10"},
            {"user_id": 1, "amount": 1, "type": "expense", "note": "房租", "date": "2026-06-11"},
        ],
    )

    response = test_client.get(
        "/stats/note-trend",
        params={"note": "房租", "months": 3, "end_month": "2026-06", "target": "partner"},
    )

    assert response.status_code == 200
    data = response.json()["data"]
    june = next(point for point in data if point["month"] == "2026-06")
    assert june["expense"] == 700.0
