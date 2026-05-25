from __future__ import annotations

from pydantic import BaseModel, Field, model_validator

from app.models.enums import TransactionType


class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=10)
    icon: str = Field(min_length=1, max_length=10)
    color: str = Field(min_length=4, max_length=7, pattern=r"^#[0-9a-fA-F]{6}$")
    type: TransactionType


class CategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=10)
    icon: str | None = Field(default=None, min_length=1, max_length=10)
    color: str | None = Field(default=None, min_length=4, max_length=7, pattern=r"^#[0-9a-fA-F]{6}$")

    @model_validator(mode="after")
    def validate_non_empty(self) -> "CategoryUpdate":
        if self.name is None and self.icon is None and self.color is None:
            raise ValueError("至少提供一个需要更新的字段")
        return self
