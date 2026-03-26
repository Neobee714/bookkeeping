from __future__ import annotations

from typing import Any


def success_response(data: Any = None, message: str = "") -> dict[str, Any]:
    return {"success": True, "data": data, "message": message}


def error_response(message: str, status_code: int = 400) -> tuple[dict[str, Any], int]:
    return {"success": False, "data": None, "message": message}, status_code
