"""账单文件识别：解包、解码、判断来源。"""

from __future__ import annotations

from . import alipay, wechat
from .bill_types import BillParseError, ParsedBill
from .unzip import BillUnlockError, unpack

LEGACY_HINT = "这是拾光旧版 CSV，请在旧导入入口使用"


def decode_text(data: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-8", "gb18030"):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise BillParseError("无法识别文件编码（支持 UTF-8 / GBK）")


def parse_bill(data: bytes, *, password: str | None = None) -> ParsedBill:
    try:
        inner, _name = unpack(data, password)
    except BillUnlockError as exc:
        raise BillParseError(str(exc)) from exc

    if inner[:2] == b"PK":
        return wechat.parse_xlsx(inner)

    text = decode_text(inner)
    head = text[:4000]

    if "微信支付账单明细" in head or ("交易单号" in head and "交易时间" in head):
        return wechat.parse_csv(text)
    if "交易号" in head and "收/支" in head:
        return alipay.parse(text)
    if head.lstrip().startswith("日期"):
        raise BillParseError(LEGACY_HINT)
    raise BillParseError("无法识别的账单格式：请上传微信支付账单或支付宝账单")
