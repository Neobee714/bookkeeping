from __future__ import annotations

from decimal import Decimal

from pydantic import BaseModel, Field


class ImportRowIn(BaseModel):
    client_id: str = Field(min_length=1, max_length=64)
    date: str
    amount: Decimal
    type: str
    category: str = ""
    merchant: str = ""
    channel: str = ""
    note: str = ""


class ImportLearnIn(BaseModel):
    # 平台账单没有店铺时用 channel 当匹配键
    merchant: str = Field(default="", max_length=50)
    channel: str = Field(default="", max_length=20)
    category: str = Field(min_length=1, max_length=10)


class ImportCommitIn(BaseModel):
    source: str = "any"
    rows: list[ImportRowIn] = Field(default_factory=list)
    learn: list[ImportLearnIn] = Field(default_factory=list)


class ImportRuleUpdate(BaseModel):
    category: str = Field(min_length=1, max_length=10)
