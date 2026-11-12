from __future__ import annotations

import json
from collections.abc import Generator
from datetime import date, datetime
from decimal import Decimal
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401  确保模型注册进 Base.metadata
from app.core.database import Base, get_db
from app.core.security import get_current_user
from app.main import app
from app.models.enums import TransactionType
from app.models.report import Report, ReportSchedule
from app.models.transaction import Transaction
from app.models.user import User
from app.routers import reports as reports_router_module
from app.services import reports as reports_service
from app.services.report_periods import period_bounds
from app.services.reports import build_content, generate_due_reports

FIXED_NOW = datetime(2026, 11, 12, 10, 0)
OCT_START = date(2026, 10, 1)
OCT_END = date(2026, 10, 31)


@pytest.fixture()
def env(
    monkeypatch: pytest.MonkeyPatch,
) -> Generator[tuple[TestClient, sessionmaker, dict[str, int]], None, None]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(engine)

    users = {
        1: User(
            id=1,
            username="alice",
            nickname="Alice",
            password_hash="unused",
            reg_invite_code="ABCDEFGH",
        ),
        2: User(
            id=2,
            username="bob",
            nickname="Bob",
            password_hash="unused",
            reg_invite_code="IJKLMNOP",
        ),
    }
    seed = TestingSessionLocal()
    try:
        seed.add_all(users.values())
        seed.commit()
    finally:
        seed.close()

    holder = {"user_id": 1}

    def override_get_db() -> Generator[Session, None, None]:
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    def override_get_current_user() -> User:
        db = TestingSessionLocal()
        try:
            user = db.get(User, holder["user_id"])
            assert user is not None
            return user
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user
    # 固定业务时间，避免测试随真实日期漂移。
    monkeypatch.setattr(reports_router_module, "beijing_now", lambda: FIXED_NOW)
    monkeypatch.setattr(reports_service, "beijing_now", lambda: FIXED_NOW)

    try:
        yield TestClient(app), TestingSessionLocal, holder
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(engine)


def _add_tx(
    db: Session,
    user_id: int,
    amount: str,
    tx_type: TransactionType,
    category: str,
    tx_date: date,
    note: str | None = None,
    merchant: str | None = None,
    item: str | None = None,
    note_kind: str | None = None,
) -> None:
    db.add(
        Transaction(
            user_id=user_id,
            amount=Decimal(amount),
            type=tx_type,
            category=category,
            note=note,
            merchant=merchant,
            item=item,
            note_kind=note_kind,
            date=tx_date,
        )
    )


def _seed_october(db: Session) -> None:
    rows = [
        ("8000.00", TransactionType.INCOME, "收入", date(2026, 10, 1), "工资"),
        ("420.00", TransactionType.INCOME, "收入", date(2026, 10, 31), "红包"),
        ("500.00", TransactionType.EXPENSE, "餐饮", date(2026, 10, 5), "午饭"),
        ("300.00", TransactionType.EXPENSE, "餐饮", date(2026, 10, 13), None),
        ("200.00", TransactionType.EXPENSE, "餐饮", date(2026, 10, 20), ""),
        ("899.00", TransactionType.EXPENSE, "购物", date(2026, 10, 21), "羽绒服"),
        ("2000.00", TransactionType.EXPENSE, "居住", date(2026, 10, 1), "房租"),
        ("100.00", TransactionType.EXPENSE, "交通", date(2026, 10, 2), "地铁"),
    ]
    for amount, tx_type, category, tx_date, note in rows:
        _add_tx(db, 1, amount, tx_type, category, tx_date, note)


def _seed_partner(db: Session) -> None:
    _add_tx(db, 2, "50000.00", TransactionType.INCOME, "收入", date(2026, 10, 1), "工资")
    _add_tx(db, 2, "30000.00", TransactionType.EXPENSE, "购物", date(2026, 10, 3), "包")
    _add_tx(db, 2, "8000.00", TransactionType.EXPENSE, "餐饮", date(2026, 10, 4), "聚餐")


def _seed_september(db: Session) -> None:
    _add_tx(db, 1, "7000.00", TransactionType.INCOME, "收入", date(2026, 9, 1), "工资")
    _add_tx(db, 1, "3000.00", TransactionType.EXPENSE, "居住", date(2026, 9, 10), "房租")


def _generate_now(client: TestClient) -> dict[str, Any]:
    response = client.post("/reports/generate-now")
    assert response.status_code == 200, response.text
    return response.json()["data"]


def _settings_payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "kind": "monthly",
        "anchor_weekday": None,
        "anchor_day": 1,
        "anchor_hour": 9,
        "enabled": True,
    }
    payload.update(overrides)
    return payload


def test_generate_now_aggregates_only_current_user(
    env: tuple[TestClient, sessionmaker, dict[str, int]],
) -> None:
    client, session_factory, _holder = env
    db = session_factory()
    try:
        _seed_october(db)
        _seed_partner(db)
        db.commit()
    finally:
        db.close()

    data = _generate_now(client)
    assert data["kind"] == "monthly"
    assert data["label"] == "2026 年 10 月"
    assert data["period_start"] == "2026-10-01"
    assert data["period_end"] == "2026-10-31"
    assert data["generated_at"] == "2026-11-12T10:00:00+08:00"
    assert data["read_at"] is None

    content = data["content"]
    assert content["total_income"] == 8420.0
    assert content["total_expense"] == 3999.0
    assert content["balance"] == 4421.0
    assert content["savings_rate"] == 52.5
    assert content["transaction_count"] == 8
    assert content["active_days"] == 7
    assert content["period_days"] == 31
    assert content["daily_expense"] == 129.0
    assert content["prev_label"] == "2026 年 9 月"
    assert content["prev"] is None
    assert [item["name"] for item in content["categories"]] == [
        "居住",
        "餐饮",
        "购物",
        "交通",
    ]
    assert content["categories"][0] == {"name": "居住", "amount": 2000.0, "share": 50.0}
    assert content["top_expenses"] == [
        {
            "amount": 2000.0,
            "category": "居住",
            "note": "房租",
            "merchant": None,
            "item": None,
            "date": "2026-10-01",
        },
        {
            "amount": 899.0,
            "category": "购物",
            "note": "羽绒服",
            "merchant": None,
            "item": None,
            "date": "2026-10-21",
        },
        {
            "amount": 500.0,
            "category": "餐饮",
            "note": "午饭",
            "merchant": None,
            "item": None,
            "date": "2026-10-05",
        },
    ]
    assert content["headline"] == "10 月，你存下了 53%"
    assert content["insights"][0] == "居住花了 ¥2,000，占支出的 50%，是本期最大开销"
    assert content["insights"][1] == "最大单笔是 10 月 1 日的「房租」¥2,000"
    assert content["insights"][2] == "收入 ¥8,420，支出 ¥3,999，结余 ¥4,421（储蓄率 53%）"
    assert content["trend"]["unit"] == "week"
    assert [point["label"] for point in content["trend"]["points"]] == [
        "W1",
        "W2",
        "W3",
        "W4",
        "W5",
    ]
    assert sum(point["expense"] for point in content["trend"]["points"]) == 3999.0

    # 与同期 /stats/monthly-summary 对本人数据一致。
    summary_response = client.get(
        "/stats/monthly-summary",
        params={"start_date": "2026-10-01", "end_date": "2026-11-01"},
    )
    assert summary_response.status_code == 200
    summary = summary_response.json()["data"]
    assert summary["total_income"] == content["total_income"]
    assert summary["total_expense"] == content["total_expense"]
    assert summary["balance"] == content["balance"]
    assert summary["transaction_count"] == content["transaction_count"]


def test_prev_period_and_expense_delta(
    env: tuple[TestClient, sessionmaker, dict[str, int]],
) -> None:
    client, session_factory, _holder = env
    db = session_factory()
    try:
        _seed_october(db)
        _seed_september(db)
        db.commit()
    finally:
        db.close()

    content = _generate_now(client)["content"]
    assert content["prev_label"] == "2026 年 9 月"
    assert content["prev"] == {
        "total_income": 7000.0,
        "total_expense": 3000.0,
        "expense_delta_pct": 33.3,
        "income_delta_pct": 20.3,
    }
    assert content["insights"][-1] == "支出比 2026 年 9 月增加了 33.3%"


def test_generate_now_is_idempotent_and_snapshot_is_frozen(
    env: tuple[TestClient, sessionmaker, dict[str, int]],
) -> None:
    client, session_factory, _holder = env
    db = session_factory()
    try:
        _seed_october(db)
        db.commit()
    finally:
        db.close()

    first = _generate_now(client)
    second = _generate_now(client)
    assert first["id"] == second["id"]

    db = session_factory()
    try:
        assert int(db.scalar(select(func.count(Report.id))) or 0) == 1
        _add_tx(
            db, 1, "5000.00", TransactionType.EXPENSE, "购物", date(2026, 10, 25), "后补"
        )
        db.commit()
    finally:
        db.close()

    detail = client.get(f"/reports/{first['id']}")
    assert detail.status_code == 200
    assert detail.json()["data"]["content"]["total_expense"] == 3999.0

    third = _generate_now(client)
    assert third["id"] == first["id"]
    assert third["content"]["total_expense"] == 3999.0


def test_empty_period_still_generates(
    env: tuple[TestClient, sessionmaker, dict[str, int]],
) -> None:
    client, _session_factory, _holder = env

    data = _generate_now(client)
    content = data["content"]
    assert content["headline"] == "10 月，还没有记账"
    assert content["total_income"] == 0.0
    assert content["total_expense"] == 0.0
    assert content["balance"] == 0.0
    assert content["savings_rate"] is None
    assert content["transaction_count"] == 0
    assert content["active_days"] == 0
    assert content["daily_expense"] == 0.0
    assert content["categories"] == []
    assert content["top_expenses"] == []
    assert content["insights"] == []
    assert len(content["trend"]["points"]) == 5
    assert all(point["expense"] == 0.0 for point in content["trend"]["points"])


def test_overspend_headline(
    env: tuple[TestClient, sessionmaker, dict[str, int]],
) -> None:
    client, session_factory, _holder = env
    db = session_factory()
    try:
        _add_tx(
            db, 1, "500.00", TransactionType.EXPENSE, "餐饮", date(2026, 10, 5), "聚餐"
        )
        db.commit()
    finally:
        db.close()

    content = _generate_now(client)["content"]
    assert content["savings_rate"] is None
    assert content["balance"] == -500.0
    assert content["headline"] == "10 月，你超支了 ¥500"
    assert any("超支 ¥500" in insight for insight in content["insights"])


@pytest.mark.parametrize(
    ("kind", "anchor_weekday", "anchor_day", "start", "end", "label"),
    [
        ("weekly", 1, 1, "2026-11-02", "2026-11-08", "2026 年第 45 周"),
        ("monthly", None, 1, "2026-10-01", "2026-10-31", "2026 年 10 月"),
        ("quarterly", None, 1, "2026-07-01", "2026-09-30", "2026 年第 3 季度"),
        ("yearly", None, 1, "2025-01-01", "2025-12-31", "2025 年"),
    ],
)
def test_generate_now_covers_all_kinds(
    env: tuple[TestClient, sessionmaker, dict[str, int]],
    kind: str,
    anchor_weekday: int | None,
    anchor_day: int,
    start: str,
    end: str,
    label: str,
) -> None:
    client, _session_factory, _holder = env
    saved = client.put(
        "/reports/settings",
        json=_settings_payload(
            kind=kind, anchor_weekday=anchor_weekday, anchor_day=anchor_day
        ),
    )
    assert saved.status_code == 200, saved.text

    data = _generate_now(client)
    assert data["kind"] == kind
    assert data["label"] == label
    assert data["period_start"] == start
    assert data["period_end"] == end


@pytest.mark.parametrize(
    ("kind", "today", "point_count", "unit", "first_label"),
    [
        ("weekly", date(2026, 11, 12), 7, "day", "周一"),
        ("monthly", date(2026, 11, 12), 5, "week", "W1"),
        ("monthly", date(2026, 3, 15), 4, "week", "W1"),
        ("quarterly", date(2026, 11, 12), 3, "month", "7 月"),
        ("yearly", date(2026, 11, 12), 12, "month", "1 月"),
    ],
)
def test_trend_shape(
    env: tuple[TestClient, sessionmaker, dict[str, int]],
    kind: str,
    today: date,
    point_count: int,
    unit: str,
    first_label: str,
) -> None:
    _client, session_factory, _holder = env
    db = session_factory()
    try:
        start, end = period_bounds(kind, today)
        content = build_content(db, 1, kind, start, end)
    finally:
        db.close()

    assert content["trend"]["unit"] == unit
    assert len(content["trend"]["points"]) == point_count
    assert content["trend"]["points"][0]["label"] == first_label


def test_settings_defaults(
    env: tuple[TestClient, sessionmaker, dict[str, int]],
) -> None:
    client, _session_factory, _holder = env

    response = client.get("/reports/settings")
    assert response.status_code == 200
    assert response.json()["data"] == {
        "exists": False,
        "enabled": False,
        "kind": "monthly",
        "anchor_weekday": None,
        "anchor_day": 1,
        "anchor_hour": 9,
        "next_run_at": None,
        "last_period_end": None,
    }


def test_update_settings_monthly(
    env: tuple[TestClient, sessionmaker, dict[str, int]],
) -> None:
    client, session_factory, _holder = env

    response = client.put("/reports/settings", json=_settings_payload())
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["exists"] is True
    assert data["enabled"] is True
    assert data["kind"] == "monthly"
    assert data["anchor_weekday"] is None
    assert data["anchor_day"] == 1
    assert data["anchor_hour"] == 9
    assert data["next_run_at"] == "2026-12-01T09:00:00+08:00"
    assert data["last_period_end"] is None

    again = client.put("/reports/settings", json=_settings_payload(anchor_day=5))
    assert again.status_code == 200
    assert again.json()["data"]["anchor_day"] == 5

    db = session_factory()
    try:
        assert int(db.scalar(select(func.count(ReportSchedule.id))) or 0) == 1
    finally:
        db.close()


def test_update_settings_weekly_and_back(
    env: tuple[TestClient, sessionmaker, dict[str, int]],
) -> None:
    client, _session_factory, _holder = env

    weekly = client.put(
        "/reports/settings",
        json=_settings_payload(kind="weekly", anchor_weekday=1, anchor_day=None),
    )
    assert weekly.status_code == 200, weekly.text
    weekly_data = weekly.json()["data"]
    assert weekly_data["kind"] == "weekly"
    assert weekly_data["anchor_weekday"] == 1
    assert weekly_data["anchor_day"] == 1
    assert weekly_data["next_run_at"] == "2026-11-16T09:00:00+08:00"

    monthly = client.put(
        "/reports/settings",
        json=_settings_payload(kind="monthly", anchor_weekday=5, anchor_day=2),
    )
    assert monthly.status_code == 200
    monthly_data = monthly.json()["data"]
    assert monthly_data["anchor_weekday"] is None
    assert monthly_data["anchor_day"] == 2
    assert monthly_data["next_run_at"] == "2026-12-02T09:00:00+08:00"


def test_disable_settings_clears_next_run_at(
    env: tuple[TestClient, sessionmaker, dict[str, int]],
) -> None:
    client, _session_factory, _holder = env

    enabled = client.put("/reports/settings", json=_settings_payload())
    assert enabled.json()["data"]["next_run_at"] == "2026-12-01T09:00:00+08:00"

    disabled = client.put("/reports/settings", json=_settings_payload(enabled=False))
    assert disabled.status_code == 200
    data = disabled.json()["data"]
    assert data["enabled"] is False
    assert data["next_run_at"] is None


@pytest.mark.parametrize(
    "payload",
    [
        {"kind": "daily", "anchor_day": 1, "anchor_hour": 9, "enabled": True},
        {"kind": "weekly", "anchor_day": 1, "anchor_hour": 9, "enabled": True},
        {"kind": "weekly", "anchor_weekday": 0, "anchor_hour": 9, "enabled": True},
        {"kind": "weekly", "anchor_weekday": 8, "anchor_hour": 9, "enabled": True},
        {"kind": "monthly", "anchor_hour": 9, "enabled": True},
        {"kind": "monthly", "anchor_day": 0, "anchor_hour": 9, "enabled": True},
        {"kind": "monthly", "anchor_day": 29, "anchor_hour": 9, "enabled": True},
        {"kind": "monthly", "anchor_day": 1, "anchor_hour": 24, "enabled": True},
        {"kind": "monthly", "anchor_day": 1, "anchor_hour": -1, "enabled": True},
        {"kind": "monthly", "anchor_day": 1, "anchor_hour": 9},
    ],
)
def test_settings_validation(
    env: tuple[TestClient, sessionmaker, dict[str, int]], payload: dict[str, object]
) -> None:
    client, _session_factory, _holder = env
    response = client.put("/reports/settings", json=payload)
    assert response.status_code == 422


def test_settings_are_per_user(
    env: tuple[TestClient, sessionmaker, dict[str, int]],
) -> None:
    client, _session_factory, holder = env
    client.put("/reports/settings", json=_settings_payload(kind="weekly", anchor_weekday=3))

    holder["user_id"] = 2
    bob_settings = client.get("/reports/settings").json()["data"]
    assert bob_settings["exists"] is False
    assert bob_settings["kind"] == "monthly"


def test_generate_due_reports_generates_only_latest_period(
    env: tuple[TestClient, sessionmaker, dict[str, int]],
) -> None:
    _client, session_factory, _holder = env
    db = session_factory()
    try:
        db.add(
            ReportSchedule(
                user_id=1,
                kind="monthly",
                anchor_weekday=1,
                anchor_day=1,
                anchor_hour=9,
                enabled=True,
                next_run_at=datetime(2026, 8, 1, 9, 0),
            )
        )
        db.commit()

        assert generate_due_reports(db, now=FIXED_NOW) == 1

        reports = list(db.scalars(select(Report)).all())
        assert len(reports) == 1
        assert reports[0].period_start == OCT_START
        assert reports[0].period_end == OCT_END
        assert reports[0].label == "2026 年 10 月"

        schedule = db.scalar(select(ReportSchedule))
        assert schedule is not None
        assert schedule.last_period_end == OCT_END
        assert schedule.next_run_at == datetime(2026, 12, 1, 9, 0)

        assert generate_due_reports(db, now=FIXED_NOW) == 0
        assert int(db.scalar(select(func.count(Report.id))) or 0) == 1
    finally:
        db.close()


def test_generate_due_reports_skips_disabled(
    env: tuple[TestClient, sessionmaker, dict[str, int]],
) -> None:
    _client, session_factory, _holder = env
    db = session_factory()
    try:
        db.add(
            ReportSchedule(
                user_id=1,
                kind="monthly",
                anchor_weekday=1,
                anchor_day=1,
                anchor_hour=9,
                enabled=False,
                next_run_at=datetime(2026, 8, 1, 9, 0),
            )
        )
        db.commit()

        assert generate_due_reports(db, now=FIXED_NOW) == 0
        assert int(db.scalar(select(func.count(Report.id))) or 0) == 0
    finally:
        db.close()


def test_generate_due_reports_one_failure_does_not_block_others(
    env: tuple[TestClient, sessionmaker, dict[str, int]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _client, session_factory, _holder = env
    db = session_factory()
    try:
        for user_id in (1, 2):
            db.add(
                ReportSchedule(
                    user_id=user_id,
                    kind="monthly",
                    anchor_weekday=1,
                    anchor_day=1,
                    anchor_hour=9,
                    enabled=True,
                    next_run_at=datetime(2026, 8, 1, 9, 0),
                )
            )
        db.commit()

        original_ensure = reports_service.ensure_report

        def flaky_ensure(
            session: Session, user_id: int, kind: str, start: date, end: date
        ) -> Report:
            if user_id == 1:
                raise RuntimeError("boom")
            return original_ensure(session, user_id, kind, start, end)

        monkeypatch.setattr(reports_service, "ensure_report", flaky_ensure)

        assert generate_due_reports(db, now=FIXED_NOW) == 1

        reports = list(db.scalars(select(Report)).all())
        assert [report.user_id for report in reports] == [2]

        schedules = {
            schedule.user_id: schedule
            for schedule in db.scalars(select(ReportSchedule)).all()
        }
        assert schedules[1].next_run_at == datetime(2026, 8, 1, 9, 0)
        assert schedules[1].last_period_end is None
        assert schedules[2].next_run_at == datetime(2026, 12, 1, 9, 0)
        assert schedules[2].last_period_end == OCT_END
    finally:
        db.close()


def test_generate_now_does_not_touch_schedule(
    env: tuple[TestClient, sessionmaker, dict[str, int]],
) -> None:
    client, _session_factory, _holder = env
    client.put("/reports/settings", json=_settings_payload())
    before = client.get("/reports/settings").json()["data"]

    _generate_now(client)

    after = client.get("/reports/settings").json()["data"]
    assert after["next_run_at"] == before["next_run_at"]
    assert after["last_period_end"] == before["last_period_end"]


def test_read_flow_updates_unread_count(
    env: tuple[TestClient, sessionmaker, dict[str, int]],
) -> None:
    client, _session_factory, _holder = env
    report = _generate_now(client)

    listing = client.get("/reports").json()["data"]
    assert listing["unread_count"] == 1
    assert listing["items"][0]["read_at"] is None

    read = client.post(f"/reports/{report['id']}/read")
    assert read.status_code == 200
    read_data = read.json()["data"]
    assert read_data["id"] == report["id"]
    assert read_data["read_at"] == "2026-11-12T10:00:00+08:00"

    after = client.get("/reports").json()["data"]
    assert after["unread_count"] == 0
    assert after["items"][0]["read_at"] == "2026-11-12T10:00:00+08:00"

    again = client.post(f"/reports/{report['id']}/read")
    assert again.json()["data"]["read_at"] == "2026-11-12T10:00:00+08:00"


def test_list_orders_by_generated_at_and_limits(
    env: tuple[TestClient, sessionmaker, dict[str, int]],
) -> None:
    client, session_factory, _holder = env
    db = session_factory()
    try:
        for index, generated_at in enumerate(
            (
                datetime(2026, 9, 1, 9, 0),
                datetime(2026, 10, 1, 9, 0),
                datetime(2026, 11, 1, 9, 0),
            )
        ):
            db.add(
                Report(
                    user_id=1,
                    kind="monthly",
                    label=f"报告 {index}",
                    period_start=date(2026, 7 + index, 1),
                    period_end=date(2026, 7 + index, 28),
                    generated_at=generated_at,
                    content=json.dumps(
                        {
                            "total_income": 1.0,
                            "total_expense": 2.0,
                            "balance": -1.0,
                            "transaction_count": 3,
                        },
                        ensure_ascii=False,
                    ),
                )
            )
        db.commit()
    finally:
        db.close()

    body = client.get("/reports", params={"limit": 2}).json()["data"]
    assert body["unread_count"] == 3
    assert body["total"] == 3
    assert [item["label"] for item in body["items"]] == ["报告 2", "报告 1"]
    assert body["items"][0]["total_income"] == 1.0
    assert body["items"][0]["transaction_count"] == 3

    for bad_limit in (0, 101):
        response = client.get("/reports", params={"limit": bad_limit})
        assert response.status_code == 422


def test_other_users_reports_are_invisible(
    env: tuple[TestClient, sessionmaker, dict[str, int]],
) -> None:
    client, _session_factory, holder = env
    alice_report = _generate_now(client)

    holder["user_id"] = 2

    assert client.get("/reports").json()["data"] == {
        "unread_count": 0,
        "total": 0,
        "items": [],
    }
    detail = client.get(f"/reports/{alice_report['id']}")
    assert detail.status_code == 404
    assert detail.json()["message"] == "财报不存在"
    read = client.post(f"/reports/{alice_report['id']}/read")
    assert read.status_code == 404

    bob_report = _generate_now(client)
    assert bob_report["id"] != alice_report["id"]
    assert bob_report["content"]["transaction_count"] == 0

    holder["user_id"] = 1
    assert len(client.get("/reports").json()["data"]["items"]) == 1


def test_generate_now_accepts_kind_override(
    env: tuple[TestClient, sessionmaker, dict[str, int]],
) -> None:
    client, _session_factory, _holder = env

    # 先保存月报设置，再用 kind=yearly 预览上一期年报，不改动设置。
    client.put("/reports/settings", json=_settings_payload())
    response = client.post("/reports/generate-now", params={"kind": "yearly"})
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["kind"] == "yearly"
    assert data["label"] == "2025 年"
    assert data["period_start"] == "2025-01-01"
    assert data["period_end"] == "2025-12-31"

    settings = client.get("/reports/settings").json()["data"]
    assert settings["kind"] == "monthly"
    assert settings["next_run_at"] == "2026-12-01T09:00:00+08:00"


def test_weekly_generate_now_uses_previous_week(
    env: tuple[TestClient, sessionmaker, dict[str, int]],
) -> None:
    client, _session_factory, _holder = env
    response = client.put(
        "/reports/settings",
        json=_settings_payload(
            kind="weekly", anchor_weekday=6, anchor_day=None, anchor_hour=20
        ),
    )
    assert response.status_code == 200
    assert response.json()["data"]["next_run_at"] == "2026-11-14T20:00:00+08:00"

    data = _generate_now(client)
    assert data["kind"] == "weekly"
    assert data["label"] == "2026 年第 45 周"
    assert data["period_start"] == "2026-11-02"
    assert data["period_end"] == "2026-11-08"
    assert data["content"]["period_days"] == 7
    assert len(data["content"]["trend"]["points"]) == 7


def test_report_content_stored_as_readable_json(
    env: tuple[TestClient, sessionmaker, dict[str, int]],
) -> None:
    client, session_factory, _holder = env
    db = session_factory()
    try:
        _seed_october(db)
        db.commit()
    finally:
        db.close()

    report = _generate_now(client)
    db = session_factory()
    try:
        stored = db.get(Report, report["id"])
        assert stored is not None
        assert isinstance(stored.content, str)
        assert "居住" in stored.content
        assert json.loads(stored.content)["total_expense"] == 3999.0
    finally:
        db.close()


def test_report_content_includes_merchant_item_dining(
    env: tuple[TestClient, sessionmaker, dict[str, int]],
) -> None:
    client, session_factory, _holder = env
    db = session_factory()
    try:
        _add_tx(
            db,
            1,
            "32.00",
            TransactionType.EXPENSE,
            "餐饮",
            date(2026, 10, 5),
            None,
            merchant="和府捞面",
            item="面",
        )
        _add_tx(
            db,
            1,
            "32.00",
            TransactionType.EXPENSE,
            "餐饮",
            date(2026, 10, 6),
            None,
            merchant="和府捞面",
            item="面",
        )
        _add_tx(
            db,
            1,
            "32.00",
            TransactionType.EXPENSE,
            "餐饮",
            date(2026, 10, 7),
            None,
            merchant="和府捞面",
            item="饭",
        )
        _add_tx(
            db,
            1,
            "50.00",
            TransactionType.EXPENSE,
            "餐饮",
            date(2026, 10, 8),
            None,
            merchant="麦当劳",
            item="汉堡",
        )
        _add_tx(
            db,
            1,
            "20.00",
            TransactionType.EXPENSE,
            "餐饮",
            date(2026, 10, 9),
            None,
            merchant="咖啡店",
            item="咖啡",
        )
        _add_tx(
            db,
            1,
            "15.00",
            TransactionType.EXPENSE,
            "餐饮",
            date(2026, 10, 10),
            None,
            merchant="   ",
            item="   ",
        )
        _add_tx(
            db,
            1,
            "100.00",
            TransactionType.EXPENSE,
            "购物",
            date(2026, 10, 11),
            None,
            merchant="超市",
        )
        _add_tx(
            db,
            1,
            "5000.00",
            TransactionType.INCOME,
            "收入",
            date(2026, 10, 1),
            None,
            merchant="公司",
        )
        _add_tx(
            db,
            2,
            "999.00",
            TransactionType.EXPENSE,
            "餐饮",
            date(2026, 10, 5),
            None,
            merchant="和府捞面",
            item="面",
        )
        db.commit()
    finally:
        db.close()

    content = _generate_now(client)["content"]

    assert content["merchants"] == [
        {"name": "和府捞面", "amount": 96.0, "count": 3, "avg": 32.0},
        {"name": "麦当劳", "amount": 50.0, "count": 1, "avg": 50.0},
        {"name": "咖啡店", "amount": 20.0, "count": 1, "avg": 20.0},
    ]
    assert content["items"] == [
        {"name": "面", "amount": 64.0, "count": 2, "avg": 32.0},
        {"name": "汉堡", "amount": 50.0, "count": 1, "avg": 50.0},
        {"name": "饭", "amount": 32.0, "count": 1, "avg": 32.0},
        {"name": "咖啡", "amount": 20.0, "count": 1, "avg": 20.0},
    ]
    assert content["dining"] == {"count": 6, "amount": 181.0, "avg": 30.17}
    assert content["dining_insights"] == [
        "最常去 和府捞面，3 次共 ¥96",
        "最常吃 面，2 次共 ¥64",
        "餐饮 6 次，平均每次 ¥30",
    ]


def test_report_content_without_dining_data_is_empty(
    env: tuple[TestClient, sessionmaker, dict[str, int]],
) -> None:
    client, _session_factory, _holder = env

    content = _generate_now(client)["content"]

    assert content["merchants"] == []
    assert content["items"] == []
    assert content["dining"] == {"count": 0, "amount": 0.0, "avg": 0.0}
    assert content["dining_insights"] == []


def test_report_merchant_and_item_top5(
    env: tuple[TestClient, sessionmaker, dict[str, int]],
) -> None:
    client, session_factory, _holder = env
    db = session_factory()
    try:
        for index in range(1, 8):
            _add_tx(
                db,
                1,
                f"{index * 10}.00",
                TransactionType.EXPENSE,
                "餐饮",
                date(2026, 10, index),
                None,
                merchant=f"店{index}",
                item=f"菜{index}",
            )
        # 常客金额低、进不了 Top5，但次数最多，洞察应基于全量商家。
        for day in range(10, 15):
            _add_tx(
                db,
                1,
                "1.00",
                TransactionType.EXPENSE,
                "餐饮",
                date(2026, 10, day),
                None,
                merchant="常客",
            )
        db.commit()
    finally:
        db.close()

    content = _generate_now(client)["content"]

    assert [item["name"] for item in content["merchants"]] == [
        "店7",
        "店6",
        "店5",
        "店4",
        "店3",
    ]
    assert [item["name"] for item in content["items"]] == [
        "菜7",
        "菜6",
        "菜5",
        "菜4",
        "菜3",
    ]
    assert content["dining_insights"][0] == "最常去 常客，5 次共 ¥5"
