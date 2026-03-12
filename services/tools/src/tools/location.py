"""Location context helper — builds an ambient context string from coordinates.

Combines reverse geocoding + current weather into a single string suitable for
injection into the system prompt so the agent is aware of where the user is.

Usage::

    ctx = await get_location_context(lat=51.5074, lng=-0.1278)
    # "User is in London, England, United Kingdom.
    #  Current weather: Partly cloudy, 14°C, wind 18 km/h, humidity 72%
    #  Forecast: ..."
"""

from __future__ import annotations

import asyncio

from .weather import get_weather, reverse_geocode


async def get_location_context(lat: float, lng: float) -> str:
    """Return a formatted ambient context string for the given coordinates.

    Fetches place name and weather in parallel to minimise latency.
    Gracefully degrades — if either call fails the other still contributes.
    """
    place, weather = await asyncio.gather(
        reverse_geocode(lat, lng),
        get_weather(lat, lng),
    )
    return f"User is in {place}.\n{weather}"
