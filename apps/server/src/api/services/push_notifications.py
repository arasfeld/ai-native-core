"""Expo push notifications — server → mobile delivery via the Expo push API."""

from __future__ import annotations

import os
from typing import Any

import httpx
import structlog

log = structlog.get_logger()

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


async def send_expo_push(
    pool: Any,
    user_id: str,
    *,
    title: str,
    body: str,
    data: dict[str, Any] | None = None,
) -> None:
    """Look up the user's registered Expo push tokens and deliver a notification.

    Best-effort: never raises. Tokens that Expo reports as DeviceNotRegistered
    are deleted so the table doesn't grow stale.
    """
    try:
        rows = await pool.fetch(
            "SELECT token FROM push_tokens WHERE user_id = $1",
            user_id,
        )
    except Exception:
        log.exception("push.lookup_failed", user_id=user_id)
        return

    tokens = [row["token"] for row in rows]
    if not tokens:
        return

    messages = [{"to": token, "title": title, "body": body, "data": data or {}} for token in tokens]
    headers: dict[str, str] = {}
    access_token = os.getenv("EXPO_ACCESS_TOKEN")
    if access_token:
        headers["Authorization"] = f"Bearer {access_token}"

    async with httpx.AsyncClient(timeout=10.0) as client:
        for i in range(0, len(messages), 100):
            chunk = messages[i : i + 100]
            try:
                resp = await client.post(EXPO_PUSH_URL, json=chunk, headers=headers)
                payload = resp.json()
                data_list = payload.get("data") if isinstance(payload, dict) else None
                if isinstance(data_list, list):
                    for result, message in zip(data_list, chunk, strict=False):
                        if (
                            isinstance(result, dict)
                            and result.get("status") == "error"
                            and result.get("details", {}).get("error") == "DeviceNotRegistered"
                        ):
                            await _delete_token(pool, message["to"])
            except Exception:
                log.warning("push.send_failed", chunk_size=len(chunk))


async def _delete_token(pool: Any, token: str) -> None:
    try:
        await pool.execute("DELETE FROM push_tokens WHERE token = $1", token)
    except Exception:
        log.warning("push.delete_failed", token_prefix=token[:16])
