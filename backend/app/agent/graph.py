from __future__ import annotations

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
from langchain_openai import ChatOpenAI
from langgraph.prebuilt import create_react_agent
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.agent.prompts import build_system_prompt
from app.agent.tools import AgentToolError, build_agent_tools
from app.core import config
from app.models.user import User
from app.schemas.agent import AgentChatMessage

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


def run_agent_chat(
    *,
    db: Session,
    current_user: User,
    message: str,
    history: list[AgentChatMessage],
) -> dict:
    model = ChatOpenAI(
        api_key=config.DEEPSEEK_API_KEY,
        base_url=config.DEEPSEEK_BASE_URL,
        model=config.DEEPSEEK_MODEL,
        temperature=0.2,
        request_timeout=30,
    )
    tools = build_agent_tools(
        db=db,
        current_user=current_user,
        max_transaction_limit=config.AGENT_TRANSACTION_RESULT_LIMIT,
    )
    agent = create_react_agent(model, tools, prompt=build_system_prompt())
    messages = _history_to_messages(history)
    messages.append(HumanMessage(content=message))

    try:
        result = agent.invoke({"messages": messages})
    except AgentToolError as exc:
        return {"reply": str(exc), "tool_calls": []}
    except ValidationError:
        return {"reply": TOOL_VALIDATION_REPLY, "tool_calls": []}
    except Exception:
        return {"reply": AI_UNAVAILABLE_REPLY, "tool_calls": []}

    result_messages = result.get("messages", [])
    final_message = result_messages[-1] if result_messages else AIMessage(content="没有生成回复")
    content = final_message.content
    reply = content if isinstance(content, str) else str(content)
    return {"reply": reply, "tool_calls": _extract_tool_calls(result_messages)}
