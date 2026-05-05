"""Rate limiting middleware — pure ASGI, SSE-safe."""
from __future__ import annotations

import http.cookies

import structlog
from limits import RateLimitItem, parse
from limits.aio.storage import MemoryStorage
from limits.aio.strategies import MovingWindowRateLimiter
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

log = structlog.get_logger()

# Paths exempt from the global limit (health probes should never be blocked)
_GLOBAL_EXEMPT = frozenset({"/health", "/health/"})

# Our FastAPI auth endpoints that need tighter IP-based throttling
_AUTH_PATHS = frozenset({"/auth/bootstrap-tenant"})


def _make_default_storage() -> MemoryStorage:
    """Try Redis (from settings); fall back to in-memory with a warning."""
    try:
        from limits.aio.storage import RedisStorage

        from ..config import settings

        return RedisStorage(settings.redis_url)
    except Exception:
        log.warning("rate_limit.redis_unavailable", fallback="memory://")
        return MemoryStorage()


def _get_ip(scope: Scope) -> str:
    headers = {k: v for k, v in scope.get("headers", [])}
    forwarded = headers.get(b"x-forwarded-for", b"").decode()
    if forwarded:
        return forwarded.split(",")[0].strip()
    client = scope.get("client")
    return client[0] if client else "unknown"


def _parse_session_key(scope: Scope) -> str | None:
    """Return the session token ID (before the dot) if a session cookie is present."""
    headers = {k: v for k, v in scope.get("headers", [])}
    raw = headers.get(b"cookie", b"").decode("latin-1")
    if not raw:
        return None
    jar: http.cookies.SimpleCookie = http.cookies.SimpleCookie()
    jar.load(raw)
    morsel = jar.get("better-auth.session_token")
    if morsel:
        return morsel.value.split(".")[0]
    return None


class RateLimitMiddleware:
    """
    Pure ASGI rate limiting middleware.

    Limit tiers (all configurable via constructor for testing):
      - global:       60/min per IP  (all non-health endpoints)
      - auth:          5/min per IP  (/auth/bootstrap-tenant)
      - chat session: 20/min per session token  (POST /chat, authenticated)
      - chat guest:    5/min per IP             (POST /chat, unauthenticated)
    """

    def __init__(
        self,
        app: ASGIApp,
        *,
        storage: object = None,
        global_limit: str = "60/minute",
        chat_session_limit: str = "20/minute",
        chat_guest_limit: str = "5/minute",
        auth_limit: str = "5/minute",
    ) -> None:
        self.app = app
        _storage = storage if storage is not None else _make_default_storage()
        self._strategy = MovingWindowRateLimiter(_storage)
        self._global: RateLimitItem = parse(global_limit)
        self._chat_session: RateLimitItem = parse(chat_session_limit)
        self._chat_guest: RateLimitItem = parse(chat_guest_limit)
        self._auth: RateLimitItem = parse(auth_limit)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path: str = scope.get("path", "")
        method: str = scope.get("method", "")
        ip = _get_ip(scope)

        # 1. Global floor — every endpoint except health probes
        if path not in _GLOBAL_EXEMPT:
            if not await self._strategy.hit(self._global, f"global:{ip}"):
                await _respond_429(scope, receive, send)
                return

        # 2. Auth endpoint protection (unauthenticated, high-value target)
        if path in _AUTH_PATHS:
            if not await self._strategy.hit(self._auth, f"auth:{ip}"):
                await _respond_429(scope, receive, send)
                return

        # 3. Chat-specific limits: tighter, keyed by session or guest IP
        if path == "/chat" and method == "POST":
            session_key = _parse_session_key(scope)
            if session_key:
                if not await self._strategy.hit(self._chat_session, f"chat:session:{session_key}"):
                    await _respond_429(scope, receive, send)
                    return
            else:
                if not await self._strategy.hit(self._chat_guest, f"chat:guest:{ip}"):
                    await _respond_429(scope, receive, send)
                    return

        await self.app(scope, receive, send)


async def _respond_429(scope: Scope, receive: Receive, send: Send) -> None:
    response = JSONResponse(
        {"error": "Rate limit exceeded"},
        status_code=429,
        headers={"Retry-After": "60"},
    )
    await response(scope, receive, send)
