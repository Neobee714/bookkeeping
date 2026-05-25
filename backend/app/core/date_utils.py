from __future__ import annotations

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


def parse_iso_date(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise ValueError("date must be in YYYY-MM-DD format") from exc


def month_range(value: str | None) -> tuple[str, date, date]:
    if value:
        start = parse_year_month(value)
    else:
        start = month_start(date.today())
    end = add_months(start, 1)
    return start.strftime("%Y-%m"), start, end


def resolve_date_window(
    month: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
) -> tuple[str, date, date]:
    if start_date is None and end_date is None:
        return month_range(month)

    if not start_date or not end_date:
        raise ValueError("start_date and end_date must both be provided")

    start = parse_iso_date(start_date)
    end = parse_iso_date(end_date)
    if start >= end:
        raise ValueError("start_date must be earlier than end_date")

    month_text = parse_year_month(month).strftime("%Y-%m") if month else start.strftime("%Y-%m")
    return month_text, start, end
