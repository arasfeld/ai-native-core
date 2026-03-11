import os

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    llm_provider: str = "ollama"
    database_url: str = "postgresql://postgres:postgres@localhost:5432/aicore"
    cors_origin: str = "http://localhost:3000"
    port: int = 8000

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()

# Propagate LLM_PROVIDER to env so packages/ai factory picks it up
os.environ.setdefault("LLM_PROVIDER", settings.llm_provider)
os.environ.setdefault("DATABASE_URL", settings.database_url)
