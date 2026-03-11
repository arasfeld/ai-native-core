from langchain_core.tools import BaseTool


class ToolRegistry:
    """Registry for LangGraph-compatible tools."""

    def __init__(self) -> None:
        self._tools: dict[str, BaseTool] = {}

    def register(self, tool: BaseTool) -> None:
        self._tools[tool.name] = tool

    def get(self, name: str) -> BaseTool | None:
        return self._tools.get(name)

    def get_all(self) -> list[BaseTool]:
        return list(self._tools.values())

    def get_names(self) -> list[str]:
        return list(self._tools.keys())


# Global registry — import and register tools at app startup
registry = ToolRegistry()
