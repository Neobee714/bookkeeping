"""邮箱账单同步：收件 → 解析 → 去重入账。"""

from __future__ import annotations

import logging
import threading
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.bill_mailbox import BillMailbox
from app.models.user import User
from app.services.bill_import.bill_types import BillParseError
from app.services.bill_import.service import commit, preview

from .client import BillMailClient, MailError
from .download import download_bill
from .crypto import CipherError, decrypt

logger = logging.getLogger("bookkeeping.bill_mail")

# 调度器与「立即同步」可能同时触发：同一时刻只允许一个同步在跑，
# 否则同一封邮件会被两条路径各处理一次，计数会错乱（数据靠 client_id 去重不会重）。
_SYNC_LOCK = threading.Lock()


def sync_mailbox(db: Session, mailbox: BillMailbox) -> dict:
    if not _SYNC_LOCK.acquire(blocking=False):
        return {"ok": False, "error": "正在同步中，请稍后再试", "messages": 0}
    try:
        return _sync_mailbox_locked(db, mailbox)
    finally:
        _SYNC_LOCK.release()


def _sync_mailbox_locked(db: Session, mailbox: BillMailbox) -> dict:
    """拉取一个邮箱的未读邮件并导入，结果写回 last_* 字段。"""
    user = db.get(User, mailbox.user_id)
    if user is None:
        return {"ok": False, "error": "用户不存在"}

    try:
        password = decrypt(mailbox.password_enc)
    except CipherError:
        _record(db, mailbox, "error", "授权码无法解密（SECRET_KEY 变了），请重新填写")
        return {"ok": False, "error": mailbox.last_error}

    imported = duplicated = failed = 0
    messages = 0
    last_error = ""

    try:
        client = BillMailClient(
            mailbox.host, mailbox.port, mailbox.username, password, mailbox.folder
        )
        with client:
            # UIDVALIDITY 变了说明邮箱重建过，游标失效，从头扫最近 60 天
            if mailbox.uidvalidity is not None and client.uidvalidity != mailbox.uidvalidity:
                mailbox.last_uid = 0
            if client.uidvalidity is not None:
                mailbox.uidvalidity = client.uidvalidity

            inbox = client.fetch_new(mailbox.last_uid)
            messages = len(inbox)
            for message in inbox:
                payloads = [item.data for item in message.attachments]
                for link in message.links:
                    try:
                        payloads.append(download_bill(link))
                    except MailError as exc:
                        failed += 1
                        last_error = str(exc)
                for payload in payloads:
                    try:
                        got, dup = _import_payload(db, user, payload)
                        imported += got
                        duplicated += dup
                    except BillParseError as exc:
                        failed += 1
                        last_error = str(exc)
                    except Exception as exc:  # pragma: no cover - 单封邮件失败不阻断
                        failed += 1
                        last_error = "处理账单失败"
                        logger.exception("处理账单邮件失败：%s", exc)
                # 游标前移，下一轮不再处理；不改邮件已读状态
                mailbox.last_uid = max(mailbox.last_uid, message.uid)
    except MailError as exc:
        _record(db, mailbox, "error", str(exc))
        return {"ok": False, "error": str(exc), "messages": messages}

    if messages == 0:
        summary = "没有新的账单邮件"
    elif imported or duplicated:
        summary = f"导入 {imported} 笔，重复 {duplicated} 笔"
    else:
        summary = "没有可导入的账单"

    status = "error" if failed and not imported else "ok"
    _record(db, mailbox, status, last_error or None, summary)
    return {
        "ok": status == "ok",
        "messages": messages,
        "imported": imported,
        "duplicated": duplicated,
        "failed": failed,
        "error": last_error or None,
        "summary": summary,
    }


def _import_payload(db: Session, user: User, payload: bytes) -> tuple[int, int]:
    """解析一份账单并入库，返回 (新增, 重复)。"""
    data = preview(db, user, payload)
    rows = data.get("rows") or []
    if not rows:
        return 0, 0
    result = commit(
        db,
        user,
        {"source": data.get("source") or "wechat", "rows": rows, "learn": []},
    )
    return int(result["imported"]), int(result["duplicated"])


def _record(
    db: Session,
    mailbox: BillMailbox,
    status: str,
    error: str | None = None,
    summary: str | None = None,
) -> None:
    mailbox.last_sync_at = datetime.now(timezone.utc)
    mailbox.last_status = status
    mailbox.last_error = (error or "")[:255] or None
    mailbox.last_summary = (summary or "")[:120] or None
    db.add(mailbox)
    db.commit()


def sync_all(db: Session) -> int:
    """调度器入口：同步所有启用的邮箱，返回处理的邮箱数。"""
    boxes = db.execute(
        select(BillMailbox).where(BillMailbox.enabled.is_(True))
    ).scalars().all()
    done = 0
    for box in boxes:
        try:
            sync_mailbox(db, box)
            done += 1
        except Exception:  # pragma: no cover - 单个邮箱失败不影响其它
            logger.exception("同步邮箱失败：user_id=%s", box.user_id)
    return done
