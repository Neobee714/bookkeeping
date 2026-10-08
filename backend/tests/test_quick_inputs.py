from __future__ import annotations

from collections.abc import Generator
from datetime import date, datetime, timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401  确保新模型注册进 Base.metadata
from app.core.database import Base, get_db
from app.core.security import get_current_user
from app.main import app
from app.models.enums import TransactionType
from app.models.note_preset import UserNotePreset
from app.models.transaction import Transaction
from app.models.user import User

# 同一秒内录入的多笔账单在 sqlite 下 created_at 可能相同，
# 用微秒递增加保证「谁更后录入」是确定的。
_SEED_BASE_TIME = datetime(2026, 1, 1, 0, 0, 0)
_seed_sequence = 0


def _next_created_at() -> datetime:
    global _seed_sequence
    _seed_sequence += 1
    return _SEED_BASE_TIME + timedelta(microseconds=_seed_sequence)


def _seed_transactions(session_factory: sessionmaker, rows: list[dict]) -> None:
    db = session_factory()
    try:
        for row in rows:
            db.add(
                Transaction(
                    user_id=row["user_id"],
                    amount=Decimal(str(row["amount"])),
                    type=TransactionType(row.get("type", "expense")),
                    category=row.get("category", "其他"),
                    note=row.get("note"),
                    date=date.fromisoformat(row["date"]),
                    created_at=row.get("created_at") or _next_created_at(),
                )
            )
        db.commit()
    finally:
        db.close()


def _seed_presets(session_factory: sessionmaker, rows: list[dict]) -> None:
    db = session_factory()
    try:
        for row in rows:
            db.add(
                UserNotePreset(
                    user_id=row["user_id"],
                    note=row["note"],
                    kind=row["kind"],
                    created_at=row.get("created_at") or _next_created_at(),
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


def _fetch_quick_inputs(
    test_client: TestClient,
    holder: dict[str, User],
    user_id: int,
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
    assert response.status_code == 200
    return response.json()["data"]


# --- last_date -------------------------------------------------------------


def test_last_date_is_null_without_transactions(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, _session_factory = client

    data = _fetch_quick_inputs(test_client, _holder, 1)

    assert data["last_date"] is None
    assert data["pinned"] == []
    assert data["by_category"] == {}


def test_last_date_returns_newest_entered_transaction(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, holder, session_factory = client
    _seed_transactions(
        session_factory,
        [
            {
                "user_id": 1,
                "amount": 10,
                "date": "2026-10-06",
                "created_at": datetime(2026, 10, 6, 9, 0, 0),
            },
            {
                "user_id": 1,
                "amount": 20,
                "date": "2026-09-01",
                "created_at": datetime(2026, 10, 7, 21, 0, 0),
            },
        ],
    )

    data = _fetch_quick_inputs(test_client, holder, 1)

    # 按录入时间取，不是按账单日期取
    assert data["last_date"] == "2026-09-01"


def test_last_date_follows_backfilled_old_dated_transaction(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, holder, session_factory = client
    _seed_transactions(
        session_factory,
        [
            {
                "user_id": 1,
                "amount": 10,
                "date": "2026-10-06",
                "created_at": datetime(2026, 10, 6, 9, 0, 0),
            },
        ],
    )
    assert _fetch_quick_inputs(test_client, holder, 1)["last_date"] == "2026-10-06"

    _seed_transactions(
        session_factory,
        [
            {
                "user_id": 1,
                "amount": 30,
                "date": "2026-09-20",
                "created_at": datetime(2026, 10, 8, 8, 0, 0),
            },
        ],
    )

    assert _fetch_quick_inputs(test_client, holder, 1)["last_date"] == "2026-09-20"


def test_last_date_ignores_other_users_transactions(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, holder, session_factory = client
    _seed_transactions(
        session_factory,
        [
            {
                "user_id": 1,
                "amount": 10,
                "date": "2026-10-06",
                "created_at": datetime(2026, 10, 6, 9, 0, 0),
            },
            {
                "user_id": 2,
                "amount": 99,
                "date": "2026-10-09",
                "created_at": datetime(2026, 10, 9, 9, 0, 0),
            },
        ],
    )

    assert _fetch_quick_inputs(test_client, holder, 1)["last_date"] == "2026-10-06"


# --- by_category -----------------------------------------------------------


def test_by_category_window_boundary_counts_and_threshold(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, holder, session_factory = client
    today = date.today()
    # 窗口 = [today-(days-1), today]，days=90 时含今天共 90 个自然日
    in_window = today - timedelta(days=89)  # 最旧仍计入的一天
    out_of_window = today - timedelta(days=90)  # 刚好越界，不计入
    _seed_transactions(
        session_factory,
        [
            {"user_id": 1, "amount": 1, "category": "餐饮", "note": "早餐", "date": in_window.isoformat()},
            {"user_id": 1, "amount": 1, "category": "餐饮", "note": "早餐", "date": today.isoformat()},
            {
                "user_id": 1,
                "amount": 1,
                "category": "餐饮",
                "note": "隔夜菜",
                "date": out_of_window.isoformat(),
            },
            {
                "user_id": 1,
                "amount": 1,
                "category": "餐饮",
                "note": "隔夜菜",
                "date": (out_of_window - timedelta(days=1)).isoformat(),
            },
            {"user_id": 1, "amount": 1, "category": "交通", "note": "地铁", "date": today.isoformat()},
        ],
    )

    data = _fetch_quick_inputs(test_client, holder, 1)

    # 边界最后一天（today-89）计入，故「早餐」2 次入选；
    # 「隔夜菜」两笔都在窗口外（today-90 及更早），虽有 2 次但被窗口过滤；
    # 只出现 1 次的「地铁」被 count>=2 阈值过滤
    assert data["by_category"] == {
        "餐饮": [
            {"note": "早餐", "count": 2, "last_used": today.isoformat()},
        ]
    }


def test_by_category_custom_window_parameter(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, holder, session_factory = client
    today = date.today()
    _seed_transactions(
        session_factory,
        [
            {
                "user_id": 1,
                "amount": 1,
                "category": "餐饮",
                "note": "早餐",
                "date": (today - timedelta(days=10)).isoformat(),
            },
            {
                "user_id": 1,
                "amount": 1,
                "category": "餐饮",
                "note": "早餐",
                "date": today.isoformat(),
            },
        ],
    )

    assert _fetch_quick_inputs(test_client, holder, 1, days=7)["by_category"] == {}
    assert _fetch_quick_inputs(test_client, holder, 1, days=30)["by_category"] == {
        "餐饮": [{"note": "早餐", "count": 2, "last_used": today.isoformat()}]
    }


def test_by_category_groups_sorts_and_reports_last_used(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, holder, session_factory = client
    today = date.today()

    def day(offset: int) -> str:
        return (today - timedelta(days=offset)).isoformat()

    _seed_transactions(
        session_factory,
        [
            {"user_id": 1, "amount": 1, "category": "餐饮", "note": "买菜", "date": day(30)},
            {"user_id": 1, "amount": 1, "category": "餐饮", "note": "买菜", "date": day(20)},
            {"user_id": 1, "amount": 1, "category": "餐饮", "note": "买菜", "date": day(10)},
            {"user_id": 1, "amount": 1, "category": "餐饮", "note": "咖啡", "date": day(25)},
            {"user_id": 1, "amount": 1, "category": "餐饮", "note": "咖啡", "date": day(5)},
            {"user_id": 1, "amount": 1, "category": "交通", "note": "地铁", "date": day(15)},
            {"user_id": 1, "amount": 1, "category": "交通", "note": "地铁", "date": day(12)},
        ],
    )

    data = _fetch_quick_inputs(test_client, holder, 1, days=365)

    assert data["by_category"] == {
        "餐饮": [
            {"note": "买菜", "count": 3, "last_used": day(10)},
            {"note": "咖啡", "count": 2, "last_used": day(5)},
        ],
        "交通": [
            {"note": "地铁", "count": 2, "last_used": day(12)},
        ],
    }
    # 最后录入的是「地铁」那一笔（date 更早的买菜 / 咖啡先录）
    assert data["last_date"] == day(12)


def test_by_category_breaks_count_ties_by_most_recent_date(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, holder, session_factory = client
    today = date.today()

    def day(offset: int) -> str:
        return (today - timedelta(days=offset)).isoformat()

    _seed_transactions(
        session_factory,
        [
            {"user_id": 1, "amount": 1, "category": "餐饮", "note": "甲", "date": day(20)},
            {"user_id": 1, "amount": 1, "category": "餐饮", "note": "甲", "date": day(19)},
            {"user_id": 1, "amount": 1, "category": "餐饮", "note": "乙", "date": day(10)},
            {"user_id": 1, "amount": 1, "category": "餐饮", "note": "乙", "date": day(9)},
        ],
    )

    data = _fetch_quick_inputs(test_client, holder, 1, days=365)

    assert [item["note"] for item in data["by_category"]["餐饮"]] == ["乙", "甲"]


def test_by_category_truncates_each_group(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, holder, session_factory = client
    same_day = (date.today() - timedelta(days=5)).isoformat()
    rows: list[dict] = []
    for index in range(1, 9):
        # 用次数递增保证排序确定：c1 最多、c8 最少
        for _ in range(9 - index):
            rows.append(
                {
                    "user_id": 1,
                    "amount": 1,
                    "category": "餐饮",
                    "note": f"c{index}",
                    "date": same_day,
                }
            )
    _seed_transactions(session_factory, rows)

    data = _fetch_quick_inputs(test_client, holder, 1, days=365, per_category=3)

    assert [item["note"] for item in data["by_category"]["餐饮"]] == ["c1", "c2", "c3"]

    default_data = _fetch_quick_inputs(test_client, holder, 1, days=365)
    assert [item["note"] for item in default_data["by_category"]["餐饮"]] == [
        "c1",
        "c2",
        "c3",
        "c4",
        "c5",
        "c6",
    ]


def test_by_category_excludes_blank_notes(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, holder, session_factory = client
    _seed_transactions(
        session_factory,
        [
            {"user_id": 1, "amount": 1, "category": "餐饮", "note": None, "date": "2026-09-01"},
            {"user_id": 1, "amount": 1, "category": "餐饮", "note": None, "date": "2026-09-02"},
            {"user_id": 1, "amount": 1, "category": "餐饮", "note": "", "date": "2026-09-03"},
            {"user_id": 1, "amount": 1, "category": "餐饮", "note": "   ", "date": "2026-09-04"},
            {"user_id": 1, "amount": 1, "category": "餐饮", "note": " 午餐 ", "date": "2026-09-05"},
            {"user_id": 1, "amount": 1, "category": "餐饮", "note": "午餐", "date": "2026-09-06"},
        ],
    )

    data = _fetch_quick_inputs(test_client, holder, 1, days=365)

    assert data["by_category"] == {
        "餐饮": [{"note": "午餐", "count": 2, "last_used": "2026-09-06"}]
    }


def test_by_category_excludes_pinned_and_hidden_notes(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, holder, session_factory = client
    _seed_transactions(
        session_factory,
        [
            {"user_id": 1, "amount": 1, "category": "餐饮", "note": "早餐", "date": "2026-09-01"},
            {"user_id": 1, "amount": 1, "category": "餐饮", "note": "早餐", "date": "2026-09-02"},
            {"user_id": 1, "amount": 1, "category": "餐饮", "note": "香菜", "date": "2026-09-03"},
            {"user_id": 1, "amount": 1, "category": "餐饮", "note": "香菜", "date": "2026-09-04"},
            {"user_id": 1, "amount": 1, "category": "餐饮", "note": "买菜", "date": "2026-09-05"},
            {"user_id": 1, "amount": 1, "category": "餐饮", "note": "买菜", "date": "2026-09-06"},
        ],
    )
    _seed_presets(
        session_factory,
        [
            {"user_id": 1, "note": "早餐", "kind": "pinned"},
            {"user_id": 1, "note": "香菜", "kind": "hidden"},
        ],
    )

    data = _fetch_quick_inputs(test_client, holder, 1, days=365)

    assert [item["note"] for item in data["by_category"]["餐饮"]] == ["买菜"]


def test_quick_inputs_rejects_out_of_range_params(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, _session_factory = client

    assert test_client.get("/transactions/quick-inputs", params={"days": 0}).status_code == 422
    assert test_client.get("/transactions/quick-inputs", params={"days": 366}).status_code == 422
    assert (
        test_client.get("/transactions/quick-inputs", params={"per_category": 0}).status_code == 422
    )
    assert (
        test_client.get("/transactions/quick-inputs", params={"per_category": 21}).status_code == 422
    )
    assert test_client.get("/transactions/quick-inputs", params={"days": 365}).status_code == 200
    assert (
        test_client.get("/transactions/quick-inputs", params={"per_category": 20}).status_code == 200
    )


# --- pinned ----------------------------------------------------------------


def test_pinned_lists_presets_with_usage_and_orders_by_created_at(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, holder, session_factory = client
    today = date.today()
    _seed_transactions(
        session_factory,
        [
            {"user_id": 1, "amount": 1, "category": "餐饮", "note": "早餐", "date": today.isoformat()},
            {
                "user_id": 1,
                "amount": 1,
                "category": "餐饮",
                "note": "早餐",
                "date": (today - timedelta(days=200)).isoformat(),
            },
            {
                "user_id": 1,
                "amount": 1,
                "category": "餐饮",
                "note": "从未用过",
                "date": (today - timedelta(days=400)).isoformat(),
            },
        ],
    )
    _seed_presets(
        session_factory,
        [
            {
                "user_id": 1,
                "note": "早餐",
                "kind": "pinned",
                "created_at": datetime(2026, 9, 1, 10, 0, 0),
            },
            {
                "user_id": 1,
                "note": "从未用过",
                "kind": "pinned",
                "created_at": datetime(2026, 9, 2, 10, 0, 0),
            },
        ],
    )

    data = _fetch_quick_inputs(test_client, holder, 1)

    # 按收藏时间倒序；count/last_used 只统计最近 90 天
    assert data["pinned"] == [
        {"note": "从未用过", "count": 0, "last_used": None},
        {"note": "早餐", "count": 1, "last_used": today.isoformat()},
    ]


def test_hidden_preset_is_not_returned_as_pinned(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, holder, session_factory = client
    _seed_presets(
        session_factory,
        [{"user_id": 1, "note": "香菜", "kind": "hidden"}],
    )

    data = _fetch_quick_inputs(test_client, holder, 1)

    assert data["pinned"] == []


# --- POST /transactions/note-presets --------------------------------------


def test_post_note_preset_creates_record(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, session_factory = client

    response = test_client.post(
        "/transactions/note-presets",
        json={"note": "  早餐 ", "kind": "pinned"},
    )

    assert response.status_code == 200
    assert response.json()["data"] == {"note": "早餐", "kind": "pinned"}

    db = session_factory()
    try:
        stored = db.query(UserNotePreset).all()
        assert [(item.user_id, item.note, item.kind) for item in stored] == [(1, "早餐", "pinned")]
    finally:
        db.close()


def test_post_note_preset_upserts_and_overwrites_kind(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, session_factory = client

    first = test_client.post("/transactions/note-presets", json={"note": "早餐", "kind": "pinned"})
    assert first.status_code == 200

    second = test_client.post("/transactions/note-presets", json={"note": "早餐", "kind": "hidden"})
    assert second.status_code == 200
    assert second.json()["data"] == {"note": "早餐", "kind": "hidden"}

    third = test_client.post("/transactions/note-presets", json={"note": "早餐", "kind": "pinned"})
    assert third.status_code == 200
    assert third.json()["data"] == {"note": "早餐", "kind": "pinned"}

    db = session_factory()
    try:
        stored = db.query(UserNotePreset).all()
        assert len(stored) == 1
        assert stored[0].kind == "pinned"
    finally:
        db.close()


def test_post_note_preset_rejects_invalid_payloads(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, _session_factory = client

    assert (
        test_client.post(
            "/transactions/note-presets", json={"note": "早餐", "kind": "wrong"}
        ).status_code
        == 422
    )
    assert (
        test_client.post(
            "/transactions/note-presets", json={"note": "", "kind": "pinned"}
        ).status_code
        == 422
    )
    assert (
        test_client.post(
            "/transactions/note-presets", json={"note": "   ", "kind": "pinned"}
        ).status_code
        == 422
    )
    assert (
        test_client.post(
            "/transactions/note-presets", json={"note": "x" * 256, "kind": "pinned"}
        ).status_code
        == 422
    )


def test_post_note_preset_upsert_is_per_user(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, holder, session_factory = client
    holder["user"] = User(
        id=2,
        username="bob",
        nickname="Bob",
        password_hash="unused",
        reg_invite_code="IJKLMNOP",
    )

    response = test_client.post("/transactions/note-presets", json={"note": "早餐", "kind": "pinned"})

    assert response.status_code == 200
    db = session_factory()
    try:
        stored = db.query(UserNotePreset).all()
        assert [(item.user_id, item.note) for item in stored] == [(2, "早餐")]
    finally:
        db.close()


# --- DELETE /transactions/note-presets ------------------------------------


def test_delete_note_preset_removes_existing_record(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, session_factory = client
    _seed_presets(
        session_factory,
        [
            {"user_id": 1, "note": "早餐", "kind": "pinned"},
            {"user_id": 1, "note": "香菜", "kind": "hidden"},
        ],
    )

    response = test_client.delete("/transactions/note-presets", params={"note": " 早餐 "})

    assert response.status_code == 200
    assert response.json()["data"] == {"note": "早餐", "deleted": True}

    db = session_factory()
    try:
        remaining = db.query(UserNotePreset).all()
        assert [(item.note, item.kind) for item in remaining] == [("香菜", "hidden")]
    finally:
        db.close()


def test_delete_note_preset_missing_record_reports_false(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, _holder, _session_factory = client

    response = test_client.delete("/transactions/note-presets", params={"note": "不存在"})

    assert response.status_code == 200
    assert response.json()["data"] == {"note": "不存在", "deleted": False}


def test_delete_note_preset_does_not_touch_other_users(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, holder, session_factory = client
    _seed_presets(
        session_factory,
        [{"user_id": 2, "note": "早餐", "kind": "pinned"}],
    )

    response = test_client.delete("/transactions/note-presets", params={"note": "早餐"})

    assert response.status_code == 200
    assert response.json()["data"] == {"note": "早餐", "deleted": False}

    db = session_factory()
    try:
        assert db.query(UserNotePreset).count() == 1
    finally:
        db.close()


# --- 用户隔离 ---------------------------------------------------------------


def test_presets_and_usage_are_isolated_per_user(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, holder, session_factory = client
    _seed_transactions(
        session_factory,
        [
            {"user_id": 1, "amount": 1, "category": "餐饮", "note": "我的菜", "date": "2026-09-01"},
            {"user_id": 1, "amount": 1, "category": "餐饮", "note": "我的菜", "date": "2026-09-02"},
            {"user_id": 2, "amount": 1, "category": "餐饮", "note": "对方的菜", "date": "2026-09-03"},
            {"user_id": 2, "amount": 1, "category": "餐饮", "note": "对方的菜", "date": "2026-09-04"},
        ],
    )
    _seed_presets(
        session_factory,
        [
            {"user_id": 2, "note": "对方的收藏", "kind": "pinned"},
            {"user_id": 2, "note": "对方不要的", "kind": "hidden"},
        ],
    )

    user1_data = _fetch_quick_inputs(test_client, holder, 1, days=365)
    assert user1_data["pinned"] == []
    assert user1_data["by_category"] == {
        "餐饮": [{"note": "我的菜", "count": 2, "last_used": "2026-09-02"}]
    }

    user2_data = _fetch_quick_inputs(test_client, holder, 2, days=365)
    assert user2_data["pinned"] == [
        {"note": "对方的收藏", "count": 0, "last_used": None},
    ]
    assert user2_data["by_category"] == {
        "餐饮": [{"note": "对方的菜", "count": 2, "last_used": "2026-09-04"}]
    }


def test_pinned_usage_counts_only_own_transactions(
    client: tuple[TestClient, dict[str, User], sessionmaker],
) -> None:
    test_client, holder, session_factory = client
    today = date.today()
    _seed_transactions(
        session_factory,
        [
            {"user_id": 2, "amount": 1, "category": "餐饮", "note": "早餐", "date": today.isoformat()},
            {"user_id": 2, "amount": 1, "category": "餐饮", "note": "早餐", "date": today.isoformat()},
            {
                "user_id": 1,
                "amount": 1,
                "category": "餐饮",
                "note": "早餐",
                "date": (today - timedelta(days=3)).isoformat(),
            },
        ],
    )
    _seed_presets(session_factory, [{"user_id": 1, "note": "早餐", "kind": "pinned"}])

    data = _fetch_quick_inputs(test_client, holder, 1)

    assert data["pinned"] == [
        {
            "note": "早餐",
            "count": 1,
            "last_used": (today - timedelta(days=3)).isoformat(),
        }
    ]
