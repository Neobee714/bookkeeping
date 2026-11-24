from __future__ import annotations

import io
import zlib
from collections.abc import Generator
from datetime import date, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401  确保模型注册进 Base.metadata
from app.core.database import Base, get_db
from app.core.security import get_current_user
from app.main import app
from app.models.category import Category
from app.models.import_rule import ImportRule
from app.models.transaction import Transaction
from app.models.user import User
from app.services.bill_import import alipay, wechat
from app.services.bill_import.crack import keys_init, keys_update
from app.services.bill_import.unzip import unpack

WECHAT_HEADER = [
    "交易时间",
    "交易类型",
    "交易对方",
    "商品",
    "收/支",
    "金额(元)",
    "支付方式",
    "当前状态",
    "交易单号",
    "商户单号",
    "备注",
]


def _wechat_rows() -> list[list[str]]:
    return [
        ["微信支付账单明细"],
        ["微信昵称：[测试账号]"],
        ["起始时间：[2026-11-01 00:00:00] 终止时间：[2026-11-30 23:59:59]"],
        ["导出类型：[全部账单]"],
        ["共8笔记录"],
        ["收入：1笔 100.00元"],
        ["支出：5笔 268.50元"],
        ["中性交易：2笔 300.00元"],
        [""],
        ["----------------------微信支付账单明细列表--------------------"],
        WECHAT_HEADER,
        ["2026-11-02 12:30:00", "商户消费", "美团", "团购-美团App-123", "支出", "45.50", "零钱", "支付成功", "42000000000000000001", "M001", "/"],
        ["2026-11-03 08:10:00", "商户消费", "苏果超市有限公司", "万家聚合支付", "支出", "23.00", "零钱", "支付成功", "42000000000000000002", "M002", "/"],
        ["2026-11-04 19:00:00", "商户消费", "淘宝平台商户", "商户单号999", "支出", "200.00", "零钱", "已全额退款", "42000000000000000003", "M003", "/"],
        ["2026-11-04 19:05:00", "美团平台商户-退款", "美团平台商户", "/", "收入", "200.00", "零钱", "已全额退款", "42000000000000000004", "/", "/"],
        ["2026-11-05 10:00:00", "零钱提现", "招商银行(6288)", "/", "/", "150.00", "招商银行储蓄卡(6288)", "提现已到账", "42000000000000000005", "/", "服务费¥0.10"],
        ["2026-11-06 21:00:00", "转账", "沉浸式小摔炮", "转账备注:微信转账", "支出", "80.00", "零钱", "对方已收钱", "42000000000000000006", "/", "/"],
        ["2026-11-07 09:00:00", "商户消费", "滴滴出行", "先乘车后付款", "支出", "12.00", "零钱", "支付成功", "42000000000000000007", "M007", "/"],
        ["2026-11-08 12:00:00", "微信红包", "青野", "/", "收入", "100.00", "零钱", "已存入零钱", "42000000000000000008", "/", "/"],
    ]


def _wechat_xlsx() -> bytes:
    from openpyxl import Workbook

    workbook = Workbook()
    sheet = workbook.active
    for row in _wechat_rows():
        sheet.append(row)
    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def _wechat_csv_text() -> str:
    import csv

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    for row in _wechat_rows():
        writer.writerow(row)
    return buffer.getvalue()


def _encrypt_zip(payload: bytes, password: str) -> bytes:
    """按 ZipCrypto 规范手写一个加密 zip（deflate 条目），用于解包测试。"""
    compressor = zlib.compressobj(9, zlib.DEFLATED, -15)
    compressed = compressor.compress(payload) + compressor.flush()
    crc = zlib.crc32(payload) & 0xFFFFFFFF

    k0, k1, k2 = keys_init()

    def encrypt(data: bytes) -> bytes:
        nonlocal k0, k1, k2
        out = bytearray()
        for byte in data:
            t = (k2 | 2) & 0xFFFF
            out.append(byte ^ (((t * (t ^ 1)) >> 8) & 0xFF))
            k0, k1, k2 = keys_update(k0, k1, k2, byte)
        return bytes(out)

    for ch in password.encode():
        k0, k1, k2 = keys_update(k0, k1, k2, ch)
    header = bytes(11) + bytes([(crc >> 24) & 0xFF])
    encrypted = encrypt(header) + encrypt(compressed)

    name = "bill.xlsx".encode()
    local = (
        b"PK\x03\x04"
        + (20).to_bytes(2, "little")
        + (1).to_bytes(2, "little")  # encrypted
        + (8).to_bytes(2, "little")  # deflate
        + (0).to_bytes(2, "little")
        + (0x4CA8).to_bytes(2, "little")
        + crc.to_bytes(4, "little")
        + len(encrypted).to_bytes(4, "little")
        + len(payload).to_bytes(4, "little")
        + len(name).to_bytes(2, "little")
        + (0).to_bytes(2, "little")
        + name
    )
    central = (
        b"PK\x01\x02"
        + (20).to_bytes(2, "little")
        + (20).to_bytes(2, "little")
        + (1).to_bytes(2, "little")
        + (8).to_bytes(2, "little")
        + (0).to_bytes(2, "little")
        + (0x4CA8).to_bytes(2, "little")
        + crc.to_bytes(4, "little")
        + len(encrypted).to_bytes(4, "little")
        + len(payload).to_bytes(4, "little")
        + len(name).to_bytes(2, "little")
        + (0).to_bytes(2, "little")
        + (0).to_bytes(2, "little")
        + (0).to_bytes(2, "little")
        + (0).to_bytes(2, "little")
        + (0).to_bytes(4, "little")
        + (0).to_bytes(4, "little")
        + name
    )
    end = (
        b"PK\x05\x06"
        + (0).to_bytes(2, "little")
        + (0).to_bytes(2, "little")
        + (1).to_bytes(2, "little")
        + (1).to_bytes(2, "little")
        + len(central).to_bytes(4, "little")
        + len(local + encrypted).to_bytes(4, "little")
        + (0).to_bytes(2, "little")
    )
    return local + encrypted + central + end


@pytest.fixture()
def client() -> Generator[tuple[TestClient, dict[str, User]], None, None]:
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(engine)

    session = TestingSessionLocal()
    user = User(id=1, username="tester", nickname="测试", password_hash="unused", reg_invite_code="ABCDEFGH")
    session.add(user)
    for name, icon, type_ in (
        ("餐饮", "🍜", "expense"),
        ("日用", "🛒", "expense"),
        ("购物", "🛍️", "expense"),
        ("交通", "🚌", "expense"),
        ("小摔炮", "🧨", "expense"),
        ("其他", "📌", "expense"),
        ("收入", "💰", "income"),
    ):
        session.add(Category(user_id=1, name=name, icon=icon, color="#FF6B6B", type=type_))
    session.commit()
    session.close()

    def override_get_db() -> Generator[Session, None, None]:
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    def override_get_current_user() -> User:
        with TestingSessionLocal() as db:
            return db.get(User, 1)

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user
    try:
        yield TestClient(app), {"session": TestingSessionLocal}
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(engine)


def test_wechat_xlsx_parse() -> None:
    bill = wechat.parse_xlsx(_wechat_xlsx())
    assert bill.source == "wechat"
    assert bill.account == "测试账号"
    assert len(bill.rows) == 3
    assert [r.amount for r in bill.rows] == [45.50, 23.00, 12.00]
    reasons = sorted(s.reason for s in bill.skipped)
    assert reasons.count("退款") == 2
    assert reasons.count("中性交易") == 1
    assert reasons.count("转账/红包") == 2
    assert bill.start == date(2026, 11, 2)
    assert bill.end == date(2026, 11, 7)


def test_wechat_csv_parse() -> None:
    bill = wechat.parse_csv(_wechat_csv_text())
    assert len(bill.rows) == 3
    assert bill.rows[0].merchant == ""
    assert bill.rows[0].channel == "美团"
    # 支付方式描述不再进备注
    assert bill.rows[1].note == ""
    assert bill.rows[1].merchant == "苏果超市有限公司"


def test_alipay_parse() -> None:
    text = (
        "支付宝交易记录明细查询\n"
        "账号:[tester@example.com]\n"
        "起始日期:[2026-11-01 00:00:00]    终止日期:[2026-11-30 23:59:59]\n"
        "---------------------------------交易记录明细列表------------------------------------\n"
        "交易号,商家订单号,交易创建时间,付款时间,最近修改时间,交易来源地,类型,交易对方,商品名称,金额（元）,收/支,交易状态,服务费（元）,成功退款（元）,备注,资金状态\n"
        "2026110122001,SHOP1,2026-11-01 10:00:00,2026-11-01 10:00:05,2026-11-01 10:00:05,支付宝网站,即时到账交易,盒马,盒马鲜生订单,88.50,支出,交易成功,0.00,0.00,,已支出\n"
        "2026110222002,SHOP2,2026-11-02 11:00:00,2026-11-02 11:00:05,2026-11-02 11:00:05,支付宝网站,即时到账交易,某店铺,退款订单,30.00,支出,退款成功,0.00,30.00,,已退款\n"
        "2026110322003,SHOP3,2026-11-03 12:00:00,2026-11-03 12:00:05,2026-11-03 12:00:05,支付宝网站,即时到账交易,余额宝,转入,1000.00,不计收支,交易成功,0.00,0.00,,已支出\n"
    )
    bill = alipay.parse(text)
    assert bill.source == "alipay"
    assert len(bill.rows) == 1
    assert bill.rows[0].merchant == "盒马"
    assert bill.rows[0].amount == 88.50
    assert {s.reason for s in bill.skipped} == {"退款", "中性交易"}


def test_enrich_product_and_channel() -> None:
    from app.services.bill_import import enrich

    assert enrich.detect_channel("淘宝平台商户") == "淘宝"
    assert enrich.detect_channel("美团平台商户") == "美团"
    assert enrich.detect_channel("南京大牌档") == ""

    # 平台订单里的真实店铺
    shop, _note = enrich.resolve_party(
        "美团", "萍姐火锅·公路夜市-美团App-2611151120070000130", "美团"
    )
    assert shop == "萍姐火锅·公路夜市"

    # 订单号 / 支付方式描述 → 平台交易只留渠道，商家为空
    assert enrich.resolve_party("美团", "团购-美团App-26111611200700", "美团")[0] == ""
    assert enrich.resolve_party("苏果超市有限公司", "万家聚合支付", "")[0] == "苏果超市有限公司"
    assert enrich.resolve_party("滴滴出行", "先乘车后付款", "滴滴")[0] == ""

    # 品牌 + 分店
    assert enrich.resolve_party("南京大牌档", "华采天地店-消费", "")[0] == "南京大牌档（华采天地店）"
    # 已经有分店的商家不再套娃
    assert (
        enrich.resolve_party("衢州鸭头（游坊桥店）", "建邺区好吃小串小吃店", "")[0]
        == "衢州鸭头（游坊桥店）"
    )


def test_zip_crack_and_unpack() -> None:
    payload = _wechat_xlsx()
    archive = _encrypt_zip(payload, "004321")
    plain, _name = unpack(archive)  # 不提供密码，服务端自己破
    assert plain == payload


def test_preview_and_commit_flow(client: tuple[TestClient, dict]) -> None:
    test_client, ctx = client
    response = test_client.post(
        "/transactions/import/preview",
        files={"file": ("bill.xlsx", _wechat_xlsx(), "application/octet-stream")},
    )
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["source"] == "wechat"
    assert data["summary"]["importable"] == 3
    assert data["summary"]["expense_amount"] == "80.50"
    assert {r["category"] for r in data["rows"]} == {"餐饮", "日用", "交通"}
    assert all(r["match"] == "builtin" for r in data["rows"])
    by_amount = {row["amount"]: row for row in data["rows"]}
    assert by_amount["45.50"]["channel"] == "美团"
    assert by_amount["45.50"]["merchant"] == ""  # 平台订单认不出店铺，只留渠道
    assert by_amount["45.50"]["category"] == "餐饮"  # 渠道参与分类推断
    assert by_amount["12.00"]["channel"] == "滴滴"
    assert by_amount["12.00"]["category"] == "交通"
    assert by_amount["23.00"]["merchant"] == "苏果超市有限公司"
    assert by_amount["23.00"]["channel"] == ""

    commit_body = {"source": "wechat", "rows": data["rows"], "learn": []}
    first = test_client.post("/transactions/import/commit", json=commit_body)
    assert first.status_code == 200, first.text
    assert first.json()["data"]["imported"] == 3

    second = test_client.post("/transactions/import/commit", json=commit_body)
    assert second.json()["data"]["imported"] == 0
    assert second.json()["data"]["duplicated"] == 3

    with ctx["session"]() as db:
        rows = db.execute(select(Transaction)).scalars().all()
        assert len(rows) == 3
        assert {row.category for row in rows} == {"餐饮", "日用", "交通"}
        assert all(row.client_id and row.client_id.startswith("wechat:") for row in rows)


def test_custom_category_rule(client: tuple[TestClient, dict]) -> None:
    test_client, ctx = client
    preview = test_client.post(
        "/transactions/import/preview",
        files={"file": ("bill.xlsx", _wechat_xlsx(), "application/octet-stream")},
    ).json()["data"]
    rows = preview["rows"]
    # 用户把「滴滴」这笔改到自建分类「小摔炮」，并勾选记住（平台单用 channel 当键）
    target = next(row for row in rows if row["channel"] == "滴滴")
    target["category"] = "小摔炮"
    body = {
        "source": "wechat",
        "rows": rows,
        "learn": [{"merchant": "", "channel": "滴滴", "category": "小摔炮"}],
    }
    committed = test_client.post("/transactions/import/commit", json=body).json()["data"]
    assert committed["learned"] == 1

    with ctx["session"]() as db:
        rule = db.execute(select(ImportRule)).scalars().one()
        assert rule.merchant_key == "滴滴"
        assert rule.category == "小摔炮"

    # 再导入一次，规则命中（此时交易已存在，所以换一份账单日期区间外的行来验证规则）
    again = test_client.post(
        "/transactions/import/preview",
        files={"file": ("bill.xlsx", _wechat_xlsx(), "application/octet-stream")},
    ).json()["data"]
    assert all(row["existing"] for row in again["rows"])


def test_commit_falls_back_for_unknown_category(client: tuple[TestClient, dict]) -> None:
    test_client, ctx = client
    body = {
        "source": "wechat",
        "rows": [
            {
                "client_id": "wechat:unknown-1",
                "date": "2026-11-20",
                "amount": "9.90",
                "type": "expense",
                "category": "不存在的分类",
                "merchant": "某商家",
                "note": "",
            }
        ],
        "learn": [],
    }
    result = test_client.post("/transactions/import/commit", json=body).json()["data"]
    assert result["imported"] == 1
    with ctx["session"]() as db:
        row = db.execute(select(Transaction)).scalars().one()
        assert row.category == "其他"


def test_preview_rejects_unknown_file(client: tuple[TestClient, dict]) -> None:
    test_client, _ = client
    response = test_client.post(
        "/transactions/import/preview",
        files={"file": ("notes.txt", b"hello world", "text/plain")},
    )
    assert response.status_code == 400
    assert "无法识别" in response.json()["message"]


def test_channel_breakdown_and_rules_api(client: tuple[TestClient, dict]) -> None:
    test_client, _ctx = client
    preview = test_client.post(
        "/transactions/import/preview",
        files={"file": ("bill.xlsx", _wechat_xlsx(), "application/octet-stream")},
    ).json()["data"]

    body = {
        "source": "wechat",
        "rows": preview["rows"],
        "learn": [{"merchant": "", "channel": "美团", "category": "餐饮"}],
    }
    assert test_client.post("/transactions/import/commit", json=body).json()["data"]["imported"] == 3

    breakdown = test_client.get(
        "/stats/breakdown", params={"dimension": "channel", "month": "2026-11"}
    ).json()["data"]
    assert breakdown["dimension"] == "channel"
    channels = {item["name"]: item for item in breakdown["items"]}
    assert set(channels) == {"美团", "滴滴"}
    assert channels["美团"]["count"] == 1
    assert channels["滴滴"]["count"] == 1

    rules = test_client.get("/transactions/import/rules").json()["data"]
    assert len(rules) == 1
    assert rules[0]["merchant"] == "美团"

    rule_id = rules[0]["id"]
    patched = test_client.patch(
        f"/transactions/import/rules/{rule_id}", json={"category": "日用"}
    )
    assert patched.json()["data"]["category"] == "日用"

    bad = test_client.patch(
        f"/transactions/import/rules/{rule_id}", json={"category": "不存在"}
    )
    assert bad.status_code == 400

    deleted = test_client.delete(f"/transactions/import/rules/{rule_id}")
    assert deleted.status_code == 200
    assert test_client.get("/transactions/import/rules").json()["data"] == []
