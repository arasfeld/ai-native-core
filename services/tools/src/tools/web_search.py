import os

from langchain_core.tools import BaseTool
from pydantic import BaseModel, Field


class WebSearchInput(BaseModel):
    query: str = Field(description="The search query to look up on the web.")


class WebSearchTool(BaseTool):
    """Search the web using Tavily API."""

    name: str = "web_search"
    description: str = (
        "Search the web for current information. Use this when you need up-to-date "
        "facts, news, or information not available in your training data."
    )
    args_schema: type[BaseModel] = WebSearchInput

    def _run(self, query: str) -> str:
        raise NotImplementedError("Use async version")

    async def _arun(self, query: str) -> str:
        api_key = os.environ.get("TAVILY_API_KEY")
        if not api_key:
            return "Error: TAVILY_API_KEY not set. Cannot perform web search."

        import httpx

        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(
                    "https://api.tavily.com/search",
                    json={"api_key": api_key, "query": query, "max_results": 5},
                    timeout=15,
                )
                response.raise_for_status()
                data = response.json()
                results = data.get("results", [])
                if not results:
                    return f"No results found for: {query}"
                return "\n\n".join(
                    f"**{r['title']}**\n{r['content']}\nSource: {r['url']}" for r in results[:3]
                )
            except Exception as e:
                return f"Search error: {e}"
