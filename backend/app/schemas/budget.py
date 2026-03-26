from __future__ import annotations

from decimal import Decimal

from pydantic import BaseModel, Field, model_validator

from app.models.enums import CategoryEnum


class BudgetCreateRequest(BaseModel):
    category: CategoryEnum
    monthly_limit: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    year_month: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")


class BudgetUpdateRequest(BaseModel):
    category: CategoryEnum | None = None
    monthly_limit: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=2)
    year_month: str | None = Field(default=None, pattern=r"^\d{4}-(0[1-9]|1[0-2])$")

    @model_validator(mode="after")
    def validate_non_empty(self) -> "BudgetUpdateRequest":
        if self.category is None and self.monthly_limit is None and self.year_month is None:
            raise ValueError("至少提供一个需要更新的字段")
        return self
