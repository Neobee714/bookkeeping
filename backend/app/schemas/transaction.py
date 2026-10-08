from __future__ import annotations

from datetime import date as DateValue
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.models.enums import TransactionType


class TransactionCreateRequest(BaseModel):
    amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    type: TransactionType
    category: str = Field(min_length=1, max_length=10)
    note: str | None = Field(default=None, max_length=255)
    date: DateValue


class TransactionUpdateRequest(BaseModel):
    amount: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=2)
    type: TransactionType | None = None
    category: str | None = Field(default=None, min_length=1, max_length=10)
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


class QuickNoteCandidate(BaseModel):
    note: str
    count: int
    last_used: DateValue | None


class QuickInputsResponse(BaseModel):
    last_date: DateValue | None
    pinned: list[QuickNoteCandidate]
    by_category: dict[str, list[QuickNoteCandidate]]


class NotePresetRequest(BaseModel):
    note: str = Field(min_length=1, max_length=255)
    kind: Literal["pinned", "hidden"]

    @model_validator(mode="after")
    def normalize_note(self) -> "NotePresetRequest":
        normalized = self.note.strip()
        if not normalized:
            raise ValueError("备注不能为空")
        self.note = normalized
        return self


class NotePresetResponse(BaseModel):
    note: str
    kind: Literal["pinned", "hidden"]


class NotePresetDeleteResponse(BaseModel):
    note: str
    deleted: bool
