import os

from .base import BaseLLM

_instance: BaseLLM | None = None


def get_llm() -> BaseLLM:
    """Return the shared LLM provider instance (singleton, configured via LLM_PROVIDER env var)."""
    global _instance
    if _instance is None:
        _instance = _create_llm()
    return _instance


def _create_llm() -> BaseLLM:
    provider = os.environ.get("LLM_PROVIDER", "ollama").lower()

    match provider:
        case "openai":
            from .providers.openai import OpenAIProvider

            return OpenAIProvider()
        case "anthropic":
            from .providers.anthropic import AnthropicProvider

            return AnthropicProvider()
        case "openrouter":
            from .providers.openrouter import OpenRouterProvider

            return OpenRouterProvider()
        case "ollama":
            from .providers.ollama import OllamaProvider

            return OllamaProvider()
        case _:
            raise ValueError(
                f"Unknown LLM_PROVIDER: '{provider}'. "
                "Choose from: openai, anthropic, openrouter, ollama"
            )
