from __future__ import annotations

from calendar import monthrange
from datetime import date, timedelta

FREQS = ("daily", "weekly", "monthly", "yearly")

# first_occurrence_on_or_after 的防御性迭代上限。
MAX_ITERATIONS = 500


def _validate_freq(freq: str) -> None:
    if freq not in FREQS:
        raise ValueError(f"不支持的重复频率: {freq}")


def month_day(year: int, month: int, day: int) -> date:
    """把 (年, 月, day) 夹到该月最后一天。"""
    last_day = monthrange(year, month)[1]
    return date(year, month, min(day, last_day))


def next_occurrence(freq: str, start: date, current: date) -> date:
    """给定当前到期日，返回下一次到期日（严格晚于 current）。"""
    _validate_freq(freq)

    if freq == "daily":
        return current + timedelta(days=1)
    if freq == "weekly":
        return current + timedelta(days=7)
    if freq == "monthly":
        year, month = current.year, current.month + 1
        if month > 12:
            year += 1
            month = 1
        return month_day(year, month, start.day)
    # yearly
    return month_day(current.year + 1, start.month, start.day)


def first_occurrence_on_or_after(freq: str, start: date, floor: date) -> date:
    """返回 >= floor 的第一个到期日（用于创建/恢复规则）。"""
    _validate_freq(freq)

    if start >= floor:
        return start

    if freq == "daily":
        return start + timedelta(days=(floor - start).days)

    if freq == "weekly":
        days = (floor - start).days
        steps = (days + 6) // 7
        return start + timedelta(weeks=steps)

    if freq == "monthly":
        months = (floor.year - start.year) * 12 + (floor.month - start.month)
        months = max(months, 0)
        year = start.year + (start.month - 1 + months) // 12
        month = (start.month - 1 + months) % 12 + 1
        current = month_day(year, month, start.day)
    else:  # yearly
        years = max(floor.year - start.year, 0)
        current = month_day(start.year + years, start.month, start.day)

    for _ in range(MAX_ITERATIONS):
        if current >= floor:
            return current
        current = next_occurrence(freq, start, current)

    raise ValueError("无法在限定迭代次数内计算下一次到期日")


def due_dates(
    freq: str,
    start: date,
    first: date,
    today: date,
    max_count: int = 400,
) -> list[date]:
    """从 first 起取所有 <= today 的到期日，最多 max_count 个。"""
    _validate_freq(freq)
    if max_count <= 0:
        return []

    dates: list[date] = []
    current = first
    while current <= today and len(dates) < max_count:
        dates.append(current)
        current = next_occurrence(freq, start, current)
    return dates
