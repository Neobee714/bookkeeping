# Bill AI Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a DeepSeek-backed LangGraph chat Agent that answers expense analysis and transaction-detail questions for the current user, their bound partner, or both.

**Architecture:** Add a FastAPI `/agent/chat` endpoint that builds a LangGraph ReAct-style Agent with whitelisted SQLAlchemy ORM tools. The model never receives arbitrary database access or user IDs; tool code resolves `self`, `partner`, and `both` from the authenticated `current_user`. The frontend adds an in-memory chat page and calls the backend with recent page-local history.

**Tech Stack:** FastAPI, SQLAlchemy, Pydantic, LangGraph, LangChain, `langchain-openai` with DeepSeek custom `base_url`, React, TypeScript, Vite, Tailwind.

---

## File Structure

Backend:

- Create `backend/app/schemas/agent.py`: request/response Pydantic schemas for chat messages and tool-call summaries.
- Create `backend/app/agent/__init__.py`: package marker.
- Create `backend/app/agent/tools.py`: pure-ish ORM query helpers plus LangChain tool factory bound to `db` and `current_user`.
- Create `backend/app/agent/prompts.py`: system prompt builder with current date and behavior constraints.
- Create `backend/app/agent/graph.py`: DeepSeek model creation and LangGraph Agent execution.
- Create `backend/app/routers/agent.py`: FastAPI route, auth, config guard, and response serialization.
- Modify `backend/app/core/config.py`: add DeepSeek and Agent settings.
- Modify `backend/app/main.py`: include the Agent router.
- Modify `backend/requirements.txt`: add LangGraph and LangChain dependencies.
- Create `backend/tests/test_agent_tools.py`: permission and ORM tool tests that do not call DeepSeek.
- Create `backend/tests/test_agent_router.py`: API guard tests for missing DeepSeek key and request validation.

Frontend:

- Create `frontend/src/api/agent.ts`: `sendAgentMessage` API client.
- Create `frontend/src/pages/AgentPage.tsx`: in-memory chat UI.
- Modify `frontend/src/types/index.ts`: Agent request/response types.
- Modify `frontend/src/App.tsx`: route `/app/agent`.
- Modify `frontend/src/components/Layout.tsx`: bottom navigation entry.

---

## Task 1: Backend Schemas And Configuration

**Files:**
- Create: `backend/app/schemas/agent.py`
- Modify: `backend/app/core/config.py`
- Modify: `backend/requirements.txt`
- Test: `backend/tests/test_agent_router.py`

- [ ] **Step 1: Write failing schema/config tests**

Create `backend/tests/test_agent_router.py` with this initial content:

```python
from __future__ import annotations

from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

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
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
cd backend
python -m pytest tests/test_agent_router.py -v
```

Expected: FAIL during import or route lookup because `/agent/chat` and `app.schemas.agent` do not exist.

- [ ] **Step 3: Add backend dependencies**

Append these lines to `backend/requirements.txt`:

```text
langchain
langchain-openai
langgraph
```

- [ ] **Step 4: Add config values**

In `backend/app/core/config.py`, add after the existing app release settings:

```python
DEEPSEEK_API_KEY = (get_env("DEEPSEEK_API_KEY", "") or "").strip()
DEEPSEEK_BASE_URL = (get_env("DEEPSEEK_BASE_URL", "https://api.deepseek.com") or "").strip().rstrip("/")
DEEPSEEK_MODEL = (get_env("DEEPSEEK_MODEL", "deepseek-chat") or "deepseek-chat").strip()
AGENT_MAX_HISTORY_MESSAGES = int(get_env("AGENT_MAX_HISTORY_MESSAGES", "12"))
AGENT_TRANSACTION_RESULT_LIMIT = int(get_env("AGENT_TRANSACTION_RESULT_LIMIT", "50"))
```

- [ ] **Step 5: Create Agent schemas**

Create `backend/app/schemas/agent.py`:

```python
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
```

- [ ] **Step 6: Create temporary router guard**

Create `backend/app/routers/agent.py`:

```python
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core import config
from app.core.database import get_db
from app.core.response import success_response
from app.core.security import get_current_user
from app.models.user import User
from app.schemas.agent import AgentChatRequest, AgentChatResponse

router = APIRouter(prefix="/agent", tags=["agent"])


@router.post("/chat")
def chat_with_agent(
    payload: AgentChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    if not config.DEEPSEEK_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI 服务未配置，请先设置 DEEPSEEK_API_KEY",
        )

    _ = current_user, db
    data = AgentChatResponse(reply="", tool_calls=[])
    return success_response(data=data.model_dump())
```

- [ ] **Step 7: Register the router**

In `backend/app/main.py`, add `agent_router` to the router imports and include it:

```python
from app.routers import (
    agent_router,
    app_updates_router,
    auth_router,
    budget_router,
    categories_router,
    circles_router,
    savings_router,
    stats_router,
    transactions_router,
)
```

```python
app.include_router(agent_router)
```

Also update `backend/app/routers/__init__.py` to export the router:

```python
from app.routers.agent import router as agent_router
```

- [ ] **Step 8: Run tests to verify they pass**

Run:

```powershell
cd backend
python -m pytest tests/test_agent_router.py -v
```

Expected: PASS for both tests.

- [ ] **Step 9: Commit**

```powershell
git add backend/requirements.txt backend/app/core/config.py backend/app/schemas/agent.py backend/app/routers/agent.py backend/app/routers/__init__.py backend/app/main.py backend/tests/test_agent_router.py
git commit -m "feat: add agent chat api guard"
```

---

## Task 2: Backend Tool Permission And Query Layer

**Files:**
- Create: `backend/app/agent/__init__.py`
- Create: `backend/app/agent/tools.py`
- Test: `backend/tests/test_agent_tools.py`

- [ ] **Step 1: Write failing tool tests**

Create `backend/tests/test_agent_tools.py`:

```python
from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.agent.tools import (
    AgentToolError,
    SearchTransactionsInput,
    SummarizeExpensesInput,
    resolve_target_user_ids,
    search_transactions_data,
    summarize_expenses_data,
)
from app.core.database import Base
from app.models.enums import TransactionType
from app.models.transaction import Transaction
from app.models.user import User


@pytest.fixture()
def db() -> Session:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(engine)


def make_user(user_id: int, partner_id: int | None = None) -> User:
    return User(
        id=user_id,
        username=f"user{user_id}",
        nickname=f"User {user_id}",
        partner_id=partner_id,
        password_hash="unused",
        reg_invite_code=f"CODE{user_id:04d}",
    )


def add_transaction(
    db: Session,
    user_id: int,
    amount: str,
    tx_type: TransactionType,
    category: str,
    note: str | None,
    tx_date: date,
) -> None:
    db.add(
        Transaction(
            user_id=user_id,
            amount=Decimal(amount),
            type=tx_type,
            category=category,
            note=note,
            date=tx_date,
        )
    )


def test_resolve_target_user_ids_rejects_partner_without_binding() -> None:
    user = make_user(1)

    with pytest.raises(AgentToolError, match="尚未绑定伴侣"):
        resolve_target_user_ids(user, "partner")


def test_resolve_target_user_ids_allows_only_self_partner_or_both() -> None:
    user = make_user(1, partner_id=2)

    assert resolve_target_user_ids(user, "self") == [1]
    assert resolve_target_user_ids(user, "partner") == [2]
    assert resolve_target_user_ids(user, "both") == [1, 2]

    with pytest.raises(AgentToolError, match="查询范围不支持"):
        resolve_target_user_ids(user, "someone_else")


def test_summarize_expenses_data_limits_to_allowed_users(db: Session) -> None:
    current_user = make_user(1, partner_id=2)
    add_transaction(db, 1, "100.00", TransactionType.EXPENSE, "餐饮", "午饭", date(2026, 1, 5))
    add_transaction(db, 2, "80.00", TransactionType.EXPENSE, "购物", "日用品", date(2026, 1, 6))
    add_transaction(db, 3, "999.00", TransactionType.EXPENSE, "其他", "别人", date(2026, 1, 7))
    add_transaction(db, 1, "300.00", TransactionType.INCOME, "工资", "工资", date(2026, 1, 8))
    db.commit()

    result = summarize_expenses_data(
        db,
        current_user,
        SummarizeExpensesInput(target="both", start_date="2026-01-01", end_date="2026-02-01"),
    )

    assert result["total_expense"] == 180.0
    assert result["total_income"] == 300.0
    assert result["transaction_count"] == 3
    assert result["category_expenses"] == {"购物": 80.0, "餐饮": 100.0}


def test_search_transactions_data_filters_and_caps_limit(db: Session) -> None:
    current_user = make_user(1, partner_id=2)
    add_transaction(db, 1, "120.00", TransactionType.EXPENSE, "餐饮", "奶茶", date(2026, 3, 1))
    add_transaction(db, 1, "60.00", TransactionType.EXPENSE, "餐饮", "面包", date(2026, 3, 2))
    add_transaction(db, 2, "150.00", TransactionType.EXPENSE, "餐饮", "奶茶", date(2026, 3, 3))
    add_transaction(db, 3, "500.00", TransactionType.EXPENSE, "餐饮", "奶茶", date(2026, 3, 4))
    db.commit()

    result = search_transactions_data(
        db,
        current_user,
        SearchTransactionsInput(
            target="both",
            start_date="2026-03-01",
            end_date="2026-04-01",
            category="餐饮",
            note_keyword="奶茶",
            min_amount=100,
            limit=10,
        ),
        max_limit=2,
    )

    assert result["truncated"] is False
    assert [item["amount"] for item in result["items"]] == [150.0, 120.0]
    assert {item["owner"] for item in result["items"]} == {"self", "partner"}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
cd backend
python -m pytest tests/test_agent_tools.py -v
```

Expected: FAIL because `app.agent.tools` does not exist.

- [ ] **Step 3: Create tool implementation**

Create empty `backend/app/agent/__init__.py`.

Create `backend/app/agent/tools.py`:

```python
from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Literal

from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.date_utils import parse_iso_date
from app.models.enums import TransactionType
from app.models.transaction import Transaction
from app.models.user import User

Target = Literal["self", "partner", "both"]


class AgentToolError(ValueError):
    pass


class DateWindowInput(BaseModel):
    target: Target
    start_date: str = Field(description="Inclusive start date, YYYY-MM-DD")
    end_date: str = Field(description="Exclusive end date, YYYY-MM-DD")


class SummarizeExpensesInput(DateWindowInput):
    pass


class CategoryBreakdownInput(DateWindowInput):
    pass


class SearchTransactionsInput(DateWindowInput):
    category: str | None = None
    note_keyword: str | None = None
    min_amount: float | None = Field(default=None, ge=0)
    max_amount: float | None = Field(default=None, ge=0)
    limit: int | None = Field(default=20, ge=1, le=100)


class TopExpensesInput(DateWindowInput):
    limit: int | None = Field(default=10, ge=1, le=100)


class CompareExpensesInput(BaseModel):
    target: Target
    start_date_a: str
    end_date_a: str
    start_date_b: str
    end_date_b: str


def _to_float(value: Decimal | None) -> float:
    return float(value or Decimal("0"))


def _parse_window(start_date: str, end_date: str) -> tuple[date, date]:
    start = parse_iso_date(start_date)
    end = parse_iso_date(end_date)
    if start >= end:
        raise AgentToolError("开始日期必须早于结束日期")
    return start, end


def resolve_target_user_ids(current_user: User, target: str) -> list[int]:
    if target == "self":
        return [int(current_user.id)]
    if target == "partner":
        if not current_user.partner_id:
            raise AgentToolError("尚未绑定伴侣，无法查询伴侣账单")
        return [int(current_user.partner_id)]
    if target == "both":
        if not current_user.partner_id:
            raise AgentToolError("尚未绑定伴侣，无法查询两人合计账单")
        return [int(current_user.id), int(current_user.partner_id)]
    raise AgentToolError("查询范围不支持")


def _owner_label(current_user: User, user_id: int) -> str:
    if user_id == current_user.id:
        return "self"
    if user_id == current_user.partner_id:
        return "partner"
    return "unknown"


def summarize_expenses_data(
    db: Session,
    current_user: User,
    payload: SummarizeExpensesInput,
) -> dict:
    start, end = _parse_window(payload.start_date, payload.end_date)
    user_ids = resolve_target_user_ids(current_user, payload.target)
    base_filter = (
        Transaction.user_id.in_(user_ids),
        Transaction.date >= start,
        Transaction.date < end,
    )

    totals_rows = db.execute(
        select(Transaction.type, func.coalesce(func.sum(Transaction.amount), Decimal("0")))
        .where(*base_filter)
        .group_by(Transaction.type)
    ).all()
    total_income = Decimal("0")
    total_expense = Decimal("0")
    for tx_type, amount in totals_rows:
        if tx_type == TransactionType.INCOME:
            total_income = amount
        elif tx_type == TransactionType.EXPENSE:
            total_expense = amount

    category_rows = db.execute(
        select(Transaction.category, func.coalesce(func.sum(Transaction.amount), Decimal("0")))
        .where(*base_filter, Transaction.type == TransactionType.EXPENSE)
        .group_by(Transaction.category)
        .order_by(func.coalesce(func.sum(Transaction.amount), Decimal("0")).desc())
    ).all()
    note_rows = db.execute(
        select(
            Transaction.note,
            Transaction.category,
            func.coalesce(func.sum(Transaction.amount), Decimal("0")),
            func.count(Transaction.id),
        )
        .where(*base_filter, Transaction.type == TransactionType.EXPENSE)
        .group_by(Transaction.note, Transaction.category)
        .order_by(func.coalesce(func.sum(Transaction.amount), Decimal("0")).desc())
        .limit(10)
    ).all()
    transaction_count = int(db.scalar(select(func.count(Transaction.id)).where(*base_filter)) or 0)

    return {
        "target": payload.target,
        "start_date": payload.start_date,
        "end_date": payload.end_date,
        "total_income": _to_float(total_income),
        "total_expense": _to_float(total_expense),
        "balance": _to_float(total_income - total_expense),
        "transaction_count": transaction_count,
        "category_expenses": {category: _to_float(amount) for category, amount in category_rows},
        "top_notes": [
            {
                "note": note or "未备注",
                "category": category,
                "amount": _to_float(amount),
                "count": int(count or 0),
            }
            for note, category, amount, count in note_rows
        ],
    }


def category_breakdown_data(
    db: Session,
    current_user: User,
    payload: CategoryBreakdownInput,
) -> dict:
    summary = summarize_expenses_data(
        db,
        current_user,
        SummarizeExpensesInput(**payload.model_dump()),
    )
    total = summary["total_expense"]
    rows = [
        {
            "category": category,
            "amount": amount,
            "ratio": round(amount / total, 4) if total > 0 else 0,
        }
        for category, amount in summary["category_expenses"].items()
    ]
    return {"target": payload.target, "start_date": payload.start_date, "end_date": payload.end_date, "items": rows}


def search_transactions_data(
    db: Session,
    current_user: User,
    payload: SearchTransactionsInput,
    max_limit: int,
) -> dict:
    start, end = _parse_window(payload.start_date, payload.end_date)
    user_ids = resolve_target_user_ids(current_user, payload.target)
    requested_limit = payload.limit or 20
    limit = min(requested_limit, max_limit)
    stmt = select(Transaction).where(
        Transaction.user_id.in_(user_ids),
        Transaction.type == TransactionType.EXPENSE,
        Transaction.date >= start,
        Transaction.date < end,
    )
    if payload.category:
        stmt = stmt.where(Transaction.category == payload.category)
    if payload.note_keyword:
        stmt = stmt.where(Transaction.note.ilike(f"%{payload.note_keyword}%"))
    if payload.min_amount is not None:
        stmt = stmt.where(Transaction.amount >= Decimal(str(payload.min_amount)))
    if payload.max_amount is not None:
        stmt = stmt.where(Transaction.amount <= Decimal(str(payload.max_amount)))

    rows = list(
        db.scalars(
            stmt.order_by(Transaction.amount.desc(), Transaction.date.desc()).limit(limit + 1)
        ).all()
    )
    visible_rows = rows[:limit]
    return {
        "target": payload.target,
        "start_date": payload.start_date,
        "end_date": payload.end_date,
        "truncated": len(rows) > limit,
        "items": [
            {
                "owner": _owner_label(current_user, item.user_id),
                "amount": _to_float(item.amount),
                "category": item.category,
                "note": item.note,
                "date": item.date.isoformat(),
            }
            for item in visible_rows
        ],
    }


def top_expenses_data(
    db: Session,
    current_user: User,
    payload: TopExpensesInput,
    max_limit: int,
) -> dict:
    return search_transactions_data(
        db,
        current_user,
        SearchTransactionsInput(**payload.model_dump()),
        max_limit=max_limit,
    )


def compare_expenses_data(
    db: Session,
    current_user: User,
    payload: CompareExpensesInput,
) -> dict:
    first = summarize_expenses_data(
        db,
        current_user,
        SummarizeExpensesInput(
            target=payload.target,
            start_date=payload.start_date_a,
            end_date=payload.end_date_a,
        ),
    )
    second = summarize_expenses_data(
        db,
        current_user,
        SummarizeExpensesInput(
            target=payload.target,
            start_date=payload.start_date_b,
            end_date=payload.end_date_b,
        ),
    )
    return {
        "target": payload.target,
        "period_a": first,
        "period_b": second,
        "expense_delta": round(second["total_expense"] - first["total_expense"], 2),
        "income_delta": round(second["total_income"] - first["total_income"], 2),
    }


def build_agent_tools(db: Session, current_user: User, max_transaction_limit: int) -> list[StructuredTool]:
    return [
        StructuredTool.from_function(
            name="summarize_expenses",
            description="Summarize income, expense, balance, category spending, and top notes for a date range.",
            args_schema=SummarizeExpensesInput,
            func=lambda **kwargs: summarize_expenses_data(db, current_user, SummarizeExpensesInput(**kwargs)),
        ),
        StructuredTool.from_function(
            name="category_breakdown",
            description="Return expense breakdown by category for a date range.",
            args_schema=CategoryBreakdownInput,
            func=lambda **kwargs: category_breakdown_data(db, current_user, CategoryBreakdownInput(**kwargs)),
        ),
        StructuredTool.from_function(
            name="search_transactions",
            description="Search expense transactions with optional category, note keyword, amount filters, and limit.",
            args_schema=SearchTransactionsInput,
            func=lambda **kwargs: search_transactions_data(
                db,
                current_user,
                SearchTransactionsInput(**kwargs),
                max_limit=max_transaction_limit,
            ),
        ),
        StructuredTool.from_function(
            name="top_expenses",
            description="Return the highest expense transactions in a date range.",
            args_schema=TopExpensesInput,
            func=lambda **kwargs: top_expenses_data(
                db,
                current_user,
                TopExpensesInput(**kwargs),
                max_limit=max_transaction_limit,
            ),
        ),
        StructuredTool.from_function(
            name="compare_expenses",
            description="Compare two date ranges for income, expense, balance, and category differences.",
            args_schema=CompareExpensesInput,
            func=lambda **kwargs: compare_expenses_data(db, current_user, CompareExpensesInput(**kwargs)),
        ),
    ]
```

- [ ] **Step 4: Run tool tests**

Run:

```powershell
cd backend
python -m pytest tests/test_agent_tools.py -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add backend/app/agent/__init__.py backend/app/agent/tools.py backend/tests/test_agent_tools.py
git commit -m "feat: add agent transaction tools"
```

---

## Task 3: LangGraph Agent Execution

**Files:**
- Create: `backend/app/agent/prompts.py`
- Create: `backend/app/agent/graph.py`
- Modify: `backend/app/routers/agent.py`
- Test: `backend/tests/test_agent_router.py`

- [ ] **Step 1: Extend router test with monkeypatched runner**

Append to `backend/tests/test_agent_router.py`:

```python
def test_agent_chat_returns_runner_reply(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("app.core.config.DEEPSEEK_API_KEY", "test-key")

    def fake_run_agent_chat(*, db, current_user, message, history):
        assert current_user.id == 1
        assert message == "总结最近六个月开销"
        assert history == []
        return {"reply": "最近六个月总支出 100 元。", "tool_calls": [{"name": "summarize_expenses", "target": "self"}]}

    monkeypatch.setattr("app.routers.agent.run_agent_chat", fake_run_agent_chat)

    response = client.post(
        "/agent/chat",
        json={"message": "总结最近六个月开销", "history": []},
    )

    assert response.status_code == 200
    assert response.json()["data"]["reply"] == "最近六个月总支出 100 元。"
    assert response.json()["data"]["tool_calls"] == [{"name": "summarize_expenses", "target": "self"}]
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
cd backend
python -m pytest tests/test_agent_router.py::test_agent_chat_returns_runner_reply -v
```

Expected: FAIL because `run_agent_chat` is not imported or used by the route.

- [ ] **Step 3: Add prompt builder**

Create `backend/app/agent/prompts.py`:

```python
from __future__ import annotations

from datetime import date


def build_system_prompt(today: date | None = None) -> str:
    current_date = today or date.today()
    return f"""
你是一个账单分析助手。今天是 {current_date.isoformat()}。

你只能根据工具返回的数据回答账单事实，不能编造金额、日期、分类或账单明细。
账单工具的 end_date 是开区间，表示 start_date <= date < end_date。
当用户说“我”时使用 target=self；说“伴侣、她、他”时使用 target=partner；说“两人、我们、合计”时使用 target=both。
如果用户问题缺少必要时间范围，先追问，不要猜测。
明细列表太长时只展示关键条目，并说明结果可能被截断。
没有查到账单时，明确说没有找到相关账单。
不要暴露内部 user_id。
不要提供投资、医疗、法律等高风险建议。
""".strip()
```

- [ ] **Step 4: Add LangGraph runner**

Create `backend/app/agent/graph.py`:

```python
from __future__ import annotations

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
from langchain_openai import ChatOpenAI
from langgraph.prebuilt import create_react_agent
from sqlalchemy.orm import Session

from app.agent.prompts import build_system_prompt
from app.agent.tools import AgentToolError, build_agent_tools
from app.core import config
from app.models.user import User
from app.schemas.agent import AgentChatMessage


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

    result_messages = result.get("messages", [])
    final_message = result_messages[-1] if result_messages else AIMessage(content="没有生成回复")
    content = final_message.content
    reply = content if isinstance(content, str) else str(content)
    return {"reply": reply, "tool_calls": _extract_tool_calls(result_messages)}
```

- [ ] **Step 5: Wire router to runner**

Modify `backend/app/routers/agent.py`:

```python
from app.agent.graph import run_agent_chat
```

Replace the temporary success body with:

```python
    data = run_agent_chat(
        db=db,
        current_user=current_user,
        message=payload.message,
        history=payload.history,
    )
    return success_response(data=AgentChatResponse(**data).model_dump())
```

- [ ] **Step 6: Run router tests**

Run:

```powershell
cd backend
python -m pytest tests/test_agent_router.py -v
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add backend/app/agent/prompts.py backend/app/agent/graph.py backend/app/routers/agent.py backend/tests/test_agent_router.py
git commit -m "feat: wire deepseek agent runner"
```

---

## Task 4: Frontend API Types And Client

**Files:**
- Modify: `frontend/src/types/index.ts`
- Create: `frontend/src/api/agent.ts`

- [ ] **Step 1: Add TypeScript types**

Append to `frontend/src/types/index.ts`:

```ts
export type AgentChatRole = 'user' | 'assistant';

export interface AgentChatMessage {
  role: AgentChatRole;
  content: string;
}

export interface AgentChatRequest {
  message: string;
  history: AgentChatMessage[];
}

export interface AgentToolCallSummary {
  name: string;
  target?: string | null;
}

export interface AgentChatResponse {
  reply: string;
  tool_calls: AgentToolCallSummary[];
}
```

- [ ] **Step 2: Add API client**

Create `frontend/src/api/agent.ts`:

```ts
import client from '@/api/client';
import type {
  AgentChatMessage,
  AgentChatResponse,
  ApiResponse,
} from '@/types';

const assertSuccess = <T>(response: ApiResponse<T>): T => {
  if (!response.success) {
    throw new Error(response.message || '请求失败');
  }
  return response.data;
};

export const sendAgentMessage = async (
  message: string,
  history: AgentChatMessage[],
): Promise<AgentChatResponse> => {
  const response = await client.post<ApiResponse<AgentChatResponse>>('/agent/chat', {
    message,
    history,
  });
  return assertSuccess(response.data);
};
```

- [ ] **Step 3: Run frontend type check/build**

Run:

```powershell
cd frontend
npm run build
```

Expected: PASS.

- [ ] **Step 4: Commit**

```powershell
git add frontend/src/types/index.ts frontend/src/api/agent.ts
git commit -m "feat: add agent frontend client"
```

---

## Task 5: Frontend Chat Page And Navigation

**Files:**
- Create: `frontend/src/pages/AgentPage.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/Layout.tsx`

- [ ] **Step 1: Create Agent chat page**

Create `frontend/src/pages/AgentPage.tsx`:

```tsx
import axios from 'axios';
import { useMemo, useState } from 'react';

import { sendAgentMessage } from '@/api/agent';
import type { AgentChatMessage } from '@/types';

const examples = [
  '总结我最近六个月的开销',
  '去年我和伴侣总共花了多少',
  '列出最近三个月餐饮超过 100 的账单',
];

function AgentPage() {
  const [messages, setMessages] = useState<AgentChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const canSend = useMemo(() => input.trim().length > 0 && !loading, [input, loading]);

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) {
      return;
    }

    const history = messages;
    const userMessage: AgentChatMessage = { role: 'user', content: trimmed };
    setMessages((current) => [...current, userMessage]);
    setInput('');
    setError('');
    setLoading(true);

    try {
      const response = await sendAgentMessage(trimmed, history);
      setMessages((current) => [
        ...current,
        { role: 'assistant', content: response.reply },
      ]);
    } catch (err) {
      const message = axios.isAxiosError(err)
        ? err.response?.data?.message ?? 'AI 助手暂时不可用'
        : err instanceof Error
          ? err.message
          : 'AI 助手暂时不可用';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="flex min-h-[calc(100vh-8rem)] flex-col pb-2">
      <h1 className="ios-anim mb-3 mt-2 text-[34px] font-bold tracking-tight text-[#1C1C1E]">
        AI 助手
      </h1>

      <div className="ios-glass ios-anim ios-anim-d1 mb-3 p-3">
        <div className="flex flex-wrap gap-2">
          {examples.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => void sendMessage(example)}
              className="rounded-full bg-[rgba(0,122,255,0.1)] px-3 py-1.5 text-[12px] font-medium text-[#007AFF]"
              disabled={loading}
            >
              {example}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="ios-glass ios-anim ios-anim-d2 px-4 py-10 text-center text-sm text-[#8E8E93]">
            可以问我开销总结、分类排行、伴侣账单和具体明细。
          </div>
        ) : (
          messages.map((message, index) => {
            const isUser = message.role === 'user';
            return (
              <div
                key={`${message.role}-${index}`}
                className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[82%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-[14px] leading-6 ${
                    isUser
                      ? 'bg-[#007AFF] text-white'
                      : 'ios-glass text-[#1C1C1E]'
                  }`}
                >
                  {message.content}
                </div>
              </div>
            );
          })
        )}

        {loading && (
          <div className="flex justify-start">
            <div className="ios-glass rounded-2xl px-3.5 py-2.5 text-[14px] text-[#8E8E93]">
              正在分析账单...
            </div>
          </div>
        )}

        {error && (
          <div className="ios-glass rounded-2xl px-3.5 py-2.5 text-[13px] text-[#FF3B30]">
            {error}
          </div>
        )}
      </div>

      <form
        className="ios-glass ios-glass-strong mt-3 flex items-end gap-2 p-2"
        onSubmit={(event) => {
          event.preventDefault();
          void sendMessage(input);
        }}
      >
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          rows={1}
          placeholder="问问最近的开销..."
          className="max-h-28 min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-[15px] text-[#1C1C1E] outline-none placeholder:text-[#8E8E93]"
        />
        <button
          type="submit"
          disabled={!canSend}
          className="h-10 rounded-full bg-[#007AFF] px-4 text-[14px] font-semibold text-white disabled:opacity-40"
        >
          发送
        </button>
      </form>
    </section>
  );
}

export default AgentPage;
```

- [ ] **Step 2: Add route**

Modify `frontend/src/App.tsx`:

```tsx
import AgentPage from '@/pages/AgentPage';
```

Add inside the `/app` route:

```tsx
<Route path="agent" element={<AgentPage />} />
```

- [ ] **Step 3: Add bottom nav item**

In `frontend/src/components/Layout.tsx`, insert this object in `navItems`, preferably between “图表” and “规划”:

```tsx
  {
    to: '/app/agent',
    label: 'AI',
    icon: (active) => (
      <svg viewBox="0 0 24 24" className={iconClass} fill="none">
        <path
          d="M12 4.5 13.8 9l4.7 1.8-4.7 1.8L12 17l-1.8-4.4-4.7-1.8L10.2 9 12 4.5Z"
          stroke={active ? '#007AFF' : '#8E8E93'}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M18 15.5 18.7 17l1.5.7-1.5.7L18 20l-.7-1.6-1.5-.7 1.5-.7.7-1.5Z"
          stroke={active ? '#007AFF' : '#8E8E93'}
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
```

- [ ] **Step 4: Run frontend build**

Run:

```powershell
cd frontend
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add frontend/src/pages/AgentPage.tsx frontend/src/App.tsx frontend/src/components/Layout.tsx
git commit -m "feat: add agent chat page"
```

---

## Task 6: Final Verification And Manual Smoke Test

**Files:**
- No new files unless fixes are required.

- [ ] **Step 1: Run backend Agent tests**

Run:

```powershell
cd backend
python -m pytest tests/test_agent_tools.py tests/test_agent_router.py -v
```

Expected: PASS.

- [ ] **Step 2: Run existing backend tests**

Run:

```powershell
cd backend
python -m pytest tests -v
```

Expected: PASS. If existing unrelated tests fail because of pre-existing dirty worktree changes, capture the failure and do not rewrite unrelated code.

- [ ] **Step 3: Run frontend build**

Run:

```powershell
cd frontend
npm run build
```

Expected: PASS.

- [ ] **Step 4: Start local servers for smoke test**

Backend:

```powershell
cd backend
python -m uvicorn app.main:app --reload
```

Frontend:

```powershell
cd frontend
npm run dev
```

Expected:

- Backend health responds at `http://127.0.0.1:8000/health`.
- Frontend opens at `http://127.0.0.1:5173`.

- [ ] **Step 5: Manual checks**

Use an account with sample transactions:

- Ask `总结我最近六个月的开销`; expect a natural Chinese summary based on tool data.
- Ask `列出最近三个月餐饮超过 100 的账单`; expect a bounded list of expense records.
- Ask a partner question without a bound partner; expect a friendly “尚未绑定伴侣” style response.
- Refresh the page; expect the chat history to clear.

- [ ] **Step 6: Commit verification fixes if any**

If Task 6 required code changes:

```powershell
git add <changed-files>
git commit -m "fix: stabilize bill agent"
```

If no changes were required, do not create an empty commit.

---

## Self-Review

Spec coverage:

- DeepSeek-backed LangGraph/LangChain Agent: Task 1 and Task 3.
- No RAG, no SQL Agent: covered by architecture and Task 2 whitelisted tools.
- `self`, `partner`, `both` permission boundary: Task 2 tests and implementation.
- Analysis and detail questions: Task 2 tools and Task 3 runner.
- Frontend temporary history: Task 5 page state.
- Missing API key friendly error: Task 1 test and route guard.
- No persistent chat table: no database migration tasks included.

Placeholder scan:

- No placeholder markers or vague implementation steps remain.

Type consistency:

- Backend schemas use `AgentChatMessage`, `AgentChatRequest`, `AgentChatResponse`, `AgentToolCallSummary`.
- Frontend types mirror backend response property `tool_calls`.
- Tool targets consistently use `self | partner | both`.
