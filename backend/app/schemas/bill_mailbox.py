from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class MailboxIn(BaseModel):
    provider: Literal["qq", "163"] = "qq"
    username: str = Field(min_length=3, max_length=120)
    # 授权码：更新时可留空表示沿用已保存的
    password: str | None = Field(default=None, max_length=120)
    folder: str = Field(default="INBOX", max_length=40)
    enabled: bool = True


class MailboxTestIn(MailboxIn):
    pass
