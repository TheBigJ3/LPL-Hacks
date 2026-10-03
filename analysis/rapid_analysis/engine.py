"""Process-wide OpenDecision engine: loaded once, every call serialized behind one lock.

The model is never on the critical path. If DECISION_BACKEND=none, loading fails,
or a call times out, callers get None and must fall back to `not_checked`.
"""

from __future__ import annotations

import logging
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeout
from typing import Any, Callable, TypeVar

log = logging.getLogger("rapid_analysis.engine")

T = TypeVar("T")

_engine: Any = None
_load_attempted = False
_load_error: str | None = None
_load_seconds: float | None = None
_device: str = "none"
_load_guard = threading.Lock()
# The HF pipeline is not thread-safe: every model call goes through this lock.
_call_lock = threading.Lock()
_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="opendecision")
_factory: Callable[[], Any] | None = None


class ValidatorUnavailable(Exception):
    """Raised when the engine cannot answer (off, failed to load, timed out, raised)."""


def backend_name() -> str:
    return os.environ.get("DECISION_BACKEND", "opendecision").strip().lower()


def call_timeout_seconds() -> float:
    return float(os.environ.get("DECISION_TIMEOUT_SECONDS", "30"))


def _detect_device() -> str:
    import torch

    if torch.cuda.is_available():
        return "cuda"
    if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def _default_factory() -> Any:
    from opendecision import OpenDecisionEngine

    return OpenDecisionEngine()


def engine_set_factory(factory: Callable[[], Any] | None) -> None:
    """Test hook: replace how the engine is constructed, and forget any loaded engine."""
    global _factory
    _factory = factory
    engine_reset()


def engine_reset() -> None:
    global _engine, _load_attempted, _load_error, _load_seconds, _device
    with _load_guard:
        _engine = None
        _load_attempted = False
        _load_error = None
        _load_seconds = None
        _device = "none"


def engine_load() -> Any:
    """Load the engine once per process. Safe to call repeatedly; never raises."""
    global _engine, _load_attempted, _load_error, _load_seconds, _device
    if _load_attempted:
        return _engine
    with _load_guard:
        if _load_attempted:
            return _engine
        _load_attempted = True
        if backend_name() == "none":
            return None
        started = time.perf_counter()
        try:
            _engine = (_factory or _default_factory)()
            _device = _detect_device() if _factory is None else "test"
        except Exception as err:  # load failure must never take the service down
            _engine = None
            _load_error = f"{type(err).__name__}: {err}"
            log.warning("OpenDecision engine failed to load: %s", _load_error)
        _load_seconds = time.perf_counter() - started
        return _engine


def engine_get() -> Any:
    if backend_name() == "none":
        return None
    return engine_load()


def engine_info() -> dict[str, Any]:
    return {
        "model_loaded": _engine is not None and backend_name() != "none",
        "device": _device if _engine is not None else "none",
        "load_seconds": _load_seconds,
        "load_error": _load_error,
    }


def engine_call(fn: Callable[[Any], T]) -> T:
    """Run fn(engine) under the call lock with a timeout. Raises ValidatorUnavailable."""
    engine = engine_get()
    if engine is None:
        raise ValidatorUnavailable("engine not loaded")

    def locked() -> T:
        with _call_lock:
            return fn(engine)

    future = _executor.submit(locked)
    try:
        return future.result(timeout=call_timeout_seconds())
    except FutureTimeout as err:
        raise ValidatorUnavailable("engine call timed out") from err
    except ValidatorUnavailable:
        raise
    except Exception as err:
        raise ValidatorUnavailable(f"engine call failed: {type(err).__name__}") from err
