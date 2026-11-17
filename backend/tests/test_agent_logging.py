"""v0.20 日志补齐：工具调用、agent 生命周期、异常堆栈都必须落到日志。

背景：容器 root logger 没有任何 handler，logger.exception 的堆栈线上完全看不到；
这里用 caplog 固化「每个环节都有日志」的契约。
"""
from __future__ import annotations

import logging
from types import SimpleNamespace

import pytest
from langchain_core.messages import AIMessage

from app.agent import graph as agent_graph
from app.agent.graph import AI_UNAVAILABLE_REPLY, run_agent_chat
from app.agent.tools import _serialized_tool

TOOLS_LOGGER = "app.agent.tools"
GRAPH_LOGGER = "app.agent.graph"


def _messages(caplog: pytest.LogCaptureFixture, logger_name: str) -> list[str]:
    return [r.getMessage() for r in caplog.records if r.name == logger_name]


def test_serialized_tool_logs_start_and_ok(caplog: pytest.LogCaptureFixture) -> None:
    def summarize(**kwargs: object) -> dict[str, float]:
        return {"total_expense": 1.5}

    tool = _serialized_tool(summarize)
    with caplog.at_level(logging.INFO, logger=TOOLS_LOGGER):
        result = tool(target="self", start_date="2026-11-01", end_date="2026-11-16")

    assert result == {"total_expense": 1.5}
    messages = _messages(caplog, TOOLS_LOGGER)
    assert any(m.startswith("tool summarize start") and "args=" in m for m in messages)
    assert any(
        m.startswith("tool summarize ok")
        and "elapsed_ms=" in m
        and "lock_wait_ms=" in m
        and "result=" in m
        for m in messages
    )


def test_serialized_tool_logs_exception_with_traceback(caplog: pytest.LogCaptureFixture) -> None:
    def boom(**kwargs: object) -> None:
        raise RuntimeError("炸了")

    tool = _serialized_tool(boom)
    with caplog.at_level(logging.INFO, logger=TOOLS_LOGGER):
        with pytest.raises(RuntimeError):
            tool()

    errors = [r for r in caplog.records if r.name == TOOLS_LOGGER and r.levelno == logging.ERROR]
    assert errors, "工具异常必须记 ERROR 日志"
    assert "tool boom failed" in errors[0].getMessage()
    assert errors[0].exc_info is not None, "堆栈必须随日志落盘"


def _fake_agent(result: object) -> object:
    class _Agent:
        def invoke(self, *_args: object, **_kwargs: object) -> object:
            if isinstance(result, Exception):
                raise result
            return result

    return _Agent()


def test_run_agent_chat_logs_start_and_done(
    caplog: pytest.LogCaptureFixture, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(agent_graph.config, "DEEPSEEK_API_KEY", "test-key")
    monkeypatch.setattr(
        agent_graph,
        "create_react_agent",
        lambda *args, **kwargs: _fake_agent({"messages": [AIMessage(content="嗨")]}),
    )
    user = SimpleNamespace(id=7, partner_id=None)

    with caplog.at_level(logging.INFO, logger=GRAPH_LOGGER):
        data = run_agent_chat(db=None, current_user=user, message="你好", history=[])

    assert data["reply"] == "嗨"
    messages = _messages(caplog, GRAPH_LOGGER)
    assert any(m.startswith("agent chat start") and "user=7" in m for m in messages)
    assert any(m.startswith("agent chat done") and "user=7" in m and "elapsed_ms=" in m for m in messages)


def test_run_agent_chat_logs_failure_with_traceback(
    caplog: pytest.LogCaptureFixture, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(agent_graph.config, "DEEPSEEK_API_KEY", "test-key")
    monkeypatch.setattr(
        agent_graph,
        "create_react_agent",
        lambda *args, **kwargs: _fake_agent(RuntimeError("boom")),
    )
    user = SimpleNamespace(id=7, partner_id=None)

    with caplog.at_level(logging.INFO, logger=GRAPH_LOGGER):
        data = run_agent_chat(db=None, current_user=user, message="你好", history=[])

    assert data["reply"] == AI_UNAVAILABLE_REPLY
    errors = [r for r in caplog.records if r.name == GRAPH_LOGGER and r.levelno == logging.ERROR]
    assert errors, "agent 失败必须记 ERROR 日志"
    assert "agent chat failed" in errors[0].getMessage()
    assert errors[0].exc_info is not None, "堆栈必须随日志落盘"
