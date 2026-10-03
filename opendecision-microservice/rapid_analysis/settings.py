"""Every environment variable the service reads, in one place.

Read on each call (not cached at import) so tests and operators can change them without a reimport.
"""

from __future__ import annotations

import os


def decision_backend() -> str:
    """`opendecision` (default) or `none`: none turns the model off and every check is not_checked."""
    return os.environ.get("DECISION_BACKEND", "opendecision").strip().lower()


def decision_timeout_seconds() -> float:
    """Per model call; a timeout is treated as the model being unavailable."""
    return float(os.environ.get("DECISION_TIMEOUT_SECONDS", "30"))


def low_confidence_threshold() -> float:
    """Textract confidence (0-1) below this is listed in data_quality.low_confidence_fields."""
    return float(os.environ.get("LOW_CONFIDENCE_THRESHOLD", "0.90"))


def max_body_bytes() -> int:
    """Largest request body accepted. A household with its Textract responses is usually well under 5 MB."""
    return int(os.environ.get("ANALYSIS_MAX_BODY_BYTES", str(20 * 1024 * 1024)))


def sagemaker_mode() -> bool:
    """Set by the `serve` script SageMaker starts the container with: turns on /ping and /invocations."""
    return os.environ.get("SAGEMAKER_MODE", "").strip().lower() in ("1", "true", "yes")


def service_token() -> str | None:
    """Shared secret the backend sends as `Authorization: Bearer <token>`. Unset: /v1 is open (local dev only)."""
    return os.environ.get("ANALYSIS_SERVICE_TOKEN", "").strip() or None
