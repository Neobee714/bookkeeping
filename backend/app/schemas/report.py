from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator

ReportKind = Literal["weekly", "monthly", "quarterly", "yearly"]


class ReportSettingsRequest(BaseModel):
    kind: ReportKind
    anchor_weekday: int | None = Field(default=None, ge=1, le=7)
    anchor_day: int | None = Field(default=None, ge=1, le=28)
    anchor_hour: int = Field(ge=0, le=23)
    enabled: bool

    @model_validator(mode="after")
    def validate_anchor(self) -> "ReportSettingsRequest":
        if self.kind == "weekly":
            if self.anchor_weekday is None:
                raise ValueError("周报必须指定生成星期（1=周一 … 7=周日）")
        elif self.anchor_day is None:
            raise ValueError("月报 / 季报 / 年报必须指定生成日（1–28）")
        return self
