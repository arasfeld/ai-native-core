import os

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    llm_provider: str = "ollama"
    database_url: str = "postgresql://postgres:postgres@localhost:5432/aicore"
    cors_origin: str = "http://localhost:3000"
    port: int = 8000
    redis_url: str = "redis://localhost:6379"
    auth_secret: str = "change-me-in-production"
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_pro_price_id: str = ""       # Stripe Price ID for the "pro" plan
    web_url: str = "http://localhost:3000"
    log_level: str = "INFO"
    log_format: str = "console"  # "console" | "json"
    session_token_budget: int = 100_000  # max tokens per session (0 = unlimited)
    embedding_dim: int = 768  # nomic-embed-text=768, text-embedding-3-small=1536

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()

# Propagate LLM_PROVIDER to env so packages/ai factory picks it up
os.environ.setdefault("LLM_PROVIDER", settings.llm_provider)
os.environ.setdefault("DATABASE_URL", settings.database_url)
