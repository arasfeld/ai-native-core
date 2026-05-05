"""User preferences router — global system instructions."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

from ..auth.deps import AuthUser, get_current_user

router = APIRouter(prefix="/preferences", tags=["preferences"])
CurrentUser = Annotated[AuthUser, Depends(get_current_user)]


class PreferencesOut(BaseModel):
    system_instructions: str


class PutPreferencesRequest(BaseModel):
    system_instructions: str


@router.get("", response_model=PreferencesOut)
async def get_preferences(user: CurrentUser, request: Request):
    pool = request.app.state.db_pool
    row = await pool.fetchrow(
        "SELECT system_instructions FROM user_preferences WHERE user_id = $1",
        user.id,
    )
    return PreferencesOut(system_instructions=row["system_instructions"] if row else "")


@router.put("", response_model=PreferencesOut)
async def put_preferences(body: PutPreferencesRequest, user: CurrentUser, request: Request):
    pool = request.app.state.db_pool
    await pool.execute(
        """
        INSERT INTO user_preferences (user_id, system_instructions, updated_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (user_id) DO UPDATE
        SET system_instructions = EXCLUDED.system_instructions, updated_at = NOW()
        """,
        user.id,
        body.system_instructions,
    )
    return PreferencesOut(system_instructions=body.system_instructions)
