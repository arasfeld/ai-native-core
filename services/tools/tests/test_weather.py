"""Unit tests for weather and reverse-geocoding tools using respx HTTP mocks."""

import httpx
import pytest
import respx

from tools.weather import get_weather, reverse_geocode

NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse"
OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"


# ---------------------------------------------------------------------------
# reverse_geocode
# ---------------------------------------------------------------------------


@respx.mock
async def test_reverse_geocode_returns_city():
    respx.get(NOMINATIM_URL).mock(
        return_value=httpx.Response(
            200,
            json={
                "address": {
                    "city": "Hamilton",
                    "county": "Butler County",
                    "state": "Ohio",
                    "country": "United States",
                },
                "display_name": "Hamilton, Butler County, Ohio, United States",
            },
        )
    )
    result = await reverse_geocode(39.399, -84.561)
    assert "Hamilton" in result
    assert "Ohio" in result


@respx.mock
async def test_reverse_geocode_falls_back_to_township():
    """When no city/town/village, township should be used."""
    respx.get(NOMINATIM_URL).mock(
        return_value=httpx.Response(
            200,
            json={
                "address": {
                    "township": "West Chester Township",
                    "county": "Butler County",
                    "state": "Ohio",
                    "country": "United States",
                },
                "display_name": "West Chester Township, Butler County, Ohio, United States",
            },
        )
    )
    result = await reverse_geocode(39.302, -84.387)
    assert "West Chester Township" in result
    assert "Butler County" in result


@respx.mock
async def test_reverse_geocode_falls_back_to_municipality():
    respx.get(NOMINATIM_URL).mock(
        return_value=httpx.Response(
            200,
            json={
                "address": {
                    "municipality": "Fairfield",
                    "state": "Ohio",
                    "country": "United States",
                },
                "display_name": "Fairfield, Ohio, United States",
            },
        )
    )
    result = await reverse_geocode(39.35, -84.56)
    assert "Fairfield" in result


@respx.mock
async def test_reverse_geocode_falls_back_to_coords_on_error():
    respx.get(NOMINATIM_URL).mock(side_effect=httpx.ConnectError("timeout"))
    result = await reverse_geocode(39.302, -84.387)
    # Should fall back gracefully — not raise
    assert "39." in result or "84." in result


# ---------------------------------------------------------------------------
# get_weather
# ---------------------------------------------------------------------------

_WEATHER_RESPONSE = {
    "current": {
        "temperature_2m": 18.5,
        "weathercode": 2,
        "windspeed_10m": 14.0,
        "relative_humidity_2m": 61,
    },
    "current_units": {"temperature_2m": "°C"},
    "daily": {
        "time": ["2026-03-15", "2026-03-16", "2026-03-17"],
        "temperature_2m_max": [21.0, 19.0, 17.0],
        "temperature_2m_min": [12.0, 10.0, 9.0],
        "weathercode": [2, 3, 61],
    },
}


@respx.mock
async def test_get_weather_returns_summary():
    respx.get(OPEN_METEO_URL).mock(
        return_value=httpx.Response(200, json=_WEATHER_RESPONSE)
    )
    result = await get_weather(39.302, -84.387)
    assert "18.5" in result
    assert "°C" in result
    assert "Forecast" in result


@respx.mock
async def test_get_weather_includes_forecast_days():
    respx.get(OPEN_METEO_URL).mock(
        return_value=httpx.Response(200, json=_WEATHER_RESPONSE)
    )
    result = await get_weather(39.302, -84.387)
    assert "2026-03-15" in result
    assert "2026-03-16" in result


@respx.mock
async def test_get_weather_graceful_on_error():
    respx.get(OPEN_METEO_URL).mock(side_effect=httpx.ConnectError("timeout"))
    result = await get_weather(39.302, -84.387)
    assert "unavailable" in result.lower()
