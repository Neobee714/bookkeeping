from __future__ import annotations

from app.core.config import CIRCLE_CREATOR_USERNAME


def is_admin_username(username: str | None) -> bool:
    if not CIRCLE_CREATOR_USERNAME or not username:
        return False
    return username.casefold() == CIRCLE_CREATOR_USERNAME.casefold()
