from __future__ import annotations

import json
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from rapid_analysis import api as api_module
from rapid_analysis import engine as engine_module
from rapid_analysis.evidence import memo_clear
from rapid_analysis.fixtures import FIXTURE_IDS, fixture_household_documents, fixture_household_raw
from rapid_analysis.overview import overview_build

METRICS = Path(__file__).resolve().parents[1] / "logs" / "perf_metrics.json"
_metrics: dict = {}


def _record(name, ms):
    _metrics[name] = round(ms, 1)
    METRICS.parent.mkdir(exist_ok=True)
    METRICS.write_text(json.dumps(_metrics))


def _ms(fn, repeat=1):
    best = float("inf")
    for _ in range(repeat):
        started = time.perf_counter()
        fn()
        best = min(best, (time.perf_counter() - started) * 1000)
    return best


@pytest.fixture
def seeded():
    api_module.STORE.clear()
    api_module.seed_fixtures()
    with TestClient(api_module.app) as client:
        yield client
    api_module.STORE.clear()


@pytest.mark.model
def test_warm_overview_hh001_under_500ms_on_gpu(loaded_engine):
    if engine_module.engine_info()["device"] != "cuda":
        pytest.skip("GPU budget; CPU hosts should run DECISION_BACKEND=none")
    raw, documents = fixture_household_raw("HH001"), fixture_household_documents("HH001")
    overview_build(raw, documents)  # warm the CUDA kernels

    def uncached():
        memo_clear()  # measure real model work, not the memo
        overview_build(raw, documents)

    ms = _ms(uncached, repeat=3)
    _record("warm_overview_hh001_ms", ms)
    assert ms < 500, f"{ms:.0f} ms"


@pytest.mark.model
def test_cached_get_under_20ms(loaded_engine, seeded):
    seeded.get("/api/households/HH001/overview")
    ms = _ms(lambda: seeded.get("/api/households/HH001/overview"), repeat=5)
    _record("cached_get_hh001_ms", ms)
    assert ms < 20, f"{ms:.1f} ms"


def test_backend_none_all_fixtures_under_100ms(backend_none):
    inputs = [(fixture_household_raw(h), fixture_household_documents(h)) for h in FIXTURE_IDS]
    overview_build(*inputs[0])

    def all_ten():
        for raw, documents in inputs:
            overview_build(raw, documents)

    ms = _ms(all_ten, repeat=3)
    _record("backend_none_10_fixtures_ms", ms)
    assert ms < 100, f"{ms:.0f} ms"


@pytest.mark.model
def test_engine_not_reinitialized_across_20_requests(loaded_engine, seeded, monkeypatch):
    constructed = []
    monkeypatch.setattr(engine_module, "_factory", lambda: constructed.append(1) or object())
    before = id(engine_module.engine_get())
    for index in range(20):
        household_id = FIXTURE_IDS[index % len(FIXTURE_IDS)]
        path = f"/api/households/{household_id}/refresh" if index % 2 else f"/api/households/{household_id}/overview"
        response = seeded.post(path) if index % 2 else seeded.get(path)
        assert response.status_code == 200
    assert constructed == []
    assert id(engine_module.engine_get()) == before == id(loaded_engine)
