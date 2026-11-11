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


# ---------- 工作日类频率 ----------


def test_is_workday_and_last_workday_of_month() -> None:
    from app.services.recurring_dates import is_workday, last_workday_of_month

    assert is_workday(date(2026, 11, 6))  # 周五
    assert not is_workday(date(2026, 11, 7))  # 周六
    # 11-30 是周一；5-31 是周日 → 退到 5-29；2027-02-28 是周日 → 退到 2-26
    assert last_workday_of_month(2026, 11) == date(2026, 11, 30)
    assert last_workday_of_month(2026, 5) == date(2026, 5, 29)
    assert last_workday_of_month(2027, 2) == date(2027, 2, 26)


def test_nth_workday_and_index() -> None:
    from app.services.recurring_dates import nth_workday_of_month, workday_index_in_month

    assert nth_workday_of_month(2026, 11, 1) == date(2026, 11, 2)  # 11-01 周日
    assert nth_workday_of_month(2026, 11, 4) == date(2026, 11, 5)
    assert workday_index_in_month(date(2026, 11, 5)) == 4
    assert workday_index_in_month(date(2026, 11, 7)) == 5  # 周六按它之前的工作日数
    # 该月工作日不足时退化为最后一个工作日
    assert nth_workday_of_month(2026, 11, 22) == date(2026, 11, 30)


def test_workday_freq_skips_weekend() -> None:
    # 周五之后是下周一
    assert next_occurrence("workday", date(2026, 11, 2), date(2026, 11, 6)) == date(2026, 11, 9)
    # 首次日期落在周六 → 顺延到周一
    assert first_occurrence_on_or_after(
        "workday", date(2026, 11, 7), date(2026, 11, 7)
    ) == date(2026, 11, 9)
    # 过去的首次日期 → 取 >= floor 的第一个工作日
    assert first_occurrence_on_or_after(
        "workday", date(2026, 1, 1), date(2026, 11, 7)
    ) == date(2026, 11, 9)
    assert first_occurrence_on_or_after(
        "workday", date(2026, 1, 1), date(2026, 11, 10)
    ) == date(2026, 11, 10)


def test_monthly_last_workday_freq() -> None:
    # 下一次到期日是下一个月的最后工作日
    assert next_occurrence(
        "monthly_last_workday", date(2026, 11, 5), date(2026, 11, 30)
    ) == date(2026, 12, 31)
    # 首次：上限落在本月最后工作日之前 → 本月最后工作日
    assert first_occurrence_on_or_after(
        "monthly_last_workday", date(2026, 11, 5), date(2026, 11, 10)
    ) == date(2026, 11, 30)
    # 上限已经越过本月最后工作日 → 顺延到下个月
    assert first_occurrence_on_or_after(
        "monthly_last_workday", date(2026, 11, 5), date(2026, 12, 1)
    ) == date(2026, 12, 31)


def test_monthly_nth_workday_freq_anchors_on_start_date() -> None:
    start = date(2026, 11, 5)  # 当月第 4 个工作日
    assert next_occurrence("monthly_nth_workday", start, start) == date(2026, 12, 4)
    assert first_occurrence_on_or_after(
        "monthly_nth_workday", start, date(2026, 11, 10)
    ) == date(2026, 12, 4)
    assert first_occurrence_on_or_after(
        "monthly_nth_workday", start, date(2027, 3, 1)
    ) == date(2027, 3, 4)


def test_workday_due_dates_fill_only_weekdays() -> None:
    dates = due_dates(
        "workday",
        date(2026, 11, 2),
        date(2026, 11, 2),
        date(2026, 11, 10),
    )
    assert dates == [
        date(2026, 11, 2),
        date(2026, 11, 3),
        date(2026, 11, 4),
        date(2026, 11, 5),
        date(2026, 11, 6),
        date(2026, 11, 9),
        date(2026, 11, 10),
    ]
