from __future__ import annotations

from calendar import monthrange
from datetime import date, datetime, time, timedelta, timezone

REPORT_KINDS = ("weekly", "monthly", "quarterly", "yearly")

# 业务时区固定 Asia/Shanghai（无夏令时，固定 +08:00）。
BEIJING_TZ = timezone(timedelta(hours=8))

# 季报的生成月份：每季度首月。
_QUARTER_FIRST_MONTHS = (1, 4, 7, 10)


def beijing_now() -> datetime:
    """当前北京时间（naive），不依赖容器本地时区。"""
    return (datetime.now(timezone.utc) + timedelta(hours=8)).replace(tzinfo=None)


def _validate_kind(kind: str) -> None:
    if kind not in REPORT_KINDS:
        raise ValueError(f"不支持的报告周期: {kind}")


def _month_end(year: int, month: int) -> date:
    return date(year, month, monthrange(year, month)[1])


def _quarter_first_month(month: int) -> int:
    return ((month - 1) // 3) * 3 + 1


def period_bounds(kind: str, today: date) -> tuple[date, date]:
    """最近一个已完整结束的自然周期（闭区间）。"""
    _validate_kind(kind)

    if kind == "weekly":
        monday = today - timedelta(days=today.weekday())
        start = monday - timedelta(days=7)
        return start, start + timedelta(days=6)

    if kind == "monthly":
        current_first = date(today.year, today.month, 1)
        end = current_first - timedelta(days=1)
        return date(end.year, end.month, 1), end

    if kind == "quarterly":
        current_quarter = date(today.year, _quarter_first_month(today.month), 1)
        end = current_quarter - timedelta(days=1)
        return date(end.year, _quarter_first_month(end.month), 1), end

    return date(today.year - 1, 1, 1), date(today.year - 1, 12, 31)


def period_label(kind: str, start: date) -> str:
    """报告周期标签，如「2026 年 10 月」「2026 年第 3 季度」。"""
    _validate_kind(kind)

    if kind == "weekly":
        iso_year, iso_week, _ = start.isocalendar()
        return f"{iso_year} 年第 {iso_week} 周"
    if kind == "monthly":
        return f"{start.year} 年 {start.month} 月"
    if kind == "quarterly":
        return f"{start.year} 年第 {_quarter_first_month(start.month) // 3 + 1} 季度"
    return f"{start.year} 年"


def previous_period(kind: str, start: date) -> tuple[date, date]:
    """给定某个周期的起点，返回紧邻的上一个同类型周期（闭区间）。"""
    _validate_kind(kind)

    if kind == "weekly":
        prev_start = start - timedelta(days=7)
        return prev_start, start - timedelta(days=1)

    if kind == "monthly":
        end = start - timedelta(days=1)
        return date(end.year, end.month, 1), end

    if kind == "quarterly":
        end = start - timedelta(days=1)
        return date(end.year, _quarter_first_month(end.month), 1), end

    return date(start.year - 1, 1, 1), date(start.year - 1, 12, 31)


def next_run_at(
    kind: str,
    anchor_weekday: int | None,
    anchor_day: int | None,
    anchor_hour: int,
    after: datetime,
) -> datetime:
    """严格晚于 after 的下一个生成时点（naive 北京时间）。"""
    _validate_kind(kind)
    if not 0 <= anchor_hour <= 23:
        raise ValueError(f"生成时点超出范围: {anchor_hour}")

    if kind == "weekly":
        if anchor_weekday is None or not 1 <= anchor_weekday <= 7:
            raise ValueError(f"周报生成星期超出范围: {anchor_weekday}")
        target_weekday = anchor_weekday - 1  # 1=周一 → Python 0
        offset = (target_weekday - after.weekday()) % 7
        candidate = datetime.combine(after.date() + timedelta(days=offset), time(anchor_hour))
        if candidate <= after:
            candidate += timedelta(days=7)
        return candidate

    if kind == "monthly":
        allowed_months = tuple(range(1, 13))
    elif kind == "quarterly":
        allowed_months = _QUARTER_FIRST_MONTHS
    else:
        allowed_months = (1,)

    if anchor_day is None or not 1 <= anchor_day <= 28:
        raise ValueError(f"生成日超出范围: {anchor_day}")

    year, month = after.year, after.month
    # 最多向前找 5 年，足够覆盖年报的年度跳转。
    for _ in range(60):
        if month in allowed_months:
            candidate = datetime.combine(date(year, month, anchor_day), time(anchor_hour))
            if candidate > after:
                return candidate
        if month == 12:
            year, month = year + 1, 1
        else:
            month += 1

    raise ValueError("无法在限定迭代次数内计算下一次生成时点")


def report_kind_word(kind: str, start: date) -> str:
    """headline 里使用的周期词：这一周 / 10 月 / 第 3 季度 / 2025 年。"""
    _validate_kind(kind)

    if kind == "weekly":
        return "这一周"
    if kind == "monthly":
        return f"{start.month} 月"
    if kind == "quarterly":
        return f"第 {_quarter_first_month(start.month) // 3 + 1} 季度"
    return f"{start.year} 年"
