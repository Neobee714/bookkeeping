from __future__ import annotations

from pydantic import BaseModel, Field


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    nickname: str = Field(min_length=1, max_length=50)
    password: str = Field(min_length=6, max_length=128)
    reg_invite_code: str = Field(min_length=1, max_length=32)
    partner_code: str | None = Field(default=None, max_length=64)
    invite_code: str | None = Field(default=None, max_length=64)


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=50)
    password: str = Field(min_length=1, max_length=128)


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=1)


class BindPartnerRequest(BaseModel):
    partner_code: str | None = Field(default=None, min_length=1, max_length=64)
    invite_code: str | None = Field(default=None, min_length=1, max_length=64)


class UpdateProfileRequest(BaseModel):
    nickname: str | None = Field(default=None, min_length=1, max_length=16)


class UpdateAvatarRequest(BaseModel):
    avatar: str
