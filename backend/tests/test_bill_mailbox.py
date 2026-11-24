from __future__ import annotations

from email import message_from_bytes
from email.message import EmailMessage

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.models.bill_mailbox import BillMailbox
from app.models.transaction import Transaction
from app.services.bill_mail import sync as sync_module
from app.services.bill_mail.client import (
    Attachment,
    BillMessage,
    MailError,
    extract_attachments,
    extract_download_links,
)
from app.services.bill_mail.crypto import CipherError, decrypt, encrypt
from app.services.bill_mail.sync import sync_mailbox
from tests.test_bill_import import _encrypt_zip, _wechat_xlsx, client  # noqa: F401


def test_crypto_roundtrip() -> None:
    token = encrypt("abcd1234")
    assert token != "abcd1234"
    assert decrypt(token) == "abcd1234"
    with pytest.raises(CipherError):
        decrypt("not-a-token")


def test_extract_attachments() -> None:
    message = EmailMessage()
    message["Subject"] = "微信支付账单"
    message.set_content("请查收")
    message.add_attachment(
        _encrypt_zip(_wechat_xlsx(), "004321"),
        maintype="application",
        subtype="zip",
        filename="微信支付账单流水文件(20261023-20261123).zip",
    )
    parsed = message_from_bytes(message.as_bytes())
    found = extract_attachments(parsed)
    assert len(found) == 1
    assert found[0].filename.endswith(".zip")
    assert len(found[0].data) > 1000


class _FakeClient:
    instances: list["_FakeClient"] = []

    def __init__(self, host: str, port: int, username: str, password: str, folder: str) -> None:
        self.host = host
        self.password = password
        self.uidvalidity = 42
        self.attachments = [
            Attachment(
                filename="微信支付账单.zip",
                data=_encrypt_zip(_wechat_xlsx(), "004321"),
            )
        ]
        _FakeClient.instances.append(self)

    def __enter__(self) -> "_FakeClient":
        return self

    def __exit__(self, *_exc: object) -> None:
        return None

    def fetch_new(self, last_uid: int = 0, limit: int = 50) -> list[BillMessage]:
        if last_uid > 7:
            return []
        return [BillMessage(uid=7, subject="账单", attachments=self.attachments)]


def test_sync_mailbox_imports_and_dedupes(
    client: tuple[TestClient, dict], monkeypatch: pytest.MonkeyPatch
) -> None:
    _test_client, ctx = client
    from app.models.user import User

    with ctx["session"]() as db:
        user_id = db.scalar(select(User.id))
        db.add(
            BillMailbox(
                user_id=user_id,
                provider="qq",
                host="imap.qq.com",
                port=993,
                username="bill@qq.com",
                password_enc=encrypt("abcd1234"),
                folder="INBOX",
                enabled=True,
            )
        )
        db.commit()

    monkeypatch.setattr(sync_module, "BillMailClient", _FakeClient)
    _FakeClient.instances.clear()

    with ctx["session"]() as db:
        box = db.execute(select(BillMailbox)).scalar_one()
        result = sync_mailbox(db, box)
        assert result["imported"] == 3
        assert result["messages"] == 1
        assert box.last_status == "ok"
        assert "导入 3 笔" in (box.last_summary or "")

    # 同一封邮件再同步一次（未读状态被重置也不该重复入账）
    with ctx["session"]() as db:
        box = db.execute(select(BillMailbox)).scalar_one()
        again = sync_mailbox(db, box)
        assert again["imported"] == 0
        assert again["duplicated"] == 3

    with ctx["session"]() as db:
        assert len(db.execute(select(Transaction)).scalars().all()) == 3

    with ctx["session"]() as db:
        box = db.execute(select(BillMailbox)).scalar_one()
        assert box.last_uid == 7
        assert box.uidvalidity == 42


def test_sync_records_connect_error(
    client: tuple[TestClient, dict], monkeypatch: pytest.MonkeyPatch
) -> None:
    _test_client, ctx = client
    from app.models.user import User

    with ctx["session"]() as db:
        user_id = db.scalar(select(User.id))
        db.add(
            BillMailbox(
                user_id=user_id,
                provider="163",
                host="imap.163.com",
                port=993,
                username="bill@163.com",
                password_enc=encrypt("abcd1234"),
                folder="INBOX",
                enabled=True,
            )
        )
        db.commit()

    class _BrokenClient:
        def __init__(self, *_args: object, **_kwargs: object) -> None:
            raise MailError("授权码不对，或邮箱没有开启 IMAP 服务")

    monkeypatch.setattr(sync_module, "BillMailClient", _BrokenClient)
    with ctx["session"]() as db:
        box = db.execute(select(BillMailbox)).scalar_one()
        result = sync_mailbox(db, box)
        assert result["ok"] is False
        assert box.last_status == "error"
        assert "授权码" in (box.last_error or "")


def test_mailbox_api(client: tuple[TestClient, dict], monkeypatch: pytest.MonkeyPatch) -> None:
    test_client, ctx = client

    empty = test_client.get("/transactions/import/mailbox").json()["data"]
    assert empty["configured"] is False

    saved = test_client.put(
        "/transactions/import/mailbox",
        json={
            "provider": "163",
            "username": "bill@163.com",
            "password": "abcd1234",
            "enabled": True,
        },
    ).json()["data"]
    assert saved["configured"] is True
    assert saved["host"] == "imap.163.com"
    assert saved["has_password"] is True
    assert "password" not in saved and "password_enc" not in saved

    with ctx["session"]() as db:
        box = db.execute(select(BillMailbox)).scalar_one()
        assert box.password_enc.startswith("gAAAA")
        assert "abcd1234" not in box.password_enc

    # 更新时不填授权码 → 沿用旧密文
    updated = test_client.put(
        "/transactions/import/mailbox",
        json={"provider": "163", "username": "bill@163.com", "enabled": False},
    ).json()["data"]
    assert updated["enabled"] is False
    with ctx["session"]() as db:
        assert db.execute(select(BillMailbox)).scalar_one().password_enc.startswith("gAAAA")

    # 测试连接失败 → 400 + 可读错误
    class _Broken:
        def __init__(self, *_args: object, **_kwargs: object) -> None:
            raise MailError("授权码不对，或邮箱没有开启 IMAP 服务")

    monkeypatch.setattr("app.routers.bill_mailbox.BillMailClient", _Broken)
    failed = test_client.post(
        "/transactions/import/mailbox/test",
        json={"provider": "163", "username": "bill@163.com"},
    )
    assert failed.status_code == 400
    assert "授权码" in failed.json()["message"]

    monkeypatch.setattr("app.routers.bill_mailbox.BillMailClient", _FakeClient)
    ok = test_client.post(
        "/transactions/import/mailbox/test",
        json={"provider": "163", "username": "bill@163.com"},
    )
    assert ok.status_code == 200

    deleted = test_client.delete("/transactions/import/mailbox").json()["data"]
    assert deleted["configured"] is False
    with ctx["session"]() as db:
        assert db.execute(select(BillMailbox)).scalar_one_or_none() is None


def test_extract_download_links_from_wechat_mail() -> None:
    message = EmailMessage()
    message["Subject"] = "微信支付-账单流水文件(20261023-20261123)"
    message.set_content("请查收")
    message.add_alternative(
        '<p><a href="https://tenpay.wechatpay.cn/userroll/userbilldownload/'
        'downloadfilefromemail?encrypted_file_data=ABC&amp;sign=1">下载</a></p>',
        subtype="html",
    )
    links = extract_download_links(message_from_bytes(message.as_bytes()))
    assert len(links) == 1
    assert "downloadfilefromemail" in links[0]
    assert "&amp;" not in links[0]


def test_sync_imports_from_download_link(
    client: tuple[TestClient, dict], monkeypatch: pytest.MonkeyPatch
) -> None:
    _test_client, ctx = client
    from app.models.user import User

    with ctx["session"]() as db:
        user_id = db.scalar(select(User.id))
        db.add(
            BillMailbox(
                user_id=user_id,
                provider="qq",
                host="imap.qq.com",
                port=993,
                username="bill@qq.com",
                password_enc=encrypt("abcd1234"),
                folder="INBOX",
                enabled=True,
            )
        )
        db.commit()

    class _LinkClient(_FakeClient):
        def __init__(self, *args: object, **kwargs: object) -> None:
            super().__init__(*args, **kwargs)  # type: ignore[arg-type]
            self.attachments = []
            self.links = ["https://tenpay.wechatpay.cn/x/downloadfilefromemail?token=1"]

    monkeypatch.setattr(sync_module, "BillMailClient", _LinkClient)
    monkeypatch.setattr(
        sync_module, "download_bill", lambda _url: _encrypt_zip(_wechat_xlsx(), "004321")
    )
    # BillMessage 需要带 links 字段
    original_fetch = _LinkClient.fetch_new

    def fetch_new(self: _LinkClient, last_uid: int = 0, limit: int = 50) -> list[BillMessage]:
        messages = original_fetch(self, last_uid, limit)
        for message in messages:
            message.links = self.links
        return messages

    monkeypatch.setattr(_LinkClient, "fetch_new", fetch_new)

    with ctx["session"]() as db:
        box = db.execute(select(BillMailbox)).scalar_one()
        result = sync_mailbox(db, box)
        assert result["imported"] == 3, result

    with ctx["session"]() as db:
        assert len(db.execute(select(Transaction)).scalars().all()) == 3


def test_sync_is_locked(client: tuple[TestClient, dict]) -> None:
    _test_client, ctx = client
    with ctx["session"]() as db:
        box = BillMailbox(
            user_id=1,
            provider="qq",
            host="imap.qq.com",
            port=993,
            username="bill@qq.com",
            password_enc=encrypt("abcd1234"),
            folder="INBOX",
            enabled=True,
        )
        db.add(box)
        db.commit()
        box = db.execute(select(BillMailbox)).scalar_one()

        assert sync_module._SYNC_LOCK.acquire(blocking=False) is True
        try:
            result = sync_module.sync_mailbox(db, box)
        finally:
            sync_module._SYNC_LOCK.release()
        assert result["ok"] is False
        assert "正在同步" in (result["error"] or "")
