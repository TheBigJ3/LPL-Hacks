# Checkpoints

Appended by `scripts/checkpoint.py`. One row per checkpoint run; never edited by hand.

| Date | Phase | Command | Passed | Failed | XFailed | XPassed | Skipped | Notes |
|---|---|---|---|---|---|---|---|---|
| 2026-10-02T19:22:23-07:00 | Phase 0 | `pytest -q tests/test_smoke.py` | 6 | 0 | 0 | 0 | 0 | torch 2.14.1+cu130, RTX 4070 SUPER device=cuda, load_seconds=6.13, warm_latency_ms=56.9 |
| 2026-10-02T19:26:21-07:00 | Phase 1 | `pytest -q tests` | 62 | 0 | 0 | 0 | 0 | normalization + 10 fixtures; cumulative suite |
| 2026-10-02T19:30:49-07:00 | Phase 2 | `pytest -q tests` | 80 | 0 | 0 | 0 | 0 | Textract Blocks ingestion incl. real backend 1099-R log; cumulative suite |
| 2026-10-02T19:35:33-07:00 | Phase 3 | `pytest -q tests` | 130 | 0 | 2 | 0 | 0 | evidence checker: 38-claim battery 0 false confirmations; 2 strict xfails (raw LINE order, household noul) |
| 2026-10-02T19:39:03-07:00 | Phase 4 | `pytest -q tests` | 209 | 0 | 2 | 0 | 0 | rules v2025.1: section 6 table exact for all 10 fixtures; cumulative suite |
| 2026-10-02T19:43:58-07:00 | Phase 5 | `pytest -q tests` | 294 | 0 | 2 | 0 | 0 | overview builder + pydantic contract; 10 samples written with model on; 1040 wages claim uses its line 1a wording |
| 2026-10-02T19:48:48-07:00 | Phase 6 | `pytest -q tests` | 366 | 0 | 2 | 0 | 0 | FastAPI endpoints + overview cache by (household, ruleset, data hash); 16 bad-input shapes, NaN/Infinity, malformed JSON all 422; model failure renders |
| 2026-10-02T19:50:25-07:00 | Phase 7 | `pytest -q tests` | 370 | 0 | 2 | 0 | 0 | full suite, model on (cuda) device=cuda, load_seconds=6.66, warm_latency_ms=51.6 warm_overview_hh001_ms=62.7, cached_get_hh001_ms=0.7, backend_none_10_fixtures_ms=5.3 |
| 2026-10-02T19:50:58-07:00 | Phase 7 | `pytest -q tests` | 370 | 0 | 2 | 0 | 0 | full suite after conftest fix, model on (cuda) device=cuda, load_seconds=6.52, warm_latency_ms=50.4 warm_overview_hh001_ms=62.4, cached_get_hh001_ms=1.1, backend_none_10_fixtures_ms=2.9 |
| 2026-10-02T19:51:18-07:00 | Phase 7 (no model) | `pytest -q tests -m not model` | 256 | 0 | 0 | 0 | 0 | DECISION_BACKEND=none for the whole run |
| 2026-10-02T20:07:34-07:00 | Phase 8a | `pytest -q tests` | 373 | 0 | 2 | 0 | 0 | handoff: openapi.json drift test, enums-in-contract test; scripts/gate.py live server+seed+GET HH006 == sample: True |
| 2026-10-02T20:12:16-07:00 | Port 8100 | `pytest -q tests` | 373 | 0 | 2 | 0 | 0 | service default port 8000 -> 8100; gate.py on 8100: HH006 equals sample |
