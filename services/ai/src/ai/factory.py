import os

from .base import BaseLLM

_instance: BaseLLM | None = None


def get_llm() -> BaseLLM:
    """Return the shared LLM provider instance (singleton, configured via LLM_PROVIDER env var)."""
    global _instance
    if _instance is None:
        _instance = create_llm()
    return _instance


def create_llm(
    provider: str | None = None,
    model: str | None = None,
) -> BaseLLM:
    """Create a fresh LLM provider instance (not cached).

    Args:
        provider: One of 'openai', 'anthropic', 'openrouter', 'ollama'.
                  Defaults to LLM_PROVIDER env var.
        model: Override the model name. None uses provider default.
    """
    _provider = (provider or os.environ.get("LLM_PROVIDER", "ollama")).lower()
    return _create_llm(_provider, model)


def _create_llm(provider: str, model: str | None = None) -> BaseLLM:
    match provider:
        case "openai":
            from .providers.openai import OpenAIProvider
            p = OpenAIProvider()
            if model:
                p.model = model
            return p
        case "anthropic":
            from .providers.anthropic import AnthropicProvider
            p = AnthropicProvider()
            if model:
                p.model = model
            return p
        case "openrouter":
            from .providers.openrouter import OpenRouterProvider
            p = OpenRouterProvider()
            if model:
                p.model = model
            return p
        case "ollama":
            from .providers.ollama import OllamaProvider
            p = OllamaProvider()
            if model:
                p.model = model
            return p
        case _:
            raise ValueError(
                f"Unknown LLM provider: '{provider}'. "
                "Choose from: openai, anthropic, openrouter, ollama"
            )
