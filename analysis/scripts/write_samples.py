"""Write docs/samples/overview_HH0XX.json (and one evidence drill-down) from the fixtures.

Run with the model available so samples carry real checks:
  .venv/Scripts/python scripts/write_samples.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from rapid_analysis.engine import engine_info, engine_load  # noqa: E402
from rapid_analysis.fixtures import FIXTURE_IDS, fixture_household_documents, fixture_household_raw  # noqa: E402
from rapid_analysis.overview import overview_build  # noqa: E402

SAMPLES = ROOT / "docs" / "samples"


def sample_dumps(body: dict) -> str:
    return json.dumps(body, indent=2, ensure_ascii=False) + "\n"


def main() -> int:
    engine_load()
    if not engine_info()["model_loaded"]:
        print("model not loaded: samples would be all not_checked; refusing to write", file=sys.stderr)
        return 1
    SAMPLES.mkdir(parents=True, exist_ok=True)
    for household_id in FIXTURE_IDS:
        build = overview_build(fixture_household_raw(household_id), fixture_household_documents(household_id))
        (SAMPLES / f"overview_{household_id}.json").write_text(sample_dumps(build.overview), encoding="utf-8")
        if household_id == "HH004":
            (SAMPLES / "evidence_HH004_F1.json").write_text(sample_dumps(build.evidence["F1"]), encoding="utf-8")
    write_api_samples()
    print(f"wrote {len(FIXTURE_IDS)} overview samples to {SAMPLES}")
    return 0


ASK_SAMPLES = {
    "ask_HH006_taylor.json": ("HH006", "can taylor save more"),
    "ask_HH001_sarah.json": ("HH001", "can sarah make some savings"),
    "ask_HH001_out_of_scope.json": ("HH001", "book a meeting with sarah for tuesday"),
}


def write_api_samples() -> None:
    """Real API responses the frontend smoke test replays (enums, look-up list, Ask, evidence)."""
    from fastapi.testclient import TestClient

    from rapid_analysis import api as api_module

    api_module.STORE.clear()
    api_module.seed_fixtures()
    with TestClient(api_module.app) as client:
        (SAMPLES / "enums.json").write_text(sample_dumps(client.get("/api/meta/enums").json()), encoding="utf-8")
        (SAMPLES / "households.json").write_text(sample_dumps(client.get("/api/households").json()), encoding="utf-8")
        for name, (household_id, question) in ASK_SAMPLES.items():
            body = client.post(f"/api/households/{household_id}/ask", json={"question": question}).json()
            (SAMPLES / name).write_text(sample_dumps(body), encoding="utf-8")
        evidence = client.get("/api/households/HH006/findings/F1/evidence").json()
        (SAMPLES / "evidence_HH006_F1.json").write_text(sample_dumps(evidence), encoding="utf-8")
    api_module.STORE.clear()


if __name__ == "__main__":
    sys.exit(main())
