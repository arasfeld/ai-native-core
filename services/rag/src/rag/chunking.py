def chunk_text(
    text: str,
    chunk_size: int = 1000,
    overlap: int = 200,
) -> list[str]:
    """Split text into overlapping chunks for embedding.

    Uses a simple character-based splitter. For production, consider
    using RecursiveCharacterTextSplitter from langchain_text_splitters.
    """
    if not text:
        return []

    chunks: list[str] = []
    start = 0

    while start < len(text):
        end = start + chunk_size
        chunk = text[start:end]

        # Try to break at a paragraph or sentence boundary
        if end < len(text):
            for sep in ["\n\n", "\n", ". ", " "]:
                last_sep = chunk.rfind(sep)
                if last_sep > chunk_size // 2:
                    chunk = chunk[: last_sep + len(sep)]
                    break

        chunks.append(chunk.strip())
        start = start + len(chunk) - overlap

    return [c for c in chunks if c]
