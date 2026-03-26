from __future__ import annotations

from datetime import date
from decimal import Decimal

from pydantic import BaseModel, Field, model_validator


class SavingsCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    target_amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    current_amount: Decimal = Field(default=Decimal("0"), ge=0, max_digits=12, decimal_places=2)
    deadline: date | None = None


class SavingsUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    target_amount: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=2)
    current_amount: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    deadline: date | None = None

    @model_validator(mode="after")
    def validate_non_empty(self) -> "SavingsUpdateRequest":
        if (
            self.name is None
            and self.target_amount is None
            and self.current_amount is None
            and self.deadline is None
        ):
            raise ValueError("至少提供一个需要更新的字段")
        return self
