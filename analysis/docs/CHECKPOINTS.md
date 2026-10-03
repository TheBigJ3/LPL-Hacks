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
| 2026-10-02T20:12:42-07:00 | CHECKPOINT 4 (re-run, 2026 limit) | `pytest -q tests/test_rules.py tests/test_checklist.py` | 81 | 0 | 0 | 0 | 0 | LIMIT_401K adds 2026: 24500 (IRS Notice 2025-67); HH010 unchanged: not_assessed (no wages) |
| 2026-10-02T20:18:47-07:00 | CHECKPOINT 3 (re-run, demo docs) | `pytest -q tests/test_evidence.py tests/test_textract.py` | 80 | 0 | 2 | 0 | 0 | +15 synthetic Textract docs for HH002/HH005/HH007/HH008 incl. 1098 and 1095; battery 50 claims, 0 false confirmations; Quinn 8,080 vs 8,800 fails safe to unconfirmed (not mismatch) |
| 2026-10-02T20:19:08-07:00 | CHECKPOINT 5 (re-run, demo docs) | `pytest -q tests/test_overview.py` | 84 | 0 | 0 | 0 | 0 | samples regenerated; every sourced number with a document is checked for all 10 households |
| 2026-10-02T20:19:28-07:00 | Demo coverage (full suite) | `pytest -q tests` | 386 | 0 | 2 | 0 | 0 | after demo docs; gate on 8100 |
| 2026-10-02T20:25:59-07:00 | Taxonomy ids + schema 1.1 (no model) | `pytest -q tests -m not model` | 287 | 0 | 0 | 0 | 0 | no-model suite |
| 2026-10-02T20:26:15-07:00 | Taxonomy ids + schema 1.1 | `pytest -q tests` | 410 | 0 | 2 | 0 | 0 | tags.json ids adopted, schema 1.1, samples + openapi regenerated, CONTRACT 1.0->1.1 mapping; test_tags asserts every emitted id is in tags.json. Logged before amendment section 3. |
| 2026-10-02T20:36:20-07:00 | CHECKPOINT P1+ | `pytest -q tests` | 429 | 0 | 2 | 0 | 0 | section 1: config/tags.json is the tag file, full content in /api/meta/enums.tags; section 2: idempotent normalize, FieldValue + conflict pass-through, confidence rescaled once, unknown fields warned and ignored |
