"""邮箱授权码的加密存储。

用 SECRET_KEY 派生 Fernet 密钥；SECRET_KEY 变了以后旧密文无法解开，
调用方要提示用户重新填写授权码。
"""

from __future__ import annotations

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import SECRET_KEY

CipherError = InvalidToken


def _fernet() -> Fernet:
    digest = hashlib.sha256((SECRET_KEY or "").encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt(value: str) -> str:
    return _fernet().encrypt(value.encode("utf-8")).decode("ascii")


def decrypt(token: str) -> str:
    return _fernet().decrypt(token.encode("ascii")).decode("utf-8")
