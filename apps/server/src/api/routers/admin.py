"""Admin router — runtime AI configuration management."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from ..auth import CurrentUser

router = APIRouter(prefix="/admin", tags=["admin"])


class AIFeatureConfig(BaseModel):
    feature: str
    provider: str
    model: str | None = None
    enabled: bool = True


class AIConfigUpdate(BaseModel):
    provider: str
    model: str | None = None
    enabled: bool = True


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

    await pool.execute(
        """
        UPDATE ai_feature_configs
        SET provider = $1, model = $2, enabled = $3, updated_at = NOW()
        WHERE feature = $4
        """,
        update.provider,
        update.model,
        update.enabled,
        feature,
    )

    # Refresh in-memory config
    updated = AIFeatureConfig(
        feature=feature,
        provider=update.provider,
        model=update.model,
        enabled=update.enabled,
    )
    request.app.state.ai_config[feature] = updated
    return updated
