"""Tests for RateLimitMiddleware.

Each test gets a fresh app with a fresh MemoryStorage so state never leaks.
Limits are set very low (2–3/min) so tests fire only a handful of requests.
"""

from __future__ import annotations

from api.middleware.rate_limit import RateLimitMiddleware
from fastapi import FastAPI
from fastapi.testclient import TestClient
from limits.aio.storage import MemoryStorage


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
        make_app(
            chat_session_limit="2/minute", chat_guest_limit="2/minute", global_limit="100/minute"
        )
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
