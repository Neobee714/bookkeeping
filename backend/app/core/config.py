from __future__ import annotations

import os
from urllib.parse import parse_qsl, quote_plus, urlencode, urlparse, urlunparse

from dotenv import load_dotenv

load_dotenv()


def get_env(key: str, default: str | None = None) -> str | None:
    return os.getenv(key, default)


def _build_postgres_url_from_parts() -> str | None:
    host = get_env("PGHOST")
    user = get_env("PGUSER")
    password = get_env("PGPASSWORD")
    database = get_env("PGDATABASE")
    port = get_env("PGPORT", "5432")

    if not all([host, user, password, database]):
        return None

    return (
        f"postgresql://{quote_plus(user)}:{quote_plus(password)}"
        f"@{host}:{port}/{database}"
    )


def _normalize_database_url(raw_url: str) -> str:
    if raw_url.startswith("postgres://"):
        raw_url = raw_url.replace("postgres://", "postgresql://", 1)

    if not raw_url.startswith("postgresql://"):
        return raw_url

    parsed = urlparse(raw_url)
    host = (parsed.hostname or "").lower()
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    is_local_or_private = host in {"localhost", "127.0.0.1", "::1"} or host.endswith(".internal")

    # Railway public proxy often requires SSL; keep private-network URLs untouched.
    if not is_local_or_private and "sslmode" not in query:
        query["sslmode"] = "require"
        parsed = parsed._replace(query=urlencode(query))
        return urlunparse(parsed)

    return raw_url


def _resolve_database_url() -> str:
    candidate = get_env("DATABASE_PRIVATE_URL") or get_env("DATABASE_URL")
    if not candidate:
        candidate = _build_postgres_url_from_parts()
    if not candidate:
        return "sqlite:///./dev.db"
    return _normalize_database_url(candidate)


DATABASE_URL = _resolve_database_url()
DB_CONNECT_TIMEOUT_SECONDS = int(get_env("DB_CONNECT_TIMEOUT_SECONDS", "10"))
SECRET_KEY = get_env("SECRET_KEY", "replace-with-a-strong-secret")
ALGORITHM = get_env("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(get_env("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
REFRESH_TOKEN_EXPIRE_DAYS = int(get_env("REFRESH_TOKEN_EXPIRE_DAYS", "30"))
FOUNDER_INVITE_CODE = (get_env("FOUNDER_INVITE_CODE", "NEOBEE2025") or "NEOBEE2025").strip().upper()
