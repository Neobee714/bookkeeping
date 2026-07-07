from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


AgentRole = Literal["user", "assistant"]


class AgentChatMessage(BaseModel):
    role: AgentRole
    content: str = Field(min_length=1, max_length=4000)


class AgentChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    history: list[AgentChatMessage] = Field(default_factory=list, max_length=40)


class AgentToolCallSummary(BaseModel):
    name: str
    target: str | None = None


class AgentChatResponse(BaseModel):
    reply: str
    tool_calls: list[AgentToolCallSummary] = Field(default_factory=list)
