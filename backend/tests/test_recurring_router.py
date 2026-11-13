from __future__ import annotations

from collections.abc import Generator
from datetime import date, timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401  确保模型注册进 Base.metadata
from app.core.database import Base, get_db
from app.core.security import get_current_user
from app.main import app
from app.models.enums import TransactionType
from app.models.recurring import RecurringRule
from app.models.transaction import Transaction
from app.models.user import User
from app.services.recurring_dates import beijing_today


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


def _payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "amount": "3200.00",
        "type": "expense",
        "category": "居住",
        "note": "房租",
        "freq": "monthly",
        "start_date": "2099-01-31",
    }
    payload.update(overrides)
    return payload


def _create(test_client: TestClient, **overrides: object) -> dict:
    response = test_client.post("/recurring", json=_payload(**overrides))
    assert response.status_code == 200, response.text
    return response.json()["data"]


def _make_rule(user_id: int, **overrides: object) -> RecurringRule:
    values: dict[str, object] = {
        "user_id": user_id,
        "amount": Decimal("10.00"),
        "type": TransactionType.EXPENSE,
        "category": "居住",
        "note": None,
        "freq": "monthly",
        "start_date": date(2099, 1, 1),
        "next_run_date": date(2099, 1, 1),
        "enabled": True,
    }
    values.update(overrides)
    return RecurringRule(**values)


def test_create_rule_response_contract(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, _session_factory = client
    data = _create(test_client)

    assert set(data) == {
        "id",
        "amount",
        "type",
        "category",
        "note",
        "freq",
        "start_date",
        "next_run_date",
        "enabled",
        "last_generated_date",
        "created_at",
    }
    assert data["amount"] == 3200.0
    assert data["type"] == "expense"
    assert data["category"] == "居住"
    assert data["note"] == "房租"
    assert data["freq"] == "monthly"
    assert data["start_date"] == "2099-01-31"
    assert data["next_run_date"] == "2099-01-31"
    assert data["enabled"] is True
    assert data["last_generated_date"] is None
    assert data["created_at"]


def test_create_with_past_start_does_not_backfill(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, session_factory = client
    data = _create(test_client, freq="daily", start_date="2020-01-01")
    # 创建时立即补今天这一笔，但不回溯 2020 年以来的历史。
    assert data["next_run_date"] == (beijing_today() + timedelta(days=1)).isoformat()

    db = session_factory()
    try:
        rows = list(db.scalars(select(Transaction)).all())
        assert len(rows) == 1
        assert rows[0].date == beijing_today()
        assert rows[0].recurring_rule_id == data["id"]
    finally:
        db.close()


def test_list_orders_by_enabled_then_next_run(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, _session_factory = client
    late = _create(test_client, start_date="2099-03-01")
    early = _create(test_client, start_date="2099-02-01")
    disabled = _create(test_client, start_date="2099-01-01")

    paused = test_client.patch(f"/recurring/{disabled['id']}", json={"enabled": False})
    assert paused.status_code == 200

    response = test_client.get("/recurring")
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert [item["id"] for item in body["data"]] == [
        early["id"],
        late["id"],
        disabled["id"],
    ]


@pytest.mark.parametrize(
    "overrides",
    [
        {"amount": "0"},
        {"amount": "-1"},
        {"category": ""},
        {"category": "一二三四五六七八九十一"},
        {"note": "x" * 256},
        {"freq": "biweekly"},
        {"start_date": "not-a-date"},
        {"type": "transfer"},
    ],
)
def test_create_validation(
    client: tuple[TestClient, dict[str, User], sessionmaker],
    overrides: dict[str, object],
) -> None:
    test_client, _holder, _session_factory = client
    response = test_client.post("/recurring", json=_payload(**overrides))
    assert response.status_code == 422


def test_create_rejects_more_than_50_rules(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, session_factory = client
    db = session_factory()
    try:
        db.add_all([_make_rule(user_id=1) for _ in range(50)])
        db.commit()
    finally:
        db.close()

    response = test_client.post("/recurring", json=_payload())
    assert response.status_code == 400
    assert response.json()["message"] == "循环规则最多 50 条"


def test_other_users_rules_are_hidden_and_return_404(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, holder, _session_factory = client
    rule = _create(test_client)

    holder["user"] = User(
        id=2,
        username="bob",
        nickname="Bob",
        password_hash="unused",
        reg_invite_code="IJKLMNOP",
    )

    listing = test_client.get("/recurring")
    assert listing.status_code == 200
    assert listing.json()["data"] == []

    for method, kwargs in (
        ("patch", {"json": {"amount": "1.00"}}),
        ("put", {"json": {"amount": "1.00"}}),
        ("delete", {}),
    ):
        response = getattr(test_client, method)(f"/recurring/{rule['id']}", **kwargs)
        assert response.status_code == 404
        assert response.json()["message"] == "循环规则不存在"


def test_patch_amount_keeps_next_run_date(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, _session_factory = client
    rule = _create(test_client)

    response = test_client.patch(f"/recurring/{rule['id']}", json={"amount": "99.50"})
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["amount"] == 99.5
    assert data["next_run_date"] == "2099-01-31"


def test_patch_freq_recalculates_next_run_date(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, session_factory = client
    rule = _create(test_client, freq="monthly", start_date="2020-01-15")

    response = test_client.patch(f"/recurring/{rule['id']}", json={"freq": "daily"})
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["freq"] == "daily"
    # 改成每天后，今天这一笔立即补落，下期是明天。
    assert data["next_run_date"] == (beijing_today() + timedelta(days=1)).isoformat()

    db = session_factory()
    try:
        rows = list(db.scalars(select(Transaction)).all())
        assert len(rows) == 1
        assert rows[0].date == beijing_today()
    finally:
        db.close()


def test_patch_enable_restarts_from_next_due_date(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, session_factory = client
    rule = _create(test_client, freq="monthly", start_date="2020-01-01")

    paused = test_client.patch(f"/recurring/{rule['id']}", json={"enabled": False})
    assert paused.status_code == 200

    # 模拟暂停期间已经错过很多到期日。
    db = session_factory()
    try:
        stored = db.get(RecurringRule, rule["id"])
        assert stored is not None
        stored.next_run_date = date(2020, 1, 1)
        db.commit()
    finally:
        db.close()

    resumed = test_client.patch(f"/recurring/{rule['id']}", json={"enabled": True})
    assert resumed.status_code == 200
    data = resumed.json()["data"]
    assert data["enabled"] is True
    assert data["next_run_date"] >= date.today().isoformat()
    assert data["next_run_date"] != "2020-01-01"


def test_patch_rejects_empty_and_null_required_fields(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, _session_factory = client
    rule = _create(test_client)

    empty = test_client.patch(f"/recurring/{rule['id']}", json={})
    assert empty.status_code == 422

    null_amount = test_client.patch(f"/recurring/{rule['id']}", json={"amount": None})
    assert null_amount.status_code == 422


def test_put_alias_updates_rule(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, _session_factory = client
    rule = _create(test_client)

    response = test_client.put(f"/recurring/{rule['id']}", json={"note": "新备注"})
    assert response.status_code == 200
    assert response.json()["data"]["note"] == "新备注"


def test_delete_keeps_generated_transactions_and_nulls_rule_id(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, session_factory = client
    rule = _create(test_client)

    db = session_factory()
    try:
        transaction = Transaction(
            user_id=1,
            amount=Decimal("3200.00"),
            type=TransactionType.EXPENSE,
            category="居住",
            note="房租",
            date=date(2099, 1, 31),
            recurring_rule_id=rule["id"],
        )
        db.add(transaction)
        db.commit()
        transaction_id = transaction.id
    finally:
        db.close()

    response = test_client.delete(f"/recurring/{rule['id']}")
    assert response.status_code == 200
    body = response.json()
    assert body["data"] is None
    assert body["message"] == "循环规则已删除"

    db = session_factory()
    try:
        kept = db.get(Transaction, transaction_id)
        assert kept is not None
        assert kept.recurring_rule_id is None
        assert db.scalar(select(RecurringRule.id).where(RecurringRule.id == rule["id"])) is None
    finally:
        db.close()
