"""Small in-process rate limiter.

Deliberately simple: a sliding window per (bucket, key) held in memory. On a
single-VM V1 that is enough, and it has no external dependency. If Fastclip
ever runs on more than one process, this moves to Redis behind the same API.
"""
from __future__ import annotations

import threading
import time
from collections import defaultdict, deque

_lock = threading.Lock()
_hits: dict[tuple[str, str], deque[float]] = defaultdict(deque)

WINDOW_SECONDS = 3600.0


class RateLimited(Exception):
    def __init__(self, retry_after_seconds: int, message: str) -> None:
        super().__init__(message)
        self.retry_after_seconds = retry_after_seconds
        self.message = message


def check(bucket: str, key: str, limit: int, message: str) -> None:
    """Raise RateLimited if `key` exceeded `limit` calls in the last hour."""
    now = time.monotonic()
    with _lock:
        events = _hits[(bucket, key)]
        while events and now - events[0] > WINDOW_SECONDS:
            events.popleft()
        if len(events) >= limit:
            retry_after = int(WINDOW_SECONDS - (now - events[0])) + 1
            raise RateLimited(retry_after, message)
        events.append(now)


def reset(bucket: str | None = None) -> None:
    """Test helper."""
    with _lock:
        if bucket is None:
            _hits.clear()
        else:
            for composite in [k for k in _hits if k[0] == bucket]:
                del _hits[composite]
