from __future__ import annotations

from calendar import monthrange
from datetime import date, timedelta

BASE_FREQS = ("daily", "weekly", "monthly", "yearly")

# 工作日类频率。工作日一律按「周一至周五」计算，不含法定节假日
# （节假日每年由国务院公布，需要维护假日表；本版不假装支持）。
WORKDAY_FREQS = ("workday", "monthly_last_workday", "monthly_nth_workday")

FREQS = BASE_FREQS + WORKDAY_FREQS

# first_occurrence_on_or_after 的防御性迭代上限。
MAX_ITERATIONS = 500


def _validate_freq(freq: str) -> None:
    if freq not in FREQS:
        raise ValueError(f"不支持的重复频率: {freq}")


def month_day(year: int, month: int, day: int) -> date:
    """把 (年, 月, day) 夹到该月最后一天。"""
    last_day = monthrange(year, month)[1]
    return date(year, month, min(day, last_day))


def is_workday(value: date) -> bool:
    """周一至周五视为工作日（不含法定节假日）。"""
    return value.weekday() < 5


def _next_month(year: int, month: int) -> tuple[int, int]:
    return (year + 1, 1) if month == 12 else (year, month + 1)


def last_workday_of_month(year: int, month: int) -> date:
    """当月最后一个工作日（从月末往前找到第一个周一到周五）。"""
    cursor = date(year, month, monthrange(year, month)[1])
    while not is_workday(cursor):
        cursor -= timedelta(days=1)
    return cursor


def workday_index_in_month(value: date) -> int:
    """value 是当月第几个工作日（1 起）。周末按它之前的工作日数计。"""
    count = 0
    cursor = date(value.year, value.month, 1)
    while cursor < value:
        if is_workday(cursor):
            count += 1
        cursor += timedelta(days=1)
    if is_workday(value):
        count += 1
    return max(count, 1)


def nth_workday_of_month(year: int, month: int, index: int) -> date:
    """当月第 index 个工作日；该月工作日不足时退化为最后一个工作日。"""
    count = 0
    cursor = date(year, month, 1)
    while cursor.month == month:
        if is_workday(cursor):
            count += 1
            if count == max(index, 1):
                return cursor
        cursor += timedelta(days=1)
    return last_workday_of_month(year, month)


def next_occurrence(freq: str, start: date, current: date) -> date:
    """给定当前到期日，返回下一次到期日（严格晚于 current）。"""
    _validate_freq(freq)

    if freq == "daily":
        return current + timedelta(days=1)
    if freq == "weekly":
        return current + timedelta(days=7)
    if freq == "workday":
        cursor = current + timedelta(days=1)
        while not is_workday(cursor):
            cursor += timedelta(days=1)
        return cursor
    if freq == "monthly_last_workday":
        year, month = _next_month(current.year, current.month)
        return last_workday_of_month(year, month)
    if freq == "monthly_nth_workday":
        # 第 N 个工作日里的 N 由锚定日（首次日期）在当月的位置决定：
        # 11-05 是当月第 4 个工作日 → 以后每月第 4 个工作日。
        index = workday_index_in_month(start)
        year, month = _next_month(current.year, current.month)
        return nth_workday_of_month(year, month, index)
    if freq == "monthly":
        year, month = current.year, current.month + 1
        if month > 12:
            year += 1
            month = 1
        return month_day(year, month, start.day)
    # yearly
    return month_day(current.year + 1, start.month, start.day)


def _first_monthly_workday_on_or_after(freq: str, start: date, anchor: date) -> date:
    index = workday_index_in_month(start) if freq == "monthly_nth_workday" else 0
    year, month = anchor.year, anchor.month
    for _ in range(MAX_ITERATIONS):
        candidate = (
            last_workday_of_month(year, month)
            if freq == "monthly_last_workday"
            else nth_workday_of_month(year, month, index)
        )
        if candidate >= anchor:
            return candidate
        year, month = _next_month(year, month)
    raise ValueError("无法在限定迭代次数内计算下一次到期日")


def first_occurrence_on_or_after(freq: str, start: date, floor: date) -> date:
    """返回 >= floor 的第一个到期日（用于创建/恢复规则）。"""
    _validate_freq(freq)

    if freq == "workday":
        cursor = max(start, floor)
        while not is_workday(cursor):
            cursor += timedelta(days=1)
        return cursor

    if freq in ("monthly_last_workday", "monthly_nth_workday"):
        return _first_monthly_workday_on_or_after(freq, start, max(start, floor))

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
