"""Write tests/fixtures/expected/: every fixture overview (golden files the tests compare against) plus one raw decision.

Run with the model available so samples carry real checks:
  python tests/tools/write_samples.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from rapid_analysis.engine import engine_info, engine_load  # noqa: E402
from tests.support.fixtures import (  # noqa: E402
    FIXTURE_IDS,
    fixture_household_documents,
    fixture_household_raw,
    fixture_textract,
)
from rapid_analysis.overview import overview_build  # noqa: E402

SAMPLES = ROOT / "tests" / "fixtures" / "expected"


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


def write_api_samples() -> None:
    """One real raw decision response, for the backend to build against."""
    from fastapi.testclient import TestClient

    from rapid_analysis import api as api_module

    with TestClient(api_module.app) as client:
        members = [{"first_name": m["name"].split()[0], "last_name": m["name"].split()[-1], "person_id": m["person_id"]}
                   for m in fixture_household_raw("HH006")["members"]]
        decision = {"document": {"name": "taylor_w2_2025.pdf", "textract": fixture_textract("taylor_w2_2025.pdf")}, "members": members}
        response = client.post("/v1/documents/decision", json=decision)
        if response.status_code != 200:
            raise SystemExit(f"raw decision sample: {response.status_code} {response.text}")
        (SAMPLES / "raw_decision_HH006_taylor_w2.json").write_text(sample_dumps(response.json()), encoding="utf-8")


if __name__ == "__main__":
    sys.exit(main())
