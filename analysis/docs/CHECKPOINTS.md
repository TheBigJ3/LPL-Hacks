# Checkpoints

Appended by `scripts/checkpoint.py`. One row per checkpoint run; never edited by hand.

| Date | Phase | Command | Passed | Failed | XFailed | XPassed | Skipped | Notes |
|---|---|---|---|---|---|---|---|---|
| 2026-10-02T19:22:23-07:00 | Phase 0 | `pytest -q tests/test_smoke.py` | 6 | 0 | 0 | 0 | 0 | torch 2.14.1+cu130, RTX 4070 SUPER device=cuda, load_seconds=6.13, warm_latency_ms=56.9 |
| 2026-10-02T19:26:21-07:00 | Phase 1 | `pytest -q tests` | 62 | 0 | 0 | 0 | 0 | normalization + 10 fixtures; cumulative suite |
| 2026-10-02T19:30:49-07:00 | Phase 2 | `pytest -q tests` | 80 | 0 | 0 | 0 | 0 | Textract Blocks ingestion incl. real backend 1099-R log; cumulative suite |
