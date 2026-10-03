from __future__ import annotations

import time

import pytest
from fastapi.testclient import TestClient

from rapid_analysis import api as api_module
from rapid_analysis import engine as engine_module
from rapid_analysis.evidence import memo_clear
from tests.support.fixtures import FIXTURE_IDS, fixture_household_documents, fixture_household_raw, fixture_overview_request
from rapid_analysis.overview import overview_build

def _ms(fn, repeat=1):
    best = float("inf")
    for _ in range(repeat):
        started = time.perf_counter()
        fn()
        best = min(best, (time.perf_counter() - started) * 1000)
    return best


@pytest.fixture
def client():
    with TestClient(api_module.app) as c:
        yield c


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
    assert ms < 500, f"{ms:.0f} ms"


@pytest.mark.model
def test_repeat_overview_request_under_50ms(loaded_engine, client):
    """Stateless, but a repeated household is served from the model memo: no model work the second time."""
    body = fixture_overview_request("HH001")
    client.post("/v1/overview", json=body)
    ms = _ms(lambda: client.post("/v1/overview", json=body), repeat=5)
    assert ms < 50, f"{ms:.1f} ms"


def test_backend_none_overview_request_under_50ms(backend_none):
    body = fixture_overview_request("HH006")
    with TestClient(api_module.app) as client:
        client.post("/v1/overview", json=body)
        ms = _ms(lambda: client.post("/v1/overview", json=body), repeat=5)
    assert ms < 50, f"{ms:.1f} ms"


def test_backend_none_all_fixtures_under_100ms(backend_none):
    inputs = [(fixture_household_raw(h), fixture_household_documents(h)) for h in FIXTURE_IDS]
    overview_build(*inputs[0])

    def all_ten():
        for raw, documents in inputs:
            overview_build(raw, documents)

    ms = _ms(all_ten, repeat=3)
    assert ms < 100, f"{ms:.0f} ms"


@pytest.mark.model
def test_engine_not_reinitialized_across_20_requests(loaded_engine, client, monkeypatch):
    constructed = []
    monkeypatch.setattr(engine_module, "_factory", lambda: constructed.append(1) or object())
    before = id(engine_module.engine_get())
    for index in range(20):
        response = client.post("/v1/overview", json=fixture_overview_request(FIXTURE_IDS[index % len(FIXTURE_IDS)]))
        assert response.status_code == 200
    assert constructed == []
    assert id(engine_module.engine_get()) == before == id(loaded_engine)
