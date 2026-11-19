from __future__ import annotations

from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core import ratelimit
from app.core.config import _DEFAULT_SECRET_KEY, SECRET_KEY, SECRET_KEY_IS_EPHEMERAL
from app.core.database import Base, get_db
from app.core.security import get_password_hash
from app.main import app
from app.models.user import User


@pytest.fixture()
def client() -> Generator[tuple[TestClient, Session], None, None]:
    ratelimit.reset_all()
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

    app.dependency_overrides[get_db] = override_get_db
    try:
        with TestingSessionLocal() as db:
            db.add(
                User(
                    username="throttle",
                    nickname="throttle",
                    password_hash=get_password_hash("correct-pass"),
                    reg_invite_code="THR001",
                )
            )
            db.commit()
            yield TestClient(app), db
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(engine)
        ratelimit.reset_all()


def _login(client: TestClient, password: str):
    return client.post(
        "/auth/login",
        json={"username": "throttle", "password": password},
    )


def test_login_locks_after_repeated_failures(client: tuple[TestClient, Session]) -> None:
    http, _ = client
    for _ in range(ratelimit.USER_MAX_FAILURES):
        response = _login(http, "wrong-pass")
        assert response.status_code == 401

    blocked = _login(http, "wrong-pass")
    assert blocked.status_code == 429
    assert "秒后再试" in blocked.json()["message"]
    assert blocked.headers.get("Retry-After")

    # 限流期间即使密码正确也不放行（否则爆破可借正确密码探路）。
    assert _login(http, "correct-pass").status_code == 429


def test_successful_login_clears_own_counter(client: tuple[TestClient, Session]) -> None:
    http, _ = client
    for _ in range(ratelimit.USER_MAX_FAILURES - 2):
        assert _login(http, "wrong-pass").status_code == 401

    ok = _login(http, "correct-pass")
    assert ok.status_code == 200
    assert ok.json()["data"]["access_token"]

    # 计数已清零：再失败 14 次仍应是 401 而不是 429。
    for _ in range(ratelimit.USER_MAX_FAILURES - 1):
        assert _login(http, "wrong-pass").status_code == 401


def test_window_expiry_releases_lock() -> None:
    ratelimit.reset_all()
    key = ratelimit.user_key("someone")
    for i in range(ratelimit.USER_MAX_FAILURES):
        ratelimit.record_failure(key, now=1000.0 + i)

    assert ratelimit.check_allowed(key, now=1100.0) > 0
    assert ratelimit.check_allowed(key, now=1000.0 + ratelimit.WINDOW_SECONDS + 5) == 0
    ratelimit.reset_all()


def test_secret_key_never_uses_repo_default() -> None:
    assert SECRET_KEY != _DEFAULT_SECRET_KEY
    assert len(SECRET_KEY) >= 32
    # 本机测试环境没有 SECRET_KEY,应走随机兜底并标记为 ephemeral。
    assert SECRET_KEY_IS_EPHEMERAL is True
