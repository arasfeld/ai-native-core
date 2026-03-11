"""Prompt registry — versioned Jinja2 template lookup and rendering.

Templates live in ``packages/prompts/src/prompts/system/`` and follow the
naming convention ``{name}.v{N}.j2`` (e.g. ``chat.v1.j2``).

Usage::

    from prompts import render_prompt, registry

    # Render the latest version of "chat"
    text = render_prompt("chat", context={"user_name": "Ada"})

    # Render a specific version
    text = render_prompt("chat", version=1, context={"user_name": "Ada"})

    # Inspect what's available
    registry.list()           # ["chat"]
    registry.versions("chat") # [1]
"""

from __future__ import annotations

import re
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

_SYSTEM_DIR = Path(__file__).parent / "system"
_VERSION_RE = re.compile(r"^(?P<name>.+)\.v(?P<version>\d+)\.j2$")


class PromptRegistry:
    """Discovers and renders versioned prompt templates.

    Templates are discovered lazily on first access and cached for the
    lifetime of the registry instance.
    """

    def __init__(self, templates_dir: Path = _SYSTEM_DIR) -> None:
        self._dir = templates_dir
        self._env = Environment(
            loader=FileSystemLoader(str(templates_dir)),
            autoescape=select_autoescape(enabled_extensions=()),
            trim_blocks=True,
            lstrip_blocks=True,
        )
        self._index: dict[str, list[int]] | None = None

    # ------------------------------------------------------------------
    # Discovery
    # ------------------------------------------------------------------

    def _build_index(self) -> dict[str, list[int]]:
        index: dict[str, list[int]] = {}
        for path in self._dir.glob("*.v*.j2"):
            m = _VERSION_RE.match(path.name)
            if m:
                name = m.group("name")
                version = int(m.group("version"))
                index.setdefault(name, []).append(version)
        for versions in index.values():
            versions.sort()
        return index

    @property
    def _idx(self) -> dict[str, list[int]]:
        if self._index is None:
            self._index = self._build_index()
        return self._index

    def list(self) -> list[str]:
        """Return all known prompt names in alphabetical order."""
        return sorted(self._idx)

    def versions(self, name: str) -> list[int]:
        """Return available version numbers for *name*, ascending.

        Raises ``KeyError`` if no templates exist for that name.
        """
        if name not in self._idx:
            raise KeyError(f"No prompt templates found for '{name}'")
        return list(self._idx[name])

    def latest_version(self, name: str) -> int:
        """Return the highest available version number for *name*."""
        return self.versions(name)[-1]

    # ------------------------------------------------------------------
    # Rendering
    # ------------------------------------------------------------------

    def render(
        self,
        name: str,
        version: int | None = None,
        context: dict | None = None,
    ) -> str:
        """Render prompt *name* at *version* (defaults to latest).

        Args:
            name:    Prompt name (e.g. ``"chat"``).
            version: Explicit version number. Defaults to the highest available.
            context: Template variables.

        Returns:
            Rendered prompt string.

        Raises:
            KeyError: If the prompt or version does not exist.
        """
        v = version if version is not None else self.latest_version(name)
        available = self.versions(name)
        if v not in available:
            raise KeyError(
                f"Prompt '{name}' version {v} not found. Available: {available}"
            )
        template = self._env.get_template(f"{name}.v{v}.j2")
        return template.render(**(context or {}))


# Singleton used by the convenience helpers below.
registry = PromptRegistry()


def render_prompt(
    name: str,
    version: int | None = None,
    context: dict | None = None,
) -> str:
    """Render a versioned prompt template.

    Shorthand for ``registry.render(name, version, context)``.
    """
    return registry.render(name, version=version, context=context)
