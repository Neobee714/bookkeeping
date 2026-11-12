from __future__ import annotations

import json
import logging
from datetime import date, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.enums import TransactionType
from app.models.report import Report, ReportSchedule
from app.models.transaction import Transaction
from app.services.merchant_stats import aggregate_named_dimension, dining_summary
from app.services.report_periods import (
    beijing_now,
    next_run_at,
    period_bounds,
    period_label,
    previous_period,
    report_kind_word,
)

logger = logging.getLogger("bookkeeping.reports")

MAX_TOP_EXPENSES = 3
MAX_TOP_NAMED = 5
_WEEKDAY_LABELS = ("周一", "周二", "周三", "周四", "周五", "周六", "周日")
_CENT = Decimal("0.01")
_TENTH = Decimal("0.1")
_ONE = Decimal("1")


def _dec(value: Any) -> Decimal:
    if value is None:
        return Decimal("0")
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def _money(value: Any) -> float:
    """金额转 float，保留 2 位。"""
    return float(_dec(value).quantize(_CENT, rounding=ROUND_HALF_UP))


def _percent_int(value: float) -> int:
    """百分数四舍五入到整数（展示用，避免银行家舍入）。"""
    return int(Decimal(str(value)).quantize(_ONE, rounding=ROUND_HALF_UP))


def _delta_pct(current: Decimal, previous: Decimal) -> float | None:
    """环比百分比，保留 1 位；上期为 0 时无法计算，返回 None。"""
    if previous == 0:
        return None
    return float(
        ((current - previous) / previous * 100).quantize(_TENTH, rounding=ROUND_HALF_UP)
    )


def _period_totals(
    db: Session, user_id: int, start: date, end: date
) -> tuple[Decimal, Decimal, int, int]:
    """返回 (收入, 支出, 笔数, 有账单的天数)，只统计本人。"""
    rows = db.execute(
        select(
            Transaction.type,
            func.coalesce(func.sum(Transaction.amount), Decimal("0")),
            func.count(Transaction.id),
        )
        .where(
            Transaction.user_id == user_id,
            Transaction.date >= start,
            Transaction.date <= end,
        )
        .group_by(Transaction.type)
    ).all()

    income = Decimal("0")
    expense = Decimal("0")
    count = 0
    for tx_type, amount_sum, tx_count in rows:
        total = _dec(amount_sum)
        count += int(tx_count or 0)
        if tx_type == TransactionType.INCOME:
            income += total
        elif tx_type == TransactionType.EXPENSE:
            expense += total

    active_days = int(
        db.scalar(
            select(func.count(func.distinct(Transaction.date))).where(
                Transaction.user_id == user_id,
                Transaction.date >= start,
                Transaction.date <= end,
            )
        )
        or 0
    )
    return income, expense, count, active_days


def _build_categories(
    db: Session, user_id: int, start: date, end: date, total_expense: Decimal
) -> list[dict[str, Any]]:
    rows = db.execute(
        select(
            Transaction.category,
            func.coalesce(func.sum(Transaction.amount), Decimal("0")),
        )
        .where(
            Transaction.user_id == user_id,
            Transaction.date >= start,
            Transaction.date <= end,
            Transaction.type == TransactionType.EXPENSE,
        )
        .group_by(Transaction.category)
    ).all()

    buckets = sorted(
        ((category, _dec(amount)) for category, amount in rows),
        key=lambda pair: (-pair[1], pair[0]),
    )
    if total_expense <= 0:
        return []

    categories: list[dict[str, Any]] = []
    for category, amount in buckets:
        share = (amount / total_expense * 100).quantize(_TENTH, rounding=ROUND_HALF_UP)
        categories.append(
            {"name": category, "amount": _money(amount), "share": float(share)}
        )
    return categories


def _build_top_expenses(
    db: Session, user_id: int, start: date, end: date
) -> list[dict[str, Any]]:
    rows = db.execute(
        select(
            Transaction.amount,
            Transaction.category,
            Transaction.note,
            Transaction.merchant,
            Transaction.item,
            Transaction.date,
        )
        .where(
            Transaction.user_id == user_id,
            Transaction.date >= start,
            Transaction.date <= end,
            Transaction.type == TransactionType.EXPENSE,
        )
        .order_by(
            Transaction.amount.desc(),
            Transaction.date.desc(),
            Transaction.id.desc(),
        )
        .limit(MAX_TOP_EXPENSES)
    ).all()

    return [
        {
            "amount": _money(amount),
            "category": category,
            "note": note,
            "merchant": merchant,
            "item": item,
            "date": tx_date.isoformat(),
        }
        for amount, category, note, merchant, item, tx_date in rows
    ]


def _build_dining_insights(
    merchants: list[dict[str, Any]],
    items: list[dict[str, Any]],
    dining: dict[str, Any],
) -> list[str]:
    """最多三条吃喝洞察；没有数据时返回空数组。"""
    insights: list[str] = []

    if merchants:
        top_merchant = max(
            merchants, key=lambda item: (item["count"], item["amount"], item["name"])
        )
        insights.append(
            f"最常去 {top_merchant['name']}，{top_merchant['count']} 次"
            f"共 ¥{top_merchant['amount']:,.0f}"
        )

    if items:
        top_item = max(items, key=lambda item: (item["count"], item["amount"], item["name"]))
        insights.append(
            f"最常吃 {top_item['name']}，{top_item['count']} 次共 ¥{top_item['amount']:,.0f}"
        )

    if dining["count"] > 0:
        insights.append(
            f"餐饮 {dining['count']} 次，平均每次 ¥{dining['avg']:,.0f}"
        )

    return insights[:3]


def _trend_layout(kind: str, start: date, end: date) -> tuple[str, list[str]]:
    if kind == "weekly":
        return "day", list(_WEEKDAY_LABELS)
    if kind == "monthly":
        period_days = (end - start).days + 1
        bucket_count = (period_days + 6) // 7
        return "week", [f"W{index + 1}" for index in range(bucket_count)]
    if kind == "quarterly":
        return "month", [f"{start.month + index} 月" for index in range(3)]
    return "month", [f"{month} 月" for month in range(1, 13)]


def _trend_bucket_index(kind: str, start: date, tx_date: date) -> int:
    if kind == "weekly":
        return (tx_date - start).days
    if kind == "monthly":
        return (tx_date.day - 1) // 7
    if kind == "quarterly":
        return (tx_date.year - start.year) * 12 + (tx_date.month - start.month)
    return tx_date.month - 1


def _build_trend(
    db: Session, user_id: int, kind: str, start: date, end: date
) -> dict[str, Any]:
    unit, labels = _trend_layout(kind, start, end)
    buckets = [Decimal("0") for _ in labels]

    rows = db.execute(
        select(
            Transaction.date,
            func.coalesce(func.sum(Transaction.amount), Decimal("0")),
        )
        .where(
            Transaction.user_id == user_id,
            Transaction.date >= start,
            Transaction.date <= end,
            Transaction.type == TransactionType.EXPENSE,
        )
        .group_by(Transaction.date)
    ).all()

    for tx_date, amount_sum in rows:
        index = _trend_bucket_index(kind, start, tx_date)
        if 0 <= index < len(buckets):
            buckets[index] += _dec(amount_sum)

    return {
        "unit": unit,
        "points": [
            {"label": label, "expense": _money(amount)}
            for label, amount in zip(labels, buckets)
        ],
    }


def _build_prev(
    db: Session, user_id: int, kind: str, start: date, income: Decimal, expense: Decimal
) -> tuple[str, dict[str, Any] | None]:
    prev_start, prev_end = previous_period(kind, start)
    prev_income, prev_expense, prev_count, _ = _period_totals(
        db, user_id, prev_start, prev_end
    )
    if prev_count == 0:
        return period_label(kind, prev_start), None

    return period_label(kind, prev_start), {
        "total_income": _money(prev_income),
        "total_expense": _money(prev_expense),
        "expense_delta_pct": _delta_pct(expense, prev_expense),
        "income_delta_pct": _delta_pct(income, prev_income),
    }


def _build_insights(
    *,
    transaction_count: int,
    total_income: float,
    total_expense: float,
    balance: float,
    savings_rate: float | None,
    categories: list[dict[str, Any]],
    top_expenses: list[dict[str, Any]],
    prev: dict[str, Any] | None,
    prev_label: str,
) -> list[str]:
    insights: list[str] = []

    if categories:
        top = categories[0]
        insights.append(
            f"{top['name']}花了 ¥{top['amount']:,.0f}，"
            f"占支出的 {_percent_int(top['share'])}%，是本期最大开销"
        )

    if top_expenses:
        top = top_expenses[0]
        tx_date = date.fromisoformat(top["date"])
        note = (
            (top.get("item") or top.get("merchant") or top.get("note") or "").strip()
            or top["category"]
        )
        insights.append(
            f"最大单笔是 {tx_date.month} 月 {tx_date.day} 日的「{note}」"
            f"¥{top['amount']:,.0f}"
        )

    if transaction_count:
        if balance < 0:
            insights.append(
                f"收入 ¥{total_income:,.0f}，支出 ¥{total_expense:,.0f}，"
                f"超支 ¥{abs(balance):,.0f}"
            )
        elif savings_rate is not None:
            insights.append(
                f"收入 ¥{total_income:,.0f}，支出 ¥{total_expense:,.0f}，"
                f"结余 ¥{balance:,.0f}（储蓄率 {_percent_int(savings_rate)}%）"
            )

    if prev is not None and prev["expense_delta_pct"] is not None:
        delta = float(prev["expense_delta_pct"])
        if delta > 0:
            insights.append(f"支出比 {prev_label}增加了 {delta:.1f}%")
        elif delta < 0:
            insights.append(f"支出比 {prev_label}减少了 {abs(delta):.1f}%")
        else:
            insights.append(f"支出与 {prev_label} 持平")

    return insights[:4]


def _build_headline(
    kind: str, start: date, transaction_count: int, balance: float, savings_rate: float | None
) -> str:
    word = report_kind_word(kind, start)
    if transaction_count == 0:
        return f"{word}，还没有记账"
    if balance < 0:
        return f"{word}，你超支了 ¥{abs(balance):,.0f}"
    if savings_rate is None:
        return f"{word}，收支相抵"
    return f"{word}，你存下了 {_percent_int(savings_rate)}%"


def build_content(
    db: Session, user_id: int, kind: str, start: date, end: date
) -> dict[str, Any]:
    """聚合本人指定周期的数据，生成报告 content 快照。"""
    income, expense, transaction_count, active_days = _period_totals(
        db, user_id, start, end
    )
    balance = income - expense
    period_days = (end - start).days + 1

    savings_rate: float | None = None
    if income > 0:
        savings_rate = float(
            (balance / income * 100).quantize(_TENTH, rounding=ROUND_HALF_UP)
        )

    total_income = _money(income)
    total_expense = _money(expense)
    balance_value = _money(balance)

    categories = _build_categories(db, user_id, start, end, expense)
    top_expenses = _build_top_expenses(db, user_id, start, end)
    prev_label, prev = _build_prev(db, user_id, kind, start, income, expense)
    end_exclusive = end + timedelta(days=1)
    merchants_all = aggregate_named_dimension(
        db,
        user_id=user_id,
        dimension="merchant",
        start=start,
        end_exclusive=end_exclusive,
        category="餐饮",
        limit=None,
    )
    items_all = aggregate_named_dimension(
        db,
        user_id=user_id,
        dimension="item",
        start=start,
        end_exclusive=end_exclusive,
        category="餐饮",
        limit=None,
    )
    merchants = merchants_all[:MAX_TOP_NAMED]
    items = items_all[:MAX_TOP_NAMED]
    dining = dining_summary(
        db, user_id=user_id, start=start, end_exclusive=end_exclusive
    )

    return {
        "headline": _build_headline(
            kind, start, transaction_count, balance_value, savings_rate
        ),
        "total_income": total_income,
        "total_expense": total_expense,
        "balance": balance_value,
        "savings_rate": savings_rate,
        "transaction_count": transaction_count,
        "active_days": active_days,
        "period_days": period_days,
        "daily_expense": _money(expense / Decimal(period_days)),
        "prev_label": prev_label,
        "prev": prev,
        "categories": categories,
        "top_expenses": top_expenses,
        "merchants": merchants,
        "items": items,
        "dining": dining,
        "dining_insights": _build_dining_insights(merchants_all, items_all, dining),
        "insights": _build_insights(
            transaction_count=transaction_count,
            total_income=total_income,
            total_expense=total_expense,
            balance=balance_value,
            savings_rate=savings_rate,
            categories=categories,
            top_expenses=top_expenses,
            prev=prev,
            prev_label=prev_label,
        ),
        "trend": _build_trend(db, user_id, kind, start, end),
    }


def ensure_report(
    db: Session, user_id: int, kind: str, start: date, end: date
) -> Report:
    """按唯一键取报告，不存在则生成；重复调用不会新增。"""
    existing = db.scalar(
        select(Report).where(
            Report.user_id == user_id,
            Report.kind == kind,
            Report.period_start == start,
        )
    )
    if existing is not None:
        return existing

    content = build_content(db, user_id, kind, start, end)
    report = Report(
        user_id=user_id,
        kind=kind,
        label=period_label(kind, start),
        period_start=start,
        period_end=end,
        generated_at=beijing_now(),
        content=json.dumps(content, ensure_ascii=False),
    )
    db.add(report)
    try:
        db.commit()
    except IntegrityError:
        # 并发生成撞唯一键：回滚后返回已存在的那份。
        db.rollback()
        existing = db.scalar(
            select(Report).where(
                Report.user_id == user_id,
                Report.kind == kind,
                Report.period_start == start,
            )
        )
        if existing is not None:
            return existing
        raise
    db.refresh(report)
    return report


def generate_due_reports(db: Session, now: datetime | None = None) -> int:
    """生成到期设置的最近一期报告，返回新增数量。单条失败不阻塞其它设置。"""
    reference = now or beijing_now()

    schedule_ids = list(
        db.scalars(
            select(ReportSchedule.id)
            .where(
                ReportSchedule.enabled.is_(True),
                ReportSchedule.next_run_at.is_not(None),
                ReportSchedule.next_run_at <= reference,
            )
            .order_by(ReportSchedule.next_run_at.asc(), ReportSchedule.id.asc())
        ).all()
    )

    created_total = 0
    for schedule_id in schedule_ids:
        try:
            schedule = db.get(ReportSchedule, schedule_id)
            if (
                schedule is None
                or not schedule.enabled
                or schedule.next_run_at is None
                or schedule.next_run_at > reference
            ):
                continue

            start, end = period_bounds(schedule.kind, reference.date())
            existed = db.scalar(
                select(Report.id).where(
                    Report.user_id == schedule.user_id,
                    Report.kind == schedule.kind,
                    Report.period_start == start,
                )
            )
            ensure_report(db, schedule.user_id, schedule.kind, start, end)
            if existed is None:
                created_total += 1

            schedule.last_period_end = end
            schedule.next_run_at = next_run_at(
                schedule.kind,
                schedule.anchor_weekday,
                schedule.anchor_day,
                schedule.anchor_hour,
                reference,
            )
            db.commit()
        except Exception:
            db.rollback()
            logger.exception("财报生成失败 report_schedule_id=%s", schedule_id)

    return created_total
