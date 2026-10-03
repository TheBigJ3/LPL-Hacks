"""OpenDecision smoke test: load once, run one choice, report device / load time / warm latency.

Usage (from analysis/):  .venv/Scripts/python scripts/smoke.py
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from rapid_analysis.engine import engine_call, engine_info, engine_load  # noqa: E402

SMOKE_STATE = "The customer was charged twice."
SMOKE_INSTRUCTIONS = "Which team should handle this?"
SMOKE_CRITERIA = {
    "billing": "Payment, invoice, or duplicate charge issue",
    "technical": "Software or technical problem",
    "sales": "New purchase or pricing request",
}


def smoke_run() -> dict:
    engine_load()
    info = engine_info()
    if not info["model_loaded"]:
        return {"ok": False, **info}

    def choose(engine):
        return engine.choice(state=SMOKE_STATE, instructions=SMOKE_INSTRUCTIONS, criteria=SMOKE_CRITERIA)

    started = time.perf_counter()
    first = engine_call(choose)
    first_ms = (time.perf_counter() - started) * 1000
    started = time.perf_counter()
    warm = engine_call(choose)
    warm_ms = (time.perf_counter() - started) * 1000
    return {
        "ok": first["choice"] == "billing" and warm["choice"] == "billing",
        "choice": warm["choice"],
        "device": info["device"],
        "load_seconds": round(info["load_seconds"], 2),
        "first_call_ms": round(first_ms, 1),
        "warm_latency_ms": round(warm_ms, 1),
    }


if __name__ == "__main__":
    result = smoke_run()
    print(json.dumps(result, indent=2))
    sys.exit(0 if result["ok"] else 1)
