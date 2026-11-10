from __future__ import annotations

from datetime import date, timedelta

import pytest

from app.services.recurring_dates import (
    due_dates,
    first_occurrence_on_or_after,
    month_day,
    next_occurrence,
)


def test_month_day_clamps_to_month_end() -> None:
    assert month_day(2026, 2, 31) == date(2026, 2, 28)
    assert month_day(2028, 2, 31) == date(2028, 2, 29)
    assert month_day(2026, 4, 31) == date(2026, 4, 30)
    assert month_day(2026, 1, 15) == date(2026, 1, 15)


def test_next_occurrence_daily_and_weekly() -> None:
    assert next_occurrence("daily", date(2026, 1, 1), date(2026, 1, 1)) == date(2026, 1, 2)
    # 每周跨月：2026-01-28 是周三，下一次 2026-02-04 仍是周三。
    assert next_occurrence("weekly", date(2026, 1, 28), date(2026, 1, 28)) == date(2026, 2, 4)


def test_monthly_31_clamps_in_short_months() -> None:
    start = date(2026, 1, 31)

    february = next_occurrence("monthly", start, start)
    assert february == date(2026, 2, 28)

    march = next_occurrence("monthly", start, february)
    assert march == date(2026, 3, 31)

    april = next_occurrence("monthly", start, march)
    assert april == date(2026, 4, 30)

    may = next_occurrence("monthly", start, april)
    assert may == date(2026, 5, 31)


def test_monthly_31_in_leap_february() -> None:
    start = date(2028, 1, 31)
    assert next_occurrence("monthly", start, start) == date(2028, 2, 29)


def test_yearly_feb_29_falls_back_to_feb_28() -> None:
    start = date(2028, 2, 29)
    assert next_occurrence("yearly", start, start) == date(2029, 2, 28)
    assert next_occurrence("yearly", start, date(2029, 2, 28)) == date(2030, 2, 28)
    assert next_occurrence("yearly", start, date(2031, 2, 28)) == date(2032, 2, 29)


def test_first_occurrence_future_start_returns_start() -> None:
    start = date(2026, 1, 31)
    assert first_occurrence_on_or_after("monthly", start, date(2025, 12, 1)) == start


def test_first_occurrence_on_the_day_returns_same_day() -> None:
    start = date(2026, 1, 31)
    assert first_occurrence_on_or_after("monthly", start, start) == start


def test_first_occurrence_in_the_past_advances_to_floor() -> None:
    start = date(2026, 1, 31)
    assert first_occurrence_on_or_after("monthly", start, date(2026, 2, 1)) == date(
        2026, 2, 28
    )
    assert first_occurrence_on_or_after("monthly", start, date(2026, 3, 1)) == date(
        2026, 3, 31
    )


def test_first_occurrence_daily_and_weekly_far_past() -> None:
    daily = first_occurrence_on_or_after("daily", date(2020, 1, 1), date(2026, 1, 1))
    assert daily == date(2026, 1, 1)

    weekly_start = date(2020, 1, 1)
    floor = date(2026, 1, 2)
    weekly = first_occurrence_on_or_after("weekly", weekly_start, floor)
    assert weekly >= floor
    assert (weekly - weekly_start).days % 7 == 0
    assert weekly - timedelta(days=7) < floor


def test_first_occurrence_yearly_far_past() -> None:
    start = date(2020, 6, 15)
    assert first_occurrence_on_or_after("yearly", start, date(2026, 11, 10)) == date(
        2027, 6, 15
    )


def test_due_dates_until_today() -> None:
    dates = due_dates(
        "monthly",
        date(2026, 1, 31),
        date(2026, 1, 31),
        date(2026, 4, 30),
    )
    assert dates == [
        date(2026, 1, 31),
        date(2026, 2, 28),
        date(2026, 3, 31),
        date(2026, 4, 30),
    ]


def test_due_dates_respects_max_count() -> None:
    dates = due_dates(
        "daily",
        date(2026, 1, 1),
        date(2026, 1, 1),
        date(2026, 12, 31),
        max_count=10,
    )
    assert len(dates) == 10
    assert dates[0] == date(2026, 1, 1)
    assert dates[-1] == date(2026, 1, 10)


def test_due_dates_returns_empty_when_first_is_after_today() -> None:
    assert (
        due_dates(
            "monthly",
            date(2026, 1, 31),
            date(2026, 3, 31),
            date(2026, 2, 28),
        )
        == []
    )
    assert due_dates("daily", date(2026, 1, 1), date(2026, 1, 1), date(2026, 1, 1), 0) == []


def test_invalid_freq_raises() -> None:
    with pytest.raises(ValueError):
        next_occurrence("biweekly", date(2026, 1, 1), date(2026, 1, 1))
