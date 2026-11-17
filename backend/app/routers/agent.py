from __future__ import annotations

import logging
import time

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.agent.graph import run_agent_chat
from app.core import config
from app.core.database import get_db
from app.core.response import success_response
from app.core.security import get_current_user
from app.models.user import User
from app.schemas.agent import AgentChatRequest, AgentChatResponse

router = APIRouter(prefix="/agent", tags=["agent"])
logger = logging.getLogger("bookkeeping.agent")


@router.post("/chat")
def chat_with_agent(
    payload: AgentChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    if not config.DEEPSEEK_API_KEY:
        logger.error("agent request rejected: DEEPSEEK_API_KEY 未配置")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI 服务未配置，请先设置 DEEPSEEK_API_KEY",
        )

    logger.info(
        "agent request user=%s msg_len=%s history=%s",
        current_user.id,
        len(payload.message),
        len(payload.history),
    )
    started = time.monotonic()
    data = run_agent_chat(
        db=db,
        current_user=current_user,
        message=payload.message,
        history=payload.history,
    )
    reply = str(data.get("reply") or "")
    logger.info(
        "agent response user=%s elapsed_ms=%d reply_len=%s tool_calls=%s",
        current_user.id,
        int((time.monotonic() - started) * 1000),
        len(reply),
        len(data.get("tool_calls") or []),
    )
    return success_response(data=AgentChatResponse(**data).model_dump())
