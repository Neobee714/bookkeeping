from __future__ import annotations

from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import DATABASE_URL, DB_CONNECT_TIMEOUT_SECONDS


class Base(DeclarativeBase):
    pass


engine_kwargs: dict = {"pool_pre_ping": True}
if DATABASE_URL.startswith("postgresql://"):
    engine_kwargs["connect_args"] = {"connect_timeout": DB_CONNECT_TIMEOUT_SECONDS}

engine = create_engine(DATABASE_URL, **engine_kwargs)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
