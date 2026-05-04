# Rate Limiting Design

**Goal:** Protect all FastAPI endpoints from abuse with a global floor, tighter limits on auth and chat endpoints, Redis-backed storage falling back to in-memory for local dev.

**Tech Stack:** slowapi, limits[redis], redis-py (async), existing Redis instance (already used by ARQ)

---

## Limits

| Scope | Limit | Key |
|---|---|---|
| Global (all endpoints) | 60 req/min | client IP |
| Auth (sign-in, sign-up, forgot-password) | 5 req/min | client IP |
| Chat (authenticated user) | 20 req/min | user_id |
| Chat (guest) | 5 req/min | client IP |

---

## Architecture

### New file: `apps/server/src/api/middleware/rate_limit.py`

Creates the `slowapi` `Limiter` instance and exports key functions.

```python
from slowapi import Limiter
from slowapi.util import get_remote_address
from fastapi import Request

def get_client_key(request: Request) -> str:
    """Always returns client IP — used for auth endpoints and global limit."""
    return get_remote_address(request)

def get_user_key(request: Request) -> str:
    """Returns user_id for authenticated requests, IP for guests."""
    user = getattr(request.state, "user", None)
    if user and not user.id.startswith("guest:"):
        return user.id
    return get_remote_address(request)

limiter = Limiter(
    key_func=get_client_key,
    storage_uri=_redis_uri_from_settings(),  # falls back to "memory://" if Redis unavailable
    headers_enabled=True,
)
```

`_redis_uri_from_settings()` reads `settings.redis_url` and converts it to the `limits` Redis URI format (`redis://...`). If Redis is unreachable at startup, it falls back to `"memory://"` with a warning log.

### `apps/server/src/api/main.py` changes

```python
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from .middleware.rate_limit import limiter

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)
```

The global 60/minute limit is applied as a `@limiter.limit("60/minute")` decorator on a shared dependency injected into every router via `router = APIRouter(dependencies=[Depends(global_rate_limit)])`. This avoids decorating every individual route.

### `apps/server/src/api/routers/chat.py` changes

```python
@router.post("")
@limiter.limit("20/minute", key_func=get_user_key)
@limiter.limit("5/minute", key_func=get_client_key)  # guest fallback enforced by key_func
async def chat(req: ChatRequest, request: Request, ...):
    ...
```

In practice a single `@limiter.limit` with `get_user_key` achieves both — authenticated users are keyed by user_id (20/min bucket), guests are keyed by IP (which also falls under the global 60/min, effectively tighter at 5/min via the global cap). To make guest chat explicitly 5/min, we add a second decorator with `get_client_key` and `"5/minute"`. slowapi stacks limits.

### `apps/server/src/api/routers/auth.py` changes

The auth router proxies to better-auth but exposes a few local endpoints. The `5/minute` limit applies to:
- `POST /auth/sign-in/email`
- `POST /auth/sign-up/email`
- `POST /auth/forget-password`

Each gets `@limiter.limit("5/minute", key_func=get_client_key)`.

### Response headers

slowapi with `headers_enabled=True` automatically adds to every response:
- `X-RateLimit-Limit` — the applicable limit
- `X-RateLimit-Remaining` — requests left in window
- `X-RateLimit-Reset` — UTC timestamp when window resets

On 429:
- `Retry-After` — seconds until the window resets
- Body: `{"error": "Rate limit exceeded"}`

---

## Dependencies

Add to `apps/server/pyproject.toml`:
```toml
"slowapi>=0.1.9",
"limits[redis]>=3.7",
```

No new infrastructure required — Redis is already running for ARQ.

---

## Testing

`apps/server/tests/test_rate_limit.py` — uses in-memory storage (no Redis needed in CI).

Tests:
1. Global limit: 61 requests to any endpoint returns 429 on the 61st
2. Auth limit: 6 requests to `POST /auth/sign-in/email` returns 429 on the 6th
3. Chat guest limit: 6 unauthenticated chat requests returns 429 on the 6th
4. Chat authenticated limit: 21 authenticated chat requests returns 429 on the 21st
5. 429 response includes `Retry-After` header
6. Responses under the limit include `X-RateLimit-Remaining` header

Tests override the limiter storage to `"memory://"` via a fixture that patches `app.state.limiter`.

---

## Rollout / Config

All limits are hardcoded constants in `middleware/rate_limit.py`. No env var configuration for now — if limits need tuning they're changed in code. This keeps the implementation simple and avoids a sprawling config surface.

If Redis is unavailable at startup, the server logs a warning and continues with in-memory limiting (safe for single-instance dev; not shared across instances in prod).
