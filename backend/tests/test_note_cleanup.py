from __future__ import annotations

from collections.abc import Generator
from datetime import date
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.core.database import Base, get_db
from app.core.security import get_current_user
from app.main import app
from app.models.enums import TransactionType
from app.models.transaction import Transaction
from app.models.user import User
from app.services.merchant_stats import suggest_note_kind


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


def _seed(session_factory: sessionmaker, rows: list[dict]) -> None:
    db = session_factory()
    try:
        for row in rows:
            db.add(
                Transaction(
                    user_id=row.get("user_id", 1),
                    amount=Decimal(str(row.get("amount", 10))),
                    type=TransactionType(row.get("type", "expense")),
                    category=row.get("category", "餐饮"),
                    note=row.get("note"),
                    merchant=row.get("merchant"),
                    item=row.get("item"),
                    note_kind=row.get("note_kind"),
                    date=date.fromisoformat(row.get("date", "2026-08-01")),
                )
            )
        db.commit()
    finally:
        db.close()


def _rows(session_factory: sessionmaker) -> list[Transaction]:
    db = session_factory()
    try:
        return list(db.scalars(select(Transaction).order_by(Transaction.id.asc())).all())
    finally:
        db.close()


def _candidates(test_client: TestClient, **params: int) -> dict:
    response = test_client.get("/transactions/note-candidates", params=params)
    assert response.status_code == 200, response.text
    return response.json()["data"]


def _reclassify(test_client: TestClient, **payload: object) -> dict:
    response = test_client.post("/transactions/notes/reclassify", json=payload)
    assert response.status_code == 200, response.text
    return response.json()["data"]


# --- 候选 ------------------------------------------------------------------


def test_candidates_only_include_unclassified_non_empty_notes(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, session_factory = client
    _seed(
        session_factory,
        [
            {"amount": 30, "note": "小馆", "note_kind": None, "date": "2026-08-01"},
            {"amount": 40, "note": " 小馆 ", "note_kind": None, "date": "2026-08-05"},
            {
                "amount": 50,
                "note": "有点咸",
                "note_kind": "evaluation",
                "date": "2026-08-02",
            },
            {"amount": 60, "note": None, "date": "2026-08-03"},
            {"amount": 70, "note": "", "date": "2026-08-04"},
            {"amount": 80, "note": "   ", "date": "2026-08-06"},
            {
                "user_id": 2,
                "amount": 90,
                "note": "别人的旧备注",
                "note_kind": None,
                "date": "2026-08-07",
            },
        ],
    )

    data = _candidates(test_client)

    assert data["total"] == 1
    assert data["items"] == [
        {
            "note": "小馆",
            "count": 2,
            "total_amount": 70.0,
            "last_used": "2026-08-05",
            "suggestion": "merchant",
        }
    ]


def test_candidates_sort_by_count_then_amount_and_respect_limit(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, session_factory = client
    _seed(
        session_factory,
        [
            {"amount": 10, "note": "甲", "date": "2026-08-01"},
            {"amount": 10, "note": "甲", "date": "2026-08-02"},
            {"amount": 100, "note": "乙", "date": "2026-08-03"},
            {"amount": 100, "note": "乙", "date": "2026-08-04"},
            {"amount": 1, "note": "丙", "date": "2026-08-05"},
            {"amount": 1, "note": "丙", "date": "2026-08-06"},
            {"amount": 1, "note": "丙", "date": "2026-08-07"},
        ],
    )

    data = _candidates(test_client)

    assert data["total"] == 3
    assert [item["note"] for item in data["items"]] == ["丙", "乙", "甲"]

    limited = _candidates(test_client, limit=2)
    assert limited["total"] == 3
    assert [item["note"] for item in limited["items"]] == ["丙", "乙"]

    assert test_client.get("/transactions/note-candidates", params={"limit": 0}).status_code == 422
    assert test_client.get("/transactions/note-candidates", params={"limit": 201}).status_code == 422


@pytest.mark.parametrize(
    ("note", "expected"),
    [
        ("小馆", "merchant"),
        ("牛肉面", "item"),
        ("面馆", "both"),
        ("有点咸", "evaluation"),
        ("环境不错", "evaluation"),
        ("随便", None),
        ("咖啡", "both"),
        ("和府捞面", None),
        ("  ", None),
        (None, None),
    ],
)
def test_suggestion_keywords(note: str | None, expected: str | None) -> None:
    assert suggest_note_kind(note) == expected


# --- 整理动作 ---------------------------------------------------------------


def test_action_merchant_clears_note_and_keeps_other_fields(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, session_factory = client
    _seed(
        session_factory,
        [
            {
                "user_id": 1,
                "amount": 32,
                "category": "餐饮",
                "note": "和府捞面",
                "note_kind": None,
                "date": "2026-08-01",
            },
            {
                "user_id": 1,
                "amount": 64,
                "category": "餐饮",
                "note": " 和府捞面 ",
                "note_kind": None,
                "date": "2026-08-02",
            },
            {
                "user_id": 1,
                "amount": 10,
                "category": "餐饮",
                "note": "有点咸",
                "note_kind": "evaluation",
                "date": "2026-08-03",
            },
            {
                "user_id": 2,
                "amount": 99,
                "category": "餐饮",
                "note": "和府捞面",
                "note_kind": None,
                "date": "2026-08-04",
            },
        ],
    )

    data = _reclassify(test_client, note="和府捞面", action="merchant", merchant="和府捞面")

    assert data["affected"] == 2
    assert data["batch_id"] is not None
    rows = _rows(session_factory)
    for row in rows[:2]:
        assert row.merchant == "和府捞面"
        assert row.note is None
        assert row.note_kind is None
        assert row.category == "餐饮"
        assert row.amount in (Decimal("32.00"), Decimal("64.00"))
        assert row.date in (date(2026, 8, 1), date(2026, 8, 2))

    assert rows[2].note == "有点咸"
    assert rows[2].note_kind == "evaluation"
    assert rows[2].merchant is None

    # 伴侣的同名旧备注不受影响
    assert rows[3].user_id == 2
    assert rows[3].note == "和府捞面"
    assert rows[3].merchant is None

    # 整理后候选清空
    assert _candidates(test_client)["total"] == 0


def test_action_item_writes_item_and_clears_note(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, session_factory = client
    _seed(
        session_factory,
        [
            {"amount": 20, "note": "牛肉面", "note_kind": None},
            {"amount": 30, "note": "牛肉面", "note_kind": None},
        ],
    )

    data = _reclassify(test_client, note="牛肉面", action="item", item="面")

    assert data["affected"] == 2
    assert data["batch_id"] is not None
    rows = _rows(session_factory)
    assert [row.item for row in rows] == ["面", "面"]
    assert [row.merchant for row in rows] == [None, None]
    assert [row.note for row in rows] == [None, None]
    assert [row.note_kind for row in rows] == [None, None]


def test_action_both_writes_merchant_and_item(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, session_factory = client
    _seed(
        session_factory,
        [
            {"amount": 20, "note": "面馆", "note_kind": None},
            {"amount": 30, "note": " 面馆 ", "note_kind": None},
        ],
    )

    data = _reclassify(
        test_client, note="面馆", action="both", merchant="张记面馆", item="面"
    )

    assert data["affected"] == 2
    assert data["batch_id"] is not None
    rows = _rows(session_factory)
    assert [row.merchant for row in rows] == ["张记面馆", "张记面馆"]
    assert [row.item for row in rows] == ["面", "面"]
    assert [row.note for row in rows] == [None, None]
    assert [row.note_kind for row in rows] == [None, None]


def test_action_evaluation_keeps_note_and_marks_kind(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, session_factory = client
    _seed(
        session_factory,
        [
            {"amount": 20, "note": "有点咸", "note_kind": None},
            {"amount": 30, "note": "有点咸", "note_kind": None},
        ],
    )

    data = _reclassify(test_client, note="有点咸", action="evaluation")

    assert data["affected"] == 2
    assert data["batch_id"] is not None
    rows = _rows(session_factory)
    assert [row.note for row in rows] == ["有点咸", "有点咸"]
    assert [row.note_kind for row in rows] == ["evaluation", "evaluation"]
    assert [row.merchant for row in rows] == [None, None]
    assert [row.item for row in rows] == [None, None]
    assert _candidates(test_client)["total"] == 0


def test_action_skip_changes_nothing(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, session_factory = client
    _seed(
        session_factory,
        [{"amount": 20, "note": "小馆", "note_kind": None}],
    )

    data = _reclassify(test_client, note="小馆", action="skip")

    assert data["affected"] == 0
    assert data["batch_id"] is None
    rows = _rows(session_factory)
    assert rows[0].note == "小馆"
    assert rows[0].note_kind is None
    assert rows[0].merchant is None
    assert _candidates(test_client)["total"] == 1


def test_only_null_note_kind_rows_are_updated(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, session_factory = client
    _seed(
        session_factory,
        [
            {"amount": 10, "note": "小馆", "note_kind": None},
            {"amount": 20, "note": "小馆", "note_kind": "evaluation"},
        ],
    )

    data = _reclassify(test_client, note="小馆", action="merchant", merchant="小馆")

    assert data["affected"] == 1
    assert data["batch_id"] is not None
    rows = _rows(session_factory)
    assert rows[0].merchant == "小馆"
    assert rows[0].note is None
    assert rows[1].note == "小馆"
    assert rows[1].note_kind == "evaluation"
    assert rows[1].merchant is None


@pytest.mark.parametrize(
    "payload",
    [
        {"note": "小馆", "action": "merchant"},
        {"note": "小馆", "action": "item"},
        {"note": "小馆", "action": "both", "merchant": "小馆"},
        {"note": "小馆", "action": "both", "item": "面"},
        {"note": "小馆", "action": "unknown"},
        {"note": "   ", "action": "evaluation"},
        {"note": "小馆", "action": "merchant", "merchant": "商" * 51},
    ],
)
def test_reclassify_validation(
    client: tuple[TestClient, dict[str, User], sessionmaker],
    payload: dict[str, object],
) -> None:
    test_client, _holder, _session_factory = client

    response = test_client.post("/transactions/notes/reclassify", json=payload)

    assert response.status_code == 422


# --- 撤销 -------------------------------------------------------------------


def _undo(test_client: TestClient, batch_id: int | None = None) -> dict:
    payload = {} if batch_id is None else {"batch_id": batch_id}
    response = test_client.post("/transactions/notes/undo", json=payload)
    assert response.status_code == 200, response.text
    return response.json()["data"]


def test_undo_restores_original_note_and_clears_new_fields(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, session_factory = client
    _seed(
        session_factory,
        [
            {"amount": 32, "note": "和府捞面", "note_kind": None},
            {"amount": 64, "note": " 和府捞面 ", "note_kind": None},
            {"amount": 10, "note": "有点咸", "note_kind": "evaluation"},
        ],
    )

    result = _reclassify(
        test_client, note="和府捞面", action="merchant", merchant="和府捞面"
    )
    assert result["affected"] == 2
    batch_id = result["batch_id"]
    assert batch_id is not None

    candidates = _candidates(test_client)
    assert candidates["total"] == 0
    assert candidates["last_cleanup"] == {
        "batch_id": batch_id,
        "created_at": candidates["last_cleanup"]["created_at"],
        "affected_count": 2,
    }

    undone = _undo(test_client, batch_id)
    assert undone == {"batch_id": batch_id, "restored": 2, "skipped": 0}

    rows = _rows(session_factory)
    assert [row.note for row in rows[:2]] == ["和府捞面", " 和府捞面 "]
    assert [row.merchant for row in rows[:2]] == [None, None]
    assert [row.note_kind for row in rows[:2]] == [None, None]
    assert rows[2].note == "有点咸"
    assert rows[2].note_kind == "evaluation"

    candidates = _candidates(test_client)
    assert candidates["total"] == 1
    assert candidates["last_cleanup"] is None


def test_same_batch_key_groups_multiple_reclassify_calls(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, session_factory = client
    _seed(
        session_factory,
        [
            {"amount": 20, "note": "小馆", "note_kind": None},
            {"amount": 20, "note": "小馆", "note_kind": None},
            {"amount": 30, "note": "牛肉面", "note_kind": None},
            {"amount": 30, "note": "牛肉面", "note_kind": None},
        ],
    )

    first = _reclassify(
        test_client,
        note="小馆",
        action="merchant",
        merchant="小馆",
        batch_key="cleanup-save-1",
    )
    second = _reclassify(
        test_client,
        note="牛肉面",
        action="item",
        item="面",
        batch_key="cleanup-save-1",
    )
    assert first["batch_id"] == second["batch_id"]

    candidates = _candidates(test_client)
    assert candidates["last_cleanup"]["affected_count"] == 4

    undone = _undo(test_client)
    assert undone == {
        "batch_id": first["batch_id"],
        "restored": 4,
        "skipped": 0,
    }
    rows = _rows(session_factory)
    assert [row.note for row in rows] == ["小馆", "小馆", "牛肉面", "牛肉面"]
    assert [row.merchant for row in rows] == [None, None, None, None]
    assert [row.item for row in rows] == [None, None, None, None]


def test_undo_skips_rows_edited_after_cleanup(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, session_factory = client
    _seed(
        session_factory,
        [
            {"amount": 20, "note": "小馆", "note_kind": None},
            {"amount": 30, "note": "小馆", "note_kind": None},
        ],
    )
    result = _reclassify(test_client, note="小馆", action="merchant", merchant="小馆")

    db = session_factory()
    try:
        first = db.scalars(select(Transaction).order_by(Transaction.id.asc())).first()
        assert first is not None
        first.note = "后来改的评价"
        first.note_kind = "evaluation"
        db.commit()
    finally:
        db.close()

    undone = _undo(test_client, result["batch_id"])
    assert undone["restored"] == 1
    assert undone["skipped"] == 1

    rows = _rows(session_factory)
    assert rows[0].note == "后来改的评价"
    assert rows[0].note_kind == "evaluation"
    assert rows[0].merchant == "小馆"
    assert rows[1].note == "小馆"
    assert rows[1].merchant is None
    assert rows[1].note_kind is None


def test_undo_without_batch_or_after_undo_is_rejected(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, session_factory = client
    _seed(
        session_factory,
        [{"amount": 20, "note": "小馆", "note_kind": None}],
    )

    assert test_client.post("/transactions/notes/undo", json={}).status_code == 404

    result = _reclassify(test_client, note="小馆", action="merchant", merchant="小馆")
    _undo(test_client, result["batch_id"])
    response = test_client.post(
        "/transactions/notes/undo", json={"batch_id": result["batch_id"]}
    )
    assert response.status_code == 400
    assert "已经撤销" in response.text
