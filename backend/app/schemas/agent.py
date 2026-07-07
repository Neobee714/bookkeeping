from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator


AgentRole = Literal["user", "assistant"]


class AgentChatMessage(BaseModel):
    role: AgentRole
    content: str = Field(min_length=1, max_length=4000)

    @field_validator("content")
    @classmethod
    def content_must_not_be_blank(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("content must not be blank")
        return stripped


class AgentChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    history: list[AgentChatMessage] = Field(default_factory=list, max_length=40)

    @field_validator("message")
    @classmethod
    def message_must_not_be_blank(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("message must not be blank")
        return stripped


class AgentToolCallSummary(BaseModel):
    name: str
    target: str | None = None


class AgentChatResponse(BaseModel):
    reply: str
    tool_calls: list[AgentToolCallSummary] = Field(default_factory=list)
