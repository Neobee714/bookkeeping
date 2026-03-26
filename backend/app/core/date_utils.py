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


def month_range(value: str | None) -> tuple[str, date, date]:
    if value:
        start = parse_year_month(value)
    else:
        start = month_start(date.today())
    end = add_months(start, 1)
    return start.strftime("%Y-%m"), start, end
