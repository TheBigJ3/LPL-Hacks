from __future__ import annotations

import os

import pytest

from rapid_analysis import engine as engine_module

_ENGINE_STATE = ("_engine", "_load_attempted", "_load_error", "_load_seconds", "_device", "_factory")


@pytest.fixture
def isolated_engine(monkeypatch):
    """Blank engine state for this test; the real loaded engine is restored afterwards.

    Clears DECISION_BACKEND so tests that inject a fake engine run the same under `-m "not model"`
    with DECISION_BACKEND=none set for the whole run.
    """
    monkeypatch.delenv("DECISION_BACKEND", raising=False)
    for name in _ENGINE_STATE:
        monkeypatch.setattr(engine_module, name, getattr(engine_module, name))
    monkeypatch.setattr(engine_module, "_engine", None)
    monkeypatch.setattr(engine_module, "_load_attempted", False)
    monkeypatch.setattr(engine_module, "_load_error", None)
    monkeypatch.setattr(engine_module, "_factory", None)
    return monkeypatch


@pytest.fixture
def backend_none(isolated_engine):
    isolated_engine.setenv("DECISION_BACKEND", "none")
    return isolated_engine


@pytest.fixture(scope="session")
def loaded_engine():
    if os.environ.get("DECISION_BACKEND", "opendecision").lower() == "none":
        pytest.skip("DECISION_BACKEND=none")
    engine = engine_module.engine_load()
    if engine is None:
        pytest.fail(f"OpenDecision failed to load: {engine_module.engine_info()['load_error']}")
    return engine
