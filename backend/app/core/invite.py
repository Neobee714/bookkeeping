from __future__ import annotations

import hashlib
import hmac

from app.core.config import SECRET_KEY

ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
BASE = len(ALPHABET)


def _secret_mask() -> int:
    digest = hashlib.sha256((SECRET_KEY or "").encode("utf-8")).digest()
    return int.from_bytes(digest[:4], "big")


def _encode_base(value: int) -> str:
    if value <= 0:
        return ALPHABET[0]

    chars: list[str] = []
    remain = value
    while remain > 0:
        remain, idx = divmod(remain, BASE)
        chars.append(ALPHABET[idx])
    return "".join(reversed(chars))


def _decode_base(text: str) -> int:
    result = 0
    for char in text:
        idx = ALPHABET.find(char)
        if idx < 0:
            raise ValueError("invalid invite code")
        result = result * BASE + idx
    return result


def generate_invite_code(user_id: int) -> str:
    if user_id <= 0:
        raise ValueError("user_id must be positive")

    masked = user_id ^ _secret_mask()
    raw = _encode_base(masked)
    signature = hmac.new(
        (SECRET_KEY or "").encode("utf-8"),
        raw.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()[:6].upper()
    return f"{raw}-{signature}"


def parse_invite_code(code: str) -> int:
    normalized = code.strip().upper()
    try:
        raw, signature = normalized.split("-", 1)
    except ValueError as exc:
        raise ValueError("invalid invite code format") from exc

    expected = hmac.new(
        (SECRET_KEY or "").encode("utf-8"),
        raw.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()[:6].upper()

    if not hmac.compare_digest(signature, expected):
        raise ValueError("invalid invite code signature")

    masked = _decode_base(raw)
    user_id = masked ^ _secret_mask()
    if user_id <= 0:
        raise ValueError("invalid invite code payload")

    return user_id
