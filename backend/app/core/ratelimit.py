"""登录失败限流。

为什么不用 slowapi：本项目只有一个 uvicorn 进程，内存滑动窗口足够，
也不用为一个限流器引入新依赖和中间件。

命中后返回 429 + 剩余秒数；成功登录会清零该账号的计数，
所以正常用户永远不会被自己之前的失败拖住。
"""

from __future__ import annotations

import threading
import time
from collections import deque

# 同一个账号 15 分钟内最多失败 15 次；同一 IP 50 次（防批量撞库）。
USER_MAX_FAILURES = 15
IP_MAX_FAILURES = 50
WINDOW_SECONDS = 15 * 60

_LOCK = threading.Lock()
_BUCKETS: dict[str, deque[float]] = {}


def _prune(bucket: deque[float], now: float) -> None:
    while bucket and now - bucket[0] > WINDOW_SECONDS:
        bucket.popleft()


def check_allowed(*keys: str, now: float | None = None) -> int:
    """返回 0 表示放行；>0 表示需要等待的秒数。"""
    moment = time.monotonic() if now is None else now
    with _LOCK:
        for key in keys:
            bucket = _BUCKETS.get(key)
            if not bucket:
                continue
            _prune(bucket, moment)
            limit = IP_MAX_FAILURES if key.startswith("ip:") else USER_MAX_FAILURES
            if len(bucket) >= limit:
                return max(1, int(WINDOW_SECONDS - (moment - bucket[0])) + 1)
    return 0


def record_failure(*keys: str, now: float | None = None) -> None:
    moment = time.monotonic() if now is None else now
    with _LOCK:
        for key in keys:
            bucket = _BUCKETS.setdefault(key, deque())
            _prune(bucket, moment)
            bucket.append(moment)


def clear(*keys: str) -> None:
    with _LOCK:
        for key in keys:
            _BUCKETS.pop(key, None)


def reset_all() -> None:
    """测试用：清空所有计数。"""
    with _LOCK:
        _BUCKETS.clear()


def user_key(username: str) -> str:
    return f"u:{(username or '').strip().lower()}"


def ip_key(ip: str) -> str:
    return f"ip:{(ip or 'unknown').strip()}"


def client_ip(request) -> str:
    """取真实客户端 IP：nginx 已设 X-Real-IP / X-Forwarded-For。"""
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    real_ip = request.headers.get("x-real-ip", "")
    if real_ip:
        return real_ip.strip()
    return request.client.host if request.client else "unknown"
