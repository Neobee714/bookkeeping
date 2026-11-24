"""账单邮箱 IMAP 客户端（QQ / 163）。

两家都要求登录后发送 IMAP ID 命令（163 不发送会报 Unsafe Login），
imaplib 默认不支持 ID，这里注册后手动发一次。
"""

from __future__ import annotations

import imaplib
import logging
import re
from dataclasses import dataclass, field
from datetime import date, timedelta
from email import message_from_bytes
from email.header import decode_header
from email.message import Message

logger = logging.getLogger("bookkeeping.bill_mail")

PROVIDERS: dict[str, dict[str, str | int]] = {
    "qq": {"host": "imap.qq.com", "port": 993, "name": "QQ 邮箱"},
    "163": {"host": "imap.163.com", "port": 993, "name": "163 邮箱"},
}

ATTACHMENT_SUFFIXES = (".zip", ".xlsx", ".csv")

# 只对疑似账单邮件下载完整正文，避免把整个收件箱都拖下来
BILL_SENDERS = ("wxpay", "tenpay", "wechat", "weixin", "alipay", "mail.alipay")
BILL_SUBJECTS = ("账单", "交易记录", "对账单", "流水")

# imaplib 默认不认识 ID 命令；注册成 AUTH 状态可用
if "ID" not in imaplib.Commands:  # pragma: no branch - 常量
    imaplib.Commands["ID"] = ("AUTH", "SELECTED")

IMAP_ID_ARGS = '("name" "shiguang" "version" "1.0.0" "vendor" "neobee")'


class MailError(Exception):
    """可展示给用户的邮箱错误。"""


@dataclass
class Attachment:
    filename: str
    data: bytes


@dataclass
class BillMessage:
    uid: int
    subject: str
    attachments: list[Attachment] = field(default_factory=list)
    # 微信账单邮件是「下载链接」而不是附件，这里存从正文里抽出的链接
    links: list[str] = field(default_factory=list)


def decode_mime_header(raw: str | None) -> str:
    if not raw:
        return ""
    parts = decode_header(raw)
    decoded: list[str] = []
    for value, charset in parts:
        if isinstance(value, bytes):
            try:
                decoded.append(value.decode(charset or "utf-8", errors="replace"))
            except LookupError:
                decoded.append(value.decode("utf-8", errors="replace"))
        else:
            decoded.append(value)
    return "".join(decoded)


DOWNLOAD_HOSTS = ("tenpay.wechatpay.cn", "wechatpay.cn", "alipay.com")


def extract_download_links(message: Message) -> list[str]:
    """从正文里抽出账单下载链接（微信账单邮件没有附件）。"""
    links: list[str] = []
    for part in message.walk():
        if part.get_content_type() not in ("text/plain", "text/html"):
            continue
        payload = part.get_payload(decode=True)
        if not isinstance(payload, (bytes, bytearray)):
            continue
        text = payload.decode(part.get_content_charset() or "utf-8", errors="replace")
        for raw in re.findall(r"https?://[^\s\"'<>]+", text):
            url = raw.replace("&amp;", "&").rstrip(").,;")
            if any(host in url for host in DOWNLOAD_HOSTS) and (
                "downloadfilefromemail" in url or "downloadbill" in url.lower()
            ):
                if url not in links:
                    links.append(url)
    return links


def extract_attachments(message: Message) -> list[Attachment]:
    found: list[Attachment] = []
    for part in message.walk():
        filename = part.get_filename()
        if not filename:
            continue
        name = decode_mime_header(filename)
        if not name.lower().endswith(ATTACHMENT_SUFFIXES):
            continue
        payload = part.get_payload(decode=True)
        if isinstance(payload, (bytes, bytearray)) and payload:
            found.append(Attachment(filename=name, data=bytes(payload)))
    return found


class BillMailClient:
    def __init__(
        self, host: str, port: int, username: str, password: str, folder: str = "INBOX"
    ) -> None:
        self.host = host
        self.port = port
        self.username = username
        self.password = password
        self.folder = folder or "INBOX"
        self._imap: imaplib.IMAP4_SSL | None = None
        self.uidvalidity: int | None = None

    def __enter__(self) -> "BillMailClient":
        self.connect()
        return self

    def __exit__(self, *_exc: object) -> None:
        self.close()

    def connect(self) -> None:
        try:
            self._imap = imaplib.IMAP4_SSL(self.host, self.port, timeout=30)
        except OSError as exc:
            raise MailError(f"连不上邮件服务器（{self.host}:{self.port}）") from exc

        try:
            self._imap.login(self.username, self.password)
        except imaplib.IMAP4.error as exc:
            self._imap = None
            raise MailError("授权码不对，或邮箱没有开启 IMAP 服务") from exc

        self._send_id()
        try:
            status, data = self._imap.select(self.folder, readonly=False)
        except imaplib.IMAP4.error as exc:
            self.close()
            raise MailError(f"打开文件夹 {self.folder} 失败") from exc
        if status != "OK":
            self.close()
            raise MailError(f"打开文件夹 {self.folder} 失败")
        typ, payload = self._imap.response("UIDVALIDITY")
        if typ == "UIDVALIDITY" and payload and payload[0]:
            try:
                self.uidvalidity = int(payload[0])
            except (TypeError, ValueError):  # pragma: no cover
                self.uidvalidity = None

    def _send_id(self) -> None:
        if self._imap is None:
            return
        try:
            self._imap._simple_command("ID", IMAP_ID_ARGS)  # type: ignore[attr-defined]
            self._imap._untagged_response("OK", [None], "ID")  # type: ignore[attr-defined]
        except Exception:  # pragma: no cover - 少数服务不支持 ID
            logger.warning("邮件服务器不支持 IMAP ID：%s", self.host)

    def fetch_new(self, last_uid: int = 0, limit: int = 50) -> list[BillMessage]:
        """按 UID 取新邮件：不依赖「未读」，用户先点开邮件也不会漏。

        首次（last_uid=0）只看最近 60 天，避免把几年历史全拉下来。
        """
        if self._imap is None:
            raise MailError("邮箱未连接")

        if last_uid > 0:
            criteria = ("UID", f"{last_uid + 1}:*")
        else:
            since = (date.today() - timedelta(days=60)).strftime("%d-%b-%Y")
            criteria = ("SINCE", since)

        status, data = self._imap.uid("SEARCH", None, *criteria)
        if status != "OK" or not data or not data[0]:
            return []

        uids = [int(value) for value in data[0].split() if value.isdigit()]
        uids = [uid for uid in uids if uid > last_uid][-limit:]

        messages: list[BillMessage] = []
        for uid in uids:
            if not self._looks_like_bill(uid):
                continue
            status, payload = self._imap.uid("FETCH", str(uid), "(RFC822)")
            if status != "OK" or not payload:
                continue
            raw = payload[0]
            if not isinstance(raw, tuple) or len(raw) < 2:
                continue
            parsed = message_from_bytes(raw[1])
            messages.append(
                BillMessage(
                    uid=uid,
                    subject=decode_mime_header(parsed.get("Subject")),
                    attachments=extract_attachments(parsed),
                    links=extract_download_links(parsed),
                )
            )
        return messages

    def _looks_like_bill(self, uid: int) -> bool:
        """先只取 From/Subject，命中账单发件人或主题才下载正文。"""
        if self._imap is None:
            return False
        status, payload = self._imap.uid(
            "FETCH", str(uid), "(BODY.PEEK[HEADER.FIELDS (FROM SUBJECT)])"
        )
        if status != "OK" or not payload:
            return False
        raw = payload[0]
        if not isinstance(raw, tuple) or len(raw) < 2:
            return False
        header = raw[1].decode("utf-8", errors="replace").lower()
        return any(word in header for word in BILL_SENDERS + BILL_SUBJECTS)

    def close(self) -> None:
        if self._imap is None:
            return
        try:
            self._imap.close()
        except Exception:  # pragma: no cover
            pass
        try:
            self._imap.logout()
        except Exception:  # pragma: no cover
            pass
        self._imap = None
