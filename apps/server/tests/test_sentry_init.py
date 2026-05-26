"""Sentry initialization is gated by SENTRY_DSN being set."""

from __future__ import annotations

import importlib
from unittest.mock import patch


def test_sentry_init_skipped_when_dsn_empty():
    """When sentry_dsn is "", sentry_sdk.init must not be called."""
    with patch("sentry_sdk.init") as mock_init:
        import api.config as config

        config.settings.sentry_dsn = ""
        importlib.reload(importlib.import_module("api.main"))
    assert mock_init.call_count == 0


def test_sentry_init_called_when_dsn_present():
    """When sentry_dsn is set, sentry_sdk.init must be called with our settings."""
    import api.config as config

    original_dsn = config.settings.sentry_dsn
    config.settings.sentry_dsn = "https://public@sentry.example.com/1"
    try:
        with patch("sentry_sdk.init") as mock_init:
            importlib.reload(importlib.import_module("api.main"))
        assert mock_init.call_count == 1
        kwargs = mock_init.call_args.kwargs
        assert kwargs["dsn"] == "https://public@sentry.example.com/1"
        assert kwargs["send_default_pii"] is False
        assert kwargs["environment"] == config.settings.sentry_environment
        assert kwargs["traces_sample_rate"] == config.settings.sentry_traces_sample_rate
    finally:
        config.settings.sentry_dsn = original_dsn
        importlib.reload(importlib.import_module("api.main"))
