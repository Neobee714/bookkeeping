from __future__ import annotations

import asyncio
import logging
import os

from app.core.database import SessionLocal
from app.services.recurring import generate_due

logger = logging.getLogger("bookkeeping.recurring")

INTERVAL_SECONDS = 3600

_started = False
_task: "asyncio.Task[None] | None" = None


def _disabled() -> bool:
    return os.getenv("RECURRING_SCHEDULER", "").strip().lower() == "off"


def _run_once() -> int:
    db = SessionLocal()
    try:
        return generate_due(db)
    finally:
        db.close()


async def _loop() -> None:
    while True:
        try:
            created = await asyncio.to_thread(_run_once)
            if created:
                logger.info("循环记账本次生成 %s 笔账单", created)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("循环记账生成任务失败")
        await asyncio.sleep(INTERVAL_SECONDS)


def start() -> None:
    """启动调度（幂等），由 FastAPI startup 事件调用。"""
    global _started, _task

    if _started and _task is not None and not _task.done():
        return
    if _disabled():
        logger.info("RECURRING_SCHEDULER=off，循环记账调度未启动")
        return

    _task = asyncio.create_task(_loop(), name="recurring-scheduler")
    _started = True
    logger.info("循环记账调度已启动，每 %s 秒检查一次", INTERVAL_SECONDS)


def stop() -> None:
    """取消调度任务，由 FastAPI shutdown 事件调用。"""
    global _started, _task

    task = _task
    _task = None
    _started = False
    if task is not None and not task.done():
        task.cancel()
