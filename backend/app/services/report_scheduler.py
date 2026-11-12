from __future__ import annotations

import asyncio
import logging
import os

from app.core.database import SessionLocal
from app.services.reports import generate_due_reports

logger = logging.getLogger("bookkeeping.reports")

INTERVAL_SECONDS = 3600

_started = False
_task: "asyncio.Task[None] | None" = None


def _disabled() -> bool:
    return os.getenv("REPORT_SCHEDULER", "").strip().lower() == "off"


def _run_once() -> int:
    db = SessionLocal()
    try:
        return generate_due_reports(db)
    finally:
        db.close()


async def _loop() -> None:
    while True:
        try:
            created = await asyncio.to_thread(_run_once)
            if created:
                logger.info("财报调度本次生成 %s 份报告", created)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("财报生成任务失败")
        await asyncio.sleep(INTERVAL_SECONDS)


def start() -> None:
    """启动调度（幂等），由 FastAPI startup 事件调用。"""
    global _started, _task

    if _started and _task is not None and not _task.done():
        return
    if _disabled():
        logger.info("REPORT_SCHEDULER=off，财报调度未启动")
        return

    _task = asyncio.create_task(_loop(), name="report-scheduler")
    _started = True
    logger.info("财报调度已启动，每 %s 秒检查一次", INTERVAL_SECONDS)


def stop() -> None:
    """取消调度任务，由 FastAPI shutdown 事件调用。"""
    global _started, _task

    task = _task
    _task = None
    _started = False
    if task is not None and not task.done():
        task.cancel()
