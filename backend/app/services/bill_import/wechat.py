"""微信支付账单解析（xlsx / csv 两种导出格式）。"""

from __future__ import annotations

import csv
import io
import re
from collections.abc import Iterable, Sequence
from datetime import datetime
from decimal import Decimal, InvalidOperation

from . import enrich
from .bill_types import BillParseError, BillRow, ParsedBill, SkippedRow

SOURCE = "wechat"

# 这些交易类型不是消费：转账给个人、红包、提现、零钱通存取
TRANSFER_TYPES = ("转账", "微信红包", "零钱提现", "转入零钱通", "零钱通转出", "信用卡还款")

COLUMNS = {
    "time": ("交易时间",),
    "kind": ("交易类型",),
    "counterparty": ("交易对方",),
    "goods": ("商品", "商品名称"),
    "direction": ("收/支",),
    "amount": ("金额(元)", "金额（元）"),
    "status": ("当前状态", "交易状态"),
    "trade_no": ("交易单号", "交易号"),
}


class _Header(tuple):
    """表头到列下标的映射。"""

    def index_of(self, key: str) -> int | None:
        for name in COLUMNS[key]:
            if name in self:
                return self.index(name)
        return None


def _amount(text: str) -> Decimal | None:
    cleaned = text.strip().replace("¥", "").replace("￥", "").replace(",", "")
    if not cleaned:
        return None
    try:
        return Decimal(cleaned).quantize(Decimal("0.01"))
    except InvalidOperation:
        return None


def _parse_time(text: str) -> datetime | None:
    text = text.strip()
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue
    return None


def _clean_merchant(text: str) -> str:
    value = (text or "").strip()
    if value in {"", "/", "None"}:
        return ""
    return value[:50]


def _skip_reason(kind: str, direction: str, status: str) -> str | None:
    if direction not in {"支出", "收入"}:
        return "中性交易"
    if "退款" in status:
        return "退款"
    if "退款" in kind:
        return "退款"
    if kind.startswith(TRANSFER_TYPES):
        return "转账/红包"
    return None


def _parse_declared(line: str, declared: dict[str, str]) -> None:
    match = re.search(r"共(\d+)笔", line)
    if match:
        declared["total"] = match.group(1)
    for label, key in (("收入", "income"), ("支出", "expense"), ("中性交易", "neutral")):
        found = re.search(rf"{label}：(\d+)笔\s*([\d.]+)元", line)
        if found:
            declared[f"{key}_count"] = found.group(1)
            declared[f"{key}_amount"] = found.group(2)
    nickname = re.search(r"微信昵称：\[(.*?)\]", line)
    if nickname:
        declared["account"] = nickname.group(1)


def _build(rows: Iterable[Sequence[object]], declared: dict[str, str]) -> ParsedBill:
    matrix = [[("" if cell is None else str(cell).strip()) for cell in row] for row in rows]
    header_index = None
    header: _Header | None = None
    for index, row in enumerate(matrix):
        if not row:
            continue
        if "交易时间" in row:
            header_index = index
            header = _Header(row)
            break
    if header_index is None or header is None:
        raise BillParseError("没有找到微信账单表头（交易时间/交易单号）")

    idx = {key: header.index_of(key) for key in COLUMNS}
    if idx["trade_no"] is None or idx["amount"] is None or idx["direction"] is None:
        raise BillParseError("微信账单缺少必要列")

    bill = ParsedBill(source=SOURCE, account=declared.get("account", ""), declared=declared)

    for row in matrix[header_index + 1 :]:
        if not row or not any(row):
            continue

        def get(key: str) -> str:
            position = idx[key]
            if position is None or position >= len(row):
                return ""
            return row[position]

        moment = _parse_time(get("time"))
        amount = _amount(get("amount"))
        trade_no = get("trade_no")
        if moment is None or amount is None or not trade_no:
            continue

        kind = get("kind")
        direction = get("direction")
        status = get("status")
        raw_merchant = _clean_merchant(get("counterparty"))
        channel = enrich.detect_channel(raw_merchant)
        merchant, note_text = enrich.resolve_party(raw_merchant, get("goods"), channel)
        day = moment.date()

        reason = _skip_reason(kind, direction, status)
        if reason:
            bill.skipped.append(
                SkippedRow(
                    reason=reason,
                    date=day,
                    amount=amount,
                    merchant=raw_merchant,
                    type="income" if direction == "收入" else "expense",
                )
            )
            continue

        bill.rows.append(
            BillRow(
                client_id=f"{SOURCE}:{trade_no}"[:64],
                date=day,
                amount=amount,
                type="income" if direction == "收入" else "expense",
                merchant=merchant,
                note=note_text,
                external_id=trade_no,
                channel=channel,
            )
        )
        if bill.start is None or day < bill.start:
            bill.start = day
        if bill.end is None or day > bill.end:
            bill.end = day

    if not bill.rows and not bill.skipped:
        raise BillParseError("账单里没有可解析的记录")
    return bill


def parse_xlsx(data: bytes) -> ParsedBill:
    try:
        from openpyxl import load_workbook
    except ImportError as exc:  # pragma: no cover - 部署环境已安装
        raise BillParseError("服务端缺少 openpyxl，无法解析 xlsx") from exc

    workbook = load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    sheet = workbook[workbook.sheetnames[0]]
    rows = list(sheet.iter_rows(values_only=True))
    workbook.close()

    declared: dict[str, str] = {}
    for row in rows[:20]:
        for cell in row:
            if cell is not None:
                _parse_declared(str(cell), declared)
    return _build(rows, declared)


def parse_csv(text: str) -> ParsedBill:
    rows = list(csv.reader(io.StringIO(text)))
    declared: dict[str, str] = {}
    for row in rows[:20]:
        for cell in row:
            _parse_declared(cell, declared)
    return _build(rows, declared)


def parse(data: bytes, text: str | None = None) -> ParsedBill:
    """xlsx 走 openpyxl；csv 传入已解码文本。"""
    if data[:2] == b"PK":
        return parse_xlsx(data)
    if text is None:
        raise BillParseError("无法识别微信账单编码")
    return parse_csv(text)
