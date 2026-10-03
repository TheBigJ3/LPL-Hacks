from __future__ import annotations

import pytest

from rapid_analysis import engine as engine_module
from tests.tools.smoke import smoke_run


@pytest.mark.model
def test_smoke_choice_returns_billing(loaded_engine):
    result = smoke_run()
    assert result["ok"], result
    assert result["choice"] == "billing"
    assert result["device"] in {"cpu", "cuda", "mps"}


@pytest.mark.model
def test_engine_loads_once_and_is_reused(loaded_engine):
    first = engine_module.engine_get()
    second = engine_module.engine_get()
    assert id(first) == id(second) == id(loaded_engine)
    assert id(engine_module.engine_load()) == id(loaded_engine)


def test_backend_none_never_loads(backend_none):
    assert engine_module.engine_get() is None
    assert engine_module.engine_info()["model_loaded"] is False
    with pytest.raises(engine_module.ValidatorUnavailable):
        engine_module.engine_call(lambda engine: engine)


def test_load_failure_is_contained(isolated_engine):
    def boom():
        raise RuntimeError("no weights")

    isolated_engine.setattr(engine_module, "_factory", boom)
    assert engine_module.engine_load() is None
    assert "no weights" in engine_module.engine_info()["load_error"]
    with pytest.raises(engine_module.ValidatorUnavailable):
        engine_module.engine_call(lambda engine: engine)


def test_factory_called_once(isolated_engine):
    calls = []

    def factory():
        calls.append(1)
        return object()

    isolated_engine.setattr(engine_module, "_factory", factory)
    assert engine_module.engine_load() is engine_module.engine_load()
    assert len(calls) == 1


def test_engine_call_wraps_errors(isolated_engine):
    isolated_engine.setattr(engine_module, "_factory", object)

    def explode(engine):
        raise RuntimeError("cuda oom")

    with pytest.raises(engine_module.ValidatorUnavailable):
        engine_module.engine_call(explode)
