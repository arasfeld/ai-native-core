"""Nearby points-of-interest tool using the Overpass API (OpenStreetMap).

Free, no API key required.
"""

from __future__ import annotations

import httpx
import structlog
from langchain_core.tools import BaseTool
from pydantic import BaseModel, Field

log = structlog.get_logger()

_OVERPASS_URL = "https://overpass-api.de/api/interpreter"

# Map friendly category names → OSM amenity/shop/etc. tags
_CATEGORY_MAP: dict[str, str] = {
    "restaurant": '["amenity"="restaurant"]',
    "cafe": '["amenity"="cafe"]',
    "bar": '["amenity"="bar"]',
    "fast food": '["amenity"="fast_food"]',
    "pharmacy": '["amenity"="pharmacy"]',
    "hospital": '["amenity"="hospital"]',
    "clinic": '["amenity"="clinic"]',
    "doctor": '["amenity"="doctors"]',
    "supermarket": '["shop"="supermarket"]',
    "grocery": '["shop"="convenience"]',
    "atm": '["amenity"="atm"]',
    "bank": '["amenity"="bank"]',
    "hotel": '["tourism"="hotel"]',
    "parking": '["amenity"="parking"]',
    "gas station": '["amenity"="fuel"]',
    "park": '["leisure"="park"]',
    "gym": '["leisure"="fitness_centre"]',
}


class NearbyPOIInput(BaseModel):
    lat: float = Field(description="Latitude of the search origin.")
    lng: float = Field(description="Longitude of the search origin.")
    category: str = Field(
        description=(
            "Type of place to search for. Examples: restaurant, cafe, pharmacy, "
            "hospital, supermarket, atm, hotel, parking, park, gym, bar."
        )
    )
    radius_m: int = Field(
        default=1000,
        description="Search radius in metres (default 1000).",
    )


class NearbyPOITool(BaseTool):
    """Find nearby points of interest using OpenStreetMap / Overpass API."""

    name: str = "nearby_poi"
    description: str = (
        "Find nearby points of interest such as restaurants, pharmacies, hospitals, "
        "supermarkets, ATMs, hotels, parks, and more. Uses real OpenStreetMap data. "
        "Requires latitude, longitude, and a category. Returns up to 10 results with "
        "names and distances."
    )
    args_schema: type[BaseModel] = NearbyPOIInput

    def _run(self, lat: float, lng: float, category: str, radius_m: int = 1000) -> str:
        raise NotImplementedError("Use async version")

    async def _arun(
        self, lat: float, lng: float, category: str, radius_m: int = 1000
    ) -> str:
        return await nearby_poi(lat, lng, category, radius_m)


async def nearby_poi(
    lat: float,
    lng: float,
    category: str,
    radius_m: int = 1000,
    max_results: int = 10,
) -> str:
    """Return a formatted list of nearby POIs for the given coordinates."""
    key = category.lower().strip()
    tag_filter = _CATEGORY_MAP.get(key)
    if tag_filter is None:
        # Fall back to a generic name search
        tag_filter = f'["name"~"{category}",i]'

    query = f"""
[out:json][timeout:15];
(
  node{tag_filter}(around:{radius_m},{lat},{lng});
  way{tag_filter}(around:{radius_m},{lat},{lng});
);
out center {max_results};
""".strip()

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.post(_OVERPASS_URL, data={"data": query})
            r.raise_for_status()
            data = r.json()

        elements = data.get("elements", [])
        if not elements:
            return f"No {category} found within {radius_m}m."

        lines: list[str] = [f"Nearby {category} (within {radius_m}m):"]
        for el in elements[:max_results]:
            tags = el.get("tags", {})
            name = tags.get("name") or tags.get("brand") or "(unnamed)"
            address_parts = [
                tags.get("addr:housenumber", ""),
                tags.get("addr:street", ""),
                tags.get("addr:city", ""),
            ]
            address = " ".join(p for p in address_parts if p).strip() or ""
            opening = tags.get("opening_hours", "")
            detail = f"  - {name}"
            if address:
                detail += f" — {address}"
            if opening:
                detail += f" (Hours: {opening})"
            lines.append(detail)

        return "\n".join(lines)

    except Exception as exc:
        log.warning("tools.nearby_poi.error", error=str(exc))
        return f"Could not fetch nearby {category}: {exc}"
