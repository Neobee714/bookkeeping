from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.models.enums import TransactionType

RecurringFreq = Literal[
    "daily",
    "weekly",
    "monthly",
    "yearly",
    "workday",
    "monthly_last_workday",
    "monthly_nth_workday",
]

_REQUIRED_UPDATE_FIELDS = ("amount", "type", "category", "freq", "start_date", "enabled")


class RecurringCreateRequest(BaseModel):
    amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    type: TransactionType
    category: str = Field(min_length=1, max_length=10)
    note: str | None = Field(default=None, max_length=255)
    freq: RecurringFreq
    start_date: date


class RecurringUpdateRequest(BaseModel):
    amount: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=2)
    type: TransactionType | None = None
    category: str | None = Field(default=None, min_length=1, max_length=10)
    note: str | None = Field(default=None, max_length=255)
    freq: RecurringFreq | None = None
    start_date: date | None = None
    enabled: bool | None = None

    @model_validator(mode="after")
    def validate_non_empty(self) -> "RecurringUpdateRequest":
        if not self.model_fields_set:
            raise ValueError("至少提供一个需要更新的字段")
        for field in _REQUIRED_UPDATE_FIELDS:
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} 不能为空")
        return self
