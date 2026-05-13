from __future__ import annotations

import calendar
from datetime import date


def month_start(target_date: date) -> date:
    return target_date.replace(day=1)


def add_months(target_date: date, months: int) -> date:
    month_index = (target_date.year * 12 + target_date.month - 1) + months
    year, month_zero_based = divmod(month_index, 12)
    return date(year, month_zero_based + 1, 1)


def parse_year_month(value: str) -> date:
    try:
        year_str, month_str = value.split("-")
        year = int(year_str)
        month = int(month_str)
        return date(year, month, 1)
    except Exception as exc:
        raise ValueError("month must be in YYYY-MM format") from exc


def month_range(value: str | None) -> tuple[str, date, date]:
    if value:
        start = parse_year_month(value)
    else:
        start = month_start(date.today())
    end = add_months(start, 1)
    return start.strftime("%Y-%m"), start, end


def billing_range(natural_month: str, month_start_day: int) -> tuple[str, date, date]:
    """
    Convert a natural month (YYYY-MM) to a billing period date range.

    If month_start_day == 1: returns the standard calendar month range.
    If month_start_day > 1: period starts on that day of the PREVIOUS month
    and ends (exclusive) on that day of the current month.

    Example (month_start_day=5, natural_month="2026-06"):
        start = 2026-05-05, end = 2026-06-05 (exclusive → up to 2026-06-04)
    """
    year, month = int(natural_month[:4]), int(natural_month[5:7])

    if month_start_day <= 1:
        # Standard calendar month
        start = date(year, month, 1)
        end = add_months(start, 1)
        return start.strftime("%Y-%m"), start, end

    # Billing period: starts on month_start_day of previous month
    prev_month_start = add_months(date(year, month, 1), -1)
    prev_month_days = calendar.monthrange(prev_month_start.year, prev_month_start.month)[1]
    start_day = min(month_start_day, prev_month_days)

    current_month_days = calendar.monthrange(year, month)[1]
    end_day = min(month_start_day, current_month_days)

    start = date(prev_month_start.year, prev_month_start.month, start_day)
    end = date(year, month, end_day)

    # Safety fallback: if start >= end (e.g. month_start_day=31 in Feb),
    # fall back to calendar month
    if start >= end:
        start = date(year, month, 1)
        end = add_months(start, 1)

    return start.strftime("%Y-%m"), start, end
