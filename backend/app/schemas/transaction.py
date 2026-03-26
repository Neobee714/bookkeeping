from __future__ import annotations

from datetime import date as DateValue
from decimal import Decimal

from pydantic import BaseModel, Field, model_validator

from app.models.enums import CategoryEnum, TransactionType


class TransactionCreateRequest(BaseModel):
    amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    type: TransactionType
    category: CategoryEnum
    note: str | None = Field(default=None, max_length=255)
    date: DateValue


class TransactionUpdateRequest(BaseModel):
    amount: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=2)
    type: TransactionType | None = None
    category: CategoryEnum | None = None
    note: str | None = Field(default=None, max_length=255)
    date: DateValue | None = None

    @model_validator(mode="after")
    def validate_non_empty(self) -> "TransactionUpdateRequest":
        if (
            self.amount is None
            and self.type is None
            and self.category is None
            and self.note is None
            and self.date is None
        ):
            raise ValueError("至少提供一个需要更新的字段")
        return self
