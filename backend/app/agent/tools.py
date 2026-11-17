from __future__ import annotations

import ast
import functools
import logging
import re
import threading
import time
from datetime import date
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.date_utils import parse_iso_date
from app.models.category import Category
from app.models.enums import CategoryEnum, TransactionType
from app.models.transaction import Transaction
from app.models.user import User

Target = Literal["self", "partner", "both"]

logger = logging.getLogger(__name__)


def _brief(value: Any, limit: int = 240) -> str:
    """日志用的短摘要：repr 截断，避免把整段查询结果打进日志。"""
    text = repr(value)
    if len(text) > limit:
        return f"{text[:limit]}…(+{len(text) - limit})"
    return text


class AgentToolError(ValueError):
    pass


class DateWindowInput(BaseModel):
    target: Target = Field(default="self", description="查询范围：self、partner 或 both")
    start_date: str = Field(description="开始日期，格式 YYYY-MM-DD，包含当天")
    end_date: str = Field(description="结束日期，格式 YYYY-MM-DD，不包含当天")


class SummarizeExpensesInput(DateWindowInput):
    pass


class CategoryBreakdownInput(DateWindowInput):
    pass


class SearchTransactionsInput(DateWindowInput):
    type: TransactionType | None = Field(
        default=None, description="账单类型筛选：income（收入）或 expense（支出）；不传则收支都查"
    )
    category: str | None = Field(default=None, description="按分类筛选")
    note_keyword: str | None = Field(default=None, description="按备注关键词筛选")
    min_amount: Decimal | None = Field(default=None, ge=0, description="最小金额")
    max_amount: Decimal | None = Field(default=None, ge=0, description="最大金额")
    limit: int = Field(default=20, ge=1, le=200, description="返回数量")


class TopExpensesInput(DateWindowInput):
    type: TransactionType | None = Field(
        default=None, description="账单类型筛选：income（收入）或 expense（支出）；不传则收支都查"
    )
    category: str | None = Field(default=None, description="按分类筛选")
    limit: int = Field(default=10, ge=1, le=100, description="返回数量")


class CompareExpensesInput(BaseModel):
    target: Target = Field(default="self", description="查询范围：self、partner 或 both")
    start_date_a: str = Field(description="周期 A 开始日期，格式 YYYY-MM-DD，包含当天")
    end_date_a: str = Field(description="周期 A 结束日期，格式 YYYY-MM-DD，不包含当天")
    start_date_b: str = Field(description="周期 B 开始日期，格式 YYYY-MM-DD，包含当天")
    end_date_b: str = Field(description="周期 B 结束日期，格式 YYYY-MM-DD，不包含当天")


class CreateTransactionInput(BaseModel):
    amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2, description="金额，必须大于 0；可以用 107+129 这样的算式")
    type: TransactionType = Field(description="账单类型：income 或 expense")
    category: str = Field(min_length=1, max_length=10, description="账单分类")
    merchant: str | None = Field(default=None, max_length=50, description="商家/店名，可省略")
    note: str | None = Field(default=None, max_length=255, description="备注：消费明细或评价，可省略")
    date: str = Field(description="账单日期，格式 YYYY-MM-DD")

    @field_validator("amount", mode="before")
    @classmethod
    def evaluate_amount_expression(cls, value: object) -> object:
        """允许模型直接传「107+129」：只放行数字与 + - * / ( )，求值后再交给 Decimal 校验。"""
        if not isinstance(value, str):
            return value
        text = (
            value.strip()
            .replace("＋", "+")
            .replace("－", "-")
            .replace("×", "*")
            .replace("÷", "/")
            .replace("元", "")
            .replace(" ", "")
        )
        if not text or not re.fullmatch(r"[0-9+\-*/().]+", text):
            return value
        try:
            return _eval_amount_expression(ast.parse(text, mode="eval"))
        except (SyntaxError, ValueError, ZeroDivisionError):
            return value


def _eval_amount_expression(node: ast.AST) -> Decimal:
    """极小的算术求值器：只支持数字、四则运算、正负号与括号，不用 eval。"""
    if isinstance(node, ast.Expression):
        return _eval_amount_expression(node.body)
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return Decimal(str(node.value))
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
        operand = _eval_amount_expression(node.operand)
        return operand if isinstance(node.op, ast.UAdd) else -operand
    if isinstance(node, ast.BinOp):
        left = _eval_amount_expression(node.left)
        right = _eval_amount_expression(node.right)
        if isinstance(node.op, ast.Add):
            return left + right
        if isinstance(node.op, ast.Sub):
            return left - right
        if isinstance(node.op, ast.Mult):
            return left * right
        if isinstance(node.op, ast.Div):
            return left / right
    raise ValueError("不支持的金额表达式")


CATEGORY_VALUES = [category.value for category in CategoryEnum]


def categories_for_user(db: Session | None, user_id: int) -> list[str]:
    """当前用户可用的分类名：优先读用户自己的分类表，读不到时回退到内置枚举。"""
    if db is None:
        return list(CATEGORY_VALUES)
    names = [
        name
        for name in db.scalars(
            select(Category.name)
            .where(Category.user_id == user_id)
            .order_by(Category.id.asc())
        ).all()
        if name
    ]
    return names or CATEGORY_VALUES


# LangGraph 会把同一条消息里的多个工具调用放在线程池里并行执行，而这些工具共用同一个
# SQLAlchemy Session。不串行化就会出现 "commit() is already in progress"（用户看到的
# 「AI 助手暂时不可用」）。这里按进程加锁，保证同一时刻只有一个工具在碰 Session。
_TOOL_LOCK = threading.Lock()


def _serialized_tool(func: Any) -> Any:
    name = getattr(func, "__name__", "tool")

    @functools.wraps(func)
    def wrapper(**kwargs: Any) -> Any:
        logger.info("tool %s start args=%s", name, _brief(kwargs))
        wait_started = time.monotonic()
        with _TOOL_LOCK:
            lock_wait_ms = int((time.monotonic() - wait_started) * 1000)
            started = time.monotonic()
            try:
                result = func(**kwargs)
            except Exception:
                logger.exception(
                    "tool %s failed elapsed_ms=%d lock_wait_ms=%d",
                    name,
                    int((time.monotonic() - started) * 1000),
                    lock_wait_ms,
                )
                raise
            logger.info(
                "tool %s ok elapsed_ms=%d lock_wait_ms=%d result=%s",
                name,
                int((time.monotonic() - started) * 1000),
                lock_wait_ms,
                _brief(result),
            )
            return result

    return wrapper


def _to_float(value: Decimal | int | float | None) -> float:
    return round(float(value or Decimal("0")), 2)


def _parse_window(start_date: str, end_date: str) -> tuple[date, date]:
    try:
        start = parse_iso_date(start_date)
        end = parse_iso_date(end_date)
    except ValueError as exc:
        raise AgentToolError("日期格式不正确，请使用 YYYY-MM-DD") from exc
    if start >= end:
        raise AgentToolError("start_date must be earlier than end_date")
    return start, end


def resolve_target_user_ids(current_user: User, target: str) -> list[int]:
    if target == "self":
        return [current_user.id]

    if target == "partner":
        if not current_user.partner_id:
            raise AgentToolError("尚未绑定伴侣")
        return [current_user.partner_id]

    if target == "both":
        if not current_user.partner_id:
            raise AgentToolError("尚未绑定伴侣")
        return [current_user.id, current_user.partner_id]

    raise AgentToolError("查询范围不支持")


def _owner_label(user_id: int, current_user: User) -> str:
    if user_id == current_user.id:
        return "self"
    if user_id == current_user.partner_id:
        return "partner"
    return "unknown"


def _base_filters(
    current_user: User,
    payload: DateWindowInput,
) -> tuple[list[Any], date, date, list[int]]:
    start, end = _parse_window(payload.start_date, payload.end_date)
    user_ids = resolve_target_user_ids(current_user, payload.target)
    filters = [
        Transaction.user_id.in_(user_ids),
        Transaction.date >= start,
        Transaction.date < end,
    ]
    return filters, start, end, user_ids


def _summary_for_window(
    db: Session,
    current_user: User,
    payload: DateWindowInput,
) -> dict[str, Any]:
    filters, start, end, _user_ids = _base_filters(current_user, payload)

    totals_stmt = (
        select(Transaction.type, func.coalesce(func.sum(Transaction.amount), Decimal("0")))
        .where(*filters)
        .group_by(Transaction.type)
    )
    totals = {tx_type: amount for tx_type, amount in db.execute(totals_stmt).all()}
    total_income = totals.get(TransactionType.INCOME, Decimal("0"))
    total_expense = totals.get(TransactionType.EXPENSE, Decimal("0"))

    category_total = func.coalesce(func.sum(Transaction.amount), Decimal("0"))
    category_stmt = (
        select(Transaction.category, category_total, func.count(Transaction.id))
        .where(*filters, Transaction.type == TransactionType.EXPENSE)
        .group_by(Transaction.category)
        .order_by(category_total.desc(), Transaction.category.asc())
    )
    category_rows = db.execute(category_stmt).all()
    category_expenses = {category: _to_float(amount) for category, amount, _count in category_rows}
    category_counts = {category: int(count or 0) for category, _amount, count in category_rows}

    note_total = func.coalesce(func.sum(Transaction.amount), Decimal("0"))
    note_sort = func.coalesce(Transaction.note, "")
    notes_stmt = (
        select(
            Transaction.note,
            note_total,
            func.count(Transaction.id),
        )
        .where(*filters, Transaction.type == TransactionType.EXPENSE)
        .group_by(Transaction.note)
        .order_by(note_total.desc(), note_sort.asc())
        .limit(5)
    )
    top_notes = [
        {
            "note": note or "未备注",
            "amount": _to_float(amount),
            "count": int(count or 0),
        }
        for note, amount, count in db.execute(notes_stmt).all()
    ]

    count_stmt = select(func.count(Transaction.id)).where(*filters)
    transaction_count = int(db.scalar(count_stmt) or 0)

    return {
        "target": payload.target,
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "total_income": _to_float(total_income),
        "total_expense": _to_float(total_expense),
        "balance": _to_float(total_income - total_expense),
        "transaction_count": transaction_count,
        "category_expenses": category_expenses,
        "category_counts": category_counts,
        "top_notes": top_notes,
    }


def summarize_expenses_data(
    db: Session,
    current_user: User,
    payload: SummarizeExpensesInput,
) -> dict[str, Any]:
    return _summary_for_window(db, current_user, payload)


def category_breakdown_data(
    db: Session,
    current_user: User,
    payload: CategoryBreakdownInput,
) -> dict[str, Any]:
    summary = _summary_for_window(db, current_user, payload)
    total_expense = summary["total_expense"]
    categories = [
        {
            "category": category,
            "amount": amount,
            "ratio": round(amount / total_expense, 4) if total_expense else 0.0,
            "count": summary["category_counts"].get(category, 0),
        }
        for category, amount in summary["category_expenses"].items()
    ]
    categories.sort(key=lambda item: (-item["amount"], item["category"]))
    return {
        "target": summary["target"],
        "start_date": summary["start_date"],
        "end_date": summary["end_date"],
        "total_expense": total_expense,
        "categories": categories,
    }


def search_transactions_data(
    db: Session,
    current_user: User,
    payload: SearchTransactionsInput,
    max_limit: int,
) -> dict[str, Any]:
    filters, start, end, _user_ids = _base_filters(current_user, payload)

    if payload.type is not None:
        filters.append(Transaction.type == payload.type)

    if payload.category:
        filters.append(Transaction.category == payload.category)
    if payload.note_keyword:
        filters.append(Transaction.note.ilike(f"%{payload.note_keyword}%"))
    if payload.min_amount is not None:
        filters.append(Transaction.amount >= payload.min_amount)
    if payload.max_amount is not None:
        filters.append(Transaction.amount <= payload.max_amount)

    limit = min(payload.limit, max_limit)
    stmt = (
        select(Transaction)
        .where(*filters)
        .order_by(Transaction.amount.desc(), Transaction.date.desc(), Transaction.id.desc())
        .limit(limit + 1)
    )
    rows = list(db.scalars(stmt).all())
    truncated = len(rows) > limit
    transactions = rows[:limit]

    return {
        "target": payload.target,
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "limit": limit,
        "truncated": truncated,
        "items": [
            {
                "owner": _owner_label(transaction.user_id, current_user),
                "type": transaction.type.value,
                "amount": _to_float(transaction.amount),
                "category": transaction.category,
                "note": transaction.note,
                "date": transaction.date.isoformat(),
            }
            for transaction in transactions
        ],
    }


def top_expenses_data(
    db: Session,
    current_user: User,
    payload: TopExpensesInput,
    max_limit: int,
) -> dict[str, Any]:
    search_payload = SearchTransactionsInput(
        target=payload.target,
        start_date=payload.start_date,
        end_date=payload.end_date,
        type=payload.type,
        category=payload.category,
        limit=payload.limit,
    )
    return search_transactions_data(db, current_user, search_payload, max_limit=max_limit)


def compare_expenses_data(
    db: Session,
    current_user: User,
    payload: CompareExpensesInput,
) -> dict[str, Any]:
    period_a = _summary_for_window(
        db,
        current_user,
        SummarizeExpensesInput(
            target=payload.target,
            start_date=payload.start_date_a,
            end_date=payload.end_date_a,
        ),
    )
    period_b = _summary_for_window(
        db,
        current_user,
        SummarizeExpensesInput(
            target=payload.target,
            start_date=payload.start_date_b,
            end_date=payload.end_date_b,
        ),
    )
    return {
        "target": payload.target,
        "period_a": period_a,
        "period_b": period_b,
        "expense_delta": _to_float(period_b["total_expense"] - period_a["total_expense"]),
        "income_delta": _to_float(period_b["total_income"] - period_a["total_income"]),
    }


def create_transaction_data(
    db: Session,
    current_user: User,
    payload: CreateTransactionInput,
    allowed_categories: list[str] | None = None,
) -> dict[str, Any]:
    try:
        tx_date = parse_iso_date(payload.date)
    except ValueError as exc:
        raise AgentToolError("日期格式不正确，请使用 YYYY-MM-DD") from exc

    allowed = allowed_categories or categories_for_user(db, current_user.id)
    if payload.category not in allowed:
        raise AgentToolError(
            f"分类不支持：{payload.category}，可选：{'、'.join(allowed)}"
        )

    item = Transaction(
        user_id=current_user.id,
        amount=payload.amount,
        type=payload.type,
        category=payload.category,
        merchant=payload.merchant,
        note=payload.note,
        note_kind='evaluation' if payload.note else None,
        date=tx_date,
    )
    db.add(item)
    db.commit()
    db.refresh(item)

    return {
        "id": item.id,
        "amount": _to_float(item.amount),
        "type": item.type.value,
        "category": item.category,
        "merchant": item.merchant,
        "note": item.note,
        "date": item.date.isoformat(),
    }


def build_agent_tools(
    db: Session,
    current_user: User,
    max_transaction_limit: int,
    categories: list[str] | None = None,
) -> list[Any]:
    from langchain_core.tools import StructuredTool

    allowed_categories = categories or categories_for_user(db, current_user.id)

    def summarize_expenses(**kwargs: Any) -> dict[str, Any]:
        """Summarize income, expense, balance, categories, and notes for a date window."""
        return summarize_expenses_data(db, current_user, SummarizeExpensesInput(**kwargs))

    def category_breakdown(**kwargs: Any) -> dict[str, Any]:
        """Break down expense totals by category for a date window."""
        return category_breakdown_data(db, current_user, CategoryBreakdownInput(**kwargs))

    def search_transactions(**kwargs: Any) -> dict[str, Any]:
        """Search transactions (income or expense) by type, category, note keyword, amount, and date window."""
        return search_transactions_data(
            db,
            current_user,
            SearchTransactionsInput(**kwargs),
            max_limit=max_transaction_limit,
        )

    def top_expenses(**kwargs: Any) -> dict[str, Any]:
        """Return the largest transactions for a date window, optionally filtered by type (income or expense)."""
        return top_expenses_data(
            db,
            current_user,
            TopExpensesInput(**kwargs),
            max_limit=max_transaction_limit,
        )

    def compare_expenses(**kwargs: Any) -> dict[str, Any]:
        """Compare income and expense totals between two date windows."""
        return compare_expenses_data(db, current_user, CompareExpensesInput(**kwargs))

    def create_transaction(**kwargs: Any) -> dict[str, Any]:
        """Create a transaction for the current user, then return the created record."""
        return create_transaction_data(
            db,
            current_user,
            CreateTransactionInput(**kwargs),
            allowed_categories=allowed_categories,
        )

    return [
        StructuredTool.from_function(
            func=_serialized_tool(summarize_expenses),
            name="summarize_expenses",
            args_schema=SummarizeExpensesInput,
        ),
        StructuredTool.from_function(
            func=_serialized_tool(category_breakdown),
            name="category_breakdown",
            args_schema=CategoryBreakdownInput,
        ),
        StructuredTool.from_function(
            func=_serialized_tool(search_transactions),
            name="search_transactions",
            args_schema=SearchTransactionsInput,
        ),
        StructuredTool.from_function(
            func=_serialized_tool(top_expenses),
            name="top_expenses",
            args_schema=TopExpensesInput,
        ),
        StructuredTool.from_function(
            func=_serialized_tool(compare_expenses),
            name="compare_expenses",
            args_schema=CompareExpensesInput,
        ),
        StructuredTool.from_function(
            func=_serialized_tool(create_transaction),
            name="create_transaction",
            args_schema=CreateTransactionInput,
        ),
    ]
