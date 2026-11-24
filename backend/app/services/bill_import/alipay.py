"""支付宝账单解析（GBK 编码 CSV，16 列，前 4 行抬头）。"""

from __future__ import annotations

import csv
import io
import re
from datetime import datetime
from decimal import Decimal, InvalidOperation

from . import enrich
from .bill_types import BillParseError, BillRow, ParsedBill, SkippedRow

SOURCE = "alipay"

COLUMNS = {
    "trade_no": ("交易号",),
    "time": ("付款时间", "交易创建时间"),
    "counterparty": ("交易对方",),
    "goods": ("商品名称",),
    "amount": ("金额（元）", "金额(元)"),
    "direction": ("收/支",),
    "status": ("交易状态",),
    "note": ("备注",),
}


def _amount(text: str) -> Decimal | None:
    cleaned = text.strip().replace("¥", "").replace("￥", "").replace(",", "")
    if not cleaned:
        return None
    try:
        return Decimal(cleaned).quantize(Decimal("0.01"))
    except InvalidOperation:
        return None


def _parse_time(text: str) -> datetime | None:
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            return datetime.strptime(text.strip(), fmt)
        except ValueError:
            continue
    return None


def _clean(text: str, limit: int) -> str:
    value = (text or "").strip()
    if value in {"", "/", "None"}:
        return ""
    return value[:limit]


def parse(text: str) -> ParsedBill:
    rows: list[list[str]] = [
        [cell.strip() for cell in row] for row in csv.reader(io.StringIO(text))
    ]

    header_index = None
    for index, row in enumerate(rows):
        if "交易号" in row and "收/支" in row:
            header_index = index
            break
    if header_index is None:
        raise BillParseError("没有找到支付宝账单表头（交易号/收/支）")

    header = rows[header_index]
    idx = {}
    for key, names in COLUMNS.items():
        idx[key] = next((header.index(name) for name in names if name in header), None)
    if idx["trade_no"] is None or idx["amount"] is None or idx["direction"] is None:
        raise BillParseError("支付宝账单缺少必要列")

    declared: dict[str, str] = {}
    account = ""
    for row in rows[:header_index]:
        line = " ".join(cell for cell in row if cell)
        found = re.search(r"账号:\[(.*?)\]", line)
        if found:
            account = found.group(1)

    bill = ParsedBill(source=SOURCE, account=account, declared=declared)

    for row in rows[header_index + 1 :]:
        if not row or not any(row):
            continue

        def get(key: str) -> str:
            position = idx[key]
            if position is None or position >= len(row):
                return ""
            return row[position]

        trade_no = get("trade_no")
        amount = _amount(get("amount"))
        moment = _parse_time(get("time")) or _parse_time(get("time"))
        if not trade_no or amount is None:
            continue

        direction = get("direction")
        status = get("status")
        raw_merchant = _clean(get("counterparty"), 50)
        channel = enrich.detect_channel(raw_merchant)
        merchant, _ = enrich.resolve_party(raw_merchant, get("goods"), channel)

        if direction == "不计收支":
            reason = "中性交易"
        elif "退款" in status:
            reason = "退款"
        elif status in {"已关闭", "交易关闭"}:
            reason = "已关闭"
        else:
            reason = None

        if reason:
            bill.skipped.append(
                SkippedRow(
                    reason=reason,
                    date=moment.date() if moment else None,
                    amount=amount,
                    merchant=raw_merchant,
                    type="income" if direction == "收入" else "expense",
                )
            )
            continue

        if direction not in {"支出", "收入"} or moment is None:
            bill.skipped.append(
                SkippedRow(
                    reason="无法识别",
                    date=moment.date() if moment else None,
                    amount=amount,
                    merchant=raw_merchant,
                    type="expense",
                )
            )
            continue

        note = _clean(get("note"), 255)

        bill.rows.append(
            BillRow(
                client_id=f"{SOURCE}:{trade_no}"[:64],
                date=moment.date(),
                amount=amount,
                type="income" if direction == "收入" else "expense",
                merchant=merchant,
                note=note[:255],
                external_id=trade_no,
                channel=channel,
            )
        )
        day = moment.date()
        bill.start = day if bill.start is None or day < bill.start else bill.start
        bill.end = day if bill.end is None or day > bill.end else bill.end

    if not bill.rows and not bill.skipped:
        raise BillParseError("账单里没有可解析的记录")
    return bill
