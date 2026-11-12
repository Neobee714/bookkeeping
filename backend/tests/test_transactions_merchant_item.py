from __future__ import annotations

from collections.abc import Generator
from datetime import date
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401  确保新模型注册进 Base.metadata
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


def _payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "amount": "32.50",
        "type": "expense",
        "category": "餐饮",
        "date": "2026-10-23",
    }
    payload.update(overrides)
    return payload


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


def _stored(session_factory: sessionmaker) -> list[Transaction]:
    db = session_factory()
    try:
        return list(db.scalars(select(Transaction).order_by(Transaction.id.asc())).all())
    finally:
        db.close()


# --- 创建 ------------------------------------------------------------------


def test_create_with_all_three_fields_trims_and_marks_evaluation(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, session_factory = client

    response = test_client.post(
        "/transactions",
        json=_payload(merchant=" 和府捞面 ", item=" 面 ", note=" 有点咸 "),
    )

    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["merchant"] == "和府捞面"
    assert data["item"] == "面"
    assert data["note"] == "有点咸"
    assert data["note_kind"] == "evaluation"

    rows = _stored(session_factory)
    assert len(rows) == 1
    assert rows[0].merchant == "和府捞面"
    assert rows[0].item == "面"
    assert rows[0].note == "有点咸"
    assert rows[0].note_kind == "evaluation"


def test_create_without_note_leaves_note_kind_null(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, session_factory = client

    response = test_client.post(
        "/transactions",
        json=_payload(merchant="麦当劳", item="汉堡"),
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["merchant"] == "麦当劳"
    assert data["item"] == "汉堡"
    assert data["note"] is None
    assert data["note_kind"] is None

    rows = _stored(session_factory)
    assert rows[0].note_kind is None


def test_create_blank_optional_fields_become_null(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, session_factory = client

    response = test_client.post(
        "/transactions",
        json=_payload(merchant="   ", item="", note="   "),
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["merchant"] is None
    assert data["item"] is None
    assert data["note"] is None
    assert data["note_kind"] is None

    rows = _stored(session_factory)
    assert rows[0].merchant is None
    assert rows[0].item is None
    assert rows[0].note is None


def test_create_rejects_overlong_fields(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, _session_factory = client

    assert (
        test_client.post("/transactions", json=_payload(merchant="商" * 51)).status_code
        == 422
    )
    assert (
        test_client.post("/transactions", json=_payload(item="菜" * 51)).status_code
        == 422
    )
    assert (
        test_client.post("/transactions", json=_payload(note="评" * 256)).status_code
        == 422
    )


# --- 更新 ------------------------------------------------------------------


def test_update_sets_and_clears_merchant_item(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, _session_factory = client
    created = test_client.post("/transactions", json=_payload()).json()["data"]

    updated = test_client.put(
        f"/transactions/{created['id']}",
        json={"merchant": " 肯德基 ", "item": " 炸鸡 "},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["data"]["merchant"] == "肯德基"
    assert updated.json()["data"]["item"] == "炸鸡"
    assert updated.json()["data"]["note_kind"] is None

    cleared = test_client.put(
        f"/transactions/{created['id']}",
        json={"merchant": None, "item": "  "},
    )
    assert cleared.status_code == 200
    assert cleared.json()["data"]["merchant"] is None
    assert cleared.json()["data"]["item"] is None


def test_update_note_syncs_note_kind(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, _session_factory = client
    created = test_client.post("/transactions", json=_payload()).json()["data"]
    assert created["note_kind"] is None

    with_note = test_client.put(
        f"/transactions/{created['id']}", json={"note": " 好吃 "}
    )
    assert with_note.status_code == 200
    assert with_note.json()["data"]["note"] == "好吃"
    assert with_note.json()["data"]["note_kind"] == "evaluation"

    blank_note = test_client.put(
        f"/transactions/{created['id']}", json={"note": "   "}
    )
    assert blank_note.status_code == 200
    assert blank_note.json()["data"]["note"] is None
    assert blank_note.json()["data"]["note_kind"] is None

    test_client.put(f"/transactions/{created['id']}", json={"note": "不错"})
    cleared = test_client.put(
        f"/transactions/{created['id']}", json={"note": None}
    )
    assert cleared.status_code == 200
    assert cleared.json()["data"]["note"] is None
    assert cleared.json()["data"]["note_kind"] is None


def test_update_merchant_only_keeps_note_kind(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, _session_factory = client
    created = test_client.post(
        "/transactions", json=_payload(note="有点咸")
    ).json()["data"]
    assert created["note_kind"] == "evaluation"

    updated = test_client.put(
        f"/transactions/{created['id']}", json={"merchant": "和府捞面"}
    )

    assert updated.status_code == 200
    data = updated.json()["data"]
    assert data["merchant"] == "和府捞面"
    assert data["note"] == "有点咸"
    assert data["note_kind"] == "evaluation"


def test_update_empty_payload_is_rejected(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, _session_factory = client
    created = test_client.post("/transactions", json=_payload()).json()["data"]

    response = test_client.put(f"/transactions/{created['id']}", json={})

    assert response.status_code == 422


@pytest.mark.parametrize("field", ["amount", "type", "category", "date"])
def test_update_rejects_null_non_nullable_fields(
    client: tuple[TestClient, dict[str, User], sessionmaker],
    field: str,
) -> None:
    test_client, _holder, _session_factory = client
    created = test_client.post("/transactions", json=_payload()).json()["data"]

    response = test_client.put(
        f"/transactions/{created['id']}", json={field: None}
    )

    assert response.status_code == 422


def test_update_cannot_touch_other_users_transaction(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, session_factory = client
    _seed_transactions(
        session_factory,
        [
            {
                "user_id": 2,
                "amount": 10,
                "note": "对方的店",
                "merchant": None,
                "date": "2026-10-01",
            }
        ],
    )
    transaction_id = _stored(session_factory)[0].id

    response = test_client.put(
        f"/transactions/{transaction_id}", json={"merchant": "我的店"}
    )

    assert response.status_code == 403
    rows = _stored(session_factory)
    assert rows[0].merchant is None
    assert rows[0].note == "对方的店"


# --- 序列化 / 隔离 ----------------------------------------------------------


def test_list_serializes_merchant_item_note_kind(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, session_factory = client
    _seed_transactions(
        session_factory,
        [
            {
                "user_id": 1,
                "amount": 20,
                "merchant": "和府捞面",
                "item": "面",
                "note": "有点咸",
                "note_kind": "evaluation",
                "date": "2026-10-02",
            },
            {
                "user_id": 1,
                "amount": 30,
                "note": "旧备注",
                "note_kind": None,
                "date": "2026-10-01",
            },
        ],
    )

    response = test_client.get("/transactions", params={"month": "2026-10"})

    assert response.status_code == 200
    items = response.json()["data"]
    assert [item["note_kind"] for item in items] == ["evaluation", None]
    assert items[0]["merchant"] == "和府捞面"
    assert items[0]["item"] == "面"
    assert items[1]["merchant"] is None
    assert items[1]["item"] is None


def test_list_only_returns_own_transactions(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, session_factory = client
    _seed_transactions(
        session_factory,
        [
            {"user_id": 1, "amount": 1, "merchant": "我的", "date": "2026-10-01"},
            {"user_id": 2, "amount": 2, "merchant": "对方的", "date": "2026-10-02"},
        ],
    )

    items = test_client.get("/transactions", params={"month": "2026-10"}).json()["data"]

    assert [item["merchant"] for item in items] == ["我的"]


# --- CSV 导入 ---------------------------------------------------------------


def _import_csv(test_client: TestClient, text: str) -> dict:
    response = test_client.post(
        "/transactions/import",
        files={"file": ("transactions.csv", text.encode("gbk"), "text/csv")},
    )
    assert response.status_code == 200, response.text
    return response.json()["data"]


def test_import_reads_merchant_and_item_columns(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, session_factory = client
    csv_text = (
        "日期,类型,分类,金额,备注,商家,项目\n"
        "2026年10月01日,支出,餐饮,32.50,有点咸,和府捞面,面\n"
        "2026年10月02日,支出,餐饮,20.00,,,\n"
    )

    data = _import_csv(test_client, csv_text)

    assert data["imported"] == 2
    rows = _stored(session_factory)
    assert rows[0].merchant == "和府捞面"
    assert rows[0].item == "面"
    assert rows[0].note_kind == "evaluation"
    assert rows[1].merchant is None
    assert rows[1].item is None
    assert rows[1].note_kind is None


def test_import_without_optional_columns_keeps_legacy_shape(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, session_factory = client
    csv_text = (
        "日期,类型,分类,金额,备注\n"
        "2026年10月01日,支出,餐饮,32.50,好吃\n"
    )

    data = _import_csv(test_client, csv_text)

    assert data["imported"] == 1
    rows = _stored(session_factory)
    assert rows[0].note == "好吃"
    assert rows[0].note_kind == "evaluation"
    assert rows[0].merchant is None
    assert rows[0].item is None


def test_import_header_without_note_column_keeps_note_empty(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, session_factory = client
    csv_text = (
        "日期,类型,分类,金额,商家,项目\n"
        "2026年10月01日,支出,餐饮,32.50,和府捞面,面\n"
    )

    data = _import_csv(test_client, csv_text)

    assert data["imported"] == 1
    rows = _stored(session_factory)
    assert rows[0].merchant == "和府捞面"
    assert rows[0].item == "面"
    assert rows[0].note is None
    assert rows[0].note_kind is None


def test_import_without_header_still_works(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, session_factory = client
    csv_text = "2026年10月01日,支出,餐饮,32.50,旧备注\n"

    data = _import_csv(test_client, csv_text)

    assert data["imported"] == 1
    rows = _stored(session_factory)
    assert rows[0].note == "旧备注"
    assert rows[0].note_kind == "evaluation"
