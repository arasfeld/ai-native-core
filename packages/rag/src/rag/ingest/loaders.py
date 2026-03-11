"""Simple document loaders for ingestion."""

from pathlib import Path


def load_text(path: str | Path) -> str:
    """Load a plain text file."""
    return Path(path).read_text(encoding="utf-8")


def load_markdown(path: str | Path) -> str:
    """Load a markdown file (returns raw text; strip frontmatter if needed)."""
    content = Path(path).read_text(encoding="utf-8")
    # Strip YAML frontmatter if present
    if content.startswith("---"):
        end = content.find("---", 3)
        if end != -1:
            content = content[end + 3 :].lstrip()
    return content


async def load_url(url: str) -> str:
    """Fetch and return the text content of a URL."""
    import httpx

    async with httpx.AsyncClient() as client:
        response = await client.get(url, follow_redirects=True, timeout=30)
        response.raise_for_status()
        return response.text
