from __future__ import annotations

import hashlib
from collections.abc import Generator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.security import get_current_user
from app.main import app
from app.models.user import User


def make_apk_bytes(size: int = 4096) -> bytes:
    payload = bytes([index % 256 for index in range(max(0, size - 4))])
    return b"PK\x03\x04" + payload


def _make_user(username: str) -> User:
    return User(
        id=1,
        username=username,
        nickname=username,
        password_hash="unused",
        reg_invite_code="ABCDEFGH",
    )


@pytest.fixture()
def client(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> Generator[tuple[TestClient, dict[str, str]], None, None]:
    monkeypatch.setattr("app.core.admin.CIRCLE_CREATOR_USERNAME", "admin")
    monkeypatch.setattr("app.routers.app_updates.APP_RELEASES_DIR", str(tmp_path))
    monkeypatch.setattr("app.routers.app_updates.APP_RELEASES_PUBLIC_BASE_URL", "")
    monkeypatch.setattr("app.routers.app_updates.APP_RELEASES_MAX_APK_MB", 100)

    holder: dict[str, str] = {"username": "admin"}

    def override_get_current_user() -> User:
        return _make_user(holder["username"])

    app.dependency_overrides[get_current_user] = override_get_current_user
    try:
        yield TestClient(app), holder
    finally:
        app.dependency_overrides.clear()


def test_publish_apk_as_admin_creates_files(
    client: tuple[TestClient, dict[str, str]],
) -> None:
    test_client, _holder = client
    content = make_apk_bytes()

    response = test_client.post(
        "/app-updates/apk",
        data={"version": "1.0.26", "changelog": "新增语音记账"},
        files={
            "apk": (
                "app-release-1.0.26.apk",
                content,
                "application/vnd.android.package-archive",
            )
        },
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["version"] == "1.0.26"
    assert data["checksum"] == hashlib.sha256(content).hexdigest()
    assert data["size"] == len(content)
    assert data["changelog"] == "新增语音记账"
    assert "/app-updates/apk/files/app-release-1.0.26.apk" in data["url"]

    download = test_client.get(data["url"])
    assert download.status_code == 200
    assert download.headers["content-type"].startswith("application/vnd.android.package-archive")
    assert download.content == content


def test_publish_apk_url_keeps_api_path_when_public_base_set(
    client: tuple[TestClient, dict[str, str]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    test_client, _holder = client
    monkeypatch.setattr(
        "app.routers.app_updates.APP_RELEASES_PUBLIC_BASE_URL",
        "https://api.example.com",
    )
    content = make_apk_bytes()

    response = test_client.post(
        "/app-updates/apk",
        data={"version": "1.0.26"},
        files={"apk": ("a.apk", content, "application/vnd.android.package-archive")},
    )

    assert response.status_code == 200
    url = response.json()["data"]["url"]
    assert url == "https://api.example.com/app-updates/apk/files/app-release-1.0.26.apk"
    assert test_client.get(url).content == content


def test_publish_apk_requires_admin(
    client: tuple[TestClient, dict[str, str]],
) -> None:
    test_client, holder = client
    holder["username"] = "alice"

    response = test_client.post(
        "/app-updates/apk",
        data={"version": "1.0.26"},
        files={"apk": ("a.apk", make_apk_bytes(), "application/vnd.android.package-archive")},
    )

    assert response.status_code == 403


def test_publish_apk_rejects_duplicate_version(
    client: tuple[TestClient, dict[str, str]],
) -> None:
    test_client, _holder = client
    payload = {
        "data": {"version": "1.0.26"},
        "files": {"apk": ("a.apk", make_apk_bytes(), "application/vnd.android.package-archive")},
    }

    assert test_client.post("/app-updates/apk", **payload).status_code == 200
    response = test_client.post("/app-updates/apk", **payload)

    assert response.status_code == 409
    assert "已发布" in response.json()["message"]


def test_publish_apk_rejects_invalid_version(
    client: tuple[TestClient, dict[str, str]],
) -> None:
    test_client, _holder = client

    response = test_client.post(
        "/app-updates/apk",
        data={"version": "1.0"},
        files={"apk": ("a.apk", make_apk_bytes(), "application/vnd.android.package-archive")},
    )

    assert response.status_code == 400


def test_publish_apk_rejects_empty_and_non_zip_files(
    client: tuple[TestClient, dict[str, str]],
) -> None:
    test_client, _holder = client

    empty = test_client.post(
        "/app-updates/apk",
        data={"version": "1.0.26"},
        files={"apk": ("a.apk", b"", "application/vnd.android.package-archive")},
    )
    assert empty.status_code == 400
    assert "为空" in empty.json()["message"]

    not_apk = test_client.post(
        "/app-updates/apk",
        data={"version": "1.0.26"},
        files={"apk": ("a.apk", b"not a zip", "application/vnd.android.package-archive")},
    )
    assert not_apk.status_code == 400
    assert "不是有效的 APK" in not_apk.json()["message"]


def test_latest_apk_has_update_and_picks_highest_version(
    client: tuple[TestClient, dict[str, str]],
) -> None:
    test_client, _holder = client

    assert test_client.get("/app-updates/apk/latest").json()["data"] == {"has_update": False}

    for version in ("1.0.25", "1.0.26"):
        response = test_client.post(
            "/app-updates/apk",
            data={"version": version},
            files={"apk": (f"{version}.apk", make_apk_bytes(), "application/vnd.android.package-archive")},
        )
        assert response.status_code == 200

    data = test_client.get("/app-updates/apk/latest?current=1.0.25").json()["data"]
    assert data["has_update"] is True
    assert data["version"] == "1.0.26"

    equal = test_client.get("/app-updates/apk/latest?current=1.0.26").json()["data"]
    assert equal["has_update"] is False

    newer = test_client.get("/app-updates/apk/latest?current=1.0.27").json()["data"]
    assert newer["has_update"] is False


def test_download_apk_rejects_bad_names(
    client: tuple[TestClient, dict[str, str]],
) -> None:
    test_client, _holder = client

    encoded_traversal = "/app-updates/apk/files/%2e%2e%2fapp-release-1.0.26.apk"
    assert test_client.get(encoded_traversal).status_code == 404
    assert test_client.get("/app-updates/apk/files/bundle-1.0.26.zip").status_code == 404
    assert test_client.get("/app-updates/apk/files/app-release-1.0.26.apk").status_code == 404


def test_delete_apk_removes_release(
    client: tuple[TestClient, dict[str, str]],
) -> None:
    test_client, holder = client
    publish = test_client.post(
        "/app-updates/apk",
        data={"version": "1.0.26"},
        files={"apk": ("a.apk", make_apk_bytes(), "application/vnd.android.package-archive")},
    )
    assert publish.status_code == 200

    delete = test_client.delete("/app-updates/apk/1.0.26")
    assert delete.status_code == 200
    assert delete.json()["message"] == "删除成功"

    assert test_client.get("/app-updates/apk/latest").json()["data"] == {"has_update": False}
    assert test_client.delete("/app-updates/apk/1.0.26").status_code == 404

    holder["username"] = "alice"
    test_client.post(
        "/app-updates/apk",
        data={"version": "1.0.26"},
        files={"apk": ("a.apk", make_apk_bytes(), "application/vnd.android.package-archive")},
    )
    assert test_client.delete("/app-updates/apk/1.0.26").status_code == 403
