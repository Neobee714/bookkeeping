from __future__ import annotations

import asyncio
import logging
import os

from app.core.database import SessionLocal
from app.services.bill_mail.sync import sync_all

logger = logging.getLogger("bookkeeping.bill_mail")

INTERVAL_SECONDS = 600

_started = False
_task: "asyncio.Task[None] | None" = None


def _disabled() -> bool:
    return os.getenv("BILL_MAIL_SCHEDULER", "").strip().lower() == "off"


def _run_once() -> int:
    db = SessionLocal()
    try:
        return sync_all(db)
    finally:
        db.close()


async def _loop() -> None:
    while True:
        try:
            done = await asyncio.to_thread(_run_once)
            if done:
                logger.info("账单邮箱本轮同步 %s 个", done)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("账单邮箱同步失败")
        await asyncio.sleep(INTERVAL_SECONDS)


def start() -> None:
    global _started, _task

    if _started and _task is not None and not _task.done():
        return
    if _disabled():
        logger.info("BILL_MAIL_SCHEDULER=off，账单邮箱同步未启动")
        return
    _task = asyncio.create_task(_loop())
    _started = True


def stop() -> None:
    global _started, _task
    if _task is not None:
        _task.cancel()
        _task = None
    _started = False
