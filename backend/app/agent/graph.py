from __future__ import annotations

import logging
import time

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
from langchain_openai import ChatOpenAI
from langgraph.prebuilt import create_react_agent
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.agent.prompts import build_system_prompt
from app.agent.tools import AgentToolError, build_agent_tools, categories_for_user
from app.core import config
from app.models.user import User
from app.schemas.agent import AgentChatMessage

logger = logging.getLogger(__name__)

AI_UNAVAILABLE_REPLY = "AI 助手暂时不可用，请稍后再试"
TOOL_VALIDATION_REPLY = "工具参数有误，请补充正确的日期或查询条件后再试"


def _history_to_messages(history: list[AgentChatMessage]) -> list[BaseMessage]:
    trimmed = history[-config.AGENT_MAX_HISTORY_MESSAGES :]
    messages: list[BaseMessage] = []
    for item in trimmed:
        if item.role == "user":
            messages.append(HumanMessage(content=item.content))
        elif item.role == "assistant":
            messages.append(AIMessage(content=item.content))
    return messages


def _extract_tool_calls(messages: list[BaseMessage]) -> list[dict[str, str | None]]:
    calls: list[dict[str, str | None]] = []
    for message in messages:
        for call in getattr(message, "tool_calls", []) or []:
            args = call.get("args") or {}
            calls.append({"name": call.get("name", ""), "target": args.get("target")})
    return calls


def _elapsed_ms(started: float) -> int:
    return int((time.monotonic() - started) * 1000)


def run_agent_chat(
    *,
    db: Session,
    current_user: User,
    message: str,
    history: list[AgentChatMessage],
) -> dict:
    request_timeout = config.DEEPSEEK_TIMEOUT_SECONDS
    model = ChatOpenAI(
        api_key=config.DEEPSEEK_API_KEY,
        base_url=config.DEEPSEEK_BASE_URL,
        model=config.DEEPSEEK_MODEL,
        temperature=0.2,
        request_timeout=request_timeout,
    )
    categories = categories_for_user(db, current_user.id)
    tools = build_agent_tools(
        db=db,
        current_user=current_user,
        max_transaction_limit=config.AGENT_TRANSACTION_RESULT_LIMIT,
        categories=categories,
    )
    agent = create_react_agent(
        model, tools, prompt=build_system_prompt(categories=categories)
    )
    messages = _history_to_messages(history)
    messages.append(HumanMessage(content=message))

    logger.info(
        "agent chat start user=%s model=%s msg_len=%s history=%s timeout=%ss recursion_limit=%s",
        current_user.id,
        config.DEEPSEEK_MODEL,
        len(message),
        len(history),
        request_timeout,
        config.AGENT_RECURSION_LIMIT,
    )
    started = time.monotonic()

    try:
        result = agent.invoke(
            {"messages": messages},
            config={"recursion_limit": config.AGENT_RECURSION_LIMIT},
        )
    except AgentToolError as exc:
        logger.warning(
            "agent tool error user=%s elapsed_ms=%d: %s",
            current_user.id,
            _elapsed_ms(started),
            exc,
        )
        return {"reply": str(exc), "tool_calls": []}
    except ValidationError as exc:
        logger.warning(
            "agent tool validation user=%s elapsed_ms=%d: %s",
            current_user.id,
            _elapsed_ms(started),
            exc,
        )
        return {"reply": TOOL_VALIDATION_REPLY, "tool_calls": []}
    except Exception:
        # 不要静默吞掉：这里以前只回兜底文案，线上排查时完全看不到原因。
        logger.exception(
            "agent chat failed: user_id=%s message_len=%s history=%s elapsed_ms=%d",
            current_user.id,
            len(message),
            len(history),
            _elapsed_ms(started),
        )
        return {"reply": AI_UNAVAILABLE_REPLY, "tool_calls": []}

    result_messages = result.get("messages", [])
    tool_calls = _extract_tool_calls(result_messages)
    logger.info(
        "agent chat done user=%s elapsed_ms=%d steps=%d tool_calls=%s",
        current_user.id,
        _elapsed_ms(started),
        len(result_messages),
        ",".join(call["name"] or "" for call in tool_calls) or "-",
    )
    final_message = result_messages[-1] if result_messages else AIMessage(content="没有生成回复")
    content = final_message.content
    reply = content if isinstance(content, str) else str(content)
    return {"reply": reply, "tool_calls": tool_calls}
