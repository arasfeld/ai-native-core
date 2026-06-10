"""Admin router — runtime AI configuration management."""

from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from ..auth import CurrentUser

router = APIRouter(prefix="/admin", tags=["admin"])


class FallbackProvider(BaseModel):
    provider: str
    model: str | None = None


class AIFeatureConfig(BaseModel):
    feature: str
    provider: str
    model: str | None = None
    enabled: bool = True
    fallback_providers: list[FallbackProvider] = Field(default_factory=list)


class AIConfigUpdate(BaseModel):
    provider: str
    model: str | None = None
    enabled: bool = True
    fallback_providers: list[FallbackProvider] = Field(default_factory=list)


@router.get("/ai-config")
async def get_ai_config(
    request: Request,
    _current_user: CurrentUser,
) -> dict[str, AIFeatureConfig]:
    """Return current AI feature configuration."""
    return request.app.state.ai_config


@router.put("/ai-config/{feature}")
async def update_ai_config(
    feature: str,
    update: AIConfigUpdate,
    request: Request,
    current_user: CurrentUser,
) -> AIFeatureConfig:
    """Update a feature's AI config and refresh in-memory state."""
    pool = request.app.state.db_pool

    row = await pool.fetchrow("SELECT feature FROM ai_feature_configs WHERE feature = $1", feature)
    if row is None:
        raise HTTPException(status_code=404, detail=f"Feature '{feature}' not found")

    fallback_json = json.dumps([fb.model_dump() for fb in update.fallback_providers])
    await pool.execute(
        """
        UPDATE ai_feature_configs
        SET provider = $1,
            model = $2,
            enabled = $3,
            fallback_providers = $4::jsonb,
            updated_at = NOW()
        WHERE feature = $5
        """,
        update.provider,
        update.model,
        update.enabled,
        fallback_json,
        feature,
    )

    # Refresh in-memory config
    updated = AIFeatureConfig(
        feature=feature,
        provider=update.provider,
        model=update.model,
        enabled=update.enabled,
        fallback_providers=update.fallback_providers,
    )
    # Stored as a plain dict so AgentFactory's `.get("fallback_providers")` keeps working.
    request.app.state.ai_config[feature] = updated.model_dump()
    return updated
