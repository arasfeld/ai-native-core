# Rate Limiting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a pure-ASGI rate limiting middleware that enforces a 60/min global floor per IP, 5/min on the auth bootstrap endpoint, and 20/min (session) or 5/min (guest IP) on `POST /chat`.

**Architecture:** A single `RateLimitMiddleware` class (pure ASGI, safe for SSE streaming) using the `limits` library with async moving-window counters. No slowapi — just `limits[redis]`. Storage defaults to Redis (already in the stack); tests inject `MemoryStorage()` directly. Limits are constructor parameters so tests can use small values.

**Tech Stack:** `limits[redis]>=3.7` (adds `redis.asyncio` support), `limits.aio.storage.{MemoryStorage,RedisStorage}`, `limits.aio.strategies.MovingWindowRateLimiter`

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `apps/server/pyproject.toml` | Modify | Add `limits[redis]>=3.7` |
| `apps/server/src/api/middleware/__init__.py` | Create | Package marker |
| `apps/server/src/api/middleware/rate_limit.py` | Create | `RateLimitMiddleware` + helpers |
| `apps/server/tests/test_rate_limit.py` | Create | 7 TDD tests |
| `apps/server/src/api/main.py` | Modify | Register middleware |
| `ROADMAP.md` | Modify | Mark item 77 ✅ |

---

### Task 1: Add dependency and scaffold empty files

**Files:**
- Modify: `apps/server/pyproject.toml`
- Create: `apps/server/src/api/middleware/__init__.py`
- Create: `apps/server/src/api/middleware/rate_limit.py`

- [ ] **Step 1: Add `limits[redis]` to server dependencies**

Edit `apps/server/pyproject.toml`. In the `dependencies` list, add after `"resend>=2.0"`:

```toml
    "limits[redis]>=3.7",
```

Full dependencies block after edit:
```toml
dependencies = [
    "ai",
    "agents",
    "memory",
    "rag",
    "tools",
    "prompts",
    "fastapi[standard]>=0.115",
    "asyncer>=0.0.8",
    "anyio>=4.0",
    "python-dotenv>=1.0",
    "pydantic[email]>=2.0",
    "pydantic-settings>=2.0",
    "structlog>=24.0",
    "asyncpg>=0.29",
    "arq>=0.26",
    "python-jose[cryptography]>=3.3",
    "bcrypt>=4.0",
    "stripe>=10.0",
    "resend>=2.0",
    "limits[redis]>=3.7",
]
```

- [ ] **Step 2: Sync dependencies**

```bash
uv sync
```

Expected: resolves and installs `limits`, `redis` packages with no errors.

- [ ] **Step 3: Create middleware package marker**

Create `apps/server/src/api/middleware/__init__.py` — empty file:

```python
```

- [ ] **Step 4: Create stub middleware file**

Create `apps/server/src/api/middleware/rate_limit.py`:

```python
"""Rate limiting middleware — pure ASGI, SSE-safe."""
from __future__ import annotations
```

- [ ] **Step 5: Commit scaffolding**

```bash
git add apps/server/pyproject.toml \
        apps/server/src/api/middleware/__init__.py \
        apps/server/src/api/middleware/rate_limit.py
git commit -m "chore: add limits[redis] dep and scaffold rate_limit middleware"
```

---

### Task 2: Write failing tests

**Files:**
- Create: `apps/server/tests/test_rate_limit.py`

- [ ] **Step 1: Write the test file**

Create `apps/server/tests/test_rate_limit.py`:

```python
"""Tests for RateLimitMiddleware.

Each test gets a fresh app with a fresh MemoryStorage so state never leaks.
Limits are set very low (2–3/min) so tests fire only a handful of requests.
"""
from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from limits.aio.storage import MemoryStorage

from api.middleware.rate_limit import RateLimitMiddleware


def make_app(
    global_limit: str = "3/minute",
    chat_session_limit: str = "3/minute",
    chat_guest_limit: str = "2/minute",
    auth_limit: str = "2/minute",
) -> FastAPI:
    """Build a minimal FastAPI app with RateLimitMiddleware wired in."""
    app = FastAPI()
    app.add_middleware(
        RateLimitMiddleware,
        storage=MemoryStorage(),
        global_limit=global_limit,
        chat_session_limit=chat_session_limit,
        chat_guest_limit=chat_guest_limit,
        auth_limit=auth_limit,
    )

    @app.get("/health")
    async def health():
        return {"ok": True}

    @app.post("/chat")
    async def chat():
        return {"reply": "ok"}

    @app.post("/auth/bootstrap-tenant")
    async def bootstrap():
        return {"ok": True}

    @app.get("/other")
    async def other():
        return {"ok": True}

    return app


def test_global_limit_triggers_429():
    client = TestClient(make_app(global_limit="3/minute"))
    for _ in range(3):
        assert client.get("/other").status_code == 200
    assert client.get("/other").status_code == 429


def test_global_limit_skips_health():
    # Exhaust global limit, then confirm /health still responds
    client = TestClient(make_app(global_limit="1/minute"))
    client.get("/other")  # consume the 1 allowed request
    client.get("/other")  # now blocked
    assert client.get("/health").status_code == 200


def test_auth_limit_triggers_429():
    client = TestClient(make_app(auth_limit="2/minute", global_limit="100/minute"))
    for _ in range(2):
        assert client.post("/auth/bootstrap-tenant").status_code == 200
    assert client.post("/auth/bootstrap-tenant").status_code == 429


def test_chat_guest_limit_triggers_429():
    client = TestClient(make_app(chat_guest_limit="2/minute", global_limit="100/minute"))
    for _ in range(2):
        assert client.post("/chat").status_code == 200
    assert client.post("/chat").status_code == 429


def test_chat_session_limit_triggers_429():
    client = TestClient(make_app(chat_session_limit="2/minute", global_limit="100/minute"))
    cookies = {"better-auth.session_token": "abc123.signature"}
    for _ in range(2):
        assert client.post("/chat", cookies=cookies).status_code == 200
    assert client.post("/chat", cookies=cookies).status_code == 429


def test_chat_session_and_guest_are_separate_buckets():
    """A session user hitting their limit doesn't block a guest, and vice versa."""
    client = TestClient(
        make_app(chat_session_limit="2/minute", chat_guest_limit="2/minute", global_limit="100/minute")
    )
    cookies = {"better-auth.session_token": "tok.sig"}
    # Exhaust session limit
    client.post("/chat", cookies=cookies)
    client.post("/chat", cookies=cookies)
    assert client.post("/chat", cookies=cookies).status_code == 429
    # Guest (no cookie) should still be allowed
    assert client.post("/chat").status_code == 200


def test_429_response_includes_retry_after_header():
    client = TestClient(make_app(global_limit="1/minute"))
    client.get("/other")
    resp = client.get("/other")
    assert resp.status_code == 429
    assert resp.headers.get("Retry-After") == "60"
    assert resp.json() == {"error": "Rate limit exceeded"}
```

- [ ] **Step 2: Run tests — verify they all fail**

```bash
uv run pytest apps/server/tests/test_rate_limit.py -v
```

Expected: 7 failures — `ImportError` or `AttributeError` because `RateLimitMiddleware` is a stub.

- [ ] **Step 3: Commit failing tests**

```bash
git add apps/server/tests/test_rate_limit.py
git commit -m "test: add failing rate limit middleware tests"
```

---

### Task 3: Implement the middleware

**Files:**
- Modify: `apps/server/src/api/middleware/rate_limit.py`

- [ ] **Step 1: Write the full implementation**

Replace `apps/server/src/api/middleware/rate_limit.py` entirely:

```python
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
        storage=None,
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
```

- [ ] **Step 2: Run tests — verify they all pass**

```bash
uv run pytest apps/server/tests/test_rate_limit.py -v
```

Expected: 7 passed, 0 failed.

- [ ] **Step 3: Commit implementation**

```bash
git add apps/server/src/api/middleware/rate_limit.py
git commit -m "feat: implement RateLimitMiddleware (limits[redis], pure ASGI)"
```

---

### Task 4: Wire middleware into the FastAPI app

**Files:**
- Modify: `apps/server/src/api/main.py`

- [ ] **Step 1: Add the import**

In `apps/server/src/api/main.py`, add this import after the existing middleware import on line 9:

```python
from fastapi.middleware.cors import CORSMiddleware

from .middleware.rate_limit import RateLimitMiddleware
```

- [ ] **Step 2: Register the middleware**

In `main.py`, the existing middleware block (around line 258) currently reads:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.cors_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

Add `RateLimitMiddleware` **after** `CORSMiddleware` so it wraps the app first (Starlette applies middleware in reverse-add order — last added runs outermost):

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.cors_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RateLimitMiddleware)
```

- [ ] **Step 3: Run the full test suite**

```bash
uv run pytest apps/server/tests/ -q
```

Expected: all existing tests still pass, plus 7 new rate limit tests — 100+ passed, 0 failed.

- [ ] **Step 4: Commit wiring**

```bash
git add apps/server/src/api/main.py
git commit -m "feat: register RateLimitMiddleware in FastAPI app"
```

---

### Task 5: Mark ROADMAP item complete

**Files:**
- Modify: `ROADMAP.md`

- [ ] **Step 1: Update item 77**

In `ROADMAP.md` at line 130, change:

```
| 77 | **Rate limiting middleware** | ⬜ | Per-IP + per-user request throttling (slowapi); rate limit headers in responses |
```

to:

```
| 77 | **Rate limiting middleware** | ✅ | Global 60/min per IP; chat 20/min (session) or 5/min (guest); auth bootstrap 5/min per IP; pure ASGI, SSE-safe |
```

- [ ] **Step 2: Commit**

```bash
git add ROADMAP.md
git commit -m "chore: mark rate limiting middleware complete in ROADMAP (item 77)"
```
