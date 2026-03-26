from __future__ import annotations

from pydantic import BaseModel, Field, model_validator


class CircleCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=30)
    description: str | None = Field(default=None, max_length=100)


class CircleJoinRequest(BaseModel):
    code: str = Field(min_length=1, max_length=8)


class CirclePostCreateRequest(BaseModel):
    content: str | None = Field(default=None, max_length=200)
    image: str | None = None

    @model_validator(mode="after")
    def validate_has_content(self) -> "CirclePostCreateRequest":
        content = (self.content or "").strip()
        image = (self.image or "").strip()
        if not content and not image:
            raise ValueError("文字内容和图片至少填写一项")
        return self


class CircleRateRequest(BaseModel):
    score: float = Field(ge=0, le=10)


class CircleCommentCreateRequest(BaseModel):
    content: str = Field(min_length=1, max_length=500)
