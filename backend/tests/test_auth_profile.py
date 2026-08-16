from __future__ import annotations

from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app.core.security import create_access_token, get_password_hash, verify_password
from app.main import app
from app.models.user import User


@pytest.fixture()
def client() -> Generator[tuple[TestClient, Session], None, None]:
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
            yield TestClient(app), db
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(engine)


def _create_user(db: Session, username: str, password: str, reg_code: str) -> User:
    user = User(
        username=username,
        nickname=username,
        password_hash=get_password_hash(password),
        reg_invite_code=reg_code,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _auth_headers(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user.id)}"}


def test_update_username_success(client: tuple[TestClient, Session]) -> None:
    test_client, db = client
    alice = _create_user(db, "alice", "secret123", "AAAABBBB")
    _create_user(db, "bob", "secret123", "CCCCDDDD")

    response = test_client.put(
        "/auth/profile",
        json={"username": "alice_new"},
        headers=_auth_headers(alice),
    )

    assert response.status_code == 200
    assert response.json()["data"]["username"] == "alice_new"
    db.refresh(alice)
    assert alice.username == "alice_new"


def test_update_username_duplicate_returns_400(client: tuple[TestClient, Session]) -> None:
    test_client, db = client
    alice = _create_user(db, "alice", "secret123", "AAAABBBB")
    _create_user(db, "bob", "secret123", "CCCCDDDD")

    response = test_client.put(
        "/auth/profile",
        json={"username": "bob"},
        headers=_auth_headers(alice),
    )

    assert response.status_code == 400
    assert response.json()["message"] == "用户名已存在"
    db.refresh(alice)
    assert alice.username == "alice"


def test_update_username_same_value_is_idempotent(client: tuple[TestClient, Session]) -> None:
    test_client, db = client
    alice = _create_user(db, "alice", "secret123", "AAAABBBB")

    response = test_client.put(
        "/auth/profile",
        json={"username": "alice"},
        headers=_auth_headers(alice),
    )

    assert response.status_code == 200
    assert response.json()["data"]["username"] == "alice"


def test_update_profile_requires_auth(client: tuple[TestClient, Session]) -> None:
    test_client, _db = client

    response = test_client.put("/auth/profile", json={"username": "alice_new"})

    assert response.status_code == 401


def test_update_password_success(client: tuple[TestClient, Session]) -> None:
    test_client, db = client
    alice = _create_user(db, "alice", "oldpass123", "AAAABBBB")

    response = test_client.put(
        "/auth/password",
        json={"old_password": "oldpass123", "new_password": "newpass456"},
        headers=_auth_headers(alice),
    )

    assert response.status_code == 200
    db.refresh(alice)
    assert verify_password("newpass456", alice.password_hash)
    assert not verify_password("oldpass123", alice.password_hash)

    login = test_client.post(
        "/auth/login",
        json={"username": "alice", "password": "newpass456"},
    )
    assert login.status_code == 200


def test_update_password_wrong_old_password(client: tuple[TestClient, Session]) -> None:
    test_client, db = client
    alice = _create_user(db, "alice", "oldpass123", "AAAABBBB")

    response = test_client.put(
        "/auth/password",
        json={"old_password": "wrongpass", "new_password": "newpass456"},
        headers=_auth_headers(alice),
    )

    assert response.status_code == 401
    assert response.json()["message"] == "旧密码错误"
    db.refresh(alice)
    assert verify_password("oldpass123", alice.password_hash)


def test_update_password_new_too_short(client: tuple[TestClient, Session]) -> None:
    test_client, db = client
    alice = _create_user(db, "alice", "oldpass123", "AAAABBBB")

    response = test_client.put(
        "/auth/password",
        json={"old_password": "oldpass123", "new_password": "123"},
        headers=_auth_headers(alice),
    )

    assert response.status_code == 422
