"""Persist eval results into the ``eval_runs`` table.

Called from each per-category test in ``test_golden.py``. Skipped silently
when ``EVAL_DB_URL`` is not set (e.g. on a contributor's laptop), so the
unit-test suite stays self-contained.

Environment variables:
    EVAL_DB_URL     Postgres connection string. When unset, this module is a no-op.
    GITHUB_SHA      Set by GitHub Actions. Used as the commit identifier.
    GITHUB_REF_NAME Set by GitHub Actions. Used as the branch identifier.
"""

from __future__ import annotations

import asyncio
import os
from decimal import Decimal


def _pass_count(scores: list[float], case_threshold: float = 0.5) -> int:
    return sum(1 for s in scores if s >= case_threshold)


async def _insert(
    *,
    db_url: str,
    commit_sha: str,
    branch: str | None,
    category: str,
    scorer: str,
    scores: list[float],
    threshold: float | None,
    langsmith_run_url: str | None,
) -> None:
    import asyncpg

    if not scores:
        return

    mean = sum(scores) / len(scores)
    conn = await asyncpg.connect(db_url)
    try:
        await conn.execute(
            """
            INSERT INTO eval_runs
                (commit_sha, branch, category, scorer,
                 pass_count, total_count, score, threshold, langsmith_run_url)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            """,
            commit_sha,
            branch,
            category,
            scorer,
            _pass_count(scores),
            len(scores),
            Decimal(f"{mean:.4f}"),
            Decimal(f"{threshold:.4f}") if threshold is not None else None,
            langsmith_run_url,
        )
    finally:
        await conn.close()


def record_eval_run(
    *,
    category: str,
    scorer: str,
    scores: list[float],
    threshold: float | None = None,
    langsmith_run_url: str | None = None,
) -> None:
    """Sync wrapper for use inside synchronous pytest tests.

    No-op when ``EVAL_DB_URL`` is unset. Errors are swallowed so a misconfigured
    DB never blocks the CI signal from the actual scoring.
    """
    db_url = os.environ.get("EVAL_DB_URL")
    if not db_url:
        return
    commit_sha = os.environ.get("GITHUB_SHA") or "local"
    branch = os.environ.get("GITHUB_REF_NAME")

    try:
        asyncio.get_event_loop().run_until_complete(
            _insert(
                db_url=db_url,
                commit_sha=commit_sha,
                branch=branch,
                category=category,
                scorer=scorer,
                scores=scores,
                threshold=threshold,
                langsmith_run_url=langsmith_run_url,
            )
        )
    except RuntimeError:
        # We're already inside an event loop (pytest-asyncio) — schedule the
        # insert on it instead.
        asyncio.ensure_future(
            _insert(
                db_url=db_url,
                commit_sha=commit_sha,
                branch=branch,
                category=category,
                scorer=scorer,
                scores=scores,
                threshold=threshold,
                langsmith_run_url=langsmith_run_url,
            )
        )
    except Exception:  # pragma: no cover - never block evals on DB errors
        pass
