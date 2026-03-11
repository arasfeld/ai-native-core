"""Structured logging configuration for the ARQ worker."""

from __future__ import annotations

import logging

import structlog


def configure_logging(json_logs: bool = False, log_level: str = "INFO") -> None:
    """Configure structlog with shared processors.

    Args:
        json_logs: Emit JSON lines (suitable for log aggregators). Defaults to
            console output with colours for local development.
        log_level: Minimum log level (DEBUG / INFO / WARNING / ERROR).
    """
    level = getattr(logging, log_level.upper(), logging.INFO)

    shared_processors: list[structlog.types.Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
    ]

    if json_logs:
        processors: list[structlog.types.Processor] = [
            *shared_processors,
            structlog.processors.ExceptionRenderer(),
            structlog.processors.JSONRenderer(),
        ]
    else:
        processors = [
            *shared_processors,
            structlog.dev.ConsoleRenderer(),
        ]

    structlog.configure(
        processors=processors,
        wrapper_class=structlog.make_filtering_bound_logger(level),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )

    logging.basicConfig(
        format="%(message)s",
        level=level,
        handlers=[logging.StreamHandler()],
        force=True,
    )
