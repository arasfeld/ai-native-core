import os

from langchain_core.tools import BaseTool
from pydantic import BaseModel, Field


class GenerateImageInput(BaseModel):
    prompt: str = Field(description="A detailed description of the image to generate.")
    size: str = Field(
        default="1024x1024",
        description="Image dimensions: '1024x1024', '1792x1024', or '1024x1792'.",
    )


class GenerateImageTool(BaseTool):
    """Generate an image from a text prompt using DALL-E."""

    name: str = "generate_image"
    description: str = (
        "Generate an image from a text description using DALL-E. "
        "Returns the URL of the generated image. "
        "Use this when the user asks you to create, draw, or generate an image."
    )
    args_schema: type[BaseModel] = GenerateImageInput

    def _run(self, prompt: str, size: str = "1024x1024") -> str:
        raise NotImplementedError("Use async version")

    async def _arun(self, prompt: str, size: str = "1024x1024") -> str:
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            return "Error: OPENAI_API_KEY not set. Cannot generate images."

        model = os.environ.get("OPENAI_IMAGE_MODEL", "dall-e-3")

        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=api_key)
        try:
            response = await client.images.generate(
                model=model,
                prompt=prompt,
                size=size,
                n=1,
            )
            url = response.data[0].url
            return f"Generated image URL: {url}"
        except Exception as e:
            return f"Image generation error: {e}"
