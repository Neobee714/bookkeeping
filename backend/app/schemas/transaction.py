from __future__ import annotations

from datetime import date as DateValue, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.models.enums import TransactionType

ReclassifyAction = Literal["merchant", "item", "both", "evaluation", "skip"]
NoteSuggestion = Literal["merchant", "item", "both", "evaluation"]


def _clean_optional_text(value: object) -> object:
    """去掉首尾空白；空串转 None。非字符串交给 pydantic 自己报类型错误。"""
    if isinstance(value, str):
        cleaned = value.strip()
        return cleaned or None
    return value


def _clean_text(value: object) -> object:
    if isinstance(value, str):
        return value.strip()
    return value


class TransactionCreateRequest(BaseModel):
    amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    type: TransactionType
    category: str = Field(min_length=1, max_length=10)
    note: str | None = Field(default=None, max_length=255)
    merchant: str | None = Field(default=None, max_length=50)
    item: str | None = Field(default=None, max_length=50)
    date: DateValue
    # 离线新增幂等键：同一用户重复提交同一 client_id 只会落一条。
    client_id: str | None = Field(default=None, min_length=8, max_length=64)

    @field_validator("note", "merchant", "item", mode="before")
    @classmethod
    def normalize_optional_text(cls, value: object) -> object:
        return _clean_optional_text(value)

    @field_validator("category", mode="before")
    @classmethod
    def normalize_category(cls, value: object) -> object:
        return _clean_text(value)


class TransactionUpdateRequest(BaseModel):
    amount: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=2)
    type: TransactionType | None = None
    category: str | None = Field(default=None, min_length=1, max_length=10)
    note: str | None = Field(default=None, max_length=255)
    merchant: str | None = Field(default=None, max_length=50)
    item: str | None = Field(default=None, max_length=50)
    date: DateValue | None = None

    @field_validator("note", "merchant", "item", mode="before")
    @classmethod
    def normalize_optional_text(cls, value: object) -> object:
        return _clean_optional_text(value)

    @field_validator("category", mode="before")
    @classmethod
    def normalize_category(cls, value: object) -> object:
        return _clean_text(value)

    @model_validator(mode="after")
    def validate_non_empty(self) -> "TransactionUpdateRequest":
        # 用 fields_set 判断“是否提供了字段”，这样显式 null 可以清空评价/商家/项目。
        if not self.model_fields_set:
            raise ValueError("至少提供一个需要更新的字段")
        # 金额/类型/分类/日期不可置空；只有评价、商家、项目允许显式 null。
        for field in ("amount", "type", "category", "date"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} 不能为空")
        return self


class QuickNoteCandidate(BaseModel):
    note: str
    count: int
    last_used: DateValue | None


class QuickNameCandidate(BaseModel):
    name: str
    count: int
    last_used: DateValue | None


class QuickInputsResponse(BaseModel):
    last_date: DateValue | None
    pinned: list[QuickNoteCandidate]
    by_category: dict[str, list[QuickNoteCandidate]]
    merchants_by_category: dict[str, list[QuickNameCandidate]] = Field(
        default_factory=dict
    )
    items_by_category: dict[str, list[QuickNameCandidate]] = Field(default_factory=dict)


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


class NoteCandidate(BaseModel):
    note: str
    count: int
    total_amount: float
    last_used: DateValue | None
    suggestion: NoteSuggestion | None


class NoteCleanupBatchInfo(BaseModel):
    batch_id: int
    created_at: datetime
    affected_count: int


class NoteCandidatesResponse(BaseModel):
    total: int
    items: list[NoteCandidate]
    last_cleanup: NoteCleanupBatchInfo | None = None


class NoteReclassifyRequest(BaseModel):
    note: str = Field(min_length=1, max_length=255)
    action: ReclassifyAction
    merchant: str | None = Field(default=None, max_length=50)
    item: str | None = Field(default=None, max_length=50)
    # App 在一次保存里给多条 reclassify 传同一个 key，便于整批撤销。
    batch_key: str | None = Field(default=None, max_length=64)

    @field_validator("note", "merchant", "item", "batch_key", mode="before")
    @classmethod
    def normalize_text(cls, value: object) -> object:
        return _clean_optional_text(value)

    @model_validator(mode="after")
    def validate_action_fields(self) -> "NoteReclassifyRequest":
        if not self.note:
            raise ValueError("备注不能为空")
        if self.action in ("merchant", "both") and not self.merchant:
            raise ValueError("请填写商家")
        if self.action in ("item", "both") and not self.item:
            raise ValueError("请填写项目")
        if self.action in ("evaluation", "skip"):
            self.merchant = None
            self.item = None
        return self


class NoteReclassifyResponse(BaseModel):
    affected: int
    batch_id: int | None = None


class NoteUndoRequest(BaseModel):
    batch_id: int | None = None


class NoteUndoResponse(BaseModel):
    batch_id: int
    restored: int
    skipped: int
