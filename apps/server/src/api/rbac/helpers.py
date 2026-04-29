"""RBAC helper utilities."""

from __future__ import annotations

import asyncpg


async def sync_is_admin(pool: asyncpg.Pool, user_id: str) -> None:
    """Sync the denormalized isAdmin flag on the user table after a role change."""
    row = await pool.fetchrow(
        """
        SELECT 1 FROM user_roles
        WHERE user_id = $1 AND role_id IN ('admin', 'super_admin') AND org_id IS NULL
        LIMIT 1
        """,
        user_id,
    )
    await pool.execute(
        'UPDATE "user" SET "isAdmin" = $1 WHERE id = $2',
        row is not None,
        user_id,
    )
