"""Tests for the organizations router."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

from api.auth.deps import AuthUser, get_current_user
from api.routers.organizations import router
from fastapi import FastAPI
from fastapi.testclient import TestClient


def _make_app() -> FastAPI:
    a = FastAPI()
    a.include_router(router)
    return a


def _mock_pool(**kwargs) -> AsyncMock:
    pool = AsyncMock()
    pool.fetch = AsyncMock(return_value=kwargs.get("fetch", []))
    pool.fetchrow = AsyncMock(return_value=kwargs.get("fetchrow"))
    pool.fetchval = AsyncMock(return_value=kwargs.get("fetchval", 0))
    pool.execute = AsyncMock(return_value=kwargs.get("execute", ""))
    return pool


def _authed_client(app: FastAPI, pool: AsyncMock, role: str = "owner") -> TestClient:
    app.state.db_pool = pool
    user = AuthUser(id="user-1", email="user@example.com", org_id="user-1")

    def override():
        return user

    # Need org_members check for require_org_role to succeed
    # We'll configure fetchrow to return the role row as first call
    app.dependency_overrides[get_current_user] = override
    return TestClient(app)


# ---------------------------------------------------------------------------
# GET /organizations/current
# ---------------------------------------------------------------------------


def test_get_current_org_requires_auth():
    app = _make_app()
    pool = _mock_pool()
    app.state.db_pool = pool
    client = TestClient(app)
    res = client.get("/organizations/current")
    assert res.status_code == 401


def test_get_current_org_returns_org():
    app = _make_app()
    pool = _mock_pool(
        fetchrow={
            "id": "user-1",
            "name": "Test Org",
            "slug": "test-org-abcd",
            "logo_url": None,
            "invite_link_enabled": False,
            "role": "owner",
        }
    )
    client = _authed_client(app, pool)
    res = client.get("/organizations/current")
    assert res.status_code == 200
    data = res.json()
    assert data["id"] == "user-1"
    assert data["role"] == "owner"
    assert data["name"] == "Test Org"


def test_get_current_org_404_when_not_member():
    app = _make_app()
    pool = _mock_pool(fetchrow=None)
    client = _authed_client(app, pool)
    res = client.get("/organizations/current")
    assert res.status_code == 404


# ---------------------------------------------------------------------------
# PATCH /organizations/current (requires admin+)
# ---------------------------------------------------------------------------


def test_patch_current_org_updates_name():
    app = _make_app()
    org_row = {
        "id": "user-1",
        "name": "Updated Org",
        "slug": "test-org-abcd",
        "logo_url": None,
        "invite_link_enabled": False,
        "role": "owner",
    }
    # fetchrow called twice: require_org_role check, then get_current_org
    pool = _mock_pool()
    pool.fetchrow = AsyncMock(
        side_effect=[
            {"role": "owner"},  # require_org_role
            org_row,  # get_current_org (re-fetch)
        ]
    )
    client = _authed_client(app, pool)
    res = client.patch("/organizations/current", json={"name": "Updated Org"})
    assert res.status_code == 200
    assert res.json()["name"] == "Updated Org"


def test_patch_current_org_requires_admin():
    app = _make_app()
    pool = _mock_pool()
    pool.fetchrow = AsyncMock(return_value={"role": "member"})
    client = _authed_client(app, pool)
    res = client.patch("/organizations/current", json={"name": "Nope"})
    assert res.status_code == 403


# ---------------------------------------------------------------------------
# GET /organizations/current/members
# ---------------------------------------------------------------------------


def test_list_members_returns_members():
    app = _make_app()
    now = datetime.now(UTC)
    pool = _mock_pool(
        fetch=[
            {
                "user_id": "user-1",
                "email": "user@example.com",
                "name": "Alice",
                "role": "owner",
                "joined_at": now,
            }
        ]
    )
    client = _authed_client(app, pool)
    res = client.get("/organizations/current/members")
    assert res.status_code == 200
    members = res.json()
    assert len(members) == 1
    assert members[0]["user_id"] == "user-1"


# ---------------------------------------------------------------------------
# DELETE /organizations/current/members/{user_id}
# ---------------------------------------------------------------------------


def test_delete_sole_owner_forbidden():
    app = _make_app()
    pool = _mock_pool()
    pool.fetchrow = AsyncMock(
        side_effect=[
            {"role": "admin"},  # require_org_role (caller is admin)
            {"role": "owner"},  # target_role
        ]
    )
    pool.fetchval = AsyncMock(return_value=1)  # owner_count = 1
    client = _authed_client(app, pool)
    res = client.delete("/organizations/current/members/user-1")
    assert res.status_code == 400


def test_delete_member_not_found():
    app = _make_app()
    pool = _mock_pool()
    pool.fetchrow = AsyncMock(
        side_effect=[
            {"role": "admin"},  # require_org_role
            None,  # target_role not found
        ]
    )
    pool.fetchval = AsyncMock(return_value=2)
    client = _authed_client(app, pool)
    res = client.delete("/organizations/current/members/no-such-user")
    assert res.status_code == 404


# ---------------------------------------------------------------------------
# POST /organizations/current/invites
# ---------------------------------------------------------------------------


def test_create_invite_requires_admin():
    app = _make_app()
    pool = _mock_pool()
    pool.fetchrow = AsyncMock(return_value={"role": "member"})
    client = _authed_client(app, pool)
    res = client.post(
        "/organizations/current/invites",
        json={"email": "new@example.com", "role": "member"},
    )
    assert res.status_code == 403


def test_create_invite_returns_invite():
    app = _make_app()
    invite_id = uuid.uuid4()
    now = datetime.now(UTC)
    expires = now + timedelta(days=7)
    pool = _mock_pool()
    pool.fetchrow = AsyncMock(
        side_effect=[
            {"role": "owner"},  # require_org_role
            {  # inserted invite row
                "id": invite_id,
                "email": "invited@example.com",
                "role": "member",
                "token": "tok123",
                "expires_at": expires,
                "created_at": now,
            },
        ]
    )
    client = _authed_client(app, pool)
    res = client.post(
        "/organizations/current/invites",
        json={"email": "invited@example.com", "role": "member"},
    )
    assert res.status_code == 201
    data = res.json()
    assert data["email"] == "invited@example.com"
    assert "token" in data


# ---------------------------------------------------------------------------
# GET /organizations/current/invites
# ---------------------------------------------------------------------------


def test_list_invites():
    app = _make_app()
    invite_id = uuid.uuid4()
    now = datetime.now(UTC)
    expires = now + timedelta(days=7)
    pool = _mock_pool()
    pool.fetchrow = AsyncMock(return_value={"role": "owner"})
    pool.fetch = AsyncMock(
        return_value=[
            {
                "id": invite_id,
                "email": "pending@example.com",
                "role": "member",
                "token": "tok-abc",
                "expires_at": expires,
                "created_at": now,
            }
        ]
    )
    client = _authed_client(app, pool)
    res = client.get("/organizations/current/invites")
    assert res.status_code == 200
    emails = [i["email"] for i in res.json()]
    assert "pending@example.com" in emails


# ---------------------------------------------------------------------------
# DELETE /organizations/current/invites/{invite_id}
# ---------------------------------------------------------------------------


def test_revoke_invite():
    app = _make_app()
    pool = _mock_pool()
    pool.fetchrow = AsyncMock(return_value={"role": "owner"})
    pool.execute = AsyncMock(return_value="DELETE 1")
    client = _authed_client(app, pool)
    res = client.delete(f"/organizations/current/invites/{uuid.uuid4()}")
    assert res.status_code == 204


def test_revoke_invite_not_found():
    app = _make_app()
    pool = _mock_pool()
    pool.fetchrow = AsyncMock(return_value={"role": "owner"})
    pool.execute = AsyncMock(return_value="DELETE 0")
    client = _authed_client(app, pool)
    res = client.delete(f"/organizations/current/invites/{uuid.uuid4()}")
    assert res.status_code == 404


# ---------------------------------------------------------------------------
# GET/PATCH /organizations/current/invite-link
# ---------------------------------------------------------------------------


def test_get_invite_link():
    app = _make_app()
    pool = _mock_pool()
    pool.fetchrow = AsyncMock(
        side_effect=[
            {"role": "owner"},  # require_org_role
            {"invite_link_token": "link-tok", "invite_link_enabled": False},  # get_invite_link
        ]
    )
    client = _authed_client(app, pool)
    res = client.get("/organizations/current/invite-link")
    assert res.status_code == 200
    data = res.json()
    assert "enabled" in data
    assert "token" in data


def test_patch_invite_link_enable():
    app = _make_app()
    pool = _mock_pool()
    pool.fetchrow = AsyncMock(
        side_effect=[
            {"role": "owner"},  # require_org_role
            {"invite_link_token": "link-tok", "invite_link_enabled": True},  # get_invite_link
        ]
    )
    client = _authed_client(app, pool)
    res = client.patch("/organizations/current/invite-link", json={"enabled": True})
    assert res.status_code == 200
    assert res.json()["enabled"] is True


# ---------------------------------------------------------------------------
# POST /organizations/current/invite-link/reset
# ---------------------------------------------------------------------------


def test_reset_invite_link():
    app = _make_app()
    pool = _mock_pool()
    pool.fetchrow = AsyncMock(
        side_effect=[
            {"role": "owner"},
            {"invite_link_token": "new-token", "invite_link_enabled": True},
        ]
    )
    client = _authed_client(app, pool)
    res = client.post("/organizations/current/invite-link/reset")
    assert res.status_code == 200
    assert res.json()["token"] == "new-token"


# ---------------------------------------------------------------------------
# GET /join/{token} (public)
# ---------------------------------------------------------------------------


def test_join_invalid_token_returns_404():
    app = _make_app()
    pool = _mock_pool(fetchrow=None)
    app.state.db_pool = pool
    client = TestClient(app)
    res = client.get("/join/nonexistent-token")
    assert res.status_code == 404


def test_join_valid_email_invite():
    app = _make_app()
    now = datetime.now(UTC)
    pool = _mock_pool()
    pool.fetchrow = AsyncMock(
        return_value={
            "id": uuid.uuid4(),
            "org_id": "user-1",
            "role": "member",
            "expires_at": now + timedelta(days=7),
            "accepted_at": None,
            "org_name": "Test Org",
        }
    )
    app.state.db_pool = pool
    client = TestClient(app)
    res = client.get("/join/valid-token")
    assert res.status_code == 200
    assert res.json()["org_name"] == "Test Org"


# ---------------------------------------------------------------------------
# POST /join/{token} (requires auth)
# ---------------------------------------------------------------------------


def test_accept_join_invite():
    app = _make_app()
    now = datetime.now(UTC)
    invite_id = uuid.uuid4()
    pool = _mock_pool()
    # _resolve_token → fetchrow for email invite
    # existing member check → fetchrow returns None (not a member)
    pool.fetchrow = AsyncMock(
        side_effect=[
            {
                "id": invite_id,
                "org_id": "org-2",
                "role": "member",
                "expires_at": now + timedelta(days=7),
                "accepted_at": None,
                "org_name": "Other Org",
                "invited_by": "inviter-1",
            },
            None,  # not already a member
        ]
    )
    client = _authed_client(app, pool)
    res = client.post("/join/valid-token")
    assert res.status_code == 200
    assert res.json()["org_id"] == "org-2"
    assert res.json()["role"] == "member"


def test_accept_join_already_member():
    app = _make_app()
    now = datetime.now(UTC)
    invite_id = uuid.uuid4()
    pool = _mock_pool()
    pool.fetchrow = AsyncMock(
        side_effect=[
            {
                "id": invite_id,
                "org_id": "user-1",
                "role": "member",
                "expires_at": now + timedelta(days=7),
                "accepted_at": None,
                "org_name": "Test Org",
                "invited_by": "inviter-1",
            },
            {"role": "owner"},  # already a member
        ]
    )
    client = _authed_client(app, pool)
    res = client.post("/join/valid-token")
    assert res.status_code == 200
    assert res.json()["role"] == "owner"
