"""Static permission constants — mirrored from packages/auth/src/permissions.ts."""

from __future__ import annotations

from enum import StrEnum


class Permission(StrEnum):
    ADMIN_USERS_READ = "admin:users:read"
    ADMIN_USERS_WRITE = "admin:users:write"
    ADMIN_BILLING_READ = "admin:billing:read"
    ADMIN_BILLING_WRITE = "admin:billing:write"
    BILLING_MANAGE = "billing:manage"
    ORG_MEMBERS_INVITE = "org:members:invite"
    ORG_MEMBERS_REMOVE = "org:members:remove"
    ORG_SETTINGS_WRITE = "org:settings:write"
