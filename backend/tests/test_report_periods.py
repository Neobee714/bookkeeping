from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

import pytest

from app.services.report_periods import (
    beijing_now,
    next_run_at,
    period_bounds,
    period_label,
    previous_period,
    report_kind_word,
)


def test_beijing_now_is_naive_and_utc_plus_8() -> None:
    now = beijing_now()
    expected = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(hours=8)
    assert now.tzinfo is None
    assert abs((now - expected).total_seconds()) < 5


@pytest.mark.parametrize(
    ("kind", "today", "expected"),
    [
        # 周报：永远取上一个完整的周一至周日。
        ("weekly", date(2026, 11, 11), (date(2026, 11, 2), date(2026, 11, 8))),
        ("weekly", date(2026, 11, 9), (date(2026, 11, 2), date(2026, 11, 8))),
        ("weekly", date(2026, 11, 15), (date(2026, 11, 2), date(2026, 11, 8))),
        ("weekly", date(2026, 1, 1), (date(2025, 12, 22), date(2025, 12, 28))),
        # 月报：上一个自然月，跨年 / 闰年。
        ("monthly", date(2026, 11, 12), (date(2026, 10, 1), date(2026, 10, 31))),
        ("monthly", date(2026, 1, 15), (date(2025, 12, 1), date(2025, 12, 31))),
        ("monthly", date(2026, 3, 1), (date(2026, 2, 1), date(2026, 2, 28))),
        ("monthly", date(2024, 3, 15), (date(2024, 2, 1), date(2024, 2, 29))),
        # 季报：上一个自然季度，含跨年。
        ("quarterly", date(2026, 11, 12), (date(2026, 7, 1), date(2026, 9, 30))),
        ("quarterly", date(2026, 1, 5), (date(2025, 10, 1), date(2025, 12, 31))),
        ("quarterly", date(2026, 4, 1), (date(2026, 1, 1), date(2026, 3, 31))),
        ("quarterly", date(2026, 7, 1), (date(2026, 4, 1), date(2026, 6, 30))),
        # 年报：上一个自然年。
        ("yearly", date(2026, 11, 12), (date(2025, 1, 1), date(2025, 12, 31))),
        ("yearly", date(2026, 1, 1), (date(2025, 1, 1), date(2025, 12, 31))),
    ],
)
def test_period_bounds(kind: str, today: date, expected: tuple[date, date]) -> None:
    assert period_bounds(kind, today) == expected


def test_period_bounds_rejects_unknown_kind() -> None:
    with pytest.raises(ValueError):
        period_bounds("daily", date(2026, 11, 12))


@pytest.mark.parametrize(
    ("kind", "start", "expected"),
    [
        ("weekly", date(2026, 11, 2), "2026 年第 45 周"),
        ("monthly", date(2026, 10, 1), "2026 年 10 月"),
        ("quarterly", date(2026, 7, 1), "2026 年第 3 季度"),
        ("quarterly", date(2025, 10, 1), "2025 年第 4 季度"),
        ("yearly", date(2025, 1, 1), "2025 年"),
    ],
)
def test_period_label(kind: str, start: date, expected: str) -> None:
    assert period_label(kind, start) == expected


@pytest.mark.parametrize(
    ("kind", "start", "expected"),
    [
        ("weekly", date(2026, 11, 2), (date(2026, 10, 26), date(2026, 11, 1))),
        ("monthly", date(2026, 1, 1), (date(2025, 12, 1), date(2025, 12, 31))),
        ("monthly", date(2026, 3, 1), (date(2026, 2, 1), date(2026, 2, 28))),
        ("quarterly", date(2026, 10, 1), (date(2026, 7, 1), date(2026, 9, 30))),
        ("quarterly", date(2026, 1, 1), (date(2025, 10, 1), date(2025, 12, 31))),
        ("yearly", date(2025, 1, 1), (date(2024, 1, 1), date(2024, 12, 31))),
    ],
)
def test_previous_period(
    kind: str, start: date, expected: tuple[date, date]
) -> None:
    assert previous_period(kind, start) == expected


@pytest.mark.parametrize("kind", ["weekly", "monthly", "quarterly", "yearly"])
def test_previous_period_is_contiguous(kind: str) -> None:
    for month in (1, 4, 7, 10, 12):
        start, _ = period_bounds(kind, date(2026, month, 15))
        prev_start, prev_end = previous_period(kind, start)
        assert prev_end == start - timedelta(days=1)
        assert prev_start < prev_end


@pytest.mark.parametrize(
    ("kind", "anchor_weekday", "anchor_day", "anchor_hour", "after", "expected"),
    [
        # 周报：1=周一 … 7=周日。
        ("weekly", 1, 1, 9, datetime(2026, 11, 12, 10, 0), datetime(2026, 11, 16, 9, 0)),
        ("weekly", 1, 1, 9, datetime(2026, 11, 16, 9, 0), datetime(2026, 11, 23, 9, 0)),
        ("weekly", 4, 1, 9, datetime(2026, 11, 12, 8, 0), datetime(2026, 11, 12, 9, 0)),
        ("weekly", 7, 1, 9, datetime(2026, 11, 12, 10, 0), datetime(2026, 11, 15, 9, 0)),
        ("weekly", 7, 1, 21, datetime(2026, 11, 15, 21, 0), datetime(2026, 11, 22, 21, 0)),
        # 月报：每月 1–28 日。
        ("monthly", None, 1, 9, datetime(2026, 11, 12, 10, 0), datetime(2026, 12, 1, 9, 0)),
        ("monthly", None, 1, 9, datetime(2026, 11, 30, 23, 0), datetime(2026, 12, 1, 9, 0)),
        ("monthly", None, 1, 9, datetime(2026, 12, 1, 9, 0), datetime(2027, 1, 1, 9, 0)),
        ("monthly", None, 28, 8, datetime(2026, 2, 27, 10, 0), datetime(2026, 2, 28, 8, 0)),
        ("monthly", None, 28, 8, datetime(2026, 2, 28, 9, 0), datetime(2026, 3, 28, 8, 0)),
        # 季报：只在 1/4/7/10 月生成。
        ("quarterly", None, 1, 9, datetime(2026, 11, 12, 10, 0), datetime(2027, 1, 1, 9, 0)),
        ("quarterly", None, 1, 9, datetime(2026, 3, 15, 10, 0), datetime(2026, 4, 1, 9, 0)),
        ("quarterly", None, 1, 9, datetime(2026, 7, 1, 9, 0), datetime(2026, 10, 1, 9, 0)),
        # 年报：只在 1 月生成，12 月 → 次年 1 月。
        ("yearly", None, 1, 9, datetime(2026, 11, 12, 10, 0), datetime(2027, 1, 1, 9, 0)),
        ("yearly", None, 1, 9, datetime(2026, 12, 31, 23, 0), datetime(2027, 1, 1, 9, 0)),
        ("yearly", None, 1, 9, datetime(2027, 1, 1, 9, 0), datetime(2028, 1, 1, 9, 0)),
    ],
)
def test_next_run_at(
    kind: str,
    anchor_weekday: int | None,
    anchor_day: int,
    anchor_hour: int,
    after: datetime,
    expected: datetime,
) -> None:
    assert (
        next_run_at(kind, anchor_weekday, anchor_day, anchor_hour, after) == expected
    )


@pytest.mark.parametrize(
    ("kind", "anchor_weekday", "anchor_day", "anchor_hour"),
    [
        ("weekly", None, 1, 9),
        ("weekly", 0, 1, 9),
        ("weekly", 8, 1, 9),
        ("monthly", None, 0, 9),
        ("monthly", None, 29, 9),
        ("quarterly", None, None, 9),
        ("yearly", None, 1, 24),
        ("yearly", None, 1, -1),
    ],
)
def test_next_run_at_rejects_invalid_anchors(
    kind: str, anchor_weekday: int | None, anchor_day: int | None, anchor_hour: int
) -> None:
    with pytest.raises(ValueError):
        next_run_at(kind, anchor_weekday, anchor_day, anchor_hour, datetime(2026, 11, 12, 10, 0))


@pytest.mark.parametrize(
    ("kind", "start", "expected"),
    [
        ("weekly", date(2026, 11, 2), "这一周"),
        ("monthly", date(2026, 10, 1), "10 月"),
        ("quarterly", date(2026, 7, 1), "第 3 季度"),
        ("yearly", date(2025, 1, 1), "2025 年"),
    ],
)
def test_report_kind_word(kind: str, start: date, expected: str) -> None:
    assert report_kind_word(kind, start) == expected
