from __future__ import annotations

import os

from dotenv import load_dotenv

load_dotenv()


def get_env(key: str, default: str | None = None) -> str | None:
    return os.getenv(key, default)


DATABASE_URL = get_env("DATABASE_URL", "sqlite:///./dev.db")
SECRET_KEY = get_env("SECRET_KEY", "replace-with-a-strong-secret")
ALGORITHM = get_env("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(get_env("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
REFRESH_TOKEN_EXPIRE_DAYS = int(get_env("REFRESH_TOKEN_EXPIRE_DAYS", "30"))
