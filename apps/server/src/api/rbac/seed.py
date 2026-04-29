"""Idempotent RBAC seeder — run from lifespan startup."""

from __future__ import annotations

import asyncpg
import structlog

from .permissions import Permission

log = structlog.get_logger()

_PERMISSION_DESCRIPTIONS: dict[Permission, str] = {
    Permission.ADMIN_USERS_READ: "View user list and profiles",
    Permission.ADMIN_USERS_WRITE: "Create, update, suspend, or delete users",
    Permission.ADMIN_BILLING_READ: "View billing information for all tenants",
    Permission.ADMIN_BILLING_WRITE: "Modify billing plans and limits",
    Permission.BILLING_MANAGE: "Manage own subscription and payment methods",
    Permission.ORG_MEMBERS_INVITE: "Invite members to an organization",
    Permission.ORG_MEMBERS_REMOVE: "Remove members from an organization",
    Permission.ORG_SETTINGS_WRITE: "Edit organization settings",
}

_ROLE_DESCRIPTIONS: dict[str, str] = {
    "super_admin": "Full system access",
    "admin": "User and billing management",
    "member": "Standard user access",
}

_ROLE_PERMISSIONS: dict[str, list[Permission]] = {
    "super_admin": list(Permission),
    "admin": [
        Permission.ADMIN_USERS_READ,
        Permission.ADMIN_USERS_WRITE,
        Permission.ADMIN_BILLING_READ,
        Permission.ADMIN_BILLING_WRITE,
        Permission.BILLING_MANAGE,
    ],
    "member": [
        Permission.BILLING_MANAGE,
    ],
}


async def seed_rbac(pool: asyncpg.Pool) -> None:
    async with pool.acquire() as conn:
        for perm in Permission:
            await conn.execute(
                "INSERT INTO permissions (id, description) VALUES ($1, $2) ON CONFLICT DO NOTHING",
                perm.value,
                _PERMISSION_DESCRIPTIONS[perm],
            )
        for role_id, desc in _ROLE_DESCRIPTIONS.items():
            await conn.execute(
                "INSERT INTO roles (id, description) VALUES ($1, $2) ON CONFLICT DO NOTHING",
                role_id,
                desc,
            )
        for role_id, perms in _ROLE_PERMISSIONS.items():
            for perm in perms:
                await conn.execute(
                    "INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
                    role_id,
                    perm.value,
                )
    log.info("rbac.seeded")
