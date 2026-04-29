"""RBAC management router — roles, permissions, and user assignments."""

from __future__ import annotations

import secrets

import asyncpg
import structlog
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel

from ..rbac import Permission, require_permission, sync_is_admin

log = structlog.get_logger()
router = APIRouter(prefix="/rbac", tags=["rbac"])


# ── Output models ─────────────────────────────────────────────────────────────


class PermissionOut(BaseModel):
    id: str
    description: str


class RoleOut(BaseModel):
    id: str
    description: str
    permissions: list[str]


class UserOut(BaseModel):
    id: str
    email: str
    name: str | None = None


class UserRoleOut(BaseModel):
    id: str
    role_id: str
    org_id: str | None = None


class UserPermissionOut(BaseModel):
    id: str
    permission_id: str
    org_id: str | None = None


# ── Input models ──────────────────────────────────────────────────────────────


class AssignRoleIn(BaseModel):
    role_id: str
    org_id: str | None = None


class GrantPermissionIn(BaseModel):
    permission_id: str
    org_id: str | None = None


# ── Permissions ───────────────────────────────────────────────────────────────


@router.get(
    "/permissions",
    response_model=list[PermissionOut],
    dependencies=[require_permission(Permission.ADMIN_USERS_READ)],
)
async def list_permissions(request: Request) -> list[PermissionOut]:
    pool: asyncpg.Pool = request.app.state.db_pool
    rows = await pool.fetch("SELECT id, description FROM permissions ORDER BY id")
    return [PermissionOut(id=r["id"], description=r["description"]) for r in rows]


# ── Roles ─────────────────────────────────────────────────────────────────────


@router.get(
    "/roles",
    response_model=list[RoleOut],
    dependencies=[require_permission(Permission.ADMIN_USERS_READ)],
)
async def list_roles(request: Request) -> list[RoleOut]:
    pool: asyncpg.Pool = request.app.state.db_pool
    rows = await pool.fetch("SELECT id, description FROM roles ORDER BY id")
    result = []
    for r in rows:
        perm_rows = await pool.fetch(
            "SELECT permission_id FROM role_permissions WHERE role_id = $1 ORDER BY permission_id",
            r["id"],
        )
        result.append(
            RoleOut(
                id=r["id"],
                description=r["description"],
                permissions=[p["permission_id"] for p in perm_rows],
            )
        )
    return result


@router.post(
    "/roles/{role_id}/permissions",
    status_code=201,
    dependencies=[require_permission(Permission.ADMIN_USERS_WRITE)],
)
async def add_role_permission(
    role_id: str,
    body: GrantPermissionIn,
    request: Request,
) -> dict:
    pool: asyncpg.Pool = request.app.state.db_pool
    await pool.execute(
        "INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        role_id,
        body.permission_id,
    )
    return {"role_id": role_id, "permission_id": body.permission_id}


@router.delete(
    "/roles/{role_id}/permissions/{perm_id}",
    status_code=204,
    dependencies=[require_permission(Permission.ADMIN_USERS_WRITE)],
)
async def remove_role_permission(
    role_id: str,
    perm_id: str,
    request: Request,
) -> Response:
    pool: asyncpg.Pool = request.app.state.db_pool
    await pool.execute(
        "DELETE FROM role_permissions WHERE role_id = $1 AND permission_id = $2",
        role_id,
        perm_id,
    )
    return Response(status_code=204)


# ── User list ─────────────────────────────────────────────────────────────────


@router.get(
    "/users",
    response_model=list[UserOut],
    dependencies=[require_permission(Permission.ADMIN_USERS_READ)],
)
async def list_users(request: Request, search: str = "") -> list[UserOut]:
    pool: asyncpg.Pool = request.app.state.db_pool
    if search:
        rows = await pool.fetch(
            'SELECT id, email, name FROM "user" WHERE email ILIKE $1 OR name ILIKE $1 ORDER BY "createdAt" DESC LIMIT 50',
            f"%{search}%",
        )
    else:
        rows = await pool.fetch(
            'SELECT id, email, name FROM "user" ORDER BY "createdAt" DESC LIMIT 50',
        )
    return [UserOut(id=r["id"], email=r["email"], name=r["name"]) for r in rows]


# ── User roles ────────────────────────────────────────────────────────────────


@router.get(
    "/users/{user_id}/roles",
    response_model=list[UserRoleOut],
    dependencies=[require_permission(Permission.ADMIN_USERS_READ)],
)
async def list_user_roles(user_id: str, request: Request) -> list[UserRoleOut]:
    pool: asyncpg.Pool = request.app.state.db_pool
    rows = await pool.fetch(
        "SELECT id, role_id, org_id FROM user_roles WHERE user_id = $1 ORDER BY created_at",
        user_id,
    )
    return [UserRoleOut(id=r["id"], role_id=r["role_id"], org_id=r["org_id"]) for r in rows]


@router.post(
    "/users/{user_id}/roles",
    status_code=201,
    response_model=UserRoleOut,
    dependencies=[require_permission(Permission.ADMIN_USERS_WRITE)],
)
async def assign_user_role(
    user_id: str,
    body: AssignRoleIn,
    request: Request,
) -> UserRoleOut:
    pool: asyncpg.Pool = request.app.state.db_pool
    assignment_id = secrets.token_urlsafe(16)
    try:
        await pool.execute(
            "INSERT INTO user_roles (id, user_id, role_id, org_id) VALUES ($1, $2, $3, $4)",
            assignment_id,
            user_id,
            body.role_id,
            body.org_id,
        )
    except asyncpg.UniqueViolationError as exc:
        raise HTTPException(status_code=409, detail="Role already assigned") from exc
    if body.org_id is None:
        await sync_is_admin(pool, user_id)
    log.info("rbac.role.assigned", user_id=user_id, role_id=body.role_id)
    return UserRoleOut(id=assignment_id, role_id=body.role_id, org_id=body.org_id)


@router.delete(
    "/users/{user_id}/roles/{role_id}",
    status_code=204,
    dependencies=[require_permission(Permission.ADMIN_USERS_WRITE)],
)
async def revoke_user_role(
    user_id: str,
    role_id: str,
    request: Request,
) -> Response:
    pool: asyncpg.Pool = request.app.state.db_pool
    await pool.execute(
        "DELETE FROM user_roles WHERE user_id = $1 AND role_id = $2 AND org_id IS NULL",
        user_id,
        role_id,
    )
    await sync_is_admin(pool, user_id)
    log.info("rbac.role.revoked", user_id=user_id, role_id=role_id)
    return Response(status_code=204)


# ── User direct permissions ───────────────────────────────────────────────────


@router.get(
    "/users/{user_id}/permissions",
    response_model=list[UserPermissionOut],
    dependencies=[require_permission(Permission.ADMIN_USERS_READ)],
)
async def list_user_permissions(user_id: str, request: Request) -> list[UserPermissionOut]:
    pool: asyncpg.Pool = request.app.state.db_pool
    rows = await pool.fetch(
        "SELECT id, permission_id, org_id FROM user_permissions WHERE user_id = $1 ORDER BY created_at",
        user_id,
    )
    return [
        UserPermissionOut(id=r["id"], permission_id=r["permission_id"], org_id=r["org_id"])
        for r in rows
    ]


@router.post(
    "/users/{user_id}/permissions",
    status_code=201,
    response_model=UserPermissionOut,
    dependencies=[require_permission(Permission.ADMIN_USERS_WRITE)],
)
async def grant_user_permission(
    user_id: str,
    body: GrantPermissionIn,
    request: Request,
) -> UserPermissionOut:
    pool: asyncpg.Pool = request.app.state.db_pool
    grant_id = secrets.token_urlsafe(16)
    try:
        await pool.execute(
            "INSERT INTO user_permissions (id, user_id, permission_id, org_id) VALUES ($1, $2, $3, $4)",
            grant_id,
            user_id,
            body.permission_id,
            body.org_id,
        )
    except asyncpg.UniqueViolationError as exc:
        raise HTTPException(status_code=409, detail="Permission already granted") from exc
    log.info("rbac.permission.granted", user_id=user_id, permission_id=body.permission_id)
    return UserPermissionOut(id=grant_id, permission_id=body.permission_id, org_id=body.org_id)


@router.delete(
    "/users/{user_id}/permissions/{perm_id}",
    status_code=204,
    dependencies=[require_permission(Permission.ADMIN_USERS_WRITE)],
)
async def revoke_user_permission(
    user_id: str,
    perm_id: str,
    request: Request,
) -> Response:
    pool: asyncpg.Pool = request.app.state.db_pool
    await pool.execute(
        "DELETE FROM user_permissions WHERE user_id = $1 AND permission_id = $2 AND org_id IS NULL",
        user_id,
        perm_id,
    )
    log.info("rbac.permission.revoked", user_id=user_id, permission_id=perm_id)
    return Response(status_code=204)
