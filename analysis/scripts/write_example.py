"""Write analysis/EXAMPLE_OUTPUT.json: one household (HH006) end to end, from real service output.

  .venv/Scripts/python scripts/write_example.py   (needs the model so checks are real)
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from fastapi.testclient import TestClient  # noqa: E402

from rapid_analysis import api as api_module  # noqa: E402
from rapid_analysis.engine import engine_info, engine_load  # noqa: E402

OUT = ROOT / "EXAMPLE_OUTPUT.json"


def main() -> int:
    engine_load()
    if not engine_info()["model_loaded"]:
        print("model not loaded", file=sys.stderr)
        return 1
    api_module.STORE.clear()
    api_module.seed_fixtures()
    with TestClient(api_module.app) as client:
        example = {
            "_about": ("SYNTHETIC TEST DATA. Real responses from the rapid analysis service for household HH006 "
                       "(schema 1.1, ruleset 2025.2, model on). Full samples for all households are in docs/samples/."),
            "GET /health": client.get("/health").json(),
            "GET /api/households/HH006/overview": client.get("/api/households/HH006/overview").json(),
            "GET /api/households/HH006/findings/F1/evidence": client.get("/api/households/HH006/findings/F1/evidence").json(),
            "POST /api/households/HH006/ask {question: 'can taylor save more'}":
                client.post("/api/households/HH006/ask", json={"question": "can taylor save more"}).json(),
            "GET /api/households/HH006/documents/taylor_w2_2025.pdf/decision":
                client.get("/api/households/HH006/documents/taylor_w2_2025.pdf/decision").json(),
        }
    api_module.STORE.clear()
    OUT.write_text(json.dumps(example, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
