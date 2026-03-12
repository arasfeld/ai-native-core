"""Weather and reverse-geocoding tools using free, key-less APIs.

- Open-Meteo  (https://open-meteo.com)          — weather data, no API key
- OSM Nominatim (https://nominatim.openstreetmap.org) — reverse geocoding, no API key
"""

from __future__ import annotations

import httpx
import structlog
from langchain_core.tools import BaseTool
from pydantic import BaseModel, Field

log = structlog.get_logger()

# ---------------------------------------------------------------------------
# WMO Weather Interpretation Codes → human-readable labels
# https://open-meteo.com/en/docs#weathervariables
# ---------------------------------------------------------------------------
_WMO: dict[int, str] = {
    0: "clear sky",
    1: "mainly clear", 2: "partly cloudy", 3: "overcast",
    45: "fog", 48: "depositing rime fog",
    51: "light drizzle", 53: "moderate drizzle", 55: "dense drizzle",
    61: "slight rain", 63: "moderate rain", 65: "heavy rain",
    71: "slight snow", 73: "moderate snow", 75: "heavy snow",
    77: "snow grains",
    80: "slight rain showers", 81: "moderate rain showers", 82: "violent rain showers",
    85: "snow showers", 86: "heavy snow showers",
    95: "thunderstorm", 96: "thunderstorm with slight hail", 99: "thunderstorm with heavy hail",
}


def _describe(code: int) -> str:
    return _WMO.get(code, f"weather code {code}")


# ---------------------------------------------------------------------------
# Reverse-geocoding tool
# ---------------------------------------------------------------------------


class ReverseGeocodeInput(BaseModel):
    lat: float = Field(description="Latitude in decimal degrees.")
    lng: float = Field(description="Longitude in decimal degrees.")


class ReverseGeocodeTool(BaseTool):
    """Convert coordinates to a human-readable place name using OSM Nominatim."""

    name: str = "reverse_geocode"
    description: str = (
        "Convert a latitude/longitude coordinate pair into a human-readable place name "
        "(city, region, country).  Use this before calling get_weather so you can tell "
        "the user where the weather data is for."
    )
    args_schema: type[BaseModel] = ReverseGeocodeInput

    def _run(self, lat: float, lng: float) -> str:
        raise NotImplementedError("Use async version")

    async def _arun(self, lat: float, lng: float) -> str:
        return await reverse_geocode(lat, lng)


# ---------------------------------------------------------------------------
# Weather tool
# ---------------------------------------------------------------------------


class WeatherInput(BaseModel):
    lat: float = Field(description="Latitude in decimal degrees.")
    lng: float = Field(description="Longitude in decimal degrees.")


class WeatherTool(BaseTool):
    """Get current weather conditions and a 3-day forecast for any coordinates."""

    name: str = "get_weather"
    description: str = (
        "Get the current weather conditions and 3-day forecast for a given location. "
        "Provide latitude and longitude. Returns temperature, conditions, wind speed, "
        "humidity, and daily highs/lows."
    )
    args_schema: type[BaseModel] = WeatherInput

    def _run(self, lat: float, lng: float) -> str:
        raise NotImplementedError("Use async version")

    async def _arun(self, lat: float, lng: float) -> str:
        return await get_weather(lat, lng)


# ---------------------------------------------------------------------------
# Standalone async helpers (usable outside LangGraph)
# ---------------------------------------------------------------------------


async def reverse_geocode(lat: float, lng: float) -> str:
    """Return a human-readable place name for the given coordinates."""
    url = "https://nominatim.openstreetmap.org/reverse"
    params = {"lat": lat, "lon": lng, "format": "json"}
    headers = {"User-Agent": "ai-native-core/1.0 (github.com/arasfeld/ai-native-core)"}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(url, params=params, headers=headers)
            r.raise_for_status()
            data = r.json()
            addr = data.get("address", {})
            parts = [
                addr.get("city") or addr.get("town") or addr.get("village"),
                addr.get("state"),
                addr.get("country"),
            ]
            return ", ".join(p for p in parts if p) or data.get("display_name", f"{lat}, {lng}")
    except Exception as exc:
        log.warning("tools.reverse_geocode.error", error=str(exc))
        return f"{lat:.4f}, {lng:.4f}"


async def get_weather(lat: float, lng: float) -> str:
    """Return a formatted weather summary for the given coordinates."""
    url = "https://api.open-meteo.com/v1/forecast"
    params = {
        "latitude": lat,
        "longitude": lng,
        "current": "temperature_2m,weathercode,windspeed_10m,relative_humidity_2m",
        "daily": "temperature_2m_max,temperature_2m_min,weathercode",
        "timezone": "auto",
        "forecast_days": 3,
        "temperature_unit": "celsius",
        "windspeed_unit": "kmh",
    }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(url, params=params)
            r.raise_for_status()
            data = r.json()

        cur = data["current"]
        temp = cur["temperature_2m"]
        code = cur["weathercode"]
        wind = cur["windspeed_10m"]
        humidity = cur["relative_humidity_2m"]
        units = data.get("current_units", {})
        t_unit = units.get("temperature_2m", "°C")

        current_summary = (
            f"{_describe(code).capitalize()}, {temp}{t_unit}, "
            f"wind {wind} km/h, humidity {humidity}%"
        )

        daily = data["daily"]
        forecast_lines: list[str] = []
        for i, date in enumerate(daily["time"]):
            hi = daily["temperature_2m_max"][i]
            lo = daily["temperature_2m_min"][i]
            day_code = daily["weathercode"][i]
            forecast_lines.append(f"  {date}: {_describe(day_code)}, {lo}–{hi}{t_unit}")

        return f"Current: {current_summary}\nForecast:\n" + "\n".join(forecast_lines)

    except Exception as exc:
        log.warning("tools.get_weather.error", error=str(exc))
        return f"Weather data unavailable: {exc}"
