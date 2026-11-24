from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal


@dataclass
class BillRow:
    client_id: str
    date: date
    amount: Decimal
    type: str  # expense / income
    merchant: str
    note: str
    external_id: str
    channel: str = ""
    # 账单本身能直接判定的分类（转账/红包/提现），优先于关键词规则
    category_hint: str = ""


@dataclass
class SkippedRow:
    reason: str
    date: date | None
    amount: Decimal | None
    merchant: str
    type: str


@dataclass
class ParsedBill:
    source: str
    rows: list[BillRow] = field(default_factory=list)
    skipped: list[SkippedRow] = field(default_factory=list)
    account: str = ""
    start: date | None = None
    end: date | None = None
    # 账单抬头自带的统计，用于和解析结果对账
    declared: dict[str, str] = field(default_factory=dict)


class BillParseError(Exception):
    """账单文件无法识别或解析。"""
