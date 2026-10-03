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
