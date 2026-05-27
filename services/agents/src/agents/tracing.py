"""LangSmith tracing helpers.

Tracing is opt-in via two env vars:
- ``LANGCHAIN_TRACING_V2``: must be set to ``true``/``1``/``yes``
- ``LANGCHAIN_API_KEY``: must be non-empty

When either is missing, ``trace_chat`` returns a no-op context manager so the
runtime path stays cheap (and the ``langsmith`` package becomes optional).
"""

from __future__ import annotations

import os
import uuid
from contextlib import contextmanager, nullcontext
from typing import Any

try:
    from langsmith import trace as _ls_trace

    _LANGSMITH_AVAILABLE = True
except ImportError:  # pragma: no cover - exercised only without langsmith installed
    _LANGSMITH_AVAILABLE = False


_TRUTHY = {"true", "1", "yes", "on"}


def is_tracing_enabled() -> bool:
    """Return True when both env vars are set and ``langsmith`` is importable."""
    if not _LANGSMITH_AVAILABLE:
        return False
    flag = os.environ.get("LANGCHAIN_TRACING_V2", "").strip().lower()
    if flag not in _TRUTHY:
        return False
    return bool(os.environ.get("LANGCHAIN_API_KEY"))


@contextmanager
def trace_chat(
    *,
    run_id: uuid.UUID,
    name: str = "chat",
    inputs: dict[str, Any] | None = None,
    metadata: dict[str, Any] | None = None,
    tags: list[str] | None = None,
):
    """Open a LangSmith run for a chat invocation.

    Yields a ``RunTree`` (or ``None`` when tracing is disabled). Callers can
    attach outputs / usage by calling ``rt.end(outputs=...)`` or
    ``rt.add_metadata(...)`` when ``rt is not None``.
    """
    if not is_tracing_enabled():
        with nullcontext(None) as rt:
            yield rt
        return

    project = os.environ.get("LANGCHAIN_PROJECT", "ai-native-core")
    with _ls_trace(  # type: ignore[misc]
        name=name,
        run_type="chain",
        run_id=run_id,
        inputs=inputs or {},
        metadata=metadata or {},
        tags=tags or [],
        project_name=project,
    ) as rt:
        yield rt
