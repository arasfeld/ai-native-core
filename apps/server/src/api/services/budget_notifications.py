"""Budget threshold notifications — email + in-app at 80% and 100% usage."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from typing import Literal

import resend
import structlog

from ..config import settings
from .push_notifications import send_expo_push

log = structlog.get_logger()

_UPGRADE_PATH = "/billing"


def _should_notify(warned_at: datetime | None) -> bool:
    """Return True if warned_at is NULL or from a prior calendar month."""
    if warned_at is None:
        return True
    now = datetime.now(UTC)
    return (warned_at.year, warned_at.month) < (now.year, now.month)


def _send_budget_email(to: str, percent: Literal[80, 100], used: int, limit: int) -> None:
    """Synchronous Resend call — run in executor to avoid blocking the event loop."""
    if not settings.resend_api_key:
        return
    resend.api_key = settings.resend_api_key
    subject = "Token budget exhausted" if percent == 100 else "Token budget at 80%"
    upgrade_url = f"{settings.web_url}{_UPGRADE_PATH}"
    body = (
        f"<p>You've used {used:,} of {limit:,} tokens this month ({percent}%).</p>"
        f"<p>{'Your account is now rate-limited. ' if percent == 100 else ''}"
        f"<a href='{upgrade_url}'>Upgrade your plan</a> to continue chatting.</p>"
    )
    try:
        resend.Emails.send(
            {
                "from": settings.resend_from_email,
                "to": to,
                "subject": subject,
                "html": body,
            }
        )
    except Exception:
        log.warning("budget_notifications.email.failed", to=to, percent=percent)


async def check_budget_thresholds(pool, tenant_id: str, user_email: str) -> None:
    """Check usage and send notifications at 80% and 100% thresholds.

    Called fire-and-forget via asyncio.ensure_future after add_token_usage.
    """
    try:
        row = await pool.fetchrow(
            """
            SELECT
                COALESCE(SUM(stu.tokens), 0)::int AS used,
                t.token_limit                      AS limit,
                t.budget_warned_80_at,
                t.budget_warned_100_at
            FROM tenants t
            LEFT JOIN session_token_usage stu
                ON stu.tenant_id = t.id
               AND date_trunc('month', stu.recorded_at) = date_trunc('month', NOW())
            WHERE t.id = $1
            GROUP BY t.token_limit, t.budget_warned_80_at, t.budget_warned_100_at
            """,
            tenant_id,
        )
        if row is None:
            return

        used: int = row["used"]
        limit: int = row["limit"]
        if limit <= 0:
            return

        percent = used * 100 // limit

        if percent >= 100 and _should_notify(row["budget_warned_100_at"]):
            await _notify(pool, tenant_id, user_email, 100, used, limit)
        elif percent >= 80 and _should_notify(row["budget_warned_80_at"]):
            await _notify(pool, tenant_id, user_email, 80, used, limit)

    except Exception:
        log.exception("budget_notifications.check.failed", tenant_id=tenant_id)


async def _notify(
    pool,
    tenant_id: str,
    user_email: str,
    percent: Literal[80, 100],
    used: int,
    limit: int,
) -> None:
    title = "Token budget exhausted" if percent == 100 else "Token budget at 80%"
    body = f"You've used {used:,} of {limit:,} tokens this month ({percent}%). " + (
        "Your account is now rate-limited." if percent == 100 else "Upgrade to avoid interruptions."
    )
    flag_col = "budget_warned_100_at" if percent == 100 else "budget_warned_80_at"

    await pool.execute(
        "INSERT INTO notifications (user_id, type, title, body) VALUES ($1, $2, $3, $4)",
        tenant_id,
        "budget_warning",
        title,
        body,
    )
    await pool.execute(
        f"UPDATE tenants SET {flag_col} = NOW() WHERE id = $1",  # noqa: S608
        tenant_id,
    )

    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, _send_budget_email, user_email, percent, used, limit)

    # tenant_id == user.id for personal tenants in this codebase (see
    # SessionRepository.get_or_create_tenant), so push tokens registered under
    # the user are reachable via the tenant_id we already have. Fire-and-forget.
    await send_expo_push(
        pool,
        tenant_id,
        title=title,
        body=body,
        data={"deepLink": "/billing"},
    )
