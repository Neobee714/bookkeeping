from __future__ import annotations

from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.agent.graph import run_agent_chat
from app.agent.tools import AgentToolError, SummarizeExpensesInput
from app.core.database import Base, get_db
from app.core.security import get_current_user
from app.main import app
from app.models.user import User


@pytest.fixture()
def client(monkeypatch: pytest.MonkeyPatch) -> Generator[TestClient, None, None]:
    monkeypatch.setattr("app.core.config.DEEPSEEK_API_KEY", "")
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(engine)

    def override_get_db() -> Generator[Session, None, None]:
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    def override_get_current_user() -> User:
        return User(
            id=1,
            username="alice",
            nickname="Alice",
            password_hash="unused",
            reg_invite_code="ABCDEFGH",
        )

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(engine)


def test_agent_chat_requires_deepseek_api_key(client: TestClient) -> None:
    response = client.post(
        "/agent/chat",
        json={"message": "总结最近六个月开销", "history": []},
    )

    assert response.status_code == 503
    assert response.json()["success"] is False
    assert response.json()["message"] == "AI 服务未配置，请先设置 DEEPSEEK_API_KEY"


def test_agent_chat_rejects_empty_message(client: TestClient) -> None:
    response = client.post("/agent/chat", json={"message": "", "history": []})

    assert response.status_code == 422


def test_agent_chat_rejects_whitespace_only_message(client: TestClient) -> None:
    response = client.post("/agent/chat", json={"message": "   \n\t", "history": []})

    assert response.status_code == 422


def test_agent_chat_rejects_whitespace_only_history_content(client: TestClient) -> None:
    response = client.post(
        "/agent/chat",
        json={"message": "总结本月开销", "history": [{"role": "user", "content": "   "}]},
    )

    assert response.status_code == 422


def test_agent_chat_returns_runner_reply(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("app.core.config.DEEPSEEK_API_KEY", "test-key")

    def fake_run_agent_chat(*, db, current_user, message, history):
        assert db is not None
        assert isinstance(db, Session)
        assert current_user.id == 1
        assert message == "总结最近六个月开销"
        assert history == []
        return {
            "reply": "最近六个月总支出 100 元。",
            "tool_calls": [{"name": "summarize_expenses", "target": "self"}],
        }

    monkeypatch.setattr("app.routers.agent.run_agent_chat", fake_run_agent_chat)

    response = client.post(
        "/agent/chat",
        json={"message": "总结最近六个月开销", "history": []},
    )

    assert response.status_code == 200
    assert response.json()["data"]["reply"] == "最近六个月总支出 100 元。"
    assert response.json()["data"]["tool_calls"] == [
        {"name": "summarize_expenses", "target": "self"}
    ]


def test_run_agent_chat_returns_tool_error_and_sets_request_timeout(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured_model_kwargs = {}

    class FakeChatOpenAI:
        def __init__(self, **kwargs):
            captured_model_kwargs.update(kwargs)

    class FakeAgent:
        def invoke(self, _payload):
            raise AgentToolError("日期格式不正确，请使用 YYYY-MM-DD")

    monkeypatch.setattr("app.agent.graph.ChatOpenAI", FakeChatOpenAI)
    monkeypatch.setattr("app.agent.graph.build_agent_tools", lambda **_kwargs: [])
    monkeypatch.setattr("app.agent.graph.create_react_agent", lambda *_args, **_kwargs: FakeAgent())

    result = run_agent_chat(
        db=None,
        current_user=User(id=1, username="alice", password_hash="unused", reg_invite_code="ABCDEFGH"),
        message="总结本月开销",
        history=[],
    )

    assert captured_model_kwargs["request_timeout"] == 30
    assert result == {"reply": "日期格式不正确，请使用 YYYY-MM-DD", "tool_calls": []}


def test_run_agent_chat_returns_friendly_reply_for_validation_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FakeChatOpenAI:
        def __init__(self, **_kwargs):
            pass

    class FakeAgent:
        def invoke(self, _payload):
            SummarizeExpensesInput(target="self", start_date="2026-01-01")

    monkeypatch.setattr("app.agent.graph.ChatOpenAI", FakeChatOpenAI)
    monkeypatch.setattr("app.agent.graph.build_agent_tools", lambda **_kwargs: [])
    monkeypatch.setattr("app.agent.graph.create_react_agent", lambda *_args, **_kwargs: FakeAgent())

    result = run_agent_chat(
        db=None,
        current_user=User(id=1, username="alice", password_hash="unused", reg_invite_code="ABCDEFGH"),
        message="总结本月开销",
        history=[],
    )

    assert result == {"reply": "工具参数有误，请补充正确的日期或查询条件后再试", "tool_calls": []}


def test_run_agent_chat_returns_friendly_reply_for_provider_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FakeChatOpenAI:
        def __init__(self, **_kwargs):
            pass

    class FakeAgent:
        def invoke(self, _payload):
            raise RuntimeError("network unavailable")

    monkeypatch.setattr("app.agent.graph.ChatOpenAI", FakeChatOpenAI)
    monkeypatch.setattr("app.agent.graph.build_agent_tools", lambda **_kwargs: [])
    monkeypatch.setattr("app.agent.graph.create_react_agent", lambda *_args, **_kwargs: FakeAgent())

    result = run_agent_chat(
        db=None,
        current_user=User(id=1, username="alice", password_hash="unused", reg_invite_code="ABCDEFGH"),
        message="总结本月开销",
        history=[],
    )

    assert result == {"reply": "AI 助手暂时不可用，请稍后再试", "tool_calls": []}
