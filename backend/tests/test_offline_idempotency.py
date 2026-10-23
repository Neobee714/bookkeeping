from __future__ import annotations

from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401  确保模型注册进 Base.metadata
from app.core.database import Base, get_db
from app.core.security import get_current_user
from app.main import app
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


def _payload(**overrides: object) -> dict:
    payload: dict[str, object] = {
        "amount": "12.50",
        "type": "expense",
        "category": "餐饮",
        "note": "离线记一笔",
        "date": "2026-10-23",
    }
    payload.update(overrides)
    return payload


def _count_rows(session_factory: sessionmaker) -> int:
    db = session_factory()
    try:
        return int(db.scalar(select(func.count(Transaction.id))) or 0)
    finally:
        db.close()


def test_same_client_id_returns_existing_row(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, session_factory = client
    first = test_client.post(
        "/transactions",
        json=_payload(client_id="offline-abc-123"),
    )
    assert first.status_code == 200
    first_data = first.json()["data"]
    assert first_data["client_id"] == "offline-abc-123"
    assert first_data["amount"] == 12.5

    # 重试时内容即便不同，也应返回第一次落库的记录，而不是再插一条。
    second = test_client.post(
        "/transactions",
        json=_payload(client_id="offline-abc-123", amount="99.00"),
    )
    assert second.status_code == 200
    second_data = second.json()["data"]

    assert second_data["id"] == first_data["id"]
    assert second_data["amount"] == 12.5
    assert _count_rows(session_factory) == 1


def test_same_client_id_is_scoped_per_user(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, holder, session_factory = client
    first = test_client.post(
        "/transactions",
        json=_payload(client_id="offline-shared-id"),
    )
    assert first.status_code == 200

    holder["user"] = User(
        id=2,
        username="bob",
        nickname="Bob",
        password_hash="unused",
        reg_invite_code="IJKLMNOP",
    )
    second = test_client.post(
        "/transactions",
        json=_payload(client_id="offline-shared-id"),
    )
    assert second.status_code == 200
    assert second.json()["data"]["id"] != first.json()["data"]["id"]
    assert _count_rows(session_factory) == 2


def test_without_client_id_keeps_legacy_behavior(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, session_factory = client
    first = test_client.post("/transactions", json=_payload())
    second = test_client.post("/transactions", json=_payload())

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["data"]["id"] != second.json()["data"]["id"]
    assert _count_rows(session_factory) == 2


def test_client_id_too_short_is_rejected(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, _session_factory = client
    response = test_client.post("/transactions", json=_payload(client_id="short"))

    assert response.status_code == 422
