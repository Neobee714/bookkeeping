from __future__ import annotations

from collections.abc import Generator
from datetime import date, datetime, timedelta
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

_SEED_BASE_TIME = datetime(2026, 1, 1, 0, 0, 0)
_seed_sequence = 0


def _next_created_at() -> datetime:
    global _seed_sequence
    _seed_sequence += 1
    return _SEED_BASE_TIME + timedelta(microseconds=_seed_sequence)


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
                    amount=Decimal(str(row.get("amount", 1))),
                    type=TransactionType(row.get("type", "expense")),
                    category=row.get("category", "餐饮"),
                    note=row.get("note"),
                    merchant=row.get("merchant"),
                    item=row.get("item"),
                    note_kind=row.get(
                        "note_kind", "evaluation" if row.get("note") else None
                    ),
                    date=date.fromisoformat(row["date"]),
                    created_at=row.get("created_at") or _next_created_at(),
                )
            )
        db.commit()
    finally:
        db.close()


def _fetch(
    test_client: TestClient,
    holder: dict[str, User],
    user_id: int = 1,
    **params: int,
) -> dict:
    holder["user"] = User(
        id=user_id,
        username=f"user{user_id}",
        nickname=f"User{user_id}",
        password_hash="unused",
        reg_invite_code=f"CODE{user_id:04d}",
    )
    response = test_client.get("/transactions/quick-inputs", params=params)
    assert response.status_code == 200, response.text
    return response.json()["data"]


def test_empty_history_returns_empty_merchant_and_item_maps(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, holder, _session_factory = client

    data = _fetch(test_client, holder)

    assert data["merchants_by_category"] == {}
    assert data["items_by_category"] == {}
    assert data["by_category"] == {}


def test_groups_by_category_and_sorts_by_count_then_recent(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, holder, session_factory = client
    today = date.today()

    def day(offset: int) -> str:
        return (today - timedelta(days=offset)).isoformat()

    _seed_transactions(
        session_factory,
        [
            {"user_id": 1, "merchant": "和府捞面", "item": "面", "date": day(30)},
            {"user_id": 1, "merchant": "和府捞面", "item": "面", "date": day(20)},
            {"user_id": 1, "merchant": "和府捞面", "item": "饭", "date": day(10)},
            {"user_id": 1, "merchant": "麦当劳", "item": "汉堡", "date": day(25)},
            {"user_id": 1, "merchant": "麦当劳", "item": "汉堡", "date": day(5)},
            {"user_id": 1, "category": "交通", "merchant": "地铁", "item": "地铁", "date": day(6)},
            {"user_id": 1, "category": "交通", "merchant": "地铁", "item": "地铁", "date": day(4)},
        ],
    )

    data = _fetch(test_client, holder, days=365)

    assert data["merchants_by_category"] == {
        "餐饮": [
            {"name": "和府捞面", "count": 3, "last_used": day(10)},
            {"name": "麦当劳", "count": 2, "last_used": day(5)},
        ],
        "交通": [{"name": "地铁", "count": 2, "last_used": day(4)}],
    }
    assert data["items_by_category"] == {
        "餐饮": [
            {"name": "汉堡", "count": 2, "last_used": day(5)},
            {"name": "面", "count": 2, "last_used": day(20)},
            {"name": "饭", "count": 1, "last_used": day(10)},
        ],
        "交通": [{"name": "地铁", "count": 2, "last_used": day(4)}],
    }


def test_90_day_window_boundary(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, holder, session_factory = client
    today = date.today()
    in_window = today - timedelta(days=89)
    out_of_window = today - timedelta(days=90)
    _seed_transactions(
        session_factory,
        [
            {"user_id": 1, "merchant": "在窗内", "item": "面", "date": in_window.isoformat()},
            {"user_id": 1, "merchant": "在窗内", "item": "面", "date": today.isoformat()},
            {"user_id": 1, "merchant": "窗外", "item": "饭", "date": out_of_window.isoformat()},
            {"user_id": 1, "merchant": "窗外", "item": "饭", "date": out_of_window.isoformat()},
        ],
    )

    data = _fetch(test_client, holder)

    assert [item["name"] for item in data["merchants_by_category"]["餐饮"]] == ["在窗内"]
    assert [item["name"] for item in data["items_by_category"]["餐饮"]] == ["面"]


def test_custom_days_parameter_shrinks_window(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, holder, session_factory = client
    today = date.today()
    _seed_transactions(
        session_factory,
        [
            {
                "user_id": 1,
                "merchant": "老店",
                "item": "面",
                "date": (today - timedelta(days=10)).isoformat(),
            },
            {"user_id": 1, "merchant": "老店", "item": "面", "date": today.isoformat()},
        ],
    )

    assert _fetch(test_client, holder, days=7)["merchants_by_category"] == {
        "餐饮": [{"name": "老店", "count": 1, "last_used": today.isoformat()}]
    }
    assert _fetch(test_client, holder, days=30)["merchants_by_category"] == {
        "餐饮": [{"name": "老店", "count": 2, "last_used": today.isoformat()}]
    }


def test_trims_and_excludes_blank_names(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, holder, session_factory = client
    today = date.today()
    _seed_transactions(
        session_factory,
        [
            {"user_id": 1, "merchant": " 和府捞面 ", "item": " 面 ", "date": today.isoformat()},
            {"user_id": 1, "merchant": "和府捞面", "item": "面", "date": today.isoformat()},
            {"user_id": 1, "merchant": None, "item": None, "date": today.isoformat()},
            {"user_id": 1, "merchant": "", "item": "", "date": today.isoformat()},
            {"user_id": 1, "merchant": "   ", "item": "   ", "date": today.isoformat()},
        ],
    )

    data = _fetch(test_client, holder)

    assert data["merchants_by_category"] == {
        "餐饮": [{"name": "和府捞面", "count": 2, "last_used": today.isoformat()}]
    }
    assert data["items_by_category"] == {
        "餐饮": [{"name": "面", "count": 2, "last_used": today.isoformat()}]
    }


def test_truncates_each_category(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, holder, session_factory = client
    same_day = (date.today() - timedelta(days=5)).isoformat()
    rows: list[dict] = []
    for index in range(1, 9):
        for _ in range(9 - index):
            rows.append(
                {
                    "user_id": 1,
                    "merchant": f"店{index}",
                    "item": f"菜{index}",
                    "date": same_day,
                }
            )
    _seed_transactions(session_factory, rows)

    assert [item["name"] for item in _fetch(test_client, holder)["merchants_by_category"]["餐饮"]] == [
        "店1",
        "店2",
        "店3",
        "店4",
        "店5",
        "店6",
    ]
    limited = _fetch(test_client, holder, per_category=2)
    assert [item["name"] for item in limited["items_by_category"]["餐饮"]] == ["菜1", "菜2"]

    capped = _fetch(test_client, holder, per_category=20)
    assert len(capped["merchants_by_category"]["餐饮"]) == 6
    assert len(capped["items_by_category"]["餐饮"]) == 6


def test_isolated_per_user_and_counts_all_note_kinds(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, holder, session_factory = client
    today = date.today().isoformat()
    _seed_transactions(
        session_factory,
        [
            {
                "user_id": 1,
                "merchant": "我的店",
                "item": "我的菜",
                "note": "旧备注",
                "note_kind": None,
                "date": today,
            },
            {
                "user_id": 1,
                "merchant": "我的店",
                "item": "我的菜",
                "note": "好吃",
                "note_kind": "evaluation",
                "date": today,
            },
            {
                "user_id": 2,
                "merchant": "对方的店",
                "item": "对方的菜",
                "date": today,
            },
        ],
    )

    user1 = _fetch(test_client, holder, 1)
    assert [item["name"] for item in user1["merchants_by_category"]["餐饮"]] == ["我的店"]
    assert [item["name"] for item in user1["items_by_category"]["餐饮"]] == ["我的菜"]
    assert user1["merchants_by_category"]["餐饮"][0]["count"] == 2

    user2 = _fetch(test_client, holder, 2)
    assert [item["name"] for item in user2["merchants_by_category"]["餐饮"]] == ["对方的店"]
    assert [item["name"] for item in user2["items_by_category"]["餐饮"]] == ["对方的菜"]
